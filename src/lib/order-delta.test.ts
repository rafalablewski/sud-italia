import { test } from "node:test";
import assert from "node:assert/strict";
import { diffOrders } from "./order-delta";
import type { Order } from "@/data/types";

// Run with:  npx tsx --test src/lib/order-delta.test.ts
//
// Pins the wire diff behind /api/admin/orders/stream?delta=1: a snapshot's
// worth of orders diffed against the previous frame's signatures yields only
// the rows that changed + the ids that vanished, so the board re-renders the
// minimum. See docs/strategy/core-v2-local-first.md.

const order = (id: string, status: Order["status"], createdAt = "2026-06-09T12:00:00Z"): Order =>
  ({ id, locationSlug: "krakow", status, totalAmount: 1000, createdAt }) as Order;

test("first diff against an empty index reports every order as changed", () => {
  const { changed, removed, nextSig } = diffOrders(new Map(), [
    order("a", "confirmed"),
    order("b", "preparing"),
  ]);
  assert.deepEqual(changed.map((o) => o.id), ["a", "b"]);
  assert.deepEqual(removed, []);
  assert.equal(nextSig.size, 2);
});

test("an unchanged read produces no changed rows and no removals", () => {
  const orders = [order("a", "confirmed"), order("b", "preparing")];
  const first = diffOrders(new Map(), orders);
  const second = diffOrders(first.nextSig, orders);
  assert.deepEqual(second.changed, []);
  assert.deepEqual(second.removed, []);
});

test("only the bumped row is reported as changed", () => {
  const first = diffOrders(new Map(), [order("a", "confirmed"), order("b", "preparing")]);
  const second = diffOrders(first.nextSig, [
    order("a", "ready"), // bumped
    order("b", "preparing"), // untouched
  ]);
  assert.deepEqual(second.changed.map((o) => o.id), ["a"]);
  assert.equal(second.changed[0].status, "ready");
  assert.deepEqual(second.removed, []);
});

test("an order that drops out of the read is reported as removed", () => {
  const first = diffOrders(new Map(), [order("a", "confirmed"), order("b", "preparing")]);
  const second = diffOrders(first.nextSig, [order("a", "confirmed")]);
  assert.deepEqual(second.changed, []);
  assert.deepEqual(second.removed, ["b"]);
  assert.equal(second.nextSig.has("b"), false);
});

test("a new order plus a removal in the same frame are both captured", () => {
  const first = diffOrders(new Map(), [order("a", "confirmed")]);
  const second = diffOrders(first.nextSig, [order("c", "confirmed")]);
  assert.deepEqual(second.changed.map((o) => o.id), ["c"]);
  assert.deepEqual(second.removed, ["a"]);
});
