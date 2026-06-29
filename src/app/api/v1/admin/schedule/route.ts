import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, resolveLocationFilter, scopeAllows } from "@/lib/api/v1/guard";
import { getShifts, getStaff, saveShift } from "@/lib/store";
import { logger } from "@/lib/logger";

const SHIFT_STATUSES = new Set(["scheduled", "in-progress", "done", "missed"]);

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

/**
 * `PATCH /api/v1/admin/schedule` — advance a shift's status, mirroring the web
 * schedule control. Body `{ id, status }` where status ∈ {scheduled, in-progress,
 * done, missed}. Manager+; the shift's location must be in scope. Re-saves via
 * `saveShift` (upsert) so the times / staff / role / notes are preserved.
 */
export async function PATCH(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;

  let body: { id?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return apiError("bad_request", "Body must be valid JSON");
  }
  const id = String(body.id ?? "").trim();
  const status = String(body.status ?? "");
  if (!id || !SHIFT_STATUSES.has(status)) {
    return apiError("validation_failed", "id and a valid status are required");
  }

  try {
    const shift = (await getShifts()).find((s) => s.id === id);
    if (!shift) return apiError("not_found", "Unknown shift");
    if (!scopeAllows(guard.claims.scope, shift.locationSlug)) {
      return apiError("forbidden", `Not authorized for location "${shift.locationSlug}"`);
    }
    const saved = await saveShift({ ...shift, status: status as typeof shift.status });
    const staff = await getStaff();
    const name = staff.find((s) => s.id === saved.staffId)?.name ?? saved.staffId;
    return apiOk({
      id: saved.id,
      staffId: saved.staffId,
      staffName: name,
      locationSlug: saved.locationSlug,
      startAt: saved.startAt,
      endAt: saved.endAt,
      role: saved.role,
      status: saved.status,
    });
  } catch (err) {
    logger.error("v1 admin schedule patch failed", { layer: "api.v1.admin.schedule" }, err as Error);
    return apiError("internal", "Could not update the shift");
  }
}
