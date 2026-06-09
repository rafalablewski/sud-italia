import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { withIdempotency } from "./store";

// Run with:  npx tsx --test src/lib/idempotency.test.ts
//
// Pins the Phase 2 correctness core: a mutation wrapped in withIdempotency runs
// at most once per key, replays the stored result on a retry (the lost-response
// / double-tap case — a charge must never fire twice), and never memoizes a
// failure. Keys are random per run so reruns don't collide with leftover rows.

test("runs the body once and replays the stored result on a same-key retry", async () => {
  const key = `test-${randomUUID()}`;
  let runs = 0;
  const first = await withIdempotency(key, async () => {
    runs++;
    return { orderId: "pos-1", runs };
  });
  // A retry with the same key must NOT re-run the body (no second charge).
  const second = await withIdempotency(key, async () => {
    runs++;
    return { orderId: "pos-DUPLICATE", runs };
  });
  assert.equal(runs, 1);
  assert.deepEqual(first, { orderId: "pos-1", runs: 1 });
  assert.deepEqual(second, { orderId: "pos-1", runs: 1 }); // replayed, not re-run
});

test("a different key runs again", async () => {
  let runs = 0;
  await withIdempotency(`test-${randomUUID()}`, async () => void runs++);
  await withIdempotency(`test-${randomUUID()}`, async () => void runs++);
  assert.equal(runs, 2);
});

test("a null/empty key opts out — always runs", async () => {
  let runs = 0;
  await withIdempotency(null, async () => void runs++);
  await withIdempotency("", async () => void runs++);
  assert.equal(runs, 2);
});

test("a thrown error is not memoized — the action stays retryable", async () => {
  const key = `test-${randomUUID()}`;
  await assert.rejects(
    withIdempotency(key, async () => {
      throw new Error("boom");
    }),
  );
  let ran = false;
  const result = await withIdempotency(key, async () => {
    ran = true;
    return "recovered";
  });
  assert.equal(ran, true, "a failed attempt must be retryable under the same key");
  assert.equal(result, "recovered");
});
