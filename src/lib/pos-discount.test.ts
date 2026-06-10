import { test } from "node:test";
import assert from "node:assert/strict";
import { manualDiscountGrosze } from "./pos-discount";
import type { PosTabDiscount } from "@/data/types";

// Run with:  npx tsx --test src/lib/pos-discount.test.ts
// All amounts are grosze (1 PLN = 100 grosze). The discount is what gets
// SUBTRACTED from the charged total, so over-/under-counting is real money.

const pct = (value: number, reason = "comp"): PosTabDiscount => ({ type: "percent", value, reason });
const amt = (value: number, reason = "comp"): PosTabDiscount => ({ type: "amount", value, reason });

test("no discount (null/undefined) is zero", () => {
  assert.equal(manualDiscountGrosze(10000, null), 0);
  assert.equal(manualDiscountGrosze(10000, undefined), 0);
});

test("a non-positive base never yields a discount", () => {
  assert.equal(manualDiscountGrosze(0, pct(50)), 0);
  assert.equal(manualDiscountGrosze(-500, amt(100)), 0);
});

test("percent discount is rounded to the nearest grosz", () => {
  assert.equal(manualDiscountGrosze(10000, pct(10)), 1000); // 10% of 100 PLN
  assert.equal(manualDiscountGrosze(3333, pct(10)), 333); // 333.3 → 333
  assert.equal(manualDiscountGrosze(3335, pct(10)), 334); // 333.5 → 334 (round half up)
});

test("percent is clamped to 0–100 — never negative, never over the base", () => {
  assert.equal(manualDiscountGrosze(10000, pct(150)), 10000); // capped at 100% = whole base
  assert.equal(manualDiscountGrosze(10000, pct(-20)), 0); // negative pct floors to 0
});

test("a 100% discount equals the base (free), never more", () => {
  assert.equal(manualDiscountGrosze(8800, pct(100)), 8800);
});

test("amount discount is taken at face value but capped at the base", () => {
  assert.equal(manualDiscountGrosze(10000, amt(2500)), 2500);
  assert.equal(manualDiscountGrosze(2000, amt(5000)), 2000); // can't discount more than the bill
});

test("a negative amount discount floors to zero (never inflates the total)", () => {
  assert.equal(manualDiscountGrosze(10000, amt(-3000)), 0);
});

test("a fractional/garbage amount value is rounded / coerced safely", () => {
  assert.equal(manualDiscountGrosze(10000, amt(1499.6)), 1500);
  assert.equal(manualDiscountGrosze(10000, amt(Number.NaN)), 0);
});
