import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  getTables,
  saveTable,
  deleteTable,
  getReservations,
  saveReservation,
  deleteReservation,
  getFloorEvents,
  recordFloorEvent,
} from "./store";

// Run with:  npx tsx --test src/lib/floor-store.test.ts
//
// Phase 3 (m3) — the floor data layer (tables / events / reservations) split off
// the single global blobs onto per-location keys via makePerLocationBlob. These
// run against the real FS store with a unique throwaway location slug per test,
// so they never touch seeded data or collide with each other.

test("tables: per-location CRUD round-trips and stays scoped", async () => {
  const loc = `test-floor-${randomUUID().slice(0, 8)}`;
  const other = `test-floor-${randomUUID().slice(0, 8)}`;

  const t = await saveTable({ locationSlug: loc, number: "12", seats: 4, zone: "Patio", status: "available" });
  assert.ok(t.id);

  const list = await getTables(loc);
  assert.deepEqual(list.map((x) => x.id), [t.id]);
  assert.deepEqual(await getTables(other), []); // another truck never sees it

  assert.equal(await deleteTable(t.id, loc), true);
  assert.deepEqual(await getTables(loc), []);
  assert.equal(await deleteTable(t.id, loc), false); // already gone
});

test("tables: a status transition logs a per-location floor event", async () => {
  const loc = `test-floor-${randomUUID().slice(0, 8)}`;
  const t = await saveTable({ locationSlug: loc, number: "1", seats: 2, status: "available" });
  // First save had no prior status → no event. Re-saving with a new status logs one.
  await saveTable({ ...t, status: "seated" });
  // recordFloorEvent is fire-and-forget inside saveTable; give the microtask a tick.
  await new Promise((r) => setTimeout(r, 20));

  const events = await getFloorEvents(loc);
  assert.equal(events.length, 1);
  assert.equal(events[0].from, "available");
  assert.equal(events[0].to, "seated");
  assert.equal(events[0].tableId, t.id);
  // Scoped: another location sees none of them.
  assert.deepEqual(await getFloorEvents(`test-floor-${randomUUID().slice(0, 8)}`), []);

  await deleteTable(t.id, loc);
});

test("floor events: record + since-window filter, per location", async () => {
  const loc = `test-floor-${randomUUID().slice(0, 8)}`;
  const t0 = "2026-01-01T00:00:00.000Z";
  const t1 = "2026-06-01T00:00:00.000Z";
  await recordFloorEvent({ id: `e-${randomUUID()}`, locationSlug: loc, tableId: "x", from: "available", to: "seated", at: t0 });
  await recordFloorEvent({ id: `e-${randomUUID()}`, locationSlug: loc, tableId: "x", from: "seated", to: "available", at: t1 });

  assert.equal((await getFloorEvents(loc)).length, 2);
  // since filter keeps only the recent one.
  const recent = await getFloorEvents(loc, "2026-03-01T00:00:00.000Z");
  assert.equal(recent.length, 1);
  assert.equal(recent[0].at, t1);
});

test("reservations: per-location CRUD with date filter", async () => {
  const loc = `test-floor-${randomUUID().slice(0, 8)}`;
  const r = await saveReservation({
    locationSlug: loc,
    customerName: "Ada",
    partySize: 2,
    date: "2026-06-20",
    time: "19:00",
    durationMin: 90,
    status: "booked",
  });
  assert.ok(r.id);

  assert.deepEqual((await getReservations(loc)).map((x) => x.id), [r.id]);
  assert.deepEqual((await getReservations(loc, "2026-06-20")).map((x) => x.id), [r.id]);
  assert.deepEqual(await getReservations(loc, "2026-06-21"), []); // wrong day
  assert.deepEqual(await getReservations(`test-floor-${randomUUID().slice(0, 8)}`), []); // wrong loc

  assert.equal(await deleteReservation(r.id, loc), true);
  assert.deepEqual(await getReservations(loc), []);
});
