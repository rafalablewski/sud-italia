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
    ...over,
  };
}

test("validateBooking: a clean slot+table passes", () => {
  assert.deepEqual(validateBooking(base()), { ok: true });
});

test("validateBooking: gates fire in priority order", () => {
  assert.deepEqual(validateBooking(base({ slotActive: false })), { ok: false, reason: "slot_inactive" });
  assert.deepEqual(validateBooking(base({ slotSupportsDineIn: false })), { ok: false, reason: "slot_not_dinein" });
  assert.deepEqual(validateBooking(base({ partySize: 0 })), { ok: false, reason: "invalid_party" });
  assert.deepEqual(validateBooking(base({ tableSeats: 2, partySize: 4 })), { ok: false, reason: "table_too_small" });
  assert.deepEqual(validateBooking(base({ tableConflictCount: 1 })), { ok: false, reason: "table_conflict" });
  assert.deepEqual(validateBooking(base({ reservationsOnSlot: 4, dineInCapacity: 4 })), { ok: false, reason: "slot_full" });
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
