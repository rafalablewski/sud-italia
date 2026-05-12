import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { getOrders } from "@/lib/store";

/**
 * Tip totals per day (and per location when supplied), excluding pending and
 * cancelled orders. Drives the Reports → Tips tab and is shaped to be easy
 * for a future cron to consume (e.g. nightly summary email).
 */
export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const locationSlug = req.nextUrl.searchParams.get("location") || undefined;
  const fromIso = req.nextUrl.searchParams.get("from");
  const toIso = req.nextUrl.searchParams.get("to");

  const orders = (await getOrders(locationSlug)).filter(
    (o) => o.status !== "pending" && o.status !== "cancelled" && (o.tipAmount ?? 0) > 0,
  );

  const fromMs = fromIso ? new Date(fromIso).getTime() : -Infinity;
  const toMs = toIso ? new Date(toIso).getTime() : Infinity;

  const byDate = new Map<
    string,
    { date: string; tippedOrders: number; tipGrosze: number; revenueGrosze: number }
  >();

  for (const o of orders) {
    const occurred = new Date(o.paidAt || o.createdAt).getTime();
    if (!Number.isFinite(occurred) || occurred < fromMs || occurred > toMs) continue;
    const date = o.slotDate || o.createdAt.slice(0, 10);
    const row = byDate.get(date) || {
      date,
      tippedOrders: 0,
      tipGrosze: 0,
      revenueGrosze: 0,
    };
    row.tippedOrders++;
    row.tipGrosze += o.tipAmount ?? 0;
    row.revenueGrosze += o.totalAmount;
    byDate.set(date, row);
  }

  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const totalTipGrosze = days.reduce((acc, d) => acc + d.tipGrosze, 0);
  const totalTippedOrders = days.reduce((acc, d) => acc + d.tippedOrders, 0);
  const totalRevenueGrosze = days.reduce((acc, d) => acc + d.revenueGrosze, 0);
  const averageTipRate =
    totalRevenueGrosze > 0 ? totalTipGrosze / totalRevenueGrosze : 0;
  const averageTipPerOrder =
    totalTippedOrders > 0 ? Math.round(totalTipGrosze / totalTippedOrders) : 0;

  return NextResponse.json({
    days,
    totals: {
      totalTipGrosze,
      totalTippedOrders,
      totalRevenueGrosze,
      averageTipRate,
      averageTipPerOrder,
    },
  });
}
