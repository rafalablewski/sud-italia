import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, scopeAllows } from "@/lib/api/v1/guard";
import { getOrders } from "@/lib/store";
import { getMenuWithOverrides } from "@/data/menus";
import { getActiveLocationsAsync } from "@/lib/locations-store";
import { MENU_CATEGORY_LABELS } from "@/data/types";
import { analyzeTruck, PACE_WINDOW_MIN, type PaceTier } from "@/lib/kds-prediction";
import { deriveSteeringPlan } from "@/lib/pace-steering";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const ACTIVE = new Set(["confirmed", "preparing", "ready"]);

/**
 * `GET /api/v1/admin/pace/steering?location=` — the POS demand-steering feed: the
 * SAME `analyzeTruck` the KDS boards run, turned by `deriveSteeringPlan` into what
 * the till should do at the point of order — capacity-true promise times per
 * category, make-now surfacing, soft-throttle of low-yield bottleneck items, a
 * delivery intake cap, and the steering-banner reason. One model, two consumers.
 * Native twin of web `/api/admin/pace/steering`. Staff+, location-scoped; real
 * orders only (`getOrders` strips simulated demo tickets — Rule #1).
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;
  const requested = req.nextUrl.searchParams.get("location")?.trim().toLowerCase() || null;
  if (requested && !scopeAllows(guard.claims.scope, requested)) {
    return apiError("forbidden", `Not authorized for location "${requested}"`);
  }
  try {
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const slug = requested ?? (await getActiveLocationsAsync())[0]?.slug;
    if (!slug) return apiError("validation_failed", "No active location");

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

    return apiOk(
      {
        generatedAt: new Date(now).toISOString(),
        location: slug,
        paceWindowMin: PACE_WINDOW_MIN,
        bottleneck: plan.bottleneck,
        stations,
        plan,
      },
      { location: slug },
    );
  } catch (err) {
    logger.error("v1 pace steering failed", { layer: "api.v1.admin.pace.steering" }, err as Error);
    return apiError("internal", "Could not load the steering plan");
  }
}
