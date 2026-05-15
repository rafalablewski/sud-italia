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

- **Removed "PLN 10 Off"** — strictly dominated by Free Drink (50 pts → 11.90 zł).
- **New reward ladder:** Free Drink 50 / Free Garlic Bread 70 / Free Dessert 120 / Free Personal Pizza 180 / Free Pizza 280 / 25 PLN Off 280. Every rung pays better zł/point than the rung below.

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

