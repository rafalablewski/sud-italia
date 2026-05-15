/**
 * Verification harness for the getActiveComboDeals rewrite (claude/fix-promo-bugs-HMguT).
 *
 * Runs the five scenarios from the plan as assertions. Exits non-zero on
 * any mismatch. Invoke with `npx tsx scripts/verify-combo-fix.ts`.
 */

import { getActiveComboDeals, type ComboDeal } from "../src/lib/upsell";
import type { CartItem, MenuCategory, MenuItem } from "../src/data/types";

const item = (id: string, category: MenuCategory, price: number): MenuItem => ({
  id,
  name: id,
  description: "",
  price,
  cost: 0,
  category,
  tags: [],
  available: true,
});

const line = (m: MenuItem, quantity = 1): CartItem => ({
  menuItem: m,
  quantity,
  locationSlug: "krakow",
});

const cfg = (combos: ComboDeal[] & { active?: boolean }[]) => ({
  combos: combos.map((c) => ({ ...c, active: true })),
});

const COMBOS: ComboDeal[] = [
  {
    id: "meal-deal",
    name: "Meal Deal",
    description: "",
    categories: ["pizza", "drinks", "desserts"],
    discountPercent: 10,
    minItems: 3,
  },
  {
    id: "pasta-combo",
    name: "Pasta Combo",
    description: "",
    categories: ["pasta", "drinks", "desserts"],
    discountPercent: 10,
    minItems: 3,
  },
  {
    id: "lunch-special",
    name: "Lunch Special",
    description: "",
    categories: ["panini", "drinks"],
    discountPercent: 8,
    minItems: 2,
  },
];

let failures = 0;
const expect = (label: string, actual: unknown, expected: unknown) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}\n       expected ${e}\n       got      ${a}`);
  }
};

console.log("scenario 1: cart [panino, drink] — complete combo (lunch-special) must beat earlier partial (meal-deal)");
{
  const cart = [line(item("p", "panini", 2200)), line(item("d", "drinks", 800))];
  const r = getActiveComboDeals(cart, cfg(COMBOS));
  expect("activeDeal.id", r.activeDeal?.id, "lunch-special");
  expect("progress", r.progress, 1);
  expect("missingCategories", r.missingCategories, []);
  // savings = round((2200 + 800) * 0.08) = 240
  expect("savings", r.savings, 240);
}

console.log("scenario 2: cart [1× panino, 2× drink] vs lunch-special minItems=3 — must complete by quantity, not line count");
{
  const cart = [line(item("p", "panini", 2200)), line(item("d", "drinks", 800), 2)];
  const combos = COMBOS.map((c) => (c.id === "lunch-special" ? { ...c, minItems: 3 } : c));
  const r = getActiveComboDeals(cart, cfg(combos));
  expect("activeDeal.id", r.activeDeal?.id, "lunch-special");
  expect("progress", r.progress, 1);
}

console.log("scenario 3: cart [5× pizza @ 4000, drink @ 800, dessert @ 1200] — discount capped to one combo, not 5×");
{
  const cart = [
    line(item("pizza", "pizza", 4000), 5),
    line(item("d", "drinks", 800)),
    line(item("t", "desserts", 1200)),
  ];
  const r = getActiveComboDeals(cart, cfg(COMBOS));
  expect("activeDeal.id", r.activeDeal?.id, "meal-deal");
  // OLD buggy: round((5*4000 + 800 + 1200) * 0.10) = 2200
  // NEW capped: round((4000 + 800 + 1200) * 0.10) = 600
  expect("savings (capped)", r.savings, 600);
  expect("progress", r.progress, 1);
}

console.log("scenario 4: two complete combos with identical savings — original index breaks the tie");
{
  // Both meal-deal and pasta-combo become complete; identical 10% on cheapest-per-category;
  // cheapest pizza = cheapest pasta so savings are identical. First by index (meal-deal) wins.
  const cart = [
    line(item("pizza", "pizza", 3000)),
    line(item("pasta", "pasta", 3000)),
    line(item("drink", "drinks", 800)),
    line(item("tiramisu", "desserts", 1200)),
  ];
  const r = getActiveComboDeals(cart, cfg(COMBOS));
  expect("activeDeal.id (first-index wins)", r.activeDeal?.id, "meal-deal");
  expect("savings", r.savings, Math.round((3000 + 800 + 1200) * 0.1));
}

console.log("scenario 5a: cart [drink only] — partial bucket, pick the highest potential savings");
{
  // potential savings (cheapest matched-cat × discount):
  //   meal-deal     : 800 × 0.10 = 80
  //   pasta-combo   : 800 × 0.10 = 80
  //   lunch-special : 800 × 0.08 = 64
  // meal-deal wins on tie via earliest index.
  const cart = [line(item("d", "drinks", 800))];
  const r = getActiveComboDeals(cart, cfg(COMBOS));
  expect("activeDeal.id", r.activeDeal?.id, "meal-deal");
  expect("progress", r.progress, 1 / 3);
}

console.log("scenario 5b: two partials with equal potential savings — earliest index wins");
{
  const cart = [line(item("d", "drinks", 1000))];
  // Reorder so pasta-combo comes first; expect pasta-combo to win the tie.
  const reordered = [COMBOS[1], COMBOS[0], COMBOS[2]];
  const r = getActiveComboDeals(cart, cfg(reordered));
  expect("activeDeal.id (after reorder)", r.activeDeal?.id, "pasta-combo");
}

console.log("scenario 6: mixed bucket — cart fully completes a cheap combo and partially matches an expensive one. Complete beats partial.");
{
  // Cart has panino + drink → lunch-special is complete (8% × ~3000 = ~240).
  // It also has 1 pizza-cat short of meal-deal (matched=drinks). Even if
  // potential savings on meal-deal looked larger, completion must win.
  const cart = [line(item("p", "panini", 2200)), line(item("d", "drinks", 800))];
  const r = getActiveComboDeals(cart, cfg(COMBOS));
  expect("activeDeal.id (complete > partial)", r.activeDeal?.id, "lunch-special");
  expect("missingCategories", r.missingCategories, []);
}

console.log("scenario 7: empty cart short-circuits to null deal");
{
  const r = getActiveComboDeals([], cfg(COMBOS));
  expect("activeDeal", r.activeDeal, null);
  expect("savings", r.savings, 0);
}

if (failures > 0) {
  console.log(`\n${failures} FAILURE(S)`);
  process.exit(1);
}
console.log("\nall scenarios pass");
