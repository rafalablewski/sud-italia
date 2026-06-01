import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getDemandSignals, getOrders, getSlots } from "@/lib/store";
import { buildDemandBoard, demonstratedCoversPerHour } from "@/lib/demand-exchange";

/**
 * Demand Exchange — the per-slot demand board (Module 2 keystone; see
 * docs/strategy/restaurant-os-blueprint.md §3). Forecasts covers per slot from
 * real same-weekday history, compares against the demonstrated kitchen ceiling,
 * folds in logged rejected-demand, and prescribes the yield action. All derived
 * from live data; no mock demand.
 *
 * GET /api/admin/demand-exchange?location=&date=YYYY-MM-DD  (manager+)
 */
export const GET = withAdmin(
  { roles: ["manager"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    if (!locationSlug) {
      return NextResponse.json({ error: "location is required" }, { status: 400 });
    }
    const url = new URL(req.url);
    const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);

    const [slots, allOrders, signals] = await Promise.all([
      getSlots(locationSlug, date),
      getOrders(),
      getDemandSignals(locationSlug, date),
    ]);

    const locOrders = allOrders.filter((o) => o.locationSlug === locationSlug);

    // Demonstrated kitchen ceiling: realized covers/hour over the last 90 days.
    const cutoff = Date.now() - 90 * 86_400_000;
    const instants = locOrders
      .filter((o) => o.status !== "pending" && o.status !== "cancelled" && !o.simulated)
      .map((o) => new Date(o.paidAt ?? o.createdAt).getTime())
      .filter((ms) => ms >= cutoff);
    const kitchenCoversPerHour = demonstratedCoversPerHour(instants);

    const board = buildDemandBoard({
      date,
      slots: slots.map((s) => ({
        id: s.id,
        date: s.date,
        time: s.time,
        maxOrders: s.maxOrders,
        currentOrders: s.currentOrders,
        fulfillmentTypes: s.fulfillmentTypes,
        status: s.status,
      })),
      orders: locOrders.map((o) => ({
        slotDate: o.slotDate,
        slotTime: o.slotTime,
        status: o.status,
        simulated: o.simulated,
      })),
      signals: signals.map((s) => ({ date: s.date, time: s.time })),
      kitchenCoversPerHour,
    });

    return NextResponse.json({ board });
  },
);
