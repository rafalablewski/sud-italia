import { test } from "node:test";
import assert from "node:assert/strict";
import { dineInGridTimes, dineInSlotId } from "@/lib/store";

// 2026-07-06 is a Monday; 2026-07-11 is a Saturday; 2026-07-12 is a Sunday.
const MON = "2026-07-06";
const SAT = "2026-07-11";
const SUN = "2026-07-12";

const KRK_HOURS = [
  { day: "Mon-Thu", open: "11:00", close: "21:00" },
  { day: "Fri-Sat", open: "11:00", close: "23:00" },
  { day: "Sun", open: "12:00", close: "20:00" },
];

test("dineInGridTimes: 30-min windows from open to last seating (Mon-Thu)", () => {
  const t = dineInGridTimes(KRK_HOURS, MON);
  // 11:00 → last seating 20:30 (30 min before 21:00 close), every 30 min.
  assert.equal(t[0], "11:00");
  assert.equal(t[t.length - 1], "20:30");
  assert.equal(t.length, 20);
  // Strictly 30-minute separation, no gaps or dupes.
  for (let i = 1; i < t.length; i++) {
    const a = Number(t[i - 1].slice(0, 2)) * 60 + Number(t[i - 1].slice(3));
    const b = Number(t[i].slice(0, 2)) * 60 + Number(t[i].slice(3));
    assert.equal(b - a, 30);
  }
});

test("dineInGridTimes: weekday range resolution picks the right window", () => {
  // Saturday falls in "Fri-Sat" → 11:00–23:00, last seating 22:30.
  assert.equal(dineInGridTimes(KRK_HOURS, SAT).at(-1), "22:30");
  // Sunday is its own entry → 12:00–20:00, last seating 19:30.
  const sun = dineInGridTimes(KRK_HOURS, SUN);
  assert.equal(sun[0], "12:00");
  assert.equal(sun.at(-1), "19:30");
});

test("dineInGridTimes: falls back to 12:00–23:00 when hours are missing", () => {
  const t = dineInGridTimes(undefined, MON);
  assert.equal(t[0], "12:00");
  assert.equal(t.at(-1), "22:30");
});

test("dineInSlotId: deterministic + collision-free per window", () => {
  assert.equal(dineInSlotId("krakow", MON, "18:30"), "dine-krakow-2026-07-06-1830");
  assert.equal(dineInSlotId("krakow", MON, "18:30"), dineInSlotId("krakow", MON, "18:30"));
  assert.notEqual(dineInSlotId("krakow", MON, "18:30"), dineInSlotId("krakow", MON, "19:00"));
});
