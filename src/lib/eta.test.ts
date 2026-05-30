import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estimatePrepMinutes,
  estimateReadyAt,
  EXPO_BUFFER_MINUTES,
  MIN_PREP_MINUTES,
  type EtaItemLike,
} from "./eta";

// Run with:  npx tsx --test src/lib/eta.test.ts

const item = (prepTimeMinutes?: number): EtaItemLike => ({ menuItem: { prepTimeMinutes } });

test("estimatePrepMinutes floors at MIN_PREP_MINUTES", () => {
  assert.equal(estimatePrepMinutes([item(2)]), MIN_PREP_MINUTES);
  assert.equal(estimatePrepMinutes([item(undefined)]), MIN_PREP_MINUTES);
  assert.equal(estimatePrepMinutes([]), MIN_PREP_MINUTES);
});

test("estimatePrepMinutes uses longest item prep + expo buffer", () => {
  // 12 min pizza dominates a 6 min espresso → 12 + 3 buffer = 15.
  assert.equal(
    estimatePrepMinutes([item(6), item(12)]),
    12 + EXPO_BUFFER_MINUTES,
  );
});

test("estimatePrepMinutes ignores quantity — parallel fire across the line", () => {
  // Same single-item prep regardless of how many lines share it.
  const one = estimatePrepMinutes([item(20)]);
  const many = estimatePrepMinutes([item(20), item(20), item(20)]);
  assert.equal(one, many);
});

test("estimateReadyAt adds the estimate to the base time", () => {
  const from = new Date("2026-05-30T12:00:00.000Z");
  const ready = estimateReadyAt([item(20)], from);
  assert.equal(
    ready.getTime() - from.getTime(),
    (20 + EXPO_BUFFER_MINUTES) * 60_000,
  );
});
