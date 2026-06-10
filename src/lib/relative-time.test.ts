import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtRelative } from "./relative-time";

// Run with:  npx tsx --test src/lib/relative-time.test.ts
// `now` is injected so every case is deterministic (no real-clock reads).

const NOW = new Date("2026-06-10T12:00:00").getTime(); // local time

const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

test("empty / unparseable input yields an empty string", () => {
  assert.equal(fmtRelative(undefined, NOW), "");
  assert.equal(fmtRelative("", NOW), "");
  assert.equal(fmtRelative("not-a-date", NOW), "");
});

test("under a minute reads 'Just now'", () => {
  assert.equal(fmtRelative(ago(0), NOW), "Just now");
  assert.equal(fmtRelative(ago(59 * 1000), NOW), "Just now");
});

test("minutes and hours are floored (within today)", () => {
  // NOW is 12:00, so anything up to 12h back is still the same calendar day.
  assert.equal(fmtRelative(ago(5 * MIN), NOW), "5m");
  assert.equal(fmtRelative(ago(59 * MIN), NOW), "59m");
  assert.equal(fmtRelative(ago(3 * HOUR), NOW), "3h");
  assert.equal(fmtRelative(ago(11 * HOUR), NOW), "11h"); // 01:00 today
});

test("an hours-ago time that crosses midnight reads 'Yesterday', not '23h'", () => {
  assert.equal(fmtRelative(ago(23 * HOUR), NOW), "Yesterday"); // 13:00 the day before
});

test("a future / clock-skewed timestamp pins to 'Just now', never negative", () => {
  assert.equal(fmtRelative(new Date(NOW + 5 * MIN).toISOString(), NOW), "Just now");
});

test("'Yesterday' tracks the calendar day, not a rolling 24h window", () => {
  // 9 June 23:00 vs now 10 June 12:00 — only 13h apart but a calendar day back.
  assert.equal(fmtRelative(new Date("2026-06-09T23:00:00").toISOString(), NOW), "Yesterday");
});

test("2–6 calendar days back show a weekday", () => {
  // 7 June 2026 is a Sunday → pl-PL short weekday "niedz."
  const out = fmtRelative(new Date("2026-06-07T10:00:00").toISOString(), NOW);
  assert.equal(out, new Date("2026-06-07T10:00:00").toLocaleDateString("pl-PL", { weekday: "short" }));
});

test("a week or more back falls back to an absolute date (no year, same year)", () => {
  assert.equal(fmtRelative(ago(10 * DAY), NOW), new Date(NOW - 10 * DAY).toLocaleDateString("pl-PL", { day: "numeric", month: "short" }));
});

test("a prior-year date includes the year", () => {
  const out = fmtRelative(new Date("2025-12-20T10:00:00").toISOString(), NOW);
  assert.equal(out, new Date("2025-12-20T10:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" }));
});
