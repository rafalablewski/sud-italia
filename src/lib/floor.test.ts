import { test } from "node:test";
import assert from "node:assert/strict";
import { timeToMinutes, windowsOverlap, findReservationConflicts, serviceWindowForDate, serviceWindowViolation, durationBeforeClose, minutesToTime } from "./floor";
import type { Reservation } from "@/data/types";

// Run with:  npx tsx --test src/lib/floor.test.ts

const HOURS = [{ day: "Mon-Sun", open: "12:00", close: "23:00" }];
const MON = "2026-07-06"; // a Monday

test("serviceWindowForDate: resolves open/close/last-seating from hours", () => {
  const w = serviceWindowForDate(HOURS, MON);
  assert.equal(w.openMin, 12 * 60);
  assert.equal(w.closeMin, 23 * 60);
  assert.equal(w.lastSeatingMin, 22 * 60 + 30); // close − 30
});

test("serviceWindowForDate: falls back to 12:00–23:00 for missing/invalid hours or a non-date", () => {
  for (const w of [serviceWindowForDate(undefined, MON), serviceWindowForDate(HOURS, ""), serviceWindowForDate([{ day: "Sun", open: "18:00", close: "02:00" }], MON)]) {
    assert.equal(w.openMin, 12 * 60);
    assert.equal(w.closeMin, 23 * 60);
    assert.equal(w.lastSeatingMin, 22 * 60 + 30);
  }
});

test("serviceWindowViolation: open + last-seating are inclusive edges", () => {
  const { openMin, lastSeatingMin } = serviceWindowForDate(HOURS, MON);
  assert.equal(serviceWindowViolation(8 * 60 + 30, openMin, lastSeatingMin), "before_open"); // 08:30
  assert.equal(serviceWindowViolation(12 * 60, openMin, lastSeatingMin), null); // 12:00 open — legal
  assert.equal(serviceWindowViolation(22 * 60 + 30, openMin, lastSeatingMin), null); // 22:30 last seating — legal
  assert.equal(serviceWindowViolation(22 * 60 + 45, openMin, lastSeatingMin), "after_last_seating"); // 22:45
});

test("durationBeforeClose: caps a late seating to the time left, floored at 0", () => {
  assert.equal(durationBeforeClose(22 * 60 + 30, 90, 23 * 60), 30); // 22:30 + 90 → 30 (last-order table)
  assert.equal(durationBeforeClose(20 * 60, 90, 23 * 60), 90); // ample runway, untouched
  assert.equal(durationBeforeClose(23 * 60 + 30, 90, 23 * 60), 0); // past close → 0, never negative
});

test("minutesToTime: inverse of timeToMinutes, zero-padded", () => {
  assert.equal(minutesToTime(0), "00:00");
  assert.equal(minutesToTime(12 * 60), "12:00");
  assert.equal(minutesToTime(22 * 60 + 30), "22:30");
  assert.equal(timeToMinutes(minutesToTime(1350)), 1350);
});

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

test("a table needs a 15-min turnaround gap between bookings", () => {
  const existing = [res({ id: "a", tableId: "t1", time: "18:00", durationMin: 90 })]; // ends 19:30
  // Back-to-back (starts exactly when the last ends) leaves no cleanup → clash.
  assert.equal(
    findReservationConflicts(existing, {
      id: "b", locationSlug: "krakow", tableId: "t1", date: "2026-05-26", time: "19:30", durationMin: 90,
    }).length,
    1,
    "0-min gap clashes (no time to clean)",
  );
  // A 15-min gap (19:45) clears the turnaround → fine.
  assert.equal(
    findReservationConflicts(existing, {
      id: "b", locationSlug: "krakow", tableId: "t1", date: "2026-05-26", time: "19:45", durationMin: 90,
    }).length,
    0,
    "15-min gap is enough",
  );
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
