import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getOrders } from "@/lib/store";
import { analyzeTruck } from "@/lib/kds-prediction";

/**
 * Live kitchen pressure for the Command Bar's PressureBadge — the one place
 * global load lives, visible on every lens. Real orders through the shared
 * predictive engine (Rule #1): the same tier / at-risk the KDS colours from.
 *
 * GET ?location= → { tier, onLine, atRisk, oldestSec }
 */
export const GET = withAdmin({ locationParam: "location" }, async (_req, _ctx, { locationSlug }) => {
  const orders = (await getOrders(locationSlug ?? undefined)).filter((o) => !o.simulated);
  const now = Date.now();
  const a = analyzeTruck(orders, now);
  let oldestSec = 0;
  for (const o of orders) {
    if (o.status !== "confirmed" && o.status !== "preparing") continue;
    const t = Date.parse(o.paidAt ?? o.createdAt);
    if (Number.isFinite(t)) oldestSec = Math.max(oldestSec, Math.round((now - t) / 1000));
  }
  return NextResponse.json({
    tier: a.bottleneck?.tier ?? "calm",
    onLine: a.counts.active,
    atRisk: a.counts.risk + a.counts.late,
    oldestSec,
  });
});
