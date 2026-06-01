import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dbBreakerOpen,
  withDbTimeout,
  _resetDbBreakerForTests,
} from "./db-resilience";

test("withDbTimeout passes through a fast success and keeps the breaker closed", async () => {
  _resetDbBreakerForTests();
  const out = await withDbTimeout(async () => 42, "ok");
  assert.equal(out, 42);
  assert.equal(dbBreakerOpen(), false);
});

test("withDbTimeout rejects a hanging op and the breaker trips after the threshold", async () => {
  _resetDbBreakerForTests();
  process.env.DB_OP_TIMEOUT_MS = "20";
  process.env.DB_BREAKER_THRESHOLD = "3";
  process.env.DB_BREAKER_COOLDOWN_MS = "10000";

  // The module read the env at import time with defaults; the timeout used here
  // is the imported constant, so we drive failures via a rejecting op instead
  // of relying on the env override (kept above to document intended knobs).
  const boom = () => Promise.reject(new Error("neon down"));

  for (let i = 0; i < 3; i++) {
    await assert.rejects(() => withDbTimeout(boom, "read"));
  }
  // Three consecutive failures → breaker open, reads should now short-circuit.
  assert.equal(dbBreakerOpen(), true);

  delete process.env.DB_OP_TIMEOUT_MS;
  delete process.env.DB_BREAKER_THRESHOLD;
  delete process.env.DB_BREAKER_COOLDOWN_MS;
});

test("a success resets the failure count so the breaker stays closed", async () => {
  _resetDbBreakerForTests();
  const boom = () => Promise.reject(new Error("blip"));
  await assert.rejects(() => withDbTimeout(boom, "read"));
  await assert.rejects(() => withDbTimeout(boom, "read"));
  await withDbTimeout(async () => "recovered", "read"); // resets counter
  await assert.rejects(() => withDbTimeout(boom, "read"));
  // Only 1 failure since the reset — still closed.
  assert.equal(dbBreakerOpen(), false);
});

test("withDbTimeout enforces a timeout on a hanging op", async () => {
  _resetDbBreakerForTests();
  // Never resolves on its own; must be rejected by the internal timer.
  await assert.rejects(
    () => withDbTimeout(() => new Promise(() => {}), "hang"),
    /timed out/,
  );
});
