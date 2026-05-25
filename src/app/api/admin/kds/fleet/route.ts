import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getKdsServiceHistory, getLaborCostInRange, getOrders } from "@/lib/store";
import { getActiveLocationsAsync } from "@/lib/locations-store";
import { MENU_CATEGORY_LABELS } from "@/data/types";
import type { MenuCategory, Order } from "@/data/types";
import {
  analyzeTruck,
  computeHealth,
  PACE_WINDOW_MIN,
  PROMISE_TARGET,
  type PaceTier,
} from "@/lib/kds-prediction";

/**
 * Owner fleet command — the Atlas board's data feed. Live KDS health across
 * every active truck, plus the predicted-ready engine and the capacity-vs-
 * demand Pace layer, all from real data:
 *
 *   - active tickets + counts read the same real orders the KDS boards do
 *     (getOrders strips simulated demo tickets by default — fleet stays real),
 *   - predicted-ready + at-risk come from analyzeTruck (prep times + live queue),
 *   - covers/hr, revenue/hr, throughput from real completed orders,
 *   - promise-accuracy + the throughput sparkline from the kds_tickets ledger
 *     (getKdsServiceHistory),
 *   - on-shift from real open time-punches (getLaborCostInRange).
 *
 * Owner-only and inherently cross-location, so no locationParam.
 */

const ACTIVE = new Set(["confirmed", "preparing", "ready"]);

function shortId(id: string): string {
  return id.slice(-6).replace(/^[^a-z0-9]+/i, "").toUpperCase();
}

function ticketItems(o: Order) {
  return o.items.map((ci) => ({
    name: ci.menuItem.name,
    quantity: ci.quantity,
    category: ci.menuItem.category as MenuCategory,
    categoryLabel: MENU_CATEGORY_LABELS[ci.menuItem.category] ?? ci.menuItem.category,
    notes: ci.notes,
    allergens: ci.menuItem.allergens ?? [],
  }));
}

export const GET = withAdmin({ roles: ["owner"] }, async () => {
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const fromIso = todayStart.toISOString();
  const toIso = new Date(now).toISOString();
  const hourAgoIso = new Date(now - 60 * 60 * 1000).toISOString();
  const dayEnd = new Date();
  dayEnd.setHours(23, 59, 59, 999);

  const locations = await getActiveLocationsAsync();

  const tiles = await Promise.all(
    locations.map(async (loc) => {
      const orders = await getOrders(loc.slug, fromIso);
      const active = orders.filter((o) => ACTIVE.has(o.status));

      const analysis = analyzeTruck(active, now);

      // Real rate metrics from completed orders in the last hour (matches the
      // floor-ops throughput approximation: completed, created within the hour).
      const recentCompleted = orders.filter(
        (o) => o.status === "completed" && Date.parse(o.createdAt) >= Date.parse(hourAgoIso),
      );
      const throughputHr = recentCompleted.length;
      const coversHr = recentCompleted.reduce((s, o) => s + (o.partySize ?? 1), 0);
      const revenueHr = recentCompleted.reduce((s, o) => s + (o.totalAmount ?? 0), 0);

      const completedToday = orders.filter((o) => o.status === "completed");
      const revenueToday = completedToday.reduce((s, o) => s + (o.totalAmount ?? 0), 0);

      const history = await getKdsServiceHistory(loc.slug, fromIso, toIso);
      const { openShifts } = await getLaborCostInRange(loc.slug, fromIso, dayEnd.toISOString());

      const promiseAccuracy = history.promiseAccuracy ?? PROMISE_TARGET;
      const { health, state, cls } = computeHealth({
        late: analysis.counts.late,
        risk: analysis.counts.risk,
        promiseAcc: promiseAccuracy,
      });

      const tickets = active.map((o) => {
        const p = analysis.predictions.get(o.id);
        return {
          id: o.id,
          shortId: shortId(o.id),
          customerName: o.customerName || "Guest",
          fulfillmentType: o.fulfillmentType,
          partySize: o.partySize,
          status: o.status,
          slotTime: o.slotTime,
          specialInstructions: o.specialInstructions,
          itemCount: o.items.reduce((n, ci) => n + ci.quantity, 0),
          items: ticketItems(o),
          paidAtMs: Date.parse(o.paidAt ?? o.createdAt) || now,
          promisedReadyAtMs: p?.promisedReadyAtMs ?? null,
          predictedReadyAtMs: p?.predictedReadyAtMs ?? now,
          predSeconds: p?.predSeconds ?? 0,
          atRisk: p?.atRisk ?? false,
        };
      });

      const stations = analysis.stations.map((s) => ({
        id: s.id,
        label: MENU_CATEGORY_LABELS[s.id] ?? s.id,
        currentLoad: s.currentLoad,
        forecast: s.forecast,
        demand: s.demand,
        capacity: Math.round(s.capacity * 10) / 10,
        pct: Number.isFinite(s.util) ? Math.round(s.util * 100) : 999,
        tier: s.tier as PaceTier,
      }));

      const bottleneck = analysis.bottleneck
        ? {
            id: analysis.bottleneck.id,
            label: MENU_CATEGORY_LABELS[analysis.bottleneck.id] ?? analysis.bottleneck.id,
            pct: Number.isFinite(analysis.bottleneck.util)
              ? Math.round(analysis.bottleneck.util * 100)
              : 999,
            tier: analysis.bottleneck.tier as PaceTier,
          }
        : null;

      return {
        slug: loc.slug,
        name: loc.name,
        counts: analysis.counts,
        health,
        healthState: state,
        healthClass: cls,
        onShift: openShifts,
        throughputHr,
        coversHr,
        revenueHr,
        completedToday: completedToday.length,
        revenueToday,
        promiseAccuracy,
        throughputSeries: history.throughputSeries,
        stations,
        bottleneck,
        tickets,
      };
    }),
  );

  // Fleet totals
  const totals = {
    active: tiles.reduce((s, t) => s + t.counts.active, 0),
    late: tiles.reduce((s, t) => s + t.counts.late, 0),
    risk: tiles.reduce((s, t) => s + t.counts.risk, 0),
    ready: tiles.reduce((s, t) => s + t.counts.ready, 0),
    throughputHr: tiles.reduce((s, t) => s + t.throughputHr, 0),
    coversHr: tiles.reduce((s, t) => s + t.coversHr, 0),
    revenueHr: tiles.reduce((s, t) => s + t.revenueHr, 0),
  };

  // Cross-truck promise-accuracy benchmark (throughput-weighted fleet mean).
  const weightDenom = tiles.reduce((s, t) => s + Math.max(1, t.throughputHr), 0);
  const fleetAccuracy =
    tiles.length > 0
      ? Math.round(
          tiles.reduce((s, t) => s + t.promiseAccuracy * Math.max(1, t.throughputHr), 0) / weightDenom,
        )
      : PROMISE_TARGET;
  const sortedByAcc = [...tiles].sort((a, b) => b.promiseAccuracy - a.promiseAccuracy);
  const leader = sortedByAcc[0]?.name ?? null;
  const lagger = sortedByAcc[sortedByAcc.length - 1]?.name ?? null;
  const gap =
    sortedByAcc.length > 1
      ? sortedByAcc[0].promiseAccuracy - sortedByAcc[sortedByAcc.length - 1].promiseAccuracy
      : 0;

  return NextResponse.json({
    generatedAt: toIso,
    paceWindowMin: PACE_WINDOW_MIN,
    promiseTarget: PROMISE_TARGET,
    totals,
    benchmark: { fleetAccuracy, leader, lagger, gap },
    tiles,
  });
});
