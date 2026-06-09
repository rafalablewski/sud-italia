import { test } from "node:test";
import assert from "node:assert/strict";
import {
  backoffFor,
  dueEntries,
  classifyResponse,
  applyResult,
  OUTBOX_BACKOFF_MS,
  type OutboxEntry,
} from "./writeQueue.core";

// Run with:  npx tsx --test src/lib/writeQueue.core.test.ts
//
// Pins the durable-queue ordering / backoff / terminal rules (Phase 2b).

function entry(p: Partial<OutboxEntry> & { key: string; entity: string }): OutboxEntry {
  return {
    url: "/x",
    method: "PATCH",
    desc: p.key,
    attempts: 0,
    nextAt: 0,
    enqueuedAt: 0,
    ...p,
  };
}

test("backoffFor steps through the schedule and caps at the last value", () => {
  assert.equal(backoffFor(0), OUTBOX_BACKOFF_MS[0]);
  assert.equal(backoffFor(1), OUTBOX_BACKOFF_MS[1]);
  assert.equal(backoffFor(3), OUTBOX_BACKOFF_MS[3]);
  assert.equal(backoffFor(99), OUTBOX_BACKOFF_MS[OUTBOX_BACKOFF_MS.length - 1]);
  assert.equal(backoffFor(-5), OUTBOX_BACKOFF_MS[0]); // defensive clamp
});

test("dueEntries returns only the FIFO head of each entity group", () => {
  const q = [
    entry({ key: "a1", entity: "tab:A" }),
    entry({ key: "a2", entity: "tab:A" }), // held: A already has a head
    entry({ key: "b1", entity: "tab:B" }),
  ];
  const due = dueEntries(q, 1000);
  assert.deepEqual(
    due.map((e) => e.key),
    ["a1", "b1"],
  );
});

test("dueEntries respects the backoff gate", () => {
  const q = [
    entry({ key: "a1", entity: "tab:A", nextAt: 5000 }),
    entry({ key: "b1", entity: "tab:B", nextAt: 500 }),
  ];
  // a1 is gated until 5000; only b1 is due at t=1000.
  assert.deepEqual(
    dueEntries(q, 1000).map((e) => e.key),
    ["b1"],
  );
});

test("classifyResponse: null + 5xx retry, 2xx ok, 4xx terminal reject", () => {
  assert.deepEqual(classifyResponse(null), { kind: "retry" });
  assert.deepEqual(classifyResponse({ ok: false, status: 503 }), { kind: "retry" });
  assert.deepEqual(classifyResponse({ ok: true, status: 200 }), { kind: "ok" });
  assert.deepEqual(classifyResponse({ ok: false, status: 404 }), { kind: "rejected", status: 404 });
  assert.deepEqual(classifyResponse({ ok: false, status: 400 }), { kind: "rejected", status: 400 });
});

test("applyResult drops the entry on success", () => {
  const q = [entry({ key: "a1", entity: "tab:A" }), entry({ key: "b1", entity: "tab:B" })];
  const next = applyResult(q, "a1", { kind: "ok" }, 1000);
  assert.deepEqual(
    next.map((e) => e.key),
    ["b1"],
  );
});

test("applyResult drops the entry on a terminal rejection", () => {
  const q = [entry({ key: "a1", entity: "tab:A" })];
  assert.deepEqual(applyResult(q, "a1", { kind: "rejected", status: 400 }, 1000), []);
});

test("applyResult bumps attempts + sets the backoff gate on retry", () => {
  const q = [entry({ key: "a1", entity: "tab:A", attempts: 0, nextAt: 0 })];
  const next = applyResult(q, "a1", { kind: "retry" }, 1000);
  assert.equal(next[0].attempts, 1);
  assert.equal(next[0].nextAt, 1000 + backoffFor(1));
});

test("applyResult is pure — the input array is untouched", () => {
  const q = [entry({ key: "a1", entity: "tab:A" })];
  const snapshot = JSON.stringify(q);
  applyResult(q, "a1", { kind: "retry" }, 1000);
  assert.equal(JSON.stringify(q), snapshot);
});
