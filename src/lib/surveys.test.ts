import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyRating,
  computePulseScore,
  pulseBreakdown,
  averageStars,
  mergeSurveysWithDefaults,
  DEFAULT_SURVEYS,
  SURVEY_TRIGGERS,
  type SurveyDefinition,
} from "./surveys";

// Run with:  npx tsx --test src/lib/surveys.test.ts

test("classifyRating maps 5★ → promoter, 4★ → passive, ≤3★ → detractor", () => {
  assert.equal(classifyRating(5), "promoter");
  assert.equal(classifyRating(4), "passive");
  assert.equal(classifyRating(3), "detractor");
  assert.equal(classifyRating(1), "detractor");
});

test("computePulseScore is NPS net of promoters minus detractors", () => {
  // 60×5★ (promoter), 25×4★ (passive), 15×≤3★ (detractor) → +45
  const responses = [
    ...Array(60).fill({ rating: 5 }),
    ...Array(25).fill({ rating: 4 }),
    ...Array(15).fill({ rating: 2 }),
  ];
  assert.equal(computePulseScore(responses), 45);
});

test("computePulseScore handles the extremes and empty set", () => {
  assert.equal(computePulseScore([]), 0);
  assert.equal(computePulseScore([{ rating: 5 }, { rating: 5 }]), 100);
  assert.equal(computePulseScore([{ rating: 1 }, { rating: 3 }]), -100);
  // All passives net to zero (neither promoter nor detractor).
  assert.equal(computePulseScore([{ rating: 4 }, { rating: 4 }]), 0);
});

test("pulseBreakdown counts buckets in one pass and agrees with computePulseScore", () => {
  const responses = [
    ...Array(60).fill({ rating: 5 }),
    ...Array(25).fill({ rating: 4 }),
    ...Array(15).fill({ rating: 2 }),
  ];
  const b = pulseBreakdown(responses);
  assert.equal(b.total, 100);
  assert.equal(b.promoters, 60);
  assert.equal(b.passives, 25);
  assert.equal(b.detractors, 15);
  assert.equal(b.pulse, 45);
  assert.equal(b.pulse, computePulseScore(responses));
  // Empty set is all-zero, not NaN.
  assert.deepEqual(pulseBreakdown([]), {
    total: 0,
    promoters: 0,
    passives: 0,
    detractors: 0,
    pulse: 0,
  });
});

test("averageStars is a plain mean, 0 when empty", () => {
  assert.equal(averageStars([]), 0);
  assert.equal(averageStars([{ rating: 2 }, { rating: 4 }]), 3);
});

test("every seeded survey targets a wired trigger and has copy", () => {
  for (const s of DEFAULT_SURVEYS) {
    assert.ok(
      (SURVEY_TRIGGERS as readonly string[]).includes(s.trigger),
      `survey ${s.id} has an unwired trigger ${s.trigger}`,
    );
    assert.ok(s.question.length > 0, `survey ${s.id} missing question`);
    assert.ok(s.scaleLow && s.scaleHigh, `survey ${s.id} missing scale anchors`);
    assert.ok(s.cooldownDays >= 0, `survey ${s.id} bad cooldown`);
  }
});

test("at least one default survey is active per the two core triggers", () => {
  const active = DEFAULT_SURVEYS.filter((s) => s.active);
  assert.ok(active.some((s) => s.trigger === "post-order"));
  assert.ok(active.some((s) => s.trigger === "prolonged-browse"));
});

test("mergeSurveysWithDefaults seeds defaults when nothing is saved", () => {
  assert.equal(mergeSurveysWithDefaults(null).length, DEFAULT_SURVEYS.length);
  assert.equal(mergeSurveysWithDefaults([]).length, DEFAULT_SURVEYS.length);
});

test("mergeSurveysWithDefaults keeps operator edits and appends new defaults", () => {
  // Operator paused the first survey and edited its copy.
  const edited: SurveyDefinition = {
    ...DEFAULT_SURVEYS[0],
    active: false,
    question: "Custom question",
  };
  const merged = mergeSurveysWithDefaults([edited]);
  const sticky = merged.find((s) => s.id === edited.id);
  assert.equal(sticky?.active, false);
  assert.equal(sticky?.question, "Custom question");
  // Every other default still present (none dropped).
  assert.equal(merged.length, DEFAULT_SURVEYS.length);
});
