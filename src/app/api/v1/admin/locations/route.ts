import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, scopedLocations } from "@/lib/api/v1/guard";
import { getInsights } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/locations` — per-location KPI comparison (the HQ rollup),
 * mirroring web `/admin/locations`. Owner-level; respects token scope.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "owner");
  if ("error" in guard) return guard.error;
  const allowed = scopedLocations(guard.claims.scope); // null = all
  try {
    const i = await getInsights();
    const rows = i.locationComparison.filter((l) => allowed === null || allowed.includes(l.locationSlug));
    return apiOk(rows, { count: rows.length });
  } catch (err) {
    logger.error("v1 admin locations failed", { layer: "api.v1.admin.locations" }, err as Error);
    return apiError("internal", "Could not load location comparison");
  }
}
