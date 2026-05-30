import { test } from "node:test";
import assert from "node:assert/strict";
import { isSlotFull, slotHasCapacity, remainingCapacity } from "./slot-capacity";

// Run with:  npx tsx --test src/lib/slot-capacity.test.ts

test("a slot with free seats is not full", () => {
  assert.equal(isSlotFull({ currentOrders: 3, maxOrders: 5 }), false);
  assert.equal(slotHasCapacity({ currentOrders: 3, maxOrders: 5 }), true);
  assert.equal(remainingCapacity({ currentOrders: 3, maxOrders: 5 }), 2);
});

test("a slot at exactly capacity is full (no oversell)", () => {
  assert.equal(isSlotFull({ currentOrders: 5, maxOrders: 5 }), true);
  assert.equal(slotHasCapacity({ currentOrders: 5, maxOrders: 5 }), false);
  assert.equal(remainingCapacity({ currentOrders: 5, maxOrders: 5 }), 0);
});

test("a lowered cap below booked count reads full, never negative capacity", () => {
  assert.equal(isSlotFull({ currentOrders: 7, maxOrders: 5 }), true);
  assert.equal(remainingCapacity({ currentOrders: 7, maxOrders: 5 }), 0);
});

test("an empty slot has full capacity", () => {
  assert.equal(isSlotFull({ currentOrders: 0, maxOrders: 4 }), false);
  assert.equal(remainingCapacity({ currentOrders: 0, maxOrders: 4 }), 4);
});
