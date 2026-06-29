import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, scopedLocations } from "@/lib/api/v1/guard";
import { getOrders, getKdsServiceHistory, getLaborCostInRange } from "@/lib/store";
import { getActiveLocationsAsync } from "@/lib/locations-store";
import { PROMISE_TARGET } from "@/lib/kds-prediction";
import { buildFleetTile, buildFleetBoard } from "@/lib/api/v1/fleet-dto";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/kds/fleet` — the owner Atlas board for OttavianoKDS, the
 * native twin of web `/api/admin/kds/fleet`. Live KDS health across every active
 * truck: counts, predicted-ready/at-risk (analyzeTruck), capacity-vs-demand pace,
 * rate metrics from completed orders, promise accuracy from the KDS ledger, and
 * on-shift from open time-punches. Owner-level and inherently cross-location;
 * respects token scope (a scoped owner sees only their trucks).
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "owner");
  if ("error" in guard) return guard.error;
  const allowed = scopedLocations(guard.claims.scope); // null = unrestricted
  const includeSimulated = req.nextUrl.searchParams.get("includeSimulated") === "1";

  try {
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const fromIso = todayStart.toISOString();
    const toIso = new Date(now).toISOString();
    const hourAgoMs = now - 60 * 60 * 1000;
    const dayEnd = new Date();
    dayEnd.setHours(23, 59, 59, 999);

    const locations = (await getActiveLocationsAsync()).filter(
      (l) => allowed === null || allowed.includes(l.slug),
    );

    const tiles = await Promise.all(
      locations.map(async (loc) => {
        const orders = await getOrders(loc.slug, fromIso, { includeSimulated });
        const history = await getKdsServiceHistory(loc.slug, fromIso, toIso);
        const { openShifts } = await getLaborCostInRange(loc.slug, fromIso, dayEnd.toISOString());
        return buildFleetTile({
          slug: loc.slug,
          name: loc.name,
          orders,
          hourAgoMs,
          promiseAccuracy: history.promiseAccuracy ?? PROMISE_TARGET,
          onShift: openShifts,
          nowMs: now,
        });
      }),
    );

    return apiOk(buildFleetBoard(tiles, toIso), { count: tiles.length });
  } catch (err) {
    logger.error("v1 admin kds fleet failed", { layer: "api.v1.admin.kds.fleet" }, err as Error);
    return apiError("internal", "Could not load fleet board");
  }
}
