import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, resolveLocationFilter, scopeAllows } from "@/lib/api/v1/guard";
import { getEvents, saveEvent } from "@/lib/store";
import { logger } from "@/lib/logger";

const EVENT_STATUSES = new Set(["scheduled", "live", "done", "cancelled"]);

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

/**
 * `PATCH /api/v1/admin/events` — advance an event's lifecycle, mirroring the web
 * `/admin/events` status control. Body `{ id, status }` where status ∈
 * {scheduled, live, done, cancelled}. Manager+; the event's location must be in
 * scope. Re-saves through `saveEvent` (upsert) so every other field is preserved.
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
  if (!id || !EVENT_STATUSES.has(status)) {
    return apiError("validation_failed", "id and a valid status are required");
  }

  try {
    const event = (await getEvents()).find((e) => e.id === id);
    if (!event) return apiError("not_found", "Unknown event");
    if (!scopeAllows(guard.claims.scope, event.locationSlug)) {
      return apiError("forbidden", `Not authorized for location "${event.locationSlug}"`);
    }
    const saved = await saveEvent({ ...event, status: status as typeof event.status });
    return apiOk({
      id: saved.id,
      name: saved.name,
      locationSlug: saved.locationSlug,
      date: saved.date,
      status: saved.status,
      expectedAttendance: saved.expectedAttendance ?? null,
      actualRevenueGrosze: saved.actualRevenueGrosze ?? null,
    });
  } catch (err) {
    logger.error("v1 admin events patch failed", { layer: "api.v1.admin.events" }, err as Error);
    return apiError("internal", "Could not update the event");
  }
}
