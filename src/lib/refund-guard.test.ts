import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateRefundGuard,
  bypassesRefundCaps,
  DEFAULT_REFUND_CONTROLS,
  type RefundGuardContext,
} from "./refund-guard";

// Run with:  npx tsx --test src/lib/refund-guard.test.ts

const base: RefundGuardContext = {
  role: "manager",
  reasonCode: "customer_request",
  amountGrosze: 5_000,
  actorCompTotalTodayGrosze: 0,
  limits: DEFAULT_REFUND_CONTROLS,
};

test("owner bypasses every cap", () => {
  assert.equal(bypassesRefundCaps("owner"), true);
  const d = evaluateRefundGuard({
    ...base,
    role: "owner",
    reasonCode: "manager_comp",
    amountGrosze: 10_000_000,
    actorCompTotalTodayGrosze: 10_000_000,
  });
  assert.equal(d.allowed, true);
});

test("manager does not bypass caps", () => {
  assert.equal(bypassesRefundCaps("manager"), false);
});

test("refund under the per-refund limit is allowed", () => {
  assert.equal(evaluateRefundGuard(base).allowed, true);
});

test("single refund over the per-refund limit is blocked", () => {
  const d = evaluateRefundGuard({ ...base, amountGrosze: 20_001 });
  assert.equal(d.allowed, false);
  assert.equal(d.code, "single_cap");
});

test("comp that crosses the daily cap is blocked; customer-request of same size is not", () => {
  // 400 zł already comped today, 150 zł more would cross the 500 zł cap.
  const ctx = { ...base, amountGrosze: 15_000, actorCompTotalTodayGrosze: 40_000 };
  // As a comp → blocked by the daily cap...
  const comp = evaluateRefundGuard({ ...ctx, reasonCode: "manager_comp" });
  assert.equal(comp.allowed, false);
  assert.equal(comp.code, "daily_comp_cap");
  // ...but the same amount as a genuine customer refund doesn't count toward comps.
  const refund = evaluateRefundGuard({ ...ctx, reasonCode: "customer_request" });
  assert.equal(refund.allowed, true);
});

test("comp within the remaining daily budget is allowed", () => {
  const d = evaluateRefundGuard({
    ...base,
    reasonCode: "manager_comp",
    amountGrosze: 5_000,
    actorCompTotalTodayGrosze: 40_000, // 400 + 50 = 450 ≤ 500
  });
  assert.equal(d.allowed, true);
});

test("a 0 cap disables that check", () => {
  const d = evaluateRefundGuard({
    ...base,
    amountGrosze: 1_000_000,
    limits: { singleMaxGrosze: 0, compDailyCapGrosze: 0 },
  });
  assert.equal(d.allowed, true);
});
