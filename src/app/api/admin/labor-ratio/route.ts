import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { getLaborCostInRange, getOrders } from "@/lib/store";

/**
 * Live labour-cost-to-revenue ratio for the current day. Powers the dashboard
 * tile that tells the manager when to send people home: at QSR scale a
 * sustainable labour ratio sits around 22–28%; > 35% is a warning, > 45% is
 * actionable on its own.
 *
 * Revenue counts non-pending orders dated today (matches the analytics
 * convention used elsewhere). Labour is computed by pairing time punches and
 * extending open shifts to "now", so a shift in progress already counts.
 */
export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const locationSlug = req.nextUrl.searchParams.get("location") || undefined;

  const now = new Date();
  const yyyyMmDd = now.toISOString().slice(0, 10);
  const dayStart = new Date(`${yyyyMmDd}T00:00:00.000Z`);
  // End-of-day in UTC keeps the range bounded; the caller can refresh as the
  // tile re-renders, so we don't need a rolling 24 h window.
  const dayEnd = new Date(`${yyyyMmDd}T23:59:59.999Z`);

  const orders = (await getOrders(locationSlug)).filter(
    (o) => o.status !== "pending",
  );
  let revenueGrosze = 0;
  let orderCount = 0;
  for (const o of orders) {
    const day = o.slotDate || o.createdAt.slice(0, 10);
    if (day !== yyyyMmDd) continue;
    revenueGrosze += o.totalAmount;
    orderCount++;
  }

  const { laborGrosze, openShifts } = await getLaborCostInRange(
    locationSlug,
    dayStart.toISOString(),
    dayEnd.toISOString(),
    now,
  );

  // Ratio is labour / revenue. When revenue is zero (no orders yet today) the
  // tile shows "—" rather than infinity; the caller decides how to render.
  const ratio = revenueGrosze > 0 ? laborGrosze / revenueGrosze : null;

  return NextResponse.json({
    date: yyyyMmDd,
    revenueGrosze,
    laborGrosze,
    ratio,
    openShifts,
    orderCount,
  });
}
