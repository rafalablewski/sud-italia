import type { TimeSlot } from "@/data/types";

/**
 * Pure time-slot capacity helpers. Extracted so the oversell guard is
 * expressed once, identically, on every path that books or lists a slot
 * (`incrementSlotOrders`, `getAvailableSlots`, the DB `lt(currentOrders,
 * maxOrders)` predicate) — and so it can be unit-tested without a database.
 *
 * A slot is "full" when its booked count has reached its cap. We compare with
 * `>=` (not `===`) defensively: a slot whose `maxOrders` was lowered below an
 * already-booked count must still read as full, never negative-capacity.
 */

type CapacityFields = Pick<TimeSlot, "currentOrders" | "maxOrders">;

/** Remaining bookable seats in the slot, clamped at 0. */
export function remainingCapacity(slot: CapacityFields): number {
  return Math.max(0, slot.maxOrders - slot.currentOrders);
}

/** True when the slot cannot accept another order. */
export function isSlotFull(slot: CapacityFields): boolean {
  return slot.currentOrders >= slot.maxOrders;
}

/** True when the slot can accept at least one more order. */
export function slotHasCapacity(slot: CapacityFields): boolean {
  return !isSlotFull(slot);
}
