import { test } from "node:test";
import assert from "node:assert/strict";
import {
  weekStart,
  computeWeekStreak,
  computeChallengeProgress,
  challengeProgressMap,
} from "./rewards-progress";

// A fixed "now" on a Wednesday (2026-06-03) keeps the week-boundary math
// deterministic regardless of when the suite runs.
const NOW = new Date("2026-06-03T12:00:00");

function daysAgo(n: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

test("weekStart anchors on the local Sunday at midnight", () => {
  const ws = weekStart(NOW); // Wed 2026-06-03 → Sun 2026-05-31
  assert.equal(ws.getDay(), 0);
  assert.equal(ws.getHours(), 0);
  assert.equal(ws.getMinutes(), 0);
});

test("computeWeekStreak: no orders → 0", () => {
  assert.equal(computeWeekStreak([], NOW), 0);
});

test("computeWeekStreak: an order this week → 1", () => {
  assert.equal(computeWeekStreak([daysAgo(0)], NOW), 1);
});

test("computeWeekStreak: three consecutive weeks → 3", () => {
  // This week, last week, two weeks ago.
  const dates = [daysAgo(0), daysAgo(8), daysAgo(15)];
  assert.equal(computeWeekStreak(dates, NOW), 3);
});

test("computeWeekStreak: a gap breaks the streak", () => {
  // This week + the week 3 weeks ago (gap in between) → streak is just 1.
  const dates = [daysAgo(0), daysAgo(22)];
  assert.equal(computeWeekStreak(dates, NOW), 1);
});

test("computeWeekStreak: grace — last-week run still counts before this week's order", () => {
  // Nothing this week yet, but last week + the week before → streak 2.
  const dates = [daysAgo(8), daysAgo(15)];
  assert.equal(computeWeekStreak(dates, NOW), 2);
});

test("computeWeekStreak: only an old order (2+ weeks ago) → 0", () => {
  assert.equal(computeWeekStreak([daysAgo(22)], NOW), 0);
});

test("computeChallengeProgress counts only this-week orders + pasta units", () => {
  const orders = [
    {
      createdAt: daysAgo(0),
      items: [
        { menuItem: { category: "pasta" }, quantity: 2 },
        { menuItem: { category: "pizza" }, quantity: 1 },
      ],
    },
    {
      createdAt: daysAgo(1),
      items: [{ menuItem: { category: "pasta" }, quantity: 1 }],
    },
    {
      // Last week — must not count toward this week's challenges.
      createdAt: daysAgo(8),
      items: [{ menuItem: { category: "pasta" }, quantity: 5 }],
    },
  ];
  const p = computeChallengeProgress(orders, 1, NOW);
  assert.equal(p.ordersThisWeek, 2);
  assert.equal(p.pastaThisWeek, 3);
  assert.equal(p.referralsThisWeek, 1);
});

test("challengeProgressMap keys match the active challenge ids", () => {
  const m = challengeProgressMap({
    pastaThisWeek: 1,
    ordersThisWeek: 2,
    referralsThisWeek: 0,
  });
  assert.equal(m["ch-pasta-week"], 1);
  assert.equal(m["ch-triple-order"], 2);
  assert.equal(m["ch-bring-friend"], 0);
});
