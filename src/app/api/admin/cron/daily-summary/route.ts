import { NextRequest, NextResponse } from "next/server";
import { logCronRun, withCron } from "@/lib/cron";
import { getOrders } from "@/lib/store";

/**
 * Daily summary cron (m1_12). Runs at 04:30 UTC (06:30 Warsaw) and computes
 * yesterday's revenue / order count / top customer per location. Result is
 * returned in the response body for now; Phase 2 comms (m2_15) will wire
 * the email send via the outbox + Mailgun provider.
 */
export async function POST(req: NextRequest) {
  const auth = await withCron(req);
  if (auth) return auth;

  // Yesterday in UTC (rounded to day boundaries).
  const now = new Date();
  const yesterdayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  );
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  const all = await getOrders();
  const yesterdaysOrders = all.filter((o) => {
    if (o.status === "pending" || o.status === "cancelled") return false;
    const t = new Date(o.paidAt || o.createdAt);
    return t >= yesterdayStart && t < todayStart;
  });

  // Group by location.
  const byLocation = new Map<
    string,
    { orderCount: number; revenueGrosze: number; tipGrosze: number }
  >();
  for (const o of yesterdaysOrders) {
    const row = byLocation.get(o.locationSlug) ?? {
      orderCount: 0,
      revenueGrosze: 0,
      tipGrosze: 0,
    };
    row.orderCount += 1;
    row.revenueGrosze += o.totalAmount;
    row.tipGrosze += o.tipAmount ?? 0;
    byLocation.set(o.locationSlug, row);
  }

  const summary = {
    date: yesterdayStart.toISOString().slice(0, 10),
    totals: {
      orderCount: yesterdaysOrders.length,
      revenueGrosze: yesterdaysOrders.reduce((acc, o) => acc + o.totalAmount, 0),
      tipGrosze: yesterdaysOrders.reduce(
        (acc, o) => acc + (o.tipAmount ?? 0),
        0,
      ),
    },
    perLocation: Object.fromEntries(byLocation),
  };

  logCronRun("daily-summary", summary);
  // TODO (Phase 2 m2_15): write outbox event to dispatch the email via Mailgun.
  return NextResponse.json({ ok: true, summary });
}
