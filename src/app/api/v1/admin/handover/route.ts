import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, scopeAllows, scopedLocations } from "@/lib/api/v1/guard";
import { getShiftHandovers } from "@/lib/store";
import { getActiveLocationsAsync } from "@/lib/locations-store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/handover` — shift handover log, mirroring web `/admin/handover`.
 * Manager+; location-scoped (getShiftHandovers is per-location, so we fan out
 * across the caller's allowed sites and merge). Newest first.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
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
    const lists = await Promise.all(slugs.map((s) => getShiftHandovers(s, { limit: 50 })));
    const entries = lists
      .flat()
      .map((h) => ({
        id: h.id,
        locationSlug: h.locationSlug,
        shift: h.shift,
        outgoingManager: h.outgoingManager,
        incomingManager: h.incomingManager ?? null,
        cashVarianceGrosze: h.cashVarianceGrosze ?? null,
        tempChecksOk: h.tempChecksOk,
        equipmentOk: h.equipmentOk,
        managerComment: h.managerComment ?? null,
        recordedAt: h.recordedAt,
      }))
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
    return apiOk(entries, { count: entries.length });
  } catch (err) {
    logger.error("v1 admin handover failed", { layer: "api.v1.admin.handover" }, err as Error);
    return apiError("internal", "Could not load handovers");
  }
}
