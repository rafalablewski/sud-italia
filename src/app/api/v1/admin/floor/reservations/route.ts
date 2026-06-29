import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, scopeAllows, scopedLocations } from "@/lib/api/v1/guard";
import { getReservations, deleteReservation } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

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
 * Staff+, location-scoped.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "staff");
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
