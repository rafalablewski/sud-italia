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

const ITALIAN_CLASSIC: ComboDeal = {
  id: "italian-classic",
  name: "Italian Classic Deal",
  description: "Margherita + Espresso + Tiramisù",
  categories: ["pizza", "drinks", "desserts"],
  requiredItems: [
    { suffix: "pizza-margherita", label: "Margherita" },
    { suffix: "drink-espresso", label: "Espresso" },
    { suffix: "dessert-tiramisu", label: "Tiramisù" },
  ],
  discountPercent: 10,
  minItems: 3,
};

console.log("scenario 8: italian-classic — only matches Margherita + Espresso + Tiramisù");
{
  const cart = [
    line(item("krk-pizza-margherita", "pizza", 2790)),
    line(item("krk-drink-espresso", "drinks", 800)),
    line(item("krk-dessert-tiramisu", "desserts", 1400)),
  ];
  const r = getActiveComboDeals(cart, cfg([ITALIAN_CLASSIC, COMBOS[1], COMBOS[2]]));
  expect("activeDeal.id", r.activeDeal?.id, "italian-classic");
  expect("isComplete", r.isComplete, true);
  expect("missingItems", r.missingItems, []);
  expect("savings", r.savings, Math.round((2790 + 800 + 1400) * 0.1));
}

console.log("scenario 9: cart has Quattro Formaggi + Espresso + Tiramisù — Italian Classic must NOT complete (different pizza)");
{
  const cart = [
    line(item("krk-pizza-quattro", "pizza", 3290)),
    line(item("krk-drink-espresso", "drinks", 800)),
    line(item("krk-dessert-tiramisu", "desserts", 1400)),
  ];
  const r = getActiveComboDeals(cart, cfg([ITALIAN_CLASSIC, COMBOS[1], COMBOS[2]]));
  // Italian Classic is partial (margherita missing); meal-deal isn't in this
  // config since we replaced it. Other generic combos require pasta or panini.
  // So italian-classic wins as the only partial with matched items.
  expect("activeDeal.id", r.activeDeal?.id, "italian-classic");
  expect("isComplete", r.isComplete, false);
  expect("missingItems", r.missingItems, ["Margherita"]);
}

console.log("scenario 10: cart has Margherita only — partial Italian Classic, friendly missing labels");
{
  const cart = [line(item("krk-pizza-margherita", "pizza", 2790))];
  const r = getActiveComboDeals(cart, cfg([ITALIAN_CLASSIC, COMBOS[1], COMBOS[2]]));
  expect("activeDeal.id", r.activeDeal?.id, "italian-classic");
  expect("isComplete", r.isComplete, false);
  expect("missingItems", r.missingItems, ["Espresso", "Tiramisù"]);
}

console.log("scenario 11: cross-location — Warszawa item ids also match by suffix");
{
  const cart = [
    line(item("waw-pizza-margherita", "pizza", 2890)),
    line(item("waw-drink-espresso", "drinks", 850)),
    line(item("waw-dessert-tiramisu", "desserts", 1450)),
  ];
  const r = getActiveComboDeals(cart, cfg([ITALIAN_CLASSIC]));
  expect("activeDeal.id", r.activeDeal?.id, "italian-classic");
  expect("isComplete", r.isComplete, true);
  expect("savings", r.savings, Math.round((2890 + 850 + 1450) * 0.1));
}

console.log("scenario 12: pasta-combo still works for non-margherita carts");
{
  const cart = [
    line(item("krk-pasta-carbonara", "pasta", 3290)),
    line(item("krk-drink-espresso", "drinks", 800)),
    line(item("krk-dessert-tiramisu", "desserts", 1400)),
  ];
  const r = getActiveComboDeals(cart, cfg([ITALIAN_CLASSIC, COMBOS[1], COMBOS[2]]));
  expect("activeDeal.id", r.activeDeal?.id, "pasta-combo");
  expect("isComplete", r.isComplete, true);
}

console.log("scenario 13: all categories matched but minItems short — partial with missingQuantity");
{
  const cart = [
    line(item("krk-pasta-carbonara", "pasta", 3290)),
    line(item("krk-drink-espresso", "drinks", 800)),
  ];
  // pasta-combo requires pasta + drinks + desserts AND minItems=3.
  // Cart has 2 of 3 categories — banner should call out the missing category.
  const r1 = getActiveComboDeals(cart, cfg([COMBOS[1]]));
  expect("partial.isComplete", r1.isComplete, false);
  expect("partial.missingCategories", r1.missingCategories, ["desserts"]);
  // Add the dessert; now all categories match but min items still ≤ 3.
  const cart2 = [
    ...cart,
    line(item("krk-dessert-tiramisu", "desserts", 1400)),
  ];
  const r2 = getActiveComboDeals(cart2, cfg([COMBOS[1]]));
  expect("now complete", r2.isComplete, true);
  expect("missingQuantity zeroed", r2.missingQuantity, 0);
  // Now bump minItems to 4 — same cart should be partial with qty short.
  const tighter = [{ ...COMBOS[1], minItems: 4 }];
  const r3 = getActiveComboDeals(cart2, cfg(tighter));
  expect("qty-only partial isComplete", r3.isComplete, false);
  expect("missingQuantity > 0", r3.missingQuantity, 1);
  expect("missingCategories empty", r3.missingCategories, []);
  expect("missingItems empty", r3.missingItems, []);
}

console.log("scenario 14: duplicate suffix in requiredItems doesn't double the discount");
{
  // Two label aliases for the same suffix; should be deduped so savings
  // is round(price * pct), not 2 × round(price * pct).
  const cart = [line(item("krk-pizza-margherita", "pizza", 2790))];
  const dupSuffix: ComboDeal = {
    id: "dup-test",
    name: "Dup",
    description: "",
    categories: ["pizza"],
    requiredItems: [
      { suffix: "pizza-margherita", label: "Margherita" },
      { suffix: "pizza-margherita", label: "Margherita again" },
    ],
    discountPercent: 10,
    minItems: 1,
  };
  const r = getActiveComboDeals(cart, cfg([dupSuffix]));
  expect("activeDeal.id", r.activeDeal?.id, "dup-test");
  expect("isComplete", r.isComplete, true);
  expect("savings deduped", r.savings, Math.round(2790 * 0.1));
}

console.log("scenario 15: duplicate categories don't double the discount");
{
  // Cart has pizza + drinks; combo declares categories=[pizza, pizza, drinks]
  // (admin shouldn't be able to save this server-side, but the function
  // must stay defensive). Savings = (cheapest pizza + cheapest drink) × pct.
  const cart = [
    line(item("krk-pizza-margherita", "pizza", 2790)),
    line(item("krk-drink-espresso", "drinks", 800)),
  ];
  const dupCat: ComboDeal = {
    id: "dup-cat",
    name: "Dup cat",
    description: "",
    categories: ["pizza", "pizza", "drinks"],
    discountPercent: 10,
    minItems: 2,
  };
  const r = getActiveComboDeals(cart, cfg([dupCat]));
  expect("isComplete", r.isComplete, true);
  expect("savings deduped", r.savings, Math.round((2790 + 800) * 0.1));
}

if (failures > 0) {
  console.log(`\n${failures} FAILURE(S)`);
  process.exit(1);
}
console.log("\nall scenarios pass");
