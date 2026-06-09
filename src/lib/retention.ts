import { normalizePlPhoneE164 } from "./phone";
import { buildCustomerIntelligence, type ChurnRisk, type IntelOrder } from "./customer-intelligence";

/**
 * Retention / Win-back engine — Phase 2 of the Customer Identity Network
 * (docs/strategy/restaurant-os-blueprint.md): turn the keystone's *predictions*
 * into a *decision*. It runs the Customer Intelligence engine across every
 * guest, finds the ones whose churn hazard says they're slipping, ranks them by
 * **value-at-risk** (hazard × lifetime spend) so attention/incentive goes where
 * the money is, and prescribes the whole action — incentive size, the consented
 * channel, and a drafted message built from the guest's own behaviour.
 *
 * Pure compute over real orders + consent; no I/O, fully unit-testable. The API
 * route feeds it live data and executes the chosen action (grant points + log
 * the outreach). Never hardcode the queue.
 */

export type OutreachChannel = "sms" | "email";

/** Per-guest consent + reachability, sourced from the customers rollup. */
export interface RetentionConsent {
  name?: string | null;
  email?: string | null;
  smsOptout?: boolean;
  emailOptout?: boolean;
}

export interface WinBackCandidate {
  phone: string;
  name: string;
  risk: ChurnRisk; // only "high" | "lost" reach the queue
  hazard: number;
  daysSinceLast: number;
  orderCount: number;
  lifetimeSpendGrosze: number;
  /** hazard × lifetime spend — the ranking key. */
  valueAtRiskGrosze: number;
  topDish: string | null;
  cadenceDays: number | null;
  /** Recommended consented channel; null = no consented channel (needs consent). */
  channel: OutreachChannel | null;
  /** Prescribed incentive (loyalty points), scaled by lifetime value. */
  bonusPoints: number;
  /** Drafted outreach message, built from the guest's own behaviour. */
  message: string;
  reason: string;
  /** Last time we ran a win-back for this guest (cooldown transparency). */
  lastContactedAt: string | null;
}

export interface WinBackQueue {
  generatedAt: string;
  candidates: WinBackCandidate[];
  summary: {
    count: number;
    totalValueAtRiskGrosze: number;
    /** Have a consented channel we can reach them on. */
    reachable: number;
    /** At risk but no consented channel — incentive only / needs consent. */
    needsConsent: number;
  };
}

export interface WinBackInput {
  orders: IntelOrder[];
  /** Keyed by any phone format; canonicalised internally. */
  consentByPhone: Map<string, RetentionConsent>;
  /** Last outreach ISO per phone, for the cooldown. */
  lastContactedByPhone?: Map<string, string>;
  now?: Date;
  /** Skip guests contacted within this many days (default 30). */
  cooldownDays?: number;
  /** Floor on lifetime spend (grosze) to enter the queue (default 0). */
  minLifetimeSpendGrosze?: number;
  maxCandidates?: number;
}

const DAY = 86_400_000;

function canon(phone: string): string {
  return normalizePlPhoneE164(phone) || phone.trim();
}

/** Incentive ladder — bigger for guests who've spent more (capped). */
export function recommendBonusPoints(lifetimeSpendGrosze: number): number {
  if (lifetimeSpendGrosze >= 30_000) return 120;
  if (lifetimeSpendGrosze >= 15_000) return 80;
  if (lifetimeSpendGrosze >= 6_000) return 50;
  return 30;
}

function draftMessage(name: string | null | undefined, topDish: string | null, bonus: number): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  const hi = first ? `Hi ${first}` : "Hi there";
  const dish = topDish ? `Your usual ${topDish} is waiting — ` : "";
  return `${hi}! We miss you at Ottaviano. ${dish}enjoy ${bonus} bonus points on us when you come back this week. 🍕`;
}

export function buildWinBackQueue(input: WinBackInput): WinBackQueue {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const cooldownDays = input.cooldownDays ?? 30;
  const minSpend = input.minLifetimeSpendGrosze ?? 0;
  const maxCandidates = input.maxCandidates ?? 50;

  // Bucket orders by canonical phone (and normalise each order's phone so the
  // intelligence engine's exact-match filter lines up).
  const byPhone = new Map<string, IntelOrder[]>();
  for (const o of input.orders) {
    const c = canon(o.customerPhone);
    const list = byPhone.get(c) ?? [];
    list.push(c === o.customerPhone ? o : { ...o, customerPhone: c });
    byPhone.set(c, list);
  }

  // Canonicalise the consent + cooldown maps once.
  const consent = new Map<string, RetentionConsent>();
  for (const [k, v] of input.consentByPhone) consent.set(canon(k), v);
  const contacted = new Map<string, string>();
  if (input.lastContactedByPhone) {
    for (const [k, v] of input.lastContactedByPhone) {
      const c = canon(k);
      const prev = contacted.get(c);
      if (!prev || v > prev) contacted.set(c, v);
    }
  }

  const candidates: WinBackCandidate[] = [];
  for (const [phone, orders] of byPhone) {
    const ci = buildCustomerIntelligence(phone, orders, { now });
    if (ci.orderCount === 0) continue;
    if (ci.churn.risk !== "high" && ci.churn.risk !== "lost") continue;

    const lifetimeSpendGrosze = ci.avgOrderValueGrosze * ci.orderCount;
    if (lifetimeSpendGrosze < minSpend) continue;

    // Cooldown: don't re-nag someone we just reached out to.
    const lastContactedAt = contacted.get(phone) ?? null;
    if (lastContactedAt) {
      const ageDays = (nowMs - new Date(lastContactedAt).getTime()) / DAY;
      if (ageDays >= 0 && ageDays < cooldownDays) continue;
    }

    const c = consent.get(phone) ?? {};
    const smsOk = !c.smsOptout; // phone is always present
    const emailOk = !!(c.email && c.email.trim()) && !c.emailOptout;
    const channel: OutreachChannel | null = smsOk ? "sms" : emailOk ? "email" : null;

    const bonusPoints = recommendBonusPoints(lifetimeSpendGrosze);
    const name = (c.name ?? "").trim() || ci.phone;
    const topDish = ci.topItems[0]?.name ?? null;

    candidates.push({
      phone,
      name,
      risk: ci.churn.risk,
      hazard: ci.churn.hazard,
      daysSinceLast: Math.round(ci.cadence.daysSinceLast ?? 0),
      orderCount: ci.orderCount,
      lifetimeSpendGrosze,
      valueAtRiskGrosze: Math.round(ci.churn.hazard * lifetimeSpendGrosze),
      topDish,
      cadenceDays: ci.cadence.medianIntervalDays != null ? Math.round(ci.cadence.medianIntervalDays) : null,
      channel,
      bonusPoints,
      message: draftMessage(c.name, topDish, bonusPoints),
      reason: ci.churn.reason,
      lastContactedAt,
    });
  }

  candidates.sort((a, b) => b.valueAtRiskGrosze - a.valueAtRiskGrosze);
  const top = candidates.slice(0, maxCandidates);

  return {
    generatedAt: now.toISOString(),
    candidates: top,
    summary: {
      count: top.length,
      totalValueAtRiskGrosze: top.reduce((s, c) => s + c.valueAtRiskGrosze, 0),
      reachable: top.filter((c) => c.channel !== null).length,
      needsConsent: top.filter((c) => c.channel === null).length,
    },
  };
}
