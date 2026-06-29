import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, scopeAllows, scopedLocations } from "@/lib/api/v1/guard";
import { getTempLogs, saveTempLog } from "@/lib/store";
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

/**
 * `POST /api/v1/admin/haccp` — record a temperature reading, mirroring web
 * `/admin/haccp` POST. Body `{ locationSlug, sensor, tempCelsius (tenths °C),
 * recordedBy? }`. The verdict (ok / flagged) is computed server-side by
 * saveTempLog. Staff+; the location must be in scope.
 */
export async function POST(req: NextRequest) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;

  let body: { locationSlug?: string; sensor?: string; tempCelsius?: number; recordedBy?: string };
  try {
    body = await req.json();
  } catch {
    return apiError("bad_request", "Body must be valid JSON");
  }
  const loc = String(body.locationSlug ?? "").trim().toLowerCase();
  const sensor = String(body.sensor ?? "").trim().slice(0, 80);
  const tempCelsius = Number(body.tempCelsius);
  if (!loc || !sensor || !Number.isInteger(tempCelsius)) {
    return apiError("validation_failed", "locationSlug, sensor and tempCelsius (tenths of a degree) are required");
  }
  if (tempCelsius < -500 || tempCelsius > 1500) {
    return apiError("validation_failed", "tempCelsius is out of the probe range");
  }
  if (!scopeAllows(guard.claims.scope, loc)) {
    return apiError("forbidden", `Not authorized for location "${loc}"`);
  }
  try {
    const recordedBy =
      typeof body.recordedBy === "string" && body.recordedBy.trim()
        ? body.recordedBy.trim().slice(0, 120)
        : guard.claims.name ?? guard.claims.sub;
    const log = await saveTempLog({
      locationSlug: loc,
      sensor,
      tempCelsius,
      recordedBy,
      recordedAt: new Date().toISOString(),
    });
    if (!log) return apiError("internal", "Could not record reading");
    return apiOk(
      {
        id: log.id,
        locationSlug: log.locationSlug,
        sensor: log.sensor,
        tempCelsius: log.tempCelsius,
        status: log.status,
        recordedBy: log.recordedBy ?? null,
        recordedAt: log.recordedAt,
      },
      undefined,
      201,
    );
  } catch (err) {
    logger.error("v1 admin haccp create failed", { layer: "api.v1.admin.haccp" }, err as Error);
    return apiError("internal", "Could not record reading");
  }
}
