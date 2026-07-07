import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, scopeAllows } from "@/lib/api/v1/guard";
import { getMenuWithOverrides } from "@/data/menus";
import { getActiveLocationsAsync } from "@/lib/locations-store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/kds/eighty-six?location=` — the location's currently-86'd
 * (sold-out) menu items, so the POS grid can grey them out. Read-only mirror of
 * web `/api/admin/kds/eighty-six` (GET); the 86 *toggle* stays on the menu PATCH
 * facade (`admin/menu`). Staff+, location-scoped.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;
  const requested = req.nextUrl.searchParams.get("location")?.trim().toLowerCase() || null;
  if (requested && !scopeAllows(guard.claims.scope, requested)) {
    return apiError("forbidden", `Not authorized for location "${requested}"`);
  }
  try {
    const slug = requested ?? (await getActiveLocationsAsync())[0]?.slug;
    if (!slug) return apiOk({ eightySixed: [] as { id: string; name: string }[] });
    const eightySixed = (await getMenuWithOverrides(slug))
      .filter((m) => m.available === false)
      .map((m) => ({ id: m.id, name: m.name }));
    return apiOk({ locationSlug: slug, eightySixed }, { location: slug, count: eightySixed.length });
  } catch (err) {
    logger.error("v1 kds eighty-six failed", { layer: "api.v1.admin.kds.eighty-six" }, err as Error);
    return apiError("internal", "Could not load the 86 list");
  }
}
