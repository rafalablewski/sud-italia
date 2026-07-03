import { test } from "node:test";
import assert from "node:assert/strict";
import type { Order } from "@/data/types";
import { buildKdsTicket } from "./kds-ticket";

/** Minimal dine-in order with a couple of lines. */
function order(extra: Partial<Order> = {}): Order {
  return {
    id: "pos-abc123",
    locationSlug: "krakow",
    customerName: "Kowalski",
    customerPhone: "",
    status: "preparing",
    fulfillmentType: "dine-in",
    slotId: "s",
    slotDate: "2026-07-07",
    slotTime: "19:00",
    totalAmount: 8000,
    createdAt: "2026-07-07T17:00:00Z",
    items: [
      { menuItem: { id: "m1", name: "Margherita", category: "pizza", allergens: [] }, quantity: 2 },
      { menuItem: { id: "m2", name: "Diavola", category: "pizza", allergens: [] }, quantity: 1 },
    ],
    ...extra,
  } as unknown as Order;
}

test("buildKdsTicket carries voided (cancelled-after-firing) items to the render shape", () => {
  const t = buildKdsTicket(
    order({ voidedItems: [{ name: "Margherita", quantity: 1, reason: "86 / out", at: "2026-07-07T19:05:00Z" }] }),
    undefined,
    Date.parse("2026-07-07T19:05:00Z"),
  );
  assert.equal(t.voided?.length, 1);
  assert.equal(t.voided![0].name, "Margherita");
  assert.equal(t.voided![0].quantity, 1);
  assert.equal(t.voided![0].reason, "86 / out");
});

test("buildKdsTicket has no voided block on a clean order", () => {
  const t = buildKdsTicket(order(), undefined, 0);
  assert.equal(t.voided, undefined);
});
