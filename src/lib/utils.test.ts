import { test } from "node:test";
import assert from "node:assert/strict";
import { getBaseSlug, marginPct, marginTone } from "./utils";

// Run with:  npx tsx --test src/lib/utils.test.ts
//
// getBaseSlug is load-bearing for CLAUDE.md Rule #10 — a chain-wide recipe is
// keyed by base slug, so krk-/waw- prefixes MUST collapse to one key. If this
// regresses, Kraków and Warszawa silently fork their Margherita recipe.

test("getBaseSlug strips the seed location prefixes (krk / waw)", () => {
  assert.equal(getBaseSlug("krk-pizza-margherita"), "pizza-margherita");
  assert.equal(getBaseSlug("waw-pizza-margherita"), "pizza-margherita");
});

test("getBaseSlug collapses both locations to the SAME key (recipe sharing)", () => {
  assert.equal(getBaseSlug("krk-pizza-margherita"), getBaseSlug("waw-pizza-margherita"));
});

test("getBaseSlug strips the slug-derived 3-char prefixes (kra / war)", () => {
  // createCustomItem generates these via slug.slice(0, 3).
  assert.equal(getBaseSlug("kra-dessert-tiramisu"), "dessert-tiramisu");
  assert.equal(getBaseSlug("war-dessert-tiramisu"), "dessert-tiramisu");
});

test("getBaseSlug returns an already-bare slug unchanged", () => {
  assert.equal(getBaseSlug("pizza-margherita"), "pizza-margherita");
});

test("getBaseSlug only peels the FIRST prefix, never the rest of the id", () => {
  // The capture group is greedy on the tail — only the leading 2–4 char token goes.
  assert.equal(getBaseSlug("krk-anti-garlic-bread"), "anti-garlic-bread");
});

test("marginPct rounds gross margin and guards a zero/negative price", () => {
  assert.equal(marginPct(2500, 800), 68); // (2500-800)/2500 = 0.68
  assert.equal(marginPct(1000, 1000), 0);
  assert.equal(marginPct(0, 800), 0); // no divide-by-zero
  assert.equal(marginPct(-100, 50), 0);
});

test("marginTone bands match the admin chip colours", () => {
  assert.equal(marginTone(49), "danger");
  assert.equal(marginTone(50), "warning");
  assert.equal(marginTone(64), "warning");
  assert.equal(marginTone(65), "success");
  assert.equal(marginTone(90), "success");
});
