import { test } from "node:test";
import assert from "node:assert/strict";
import { monthlyGrosze, FREQUENCY_TO_MONTHS } from "./business-costs-math";

// Run with:  npx tsx --test src/lib/business-costs-math.test.ts

test("monthlyGrosze normalizes each frequency to a monthly burn", () => {
  assert.equal(monthlyGrosze({ amountGrosze: 12000, frequency: "monthly" }), 12000);
  assert.equal(monthlyGrosze({ amountGrosze: 12000, frequency: "yearly" }), 1000); // /12
  assert.equal(monthlyGrosze({ amountGrosze: 3000, frequency: "quarterly" }), 1000); // /3
  assert.equal(monthlyGrosze({ amountGrosze: 1000, frequency: "weekly" }), Math.round(1000 * 4.345));
});

test("one-off costs contribute zero recurring monthly burn", () => {
  assert.equal(monthlyGrosze({ amountGrosze: 99999, frequency: "one-off" }), 0);
  assert.equal(FREQUENCY_TO_MONTHS["one-off"], 0);
});
