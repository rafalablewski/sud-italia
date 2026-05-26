import { test } from "node:test";
import assert from "node:assert/strict";
import { timeToMinutes, windowsOverlap, findReservationConflicts } from "./floor";
import type { Reservation } from "@/data/types";

// Run with:  npx tsx --test src/lib/floor.test.ts

test("timeToMinutes parses HH:MM and rejects junk", () => {
  assert.equal(timeToMinutes("00:00"), 0);
  assert.equal(timeToMinutes("12:30"), 750);
  assert.equal(timeToMinutes("23:59"), 1439);
  assert.ok(Number.isNaN(timeToMinutes("24:00")));
  assert.ok(Number.isNaN(timeToMinutes("9:99")));
  assert.ok(Number.isNaN(timeToMinutes("nope")));
});

test("windowsOverlap: overlap yes, touching edges no", () => {
  assert.equal(windowsOverlap(720, 90, 750, 90), true); // 12:00–13:30 vs 12:30–14:00
  assert.equal(windowsOverlap(720, 90, 810, 90), false); // 12:00–13:30 vs 13:30–15:00 (touch)
  assert.equal(windowsOverlap(720, 90, 900, 60), false); // far apart
});

function res(p: Partial<Reservation>): Reservation {
  return {
    id: p.id ?? "r" + Math.random().toString(36).slice(2, 6),
    locationSlug: p.locationSlug ?? "krakow",
    customerName: p.customerName ?? "Guest",
    partySize: p.partySize ?? 2,
    date: p.date ?? "2026-05-26",
    time: p.time ?? "19:00",
    durationMin: p.durationMin ?? 90,
    tableId: p.tableId,
    status: p.status ?? "booked",
    notes: p.notes,
    createdAt: "2026-05-26T00:00:00.000Z",
  };
}

test("double-booking the same table+window is a conflict", () => {
  const existing = [res({ id: "a", tableId: "t1", time: "19:00", durationMin: 90 })];
  const clash = findReservationConflicts(existing, {
    id: "b", locationSlug: "krakow", tableId: "t1", date: "2026-05-26", time: "20:00", durationMin: 90,
  });
  assert.equal(clash.length, 1);
  assert.equal(clash[0].id, "a");
});

test("non-overlapping times on one table are fine", () => {
  const existing = [res({ id: "a", tableId: "t1", time: "18:00", durationMin: 90 })]; // ends 19:30
  const ok = findReservationConflicts(existing, {
    id: "b", locationSlug: "krakow", tableId: "t1", date: "2026-05-26", time: "19:30", durationMin: 90,
  });
  assert.equal(ok.length, 0);
});

test("different table, different date, cancelled, and self are not conflicts", () => {
  const cand = { id: "b", locationSlug: "krakow", tableId: "t1", date: "2026-05-26", time: "19:00", durationMin: 90 };
  assert.equal(findReservationConflicts([res({ id: "a", tableId: "t2", time: "19:00" })], cand).length, 0, "other table");
  assert.equal(findReservationConflicts([res({ id: "a", tableId: "t1", date: "2026-05-27", time: "19:00" })], cand).length, 0, "other day");
  assert.equal(findReservationConflicts([res({ id: "a", tableId: "t1", time: "19:00", status: "cancelled" })], cand).length, 0, "cancelled frees table");
  assert.equal(findReservationConflicts([res({ id: "b", tableId: "t1", time: "19:00" })], cand).length, 0, "self (same id)");
});

test("unassigned booking (no table) never clashes", () => {
  const existing = [res({ id: "a", tableId: "t1", time: "19:00" })];
  const ok = findReservationConflicts(existing, {
    id: "b", locationSlug: "krakow", tableId: undefined, date: "2026-05-26", time: "19:00", durationMin: 90,
  });
  assert.equal(ok.length, 0);
});
