import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getOrders } from "@/lib/store";

/**
 * ★ Popular / Smart — the top menu-item ids by real order frequency for the
 * CURRENT daypart, so the till's first category is the 8-ish SKUs that are the
 * bulk of taps right now (lunch surfaces lunch sellers, not last night's).
 * Real orders only (Rule #1, no mock): recent, non-simulated, this location.
 *
 * GET ?location= → { daypart, popular: string[] } (most-ordered first).
 */
function daypartOf(hour: number): "morning" | "lunch" | "afternoon" | "dinner" | "late" {
  if (hour < 11) return "morning";
  if (hour < 15) return "lunch";
  if (hour < 18) return "afternoon";
  if (hour < 22) return "dinner";
  return "late";
}

export const GET = withAdmin({ locationParam: "location" }, async (_req, _ctx, { locationSlug }) => {
  const orders = await getOrders(locationSlug ?? undefined);
  const dp = daypartOf(new Date().getHours());
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000; // last 30 days
  // Tally by real order frequency, preferring the current daypart but keeping
  // an all-recent tally so a quiet daypart still yields a useful Popular row.
  const qtyDaypart = new Map<string, number>();
  const qtyAll = new Map<string, number>();
  for (const o of orders) {
    if (o.simulated) continue;
    const t = Date.parse(o.paidAt ?? o.createdAt);
    if (!Number.isFinite(t) || t < cutoff) continue;
    const sameDaypart = daypartOf(new Date(t).getHours()) === dp;
    for (const it of o.items) {
      const id = it.menuItem?.id;
      if (!id) continue;
      qtyAll.set(id, (qtyAll.get(id) ?? 0) + it.quantity);
      if (sameDaypart) qtyDaypart.set(id, (qtyDaypart.get(id) ?? 0) + it.quantity);
    }
  }
  const pick = qtyDaypart.size >= 4 ? qtyDaypart : qtyAll;
  const popular = [...pick.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id]) => id);
  return NextResponse.json({ daypart: dp, scoped: pick === qtyDaypart, popular });
});
