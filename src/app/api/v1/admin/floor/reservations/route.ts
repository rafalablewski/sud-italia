import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, scopeAllows, scopedLocations } from "@/lib/api/v1/guard";
import { getReservations, deleteReservation, saveReservation, getServiceWindow } from "@/lib/store";
import {
  timeToMinutes,
  minutesToTime,
  findReservationConflicts,
  serviceWindowViolation,
  durationBeforeClose,
} from "@/lib/floor";
import type { ReservationStatus } from "@/data/types";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const STATUSES: ReservationStatus[] = ["booked", "seated", "completed", "cancelled", "no-show"];

function resolveLocation(req: NextRequest, scope: string): string | { error: ReturnType<typeof apiError> } {
  const requested = req.nextUrl.searchParams.get("location")?.trim().toLowerCase() || null;
  if (requested) {
    if (!scopeAllows(scope, requested)) return { error: apiError("forbidden", `Not authorized for location "${requested}"`) };
    return requested;
  }
  const allowed = scopedLocations(scope);
  if (allowed && allowed.length === 1) return allowed[0];
  return { error: apiError("validation_failed", "Specify `location`") };
}

/**
 * `GET /api/v1/admin/floor/reservations?location=&date=` — table reservations for
 * a day (or all upcoming). Mirrors web `/core/guest/book`'s reservation list.
 * Manager+, location-scoped — reservations carry guest PII (name + phone), so the
 * gate matches the web route's manager rank (don't expose it to kitchen/staff).
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  const loc = resolveLocation(req, guard.claims.scope);
  if (typeof loc !== "string") return loc.error;
  const date = req.nextUrl.searchParams.get("date")?.trim() || undefined;
  try {
    const rows = await getReservations(loc, date);
    return apiOk(rows, { count: rows.length, location: loc });
  } catch (err) {
    logger.error("v1 reservations list failed", { layer: "api.v1.admin.floor.reservations" }, err as Error);
    return apiError("internal", "Could not load reservations");
  }
}

/**
 * `DELETE /api/v1/admin/floor/reservations?id=&location=` — cancel a booking.
 * Manager+, location-scoped.
 */
export async function DELETE(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  const loc = resolveLocation(req, guard.claims.scope);
  if (typeof loc !== "string") return loc.error;
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) return apiError("validation_failed", "id is required");
  try {
    const ok = await deleteReservation(id, loc);
    if (!ok) return apiError("not_found", "Unknown reservation");
    return apiOk({ deleted: true, id }, { location: loc });
  } catch (err) {
    logger.error("v1 reservation delete failed", { layer: "api.v1.admin.floor.reservations" }, err as Error);
    return apiError("internal", "Could not cancel the reservation");
  }
}

/**
 * `POST /api/v1/admin/floor/reservations?location=` — update a booking's state:
 * the seat / seat-early / no-show / complete / reassign transitions the native
 * Book · Arrivals lens drives (the web mirror is the `POST` on
 * `/api/admin/floor/reservations`). The caller resends the whole record with the
 * changed fields; the route re-runs the same non-negotiable gates as a fresh
 * booking whenever the seating **time** changes (service window — never waived —
 * then a table conflict check unless `override`), auto-stamps `seatedAt` /
 * `completedAt` on the transition, and persists through the shared
 * `saveReservation` store primitive (no new persistence surface). Manager+,
 * location-scoped. Returns the saved reservation, or a typed 409 conflict / 422
 * out-of-hours the client can surface.
 */
export async function POST(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  const loc = resolveLocation(req, guard.claims.scope);
  if (typeof loc !== "string") return loc.error;

  let body: {
    id?: string; customerName?: string; customerPhone?: string; partySize?: number;
    date?: string; time?: string; durationMin?: number; tableId?: string; slotId?: string;
    status?: string; notes?: string; source?: string; seatedAt?: string; completedAt?: string;
    override?: boolean;
  };
  try { body = await req.json(); } catch { return apiError("bad_request", "Body must be valid JSON"); }

  const customerName = String(body.customerName ?? "").trim();
  const partySize = Number(body.partySize);
  const date = String(body.date ?? "").trim();
  const time = String(body.time ?? "").trim();
  let durationMin = Number.isFinite(Number(body.durationMin)) ? Math.round(Number(body.durationMin)) : 90;

  if (!customerName) return apiError("validation_failed", "Customer name is required");
  if (!Number.isFinite(partySize) || partySize < 1 || partySize > 50) return apiError("validation_failed", "Party size must be 1–50");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return apiError("validation_failed", "Invalid date");
  if (!Number.isFinite(timeToMinutes(time))) return apiError("validation_failed", "Invalid time");
  if (durationMin < 15 || durationMin > 600) durationMin = 90;

  const status: ReservationStatus = STATUSES.includes(body.status as ReservationStatus) ? (body.status as ReservationStatus) : "booked";
  const tableId = body.tableId ? String(body.tableId) : undefined;
  const source: "booking" | "walk-in" | undefined =
    body.source === "walk-in" ? "walk-in" : body.source === "booking" ? "booking" : undefined;
  const nowIso = new Date().toISOString();
  const seatedAt = body.seatedAt ? String(body.seatedAt) : status === "seated" ? nowIso : undefined;
  const completedAt = body.completedAt ? String(body.completedAt) : status === "completed" ? nowIso : undefined;

  try {
    const sameDay = await getReservations(loc, date);
    const priorRes = typeof body.id === "string" ? sameDay.find((r) => r.id === body.id) : undefined;

    // Service-window gate — re-checked whenever the seating time is new or moved
    // (a seat-early reschedule), never waived by override. A late seating is
    // capped so its table still frees by close.
    const startMin = timeToMinutes(time);
    const timeChanged = !priorRes || priorRes.time !== time;
    if (timeChanged) {
      const win = await getServiceWindow(loc, date);
      const violation = serviceWindowViolation(startMin, win.openMin, win.lastSeatingMin);
      if (violation) {
        const message =
          violation === "before_open"
            ? `The floor doesn't open until ${minutesToTime(win.openMin)}.`
            : `Too late — the last seating is ${minutesToTime(win.lastSeatingMin)} (30 min before ${minutesToTime(win.closeMin)} close).`;
        return apiError("validation_failed", message);
      }
      durationMin = durationBeforeClose(startMin, durationMin, win.closeMin);
    }

    // Conflict check against the day's active bookings on the same table.
    const conflicts = findReservationConflicts(sameDay, {
      id: typeof body.id === "string" ? body.id : "",
      locationSlug: loc,
      tableId,
      date,
      time,
      durationMin,
    });
    if (conflicts.length > 0 && body.override !== true) {
      return apiError("conflict", `Table clashes with ${conflicts[0].customerName || "another booking"} at ${conflicts[0].time}.`);
    }

    const reservation = await saveReservation({
      id: typeof body.id === "string" ? body.id : undefined,
      locationSlug: loc,
      customerName,
      customerPhone: body.customerPhone ? String(body.customerPhone).trim() : undefined,
      partySize: Math.round(partySize),
      date,
      time,
      durationMin,
      tableId,
      slotId: body.slotId ? String(body.slotId) : undefined,
      status,
      notes: body.notes ? String(body.notes).trim() : undefined,
      source,
      seatedAt,
      completedAt,
    });
    return apiOk(reservation, { location: loc });
  } catch (err) {
    logger.error("v1 reservation update failed", { layer: "api.v1.admin.floor.reservations" }, err as Error);
    return apiError("internal", "Could not update the reservation");
  }
}
