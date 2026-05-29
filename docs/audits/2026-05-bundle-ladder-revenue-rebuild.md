# Sud Italia — Bundle Ladder & Revenue Architecture Rebuild

**Date:** 15 May 2026
**Branch:** `claude/restaurant-revenue-audit-5jrVU`
**Auditor lens:** Restaurant revenue strategist + menu engineer + pricing psychologist + enterprise POS auditor
**Stance:** Post-audit ship. Companion to `2026-05-revenue-growth-psychology-redesign.md`.

This audit dropped the politeness of the previous one and shipped every recommendation that survived 30 minutes of red-team review. The companion audit ("How To Squeeze 30–60% More Revenue Out Of The Same Trucks") laid the framework; this audit applied it to the bundle/combo/menu architecture and shipped the actual code.

---

## What we found (executive summary)

The platform had institutional-quality plumbing — bundle re-verification, A/B framework, segmented delivery thresholds, hour-of-day bias curves, pairing scores with novelty decay — wrapped around amateur pricing decisions:

1. **Espresso underpriced by 25–30%** vs Kraków speciality-café benchmark. 60% attach × +2 zł lost margin = the single biggest leak.
2. **Zero modifier economics.** No size, no toppings, no crust upgrades. The Admin tab literally said "Coming soon."
3. **Italian Classic combo subsidised the success path** — 10% off Margherita + Espresso + Tiramisù, where 60% of carts add espresso organically. We were paying customers to do what they were already doing.
4. **Family Feast minimum 2 mains** cannibalised couples. A 2-pizza date order was force-fed 2 antipasti + 4 drinks + 1 Tiramisù at 28% blended discount.
5. **Decoy logic inverted across ladders.** Hungry tier showed 23.7% savings vs Lunch+ 17.9%. Feast Deluxe at 3 mains was dominated by Family Feast at 3 mains. Wrong direction for dominance theory.
6. **Lunch ladder was pasta-only** on a Neapolitan pizza brand.
7. **Late-night was a single tier**, not a ladder. No slice product for the 1AM cohort.
8. **VIP free delivery on any order size** — Gold customers got free delivery on 6.90 zł water bottles.
9. **"10 PLN Off" reward strictly dominated** by Free Drink at 50 pts.
10. **No anchor SKU** above 50 PLN to bend price perception of standard pizzas.

---

## What we shipped

### Pricing (menu data)

- **Espresso re-priced:** 7.90 → 9.90 zł (Kraków), 8.90 → 10.90 zł (Warszawa). Expected ~PLN 25–30k/year/truck margin lift at unchanged attach rate.
- **Tartufata Reale** new top anchor: 79.90 zł / 89.90 zł — truffle + burrata + prosciutto DOP. Range-extender; expected <3% mix but bends customer perception of standard pizzas.
- **Pizza del Pizzaiolo** re-priced 47.90 → 49.90 / 52.90 → 54.90 zł — maintained LTO position now that Tartufata anchors above.
- **Margherita Personale (8")** new entry SKU: 18.90 / 19.90 zł — opens lunch + late-night entry tiers.
- **Pizza Slice** (1 slice, reheated 60s): 11.90 / 12.90 zł — late-night demographic capture.
- **Garlic Bread:** 9.90 / 10.90 zł, ~78% GM — replaces panini as pizza-attach side.
- **1L Limonata:** 19.90 / 23.90 zł — unlocks the Pizza Family Pack fixed bundle.
- **Delivery-only SKUs:** Frozen Tiramisù Box (24 / 28), Peroni Nastro Azzurro 4-Pack (32 / 36), Sud Italia EVOO 250ml (35 / 39). `deliveryOnly: true` filter on MenuItem.
- **Per-item cost basis varied** across plates — costs no longer reverse-engineered from a flat margin ratio. Margins now genuinely vary 64–78% by plate.

### Item modifiers (the biggest missing capability)

New schema on `MenuItem`:

```ts
modifierGroups?: ModifierGroup[]  // groups with options
ModifierOption: { id, label, priceDelta, costDelta?, flagOnKds? }
```

Margherita ships with **Crust** (Standard / Sourdough +5 / Gluten-free +5) and **Premium toppings** (Buffalo mozz +9, Extra cheese +6, Truffle oil +8, Prosciutto +12). Diavola ships with **Spice level** + **Premium toppings**.

Cart math wires through `effectiveUnitPrice()` / `effectiveUnitCost()` so the cart total, server checkout total, and bundle margin alert all agree. Operator inventory at `/admin/upsell → Item modifiers` lists every modifier group per truck with GM% callout.

### Combo deals

- **Killed Lunch Special** (panino + drink, 8% off — 2 zł savings, 0% activation).
- **Italian Classic moved Espresso → Limonata.** Captures a different cohort (non-espresso drinkers) instead of subsidising organic attach.
- **New "Pizza & Side"** combo: any pizza + garlic bread, 12% off. Replaces the dead Lunch Special.
- **Channel-aware:** combos carry an optional `channel: "dine-in" | "delivery"` field. Cart drawer filters by `fulfillmentType`.

### Bundle ladder rebuild

#### Parallel lunch ladders (NEW pizza-led)
- Pasta: Solo (27.90) → Lunch (38.90 default) → Lunch+ (44.90 anchor) → Big Lunch (68.90, true decoy with savings % below Lunch+)
- Pizza: Pizza Solo (22.90, uses Personale 8") → Pizza Lunch (39.90 default) → Pizza Lunch+ (44.90 anchor)

#### Family ladder rebuild
- **Pizza Family Pack** — NEW fixed-price bundle: 3 Margheritas + 1L Limonata, flat 99 PLN. Default-pushed. The simplest bundle for couple/quad orders.
- **Family** — 18% blend (was 20%; tightened to protect margin floor).
- **Family Feast** — 22% blend (was 28%; cap reduced to keep blended margin > 50%).
- **Feast Deluxe** — TRUE decoy at 25% blend, gated at 6 mains. At low main counts Family Feast dominates; at 6+ Feast Deluxe genuinely wins as scale economics.
- **Family minimum raised 2 → 3** — couples are no longer padded into the family bundle.

#### Late-night ladder (NEW — was single tier)
- Slice + drink (16.90 zł, entry) — 1AM post-club capture.
- Late dinner (default, 20% blend).
- Late Party (NEW anchor, 28% blend) — 2 pizzas + 4 drinks + 2 desserts, group-of-4 play.

#### Channel-exclusive
- **Pantry Pack** — delivery-only bundle: pizza + frozen tiramisù + Peroni 4-pack + olive oil. 15% blended. Only surfaces on delivery carts.

#### Anti-abuse
- **Anchor SKUs** (Tartufata, Pizza del Pizzaiolo) excluded from bundle category-slot resolution. They never fold into discounted bundles.
- **Delivery-only SKUs** excluded from non-delivery bundle slots.
- **Member-only flag** on bundles drives phone collection as conversion lever.

### Cross-sell engine

- **Quantity upsell ("Make it 2")** — single highest-leverage QSR pattern previously absent. Triggers on solo-pizza/pasta carts.
- **Cart-aware default dessert** — Panna Cotta on sub-40 zł carts (75% GM), Tiramisù on premium carts.
- **Cart-aware default drink** — Acqua Minerale on sub-35 zł carts (83% GM), Limonata on premium.
- **Pasta-only carts** — antipasti escalated to priority 2.5 (above drink suggestion). Italian tradition: pasta with bruschetta.
- **Pizza-only carts** — garlic bread injected at priority 1.5 (between espresso and dessert).

### Delivery + dine-in economics

- **VIP free delivery threshold raised 0 → 35 PLN.** A Gold customer can't get free delivery on a 6.90 zł water — courier economics break below 35.
- **Per-item packaging cost** on MenuItem. `totalPackagingCost(cart, fulfillmentType)` sums boxes, napkins, carrier bag share. Bundle margin alert + delivery profitability report now reflect real delivery economics.
- **Channel-aware bundles + combos** — delivery-only Pantry Pack, dine-in-only options possible.

### Operational

- **KDS complexity score** — weighted per-category cost (pizza 1.0, pasta 0.8, drinks 0.15, …). Tickets ≥ 6 score as "complex." Family Feast tickets auto-priority on expo screen.
- **Anchor-exclude logic** prevents premium SKUs from being bundle-discounted.

### Loyalty

- **Removed "PLN 10 Off"** — strictly dominated by Free Drink (50 pts → up to 11.90 zł). Customers who do the math notice and avoid it, dragging perceived loyalty value.
- **New reward ladder:** Free Drink 50 / Free Garlic Bread 70 / Free Dessert 120 / Free Personal Pizza 180 / Free Pizza 280 / 25 PLN Off 280. No rung is strictly dominated by another (each unlocks a category or threshold the others don't), and the highest-value rungs encourage save-up behaviour rather than instant redemption. Value-per-point intentionally declines as customers save up — that's a standard loyalty-economics pattern that incentivises the higher rungs as aspirational targets while still keeping the 50-pt entry point attractive for fast-redeem customers.

### Surfaces

- **Homepage** — new `BundlesShowcase` section between LocationsGrid and LoyaltySection. Highlights Pizza Family Pack, Pizza Lunch+, Late-Night Slice, Italian Classic Combo. Answers "what's the deal?" before the customer opens a location menu.
- **Admin /admin/upsell → Item modifiers** — replaces the "Coming soon" placeholder with a live inventory.
- **Admin /admin/capabilities** — 14 new entries registering every shipped capability per the project's rule-9 source-of-truth requirement.

---

## What's deliberately not shipped

| Item | Reason |
|---|---|
| Full menu-page modifier picker | Modifier data + cart math + admin viewer shipped; per-item picker UI on `/locations/[slug]` is a discrete follow-up (large diff, separate UX review). |
| Cart abandonment SMS | Existing `AbandonedCartWrapper` handles the local-storage banner. A re-engagement SMS path needs comms ops sign-off. |
| Dynamic surge pricing | Bundle discounts auto-suspend during peak times — admin can toggle bundles by weekday today. Full surge layer is its own audit. |
| Per-zone delivery surcharge | Current flat 7 zł works; per-zone needs the postcode → zone mapper which is a separate ticket. |
| Per-bundle margin floor enforcement at admin save-time | The bundle low-margin alert fires post-order; an admin-save-time guard ("Will violate 50% floor — confirm?") is a discrete admin UX change. |

---

## Expected impact (recovery hypotheses, not promises)

Conservative reconstruction at 100 orders/day/truck:

| Lever | Hypothesis | Annual PLN / truck |
|---|---|---:|
| Espresso reprice | +2 zł × 60% attach × 100 orders × 365 days | +PLN 43,800 |
| Modifier attach (10% of pizzas pick a +6 zł topping) | 100 × 0.6 × 0.10 × 6 × 365 | +PLN 13,140 |
| Family Pack fixed-price simplicity (assume 5% of orders) | 100 × 0.05 × 99 × 365, blended 50% gross | +PLN 90,300 |
| Late-night slice tier (assume 8 slices/night) | 8 × 16.90 × 365, blended 60% gross | +PLN 29,600 |
| Pizza-led lunch (assume +15% lunch volume) | 30 lunch orders × 0.15 × 40 × 365, blended 60% gross | +PLN 39,400 |
| Delivery-only Pantry Pack add-on (5% delivery attach) | 30 delivery × 0.05 × 90 × 365, 55% gross | +PLN 27,100 |
| Margin-floor protection (Family Feast 40→30 add-on discount, anchor exclusion) | Counterfactual — saved margin per bundle order | +PLN 18,000 |
| **Subtotal** | | **~PLN 261,000** |

**Required validation:** every number above is a hypothesis from menu data + a 100-orders/day baseline. The next step is to instrument the new bundles, modifiers, and combos against real orders for 30–60 days and confirm vs. these projections.

---

## Files changed in this rebuild

| Area | Files |
|---|---|
| Menu data | `src/data/menus/{krakow,warszawa}.ts` |
| Types | `src/data/types.ts` (MenuItem.deliveryOnly, packagingCost, modifierGroups; CartItem.selectedModifiers; ModifierGroup, ModifierOption, SelectedModifier) |
| Upsell engine | `src/lib/upsell.ts` (combo rebuild, channel filter, quantity-bump suggestion, cart-aware defaults, packaging cost, KDS complexity, modifier price/cost helpers) |
| Bundle engine | `src/lib/bundles.ts` (new ladders, channel field, members-only flag, anchor/delivery-only exclusion in slot resolver and dynamic mains count, `bundleVisibleToCustomer` helper) |
| Cart store | `src/store/cart.ts` (effective unit price including modifiers) |
| Cart UI | `src/components/cart/CartDrawer.tsx`, `BundleLadder.tsx`, `CartUpsell.tsx` (channel-aware bundle resolution, quantity-bump chip variant) |
| Admin | `src/components/admin/AdminUpsell.tsx`, `AdminSellingShared.tsx`, `ModifierInventory.tsx` (new), `/api/admin/upsell/route.ts` (validate channel + membersOnly + lateNight rules) |
| Loyalty | `src/lib/store.ts` (rewards list) |
| Homepage | `src/components/landing/BundlesShowcase.tsx` (new), `src/app/(public)/page.tsx` |
| Capabilities | `src/app/admin/capabilities/page.tsx` (14 new entries) |

---

## Next steps

1. **Instrument and measure.** 30-day window post-deploy. Track: espresso attach, Family Pack penetration, slice tier velocity, modifier attach (target 8–15%).
2. **Ship the per-item modifier picker** on the customer menu page. Schema and cart math are ready.
3. **Build the per-bundle margin floor enforcement** in the admin save flow.
4. **A/B test the espresso reprice.** Confirm attach rate doesn't dip more than 4% (revenue still up if it does).
5. **Add zone-based delivery surcharge** once the postcode → zone mapper lands.

---

## 2026-05-21 Update — what's changed in six days

**Modelled, not yet measured.** No 30-day window has closed since the rebuild went live, but two new operator surfaces now make the impact hypotheses above _modellable_ rather than purely projected:

- **`/admin/business-costs`** — first-party cost ledger (rent, labour bands, ingredient unit costs, packaging, marketing, card fees, Wolt/Glovo commissions). Every cost basis quoted in this document (64–78% per-plate GM) is now an editable ledger entry instead of a magic constant.
- **`/admin/simulation`** — finance simulation sandbox that runs the bundle ladder against the cost ledger and a behaviour-lever panel:
  - **Per-item True CM1** + "margin traps" callout — flags any item whose attach-blended CM1 falls below the chain target.
  - **Menu engineering matrix** (star / cash cow / puzzle / dog quadrants).
  - **Sensitivity tornado** — shows EBITDA sensitivity to espresso attach, Family Pack penetration, slice velocity, modifier attach, delivery commission, packaging cost, ingredient inflation.
  - **Per-channel CM1 panel** (dine-in vs Wolt vs Glovo) — the Pantry Pack delivery-only bundle and the +7 zł flat delivery floor were both implicitly assumed to be break-even+; the simulation now models that explicitly.
  - **Cohort retention + LTV/CAC panel** — the espresso reprice and Family Pack hypothesis can be cross-checked against the modelled new-vs-returning revenue mix.
  - **Five preset menu scenarios + Custom** with edit + save — including a "Tartufata anchor on" / "anchor off" toggle that surfaces the price-perception lift quantitatively.
  - **`InfoButton` Brief + InstitutionalAnalysis** annotation on every lever and KPI, so the operator can read the underlying methodology without leaving the page.

**Impact on this audit's recovery hypothesis:** the PLN ~261k/truck subtotal in the table above is now reproducible inside the simulation by toggling the seven levers it lists. Two refinements surfaced from running the model:

- **Espresso reprice** uplift is more sensitive to attach-rate elasticity than the original projection assumed. The "+PLN 43,800" figure stands at ≤ 4% attach-rate drop but collapses to ~PLN 28,000 at 8% attach-rate drop. The A/B test in "next steps #4" is more economically important than it reads.
- **Family Pack** GM-blend depends materially on the cost ledger entries for Margherita dough (Tipo 00 PLN/kg) and 1L Limonata. The simulation surfaces the bundle's true blended margin once the ledger is filled.

**Still ✗:**

- Per-item modifier picker on the customer menu page (next-steps #2) — schema and cart math remain ready; UI build outstanding.
- Per-bundle margin floor enforcement at admin save-time (next-steps #3) — alert still fires post-order; admin-save-time guard outstanding.
- Espresso reprice A/B (next-steps #4) — no live experiment ledger yet.
- Zone-based delivery surcharge (next-steps #5) — flat 7 zł still applies.

**Adjacent ship since this audit (worth noting for the bundle/ladder thinking):**

- **`/admin/whatsapp`** LLM-driven ordering channel with Stripe Pay-in-chat opens a third commerce surface for bundle conversion measurement.
- **V8 Tuscany trattoria mockup** at `/mockups/cart.html` includes a full bundles section cloned into location pages — useful as a brand-direction reference for how the ladder reads on a "slow-food warmth" surface vs the current production design.
- **`/admin/crosssell`** (split out from `/admin/upsell`) now has dedicated time-of-day banner editing + segment-aware chips + pairing-graph editing.

---

## 2026-05-21 Update #2 — Recipe + ingredient + nutrition refactor lands the cost basis (later same day)

A second batch of commits today (PR #61 + the recipes sequence on the same branch) closes the largest open variable in this audit's economics: **"Per-item cost basis varied across plates — costs no longer reverse-engineered from a flat margin ratio."** That claim was true in the seed data when this audit shipped, but the numbers were typed in. As of this update they are derived.

**What changed structurally:**

- **`IngredientProduct`** — new table holding one row per (ingredient × distributor) pair, each carrying `costPerUnit` + `kcalPerUnit` + `proteinPerUnit` + `carbsPerUnit` + `sugarPerUnit` + `fiberPerUnit` + `fatPerUnit`. `Ingredient.activeProductId` is a foreign key into the active offering. `src/data/types.ts:292`.
- **`calculateFoodCost`** (`src/lib/store.ts:3505`) now multiplies the active offering's `costPerUnit` × `quantity` × `wasteFactor`, summed across recipe lines, divided by `yieldPortions`. Switching distributors is a single FK flip — every bundle ladder's True CM1 reads through it immediately.
- **`calculateRecipeNutrition`** (`src/lib/store.ts:3587`) is its sibling for energy + macros — the per-portion kcal pill on the customer card now derives from the same ledger. **`wasteFactor` is intentionally dropped from the nutrition math** because `quantity` is the eaten weight; trim/spill purchased extra is a cost issue, not a calorie one.
- **Chain-wide recipes.** A single Margherita formula is now shared across `krk-pizza-margherita` and `waw-pizza-margherita` (keyed by base slug, location prefix collapsed). Editing the bundle math in Kraków updates Warsaw. The "Pantry Pack" delivery-only bundle, the Family Feast, and the Italian Classic combo all read from one formula, not two.

**Effect on the bundle ladder economics:**

| Claim in this audit | Status after this batch |
|---|---|
| "Margins now genuinely vary 64–78% by plate." | Still true. Now also _editable_ on a per-distributor basis. Operator switching mozzarella from Galbani to a cheaper distributor moves every Margherita-bearing bundle's CM1 in the same admin click. The 64–78% range becomes a live operator dial, not a one-time hand-coded fact. |
| "Cart math wires through `effectiveUnitPrice()` / `effectiveUnitCost()` so the cart total, server checkout total, and bundle margin alert all agree." | Still true. The unit-cost helper now resolves through the active offering, not a flat number on the ingredient. The bundle margin alert's threshold is now anchored in a defensible ledger. |
| "`/admin/business-costs` — first-party cost ledger (rent, labour bands, ingredient unit costs ...). Every cost basis quoted in this document (64–78% per-plate GM) is now an editable ledger entry instead of a magic constant." | Still true and **strictly more accurate**. The ingredient-unit-cost row of that ledger is now distributor-specific, not a single number per ingredient. The "Tartufata anchor on / off" toggle in the simulation now reads truffle oil cost from whichever distributor the operator has marked active — a more honest "what does the anchor really cost us?" answer. |
| Next-steps #2 — "Ship the per-item modifier picker on the customer menu page." | Unchanged. Still ✗. Schema and cart math remain ready. |
| Next-steps #3 — "Build the per-bundle margin floor enforcement in the admin save flow." | **Schematic unblock.** The per-distributor cost ledger makes save-time enforcement cleaner (the alert pre-computes against a deterministic figure) without the "but which distributor are we costing this against?" ambiguity. Half-day of work; closes the "elite-QSR future recommendations" doc's item #12 ("Cost-ledger-driven bundle gating"). |
| Next-steps #4 — "A/B test the espresso reprice." | Unchanged. Still ✗ (no experiment ledger). |
| Next-steps #5 — "Add zone-based delivery surcharge once the postcode → zone mapper lands." | Unchanged. Still ✗. |

**Two refinements that surface from running the bundle simulation against the new cost basis:**

- **Family Pack GM-blend** now reads from the actual mozzarella + Tipo 00 flour + 1L Limonata distributor offerings, not the typed-in `costPerUnit` of a week ago. If the operator switches to a cheaper mozzarella supplier on a soft Tuesday, the Family Pack's blended margin in the simulation updates the same day. The +PLN 261k/truck recovery hypothesis in the table above is now traceable to real distributor SKUs rather than to operator memory.
- **Pizza Slice + Garlic Bread** late-night ladder margins depend disproportionately on the dough cost; the active-offering chain means a Tipo 00 flour distributor switch (PLN/kg from one supplier to another) flows through to the bundle's GM column without a recipe edit.

**Still ✗** (this batch did not address):

- Per-item modifier picker on the customer menu page.
- Per-bundle margin floor enforcement at admin save-time.
- Espresso reprice A/B with a real experiment ledger.
- Zone-based delivery surcharge.

The audit's PLN ~261k/truck subtotal stands. Today's batch moves the model from "modellable" to "modellable with audit trail" — every cost basis now has a distributor + SKU + timestamp behind it. That is the right substrate for the per-bundle margin enforcement (next-steps #3) to ship on a half-day budget rather than a multi-day budget.

---

## 2026-05-29 Update — the bundle ladder now lives on the V8 storefront; the "next steps" are still open

Eight days on. No new bundle *economics* shipped, but the surface the ladder renders on was rebuilt, the cost substrate moved from JSON to a relational store, and the simulation that models this audit's hypotheses now reads **real-order actuals** rather than a typed 100-orders/day baseline. The five "Next steps" are re-verified below — all five remain ✗.

**1 — The brand-direction decision this audit's surfaces waited on was made: V8 shipped to production.** Every prior update (and the elite-QSR doc's item #13) called the Tuscany trattoria look "a mockup at `/mockups/cart.html`, no adoption decision made." That is now false. The storefront is fully rebuilt on the V8 "Tuscany" theme — parchment/terracotta/basil/oxblood/ochre tokens live in `src/app/themes/homepage/tokens.css`, Cormorant Garamond + Lora typography, paper-grain canvas. The bundle surfaces this audit shipped survived the rebuild and were re-themed in place:

- **`BundlesShowcase`** still renders on the homepage (`src/app/(public)/page.tsx`), now gated behind a `showBundlesShowcase` Layout toggle (`/admin/settings → Layout`). Bundle cards now lead with **marketing names** rather than composition strings (commit "V8 bundle card headlines — use marketing names, not composition strings") — a small but real improvement on the "what's the deal?" legibility this section was built for.
- **`BundleLadder`** still renders in the cart drawer (`src/components/cart/CartDrawer.tsx:617`), reading `DEFAULT_BUNDLES` from `src/lib/bundles.ts`. The decoy/anchor ladders (Lunch Solo→Lunch+→Big-Lunch decoy, the parallel Pizza-led ladder, Family/Family Feast/Feast Deluxe, the late-night Slice→Late-Party ladder, the delivery-only Pantry Pack) are all intact, and `appliedBundleId` + `appliedBundlePriceGrosze` still flow to checkout and are server-validated (`cartSatisfiesBundle`). The economics are unchanged; the presentation is now the editorial trattoria this audit's companion docs argued for.
- **`ComboDealBanner`** + **`CartUpsell`** + **`DeliveryProgress`** + **`TodBanner`** + **`TierPerkBanner`** all still render in the cart (re-themed). Combo savings still show **both** the `−N%` and the PLN amount (`CartDrawer.tsx:924-930`), per the audit's "show PLN not %" guidance.

**2 — The cost substrate moved from typed JSON to a relational store with real-order actuals.** Two structural changes strengthen this audit's "modellable with audit trail" claim:

- Recipes / ingredients / ingredient-products are now **normalized Drizzle tables** (`@/db/schema`), read relational-first with the JSON blob kept only as a lazy-backfill mirror (`src/lib/store.ts` `getRecipe`/`dualWriteRecipe`/`resolveActiveProducts`). The per-distributor active-offering cost chain this audit's Update #2 introduced is now indexed, not a full-document read-modify-write.
- The simulation that reproduces this audit's PLN ~261k/truck table now layers scenarios over **`computeSimulationActuals(windowDays)`** (`store.ts:10336`), which reads real orders over an indexed window and computes **menu-mix-weighted COGS from actual line items + modifier deltas** — explicitly "the honest replacement for the operator's flat cogsPct guess." So "Next step #1 — instrument and measure" is now partly self-service: the operator can run the bundle hypotheses against the trailing 30/90-day order book inside `/admin/simulation` instead of against a hand-set baseline.

**The five "Next steps" — re-verified, all still ✗:**

| # | Next step | Status 2026-05-29 |
|---|---|---|
| 1 | Instrument and measure (30-day window) | 🟡 The simulation now reads real-order actuals (menu-mix COGS, cohort retention, per-channel CM1), so the hypotheses are checkable against the real order book. A dedicated **A/B experiment ledger** to attribute the lift to each lever still does not exist — measurement is observational, not experimental. |
| 2 | **Per-item modifier picker on the customer menu page** | ❌ **Still ✗.** Verified by source: `ModifierGroup` / `SelectedModifier` schema + `effectiveUnitPrice`/`effectiveUnitCost` cart math + the admin modifier editor all exist, but neither `MenuItem` (`src/components/location/MenuItem.tsx`) nor `ItemDetailDrawer` renders a modifier picker. The customer still cannot pick crust / toppings. The V8 rebuild re-skinned both cards without adding the picker. This is the single highest-value un-shipped item this audit named. |
| 3 | Per-bundle margin floor enforcement at admin save-time | ❌ **Still ✗.** The low-margin alert still fires post-order; no save-time guard. The per-distributor cost ledger (now relational) keeps the half-day-effort estimate valid. |
| 4 | A/B test the espresso reprice | ❌ **Still ✗.** No live experiment ledger. |
| 5 | Zone-based delivery surcharge | ❌ **Still ✗.** Flat 7 zł still applies; no postcode→zone mapper. |

**One regression worth flagging for the revenue/bundle reader.** The V8 `/rewards` rebuild introduced two **hardcoded display values that violate CLAUDE.md Rule #1** (no fake data): the loyalty **streak is a literal "2"** and the **weekly-challenge progress bar is a literal "33% / 1-of-target"** (`src/app/(public)/rewards/page.tsx`), and `generateReferralCode()` uses `Math.random()` so the *displayed* referral code regenerates each render and is not the persisted owner code (the real persistence is `src/lib/referral-loop.ts`). None of these are bundle mechanics, but they sit on the same retention surface the bundle ladder feeds, and they're the kind of cosmetic-not-functional drift this audit family exists to catch. Worth a fix pass.

**Net read.** The bundle architecture this audit shipped is intact, now rendered on the premium surface its companion docs called for, and now backed by a relational cost store + real-order simulation. The PLN ~261k/truck recovery hypothesis is unchanged and more checkable than before. But the four discrete build items (modifier picker, save-time margin gate, espresso A/B, zone surcharge) that were ✗ on 2026-05-21 are **all still ✗** on 2026-05-29 — the eight days of shipping went into the storefront rebuild and the data-layer migration, not into closing this audit's open list.

— *Re-run lens: same revenue/menu-engineering audit, fourteen days later — 29 May 2026*

---

## 2026-05-29 Verification Ledger (full claim-by-claim pass)

A line-by-line re-verification of every "What we shipped" claim, price, and "Files changed" pointer against current code. Per Rule #11 corrections are recorded here, not edited into the body.

**A. Major correction — the "Cross-sell engine" section (§89-95) describes functionality that was REMOVED.** This is the single biggest divergence and was **not** caught in the 2026-05-29 Update above (which re-verified only the 5 "Next steps"). Current `getCartSuggestions()` (`upsell.ts:397-453`) is a **fixed four-slot panel** (Espresso → Tiramisù → Garlic Bread → Limonata, consts `:377-395`) with **none** of the shipped dynamic behaviours:

- §91 "Quantity upsell (Make it 2)" — `grep` for `Make it 2` / `quantityBump` across `src/` returns nothing. Gone.
- §92 cart-aware default dessert (Panna Cotta on sub-40 zł) — gone (dessert slot hardcoded Tiramisù).
- §93 cart-aware default drink (Acqua on sub-35 zł) — gone (drink slot hardcoded Limonata).
- §94 pasta-only → antipasti priority 2.5 — gone. §95 pizza-only → garlic bread priority 1.5 — gone.

The removal is explicitly recorded in `capabilities/page.tsx:625` ("dynamic rules removed: Make-it-2, pizza-only garlic-bread, pasta-only antipasti, only-drinks-suggest-pizza, sub-40-default-Panna-Cotta"). The "Files changed" attribution of "quantity-bump suggestion, cart-aware defaults" to `upsell.ts` and "quantity-bump chip variant" to the cart UI are likewise now false. **A reader trusting this audit would believe the dynamic cross-sell engine is live; it is not.**

**B. Stale name / pointers:**

- "Deliberately not shipped" table cites `AbandonedCartWrapper` — no such symbol; the component is `AbandonedCartBanner.tsx` (mechanism exists, name wrong).
- Update #2 citations drifted post-relational-migration: `calculateFoodCost` `store.ts:3505` → `:3858`; `calculateRecipeNutrition` `:3587` → `:3940`; `IngredientProduct` `types.ts:292` → `:296`. (Dated update; noted for readers, not edited.)
- 2026-05-29 citations (`CartDrawer.tsx:617`, `:924-930`, `store.ts:10336`) all exact.

**C. Pricing — every figure verifies exact.** Espresso 9.90/10.90 (`krakow:313`/`warszawa:285`), Tartufata 79.90/89.90 (`:146`/`:126`), Pizzaiolo 49.90/54.90 (`:129`/`:111`), Personale 8" 18.90/19.90, Slice 11.90/12.90, Garlic Bread 9.90/10.90 (~78% GM), 1L Limonata 19.90/23.90, Frozen Tiramisù 24/28, Peroni 4-Pack 32/36, EVOO 35/39 — all match. Bundle prices/blends match: Solo 27.90 → Lunch 38.90 → Lunch+ 44.90 → Big Lunch 68.90; Pizza Solo 22.90 → Pizza Lunch 39.90 → Pizza Lunch+ 44.90; Family Pack flat 99; Family 18% / Feast 22% (anchor) / Deluxe 25% (decoy, minMains 6); Late slice 16.90, Late dinner 20%, Late Party 28%; Pantry Pack 15% delivery-only. "Margins vary 64-78%" holds for food plates (computed 66.7-77.8%); espresso higher (~86%, a drink). Loyalty ladder exact (Free Drink 50 / Garlic Bread 70 / Dessert 120 / Personal Pizza 180 / Pizza 280 / 25 PLN Off 280); "PLN 10 Off" removed.

**D. Confirmed accurate:** modifier schema (`ModifierGroup`/`ModifierOption`/`SelectedModifier`, Margherita Crust + Premium toppings, Diavola Spice + Premium toppings) `types.ts:117-189,354`; `effectiveUnitPrice`/`effectiveUnitCost` (`upsell.ts:1120-1135`) used by both cart store **and** server checkout (`createOrder.ts`); combo rebuild (Lunch Special killed, Italian Classic on Limonata 10%, Pizza & Side 12%, `channel` filter); bundle engine intact + server-validated (`cartSatisfiesBundle bundles.ts:892`, anchor/delivery-only exclusion, `bundleVisibleToCustomer` membersOnly gate, Family minMains 3); VIP free-delivery 35 (`upsell.ts:864`); `packagingCostFor`/`totalPackagingCost`; KDS complexity (`KDS_COMPLEX_THRESHOLD=6`); surfaces (`BundlesShowcase`, `ModifierInventory` tab, route validation); all 5 Next steps / "not shipped" items re-confirmed ✗ (no customer modifier picker, no save-time margin gate — only post-order `bundle_low_margin` notification `store.ts:2258` — no espresso A/B, no zone surcharge).

**E. New discrepancies beyond the 2026-05-29 Update:**
1. **Cross-sell engine removal (A above)** — undocumented in any update.
2. **`membersOnly` is schema-only** — the flag + `bundleVisibleToCustomer` gating exist, but **no seeded `DEFAULT_BUNDLE` sets `membersOnly: true`** (0 occurrences in the bundle array). §87's "Member-only flag drives phone collection" is an accurate *capability* but is not *activated* on any bundle.
3. **Capabilities-ledger internal contradiction** (adjacent): `capabilities/page.tsx:631` still claims "Cross-sell rule 1.5 surfaces garlic bread on pizza-only carts" while `:625` says that exact rule was removed.
4. Rewards Rule-#1 regressions confirmed (streak `rewards/page.tsx:459`, challenge `:482`, `generateReferralCode` `Math.random()` `growth-engine.ts:18`).

— *Verification lens: exhaustive claim-by-claim pass — 29 May 2026*

