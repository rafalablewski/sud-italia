import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getLaborCostInRange, getOrders } from "@/lib/store";
import { getMenuWithOverrides } from "@/data/menus";
import { getActiveLocationsAsync } from "@/lib/locations-store";
import { analyzeTruck } from "@/lib/kds-prediction";

/**
 * Manager floor-control header data — the live signals that aren't already
 * in the KDS order stream: throughput (orders completed in the last hour),
 * staff currently on the clock, and the location's menu with availability
 * so the manager can see + manage the live 86 list.
 *
 * Open / late / oldest-age are computed client-side from the active orders
 * the board already streams, so they're not duplicated here.
 *
 * Manager+ with per-location scope enforced by withAdmin. Real orders only —
 * simulated demo tickets are filtered out by getOrders(), so throughput
 * reflects true service, matching the board.
 */
export const GET = withAdmin(
  { roles: ["manager"], locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    const now = Date.now();
    const hourAgoIso = new Date(now - 60 * 60 * 1000).toISOString();
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date();
    dayEnd.setHours(23, 59, 59, 999);

    const recent = await getOrders(locationSlug ?? undefined, hourAgoIso);
    const recentCompleted = recent.filter((o) => o.status === "completed");
    const throughputLastHour = recentCompleted.length;
    // Covers + revenue per hour, from real completed orders in the window
    // (matches the fleet feed's rate metrics — Rule #1). Frosts the Floor strip.
    const coversHr = recentCompleted.reduce((s, o) => s + (o.partySize ?? 1), 0);
    const revenueHr = recentCompleted.reduce((s, o) => s + (o.totalAmount ?? 0), 0);

    // Per-station load for the KDS station strip (mockup): the same predictive
    // engine the pace/at-risk colours come from. Real active orders (Rule #1) —
    // `getOrders` already strips simulated demo tickets.
    const activeOrders = await getOrders(locationSlug ?? undefined);
    const analysis = analyzeTruck(activeOrders, now);
    const stations = analysis.stations
      .filter((s) => s.demand > 0)
      .map((s) => ({ id: s.id, util: Math.round(Math.min(1.5, s.util) * 100), tier: s.tier, demand: s.demand }));

    const { openShifts } = await getLaborCostInRange(
      locationSlug ?? undefined,
      dayStart.toISOString(),
      dayEnd.toISOString(),
    );

    // Menu + availability is per-location (override ids are location-prefixed).
    // Default to the first active truck when the operator is viewing "all".
    const menuSlug = locationSlug ?? (await getActiveLocationsAsync())[0]?.slug;
    const menu = menuSlug
      ? (await getMenuWithOverrides(menuSlug)).map((m) => ({
          id: m.id,
          name: m.name,
          category: m.category,
          available: m.available !== false,
        }))
      : [];

    return NextResponse.json({
      locationSlug: locationSlug ?? "",
      menuSlug: menuSlug ?? "",
      throughputLastHour,
      coversHr,
      revenueHr,
      onShift: openShifts,
      stations,
      menu,
    });
  },
);
