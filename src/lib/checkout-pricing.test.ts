import { test } from "node:test";
import assert from "node:assert/strict";
import {
  effectiveUnitPrice,
  modifierPriceDelta,
  computeDeliveryFee,
  FREE_DELIVERY_THRESHOLD,
  DELIVERY_FEE_GROSZE,
} from "./upsell";
import type { CartItem, MenuItem } from "@/data/types";

// Run with:  npx tsx --test src/lib/checkout-pricing.test.ts
// All prices are in grosze (1 PLN = 100 grosze).

function pizza(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: "krk-pizza-margherita",
    slug: "krk-pizza-margherita",
    name: "Margherita",
    price: 3200,
    cost: 900,
    category: "pizza",
    modifierGroups: [
      {
        id: "extras",
        name: "Extras",
        options: [
          { id: "extra-cheese", name: "Extra cheese", priceDelta: 600 },
          { id: "promo", name: "Promo", priceDelta: -200 },
        ],
      },
    ],
    ...(overrides as object),
  } as unknown as MenuItem;
}

function item(menuItem: MenuItem, selectedModifiers?: CartItem["selectedModifiers"]): CartItem {
  return { menuItem, selectedModifiers } as unknown as CartItem;
}

test("effectiveUnitPrice is the base price when no modifiers", () => {
  assert.equal(effectiveUnitPrice(item(pizza())), 3200);
});

test("modifierPriceDelta sums positive deltas only (no refunds)", () => {
  const withExtra = item(pizza(), [{ groupId: "extras", optionId: "extra-cheese" }]);
  assert.equal(modifierPriceDelta(withExtra), 600);
  assert.equal(effectiveUnitPrice(withExtra), 3800);

  // A negative-delta option is ignored — modifiers never reduce the price.
  const withPromo = item(pizza(), [{ groupId: "extras", optionId: "promo" }]);
  assert.equal(modifierPriceDelta(withPromo), 0);
  assert.equal(effectiveUnitPrice(withPromo), 3200);
});

test("unknown modifier selections are skipped, not thrown", () => {
  const bogus = item(pizza(), [{ groupId: "nope", optionId: "missing" }]);
  assert.equal(modifierPriceDelta(bogus), 0);
});

test("takeout never pays a delivery fee", () => {
  assert.equal(computeDeliveryFee(1000, "takeout"), 0);
});

test("delivery under the free threshold pays the flat fee", () => {
  assert.equal(computeDeliveryFee(FREE_DELIVERY_THRESHOLD - 1, "delivery"), DELIVERY_FEE_GROSZE);
});

test("delivery at/over the free threshold is free", () => {
  assert.equal(computeDeliveryFee(FREE_DELIVERY_THRESHOLD, "delivery"), 0);
  assert.equal(computeDeliveryFee(FREE_DELIVERY_THRESHOLD + 5000, "delivery"), 0);
});

test("operator fee + threshold overrides are honoured", () => {
  // Lower threshold to 40 PLN, custom 9 PLN fee.
  assert.equal(computeDeliveryFee(3000, "delivery", 4000, 900), 900);
  assert.equal(computeDeliveryFee(4000, "delivery", 4000, 900), 0);
});
