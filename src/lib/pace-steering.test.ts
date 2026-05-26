import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeTruck, type TruckAnalysis, type PaceStation } from "./kds-prediction";
import { deriveSteeringPlan } from "./pace-steering";
import type { CartItem, MenuItem, MenuCategory, Order } from "@/data/types";

// Run with:  npx tsx --test src/lib/pace-steering.test.ts

// --- fixtures --------------------------------------------------------------

function item(
  id: string,
  category: MenuCategory,
  price: number,
  cost: number,
  prepTimeMinutes: number,
): MenuItem {
  return {
    id,
    name: id,
    description: "",
    price,
    cost,
    category,
    tags: [],
    available: true,
    prepTimeMinutes,
  };
}

// A small but representative menu: pizzas vary in margin-per-second, plus a
// fast drink + dessert that don't touch the oven.
const MENU: MenuItem[] = [
  item("marg", "pizza", 2790, 820, 5), // best margin/sec on the oven
  item("diavola", "pizza", 3290, 1010, 5),
  item("tartufata", "pizza", 7990, 2390, 9), // high price, slow → worse margin/sec
  item("garlic", "antipasti", 990, 220, 2),
  item("espresso", "drinks", 990, 140, 1),
  item("tiramisu", "desserts", 1800, 520, 1),
];
const BY_ID = new Map(MENU.map((m) => [m.id, m]));

function line(itemId: string, quantity: number): CartItem {
  return { menuItem: BY_ID.get(itemId)!, quantity, locationSlug: "krakow" };
}

let seq = 0;
function order(status: Order["status"], items: CartItem[]): Order {
  seq += 1;
  return {
    id: `o${seq}`,
    locationSlug: "krakow",
    items,
    totalAmount: items.reduce((s, ci) => s + ci.menuItem.price * ci.quantity, 0),
    status,
    customerName: "Test",
    customerPhone: "600000000",
    fulfillmentType: "takeout",
    slotId: "s1",
    slotDate: "2026-05-26",
    slotTime: "12:00",
    createdAt: new Date().toISOString(),
  };
}

// --- integration: analyzeTruck → deriveSteeringPlan ------------------------

test("pre-breach oven: steers mix, keeps drinks make-now, eases worst pizza", () => {
  // ~10 pizza units in flight + a couple drinks. Oven (cap ≈ 3/window) blows
  // past 100% util → "risk"; drinks (cap ≈ 15) stay calm.
  const orders: Order[] = [
    order("preparing", [line("marg", 3), line("diavola", 2)]),
    order("confirmed", [line("tartufata", 2), line("marg", 3)]),
    order("confirmed", [line("espresso", 2), line("tiramisu", 1)]),
  ];
  const analysis = analyzeTruck(orders, Date.now());

  assert.equal(analysis.bottleneck?.id, "pizza", "pizza must be the bottleneck");
  assert.equal(analysis.bottleneck?.tier, "risk", "oven should be in the risk tier");

  const plan = deriveSteeringPlan(analysis, MENU);

  assert.equal(plan.active, true);
  assert.equal(plan.bottleneck?.id, "pizza");

  // make-now never includes the constrained station, and does include the
  // fast off-oven items.
  assert.ok(!plan.makeNow.some((id) => BY_ID.get(id)!.category === "pizza"));
  assert.ok(plan.makeNow.includes("espresso"));
  assert.ok(plan.makeNow.includes("tiramisu"));

  // throttle is a subset of pizzas, eased worst-margin-per-oven-second first:
  // the cheap, fast, high-volume Margherita yields the least per oven-second
  // (1970gr/300s ≈ 6.6) vs the premium Tartufata (5600gr/540s ≈ 10.4), so the
  // line eases the Margherita to free the oven for the higher-yield pizza.
  assert.ok(plan.throttle.every((id) => BY_ID.get(id)!.category === "pizza"));
  assert.equal(plan.throttle[0], "marg", "lowest margin-per-oven-second eased first");

  // delivery intake is capped to whatever the oven can still absorb this window.
  assert.equal(typeof plan.deliveryCapNextWindow, "number");
  assert.ok(plan.deliveryCapNextWindow! >= 0);

  // capacity-true promise: the jammed oven quotes a longer wait than drinks.
  const pizzaWait = plan.promiseSecondsByCategory.pizza ?? 0;
  const drinkWait = plan.promiseSecondsByCategory.drinks ?? 0;
  assert.ok(pizzaWait > drinkWait, "oven promise must exceed the drinks promise");

  assert.ok(plan.reason && plan.reason.includes("capacity"));
});

test("calm line: no steering, but promises still quoted", () => {
  const orders: Order[] = [order("preparing", [line("marg", 1), line("espresso", 1)])];
  const analysis = analyzeTruck(orders, Date.now());

  const plan = deriveSteeringPlan(analysis, MENU);

  assert.equal(plan.active, false);
  assert.deepEqual(plan.makeNow, []);
  assert.deepEqual(plan.throttle, []);
  assert.equal(plan.deliveryCapNextWindow, null);
  assert.equal(plan.reason, null);
  // promises are always computed, even when calm.
  assert.equal(typeof plan.promiseSecondsByCategory.pizza, "number");
});

test("empty line: inactive plan, no throw", () => {
  const analysis = analyzeTruck([], Date.now());
  const plan = deriveSteeringPlan(analysis, MENU);
  assert.equal(plan.active, false);
  assert.equal(plan.bottleneck, null);
});

// --- decision logic in isolation (hand-built analysis) ---------------------

function station(id: MenuCategory, p: Partial<PaceStation>): PaceStation {
  return {
    id,
    currentLoad: 0,
    forecast: 0,
    demand: 0,
    capacity: 0,
    util: 0,
    tier: "calm",
    ...p,
  };
}

test("delivery cap = oven headroom (capacity − currentLoad), floored at 0", () => {
  const hot = station("pizza", { currentLoad: 4, demand: 9, capacity: 3, util: 3, tier: "risk" });
  const analysis: TruckAnalysis = {
    predictions: new Map(),
    stations: [hot],
    bottleneck: hot,
    counts: { active: 0, ready: 0, late: 0, risk: 1, newCount: 0, preparing: 0 },
  };
  const plan = deriveSteeringPlan(analysis, MENU);
  // capacity 3 − load 4 = -1 → floored to 0: stop accepting delivery pizzas.
  assert.equal(plan.deliveryCapNextWindow, 0);
});

test("respects make-now / throttle limits", () => {
  const hot = station("pizza", { currentLoad: 6, demand: 8, capacity: 3, util: 2.6, tier: "risk" });
  const analysis: TruckAnalysis = {
    predictions: new Map(),
    stations: [hot],
    bottleneck: hot,
    counts: { active: 0, ready: 0, late: 0, risk: 1, newCount: 0, preparing: 0 },
  };
  const plan = deriveSteeringPlan(analysis, MENU, { makeNowLimit: 2, throttleLimit: 1 });
  assert.equal(plan.makeNow.length, 2);
  assert.equal(plan.throttle.length, 1);
  assert.equal(plan.throttle[0], "marg"); // worst margin-per-oven-second eased first
});
