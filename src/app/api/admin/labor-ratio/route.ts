import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
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
export const GET = withAdmin(
  { locationParam: "location" },
  async (_req, _ctx, { locationSlug: scoped }) => {
    const locationSlug = scoped ?? undefined;

    const now = new Date();
    const yyyyMmDd = now.toISOString().slice(0, 10);
    const dayStart = new Date(`${yyyyMmDd}T00:00:00.000Z`);
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

    const ratio = revenueGrosze > 0 ? laborGrosze / revenueGrosze : null;

    return NextResponse.json({
      date: yyyyMmDd,
      revenueGrosze,
      laborGrosze,
      ratio,
      openShifts,
      orderCount,
    });
  },
);
