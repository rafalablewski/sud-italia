import { test } from "node:test";
import assert from "node:assert/strict";
import { validateBooking, type BookingValidationInput } from "./booking";
import { pickOpenTable } from "./floor-twin";
import type { TableStatus } from "@/data/types";

// Run with:  npx tsx --test src/lib/booking.test.ts

function base(over: Partial<BookingValidationInput> = {}): BookingValidationInput {
  return {
    slotActive: true,
    slotSupportsDineIn: true,
    dineInCapacity: 4,
    reservationsOnSlot: 0,
    tableSeats: 4,
    partySize: 2,
    tableConflictCount: 0,
    // A 13:00 seating inside a 12:00–23:00 window (last seating 22:30).
    startMin: 13 * 60,
    openMin: 12 * 60,
    lastSeatingMin: 22 * 60 + 30,
    ...over,
  };
}

test("validateBooking: a clean slot+table passes", () => {
  assert.deepEqual(validateBooking(base()), { ok: true });
});

test("validateBooking: gates fire in priority order", () => {
  assert.deepEqual(validateBooking(base({ slotActive: false })), { ok: false, reason: "slot_inactive" });
  assert.deepEqual(validateBooking(base({ slotSupportsDineIn: false })), { ok: false, reason: "slot_not_dinein" });
  assert.deepEqual(validateBooking(base({ startMin: 11 * 60 + 30 })), { ok: false, reason: "before_open" });
  assert.deepEqual(validateBooking(base({ startMin: 22 * 60 + 45 })), { ok: false, reason: "after_last_seating" });
  assert.deepEqual(validateBooking(base({ partySize: 0 })), { ok: false, reason: "invalid_party" });
  assert.deepEqual(validateBooking(base({ tableSeats: 2, partySize: 4 })), { ok: false, reason: "table_too_small" });
  assert.deepEqual(validateBooking(base({ tableConflictCount: 1 })), { ok: false, reason: "table_conflict" });
  assert.deepEqual(validateBooking(base({ reservationsOnSlot: 4, dineInCapacity: 4 })), { ok: false, reason: "slot_full" });
});

test("validateBooking: opening-hours edges — open + last seating are inclusive", () => {
  // 08:30 before a 12:00 open is rejected (the reported bug).
  assert.deepEqual(validateBooking(base({ startMin: 8 * 60 + 30 })), { ok: false, reason: "before_open" });
  // Exactly at open (12:00) and exactly at last seating (22:30) both pass.
  assert.deepEqual(validateBooking(base({ startMin: 12 * 60 })), { ok: true });
  assert.deepEqual(validateBooking(base({ startMin: 22 * 60 + 30 })), { ok: true });
  // One tick past last seating (22:45) is rejected.
  assert.deepEqual(validateBooking(base({ startMin: 22 * 60 + 45 })), { ok: false, reason: "after_last_seating" });
});

test("validateBooking: closed-floor gate is not waived by an operator override", () => {
  // override zeroes conflict/slot-full at the call site, but the time gate still
  // fires — you can't seat a party before the doors open.
  assert.deepEqual(
    validateBooking(base({ startMin: 8 * 60 + 30, tableConflictCount: 0, reservationsOnSlot: 0 })),
    { ok: false, reason: "before_open" },
  );
});

test("validateBooking: table conflict outranks slot-full (most specific first)", () => {
  const v = validateBooking(base({ tableConflictCount: 1, reservationsOnSlot: 99 }));
  assert.deepEqual(v, { ok: false, reason: "table_conflict" });
});

test("pickOpenTable: best-fit available table, null when none fit", () => {
  const tables: { id: string; seats: number; status: TableStatus }[] = [
    { id: "big", seats: 8, status: "available" },
    { id: "fit", seats: 4, status: "available" },
    { id: "seated", seats: 2, status: "seated" }, // not available
    { id: "tiny", seats: 1, status: "available" },
  ];
  assert.equal(pickOpenTable(tables, 3)?.id, "fit"); // smallest that fits 3
  assert.equal(pickOpenTable(tables, 1)?.id, "tiny"); // smallest overall
  assert.equal(pickOpenTable(tables, 9), null); // nothing seats 9
  assert.equal(pickOpenTable(tables, 2)?.id, "fit"); // seated 2-top excluded
});
