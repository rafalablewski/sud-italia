import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDemandBoard,
  demonstratedCoversPerHour,
  type DemandOrderInput,
  type DemandSlotInput,
} from "./demand-exchange";

// Run with:  npx tsx --test src/lib/demand-exchange.test.ts

const FRIDAYS = ["2025-05-02", "2025-05-09", "2025-05-16", "2025-05-23"]; // 4 past Fridays
const TARGET = "2025-06-06"; // also a Friday

function ordersAt(time: string, perFriday: number): DemandOrderInput[] {
  const out: DemandOrderInput[] = [];
  for (const d of FRIDAYS) {
    for (let i = 0; i < perFriday; i++) out.push({ slotDate: d, slotTime: time, status: "completed" });
  }
  return out;
}

function slot(p: Partial<DemandSlotInput> & { time: string; maxOrders: number }): DemandSlotInput {
  return {
    id: `s_${p.time}`,
    date: TARGET,
    time: p.time,
    maxOrders: p.maxOrders,
    currentOrders: p.currentOrders ?? 0,
    fulfillmentTypes: p.fulfillmentTypes ?? ["takeout"],
    status: p.status ?? "active",
  };
}

test("weekday + interval inference", () => {
  const board = buildDemandBoard({
    date: TARGET,
    slots: [slot({ time: "17:30", maxOrders: 5 }), slot({ time: "18:00", maxOrders: 5 }), slot({ time: "18:30", maxOrders: 5 })],
    orders: [],
  });
  assert.equal(board.weekday, 5); // Friday
  assert.equal(board.intervalMin, 30);
});

test("predicts demand from same-weekday history; over → raise, under → trim", () => {
  const orders = [...ordersAt("18:00", 5), ...ordersAt("12:00", 1)];
  const board = buildDemandBoard({
    date: TARGET,
    slots: [slot({ time: "12:00", maxOrders: 10 }), slot({ time: "18:00", maxOrders: 4, currentOrders: 2 })],
    orders,
    kitchenCoversPerHour: null,
  });
  const dinner = board.slots.find((s) => s.time === "18:00")!;
  const lunch = board.slots.find((s) => s.time === "12:00")!;

  assert.equal(dinner.predictedDemand, 5); // (5×4)/4 Fridays
  assert.equal(dinner.tier, "over");
  assert.equal(dinner.action, "raise");
  assert.equal(dinner.recommendedMaxOrders, 6); // ceil(5×1.1)

  assert.equal(lunch.predictedDemand, 1);
  assert.equal(lunch.tier, "under");
  assert.equal(lunch.action, "trim");

  assert.equal(board.summary.overCount, 1);
  assert.equal(board.summary.underCount, 1);
});

test("booked-so-far is a floor — demand never dips below current bookings", () => {
  const board = buildDemandBoard({
    date: TARGET,
    slots: [slot({ time: "18:00", maxOrders: 10, currentOrders: 7 })],
    orders: ordersAt("18:00", 2), // history says ~2
  });
  assert.equal(board.slots[0].predictedDemand, 7); // floor wins
});

test("kitchen-capped: demand above the throughput ceiling → protect", () => {
  const board = buildDemandBoard({
    date: TARGET,
    slots: [
      slot({ time: "17:30", maxOrders: 10 }),
      slot({ time: "18:00", maxOrders: 10 }),
      slot({ time: "18:30", maxOrders: 10 }),
      slot({ time: "19:00", maxOrders: 10 }),
    ],
    orders: ordersAt("18:00", 5), // predicted 5 at 18:00
    kitchenCoversPerHour: 8, // 8/hr × 30min = 4 per slot
  });
  const dinner = board.slots.find((s) => s.time === "18:00")!;
  assert.equal(dinner.throughputCapacity, 4);
  assert.equal(dinner.tier, "kitchen-capped");
  assert.equal(dinner.action, "protect");
  assert.equal(dinner.recommendedMaxOrders, 4); // capped at the kitchen ceiling
  assert.equal(board.summary.kitchenCappedCount, 1);
});

test("rejected-demand signals surface as missed demand", () => {
  const board = buildDemandBoard({
    date: TARGET,
    slots: [slot({ time: "18:00", maxOrders: 4 })],
    orders: ordersAt("18:00", 5),
    signals: [
      { date: TARGET, time: "18:00" },
      { date: TARGET, time: "18:00" },
      { date: TARGET, time: "18:00" },
      { date: "2025-06-05", time: "18:00" }, // other date — ignored
    ],
  });
  assert.equal(board.slots[0].missedDemand, 3);
  assert.equal(board.summary.missedDemand, 3);
  assert.match(board.slots[0].note, /walked/);
});

test("pending / cancelled / simulated orders are not counted as demand", () => {
  const orders: DemandOrderInput[] = [
    { slotDate: "2025-05-02", slotTime: "18:00", status: "pending" },
    { slotDate: "2025-05-09", slotTime: "18:00", status: "cancelled" },
    { slotDate: "2025-05-16", slotTime: "18:00", status: "completed", simulated: true },
  ];
  const board = buildDemandBoard({
    date: TARGET,
    slots: [slot({ time: "18:00", maxOrders: 4 })],
    orders,
  });
  assert.equal(board.slots[0].predictedDemand, 0); // no counted history
});

test("kitchen-capped slots get a min-spend recommendation sized from AOV", () => {
  // 4 Fridays × 5 covers at 18:00, each a 6000 grosze (60 zł) ticket → AOV 60 zł.
  const orders: DemandOrderInput[] = [];
  for (const d of FRIDAYS) for (let i = 0; i < 5; i++) {
    orders.push({ slotDate: d, slotTime: "18:00", status: "completed", totalAmount: 6000 });
  }
  const board = buildDemandBoard({
    date: TARGET,
    slots: [
      slot({ time: "17:30", maxOrders: 10 }),
      slot({ time: "18:00", maxOrders: 10 }),
      slot({ time: "18:30", maxOrders: 10 }),
      slot({ time: "19:00", maxOrders: 10 }),
    ],
    orders,
    kitchenCoversPerHour: 8, // ceiling 4/slot → 18:00 (demand 5) is kitchen-capped
  });
  const dinner = board.slots.find((s) => s.time === "18:00")!;
  assert.equal(dinner.tier, "kitchen-capped");
  // AOV 6000 × 1.5 = 9000 → 90 zł min-spend.
  assert.equal(dinner.recommendedMinSpendGrosze, 9000);
  // non-capped slots carry no min-spend recommendation.
  const lunch = board.slots.find((s) => s.time === "17:30")!;
  assert.equal(lunch.recommendedMinSpendGrosze, 0);
});

test("recommendation never drops below already-booked orders", () => {
  // currentOrders 6 but kitchen ceiling is only 4 → can't un-sell; recommend 6.
  const board = buildDemandBoard({
    date: TARGET,
    slots: [
      slot({ time: "17:30", maxOrders: 10 }),
      slot({ time: "18:00", maxOrders: 10, currentOrders: 6 }),
      slot({ time: "18:30", maxOrders: 10 }),
      slot({ time: "19:00", maxOrders: 10 }),
    ],
    orders: ordersAt("18:00", 5),
    kitchenCoversPerHour: 8, // ceiling 4 per slot
  });
  const dinner = board.slots.find((s) => s.time === "18:00")!;
  assert.equal(dinner.tier, "kitchen-capped");
  assert.equal(dinner.recommendedMaxOrders, 6); // floored at booked, not the 4 ceiling
});

test("demonstratedCoversPerHour returns the sustained peak, null when thin", () => {
  assert.equal(demonstratedCoversPerHour([1, 2, 3]), null); // below minSamples
  // 6 hours × 5 covers each → sustained 5/hr
  const instants: number[] = [];
  for (let h = 0; h < 6; h++) for (let i = 0; i < 5; i++) instants.push(h * 3_600_000 + i * 1000);
  assert.equal(demonstratedCoversPerHour(instants), 5);
});
