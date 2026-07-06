import { test } from "node:test";
import assert from "node:assert/strict";
import { dineInGridTimes, dineInSlotId, isWithinDineInHorizon } from "@/lib/store";

// 2026-07-06 is a Monday; 2026-07-11 is a Saturday; 2026-07-12 is a Sunday.
const MON = "2026-07-06";
const SAT = "2026-07-11";
const SUN = "2026-07-12";

// The active locations open 12:00–21:00 every day (src/data/locations.ts).
const OPEN_HOURS = [{ day: "Mon-Sun", open: "12:00", close: "21:00" }];

test("dineInGridTimes: 15-min windows across the full open window (12:00–21:00)", () => {
  const t = dineInGridTimes(OPEN_HOURS, MON);
  // 12:00 → 21:00 inclusive, every 15 min ((540/15)+1 = 37 windows).
  assert.equal(t[0], "12:00");
  assert.equal(t[t.length - 1], "21:00");
  assert.equal(t.length, 37);
  assert.ok(t.includes("13:45"), "offers the :45 window a 90-min turn frees");
  // Strictly 15-minute separation, no gaps or dupes.
  for (let i = 1; i < t.length; i++) {
    const a = Number(t[i - 1].slice(0, 2)) * 60 + Number(t[i - 1].slice(3));
    const b = Number(t[i].slice(0, 2)) * 60 + Number(t[i].slice(3));
    assert.equal(b - a, 15);
  }
});

test("dineInGridTimes: same window every weekday (uniform Mon-Sun hours)", () => {
  for (const d of [MON, SAT, SUN]) {
    const t = dineInGridTimes(OPEN_HOURS, d);
    assert.equal(t[0], "12:00");
    assert.equal(t.at(-1), "21:00");
  }
});

test("dineInGridTimes: resolves the matching entry from a multi-range table", () => {
  const varied = [
    { day: "Mon-Thu", open: "12:00", close: "22:00" },
    { day: "Fri-Sat", open: "12:00", close: "23:00" },
    { day: "Sun", open: "13:00", close: "21:00" },
  ];
  assert.equal(dineInGridTimes(varied, MON).at(-1), "22:00"); // Mon → 22:00 close
  assert.equal(dineInGridTimes(varied, SAT).at(-1), "23:00"); // Sat → 23:00 close
  assert.equal(dineInGridTimes(varied, SUN)[0], "13:00"); // Sun → 13:00 open
});

test("dineInGridTimes: falls back to 12:00–23:00 when hours are missing", () => {
  const t = dineInGridTimes(undefined, MON);
  assert.equal(t[0], "12:00");
  assert.equal(t.at(-1), "23:00");
});

test("isWithinDineInHorizon: today through +6 days is open, the rest is closed", () => {
  const today = "2026-07-06";
  assert.equal(isWithinDineInHorizon(today, "2026-07-05"), false); // yesterday
  assert.equal(isWithinDineInHorizon(today, "2026-07-06"), true); // today
  assert.equal(isWithinDineInHorizon(today, "2026-07-07"), true); // +1
  assert.equal(isWithinDineInHorizon(today, "2026-07-12"), true); // +6 (last day)
  assert.equal(isWithinDineInHorizon(today, "2026-07-13"), false); // +7 (out)
  assert.equal(isWithinDineInHorizon(today, "2026-07-23"), false); // +17 (out)
  assert.equal(isWithinDineInHorizon(today, "not-a-date"), false); // malformed
});

test("dineInSlotId: deterministic + collision-free per window", () => {
  assert.equal(dineInSlotId("krakow", MON, "18:30"), "dine-krakow-2026-07-06-1830");
  assert.equal(dineInSlotId("krakow", MON, "18:30"), dineInSlotId("krakow", MON, "18:30"));
  assert.notEqual(dineInSlotId("krakow", MON, "18:30"), dineInSlotId("krakow", MON, "19:00"));
});
