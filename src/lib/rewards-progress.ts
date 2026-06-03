/**
 * Pure-logic helpers for the customer /rewards surface (CLAUDE.md Rule #1).
 *
 * These replace the hardcoded "2-week streak" and frozen "33%" challenge bars
 * that shipped on the V8 rewards rebuild with figures derived from the
 * customer's real order history. Kept dependency-free (types only) so they're
 * unit-testable without a DB and reusable from the API route.
 *
 * Week boundaries are Sunday-anchored to match `getActiveChallenges()` in
 * growth-engine.ts (which expires challenges at `now + (7 - getDay())`).
 */

/** Start of the local calendar week (Sunday 00:00) containing `d`. */
export function weekStart(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - s.getDay()); // getDay(): 0 = Sunday
  return s;
}

type OrderLike = {
  createdAt: string;
  items: { menuItem: { category: string }; quantity: number }[];
};

/**
 * Consecutive-week order streak. Counts the unbroken run of Sunday-anchored
 * weeks that each contain at least one order, anchored on the current week —
 * or, if the customer hasn't ordered yet this week, on last week, so a live
 * streak isn't shown as broken mid-week before this week's order lands.
 *
 * Steps week-by-week with Date arithmetic (not fixed millisecond math) so a
 * DST transition can't drop or double-count a week.
 */
export function computeWeekStreak(orderDates: string[], now: Date = new Date()): number {
  const weeks = new Set<number>();
  for (const ds of orderDates) {
    const d = new Date(ds);
    if (Number.isNaN(d.getTime())) continue;
    weeks.add(weekStart(d).getTime());
  }
  if (weeks.size === 0) return 0;

  const cursor = weekStart(now);
  if (!weeks.has(cursor.getTime())) {
    // Grace: no order this week yet — anchor on last week so an active
    // streak still reads as live until the week is actually missed.
    cursor.setDate(cursor.getDate() - 7);
  }
  if (!weeks.has(cursor.getTime())) return 0;

  let streak = 0;
  while (weeks.has(cursor.getTime())) {
    streak++;
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
}

export interface ChallengeProgress {
  /** ch-pasta-week — pasta-category units ordered this week. */
  pastaThisWeek: number;
  /** ch-triple-order — orders placed this week. */
  ordersThisWeek: number;
  /** ch-bring-friend — referrals that qualified this week. */
  referralsThisWeek: number;
}

export function computeChallengeProgress(
  orders: OrderLike[],
  qualifiedReferralsThisWeek: number,
  now: Date = new Date(),
): ChallengeProgress {
  const ws = weekStart(now).getTime();
  let pasta = 0;
  let ordersThisWeek = 0;
  for (const o of orders) {
    const d = new Date(o.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    if (weekStart(d).getTime() !== ws) continue;
    ordersThisWeek++;
    for (const it of o.items ?? []) {
      if (it.menuItem?.category === "pasta") pasta += it.quantity ?? 1;
    }
  }
  return {
    pastaThisWeek: pasta,
    ordersThisWeek,
    referralsThisWeek: Math.max(0, qualifiedReferralsThisWeek),
  };
}

/**
 * Maps progress onto the challenge ids returned by `getActiveChallenges()` so
 * the page can look up `current` by `challenge.id` without re-deriving it.
 */
export function challengeProgressMap(p: ChallengeProgress): Record<string, number> {
  return {
    "ch-pasta-week": p.pastaThisWeek,
    "ch-bring-friend": p.referralsThisWeek,
    "ch-triple-order": p.ordersThisWeek,
  };
}
