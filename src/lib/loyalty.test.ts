import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateTier,
  calculatePointsForOrder,
  getNextTier,
  pointsToNextTier,
  TIER_ORDER,
  type LoyaltyTier,
} from "./loyalty";
import type { LoyaltySettings } from "@/lib/store";

// Run with:  npx tsx --test src/lib/loyalty.test.ts
//
// Locks the points/tier math the audit (§11.3 "what's the LTV/CAC") leans on:
// every loyalty number a customer sees flows through these four helpers.

// Mirror the seed ladder in store.ts so the fixture stays faithful to prod:
// bronze 0/1×, silver 500/1.5×, gold 1500/2×, platinum 5000/3×.
const tiers: LoyaltySettings["tiers"] = {
  bronze: { label: "Bronze", threshold: 0, multiplier: 1, perks: [] },
  silver: { label: "Silver", threshold: 500, multiplier: 1.5, perks: [] },
  gold: { label: "Gold", threshold: 1500, multiplier: 2, perks: [] },
  platinum: { label: "Platinum", threshold: 5000, multiplier: 3, perks: [] },
};

test("calculateTier maps points onto the ladder at every threshold", () => {
  assert.equal(calculateTier(0, tiers), "bronze");
  assert.equal(calculateTier(499, tiers), "bronze");
  assert.equal(calculateTier(500, tiers), "silver"); // inclusive lower bound
  assert.equal(calculateTier(1499, tiers), "silver");
  assert.equal(calculateTier(1500, tiers), "gold");
  assert.equal(calculateTier(4999, tiers), "gold");
  assert.equal(calculateTier(5000, tiers), "platinum");
  assert.equal(calculateTier(999_999, tiers), "platinum");
});

test("calculatePointsForOrder earns 1 pt per PLN, scaled by tier multiplier", () => {
  // 25.00 PLN = 2500 grosze = 25 base points.
  assert.equal(calculatePointsForOrder(2500, "bronze", tiers), 25);
  assert.equal(calculatePointsForOrder(2500, "silver", tiers), Math.floor(25 * 1.5)); // 37
  assert.equal(calculatePointsForOrder(2500, "gold", tiers), 50);
  assert.equal(calculatePointsForOrder(2500, "platinum", tiers), 75);
});

test("calculatePointsForOrder floors sub-PLN remainders, never awards on change", () => {
  // 25.99 PLN → 25 base points (the 99 grosze don't round up).
  assert.equal(calculatePointsForOrder(2599, "bronze", tiers), 25);
  // 0.50 PLN → 0 points.
  assert.equal(calculatePointsForOrder(50, "bronze", tiers), 0);
  assert.equal(calculatePointsForOrder(0, "platinum", tiers), 0);
});

test("getNextTier walks the ladder and terminates at platinum", () => {
  assert.equal(getNextTier("bronze"), "silver");
  assert.equal(getNextTier("silver"), "gold");
  assert.equal(getNextTier("gold"), "platinum");
  assert.equal(getNextTier("platinum"), null);
});

test("pointsToNextTier returns the remaining gap, clamped at zero", () => {
  assert.equal(pointsToNextTier(0, "bronze", tiers), 500);
  assert.equal(pointsToNextTier(450, "bronze", tiers), 50);
  // Already past the next threshold (tier lagging behind points) → no negative gap.
  assert.equal(pointsToNextTier(600, "bronze", tiers), 0);
  // Top of the ladder has no next tier → zero distance.
  assert.equal(pointsToNextTier(9999, "platinum", tiers), 0);
});

test("TIER_ORDER is the canonical low→high ladder", () => {
  assert.deepEqual(TIER_ORDER, ["bronze", "silver", "gold", "platinum"] as LoyaltyTier[]);
});
