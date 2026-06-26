import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, scopeAllows, scopedLocations } from "@/lib/api/v1/guard";
import { computeMenuEngineering } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/menu-engineering?window=&location=` — the Kasavana-Smith
 * star/plowhorse/puzzle/dog matrix, mirroring web `/admin/menu-engineering`.
 * Manager+. Reuses the store's computeMenuEngineering (real orders in the window).
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  const { scope } = guard.claims;

  const requested = req.nextUrl.searchParams.get("location")?.trim().toLowerCase() || null;
  if (requested && !scopeAllows(scope, requested)) {
    return apiError("forbidden", `Not authorized for location "${requested}"`);
  }
  let location: string | undefined = requested ?? undefined;
  if (!location) {
    const allowed = scopedLocations(scope);
    if (allowed && allowed.length >= 1) location = allowed[0];
  }
  const window = Math.max(7, Math.min(365, Number(req.nextUrl.searchParams.get("window")) || 90));

  try {
    const lines = await computeMenuEngineering(window, undefined, location);
    const out = lines.map((l) => ({
      menuItemId: l.menuItemId,
      name: l.name,
      category: l.category,
      unitsSold: l.unitsSold,
      gpPerUnit: l.gpPerUnit,
      revenue: l.revenue,
      quadrant: l.quadrant,
      menuRole: l.menuRole ?? null,
    }));
    const counts = { star: 0, plowhorse: 0, puzzle: 0, dog: 0 } as Record<string, number>;
    for (const l of out) counts[l.quadrant] = (counts[l.quadrant] ?? 0) + 1;
    return apiOk(out, { count: out.length, window, location: location ?? "all", counts });
  } catch (err) {
    logger.error("v1 admin menu-engineering failed", { layer: "api.v1.admin.menueng" }, err as Error);
    return apiError("internal", "Could not compute menu engineering");
  }
}
