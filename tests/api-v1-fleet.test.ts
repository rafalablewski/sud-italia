import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFleetTile, buildFleetBoard } from "@/lib/api/v1/fleet-dto";
import { FleetBoardSchema } from "@/lib/api/v1/schemas";
import type { Order, MenuItem, CartItem } from "@/data/types";

// Run with:  npx tsx --test tests/api-v1-fleet.test.ts
//
// Locks the owner fleet (Atlas) wire-shape the OttavianoKDS Fleet view depends
// on. Pure mappers (no store/network) — the route does the I/O.

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
    prepTimeMinutes: 8,
    ...over,
  } as MenuItem;
}
function line(over: Partial<CartItem> = {}): CartItem {
  return { menuItem: menuItem(), quantity: 1, locationSlug: "krakow", ...over } as CartItem;
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

const NOW = Date.parse("2026-06-26T16:05:00.000Z");
const HOUR_AGO = NOW - 60 * 60 * 1000;

test("buildFleetTile: counts active, scores health, previews enriched tickets", () => {
  const tile = buildFleetTile({
    slug: "krakow",
    name: "Kraków",
    orders: [
      order({ id: "a", status: "preparing", estimatedReadyAt: "2026-06-26T16:20:00.000Z" }),
      order({ id: "b", status: "ready" }),
      // Completed within the hour → counts toward throughput / covers / revenue.
      order({ id: "c", status: "completed", partySize: 3, totalAmount: 5000, createdAt: "2026-06-26T15:40:00.000Z" }),
    ],
    hourAgoMs: HOUR_AGO,
    promiseAccuracy: 92,
    onShift: 4,
    nowMs: NOW,
  });
  assert.equal(tile.slug, "krakow");
  assert.equal(tile.counts.active, 1); // only the working (non-ready) preparing ticket
  assert.equal(tile.counts.ready, 1);
  assert.equal(tile.throughputHr, 1);
  assert.equal(tile.coversHr, 3);
  assert.equal(tile.revenueHr, 5000);
  assert.equal(tile.onShift, 4);
  assert.ok(tile.health >= 0 && tile.health <= 100);
  assert.ok(["good", "warn", "risk", "alert"].includes(tile.healthClass));
  // Tickets are the enriched OrderDTO — the active ones carry a prediction.
  const a = tile.tickets.find((t) => t.id === "a")!;
  assert.ok(a, "active ticket present in preview");
  assert.ok(a.prediction, "active ticket carries a prediction");
  assert.equal(a.shortId, a.shortId.toUpperCase());
});

test("buildFleetBoard: totals + throughput-weighted benchmark + leader/gap", () => {
  const krk = buildFleetTile({ slug: "krakow", name: "Kraków", orders: [order({ id: "k", status: "ready" })], hourAgoMs: HOUR_AGO, promiseAccuracy: 95, onShift: 3, nowMs: NOW });
  const waw = buildFleetTile({ slug: "warszawa", name: "Warszawa", orders: [order({ id: "w", locationSlug: "warszawa", status: "preparing" })], hourAgoMs: HOUR_AGO, promiseAccuracy: 80, onShift: 2, nowMs: NOW });
  const board = buildFleetBoard([krk, waw], "2026-06-26T16:05:00.000Z");
  assert.equal(board.totals.ready, 1);
  assert.equal(board.totals.active, 1);
  assert.equal(board.benchmark.leader, "Kraków"); // higher promise accuracy
  assert.equal(board.benchmark.gap, 15); // 95 − 80
  assert.ok(board.benchmark.fleetAccuracy >= 80 && board.benchmark.fleetAccuracy <= 95);
  assert.equal(board.paceWindowMin > 0, true);
  // Output validates against the published contract.
  const parsed = FleetBoardSchema.safeParse(board);
  assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error?.issues));
});

test("buildFleetBoard: empty fleet falls back to the promise target, no leader", () => {
  const board = buildFleetBoard([], "2026-06-26T16:05:00.000Z");
  assert.equal(board.tiles.length, 0);
  assert.equal(board.benchmark.leader, null);
  assert.equal(board.benchmark.gap, 0);
  assert.equal(board.totals.active, 0);
  assert.ok(board.benchmark.fleetAccuracy > 0);
});
