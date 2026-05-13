import { NextRequest, NextResponse } from "next/server";
import { logCronRun, withCron } from "@/lib/cron";
import {
  getFranchisees,
  getLocationsForFranchisee,
  getOrders,
  saveRoyaltyStatement,
} from "@/lib/store";

/**
 * Weekly royalty statements cron (m3_5). Runs Mondays 02:00 UTC for the
 * prior 7-day window. Computes per-franchisee revenue × royalty_rate +
 * marketing_fund and upserts a row in royalty_statements.
 *
 * Idempotent on (franchisee_id, period_end) so re-running for the same
 * week replaces the row. Operators can also POST manually to regenerate
 * a statement after a back-dated correction.
 */
export async function POST(req: NextRequest) {
  const auth = await withCron(req);
  if (auth) return auth;

  const now = new Date();
  const periodEnd = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ));
  const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

  const franchisees = await getFranchisees();
  const results: { franchiseeId: string; orderCount: number; revenueGrosze: number; royaltyGrosze: number; marketingFundGrosze: number }[] = [];

  for (const franchisee of franchisees) {
    if (franchisee.status !== "active") continue;
    const locationSlugs = await getLocationsForFranchisee(franchisee.id);
    if (locationSlugs.length === 0) continue;

    const allOrders = await getOrders();
    const periodOrders = allOrders.filter((o) => {
      if (!locationSlugs.includes(o.locationSlug)) return false;
      if (o.status === "pending" || o.status === "cancelled") return false;
      const t = new Date(o.paidAt || o.createdAt).getTime();
      return t >= periodStart.getTime() && t < periodEnd.getTime();
    });

    const revenueGrosze = periodOrders.reduce((acc, o) => acc + o.totalAmount, 0);
    // bps math: 800 bps = 8%, so multiplier = bps / 10000. Round down so
    // franchisee never owes a fractional grosz.
    const royaltyGrosze = Math.floor((revenueGrosze * franchisee.royaltyRateBps) / 10000);
    const marketingFundGrosze = Math.floor((revenueGrosze * franchisee.marketingFundBps) / 10000);

    await saveRoyaltyStatement({
      franchiseeId: franchisee.id,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      revenueGrosze,
      royaltyGrosze,
      marketingFundGrosze,
      orderCount: periodOrders.length,
    });

    results.push({
      franchiseeId: franchisee.id,
      orderCount: periodOrders.length,
      revenueGrosze,
      royaltyGrosze,
      marketingFundGrosze,
    });
  }

  logCronRun("royalty-weekly", {
    period: { start: periodStart.toISOString(), end: periodEnd.toISOString() },
    franchiseeCount: results.length,
    totals: results.reduce(
      (acc, r) => ({
        revenueGrosze: acc.revenueGrosze + r.revenueGrosze,
        royaltyGrosze: acc.royaltyGrosze + r.royaltyGrosze,
        marketingFundGrosze: acc.marketingFundGrosze + r.marketingFundGrosze,
      }),
      { revenueGrosze: 0, royaltyGrosze: 0, marketingFundGrosze: 0 },
    ),
  });

  return NextResponse.json({ ok: true, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString(), results });
}
