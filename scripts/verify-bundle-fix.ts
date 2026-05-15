/**
 * Verification harness for the dynamic-mains bundle rewrite. Mirrors
 * scripts/verify-combo-fix.ts. Run with:
 *
 *   npx tsx scripts/verify-bundle-fix.ts
 */

import {
  type BundleTier,
  buildBundleCartLines,
  cartSatisfiesBundle,
  computeBundlePrice,
} from "../src/lib/bundles";
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

// Stand-in Kraków menu — only the items the bundles need.
const margherita = item("krk-pizza-margherita", "pizza", 2790);
const quattro = item("krk-pizza-quattro-formaggi", "pizza", 3290);
const carbonara = item("krk-pasta-carbonara", "pasta", 3290);
const bruschetta = item("krk-anti-bruschetta", "antipasti", 1900);
const burrata = item("krk-anti-burrata", "antipasti", 2790);
const limonata = item("krk-drink-limonata", "drinks", 1290);
const espresso = item("krk-drink-espresso", "drinks", 800);
const tiramisu = item("krk-dessert-tiramisu", "desserts", 1400);
const cannoli = item("krk-dessert-cannoli", "desserts", 1400);
const menu: MenuItem[] = [
  margherita,
  quattro,
  carbonara,
  bruschetta,
  burrata,
  limonata,
  espresso,
  tiramisu,
  cannoli,
];

const FAMILY: BundleTier = {
  id: "family",
  tier: "Family",
  name: "Your pizzas + sides",
  description: "Your mains + bruschetta + 2 drinks",
  pricingMode: "dynamic",
  mainCategories: ["pizza", "pasta"],
  minMains: 2,
  discountPercent: 20,
  composition: [
    { kind: "category", category: "antipasti", quantity: 1 },
    { kind: "category", category: "drinks", quantity: 2 },
  ],
  mealPeriod: "family",
  active: true,
};

const FAMILY_FEAST: BundleTier = {
  id: "family-feast",
  tier: "Family Feast",
  name: "Whole-table dinner",
  description: "Your mains + 2 antipasti + 4 drinks + tiramisù",
  pricingMode: "dynamic",
  mainCategories: ["pizza", "pasta"],
  minMains: 2,
  discountPercent: 28,
  composition: [
    { kind: "category", category: "antipasti", quantity: 2 },
    { kind: "category", category: "drinks", quantity: 4 },
    { kind: "item", itemIdSuffix: "dessert-tiramisu", quantity: 1 },
  ],
  mealPeriod: "family",
  isAnchor: true,
  active: true,
};

const FEAST_DELUXE: BundleTier = {
  id: "family-deluxe",
  tier: "Feast Deluxe",
  name: "Big group, no leftovers",
  description: "Your mains + 2 antipasti + 6 drinks + 2 desserts",
  pricingMode: "dynamic",
  mainCategories: ["pizza", "pasta"],
  minMains: 3,
  discountPercent: 24,
  composition: [
    { kind: "category", category: "antipasti", quantity: 2 },
    { kind: "category", category: "drinks", quantity: 6 },
    { kind: "category", category: "desserts", quantity: 2 },
  ],
  mealPeriod: "family",
  isDecoy: true,
  active: true,
};

const FIXED_LUNCH: BundleTier = {
  id: "lunch-plus",
  tier: "Lunch+",
  name: "Pasta + drink + tiramisù",
  description: "A meal you'll remember.",
  priceGrosze: 4600,
  refPriceGrosze: 5600,
  composition: [
    { kind: "category", category: "pasta", quantity: 1 },
    { kind: "category", category: "drinks", quantity: 1 },
    { kind: "item", itemIdSuffix: "dessert-tiramisu", quantity: 1 },
  ],
  mealPeriod: "lunch",
  isAnchor: true,
  active: true,
};

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

console.log("scenario 1: 2 margheritas — Family / Family Feast prices match the AI brain table; Feast Deluxe gated");
{
  const cart = [line(margherita, 2)];
  // Family: (2×2790 + 1900 + 2×800) × 0.80   [cheapest drink = espresso 800]
  //       = (5580 + 1900 + 1600) × 0.80 = 9080 × 0.80 = 7264
  const family = computeBundlePrice(FAMILY, cart, menu);
  expect("Family price", family?.priceGrosze, 7264);
  expect("Family savings", family?.savings, 9080 - 7264);
  expect("Family mainsCount", family?.mainsCount, 2);

  // Family Feast: (2×2790 + 2×1900 + 4×800 + 1400) × 0.72
  //             = (5580 + 3800 + 3200 + 1400) × 0.72 = 13980 × 0.72 = 10066 (rounded)
  const feast = computeBundlePrice(FAMILY_FEAST, cart, menu);
  expect("Family Feast price", feast?.priceGrosze, Math.round(13980 * 0.72));
  expect("Family Feast mainsCount", feast?.mainsCount, 2);

  // Feast Deluxe requires ≥3 mains.
  const deluxe = computeBundlePrice(FEAST_DELUXE, cart, menu);
  expect("Feast Deluxe gated at 2 mains", deluxe, null);
}

console.log("scenario 2: 3 margheritas — all three tiers price correctly");
{
  const cart = [line(margherita, 3)];
  // Family: (3×2790 + 1900 + 2×800) × 0.80 = (8370 + 1900 + 1600) × 0.80 = 11870 × 0.80 = 9496
  const family = computeBundlePrice(FAMILY, cart, menu);
  expect("Family price", family?.priceGrosze, 9496);
  // Family Feast: (3×2790 + 2×1900 + 4×800 + 1400) × 0.72
  //             = (8370 + 3800 + 3200 + 1400) × 0.72 = 16770 × 0.72 = 12074 (round)
  const feast = computeBundlePrice(FAMILY_FEAST, cart, menu);
  expect("Family Feast price", feast?.priceGrosze, Math.round(16770 * 0.72));
  // Feast Deluxe: (3×2790 + 2×1900 + 6×800 + 2×1400) × 0.76
  //             = (8370 + 3800 + 4800 + 2800) × 0.76 = 19770 × 0.76 = 15025 (round)
  const deluxe = computeBundlePrice(FEAST_DELUXE, cart, menu);
  expect("Feast Deluxe price", deluxe?.priceGrosze, Math.round(19770 * 0.76));
  expect("Feast Deluxe mainsCount", deluxe?.mainsCount, 3);
}

console.log("scenario 3: mixed 2 pizzas + 1 pasta — mainsCount sums both categories");
{
  const cart = [line(margherita, 2), line(carbonara, 1)];
  const family = computeBundlePrice(FAMILY, cart, menu);
  expect("Family mainsCount", family?.mainsCount, 3);
  // mains = 2×2790 + 1×3290 = 8870
  // add-ons (cheapest) = 1900 antipasti + 2×800 espresso = 3500
  // refPrice = 12370
  expect("Family refPrice", family?.refPriceGrosze, 12370);
  expect("Family price", family?.priceGrosze, Math.round(12370 * 0.80));
}

console.log("scenario 4: fixed bundle (Lunch+) keeps stored price unchanged");
{
  const cart = [line(carbonara, 1), line(limonata, 1), line(tiramisu, 1)];
  const lunch = computeBundlePrice(FIXED_LUNCH, cart, menu);
  expect("Lunch+ price (stored)", lunch?.priceGrosze, 4600);
  expect("Lunch+ refPrice (stored)", lunch?.refPriceGrosze, 5600);
  expect("Lunch+ savings", lunch?.savings, 1000);
  expect("Lunch+ mainsCount unused", lunch?.mainsCount, 0);
}

console.log("scenario 5: cartSatisfiesBundle rejects mismatched add-ons for dynamic family");
{
  // Family Feast wants 2 antipasti + 4 drinks + 1 tiramisù. Customer has
  // 2 mains + only 1 antipasti — must fail.
  const wrong = [line(margherita, 2), line(bruschetta, 1), line(limonata, 4), line(tiramisu, 1)];
  expect("rejects short antipasti count", cartSatisfiesBundle(FAMILY_FEAST, wrong, menu), false);

  // Correct shape — 2 mains + 2 antipasti + 4 drinks + 1 tiramisù.
  const right = [
    line(margherita, 2),
    line(bruschetta, 1),
    line(burrata, 1),
    line(limonata, 4),
    line(tiramisu, 1),
  ];
  expect("accepts correct shape", cartSatisfiesBundle(FAMILY_FEAST, right, menu), true);
}

console.log("scenario 6: cartSatisfiesBundle gates dynamic bundle on minMains");
{
  // 1 margherita + correct add-ons — should still fail because minMains=2.
  const tooFew = [line(margherita, 1), line(bruschetta, 1), line(limonata, 2)];
  expect("rejects below minMains", cartSatisfiesBundle(FAMILY, tooFew, menu), false);
}

// Helper: flatten built lines into per-unit ids so we can compare regardless
// of whether the dynamic path aggregated mains into a single line (q=N) vs
// split add-ons into multiple q=1 lines.
const flattenIds = (lines: CartItem[] | null): string[] => {
  if (!lines) return [];
  const out: string[] = [];
  for (const l of lines) {
    for (let i = 0; i < l.quantity; i++) out.push(l.menuItem.id);
  }
  return out.sort();
};

console.log("scenario 7: buildBundleCartLines preserves customer's drinks when present");
{
  // Cart has 2 margheritas + 2 limonatas. Family wants 1 antipasti + 2 drinks.
  // The 2 limonatas should be carried into the bundle (not swapped for cheapest).
  const cart = [line(margherita, 2), line(limonata, 2)];
  const lines = buildBundleCartLines(FAMILY, menu, cart, "krakow");
  expect(
    "lines (mains preserved + drinks preserved)",
    flattenIds(lines),
    ["krk-anti-bruschetta", "krk-drink-limonata", "krk-drink-limonata", "krk-pizza-margherita", "krk-pizza-margherita"],
  );
}

console.log("scenario 8: buildBundleCartLines falls back to cheapest when no preference in cart");
{
  // Cart has only 2 margheritas. Family must fill 1 antipasti (bruschetta is
  // cheaper than burrata) + 2 drinks (espresso cheaper than limonata).
  const cart = [line(margherita, 2)];
  const lines = buildBundleCartLines(FAMILY, menu, cart, "krakow");
  expect(
    "lines (cheapest fallback)",
    flattenIds(lines),
    [
      "krk-anti-bruschetta",
      "krk-drink-espresso",
      "krk-drink-espresso",
      "krk-pizza-margherita",
      "krk-pizza-margherita",
    ],
  );
}

console.log("scenario 9: maxMains cap rejects abuse");
{
  const capped: BundleTier = {
    ...FAMILY_FEAST,
    id: "capped",
    maxMains: 5,
  };
  const tooMany = [line(margherita, 6)];
  const pricing = computeBundlePrice(capped, tooMany, menu);
  expect("rejects above maxMains", pricing, null);
}

console.log("scenario 10: Warszawa-prefixed items match the same dynamic bundle by category");
{
  const wawMargherita = item("waw-pizza-margherita", "pizza", 2890);
  const wawLimonata = item("waw-drink-limonata", "drinks", 1390);
  const wawBruschetta = item("waw-anti-bruschetta", "antipasti", 1950);
  const wawMenu: MenuItem[] = [wawMargherita, wawLimonata, wawBruschetta];
  const cart = [line(wawMargherita, 2)];
  const family = computeBundlePrice(FAMILY, cart, wawMenu);
  // (2×2890 + 1950 + 2×1390) × 0.80 = (5780 + 1950 + 2780) × 0.80 = 10510 × 0.80 = 8408
  expect("Warszawa Family price", family?.priceGrosze, Math.round(10510 * 0.80));
}

if (failures > 0) {
  console.log(`\n${failures} FAILURE(S)`);
  process.exit(1);
}
console.log("\nall scenarios pass");
