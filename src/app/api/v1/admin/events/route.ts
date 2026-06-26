import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, resolveLocationFilter } from "@/lib/api/v1/guard";
import { getEvents } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/events` — events & large-party bookings, mirroring web
 * `/admin/events`. Manager+; location-scoped. Soonest first.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  const filter = resolveLocationFilter(req, guard.claims.scope);
  if ("error" in filter) return filter.error;
  try {
    const all = await getEvents();
    const list = (filter.slugs === null ? all : all.filter((e) => filter.slugs!.includes(e.locationSlug)))
      .map((e) => ({
        id: e.id,
        name: e.name,
        locationSlug: e.locationSlug,
        date: e.date,
        status: e.status,
        expectedAttendance: e.expectedAttendance ?? null,
        actualRevenueGrosze: e.actualRevenueGrosze ?? null,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return apiOk(list, { count: list.length });
  } catch (err) {
    logger.error("v1 admin events failed", { layer: "api.v1.admin.events" }, err as Error);
    return apiError("internal", "Could not load events");
  }
}
