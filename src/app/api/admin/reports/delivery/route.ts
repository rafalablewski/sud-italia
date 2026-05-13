import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getOrders } from "@/lib/store";

/**
 * Delivery profitability report (m2_14). Per-day per-location margin for
 * delivery orders over a date window.
 *
 * Margin model (grosze):
 *   revenue        = totalAmount (items + delivery_fee + tip)
 *   stripeFee      ≈ 1.4% + 40 grosze (Stripe's PL card rate)
 *   foodCost       = sum(menuItem.cost × qty) — menu data
 *   driverPay      = 0 today; m2_14b adds courier hourly + per-order
 *                    when staff.hourly_rate × time-on-route lands
 *   marginGrosze   = revenue - stripeFee - foodCost - driverPay
 *
 * Drivers cost is the biggest unknown today. The report makes the
 * assumption explicit so operators see "margin if driver cost was zero"
 * as a ceiling.
 *
 * Manager+ only.
 */
function estimateStripeFeeGrosze(totalGrosze: number): number {
  // 1.4% + 40 grosze on PL cards; rounded up to be honest about
  // worst-case cost.
  return Math.ceil(totalGrosze * 0.014) + 40;
}

interface DayRollup {
  date: string;
  locationSlug: string;
  orderCount: number;
  revenueGrosze: number;
  deliveryFeeGrosze: number;
  tipGrosze: number;
  foodCostGrosze: number;
  stripeFeeGrosze: number;
  /** Margin if driver pay = 0. Real margin will be lower once m2_14b lands. */
  marginCeilingGrosze: number;
}

export const GET = withAdmin(
  { roles: ["manager", "owner"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");
    if (!from || !to) {
      return NextResponse.json({ error: "Missing from/to" }, { status: 400 });
    }
    const fromMs = new Date(from).getTime();
    const toMs = new Date(to).getTime();
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const orders = (await getOrders(locationSlug ?? undefined)).filter(
      (o) =>
        o.fulfillmentType === "delivery" &&
        o.status !== "pending" &&
        o.status !== "cancelled",
    );

    const byKey = new Map<string, DayRollup>();
    for (const o of orders) {
      const occurred = new Date(o.paidAt || o.createdAt).getTime();
      if (!Number.isFinite(occurred) || occurred < fromMs || occurred > toMs) continue;
      const date = o.slotDate || o.createdAt.slice(0, 10);
      const key = `${o.locationSlug}|${date}`;
      const row = byKey.get(key) ?? {
        date,
        locationSlug: o.locationSlug,
        orderCount: 0,
        revenueGrosze: 0,
        deliveryFeeGrosze: 0,
        tipGrosze: 0,
        foodCostGrosze: 0,
        stripeFeeGrosze: 0,
        marginCeilingGrosze: 0,
      };
      const foodCost = o.items.reduce(
        (acc, i) => acc + (i.menuItem.cost ?? 0) * i.quantity,
        0,
      );
      const stripeFee = estimateStripeFeeGrosze(o.totalAmount);
      row.orderCount += 1;
      row.revenueGrosze += o.totalAmount;
      row.deliveryFeeGrosze += o.deliveryFee ?? 0;
      row.tipGrosze += o.tipAmount ?? 0;
      row.foodCostGrosze += foodCost;
      row.stripeFeeGrosze += stripeFee;
      row.marginCeilingGrosze += o.totalAmount - foodCost - stripeFee;
      byKey.set(key, row);
    }

    const days = [...byKey.values()].sort((a, b) =>
      a.date === b.date
        ? a.locationSlug.localeCompare(b.locationSlug)
        : a.date.localeCompare(b.date),
    );
    const totals = days.reduce(
      (acc, d) => {
        acc.orderCount += d.orderCount;
        acc.revenueGrosze += d.revenueGrosze;
        acc.deliveryFeeGrosze += d.deliveryFeeGrosze;
        acc.tipGrosze += d.tipGrosze;
        acc.foodCostGrosze += d.foodCostGrosze;
        acc.stripeFeeGrosze += d.stripeFeeGrosze;
        acc.marginCeilingGrosze += d.marginCeilingGrosze;
        return acc;
      },
      {
        orderCount: 0,
        revenueGrosze: 0,
        deliveryFeeGrosze: 0,
        tipGrosze: 0,
        foodCostGrosze: 0,
        stripeFeeGrosze: 0,
        marginCeilingGrosze: 0,
      },
    );

    return NextResponse.json({
      from,
      to,
      location: locationSlug ?? null,
      days,
      totals,
      assumptions: {
        stripeRate: "1.4% + 40 grosze (PL cards)",
        driverPayGrosze: 0,
        note: "marginCeiling assumes driver pay = 0. Real margin lands when staff hourly rates + time-on-route are wired in m2_14b.",
      },
    });
  },
);
