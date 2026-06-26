import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, scopeAllows, scopedLocations } from "@/lib/api/v1/guard";
import { getTempLogs } from "@/lib/store";
import { getActiveLocationsAsync } from "@/lib/locations-store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/haccp` — fridge/cooking temperature log, mirroring web
 * `/admin/haccp`. Staff+; location-scoped. getTempLogs is per-location, so we fan
 * out across the caller's allowed sites and merge. `tempCelsius` is tenths of a
 * degree (the app divides by 10). Newest first.
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
    const lists = await Promise.all(slugs.map((s) => getTempLogs({ locationSlug: s, limit: 100 })));
    const rows = lists
      .flat()
      .map((t) => ({
        id: t.id,
        locationSlug: t.locationSlug,
        sensor: t.sensor,
        tempCelsius: t.tempCelsius, // tenths of a degree
        status: t.status,
        recordedBy: t.recordedBy ?? null,
        recordedAt: t.recordedAt,
      }))
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
    return apiOk(rows, { count: rows.length, flagged: rows.filter((r) => r.status === "flagged").length });
  } catch (err) {
    logger.error("v1 admin haccp failed", { layer: "api.v1.admin.haccp" }, err as Error);
    return apiError("internal", "Could not load the HACCP log");
  }
}
