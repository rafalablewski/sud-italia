import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalCdf,
  twoSidedP,
  compareProportions,
  compareMeans,
  requiredSampleSizePerArm,
  recommendDecision,
} from "./experiment-stats";

// ─── normalCdf ────────────────────────────────────────────────────────────

test("normalCdf matches known standard-normal values", () => {
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-6);
  // Φ(1.96) ≈ 0.975, Φ(-1.96) ≈ 0.025
  assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 1e-3);
  assert.ok(Math.abs(normalCdf(-1.96) - 0.025) < 1e-3);
  // Φ(1) ≈ 0.8413
  assert.ok(Math.abs(normalCdf(1) - 0.8413) < 1e-3);
});

test("twoSidedP for z=1.96 is ~0.05", () => {
  assert.ok(Math.abs(twoSidedP(1.96) - 0.05) < 2e-3);
  // z=0 → p=1 (no evidence)
  assert.ok(Math.abs(twoSidedP(0) - 1) < 1e-6);
});

// ─── compareProportions ─────────────────────────────────────────────────

test("compareProportions flags a large, clear difference as significant", () => {
  // 100/1000 = 10% vs 150/1000 = 15% — a textbook-significant gap.
  const r = compareProportions({ successes: 100, trials: 1000 }, { successes: 150, trials: 1000 });
  assert.equal(r.baseline, 0.1);
  assert.equal(r.variant, 0.15);
  assert.ok(Math.abs(r.absoluteLift - 0.05) < 1e-9);
  assert.ok(Math.abs(r.relativeLift - 0.5) < 1e-9);
  assert.equal(r.direction, "up");
  assert.ok(r.significant, "5pp lift on n=1000 each should be significant");
  assert.ok(r.pValue < 0.01);
});

test("compareProportions: known z statistic (10% vs 12% at n=1000)", () => {
  const r = compareProportions({ successes: 100, trials: 1000 }, { successes: 120, trials: 1000 });
  // pooled p=0.11, SE=sqrt(0.11*0.89*(2/1000))=~0.013988, z=0.02/0.013988≈1.43
  assert.ok(Math.abs(r.statistic - 1.43) < 0.05);
  assert.ok(r.pValue > 0.05, "2pp lift on n=1000 is not yet significant");
  assert.equal(r.significant, false);
});

test("compareProportions withholds significance below the min-sample gate", () => {
  // Huge relative gap but tiny n — must not declare significance.
  const r = compareProportions({ successes: 1, trials: 5 }, { successes: 4, trials: 5 });
  assert.equal(r.enoughData, false);
  assert.equal(r.significant, false);
});

test("compareProportions handles zero-trial arms without NaN", () => {
  const r = compareProportions({ successes: 0, trials: 0 }, { successes: 0, trials: 0 });
  assert.equal(r.significant, false);
  assert.ok(Number.isFinite(r.pValue));
});

// ─── compareMeans ─────────────────────────────────────────────────────────

test("compareMeans detects a clear mean shift", () => {
  // mean 50 vs 55, sd 10 (var 100), n 200 each.
  const r = compareMeans({ n: 200, mean: 50, variance: 100 }, { n: 200, mean: 55, variance: 100 });
  assert.ok(Math.abs(r.absoluteLift - 5) < 1e-9);
  assert.equal(r.direction, "up");
  assert.ok(r.significant);
  // SE = sqrt(100/200 + 100/200) = 1 → z = 5 → p ≈ 0
  assert.ok(Math.abs(r.statistic - 5) < 1e-6);
  assert.ok(r.pValue < 1e-3);
});

test("compareMeans: small shift on noisy data is not significant", () => {
  const r = compareMeans({ n: 50, mean: 100, variance: 400 }, { n: 50, mean: 103, variance: 400 });
  // SE = sqrt(400/50 + 400/50) = 4 → z = 0.75 → p ≈ 0.45
  assert.ok(Math.abs(r.statistic - 0.75) < 1e-6);
  assert.equal(r.significant, false);
});

test("compareMeans respects the min-sample gate", () => {
  const r = compareMeans({ n: 5, mean: 50, variance: 1 }, { n: 5, mean: 60, variance: 1 });
  assert.equal(r.enoughData, false);
  assert.equal(r.significant, false);
});

// ─── requiredSampleSizePerArm ───────────────────────────────────────────

test("requiredSampleSizePerArm grows as the effect shrinks", () => {
  const big = requiredSampleSizePerArm(0.1, 0.5); // detect +50% on 10% base
  const small = requiredSampleSizePerArm(0.1, 0.05); // detect +5%
  assert.ok(small > big, "smaller MDE needs more samples");
  assert.ok(big > 0 && Number.isFinite(big));
  // Detecting a +50% lift on a 10% base at 80% power needs a few hundred/arm.
  assert.ok(big > 100 && big < 1000, `expected a few hundred, got ${big}`);
});

test("requiredSampleSizePerArm guards degenerate inputs", () => {
  assert.equal(requiredSampleSizePerArm(0, 0.1), Infinity);
  assert.equal(requiredSampleSizePerArm(0.1, 0), Infinity);
});

// ─── recommendDecision ───────────────────────────────────────────────────

test("recommendDecision: winner on a significant up result", () => {
  const r = compareProportions({ successes: 100, trials: 1000 }, { successes: 160, trials: 1000 });
  const d = recommendDecision(r, 2000, 800);
  assert.equal(d.kind, "winner");
});

test("recommendDecision: loser on a significant down result", () => {
  const r = compareProportions({ successes: 160, trials: 1000 }, { successes: 100, trials: 1000 });
  const d = recommendDecision(r, 2000, 800);
  assert.equal(d.kind, "loser");
});

test("recommendDecision: collect_more when under required sample, no signal", () => {
  const r = compareProportions({ successes: 10, trials: 100 }, { successes: 12, trials: 100 });
  const d = recommendDecision(r, 200, 1600);
  assert.equal(d.kind, "collect_more");
});

test("recommendDecision: no_difference when sample reached without significance", () => {
  const r = compareProportions({ successes: 100, trials: 1000 }, { successes: 102, trials: 1000 });
  const d = recommendDecision(r, 2000, 800);
  assert.equal(d.kind, "no_difference");
});
