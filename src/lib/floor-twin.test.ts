import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFloorTwin,
  recommendSeating,
  type TwinOrderInput,
  type TwinTableInput,
} from "./floor-twin";

// Run with:  npx tsx --test src/lib/floor-twin.test.ts

const NOW = new Date("2025-06-06T19:00:00Z");

function table(p: Partial<TwinTableInput> & { id: string; seats: number }): TwinTableInput {
  return {
    id: p.id,
    number: p.number ?? p.id,
    seats: p.seats,
    zone: p.zone,
    status: p.status ?? "available",
  };
}

/** A completed dine-in turn on `tableId` with a given dwell + spend. */
function completed(tableId: string, dwellMin: number, spend: number): TwinOrderInput {
  const paid = NOW.getTime() - 3 * 3_600_000; // earlier today
  return {
    tableId,
    partySize: 2,
    totalAmount: spend,
    status: "completed",
    createdAt: new Date(paid - dwellMin * 60_000).toISOString(),
    paidAt: new Date(paid).toISOString(),
    fulfillmentType: "dine-in",
  };
}

/** An open check seated `elapsedMin` ago. */
function openCheck(tableId: string, elapsedMin: number, party = 2): TwinOrderInput {
  return {
    tableId,
    partySize: party,
    totalAmount: 5000,
    status: "preparing",
    createdAt: new Date(NOW.getTime() - elapsedMin * 60_000).toISOString(),
    fulfillmentType: "dine-in",
  };
}

test("realized turn-time physics from completed dine-in orders", () => {
  const twin = buildFloorTwin({
    tables: [table({ id: "t1", seats: 2 })],
    orders: [completed("t1", 60, 9000), completed("t1", 80, 11000), completed("t1", 70, 10000)],
    now: NOW,
  });
  const t1 = twin.tables[0];
  assert.equal(t1.turns, 3);
  assert.equal(t1.medianDwellMin, 70);
  assert.equal(t1.avgSpendGrosze, 10000);
  // 100 zł over a 70-min turn ≈ 8571 grosze/hour
  assert.equal(t1.spendVelocityPerHourGrosze, Math.round(10000 / (70 / 60)));
});

test("absurd dwell values are filtered out of the physics", () => {
  const twin = buildFloorTwin({
    tables: [table({ id: "t1", seats: 2 })],
    orders: [
      completed("t1", 70, 10000),
      completed("t1", 2, 10000), // too short
      completed("t1", 600, 10000), // too long
    ],
    now: NOW,
  });
  assert.equal(twin.tables[0].turns, 1);
  assert.equal(twin.tables[0].medianDwellMin, 70);
});

test("live occupancy + predicted free-in from the open check", () => {
  const twin = buildFloorTwin({
    tables: [table({ id: "t1", seats: 4, status: "seated" })],
    // history → median turn 90; seated 60m ago → frees in ~30
    orders: [completed("t1", 90, 12000), completed("t1", 90, 12000), openCheck("t1", 60, 4)],
    now: NOW,
  });
  const t1 = twin.tables[0];
  assert.equal(t1.occupied, true);
  assert.equal(t1.elapsedMin, 60);
  assert.equal(t1.predictedFreeInMin, 30);
  assert.equal(t1.party, 4);
  assert.equal(twin.summary.seated, 1);
  assert.equal(twin.summary.freeingSoon30, 1);
  assert.equal(twin.summary.freeingSoon15, 0);
});

test("summary occupancy ignores out-of-service tables", () => {
  const twin = buildFloorTwin({
    tables: [
      table({ id: "t1", seats: 2, status: "seated" }),
      table({ id: "t2", seats: 2, status: "available" }),
      table({ id: "t3", seats: 2, status: "out-of-service" }),
    ],
    orders: [openCheck("t1", 10)],
    now: NOW,
  });
  assert.equal(twin.summary.totalTables, 2); // t3 excluded
  assert.equal(twin.summary.seated, 1);
  assert.equal(twin.summary.openTables, 1);
  assert.equal(twin.summary.occupancyPct, 50);
});

test("recommendSeating: open best-fit first, then soonest-freeing", () => {
  const twin = buildFloorTwin({
    tables: [
      table({ id: "big", seats: 8, status: "available" }), // open but wasteful for a 2-top
      table({ id: "small", seats: 2, status: "available" }), // open best fit
      table({ id: "occ", seats: 4, status: "seated" }),
      table({ id: "tiny", seats: 1, status: "available" }), // too small
    ],
    orders: [completed("occ", 60, 8000), completed("occ", 60, 8000), openCheck("occ", 50, 4)],
    now: NOW,
  });
  const recs = recommendSeating(twin, 2);
  assert.equal(recs[0].tableId, "small"); // best-fit open
  assert.equal(recs[0].readyInMin, 0);
  assert.equal(recs[1].tableId, "big"); // next open (bigger)
  // occupied 4-top still fits a 2-top and appears after open tables
  assert.ok(recs.some((r) => r.tableId === "occ" && r.readyInMin > 0));
  // the 1-seat table never fits a party of 2
  assert.ok(!recs.some((r) => r.tableId === "tiny"));
});
