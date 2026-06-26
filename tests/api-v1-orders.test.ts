import { test } from "node:test";
import assert from "node:assert/strict";
import { toOrderDTO } from "@/lib/api/v1/order-dto";
import { scopeAllows, scopedLocations } from "@/lib/api/v1/guard";
import type { Order, MenuItem, CartItem } from "@/data/types";

// Run with:  npx tsx --test tests/api-v1-orders.test.ts
//
// Locks the operator order wire-shape + location-scope gate the OttavianoKDS app
// depends on. Pure (no store/network).

function menuItem(over: Partial<MenuItem> = {}): MenuItem {
  return {
    id: "pizza-margherita",
    name: "Margherita",
    description: "",
    price: 2790,
    cost: 900,
    category: "pizza",
    tags: [],
    available: true,
    ...over,
  } as MenuItem;
}

function line(over: Partial<CartItem> = {}): CartItem {
  return { menuItem: menuItem(), quantity: 1, locationSlug: "krakow", ...over };
}

function order(over: Partial<Order> = {}): Order {
  return {
    id: "ord_1",
    locationSlug: "krakow",
    items: [line()],
    totalAmount: 2790,
    status: "preparing",
    customerName: "Ada",
    customerPhone: "+48500100200",
    fulfillmentType: "takeout",
    slotId: "s1",
    slotDate: "2026-06-26",
    slotTime: "18:00",
    createdAt: "2026-06-26T16:00:00.000Z",
    ...over,
  } as Order;
}

test("maps core fields + defaults channel to web", () => {
  const dto = toOrderDTO(order());
  assert.equal(dto.id, "ord_1");
  assert.equal(dto.status, "preparing");
  assert.equal(dto.channel, "web"); // unset → "web"
  assert.equal(dto.totalAmount, 2790);
  assert.equal(dto.items.length, 1);
  assert.equal(dto.items[0].name, "Margherita");
  assert.equal(dto.items[0].unitPrice, 2790);
});

test("maps line notes + modifiers, nulls absent optionals", () => {
  const dto = toOrderDTO(
    order({
      items: [
        line({
          quantity: 2,
          notes: "no basil",
          selectedModifiers: [{ groupId: "size", optionId: "large" }],
        }),
      ],
    }),
  );
  const l = dto.items[0];
  assert.equal(l.quantity, 2);
  assert.equal(l.notes, "no basil");
  assert.deepEqual(l.modifiers, [{ groupId: "size", optionId: "large" }]);
  // Order-level optionals absent → null, not undefined (stable JSON shape).
  assert.equal(dto.tipAmount, null);
  assert.equal(dto.tableId, null);
  assert.equal(dto.estimatedReadyAt, null);
});

test("does not leak operator-internal fields (cost, stripe)", () => {
  const dto = toOrderDTO(order()) as unknown as Record<string, unknown>;
  assert.equal("cost" in dto, false);
  assert.equal("stripeSessionId" in dto, false);
  // line carries no `cost` either
  assert.equal("cost" in (dto.items as Record<string, unknown>[])[0], false);
});

test("scopeAllows: wildcard passes everything", () => {
  assert.equal(scopeAllows("*", "krakow"), true);
  assert.equal(scopeAllows("*", "anything"), true);
});

test("scopeAllows: explicit list gates by membership", () => {
  assert.equal(scopeAllows("krakow,warszawa", "krakow"), true);
  assert.equal(scopeAllows("krakow", "warszawa"), false);
  assert.equal(scopeAllows("krakow", "krakow"), true);
});

test("scopedLocations: null for wildcard, list otherwise", () => {
  assert.equal(scopedLocations("*"), null);
  assert.deepEqual(scopedLocations("krakow, warszawa"), ["krakow", "warszawa"]);
  assert.deepEqual(scopedLocations(""), []);
});
