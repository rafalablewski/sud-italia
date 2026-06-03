import { test } from "node:test";
import assert from "node:assert/strict";
import type { CartItem, MenuItem, Order } from "@/data/types";
import { mlUpsellBucket, inMlArm, compareUpsellArms } from "./ml-upsell-rollout";

function menuItem(id: string, category: MenuItem["category"], price: number, cost: number): MenuItem {
  return { id, name: id, description: "", price, cost, category, tags: [], available: true };
}
const pizza = menuItem("krk-pizza-margherita", "pizza", 3200, 1100);
const espresso = menuItem("krk-espresso", "drinks", 990, 150);
const line = (item: MenuItem): CartItem => ({ menuItem: item, quantity: 1, locationSlug: "krakow" });
function order(id: string, phone: string, items: CartItem[]): Order {
  return {
    id,
    locationSlug: "krakow",
    items,
    totalAmount: items.reduce((s, ci) => s + ci.menuItem.price, 0),
    status: "completed",
    customerName: phone,
    customerPhone: phone,
    fulfillmentType: "takeout",
    slotId: "s1",
    slotDate: "2026-05-10",
    slotTime: "12:00",
    createdAt: "2026-05-10T12:00:00",
  } as Order;
}

test("mlUpsellBucket is deterministic and in range", () => {
  const a = mlUpsellBucket("+48500100200", "krakow");
  const b = mlUpsellBucket("+48500100200", "krakow");
  assert.equal(a, b);
  assert.ok(a >= 0 && a < 100);
  // Salted by location — same phone, different truck → independent bucket.
  const waw = mlUpsellBucket("+48500100200", "warszawa");
  assert.ok(waw >= 0 && waw < 100);
});

test("inMlArm respects rollout bounds", () => {
  assert.equal(inMlArm("+48500100200", "krakow", 0), false, "0% = nobody");
  assert.equal(inMlArm("+48500100200", "krakow", 100), true, "100% = everybody");
});

test("inMlArm partitions a population roughly proportional to the rollout", () => {
  let inArm = 0;
  const N = 2000;
  for (let i = 0; i < N; i++) {
    if (inMlArm(`+4850${String(100000 + i)}`, "krakow", 50)) inArm += 1;
  }
  const share = inArm / N;
  assert.ok(share > 0.4 && share < 0.6, `~50% expected, got ${(share * 100).toFixed(1)}%`);
});

test("compareUpsellArms attributes orders by arm and measures attach lift", () => {
  // ML arm attaches espresso every time; rules arm never does.
  const orders: Order[] = [];
  for (let i = 0; i < 600; i++) {
    const phone = `+4850${String(200000 + i)}`;
    const ml = inMlArm(phone, "krakow", 50);
    orders.push(order(`o${i}`, phone, ml ? [line(pizza), line(espresso)] : [line(pizza)]));
  }
  const cmp = compareUpsellArms(orders, {
    locationSlug: "krakow",
    rolloutPct: 50,
    windowSinceIso: "2026-01-01T00:00:00Z",
  });
  assert.ok(cmp.ml.orders > 0 && cmp.rules.orders > 0, "both arms populated");
  assert.equal(cmp.ml.attachRate, 1);
  assert.equal(cmp.rules.attachRate, 0);
  assert.ok(cmp.attach.relativeLift > 0, "ML arm shows positive attach lift");
  assert.equal(cmp.attach.direction, "up");
});

test("compareUpsellArms ignores orders without an anchor or phone", () => {
  const orders: Order[] = [
    order("a", "+48500300001", [line(espresso)]), // no anchor → ignored
    order("b", "", [line(pizza), line(espresso)]), // no phone → ignored
    order("c", "+48500300003", [line(pizza)]), // counted
  ];
  const cmp = compareUpsellArms(orders, {
    locationSlug: "krakow",
    rolloutPct: 100,
    windowSinceIso: "2026-01-01T00:00:00Z",
  });
  assert.equal(cmp.ml.orders + cmp.rules.orders, 1, "only the anchor order with a phone counts");
});
