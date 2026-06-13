import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getOrders } from "@/lib/store";
import { getMenuWithOverrides } from "@/data/menus";
import { getActiveLocationsAsync } from "@/lib/locations-store";
import { MENU_CATEGORY_LABELS } from "@/data/types";
import { analyzeTruck, PACE_WINDOW_MIN, type PaceTier } from "@/lib/kds-prediction";
import { deriveSteeringPlan } from "@/lib/pace-steering";

/**
 * Pace → POS demand-steering feed. The actuator end of the kitchen control
 * loop: it runs the SAME analyzeTruck() the KDS boards use over this truck's
 * live orders, then deriveSteeringPlan() turns the Pace signal into what the
 * POS should do at the point of order — capacity-true promise times, make-now
 * surfacing, soft-throttle of low-yield bottleneck items, and a delivery
 * intake cap. One model, two consumers (KDS gauge + POS menu), no second
 * source of truth.
 *
 * Staff+ with per-location scope enforced by withAdmin (the till sits at one
 * truck). Real orders only — getOrders() strips simulated KDS demo tickets, so
 * test data never steers the real sell side.
 */

const ACTIVE = new Set(["confirmed", "preparing", "ready"]);

export const GET = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // A POS terminal is bound to one till — default to the first active truck
    // when the caller didn't pin a location (matches the floor-ops fallback).
    const slug = locationSlug ?? (await getActiveLocationsAsync())[0]?.slug;
    if (!slug) {
      return NextResponse.json({ error: "No active location" }, { status: 400 });
    }

    const orders = await getOrders(slug, todayStart.toISOString());
    const active = orders.filter((o) => ACTIVE.has(o.status));
    const analysis = analyzeTruck(active, now);

    const menu = await getMenuWithOverrides(slug);
    const plan = deriveSteeringPlan(analysis, menu);

    const stations = analysis.stations.map((s) => ({
      id: s.id,
      label: MENU_CATEGORY_LABELS[s.id] ?? s.id,
      demand: s.demand,
      capacity: Math.round(s.capacity * 10) / 10,
      pct: Number.isFinite(s.util) ? Math.round(s.util * 100) : 999,
      tier: s.tier as PaceTier,
      promiseSeconds: plan.promiseSecondsByCategory[s.id] ?? 0,
    }));

    return NextResponse.json({
      generatedAt: new Date(now).toISOString(),
      location: slug,
      paceWindowMin: PACE_WINDOW_MIN,
      counts: analysis.counts,
      bottleneck: plan.bottleneck,
      stations,
      plan,
    });
  },
);
