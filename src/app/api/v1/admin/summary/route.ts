import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, scopedLocations, scopeAllows } from "@/lib/api/v1/guard";
import { getSummary } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/summary?location=&from=&to=` — sales/cost/profit rollup,
 * mirroring web `/admin/reports`. Manager+. Single-location aware: getSummary
 * takes one slug, so an unrestricted operator gets the chain (no location),
 * a single-site operator gets their site, and a multi-site scoped operator must
 * pass `?location=` (within scope) to disambiguate.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  const { scope } = guard.claims;

  const requested = req.nextUrl.searchParams.get("location")?.trim().toLowerCase() || null;
  if (requested && !scopeAllows(scope, requested)) {
    return apiError("forbidden", `Not authorized for location "${requested}"`);
  }
  const from = req.nextUrl.searchParams.get("from")?.trim() || undefined;
  const to = req.nextUrl.searchParams.get("to")?.trim() || undefined;

  let location: string | undefined = requested ?? undefined;
  if (!location) {
    const allowed = scopedLocations(scope); // null = unrestricted
    if (allowed && allowed.length === 1) location = allowed[0];
    else if (allowed && allowed.length > 1) {
      return apiError("validation_failed", "Specify `location` — token covers multiple sites");
    }
  }

  try {
    const summary = await getSummary(location, from, to);
    return apiOk(summary, { location: location ?? "all", from: from ?? null, to: to ?? null });
  } catch (err) {
    logger.error("v1 admin summary failed", { layer: "api.v1.admin.summary" }, err as Error);
    return apiError("internal", "Could not load summary");
  }
}
