import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, scopedLocations } from "@/lib/api/v1/guard";
import { getAllLocationsAsync } from "@/lib/locations-store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/manage-locations` — every location with status & address,
 * mirroring web `/admin/locations/manage`. Owner-level; respects token scope.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "owner");
  if ("error" in guard) return guard.error;
  const allowed = scopedLocations(guard.claims.scope);
  try {
    const all = await getAllLocationsAsync();
    const list = all
      .filter((l) => allowed === null || allowed.includes(l.slug))
      .map((l) => ({
        slug: l.slug,
        name: l.name,
        city: l.city,
        address: l.address,
        isActive: l.isActive,
        servesAlcohol: l.servesAlcohol ?? false,
        displayOrder: l.displayOrder,
      }))
      .sort((a, b) => a.displayOrder - b.displayOrder);
    return apiOk(list, { count: list.length });
  } catch (err) {
    logger.error("v1 admin manage-locations failed", { layer: "api.v1.admin.locs" }, err as Error);
    return apiError("internal", "Could not load locations");
  }
}
