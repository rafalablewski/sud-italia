import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getActiveComboDeals,
  computeDeliveryFee,
  getCustomerSegment,
  getDeliveryThresholdForCustomer,
  SEGMENT_FREE_DELIVERY_THRESHOLD,
  FREE_DELIVERY_THRESHOLD,
  DELIVERY_FEE_GROSZE,
} from "./upsell";
import type { CartItem, MenuItem, MenuCategory } from "@/data/types";

// Run with:  npx tsx --test src/lib/upsell-combo.test.ts
//
// CLAUDE.md Key Patterns: "discount must be subtracted from actual cart total,
// not just displayed." These tests pin the savings math + completion gating so
// a combo can't silently apply (or fail to apply) the wrong discount.

const line = (
  id: string,
  category: MenuCategory,
  price: number,
  quantity = 1,
): CartItem =>
  ({
    menuItem: { id, name: id, price, cost: Math.round(price * 0.3), category } as MenuItem,
    quantity,
  }) as CartItem;

const margherita = (price = 2500) => line("krk-pizza-margherita", "pizza", price);
const limonata = (price = 800) => line("krk-drink-limonata", "drinks", price);
const tiramisu = (price = 1200) => line("krk-dessert-tiramisu", "desserts", price);

test("empty cart yields no active deal", () => {
  const r = getActiveComboDeals([]);
  assert.equal(r.activeDeal, null);
  assert.equal(r.savings, 0);
  assert.equal(r.isComplete, false);
});

test("Italian Classic completes and discounts 10% of the three required items", () => {
  const r = getActiveComboDeals([margherita(2500), limonata(800), tiramisu(1200)]);
  assert.equal(r.activeDeal?.id, "italian-classic");
  assert.equal(r.isComplete, true);
  // 10% of (2500 + 800 + 1200) = 450 grosze.
  assert.equal(r.savings, 450);
  assert.equal(r.missingItems.length, 0);
  assert.equal(r.progress, 1);
});

test("a partial Italian Classic reports the missing item, not a complete discount", () => {
  const r = getActiveComboDeals([margherita(), limonata()]); // no tiramisù
  assert.equal(r.isComplete, false);
  assert.ok(r.missingItems.includes("Tiramisù"), "should name the missing required item");
  assert.ok(r.progress > 0 && r.progress < 1);
});

test("savings cap on the CHEAPEST qualifying unit — qty doesn't scale the discount", () => {
  // Two margheritas: discount still computed off one cheapest unit per requirement.
  const r = getActiveComboDeals([
    margherita(2500),
    margherita(2200), // cheaper second pizza
    limonata(800),
    tiramisu(1200),
  ]);
  assert.equal(r.isComplete, true);
  // cheapest margherita = 2200, not 2500 → 10% of (2200 + 800 + 1200) = 420.
  assert.equal(r.savings, 420);
});

test("channel filter hides dine-in/delivery combos that don't match the cart channel", () => {
  const cart = [line("krk-pasta-carbonara", "pasta", 3200), limonata()];
  const config = {
    combos: [
      {
        id: "delivery-only",
        name: "Delivery Pantry",
        description: "delivery only",
        categories: ["pasta", "drinks"] as MenuCategory[],
        discountPercent: 15,
        minItems: 2,
        active: true,
        channel: "delivery",
      },
    ],
  };
  // Takeout cart → the delivery-only combo must not fire.
  const takeout = getActiveComboDeals(cart, config as never, "takeout");
  assert.equal(takeout.activeDeal, null);
  // Delivery cart → it fires.
  const delivery = getActiveComboDeals(cart, config as never, "delivery");
  assert.equal(delivery.activeDeal?.id, "delivery-only");
  assert.equal(delivery.isComplete, true);
});

test("computeDeliveryFee: takeout is always free", () => {
  assert.equal(computeDeliveryFee(1000, "takeout"), 0);
  assert.equal(computeDeliveryFee(0, "takeout"), 0);
});

test("computeDeliveryFee: delivery charges below threshold, free at/above it", () => {
  assert.equal(computeDeliveryFee(5000, "delivery"), DELIVERY_FEE_GROSZE);
  assert.equal(computeDeliveryFee(FREE_DELIVERY_THRESHOLD, "delivery"), 0);
  assert.equal(computeDeliveryFee(FREE_DELIVERY_THRESHOLD + 1, "delivery"), 0);
});

test("computeDeliveryFee honours operator fee + per-customer threshold overrides", () => {
  // VIP 35 PLN threshold + a 9 PLN operator fee.
  assert.equal(computeDeliveryFee(3000, "delivery", 3500, 900), 900);
  assert.equal(computeDeliveryFee(3500, "delivery", 3500, 900), 0);
});

test("getCustomerSegment classifies by order count, with tier overriding to VIP", () => {
  assert.equal(getCustomerSegment(null), "first-time");
  assert.equal(getCustomerSegment({ ordersCount: 0 }), "first-time");
  assert.equal(getCustomerSegment({ ordersCount: 1 }), "first-time");
  assert.equal(getCustomerSegment({ ordersCount: 2 }), "growing");
  assert.equal(getCustomerSegment({ ordersCount: 4 }), "growing");
  assert.equal(getCustomerSegment({ ordersCount: 5 }), "regular");
  // Gold/Platinum jump straight to VIP regardless of count.
  assert.equal(getCustomerSegment({ ordersCount: 1, tier: "gold" }), "vip");
  assert.equal(getCustomerSegment({ ordersCount: 99, tier: "platinum" }), "vip");
});

test("getDeliveryThresholdForCustomer falls back to segment defaults, respects overrides", () => {
  assert.equal(getDeliveryThresholdForCustomer({ ordersCount: 0 }), SEGMENT_FREE_DELIVERY_THRESHOLD["first-time"]);
  assert.equal(getDeliveryThresholdForCustomer({ ordersCount: 10 }), SEGMENT_FREE_DELIVERY_THRESHOLD.regular);
  assert.equal(getDeliveryThresholdForCustomer({ tier: "gold" }), SEGMENT_FREE_DELIVERY_THRESHOLD.vip);
  // Operator override beats the default for that one segment only.
  assert.equal(getDeliveryThresholdForCustomer({ ordersCount: 0 }, { firstTime: 2000 }), 2000);
});
