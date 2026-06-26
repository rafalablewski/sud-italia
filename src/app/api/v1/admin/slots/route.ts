import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, resolveLocationFilter } from "@/lib/api/v1/guard";
import { getSlots } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/slots?date=YYYY-MM-DD` — fulfilment time-slots for the Core
 * Service surface, mirroring `/core/service/slots`. Staff+; location-scoped.
 * `date` is optional (omit for all upcoming).
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;
  const filter = resolveLocationFilter(req, guard.claims.scope);
  if ("error" in filter) return filter.error;
  const date = req.nextUrl.searchParams.get("date")?.trim() || undefined;
  try {
    const all = await getSlots(undefined, date);
    const slots = (filter.slugs === null ? all : all.filter((s) => filter.slugs!.includes(s.locationSlug)))
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    return apiOk(slots, { count: slots.length });
  } catch (err) {
    logger.error("v1 admin slots failed", { layer: "api.v1.admin.slots" }, err as Error);
    return apiError("internal", "Could not load slots");
  }
}
