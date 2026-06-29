import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, scopeAllows, scopedLocations } from "@/lib/api/v1/guard";
import { createBooking } from "@/lib/booking";
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
 * `POST /api/v1/admin/floor/booking?location=` — the unified booking console:
 * holds a TABLE for a SLOT in one call. Body
 * `{ slotId, tableId, customerName, customerPhone?, partySize, durationMin?, notes?, override? }`.
 * Reuses the shared `createBooking` orchestrator (validates slot capacity + table
 * fit + conflicts; the override bypasses the soft gates). Returns the reservation
 * on success, or a typed conflict (409) the caller can surface. Manager+.
 */
export async function POST(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  const loc = resolveLocation(req, guard.claims.scope);
  if (typeof loc !== "string") return loc.error;

  let body: {
    slotId?: string; tableId?: string; customerName?: string; customerPhone?: string;
    partySize?: number; durationMin?: number; notes?: string; override?: boolean;
  };
  try { body = await req.json(); } catch { return apiError("bad_request", "Body must be valid JSON"); }

  const slotId = String(body.slotId ?? "").trim();
  const tableId = String(body.tableId ?? "").trim();
  const partySize = Number(body.partySize);
  if (!slotId || !tableId) return apiError("validation_failed", "slotId and tableId are required");
  if (!Number.isFinite(partySize) || partySize < 1 || partySize > 50) {
    return apiError("validation_failed", "partySize must be 1–50");
  }

  try {
    const result = await createBooking({
      locationSlug: loc,
      slotId, tableId,
      customerName: String(body.customerName ?? "").trim() || "Guest",
      customerPhone: typeof body.customerPhone === "string" ? body.customerPhone : undefined,
      partySize,
      durationMin: Number.isFinite(Number(body.durationMin)) ? Number(body.durationMin) : undefined,
      notes: typeof body.notes === "string" ? body.notes : undefined,
      override: body.override === true,
    });
    if (!result.ok) {
      // A booking gate (slot full, table too small, conflict) → 409 with the reason.
      return apiError("conflict", bookingMessage(result.reason), { reason: result.reason, conflicts: result.conflicts ?? [] });
    }
    return apiOk(result.reservation, { location: loc }, 201);
  } catch (err) {
    logger.error("v1 booking failed", { layer: "api.v1.admin.floor.booking" }, err as Error);
    return apiError("internal", "Could not create the booking");
  }
}

function bookingMessage(reason: string): string {
  switch (reason) {
    case "slot_not_found": return "That service slot no longer exists";
    case "table_not_found": return "That table no longer exists";
    case "slot_inactive": return "That slot isn't accepting bookings";
    case "slot_not_dinein": return "That slot doesn't serve dine-in";
    case "slot_full": return "That slot is fully booked";
    case "table_too_small": return "That table is too small for the party";
    case "table_conflict": return "That table is already booked for this time";
    default: return "Couldn't book that combination";
  }
}
