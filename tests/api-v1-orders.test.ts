import { test } from "node:test";
import assert from "node:assert/strict";
import { toOrderDTO, toOrderDTOs } from "@/lib/api/v1/order-dto";
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

test("exposes paidAt + channel — the fields settle + the Orders filter read", () => {
  assert.equal(toOrderDTO(order()).paidAt, null); // unpaid → null
  const settled = toOrderDTO(order({ paidAt: "2026-06-26T17:00:00.000Z", channel: "qr" }));
  assert.equal(settled.paidAt, "2026-06-26T17:00:00.000Z");
  assert.equal(settled.channel, "qr");
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
  // Modifiers resolve to cook-readable label + KDS flag; an unknown option (no
  // modifierGroups on the fixture) falls back to the option id, flag false.
  assert.deepEqual(l.modifiers, [{ label: "large", flag: false }]);
  // Order-level optionals absent → null, not undefined (stable JSON shape).
  assert.equal(dto.tipAmount, null);
  assert.equal(dto.tableId, null);
  assert.equal(dto.estimatedReadyAt, null);
});

test("resolves modifier labels + flagOnKds from the menu's modifier groups", () => {
  const withMods = menuItem({
    modifierGroups: [
      {
        id: "cheese",
        label: "Cheese",
        options: [{ id: "bufala", label: "Bufala mozzarella", priceDelta: 600, flagOnKds: true }],
      },
    ],
  } as Partial<MenuItem>);
  const dto = toOrderDTO(
    order({ items: [line({ menuItem: withMods, selectedModifiers: [{ groupId: "cheese", optionId: "bufala" }] })] }),
  );
  assert.deepEqual(dto.items[0].modifiers, [{ label: "Bufala mozzarella", flag: true }]);
});

test("exposes shortId, allergens, simulated + coursing for the KDS card", () => {
  const dto = toOrderDTO(
    order({
      id: "ord_abc123",
      items: [line({ menuItem: menuItem({ allergens: ["gluten", "milk"] } as Partial<MenuItem>) })],
      coursing: { fired: ["starter"], held: ["main"] },
    }),
  );
  assert.equal(dto.shortId, "ABC123"); // last 6, uppercased
  assert.deepEqual(dto.items[0].allergens, ["gluten", "milk"]);
  assert.equal(dto.simulated, false);
  assert.deepEqual(dto.coursing, { fired: ["starter"], held: ["main"] });
  // No board context → no prediction on the single-order mapper.
  assert.equal(dto.prediction, null);
});

test("toOrderDTOs computes a per-location prediction block (SLA / at-risk)", () => {
  const now = Date.parse("2026-06-26T16:05:00.000Z");
  // Promised 16:04 but still preparing at 16:05 — past due, so a prediction exists.
  const dtos = toOrderDTOs(
    [
      order({ id: "k1", locationSlug: "krakow", status: "preparing", createdAt: "2026-06-26T16:00:00.000Z", estimatedReadyAt: "2026-06-26T16:10:00.000Z" }),
      order({ id: "w1", locationSlug: "warszawa", status: "confirmed", createdAt: "2026-06-26T16:04:00.000Z", estimatedReadyAt: "2026-06-26T16:20:00.000Z" }),
    ],
    now,
  );
  const k = dtos.find((d) => d.id === "k1")!;
  assert.ok(k.prediction, "active ticket carries a prediction");
  assert.equal(k.prediction!.promisedReadyAtMs, Date.parse("2026-06-26T16:10:00.000Z"));
  assert.equal(typeof k.prediction!.predSeconds, "number");
  // Each location is analyzed independently — both active tickets are scored.
  assert.ok(dtos.find((d) => d.id === "w1")!.prediction);
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
