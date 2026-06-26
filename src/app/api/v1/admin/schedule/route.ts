import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, resolveLocationFilter } from "@/lib/api/v1/guard";
import { getShifts, getStaff } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/schedule?from=&to=` — scheduled shifts with staff names,
 * mirroring web `/admin/schedule`. Manager+; location-scoped. Soonest first.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  const filter = resolveLocationFilter(req, guard.claims.scope);
  if ("error" in filter) return filter.error;
  const from = req.nextUrl.searchParams.get("from")?.trim() || undefined;
  const to = req.nextUrl.searchParams.get("to")?.trim() || undefined;
  try {
    const [shifts, staff] = await Promise.all([getShifts({ from, to }), getStaff()]);
    const name = new Map(staff.map((s) => [s.id, s.name]));
    const list = shifts
      .filter((s) => filter.slugs === null || filter.slugs.includes(s.locationSlug))
      .map((s) => ({
        id: s.id,
        staffId: s.staffId,
        staffName: name.get(s.staffId) ?? s.staffId,
        locationSlug: s.locationSlug,
        startAt: s.startAt,
        endAt: s.endAt,
        role: s.role,
        status: s.status,
      }))
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    return apiOk(list, { count: list.length });
  } catch (err) {
    logger.error("v1 admin schedule failed", { layer: "api.v1.admin.schedule" }, err as Error);
    return apiError("internal", "Could not load the schedule");
  }
}
