import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, scopeAllows, scopedLocations } from "@/lib/api/v1/guard";
import { getWasteLogs } from "@/lib/store";
import { getActiveLocationsAsync } from "@/lib/locations-store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/waste` — spoilage / wastage log, mirroring web `/admin/waste`.
 * Staff+; location-scoped. getWasteLogs is per-location, so we fan out across the
 * caller's allowed sites and merge. Newest first.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;
  const { scope } = guard.claims;

  const requested = req.nextUrl.searchParams.get("location")?.trim().toLowerCase() || null;
  if (requested && !scopeAllows(scope, requested)) {
    return apiError("forbidden", `Not authorized for location "${requested}"`);
  }

  let slugs: string[];
  if (requested) slugs = [requested];
  else {
    const allowed = scopedLocations(scope);
    slugs = allowed ?? (await getActiveLocationsAsync()).map((l) => l.slug);
  }

  try {
    const lists = await Promise.all(slugs.map((s) => getWasteLogs(s, { limit: 100 })));
    const entries = lists
      .flat()
      .map((w) => ({
        id: w.id,
        locationSlug: w.locationSlug,
        item: w.item,
        quantity: w.quantity,
        unit: w.unit,
        reason: w.reason,
        estimatedCostGrosze: w.estimatedCostGrosze ?? null,
        recordedAt: w.recordedAt,
      }))
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
    return apiOk(entries, { count: entries.length });
  } catch (err) {
    logger.error("v1 admin waste failed", { layer: "api.v1.admin.waste" }, err as Error);
    return apiError("internal", "Could not load the waste log");
  }
}
