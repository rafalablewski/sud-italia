import type { Reservation } from "@/data/types";
import {
  getReservations,
  getSlotById,
  getTables,
  saveReservation,
} from "@/lib/store";
import { findReservationConflicts } from "@/lib/floor";

/**
 * Unified booking — the merged Floor + Slots flow: book a dine-in time slot and
 * assign a table in one operation, conflict-checked on *both* (slot booking
 * capacity + table double-booking). The slot supplies the date/time + capacity;
 * the table supplies the seat. See docs/strategy/restaurant-os-blueprint.md §4
 * and the Operations docs (Floor / Slots).
 *
 * Capacity model: a dine-in reservation consumes the slot's capacity by COUNT
 * (active reservations on the slot < maxOrders) — it does NOT touch
 * `slot.currentOrders` (which tracks online/POS orders), so a guest who books
 * then orders isn't double-counted. Two booking lenses on one slot.
 */

const RESERVATION_HOLDS: Reservation["status"][] = ["booked", "seated"];

export type BookingReason =
  | "slot_inactive"
  | "slot_not_dinein"
  | "invalid_party"
  | "table_too_small"
  | "table_conflict"
  | "slot_full";

export interface BookingValidationInput {
  slotActive: boolean;
  slotSupportsDineIn: boolean;
  slotMaxOrders: number;
  /** Active (booked/seated) reservations already on this slot. */
  reservationsOnSlot: number;
  tableSeats: number;
  partySize: number;
  /** Overlapping active reservations on the chosen table (0 = none / overridden). */
  tableConflictCount: number;
}

/** Pure gate — order matters (most specific first). */
export function validateBooking(
  i: BookingValidationInput,
): { ok: true } | { ok: false; reason: BookingReason } {
  if (!i.slotActive) return { ok: false, reason: "slot_inactive" };
  if (!i.slotSupportsDineIn) return { ok: false, reason: "slot_not_dinein" };
  if (!Number.isFinite(i.partySize) || i.partySize < 1) return { ok: false, reason: "invalid_party" };
  if (i.tableSeats < i.partySize) return { ok: false, reason: "table_too_small" };
  if (i.tableConflictCount > 0) return { ok: false, reason: "table_conflict" };
  if (i.reservationsOnSlot >= i.slotMaxOrders) return { ok: false, reason: "slot_full" };
  return { ok: true };
}

export interface CreateBookingInput {
  locationSlug: string;
  slotId: string;
  tableId: string;
  customerName: string;
  customerPhone?: string;
  partySize: number;
  durationMin?: number;
  notes?: string;
  /** Operator force — bypasses the table_conflict and slot_full gates. */
  override?: boolean;
}

export type CreateBookingResult =
  | { ok: true; reservation: Reservation }
  | { ok: false; reason: BookingReason | "slot_not_found" | "table_not_found"; conflicts?: Reservation[] };

/**
 * Orchestrates a unified booking: reads the slot + table + same-day
 * reservations, validates both capacity and table conflicts, then saves the
 * reservation linked to the slot. Returns a typed failure (with conflicts) on
 * any gate so the caller can surface it.
 */
export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
  const slot = await getSlotById(input.slotId);
  if (!slot || slot.locationSlug !== input.locationSlug) return { ok: false, reason: "slot_not_found" };

  const table = (await getTables(input.locationSlug)).find((t) => t.id === input.tableId);
  if (!table) return { ok: false, reason: "table_not_found" };

  const durationMin = input.durationMin ?? 90;
  const sameDay = await getReservations(input.locationSlug, slot.date);
  const reservationsOnSlot = sameDay.filter(
    (r) => r.slotId === input.slotId && RESERVATION_HOLDS.includes(r.status),
  ).length;
  const conflicts = findReservationConflicts(sameDay, {
    id: "new",
    locationSlug: input.locationSlug,
    tableId: input.tableId,
    date: slot.date,
    time: slot.time,
    durationMin,
  });

  const verdict = validateBooking({
    slotActive: slot.status === "active",
    slotSupportsDineIn: slot.fulfillmentTypes.includes("dine-in"),
    slotMaxOrders: slot.maxOrders,
    reservationsOnSlot: input.override ? 0 : reservationsOnSlot,
    tableSeats: table.seats,
    partySize: input.partySize,
    tableConflictCount: input.override ? 0 : conflicts.length,
  });
  if (!verdict.ok) {
    return { ok: false, reason: verdict.reason, conflicts: conflicts.length ? conflicts : undefined };
  }

  const reservation = await saveReservation({
    locationSlug: input.locationSlug,
    customerName: input.customerName.trim() || "Guest",
    customerPhone: input.customerPhone?.trim() || undefined,
    partySize: Math.round(input.partySize),
    date: slot.date,
    time: slot.time,
    durationMin,
    tableId: input.tableId,
    slotId: input.slotId,
    status: "booked",
    notes: input.notes?.trim() || undefined,
  });
  return { ok: true, reservation };
}
