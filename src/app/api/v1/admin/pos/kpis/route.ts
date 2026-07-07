import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, scopeAllows } from "@/lib/api/v1/guard";
import { getPosKpis } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/pos/kpis?location=` — the live till stat-strip figures the
 * native POS console needs on top of its client-side counts (open checks /
 * covers / prep queue, which stay on-device from the tab list): today's avg
 * check, sales/hour and table turns, each with an honest trailing-7-day
 * (same-time-of-day) delta. Every figure is derived from REAL orders (Rule #1)
 * via the shared `getPosKpis` — the native twin of web `/api/admin/pos/kpis`.
 * Staff+ (the till is a staff surface); location-scoped + required.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;
  const loc = req.nextUrl.searchParams.get("location")?.trim().toLowerCase() || "";
  if (!loc) return apiError("validation_failed", "location is required");
  if (!scopeAllows(guard.claims.scope, loc)) {
    return apiError("forbidden", `Not authorized for location "${loc}"`);
  }
  try {
    const kpis = await getPosKpis(loc);
    return apiOk(kpis, { location: loc });
  } catch (err) {
    logger.error("v1 pos kpis failed", { layer: "api.v1.admin.pos.kpis" }, err as Error);
    return apiError("internal", "Could not load till KPIs");
  }
}
