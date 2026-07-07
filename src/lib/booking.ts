import type { Reservation, TableFeature } from "@/data/types";
import {
  getReservations,
  getServiceWindow,
  getSlotById,
  getTables,
  saveReservation,
} from "@/lib/store";
import { durationBeforeClose, findReservationConflicts, timeToMinutes } from "@/lib/floor";

/**
 * Unified booking — the merged Floor + Slots flow: book a dine-in time slot and
 * assign a table in one operation, conflict-checked on *both* (slot booking
 * capacity + table double-booking). The slot supplies the date/time + capacity;
 * the table supplies the seat. See docs/strategy/restaurant-os-blueprint.md §4
 * and the Operations docs (Floor / Slots).
 *
 * Capacity model: a dine-in slot is "full" for reservations only when there are
 * as many active reservations on it as there are TABLES on the floor — the
 * physical limit (you can't seat more parties at once than you have tables; a
 * specific table is separately protected by the table-conflict gate). It is NOT
 * capped by `slot.maxOrders`, which is an ONLINE/POS order-throughput cap (paired
 * with `slot.currentOrders`) — a wholly separate lens. Using maxOrders as the
 * reservation cap made a slot read "full" after a handful of bookings even with
 * most of the floor empty. Bookings never touch `currentOrders`, so a guest who
 * books then orders isn't double-counted.
 */

const RESERVATION_HOLDS: Reservation["status"][] = ["booked", "seated"];

export type BookingReason =
  | "slot_inactive"
  | "slot_not_dinein"
  | "before_open"
  | "after_last_seating"
  | "invalid_party"
  | "table_too_small"
  | "table_conflict"
  | "slot_full";

export interface BookingValidationInput {
  slotActive: boolean;
  slotSupportsDineIn: boolean;
  /** Physical dine-in capacity of the slot = the number of tables on the floor.
   *  A slot is reservation-"full" only once every table could be taken; NOT the
   *  online-order `maxOrders` cap. */
  dineInCapacity: number;
  /** Active (booked/seated) reservations already on this slot. */
  reservationsOnSlot: number;
  tableSeats: number;
  partySize: number;
  /** Overlapping active reservations on the chosen table (0 = none / overridden). */
  tableConflictCount: number;
  /** Seating start (minutes since midnight), derived from the slot time. */
  startMin: number;
  /** The day's service window (from the location's opening hours): a booking may
   *  start no earlier than `openMin` and no later than `lastSeatingMin`
   *  (close − last-order buffer). Outside it the floor is closed. */
  openMin: number;
  lastSeatingMin: number;
}

/** Pure gate — order matters (most specific first). */
export function validateBooking(
  i: BookingValidationInput,
): { ok: true } | { ok: false; reason: BookingReason } {
  if (!i.slotActive) return { ok: false, reason: "slot_inactive" };
  if (!i.slotSupportsDineIn) return { ok: false, reason: "slot_not_dinein" };
  // Opening-hours gate: you can't seat a party while the floor is closed. This
  // is never waived by `override` (that only bypasses conflict/capacity).
  if (i.startMin < i.openMin) return { ok: false, reason: "before_open" };
  if (i.startMin > i.lastSeatingMin) return { ok: false, reason: "after_last_seating" };
  if (!Number.isFinite(i.partySize) || i.partySize < 1) return { ok: false, reason: "invalid_party" };
  if (i.tableSeats < i.partySize) return { ok: false, reason: "table_too_small" };
  if (i.tableConflictCount > 0) return { ok: false, reason: "table_conflict" };
  if (i.reservationsOnSlot >= i.dineInCapacity) return { ok: false, reason: "slot_full" };
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
  /** Accessibility features this party requires (carried onto the reservation). */
  needs?: TableFeature[];
  /** Extra tables combined with `tableId` for a large party. */
  joinedTableIds?: string[];
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

  const allTables = await getTables(input.locationSlug);
  const table = allTables.find((t) => t.id === input.tableId);
  if (!table) return { ok: false, reason: "table_not_found" };

  // Service window for the day — the slot time must fall inside opening hours,
  // and a late booking is capped so it ends by close (a 22:30 start at a 23:00
  // close gets a 30-min table).
  const window = await getServiceWindow(input.locationSlug, slot.date);
  const startMin = timeToMinutes(slot.time);
  const durationMin = durationBeforeClose(startMin, input.durationMin ?? 90, window.closeMin);
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
    // Physical cap = tables on the floor, not the online-order maxOrders.
    dineInCapacity: Math.max(1, allTables.length),
    reservationsOnSlot: input.override ? 0 : reservationsOnSlot,
    tableSeats: table.seats,
    partySize: input.partySize,
    tableConflictCount: input.override ? 0 : conflicts.length,
    startMin,
    openMin: window.openMin,
    lastSeatingMin: window.lastSeatingMin,
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
    needs: input.needs?.length ? input.needs : undefined,
    joinedTableIds: input.joinedTableIds?.length ? input.joinedTableIds : undefined,
  });
  return { ok: true, reservation };
}
