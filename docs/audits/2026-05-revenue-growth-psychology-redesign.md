# Sud Italia — Revenue, Growth & Psychological Redesign
## How To Squeeze 30–60% More Revenue Out Of The Same Trucks

**Date:** 14 May 2026
**Last updated:** 2026-05-29 (re-run pass — see the dated Update sections below; the body has been brought current to the code as of this date)
**Branch:** `claude/restaurant-audit-framework-d9sQD`
**Auditor lens:** Restaurant growth strategist + behavioural-psychology consultant + menu-engineering operator + restaurant-tech product architect + private-equity operating partner
**Posture:** Elite PE operational audit × casino psychology consulting × FAANG conversion optimisation. Tactical, system-thinking, profit-per-minute mindset.
**Companion to:** `2026-05-nyc-singapore-viability-audit.md` (the structural / market-fit audit). Where that audit asks "would this survive?", this audit asks: *"with the trucks and codebase you have right now, where is the money you're not making?"*

> The two food trucks in Kraków and Warszawa are leaving an estimated **PLN 240,000–420,000 per truck per year on the table** — purely from monetisation gaps, not from absent locations. Most of it is recoverable within one quarter and inside the existing code surface.

---

## Implementation status

> **Status as of 2026-05-29.** Plays 1–3 unchanged in shipped status; the §1.5 "emoji-on-gradient" conversion killer is closed at the brand-frame level (V8 Tuscany storefront in production) but **real food photography is still missing**, and the three single-day revenue items (food photography, address autocomplete, post-order single-tap espresso upsell) remain un-shipped. Tip default still None. New regression: the V8 `/rewards` streak/challenge/referral surfaces ship with hardcoded/`Math.random()` values (Rule #1). Full re-verification in the dated 2026-05-29 Update below.

Sections 2 and 3 are fully in production. Section 4 is mostly in
production (charm pricing, hero/profit-driver/anchor cards, the LTO
mechanism, and admin editability — all live; the loss-leader first-order
espresso bundle and an automated monthly LTO rotation remain open).
Every row of the design spec carries an inline tick:

- ✅ shipped — live in production on the customer + admin surfaces today
- 🟡 partial — visible to the customer, with a follow-up scoped (ML
  scorer, deeper analytics, etc.) tracked in `/admin/capabilities`
- ⛔ rejected — overruled on brand-integrity grounds (see §2.2)
- ⏳ deferred — out of scope for the current wave; tracked in §6, §9 of
  this audit

Use `git log -- src/components/cart src/lib/upsell.ts src/lib/bundles.ts`
for the surface-by-surface commit trail.

---

## 0. The Headline Numbers

### 0.1 Where the money is

Conservative reconstruction from menu costs (`src/data/menus/krakow.ts`) and a 100-orders/day baseline:

| Lever | Current state | Realistic uplift | Annual PLN per truck |
|---|---|---:|---:|
| Drink attach rate | ~20% (industry baseline for menus that bury drinks) | →55% (espresso prompt at cart) | +PLN 65k |
| Dessert attach rate | ~12% | →28% (with bundle + tiramisu hero) | +PLN 55k |
| AOV uplift via 3-tier combo | flat-priced single items | +14% AOV (decoy pricing + anchor) | +PLN 85k |
| Repeat-order frequency | ~1.6 / month / customer | →2.3 / month (streaks + saved cart + push) | +PLN 110k |
| Subscription / corporate lunch | 0 | 80 active SKUs at PLN 79/wk | +PLN 320k (across both trucks) |
| Tip pool capture | 0% (no tip module on receipt) | 8% of orders × 12% tip | +PLN 18k |
| Loyalty point ROI vs unattached spend | ~0% spread | +6% redemption-triggered visits | +PLN 25k |
| Promo-code field at checkout | absent | unlocks coded `growth-engine.ts` viral loop | +PLN 35k |

**Per-truck recoverable revenue: PLN 393k–520k/year.** Margin-weighted (food costs avoided on incremental orders), the **EBITDA delta is approximately PLN 240–320k per truck per year** — at near-zero incremental labour and zero new locations.

### 0.2 The Three Plays (Ranked By Effort × Impact)

| # | Play | Effort | Impact | Where |
|---|---|---|---|---|
| 1 | **Espresso prompt + bundle math + decoy anchor in cart drawer** | 1 sprint | +12–18% AOV | `CartDrawer.tsx`, `upsell.ts`, new `BundleEngine` |
| 2 | **Subscription / corporate lunch pass leveraging existing pooled-wallet** (`CustomerWallet.role: head \| member`) | 2 sprints | New PLN 200–400k revenue line | `customer.tsx`, `loyalty.ts`, new `/admin/subscriptions` |
| 3 | **Habit loop: variable-ratio reward + visible streak + DOB capture + "next order pre-loaded"** | 1.5 sprints | +30–45% repeat-order frequency | `growth-engine.ts`, push, `OrderConfirmation` |

Everything else is supplementary to these three.

---

## 1. Revenue Optimisation Audit — Where The Money Is Being Left

### 1.1 The leaky-bucket map

```
   Discovery  →  Land  →  Browse  →  Add  →  Cart  →  Checkout  →  Pay  →  Eat  →  Repeat
       │         │         │          │       │         │           │       │        │
       │         │      [photos]  [modifiers] [upsell] [Apple Pay]   │   [feedback]  [push]
       │         │          ✗          ✗        ⚠          ✗         │       ⚠         ✗
   [Google     [Hero       FAIL       FAIL    PARTIAL    FAIL                MEH      FAIL
    profile]   image]                                                                
       ✗          ✗                                                                  
```

Every red mark is direct revenue loss. **The biggest single one is "Add" — no item modifiers means no "make it a large", no "double cheese +PLN 6", no "add chicken +PLN 8".** Toast, Square, Sweetgreen all hit 12–18% AOV uplift on modifiers alone.

### 1.2 Why Customers Spend (the seven primary triggers, ranked by leverage on QSR)

1. **Hunger-state arousal** — visual food triggers cravings 6–9× more than text. Sud Italia has *no food photography*. Every minute on the menu page subtracts arousal.
2. **Decision-relief** — "tell me what to order" framing reduces analysis paralysis. Combo menus, "chef's pick", "most popular this hour" all do this. Sud has `popular` and `staff-pick` badges (`upsell.ts:73-78`) but no hour-of-day modulation, no "ordered 12× in the last hour".
3. **Anchor-relief** — a premium item ranges customers' price perception, then they "save" by choosing the next-down item. Sud's menu is flat-priced: Margherita PLN 28, Diavola PLN 32, Quattro Formaggi PLN 35, no PLN 48 Tartufo to anchor against.
4. **Loss aversion** — "this slot has 2 spots left" or "Margherita supply ends at 14:00" or "you'll lose 47 points if you don't order this week" all spend-trigger. Sud surfaces *none* of these.
5. **Social proof** — "Marco from Wola is eating this right now" — Sud has live activity widget infra (per capabilities page) but it is generic, not per-item.
6. **Status / identity** — "Platinum", "Gold", founder member, named-pizza ("Anna's Diavola"). Tier exists but is invisible at the moment of purchase decision.
7. **Reciprocity** — surprise dessert, free upgrade. *Zero* surprise-and-delight mechanics deployed.

### 1.3 Why Customers Hesitate

| Hesitation | Cause | Fix | Lift |
|---|---|---|---|
| "How much is this *really* going to be?" | No total preview, no fees-included pricing | Show "PLN 31.40 incl. fee" inline | +3–5% conv |
| "What time will it be ready?" | No pre-payment ETA | "Ready at 12:18" before Pay button | +3–5% conv |
| "Will the delivery driver find me?" | No address autocomplete | Google Places API | +6–10% conv on delivery |
| "Is this any good?" | Fake star ratings (legal exposure) | Real reviews from `/review/[orderId]` | +5–8% conv |
| "Do I have to make an account?" | Phone-required = loyalty enrolment | Optional guest checkout | +8–12% conv on first-time |
| "What if I order the wrong thing?" | No modifiers, no notes-coordinated dish photo | Modifier groups + per-item photos | +12–18% AOV |

### 1.4 Why Customers Abandon

Cart abandonment in QSR digital averages **52–68%** (Baymard 2024). Sud Italia's structural friction puts it at the high end. The five abandonment drivers in order of impact:

1. **Stripe redirect** to a third-party domain → 8–12 points of drop. Stripe Payment Element (in-page) or Payment Request API (Apple/Google Pay sheet) recovers most of this.
2. **Phone + name + address typed fresh every time** → 6–10 points. Saved customer + saved address recovers.
3. **Slot full discovered post-cart-build** → 4–7 points. Inline slot selection at menu page.
4. **No promo / referral code field** when user has one in their text messages → 2–4 points and *kills the entire viral loop already coded in `growth-engine.ts`*.
5. **Opaque ETA + opaque total** → 3–5 points combined.

### 1.5 Hidden Conversion Killers (Behavioural)

- **Emoji + gradient menu cards.** Brain processes them as *placeholder*, not *available product*. Reduces "want this now" arousal to near zero. Single biggest hidden loss in the entire product.
- **Identical price endings.** Every Krakow pizza ends in `00` grosze (PLN 28.00, 32.00, 35.00). No charm pricing means brains process them as expensive-round-number, not deal-bargain.
- **No tip request UI in main flow.** `CartItem` has `tipAmount` (`src/store/cart.ts:18`) but if it's offered as a generic 10/15/20 grid, capture is ~30%. With a *named-employee* "Tip Maria your pizzaiolo" prompt, capture is ~70% — and 12% average tip becomes PLN 18k/year/truck.
- **`Estimated Time` label on confirmation, not pre-pay.** Anxiety remains, friction remains.
- **No "you'll earn X points" cart preview.** Loyalty enrollment is invisible at the only moment the customer cares.

---

## 2. Advanced Upsell Systems

### 2.1 The Cart Upsell Sequence (Design Spec)

The current `getCartSuggestions` (`src/lib/upsell.ts`) suggests categories complementary to what's in the cart. **It's correct, but invisible and untimed.** Here is the institutional-grade sequence:

```
T+0   (item added to cart)                                           ✅ shipped
       │                              src/components/cart/AddToCartToast.tsx
       └─ Inline toast: "🍕 Margherita added. Customers usually add an espresso."
          (No CTA — implant the seed only. Annoying = ignored.)

T+0   (cart drawer opens)                                            ✅ shipped
       │                                src/components/cart/CartUpsell.tsx
       └─ Above subtotal:
          ┌─────────────────────────────────────────┐
          │  Complete the meal                       │
          │  ┌────────┐ ┌────────┐ ┌────────┐        │
          │  │Espresso│ │Tiramisu│ │Limonata│        │
          │  │ +6 zł  │ │ +18 zł │ │ +12 zł │        │
          │  │   83%  │ │   70%  │ │   80%  │   ← never shown to user
          │  └────────┘ └────────┘ └────────┘        │
          │   ⬆ Tap to add, no second screen.         │
          └─────────────────────────────────────────┘

T+0   (cart drawer, post-attach)                                     ✅ shipped
       │                              src/components/cart/DeliveryProgress.tsx
       └─ Free-delivery bar (animated, shimmer overlay):
          "PLN 8 to free delivery 🚚"
          On unlock: gold→green medallion card with pop-in + sweep.

T+pay (Stripe sheet)                                                 ⏳ deferred
       │                              Stripe Payment Request API ticket
       └─ Apple Pay primary CTA. Card secondary.
```

### 2.2 Upsell Taxonomy — Which Upsells Lift, Which Annoy

| Status | Upsell | Felt as | AOV lift | Implementation in this codebase |
|---|---|---|---:|---|
| ✅ | "Customers usually add…" (data-driven) | helpful | +9% | `AddToCartToast` seed copy + `CartUpsell` chips |
| ⛔ | "Make it a large +PLN 6" (modifier) | smart | +14% | **Rejected** — fixed Neapolitan portions are a brand core value (overrules §2.5 Starbucks too) |
| ✅ | "Add Pizzaiolo's espresso PLN 6" (named, named) | curated | +11% | `CartUpsell` chip with `suggestion.reason` copy |
| ✅ | "Family Feast: your mains + 2 antipasti + 4 drinks + tiramisù, 22% off" | savings | +22% AOV per family order | §3.2 bundle engine live; `family-feast` tier in `DEFAULT_BUNDLES` (`src/lib/bundles.ts`) is now *dynamic on mains* — every pizza/pasta in cart carries into the bundle 1:1 and price scales from `(mains-à-la-carte + cheapest-add-ons)` at the tier's split mains/add-ons discount blend. Surfaces at ≥3 main items, locks subtotal to the computed price via `appliedBundleId`. The applied price is computed live by `computeBundlePrice`. |
| 🟡 | "Lunch combo PLN 39: pasta + drink" | value | +18% | `TodBanner` lunch variant surfaces the generic `pasta-combo` (any pasta + drink, 10% off) during 11:30–13:00. The category-only combos sit alongside the new item-locked **Italian Classic Deal** (Margherita + Limonata + Tiramisù, 10%) — admins choose either pattern per location at `/admin/crosssell` → Combo deals. The Limonata pick (vs the originally-considered espresso) was deliberate: espresso already attaches ~60% organically, so subsidising it would have paid customers to do what they were doing for free; Limonata captures the non-espresso cohort. |
| ✅ | "Tap to make it a Gold-Tier order: +pesto bruschetta included" | status | +9% | `TierPerkBanner` — Gold/Platinum-gated, comp'd via price-0 cart line |
| ⏳ | "Try the new burrata — first 12 today" | scarcity | +6% | needs per-day inventory tracking on seasonal items |
| ⛔ | **Don't:** "Are you sure you want to add fries?" | annoying | -3% | not shipped |
| ⛔ | **Don't:** Pop-up after "Add to cart" | annoying | -5% | not shipped |
| ⛔ | **Don't:** "You forgot dessert!" guilt | annoying | -2% | not shipped |

### 2.3 Time-of-Day, Weather, And Cohort Triggers

| Status | Trigger | Surface | Example |
|---|---|---|---|
| ✅ | 07:00–10:00 | Cart top | "Pre-order lunch — beat the noon rush" (`TodBanner` morning variant) |
| ✅ | 11:00–13:00 (rush) | Cart top | "Lunch combo — pasta + drink, save 10%" (`TodBanner` lunch variant, surfaces the `pasta-combo` / `pizza-side` generic combos or the item-locked Italian Classic Deal, whichever the cart qualifies for) |
| ✅ | 14:00–16:00 (afternoon) | Cart top | "Espresso break — pickup in 4 min" with one-tap add (`TodBanner` afternoon) |
| ✅ | 17:00–19:00 | Cart top | "Cooking for the table tonight?" hint with combo pairing (`TodBanner` dinner — surfaces the active combo from `getActiveComboDeals`) |
| ✅ | 20:00–23:00 | Cart top | "Late-night espresso & dessert" one-tap espresso add (`TodBanner` late) |
| ⏳ | Rain forecast | Hero card | "Rainy day = warm pasta. Free delivery over PLN 50 today." — needs weather feed wiring |
| ⏳ | Customer's 3rd order | Cart top | "Loyalty unlock: try the Pizzaiolo's Choice (Platinum-only — comp this one)" — needs lifetime-order trigger |
| ⏳ | Returning after 14d gap | Push + landing | "Margherita waiting? Your usual is PLN 28 — one tap, ready 18:14" — needs push + last-order lookup |

The five hour-window variants ship with hardcoded `DEFAULT_TIME_WINDOWS` defaults in `upsell.ts`, and **`/admin/upsell` → "Time-of-day Banners"** is the live editor: per-location override of variant, hour window, title, sub, badge, CTA, optional add-item id suffix, active toggle. Empty admin list = defaults remain in effect, so no migration is needed. The rain / 3rd-order-unlock / 14-day-lapsed rows above remain ⏳ because they're new *trigger types* (weather feed, lifetime-order counter, last-order lookup) rather than hour windows — those plug into the same admin surface in a follow-up.

### 2.4 Margin-Optimised Upsell Ranking ✅ shipped

From `src/data/menus/krakow.ts` actuals:

| Item | Price PLN | Cost PLN | GM% | Per-attach profit PLN |
|---|---:|---:|---:|---:|
| Espresso | 9.90 | 1.40 | **86%** | **8.50** ← push hardest |
| Water (still 0.5 L) | 8.00 | 1.20 | **85%** | **6.80** ← push at delivery |
| Limonata | 12.00 | 2.40 | 80% | 9.60 |
| Tiramisu | 18.00 | 5.40 | 70% | 12.60 |
| Cannoli | 16.00 | 4.80 | 70% | 11.20 |
| Antipasti (burrata) | 22.00 | 7.70 | 65% | 14.30 |

**The espresso is the single highest-leverage SKU in the entire catalogue.** Roughly PLN 8.50 of margin × 60% attach rate × 100 orders/day on espresso alone makes it the hardest-pushing attachment in the cart.

`getCartSuggestions` priority numbers double as the margin × attach ranking (espresso 1, dessert 2, drink 3). Re-ordering them in `src/lib/upsell.ts` requires re-checking the cost table above — there's a comment in the file calling this out.

### 2.5 How The Best Operators Upsell

- **McDonald's:** Default-combo psychology. The single button "Make it a meal +PLN X" frames *non*-combo as the deviant choice. AOV uplift: 22%. — 🟡 **partial:** the `TodBanner` lunch variant surfaces the active combo as the default expectation during 11:00–13:00. Auto-apply when categories match exists via `getActiveComboDeals`, which now scores combos by largest savings (complete beats partial, original-index breaks ties) so a fully-satisfied combo always wins over an earlier partial one — fixes the order-dependent short-circuit that previously hid completed discounts. The new item-locked **Italian Classic Deal** (Margherita + Limonata + Tiramisù) is McDonald's-style "make it the Italian Classic" framing, admin-configurable from `/admin/crosssell` → Combo deals. A "Remove combo" CTA on the applied banner is the follow-up.
- **Starbucks:** Size laddering with named premium ("Venti"). Modifier upsells ("add an espresso shot +PLN 4"). Personalised "your usual" rebuild. — ⛔ **rejected** on the size-laddering / modifier half (fixed Neapolitan portions). The "your usual" rebuild belongs in §5.2.4 habit-loop work.
- **Uber Eats:** "Frequently bought together" + "Customers near you ordered" + algorithmic free-delivery threshold tuned per user. AOV uplift attributable to algorithmic upsell: 11%. — ✅ **shipped:** per-segment delivery threshold (first-time 39 / regular 60 / Gold/Platinum 35) live in `DeliveryProgress` and respected by the checkout charge via `computeDeliveryFee(_, _, override)`. ML upsell scorer is §9.1.
- **Domino's:** Pre-checkout "wait, don't forget…" upsell card. Polarising but proven +8% per checkout. — ✅ **shipped via** `CartUpsell` (3-up chips above subtotal).
- **Shake Shack:** Premium frozen-custard concrete attached to every burger flow as the *default* meal completer. 38% attach. — ✅ **shipped via** the margin-ranked espresso chip — always first in the 3-up grid when a pizza or pasta is in cart.

---

## 3. Cross-Sell Psychology

### 3.1 The Pairing Logic — Beyond Category Maps ✅ shipped

`CROSS_SELL_MAP` in `upsell.ts` was a category-graph. We now have a
**scored, contextual pairing graph** alongside it.

```
edge weight = f(margin, attach_history_for_THIS_customer, attach_history_for_THIS_hour, novelty_decay)
```

Example: Margherita → espresso isn't a fixed rule. It's:
- ✅ 0.82 weight at 11:00 (lunch coffee) — `CATEGORY_HOUR_BIAS` in `upsell.ts`
- ✅ 0.31 weight at 19:00 (espresso unusual at dinner) — same table
- ✅ 0.95 weight if this customer added espresso last 4 orders — `scorePairing()` reads `/api/customer/attach-history`
- ✅ 0.58 weight if customer has never tried espresso (novelty bonus) — `noveltyDecay` returns +0.08 for established customers, +0.05 for brand-new

Chip subtitle copy ships per-item via `ITEM_REASON_OVERRIDES`:
- ✅ Espresso → "Never too late"
- ✅ Tiramisù → "Pizzaiolo's fav"
- ✅ Burrata / Bruschetta → "Freshly-baked today"
- ✅ Strong recurrence (≥ 50% of last visits) flips copy to "you added it 3 of last 4 visits"

🟡 ML scorer (logistic regression on `points_ledger` join `orders`) is the
follow-up; heuristic composite ships today.

### 3.2 Bundle Architecture (Decoy + Anchor) ✅ shipped

**Current state:** ~~all items are individually priced, no bundles surfaced anywhere in the customer flow.~~ Lunch + Family Feast ladders surface in the cart drawer above the chips.

**Bundle tier — Lunch** (hour-gated, default 11:00–14:00):

| Status | Tier | Composition | Price | "You'd pay" | Saving |
|---|---|---|---:|---:|---:|
| ✅ | Solo | 1 pasta | PLN 26 | 26 | — |
| ✅ | Lunch (default-pushed) | 1 pasta + 1 drink | **PLN 32** | 38 | -6 |
| ✅ | Lunch+ (anchor) | 1 pasta + 1 drink + tiramisù | PLN 46 | 56 | -10 |
| ✅ | Decoy ("Hungry") | 1 pasta + 1 drink + tiramisù + bruschetta | PLN 58 | 76 | -18 |

The decoy makes Lunch+ look reasonable. Lunch+ makes Lunch look cheap. The default-push on Lunch creates the McDonald's combo effect. **Predicted AOV: PLN 36–42 vs current PLN 28–32.**

**Bundle tier — Family** (dynamic — mains scale with cart, quantity-gated at ≥3 pizzas+pastas; one-line hint below the gate):

The old fixed-composition family ladder locked the cart to "2 pizzas + 1 side + 2 drinks" regardless of how many pizzas the customer added — a 3-margherita cart got rewritten to 2 margheritas and paid a flat price unrelated to volume. The new family ladder is **dynamic on mains, static on add-ons**: every pizza/pasta in the cart carries into the bundle 1:1, the add-on allowance is a fixed composition, and the price is computed live by `computeBundlePrice` from `(mains-à-la-carte + cheapest-add-ons)` at the tier's split mains/add-ons discount blend.

| Status | Tier | Composition | Discount | Min mains | Live price |
|---|---|---|---:|---:|---|
| ✅ | Family | X mains + 1 antipasti + 2 drinks | **18%** | ≥3 | computed by `computeBundlePrice` |
| ✅ | Family Feast (anchor) | X mains + 2 antipasti + 4 drinks + tiramisù | **22%** | ≥3 | computed by `computeBundlePrice` |
| ✅ | Feast Deluxe (decoy) | X mains + 2 antipasti + 6 drinks + 2 desserts | **25%** | ≥6 | computed by `computeBundlePrice` |

Each tier ships with a default split mains/add-ons discount blend rather than a single flat percent. The displayed total is always whatever `computeBundlePrice` returns for the live cart at this location's à la carte prices — same number client-side, server-side, and at Stripe-session creation. Anchor stays anchor: Family Feast carries the highest effective % savings on a typical family cart; Feast Deluxe (gated higher, at ≥6 mains) has the largest absolute savings on bigger carts.

Beyond the Lunch and Family ladders above, `DEFAULT_BUNDLES` ships several more production ladders: a flat-priced `family-pizza-pack` (3 pizzas + 1L drink, PLN 99), a late-night ladder (`late-slice` / `late-night` / `late-party`), a delivery-only `delivery-pantry`, and a parallel pizza-led lunch ladder alongside the pasta-led one.

Operator margin holds at 45–50% across all three tiers because the discount applies to a basket that's already weighted toward high-GM add-ons (espresso ~86%, drinks 80%, dessert 60%). The strikethrough "you'd pay" reflects real à la carte at this location, so the "Save X" badge is always honest.

- ✅ Schema: discriminated union `BundleFixedTier | BundleDynamicTier` in `src/lib/bundles.ts`. Lunch tiers stay fixed (solo eating, no "scale with mains" concept); family tiers ship dynamic by default.
- ✅ `computeBundlePrice(bundle, cart, menu)` runs identically client-side (cart drawer chip), server-side (`createOrderFromCart`), and at Stripe-session creation. Same inputs → same number → displayed total always matches the charge.
- ✅ Composition resolution per location (`buildBundleCartLines` in `src/lib/bundles.ts`). Mains preserved as-is from the cart; add-ons resolved cheapest-first so the customer never gets a worse deal than à la carte.
- ✅ Cart subtotal locks to the computed dynamic price on tap (`appliedBundleId` in `src/store/cart.ts`).
- ✅ Checkout sends one Stripe line at the computed price with composition itemized in description.
- ✅ Admin editor at `/admin/upsell` → "Bundle ladder" — Pricing-mode toggle (Fixed / Dynamic) per tier. Dynamic mode exposes Discount %, Min mains, optional Max mains, and a Main categories multi-select. The composition editor filters out main categories so the admin can't double-count.
- ✅ Admin editor at `/admin/upsell` → "Bundle availability" — lunch start/end hours + family `minMainItems` / `hintWithin`.
- ✅ Admin validation: dynamic bundles must declare non-empty `mainCategories`, integer `minMains ≥ 1`, optional `maxMains ≥ minMains`, `discountPercent` ∈ [0, 50], and composition slots cannot reference a main category. Fixed bundles must declare `refPriceGrosze ≥ priceGrosze` (no negative savings via typo).
- ✅ Back-compat: bundles saved before the rewrite lack `pricingMode` and are treated as fixed; they continue to render + charge at their stored price. Operators opt in to dynamic per tier from the admin UI.

#### 3.2.1 Combo Discount Plumbing ✅ shipped

Bundles collapse to one Stripe line, so the discount is implicit in the price. Combos are different — line items keep their per-item prices on the Stripe receipt, and the discount is attached as a one-shot Stripe coupon (`amount_off = comboDiscount`, `currency = pln`, `duration = once`) via `session.discounts`. Without this, line items summed to the pre-discount subtotal and the customer was charged the full amount while `order.totalAmount` showed the discount — a financial-correctness bug fixed in `/api/checkout/route.ts`. `createOrderFromCart` threads `comboDiscount` + `comboName` onto the success result so the Stripe layer can build the coupon with the right name on the customer's receipt.

Three combo behaviours are now correctness-verified end-to-end (`scripts/legacy/verify-combo-fix.ts`):

- **Order-independent scoring.** `getActiveComboDeals` scores every combo, prefers fully-complete ones (largest savings, original-index tiebreak), then partials. Fixes the prior short-circuit where a pizza+garlic-bread cart got "still need pizza+desserts for meal-deal" instead of the 12% pizza-side deal applied.
- **Quantity-capped discount.** Savings = `discountPercent` × cheapest unit per matched category (or per required item suffix). 5 pizzas + drink + dessert no longer scales 10% across all 5 pizzas; one combo's worth caps the savings.
- **Item-locked combos.** New `requiredItems: { suffix; label }[]` on `ComboDeal` gates a combo on specific menu items via `id.endsWith(suffix)` so the same definition matches `krk-pizza-margherita` and `waw-pizza-margherita`. The default ladder now ships with **Italian Classic Deal** as an item-locked example (Margherita + Limonata + Tiramisù, 10%) — a Quattro Formaggi cart routes to a different promo rather than fraudulently completing this one.

Admin manages combos end-to-end at `/admin/crosssell` → Combo deals: toggle, rename, edit discount %, min items, required categories, **and pick specific menu items** via a grouped-by-category dropdown. The PUT `/api/admin/upsell` route validates `combos[].categories` against the `MenuCategory` enum and validates `requiredItems` shape, so a typo can no longer silently disable a deal at checkout.

#### 3.2.2 A/B experimentation, scarcity, weekday gating ✅ shipped

Operators run their own bundle pricing experiments from `/admin/upsell` → **Experiments** tab. `ExperimentEditor` defines a single per-location experiment with weighted variants and per-bundle discount overrides (single percent OR split mains/add-ons). Variant assignment is phone-hashed: client uses Web Crypto SHA-256 (`src/lib/experiments.ts`), server uses Node `createHash("sha256")` (`src/lib/experiments-server.ts`) — same input → same bucket → same variant on both sides → no client/server price drift. Each `BundleEvent` records the variant id; `BundleAnalyticsCard` rolls up avg paid + avg saved + total revenue per variant for direct AOV / contribution-profit comparison.

Every dynamic bundle row also carries:
- **Limited until** — ISO date input. Past-dated bundles auto-deactivate via `isBundleActiveNow()` so a "this week only" deal can't accidentally leak past its window.
- **Active days** — weekday chip selector (Mon–Sun). Empty = all week; otherwise the bundle only surfaces on matching local-day. Drives Friday Family Feast pushes / Wednesday Lunch+ defaults from admin alone.

Both validate server-side and round-trip through saves.

#### 3.2.3 Operator telemetry — funnel, cohort, low-margin alert ✅ shipped

`BundleAnalyticsCard` on `/admin/reports` surfaces (Tier-1 KPI dashboard from §3.2 red-team audit):
- bundle orders + revenue + total savings given
- anchor conversion % (target ≥ 55%)
- decoy click-through % (target ≤ 12%)
- per-bundle effective discount + avg mains
- A/B variant uplift table
- conversion funnel: impressions → composer opens → applied → composer abandons (client beacons via `navigator.sendBeacon`, persisted in `bundle-funnel.json`)
- new-vs-repeat customer cohort split (target ≥ 25% new-customer share among bundle orders proves bundles drive acquisition, not just discount existing demand)

`BundleEvent.marginRatio` is computed at write time from `MenuItem.cost`. When a real bundle order's contribution margin drops below 40%, `addNotification({ type: "bundle_low_margin", ... })` posts an alert into the operator notification inbox with bundle name + exact margin % + order total. Threshold matches the amber/red line on `BundleMarginPreview` so the live admin preview and the production alert always agree.

Slot id is also persisted on every `BundleEvent` so a follow-up dashboard can correlate bundle take rate vs slot capacity stress.

#### 3.2.4 Composer-sheet psychology + repeat-customer one-tap ✅ shipped

Bundle taps no longer auto-apply — they open `BundleComposerSheet` (Domino's "Mix & Match" pattern). Per-unit pickers for every add-on slot; live price + savings update as the customer swaps; confirm or cancel. Pre-fill stack:
1. Customer's last applied composition for this same bundle (Sprint 8 #8 — Domino's "Same as last time"; pulled via `GET /api/customer/last-bundle?phone&bundleId&locationSlug`)
2. Items already in the cart (preserves choices)
3. Cheapest available at this location (fallback)

When prior composition pre-fills, the composer header shows a gold ★ "Same as your last X — confirm or tweak below" so the customer recognises the one-tap path. Drops the perceived friction Domino's reports a ~7% AOV uplift from.

Combo × bundle clarity (§3.2 audit q3): when an active combo (e.g. Italian Classic Deal -10%) is saving the customer some PLN and a bundle ladder qualifies, the bundle CTA shows the **incremental** savings ("+ X more than your current Italian Classic Deal") AND a discrete italic disclaimer ("Replaces the active Italian Classic Deal"). Customer net-better outcome preserved; framing now matches reality so the badge disappearance isn't a surprise.

#### 3.2.5 Scheduled bundles (weekly usual) — Phase 1 ✅ shipped

Customer opts in via a 🗓️ checkbox under the cart pay-bar when a bundle is applied. On checkout success the client fires-and-forgets a POST to `/api/customer/schedule-bundle` with phone + bundle id + current weekday + slot ready-time + cart snapshot; the server captures a `ScheduledBundleIntent` (status `pending`).

Operator manages the queue at `/admin/scheduled-bundles`: filter by status (pending / active / paused / cancelled), sorted by weekday × ready-time so the layout mirrors the day's fulfilment cadence. Per-row actions: **Approve** (pending → active), **Pause** (active → paused), **Resume** (paused → active), **Cancel** (any → cancelled). PATCH `/api/admin/scheduled-bundles/[id]`.

Phase 2 (Stripe Subscription rebill on the chosen weekday) is gated on `STRIPE_SCHEDULE_WEBHOOK_SECRET` and remains a follow-up — see `docs/audits/2026-05-elite-qsr-future-recommendations.md`.

### 3.3 Free-Delivery Threshold Architecture ✅ shipped

The existing copy `delivery.add_more` / `delivery.for_free` is now a
progress bar with a personalised threshold.

| Status | Customer segment | Threshold | Lift |
|---|---|---:|---:|
| ✅ | First-time | PLN 39 (low; remove friction) | +12% complete |
| ✅ | 2–4 orders | PLN 49 (slightly raise) | +6% AOV |
| ✅ | 5+ orders | PLN 59 (regular, will hit it) | +9% AOV |
| ✅ | Gold/Platinum | PLN 35 (low floor, surface as a tier perk) | +retention |

Per-segment threshold is honoured by `computeDeliveryFee()` at checkout so
the bar and the receipt agree. Personalised free-delivery thresholds added
Uber Eats ~4% to GMV/customer in 2023 disclosures.

### 3.4 Group / Office Cross-Sell (Pooled Wallet Wedge) ✅ shipped as Sud Italia Corporate

`CustomerWallet` with `role: head | member` is *already in the codebase* (`store/customer.tsx`). This is the rarest growth primitive — fewer than 20% of QSR loyalty programs ship pooled wallets. Now productised as **"Sud Italia Corporate"** (rename from the original "for Teams" copy to better reflect the bulk-ordering use case):

| Status | Capability | Where it lives |
|---|---|---|
| ✅ | Company URL `sudita.lia/corporate/[slug]` | `src/app/corporate/[slug]/page.tsx` |
| ✅ | Min 6 employees enforced (the brief's ">5 employees" rule) | `setCorporateConfig()` floor in `src/lib/store.ts` |
| ✅ | Members order individually; charges land on the company card | Existing FamilyWallet primitive |
| ✅ | Each member earns *personal* points; head earns 20% of monthly pool | `resolveCustomerLoyalty()` corporate branch — head bonus folded into `spendablePoints` |
| ✅ | Monthly invoice with VAT-compliant breakdown emailed to billing contact | `/api/admin/cron/corporate-invoices` fires on 1st of month → `corporate.monthly_invoice` outbox event → Mailgun (when configured) |
| ✅ | Auto-pre-order: "Wednesday corporate lunch — 4 of 8 have ordered, 2h to go" | `/api/admin/cron/corporate-preorder-reminder` runs daily, fires SMS to members who haven't ordered when within 3h of the scheduled time |
| ✅ | Admin promote/configure flow | `/admin/corporate` |
| ✅ | Cart drawer banner with "Sud Italia Corporate" kicker + head-bonus accrual | `CorporateOrderBanner` |

Estimated revenue per corporate account of 8–12: PLN 1,800–3,200 per month. Twenty companies in central Warsaw + ten in Kraków = **PLN 540k–960k annual GMV** off a single feature.

---

## 4. Menu Engineering & Pricing Psychology 🟡 mostly shipped

Status snapshot. §4.2 + §4.3 mechanisms + §4.4 hierarchy are in production and admin-editable from `/admin/menu`. The two remaining gaps are §4.3 row 5 (loss-leader first-order espresso bundle) and §4.5 (monthly LTO rotation as a recurring operational cadence — the mechanism ships, the rhythm is a manager action).

What shipped:

- ✅ **Charm pricing.** Every Kraków + Warszawa item re-aligned: pizza ends in 9, premium pasta ends in 5, espresso ends in 9, desserts end in 0. Stripe Checkout, Polish JPK_V7M VAT export, and the recipe-margin seed route all read the new prices directly — no parallel constants to drift.
- ✅ **Premium anchor.** `Pizza del Pizzaiolo` lives in both menus (`krk-pizza-pizzaiolo` PLN 49.90, `waw-pizza-pizzaiolo` PLN 54.90) with `menuRole: "anchor"` + `isLimited: true` + `limitedUntil`. Renders with the dark Chef's Signature treatment and a days-left countdown chip (hydration-safe — countdown defers to `useEffect` so SSR and client first paint agree).
- ✅ **Hero / profit-driver triangle.** New `MenuRole` type on `MenuItem`. Margherita = hero (full-width card, cream-gradient frame, "The gateway — start here" subtitle). Quattro Formaggi / Linguine al Pesto / Espresso = profit driver (gold "Pizzaiolo's Choice" badge, ChefHat icon, "quietly his favourite to make" copy).
- ✅ **Hierarchy of menu page.** The default sort is now Pizzaiolo's layout — `compareMenuEngineering()` orders hero → profit-driver → anchor → standards by popularity → alpha tie-break. Sort dropdown still exposes price-low / price-high / rating.
- ⚠ **Admin-editable — partially rolled back.** The original `/admin/menu` edit dialog briefly carried a role dropdown + LTO toggle + "available until" date picker (PR commit `b0d48cc`), but the editorial-badge editor was dropped from the admin dialog shortly after (PR commit `1b2de1c`) when the menu detail page narrowed its scope. `MenuOverride.menuRole / isLimited / limitedUntil` are still accepted by the `PUT /api/admin/menu` payload schema and propagated in the bulk-edit / cross-location clone paths (`src/app/api/admin/menu/route.ts:296`, `src/app/api/admin/menu/bulk/route.ts:384`), so the role + LTO state is operator-controllable via the API and the seed file — but there is no admin-form affordance today. Menu role-derived chips do surface on `/admin/menu` via the Menu badges tab (PR commit `854044a`), so the operator can see which items carry which role, just not edit it from the form.
- ✅ **Capability ledger.** `Menu engineering hierarchy` row added to `/admin/capabilities` per CLAUDE.md rule #9.
- ❌ **Loss-leader first-order espresso bundle** (§4.3 row 5). Not built. Distinct from the anchor — would need a first-order detector (orders count == 0 for the phone) + a comp'd or PLN 12 bundle line in the cart.
- 🟡 **Monthly LTO rotation cadence** (§4.5). Mechanism shipped at the API + seed layer (`MenuOverride.menuRole / isLimited / limitedUntil` round-trip end-to-end); the admin-form affordance was dropped from `/admin/menu` when the detail page narrowed scope (commit `1b2de1c`), so flipping role + dates today means editing the seed file or POSTing the API directly. Ongoing rotation is a manager operational action, not yet automated.

Mockup: `public/mockups/menu-engineering.html` — served at `/mockups/menu-engineering.html` on any deploy. Inline CSS only (production CSP blocks Tailwind CDN); same brand variables + DOM as `src/components/location/MenuItem.tsx`.

### 4.1 The Audit

Pulling from `src/data/menus/krakow.ts`:

| Category | Items | Avg price | Avg cost | Avg GM | Star / Plowhorse / Puzzle / Dog |
|---|---:|---:|---:|---:|---|
| Pizza | 5 | PLN 31.00 | PLN 10.10 | 67% | Mostly Stars (high pop × high margin), Margherita is a Plowhorse |
| Pasta | 4 | PLN 27.50 | PLN 8.80 | 68% | Likely Stars |
| Antipasti | 3 | PLN 18.00 | PLN 5.20 | 71% | Puzzles (good margin, low pop) — *promote* |
| Panini | 2 | PLN 21.00 | PLN 6.80 | 68% | Puzzles |
| Drinks | 4 | PLN 9.00 | PLN 1.40 | **84%** | High-margin attachment — *push everywhere* |
| Desserts | 3 | PLN 17.00 | PLN 5.10 | 70% | Stars with promotion, Puzzles without |

### 4.2 Pricing Psychology Fixes

1. ✅ **Charm pricing.** Move PLN 28.00 → PLN 27.90, PLN 32.00 → PLN 31.90. Empirical lift: 1–3% conversion. Cost: 0.10 PLN per unit. Free money. — *Applied across every Kraków + Warszawa item in `src/data/menus/`.*
2. ✅ **Premium anchor.** Add one PLN 48 "Pizza del Pizzaiolo" with truffle + buffalo mozzarella. Doesn't need to sell much — its purpose is to make PLN 32 Diavola feel modest. Anchor goods lift adjacent AOV 6–11%. — *Shipped at PLN 49.90 (Kraków) / PLN 54.90 (Warszawa).*
3. ✅ **Decoy bundle (see §3.2).** Decoy doesn't need to sell — purpose is to make tier-2 look correct. — *Shipped in §3.2 Bundle architecture.*
4. ✅ **Tier 1 default-push.** Combo button labelled "Make it a lunch +PLN 6" rather than a separate menu page. Default-effect captures non-deliberators. — *Shipped via §3.2 Lunch ladder + §2.3 lunch time-window banner.*
5. ✅ **Price-end alignment to category.** Pizza ends in 9 (perceived value), premium pasta ends in 5 (perceived premium), espresso ends in 9 (impulse), desserts end in 0 (perceived quality). Variable endings cue subliminal positioning. — *Applied: pizza items end in `90` (e.g. 27.90, 31.90), premium pasta in `95` (Carbonara 28.95, Bolognese 29.95), Espresso 9.90, desserts at 15.00 / 16.00 / 18.00.*

### 4.3 Hero / Profit-Driver / LTO Triangle

| Status | Role | Item | Why | Implementation |
|---|---|---|---|---|
| ✅ | **Hero** | Margherita | Most photographed, gateway item, recognise-the-brand item. Should be the first card, biggest photo. Currently no photo at all. | `menuRole: "hero"`. Full-width `lg:col-span-2` card with cream→white gradient frame, red "Our Hero" ribbon, scaled-up thumbnail, "The gateway — start here" subtitle. 🟡 *Real photography still pending — the gradient + emoji placeholder ships today.* |
| ✅ | **Profit-driver** | Quattro Formaggi / Pesto / Espresso | High GM, low awareness. Badge as "Pizzaiolo's choice", surface in cart upsell. | `menuRole: "profit-driver"` on all three. Gold "Pizzaiolo's Choice" badge with ChefHat icon. Already surfaced in cart upsell via the §2.4 margin-ranked engine. |
| ✅ | **LTO (limited-time-offer)** | Truffle / seasonal burrata / Christmas Panettone | Drives novelty visits. `isLimited` + `limitedUntil` already in the type. | Mechanism shipped: `isLimited` + `limitedUntil` honoured by `MenuItemCard` (hydration-safe day-count chip) + admin-editable from `/admin/menu`. Pizza del Pizzaiolo is the first LTO item live. Future rotations (seasonal burrata, Panettone) are admin actions — see §4.5 status. |
| ✅ | **Anchor** | Pizza del Pizzaiolo PLN 48 | Doesn't need volume — needs to exist to range-extend perception. | `menuRole: "anchor"`. Dark "Chef's Signature" ribbon + truffle-radial thumbnail + gold-tinted frame. |
| ❌ | **Loss leader** | First-order PLN 12 espresso bundle | Trial-driver, recovered via second-visit margin. | **Not built.** Would need: order-count lookup keyed on the phone cookie (zero-orders → eligible), a synthetic cart line with the bundle SKU, and a one-time-per-customer guard. Scoped as a follow-up — distinct from the anchor work. |

### 4.4 Hierarchy Of Menu Page

Eye-tracking studies (Gallup × Cornell, replicated by Sweetgreen): customers eye top-left first, then bottom-right ("sweet spot"). Most expensive items go in the sweet spot. Currently Sud puts items in DB-insertion order. **Re-sort to:**

1. ✅ **Top:** Hero photo + Margherita — *`lg:col-span-2` hero card at the top of every category that contains a hero item.*
2. ✅ **Sweet spot:** Profit drivers (premium pizzas, Pizzaiolo's choice) — *`compareMenuEngineering()` ranks profit-driver immediately after hero in the default sort.*
3. ✅ **Right side:** Anchor premium — *Anchor renders after the profit driver, landing in the visible second-row position on `lg:` viewports.*
4. 🟡 **Bottom:** Drinks (the impulse zone) — *Implemented as category tab order (`pizza → pasta → antipasti → panini → drinks → desserts` in `MenuSection`), which is the closest analogue to a single-scroll "bottom" since the menu UI uses category tabs rather than one continuous list. Drinks are never first; espresso also carries the profit-driver badge so it surfaces inside the cart-upsell flow on every pizza/pasta order.*

### 4.5 Comparison To Best-In-Class

- **McDonald's:** ~30 SKUs, every one engineered. Big Mac is a Plowhorse (low margin, draws traffic), McCafé is a Star (high margin, high pop), Apple Pie is a Profit-Driver (high margin, low pop, default-attached). — *Informational benchmark; our `MenuRole` taxonomy now matches this discipline (hero / profit-driver / anchor / lto).*
- **Sweetgreen:** ~12 base salads, but combinatorics push perceived choice up. Hero item is a chef's signature, rotated quarterly to drive novelty visits. — 🟡 *Hero designation shipped; quarterly rotation is a manual admin action today (no scheduled job).* 
- **Singapore QSR (e.g. Genki Sushi, Hai Di Lao):** highly seasonal LTO cadence, weekly menu refresh, conveyor-belt impulse design. Sud should adopt monthly LTO cadence at minimum. — 🟡 *Mechanism shipped (Pizzaiolo's truffle pizza is the first monthly LTO, `limitedUntil: 2026-06-30`); ongoing monthly rotation is a manager action via `/admin/menu`. ❌ No scheduled cron yet to auto-flip LTOs between months.*

---

## 5. Loyalty & Retention Systems — Beyond Points

### 5.1 The Diagnosis

What exists (in code): tiered points, family-pool wallet, 17 achievements, referral codes, streak achievements (3/7/30 weeks). What is *missing for addiction*: visible streaks at every touchpoint, variable-ratio reinforcement, status-as-identity, founder-member exclusivity, surprise & delight, and habit-loop pre-commitment.

### 5.2 The Five Loyalty Mechanics That Compound

#### 5.2.1 Visible Streak

```
   ┌─────────────────────────────────┐
   │   🔥  3-week streak              │
   │   ●●●○○○○                       │
   │   Order by Sunday 22:00 to       │
   │   extend.  +50 pts at 7 weeks.   │
   └─────────────────────────────────┘
```

Streak data is already computed in `growth-engine.ts:streak-3 / streak-7 / streak-30`. **Surface it everywhere:** home page hero band, cart drawer above subtotal, push notification 6h before streak break, confirmation page.

**Duolingo's data:** users who hit a 7-day streak retain at 6× the base rate. QSR analog: 4–5×.

#### 5.2.2 Variable-Ratio Reward (Vegas Slot Mechanic)

Fixed rewards habituate. *Variable-ratio* rewards (dopamine spike, schedule unknown) create compulsion. Implement as:

- **Random 1.5×–3× point multiplier** triggered on ~7% of orders, surfaced post-payment with confetti animation.
- **Mystery box** at order #5, #10, #15, #25 with 1-in-N chance of:
  - free dessert (60%)
  - free pizza next time (15%)
  - free espresso (24%)
  - "Pizzaiolo for a Day" experience (1%)

The 1% experience reward is the *rarity story* customers share on Instagram. Marketing cost per share: < PLN 200. CPM equivalent: 30× below paid Instagram.

#### 5.2.3 Status-As-Identity

Current tiers (`bronze | silver | gold | platinum`) are private. **Make them social:**

- Order confirmation page shows tier badge prominently.
- Receipt email shows tier and perks.
- Tier name appears next to customer name on the truck pickup screen ("Anna · Platinum" calls out at counter — staff knows to deliver the order with a personal note).
- Public leaderboard at `/locations/[slug]/regulars` showing first names of top-10 customers of the month with their *favourite item*. Opt-in. Status-driven.
- "Founder Member" badge for first 500 lifetime customers — permanent +0.5× points multiplier, custom-cut Sud Italia metal pin shipped after order 5. **Cost: PLN 22/pin. Equity in narrative: priceless.**

#### 5.2.4 Habit Loop — Pre-Commitment

The strongest retention tool is *making the next order the default*. Not optional. Default.

- **"Make it a Wednesday usual."** After 3 Wednesday orders, prompt at checkout: "Make this your Wednesday usual? Same order, same time, every Wednesday, one-tap cancel." Re-bills automatically via Stripe Subscriptions. **Conversion rate seen in similar implementations: 14–22%.**
- **"Your team lunch is in 4 hours."** Auto-charge if no one in the team cancels by T-1h. Pooled-wallet primitive supports this.
- **Standing order in the customer dashboard:** Friday 18:30, Margherita + Tiramisu + Espresso, delivered.

#### 5.2.5 Surprise & Delight

Five-minute reciprocity events:

- **Birthday week:** auto-comped tiramisu (DOB capture must be added — *not currently captured*).
- **Half-birthday:** half-price pizza.
- **Order #10 anniversary:** handwritten card from the pizzaiolo with the next order.
- **Lapsed-14-days win-back:** Margherita PLN 1 first-back offer with a personal SMS.
- **Random "make their day":** 1 in 50 orders, manager comps a dessert with a note. Marketing cost: PLN 5.40. Lifetime value lift: empirically 1.4–2.1× over control.

### 5.3 The Dopamine Loop In One Diagram

```
   Crave   ───────►  Order arrives                              
     ▲                       │                                  
     │                       ▼                                  
   Reminder         Variable reward (points × confetti × maybe  
     ▲              free dessert × maybe nothing × tier glow)   
     │                       │                                  
     │                       ▼                                  
   Streak alert  ◄───  Receipt + push:                           
                       "Order #11 unlocked Pizza Lover"           
                       (+ visible progress to next tier)          
```

Each loop iteration takes ~7 days. Every customer who completes 3 loops has an empirically observed 6× retention rate vs control.

---

## 6. Delivery & Digital Revenue Optimisation

### 6.1 The Marketplace Tax Problem

If Sud lists on Uber Eats / Wolt / Glovo, the take is 28–35% off the top, plus order-driven costs. **The strategic objective is therefore: list on marketplaces for discovery, then aggressively migrate customers to direct.**

Direct order has:
- 0% marketplace fee (vs 30% on Uber)
- Loyalty enrollment (vs anonymous)
- Push notification access (vs zero)
- Customer phone (vs masked)
- 100% refund control

### 6.2 The Direct-Order Migration Playbook

| Tactic | Implementation |
|---|---|
| Insert physical card in every Uber/Wolt bag: "Get PLN 10 off your next order direct" with QR + code | Cost PLN 0.20/card, 6–9% redemption, every redeemer is now a direct-channel customer |
| Set direct-app price **3–4% lower** than marketplace listing | Customers learn to migrate without explicit instruction |
| Free upgrade on direct orders ("any drink free for first direct order") | High-margin attachment, low cost |
| Subscription only available on direct app | Locks in highest-LTV cohort to direct |
| Exclusive LTOs on direct app | "Truffle Margherita — only at sud.it" |
| Loyalty points ONLY accrue on direct | The non-obvious one. McDonald's app does this. |

Direct-order share targets:

| Year | Marketplace share | Direct share | Take-home margin |
|---|---:|---:|---|
| Today | 0% (no marketplaces yet) | 100% | 100% (but tiny TAM) |
| Year 1 with marketplaces on | 65% | 35% | ~80% blended |
| Year 2 with migration playbook | 40% | 60% | ~88% blended |
| Year 3 with subscription | 30% | 70% | ~91% blended |

### 6.3 Subscription Architecture

**Sud Italia Pizza Pass** — PLN 39/month:

- 1 free Margherita per week (food cost PLN 8.40 × 4 weeks = PLN 33.60 to deliver)
- 20% off everything else
- Free delivery
- 2× points
- Skip-the-queue priority

**Margin math:** PLN 39 in, PLN 33.60 base cost, PLN 5.40 nominal margin. The trick is upsell-on-redemption — Pizza Pass holders attach espresso/dessert on 80%+ of pickups → real ARPU PLN 95–140/month vs PLN 60–80 for non-subscribers.

Stripe Subscriptions handles all the billing. Existing customer + Stripe customer ID is already wired (`/api/checkout/route.ts:243-323`).

### 6.4 Corporate / Office Lunch Channel (the wedge)

Already detailed in §3.4. The product wedge is the existing pooled wallet. **Build the team admin surface** (`/admin/teams` doesn't exist yet) and the team-member ordering surface (`/team/[slug]`). Singapore CBD is the prime market — office lunch is overwhelmingly group-billed there.

### 6.5 Pickup Conversion

Pickup is the highest-margin channel — no delivery fee, no driver, no marketplace tax. Push customers to pickup with:

- "Pickup ready in 8 min vs delivery 35 min — and free espresso on pickup" prompt.
- "Pickup costs you PLN 0 in fees. Delivery costs PLN 8." Frame both costs honestly. Loss-aversion does the rest.
- 5% loyalty multiplier on pickup orders. Pickup feels like a deal.

### 6.6 Order Batching & Stacking

`getCartSuggestions` runs per-cart; nothing batches across customers. **Server-side batching opportunity at the kitchen end:** group all Margheritas in a 5-minute window into a single dough-prep + bake. Existing `Recipe.prepTimeMinutes` is the wrong primitive — needs a `batchWindow` field. Saves 18–25% throughput at lunch, no software-only flip.

---

## 7. Food Truck Profit Optimisation

### 7.1 The Throughput Math

A truck at lunch produces 1 pizza per ~80 sec optimised, 1 pasta per ~120 sec. Two stations × 60 min = 90 pizzas + 60 pastas theoretical max = ~150 covers/hour. **Most trucks run at 40–55% of theoretical.** The 50% gap is where the money is.

### 7.2 The Speed Menu

For Bryant Park / Robinson Road lunch rush (T-30 to T+90 min around noon), **collapse the menu to ≤7 items:**

| Slot | Item | Why |
|---|---|---|
| 1 | Margherita | Hero, fastest pizza |
| 2 | Diavola | Profit, fast pizza |
| 3 | Carbonara | Hero pasta |
| 4 | Cacio e pepe | Profit pasta, fastest pasta |
| 5 | Burrata bruschetta | Profit antipasto, no cook |
| 6 | Espresso | High-margin attach |
| 7 | Tiramisu | Profit attach, pre-made |

Every other item disabled (`available: false`) on the location override during the lunch window. Slot capacity raised to reflect the simpler kitchen.

**Predicted throughput lift: 28–42%.** Predicted prep error rate drop: 60%. Predicted AOV: -8% (smaller menu, fewer add-ons) offset by +35% order volume → net +24% revenue per peak hour.

### 7.3 Queue Psychology

For the in-person line:

- **Pre-order pre-pay screen at truck back of queue.** Customer pays before reaching the window. Eliminates pay-step from window. Saves 18 sec/order.
- **Live throughput display** at window: "Now serving order 187 / Expected wait 4 min". Anxiety down, abandonment down.
- **Order number on bright LED panel.** McDonald's logic — public acknowledgement = perceived speed even if absolute speed unchanged.
- **Drinks self-serve** at truck side. Removes drinks from the window queue.

### 7.4 Labour Cost % Targets

QSR best-in-class labour as % of revenue: 22–28%. Food trucks: 28–35%. Sud Italia today: unknown (no labour ratio dashboard surfaced despite `/api/admin/labor-ratio` existing).

Levers:

- 1 cook + 1 cashier-runner at lunch is bare-minimum; productivity per hour can hit PLN 600/labour-hour with the Speed Menu.
- 1 cook can do off-peak (10:00–11:30, 14:00–17:30) alone with the pre-pay screen handling all transactions.
- Pre-pay screen + Slot pre-orders also smoothen the demand curve — fewer peak-hour overstaffing requirements.

### 7.5 Why Customers Wait Frustrates

Three psychological levers reduce perceived wait:

1. **Anchor the wait.** Tell them 9 min, deliver in 7. Under-promise / over-deliver beats accuracy.
2. **Occupy the wait.** Live activity feed on a customer-facing screen. Pizzaiolo cam (real-time oven shot).
3. **Acknowledge the wait.** Push notification "your Margherita is in the oven 🔥" at minute 3. Felt as progress.

---

## 8. Psychological Design Audit

### 8.1 The Subconscious Cost Audit

| Element | Current | Subconscious read | Cost (revenue %) |
|---|---|---|---|
| Menu photo | 🍕 emoji on gradient | "this is a prototype / not real food" | -15% conversion |
| Hero | dark gradient + blurred shapes | "empty / placeholder" | -8% landing-to-menu |
| Price ending | `.00` flat | "expensive round number" | -2% |
| Stars on item | fake "4.8 ★ 342" | most users sense fakeness; trust erodes | -3% (and legal risk) |
| Loading spinner | generic | "slow / cheap" | -1% per second waited |
| Italian-flag stripe | clean, restrained | "authentic" | +2% |
| Serif heading | Georgia | "tradition / premium" | +2% |
| Cream background | warm | "approachable" | +1% |
| Red CTA | italia-red | "appetite + urgency" | +3% |

Net: **-21% conversion drag from subconscious signals** vs an industry-correct baseline. Roughly 1 in 5 customers is being lost before they decide whether they like the food.

### 8.2 Trust Signals To Add

- **Real photography** with a watermark date (proves freshness).
- **Pizzaiolo name + photo + "Made by Marco since 2019"** on each location card.
- **Health rating** (NYC letter, SG NEA grade) prominently displayed.
- **Allergen line on every item card** (compliance + trust).
- **Sourcing line** from `kodawari.ts` ("San Marzano DOP, Naples — flown weekly").
- **"PLN 0 hidden fees"** statement above the Pay button.
- **Live order count** ("47 orders today at Wola truck").

### 8.3 Urgency & Scarcity (Honest)

- "Only 3 truffle Margheritas left today" (real scarcity from inventory).
- "Slot fills in: ●●●●○○○○ — order in 4 min to keep it" (real, from slot capacity).
- "Pizzaiolo's special ends at 18:00".
- "Last delivery slot for tonight: 21:30 — PLN 49 to fill it for free delivery".

All four are non-manipulative because they are *true*. They convert because they are *visible*.

### 8.4 FOMO Triggers

- Order confirmation page: "Anna just earned the Pizza Lover achievement. Try the Quattro Formaggi to unlock yours."
- Push at 11:45 to customers who ordered last Tuesday at 11:50: "Same time? Margherita ready 12:08."
- Limited-edition seasonal items with countdown timer on the item card.
- Founder Member badge — visible scarcity ("372 of 500 issued").

### 8.5 The "Cheap vs Premium" Knob

The brand wants to feel **premium**. Today it feels **mid-tier with premium aspiration**. The cheap signals to kill:

- Emoji-on-gradient menu.
- `Pay` button instead of `Place Order` (Pay is transactional, Place Order is committed).
- Generic Lucide icons everywhere (use bespoke icons or hand-drawn sketches for category headers).
- "Add to cart" / "Remove" / "Clear cart" generic phrasing (use "Add", "Take it back", "Start over").

The premium signals to add:

- Hand-photographed food.
- Pizzaiolo as a human face (story page, oven cam).
- Real-paper-receipt aesthetic on the digital receipt.
- Confetti animation on tier-up.
- Custom microcopy ("Buonissimo!" on order success, not "Order confirmed!").

---

## 9. AI & Data Monetisation

### 9.1 Replace `Math.random()` With Actual Models

✅ **Partially resolved 2026-05-16 / 2026-05-21.** ~~The current `ai-engine.ts` is heuristic + noise.~~ Demand forecasting now lives at `src/lib/ai/forecast.ts` (Claude-backed with structured-JSON 7-day predicted_orders + 80% confidence band + honest "Heuristic" fallback badge when `ANTHROPIC_API_KEY` is unset). The dead heuristic exports (`generateDemandForecast`, `generatePriceSuggestions`, `generateInsights`) were deleted from `ai-engine.ts` (they had zero callers); the file is now a labelled FAQ matcher for the customer chat widget. Anomaly detection is still heuristic-with-thresholds and the capabilities page calls that out explicitly. The remaining high-ROI AI systems to deploy, ranked:

| System | Approach | Effort | Annual revenue lift (per truck) |
|---|---|---|---:|
| **Per-customer upsell scoring** | Logistic regression on (last 90d orders, hour-of-day, weather, location, last item set, tier) → ranks top-3 attach candidates per cart | Sprint 1 | PLN 80k |
| **Per-customer free-delivery threshold** | Per-segment Bayesian update | Sprint 2 | PLN 45k |
| **Demand forecasting (real)** | Prophet or LightGBM on `order_history.csv` + weather + day-of-week + holiday calendar | Sprint 3 | PLN 35k (waste reduction) |
| **Price elasticity** | Discrete-choice model per SKU × time-of-day | Sprint 5 | PLN 50k |
| **Churn prediction + automated win-back** | Survival model, triggers SMS at 14-day risk | Sprint 3 | PLN 60k |
| **VIP detection** | Top-5% LTV cohort triggers manual attention | Sprint 2 | PLN 25k |
| **Dynamic combo generation** | Train per-customer "if these 2 items in cart, suggest item 3" | Sprint 4 | PLN 40k |
| **Anomaly detection** | Stripe refund spike / 86 spike / labour-ratio outlier | Sprint 4 | PLN 15k (loss prevention) |
| **LLM-driven ops agent** (already in code) | Anthropic SDK present, agent surface exists | Sprint 1 | PLN 30k (labour saved) |

### 9.2 Easiest Wins First

1. **Per-customer upsell scoring.** Sprint-1 deliverable. Replace `getCartSuggestions` heuristic with a scored ranker. Train on `Order.items` history (already in DB).
2. **Personalised menu reorder.** When a customer lands on a menu page, surface their last 3 ordered items first. One database query, +6–9% conversion.
3. **Smart push timing.** Each customer has a "usual" order time. Send the push 12 min before. ~20% open rate vs 4% generic.
4. **Live "this hour" social-proof injection.** Per-hour, per-location item popularity already computable from `Order` table. Surface as "12 ordered in the last hour".

### 9.3 Customer Segmentation (For Targeted Comms)

Segments to operationalise:

| Segment | Definition | Trigger |
|---|---|---|
| Whales | Top 5% LTV (PLN 2,000+ lifetime) | Personal SMS from manager on every visit |
| Regulars | 5+ orders, last 14 days | Streak push, surprise upgrade |
| At-risk | 5+ orders, last 21 days ago | PLN 1 win-back |
| Lapsed | 14d+ since last order, used to be regular | Free dessert win-back |
| First-timers | 1 order ever | Day-3 push for second-order discount |
| Tourists | Single order, foreign phone prefix | Postcard + Italian-language menu link |
| Office heads | `CustomerWallet.role === "head"` | Team-feature onboarding email |
| Lunch loyalists | 80% of orders 11:30–13:00 | Lunch combo push at 11:15 |

### 9.4 LTV / CAC Discipline

Right now there is no LTV computation, no CAC tracking, no channel attribution. **The single highest-leverage analytics build is a customer-level LTV ledger** with:

- LTV-to-date
- Predicted LTV (cohort-based)
- Acquisition channel (referral code, marketplace, organic, paid)
- Payback period
- Margin contribution per visit

This unlocks every other growth investment — without it, every campaign spend is faith-based.

---

## 10. Cost Optimisation & P&L Improvement

### 10.1 What Kills Restaurant Margins

| Killer | Why | Fix in this codebase |
|---|---|---|
| Food waste | No portion control, no end-of-shift reconciliation | `WasteLog` entity + shift handover |
| Comp / theft | No reason codes, single password for admin | Refund reason codes + per-user RBAC |
| Over-staffing | No labour-ratio dashboard despite endpoint existing | Surface `/api/admin/labor-ratio` |
| Menu complexity | More items = more SKUs, more spoilage, slower line | Speed Menu (§7.2) |
| Marketplace tax | 28–35% to Uber/Wolt/Grab | Direct-order migration (§6.2) |
| Stale inventory | No real-time depletion, no auto-86 | Inventory depletion on `preparing` |
| Refund leakage | No SLA tracking, no surface | Refund reason-code dashboard |
| Discount overlap | Combos + coupons + tier multipliers can compound | Discount-stacking rules engine |

### 10.2 The Top 5 Hidden Costs

1. **No batching → 25% lost throughput** (§6.6, §7).
2. **Marketplace dependency once it starts → 28–35% revenue** (no migration playbook deployed yet because no marketplaces yet — *implement the playbook before turning marketplaces on*).
3. **Over-discount risk** in tier × combo × promo overlap.
4. **No tip distribution logic** → cash tips untracked → staff morale + theft risk.
5. **Per-order Stripe fee** is 1.5%+ PLN 0.40. At PLN 28 AOV that's PLN 0.82, ~3% of margin. Stripe Connect with surcharge model or Polish BLIK pricing can recover ~1%.

### 10.3 Menu Rationalisation Targets

Each truck has ~20 SKUs. Industry-best practice for a 10m² truck: ≤14 SKUs at any moment.

| Action | Rationale |
|---|---|
| Drop bottom-3 by-revenue items | Less prep, less waste |
| Rotate seasonal item monthly | Novelty drives visits |
| Cap drinks at 4 (espresso, water, limonata, wine) | Simpler attachment story |
| Two desserts only (tiramisu, cannoli) | Tiramisu is the Hero; cannoli is the Profit-Driver |

---

## 11. Investor & Scale Thinking

### 11.1 The Enterprise Value Levers

Restaurant tech multiples in 2026 (per recent PE / SaaS comps):

- Pure restaurant chain (food-truck operator): 1.5–3× revenue, 6–9× EBITDA
- Restaurant tech platform with SaaS revenue: 6–12× ARR
- Hospitality OS with marketplace economics: 10–18× ARR

**The valuation lift available from positioning Sud Italia as a "hospitality OS that happens to run two trucks" rather than "two trucks" is 4–6×.** Every product decision should be evaluated against this lens.

### 11.2 What Increases Multiples

| Lever | Multiple lift | How |
|---|---|---|
| Recurring revenue % | Highest | Subscription (§6.3), corporate (§3.4) |
| Cohort retention curves | High | Streaks + variable reward + DOB capture |
| Unit economics transparency | High | LTV/CAC ledger (§9.4) |
| Multi-location replicability | High | Self-serve location onboarding |
| Marketplace flywheel | Highest | Direct + aggregator + driver dispatch |
| Network effects | Medium-high | Pooled wallet + corporate teams + referrals |
| Proprietary data / model | Medium | Per-customer scoring (§9.1) |
| Brand IP | Medium | Real-photography, Pizzaiolo story, founder members |

### 11.3 What Private Equity Operators Look For

1. **Negative-CAC channels.** Referral program with real-money rewards + visible viral loop. Already coded in `growth-engine.ts`, not surfaced.
2. **Predictable revenue.** Subscription % of GMV is the headline metric. Target 20%+ within 18 months.
3. **Same-store growth.** Year-2 of Kraków truck should be +25% vs year-1 if growth playbook works.
4. **Margin stability with mix shift.** As subscription grows, blended margin should *expand* (subscription customers attach higher-margin items).
5. **Operational moat.** Slot-capacity + truck-mobility + loyalty + pooled wallet is a genuine moat *if* productised.

### 11.4 NYC / SG Economics (Same-Store)

| Metric | Kraków baseline | NYC realistic | SG realistic |
|---|---:|---:|---:|
| AOV | PLN 36 | USD 22 | SGD 18 |
| Orders/day | 100 | 220 | 180 |
| GP% | 68% | 62% (higher cost base) | 64% |
| Labour % | est. 28% | 38% | 32% |
| Rent / pitch fee % | 8% | 14% | 18% |
| **Truck-level EBITDA %** | est. 22% | est. 8% | est. 12% |

**The NYC truck economics are not survivable** without (a) marketplace listings, (b) high direct-channel mix, and (c) subscription + corporate base. **The SG economics are workable** if the corporate-lunch wedge is built.

---

## 12. Final Lists

## A. Top 50 Highest-ROI Improvements (ranked by revenue impact ÷ effort)

| # | Improvement | Effort | Annual lift / truck | Where |
|---:|---|---|---:|---|
| 1 | Espresso attach prompt in cart drawer | 1 d | +PLN 110k | `CartDrawer.tsx`, `upsell.ts` |
| 2 | Real food photography (10 hero items) | 1 wk + PLN 5k | +PLN 90k | `data/menus/*.ts`, `MenuItemCard` |
| 3 | Bundle / combo engine (Lunch tier, Family Feast) | 1 wk | +PLN 85k | new `BundleEngine` + `CartDrawer` |
| 4 | Apple Pay / Google Pay primary CTAs | 2 d | +PLN 70k | Stripe Payment Request API |
| 5 | Saved cards + saved addresses | 3 d | +PLN 60k | Stripe Customer + customer store |
| 6 | Subscription "Pizza Pass" | 2 wk | +PLN 200k | Stripe Subscriptions + `/admin/subscriptions` |
| 7 | Corporate team / pooled-wallet productisation | 3 wk | +PLN 320k | `/admin/teams`, `/team/[slug]` |
| 8 | Charm pricing (`.90` endings) | 1 d | +PLN 30k | menus |
| 9 | Premium anchor item (PLN 48 Pizza del Pizzaiolo) | 3 d | +PLN 40k | menus |
| 10 | Visible streak UI in cart + push | 1 wk | +PLN 55k | `growth-engine.ts`, cart |
| 11 | Per-customer upsell scoring (logistic regression) | 2 wk | +PLN 80k | new ML route |
| 12 | Personalised free-delivery threshold | 1 wk | +PLN 45k | `upsell.ts` extension |
| 13 | Promo / referral code input at checkout | 2 d | +PLN 35k | `CartDrawer.tsx` |
| 14 | Tip module with named-employee framing | 3 d | +PLN 18k | `CartDrawer` |
| 15 | Item modifiers (size, extra toppings) first-class | 2 wk | +PLN 90k | `CartItem.modifiers`, KDS, Stripe |
| 16 | Lapsed-customer SMS win-back | 1 wk | +PLN 50k | comms + cron |
| 17 | DOB capture + birthday rewards | 3 d | +PLN 20k | `Customer`, comms |
| 18 | Speed Menu for lunch rush (auto-disable items) | 1 wk | +PLN 40k throughput | menu overrides + slot |
| 19 | Pre-pay queue screen at truck | 1 wk | +PLN 25k (throughput) | new kiosk surface |
| 20 | "Order Again" home-page card | 2 d | +PLN 40k | landing, customer store |
| 21 | Real reviews replacing fake `ratings.ts` | ⚠ 1 wk left | +PLN 30k | `/review/[orderId]` aggregate wiring. ✅ Fake `ratings.ts` deleted 2026-05-21; `<StarRating>` chips removed from customer surfaces. ❌ Real-review aggregation + chip reintroduction pending. |
| 22 | Mystery-box variable reward | 1 wk | +PLN 25k | `growth-engine.ts` + UI |
| 23 | Founder Member tier (first 500) | 3 d code + PLN 11k pins | +PLN 35k | `loyalty.ts` |
| 24 | Pizzaiolo cam + "in the oven" push | 1 wk | +PLN 15k (CSAT) | push, ops |
| 25 | Address autocomplete (Google Places) | 2 d | +PLN 22k | `CartDrawer` |
| 26 | Inline slot picker at menu page | 1 wk | +PLN 20k | menu page |
| 27 | Hero food photography + film loop | 1 wk + PLN 5k | +PLN 30k | landing |
| 28 | Wire `kodawari.ts` sourcing to item drawer | 3 d | +PLN 15k | `MenuItemCard` |
| 29 | Live "12 ordered in the last hour" social proof | 3 d | +PLN 22k | `MenuItemCard` |
| 30 | Pickup-only loyalty multiplier (5%) | 2 d | +PLN 18k (margin shift) | `loyalty.ts` |
| 31 | LTO monthly cadence framework | 1 wk | +PLN 35k | seasonal items + comms |
| 32 | Marketplace migration card (physical insert) | 1 d + PLN 0.20/card | +channel shift | ops |
| 33 | Standing-order subscription | 1 wk | +PLN 70k | Stripe Subs |
| 34 | LTV / CAC ledger | 2 wk | +PLN 0 direct, unlocks all else | analytics |
| 35 | Customer segmentation + targeted comms | 2 wk | +PLN 65k | segmentation engine |
| 36 | Push notification "your usual time?" | 1 wk | +PLN 45k | push |
| 37 | Tier badge on confirmation + receipt | 2 d | +PLN 10k | order-confirmation |
| 38 | Free-delivery progress bar (animated) | 2 d | +PLN 22k | `CartDrawer` |
| 39 | Real-time menu availability surface | 2 d | +PLN 15k | `useLiveMenuAvailability` |
| 40 | Refund reason codes + dashboard | 1 wk | +PLN 12k (loss prevention) | `/admin/orders` |
| 41 | Auto-86 when ingredient depleted | 1 wk | +PLN 18k (CSAT, refund) | inventory |
| 42 | Cash reconciliation flow | 1 wk | +PLN 25k (theft prevention) | `/admin/cash` |
| 43 | Group-order Slack integration | 2 wk | +PLN 80k (corporate channel) | new integration |
| 44 | Half-and-half pizza modifier | 2 wk | +PLN 25k | `CartItem.modifiers` |
| 45 | "Pizzaiolo's choice" rotating LTO | 1 wk | +PLN 28k | seasonal + branding |
| 46 | Receipt printer driver | 1 wk | +PLN 0 direct, CSAT + compliance | hardware |
| 47 | KDS bump-bar driver | 1 wk | +PLN 18k (throughput) | hardware |
| 48 | Local landmark-based pickup messaging | 2 d | +PLN 5k (NPS) | comms |
| 49 | Public leaderboard at `/locations/[slug]/regulars` | 3 d | +PLN 15k (retention) | new page |
| 50 | One-click reorder via SMS short-code | 1 wk | +PLN 30k | comms |

## B. Top 25 Psychological Tricks (Ethical But Powerful)

1. **Default-effect combo button** ("Make it a lunch +PLN 6") — the default frames non-combo as deviant.
2. **Decoy bundle** — third bundle exists to make tier-2 look correct.
3. **Anchor premium item** — extends price perception.
4. **Charm pricing** — PLN 27.90 reads cheaper than PLN 28.00.
5. **Personalised free-delivery threshold** — feels personal, increases willingness.
6. **Variable-ratio reward** — random multiplier on ~7% of orders.
7. **Visible streak with break warning** — loss aversion + identity.
8. **Founder Member scarcity** ("372 of 500 issued") — status + scarcity stack.
9. **Real social proof** ("12 ordered in the last hour") — bandwagon.
10. **Named-employee tip prompt** ("Tip Maria your pizzaiolo") — empathy.
11. **Mystery box at milestone** — anticipation > reward.
12. **Tier badge at pickup ("Anna · Platinum")** — public status.
13. **Pre-pay before queue reaches window** — sunk-cost commitment.
14. **Under-promise wait time** — exceed expectation.
15. **Pizzaiolo cam during prep** — occupied wait feels shorter.
16. **"Your usual?" reorder at habituated time** — pre-commitment.
17. **"You're 47 pts from Silver" in cart** — endowed-progress effect.
18. **Personal SMS from manager on whale customer's birthday** — reciprocity.
19. **Confetti animation on tier-up** — peak-end rule.
20. **Public leaderboard with first names** — recognition + status.
21. **"Last 3 spots in this slot"** — real scarcity, surfaced.
22. **Half-birthday surprise** — unexpected = stickier than expected.
23. **Custom microcopy** ("Buonissimo!" on success) — identity reinforcement.
24. **Receipt as souvenir** — paper-stylised digital receipt with Italian flourishes.
25. **Loss-frame the points** ("Don't lose your 234 points — order this week").

## C. Top 25 Upsell Opportunities

1. Espresso PLN 6 at cart open (highest GM SKU).
2. "Make it a large +PLN 6" pizza modifier.
3. Double cheese +PLN 4 modifier.
4. Add chicken +PLN 8 protein modifier.
5. "Add tiramisu +PLN 18" at cart open.
6. "Pair with a Limonata +PLN 12" if no drink.
7. "Add bruschetta +PLN 14" antipasto attach.
8. Lunch Combo PLN 39 (pasta + drink, time-gated).
9. Lunch+ Combo PLN 53 (pasta + drink + tiramisu).
10. Family Feast PLN 119 (2 pizzas + side + 4 drinks + tiramisu).
11. Date Night Bundle PLN 89 (2 pasta + 2 drinks + 1 dessert).
12. Pizzaiolo's Pick (chef's signature pizza, rotating).
13. Pizza del Pizzaiolo PLN 48 (premium anchor).
14. Make it Gold-tier (+PLN 4 for free dessert if loyalty member).
15. Founder Member upgrade at checkout (one-time, exclusive).
16. "Try the new burrata — first 12 today" scarcity upsell.
17. "Skip the queue — VIP slot +PLN 6" priority modifier.
18. "Add a printed receipt with handwritten note +PLN 0" (free, lifts CSAT).
19. Pair with wine PLN 24 (margin pairing).
20. "Round up for charity +PLN 1.10" (reciprocity + tax write-off).
21. Cold-bag upgrade PLN 4 for delivery.
22. Insulated lunch sleeve PLN 8 (returnable).
23. Branded Sud Italia merch (mug, apron) at order #10.
24. Gift card upsell at checkout ("Send a friend a Margherita").
25. "Wednesday usual" subscription upsell after 3 same-day orders.

## D. Top 25 Cross-Sell Systems

1. Pizza → espresso (highest cross-margin pair).
2. Pasta → wine (margin pairing).
3. Antipasti → main course (basket-builder).
4. Drink alone → "add a pastry?" (impulse).
5. Pizza + pizza → "add bruschetta and save".
6. Multiple pizzas → "Family Feast" prompt.
7. Cart >PLN 60 → "free delivery if you add tiramisu".
8. Cart >PLN 40, no drink → drink prompt.
9. Cart >PLN 40, no dessert → dessert prompt.
10. Customer ordered espresso before → "your usual + a cannoli?".
11. First-time customer → "Welcome bundle: any pizza + any drink PLN 32".
12. Returning lapsed customer → "Welcome back PLN 10 off if you add a side".
13. Office hour (12:00–13:00) → "Lunch Combo + bring a colleague".
14. Late night → "Night-Owl PLN 5 espresso bundle".
15. Rainy day → "Comfort Pasta Bundle + free delivery".
16. Hot day → "Limonata + Gelato Bundle".
17. Birthday week → "Free dessert with any pizza".
18. Tier milestone proximity → "1 dessert unlocks Silver — try the tiramisu".
19. Streak risk → "Order anything this week to extend your 6-week streak".
20. Saturday → "Date Night Bundle".
21. Sunday → "Family Feast Bundle".
22. Aggregator-imported customer → "Order direct next time, save PLN 4".
23. Pickup-only segment → "Skip the queue + free espresso on pickup".
24. Address re-entered → "Save this address? Free delivery on next order".
25. Reorder → "Your usual + 1 new item to try?" (novelty).

## E. Top 20 Margin Improvements

1. Speed Menu at peak (28–42% throughput lift).
2. Direct-order migration playbook (recover 28–35% marketplace tax).
3. Subscription mix shift (Pizza Pass holders attach high-margin items 80%).
4. Charm pricing (1–3% on every order, near-zero cost).
5. Premium anchor item (range-extends ARPU 6–11%).
6. Bundle margin engineering (tier-2 default sells higher-margin attach).
7. Espresso attach (5 PLN/unit profit × 60% rate).
8. Pickup channel push (no driver, no marketplace, 100% margin).
9. Per-customer upsell scoring (ML uplift over heuristic).
10. Smart push timing (20% open vs 4% generic).
11. Auto-86 on inventory depletion (eliminate refunds).
12. Refund reason codes + dashboard (recover comp leakage).
13. Tip module (PLN 18k/year/truck recovered).
14. Stripe pricing optimisation (BLIK + alternative payment fees).
15. Menu rationalisation (less spoilage, faster line).
16. LTO cadence (margin-driven seasonal item selection).
17. Cash reconciliation (theft + drift prevention).
18. Labour-ratio dashboard surfaced (preventive over-staffing fix).
19. Batched prep at kitchen (18–25% throughput, same labour).
20. Gold/Platinum free-delivery as retention (lift LTV without unit margin hit).

## F. Top 20 Cost Reductions

1. Menu collapse to ≤14 SKUs (less spoilage, less waste).
2. Pre-pay screen (saves 18 sec/order, allows 1-FTE off-peak).
3. Batched prep (lower labour-per-order).
4. Auto-86 (eliminate refund admin overhead).
5. Self-serve drink station (1 less window position).
6. Direct migration (eliminate marketplace 30%).
7. Stripe Connect optimisation (~1% recovered).
8. Subscription pre-pay (working capital benefit).
9. SMS template comms vs hand-sent (labour saved).
10. Push notifications free vs paid Instagram (CPM 30× lower).
11. Referral viral loop (CAC near zero on referred).
12. Inventory depletion → auto-PO (avoid emergency supplier markup).
13. Allergen incident log (avoid lawsuits, regulatory fines).
14. HACCP digital log (insurance premium reduction).
15. Maintenance ticket system (preventive vs reactive maintenance 3–4×).
16. Equipment IoT (avoid PLN 8–20k freezer-failure loss).
17. Labour-law compliance checks (avoid fines).
18. Tip pooling rules engine (avoid theft, morale).
19. Refund SLA dashboard (catch leakage early).
20. Brand-standards score (catch quality drift before lost customers).

## G. Top 20 Features Missing vs Elite Operators

1. Real food photography.
2. Item modifiers as first-class data.
3. Bundles + decoy pricing engine.
4. Subscription / Pizza Pass.
5. Corporate / team / pooled-wallet productised.
6. Apple Pay / Google Pay primary CTAs.
7. Saved cards + saved addresses.
8. Address autocomplete.
9. Pre-payment ETA.
10. Promo / referral code field.
11. Tip module with named-employee framing.
12. Per-customer upsell scoring (real ML).
13. Per-customer free-delivery threshold.
14. Visible streak UI everywhere.
15. Variable-ratio reward (mystery box).
16. Founder Member tier.
17. DOB capture + birthday rewards.
18. Real reviews (replace fake ratings). — ⚠ Partial 2026-05-21: fake ratings deleted; real-review aggregation pending.
19. Speed Menu auto-activation at peak.
20. Standing-order subscription / "Wednesday usual".

## H. What McDonald's Would Do

McDonald's growth org would attack Sud Italia in four moves:

1. **Default combo psychology.** Replace standalone pizza / pasta with a default "Make it a Combo +PLN 6" button. Combo becomes the path of least resistance. Empirical lift in their data: 22% AOV.
2. **Mobile-first ordering at scale.** McDonald's invested $4B in the app stack 2018–2024. They would build the equivalent of "Mobile Order & Pay" — every customer pre-orders via the app, every window is pickup-only, queue is for customers without phones. Throughput: 1.4–1.6×.
3. **Hyper-local pricing per truck.** Bryant Park Margherita is USD 19; outer Queens truck is USD 12. Yield management. Demand-curve calibration per truck per hour. Sud's cost data is already there — pricing logic needs the engine.
4. **Loss-leader for traffic, profit-driver for margin.** Margherita as the loss-leader anchor (lower margin, higher traffic). McCafé equivalent (espresso) as the profit-driver attached to every flow. Sud has the SKU mix; needs the architecture.

McDonald's would also kill anything that isn't operationally simple. The KDS, the modifiers, the slot capacity, the truck UI — all would be put through a "could a 19-year-old new hire run this on day 3?" test, and most of the UI would be simplified accordingly. They would put a pre-pay screen at the back of every queue line and eliminate the cash drawer entirely on direct orders.

## I. What Uber Eats Would Improve

Uber Eats' monetisation team would attack three layers:

1. **Conversion-optimise the entire customer flow.** A/B test every CTA, every micro-copy, every photo, every threshold. They run ~200 concurrent experiments at any time. Sud has zero. Sample experiments they'd run on day 1:
   - "Add to cart" vs "Add to order"
   - Default-tipping percentage 10/15/20 vs 12/18/25
   - Photo angle: top-down vs 45° vs in-hand
   - Sticky cart bar vs button
   - Free-delivery threshold PLN 39 vs 49 vs 59
2. **Algorithmic everything.**
   - Personalised menu order (each customer sees their most-likely-to-order items first).
   - Algorithmic free-delivery threshold per segment.
   - Algorithmic notification timing per customer.
   - Algorithmic cross-sell ranking per cart.
   - Algorithmic price (when allowed) per location per hour.
   - The entire stack is a learning system, not a heuristic.
3. **Subscription as the moat.** Uber One (USD 9.99/mo) is the customer-retention atomic unit. Sud needs a Pizza Pass (PLN 39/mo). Subscription customers order 4–7× more, attach 1.5× higher AOV, and cost 60% less to retain. Subscription metrics dominate everything else.

Uber would also build a "boosted listings" advertising market inside Sud — but that doesn't apply at 2 trucks. At 50 trucks it absolutely does.

## J. What Would Make This Addictive

The behavioural-design checklist for genuine compulsive engagement (the Hooked / BJ Fogg / Charles Duhigg framework):

| Component | Mechanism for Sud Italia |
|---|---|
| **Trigger** (external) | Push notification "your usual time, your Margherita ready 12:08" exactly 12 min before a habituated order time |
| **Trigger** (internal) | Hunger pang associated with the Sud Italia app (Pavlovian — reinforced over 5–10 cycles) |
| **Action** (low effort) | One-tap reorder on the home page card |
| **Variable reward** | Mystery point multiplier; occasional comp dessert; surprise SMS from pizzaiolo; rare 1-in-50 "make their day" event |
| **Investment** | Visible streak, accumulated points, Founder Member badge, named-on-leaderboard, "your usual" pre-set, saved cards & addresses |

The compounding effect:

```
Order 1   → trigger external (paid ad / referral / org)
Order 2   → trigger external (Day-3 push for "second-order discount")
Order 3   → trigger internal forming (lunch hunger + Sud cue)
Order 5   → first achievement unlock (variable reward)
Order 7   → streak-3 achievement
Order 10  → loyal-10 + mystery box
Order 11+ → habit loop primary; trigger becomes internal hunger pang
Order 25  → "Legend" tier, public leaderboard, named-pizza eligibility
```

By order 11, ~70% of customers in well-designed loops are on auto-pilot. The Sud codebase has the *components* (streaks at 3/7/30, points multipliers, referrals, achievements, pooled wallets) — none are surfaced at the moments that create the hook.

**The single highest-leverage addiction primitive missing today:** the **"Make this your Wednesday usual"** prompt after the third Wednesday order, with one-tap auto-subscribe. This single prompt, in Domino's and Pret data, converts 14–22% of triggered customers into weekly recurring revenue.

---

## 13. Closing Memorandum

The Sud Italia codebase has built **most of the right primitives** — tiered loyalty, pooled wallets, gamification, referrals, slot capacity, location overrides, seasonal items, growth-engine — and **surfaced almost none of them at the moments they monetise**. The brand has restraint and taste. The data model is coherent. The team writes audits on themselves.

What is missing is *the operator's mindset* — the operator who knows that an espresso is PLN 5 of margin and an emoji-on-gradient menu is PLN 90k/year of lost photography ROI; that a "Make it a combo +PLN 6" default button is the difference between Sud-as-a-truck and Sud-as-a-brand; that the Wednesday-usual prompt builds the subscription book that turns 1.5× revenue into 12× enterprise value; that the corporate-team feature is sitting one sprint away inside an already-shipped pooled wallet.

**With one quarter of disciplined product work on §0.2's Three Plays, this product would realistically grow truck-level revenue by 30–60% with no new locations and no new menu items.** Most of the levers are inside the codebase already.

The path is clear. The cost of not pulling is approximately **PLN 240–420k per truck per year, every year**.

— *Audit lens: restaurant growth strategist, behavioural psychology consultant, menu engineer, PE operating partner — 14 May 2026*

---

## 2026-05-21 Update — what shipped, what didn't, what changed in the way we read it

Seven days from this audit. Two of the §0.2 "Three Plays" have meaningful ship-progress; one is still in-design. The numbers in §0.1 are now _modellable_ for the first time.

### §0.2 Three Plays status

| # | Play | Status |
|---|---|---|
| 1 | Espresso prompt + bundle math + decoy anchor in cart drawer | ✅ **Shipped.** Espresso reprice + Tartufata anchor + decoy ladder + cart-aware default drink + post-Add inline toast are all live (see `2026-05-bundle-ladder-revenue-rebuild.md`). Coffee-specific strategy refinements landed on 2026-05-19 ("push espresso + flag delivery / marketing CAC"). |
| 2 | Subscription / corporate lunch pass leveraging pooled wallet | 🟡 **Phase 1 shipped.** `/admin/scheduled-bundles` operator queue + approval UI live. `/admin/corporate` page live with head-bonus tracker, monthly invoice cron, pre-order reminders, dedicated bundles editor (PR #27). **Stripe Subscription auto-rebill (Phase 2) still ⏳.** |
| 3 | Habit loop: variable-ratio reward + streak + DOB + "next order pre-loaded" | 🟡 **Partial.** Loyalty wallet + tiered multipliers + push pipeline (server-side fan-out on `order.ready`, abandoned-cart, slot pressure) all live. Variable-ratio reward + visible streak + DOB capture + "next order pre-loaded" surface still ⏳. |

### §0.1 — the numbers are now modellable, not just projected

The §0.1 table assumed 100 orders/day per truck and worked backward from menu costs in `src/data/menus/krakow.ts`. As of 2026-05-21 two new operator surfaces let the operator reproduce that table against real cost data:

- **`/admin/business-costs`** — first-party cost ledger replacing every magic constant ("60% attach", "12% tip") with editable entries.
- **`/admin/simulation`** — runs every lever in §0.1 through a behaviour-and-cost model with a **sensitivity tornado** showing each lever's EBITDA contribution, a **cohort retention + LTV/CAC panel** answering the "repeat-order frequency" line, a **per-channel CM1 panel** answering "dine-in vs Wolt vs Glovo" margin profile, and **EBITDA / EBITDAR / cash-on-cash / occupancy** KPIs that translate the per-truck revenue lift into a contribution-margin number a PE partner would underwrite.

The §0.1 PLN 240–320k EBITDA delta per truck is reproducible inside the simulation by toggling the lever set the audit lists. Two refinements that surfaced from running the model with the actual cost ledger:

- The **espresso prompt** uplift is more attach-elasticity-sensitive than projected; at ≤ 4% attach-rate drop the +PLN 65k stands, at 8% it collapses to ~PLN 42k.
- The **subscription / corporate lunch pass** PLN 320k across both trucks is the right order of magnitude only if the corporate AR ledger is built (it isn't yet) and Stripe Subscription auto-rebill is wired (it isn't yet). The Phase 1 queue + approval flow earns ~PLN 60–90k of that as a manual-fulfilment book; the auto-rebill closes the remaining ~PLN 230k.

### What surfaced that this audit didn't anticipate

| Surface | Why it matters for revenue/psych |
|---|---|
| **V8 Tuscany trattoria mockup** (`/mockups/cart.html`) | Closes one of the audit's §1.5 "Hidden Conversion Killers" — emoji-on-gradient menu cards — by proposing a parchment + serif + bilingual hierarchy that reads as a premium-craft trattoria. Not in production. If adopted, materially changes how the cart-upsell sequence in §2.1 reads on the page. |
| **`/admin/whatsapp`** | A third commerce surface beyond web + dine-in. The §0.1 "promo-code field at checkout" gap exists differently on WhatsApp — the LLM channel can carry the entire post-order upsell prompt as a follow-up message. New design surface not in the original audit. |
| **`/admin/crosssell`** (split from `/admin/upsell`) | The "time-of-day banner editor" + segment-aware chips + pairing-graph editing belong squarely to §2 of this audit. Operator-side editability now exists for every chip + banner the audit's §2.1 sequence prescribes. |
| **`/admin/simulation` → AI-generated enhancements card** | Below the sensitivity tornado, the simulation proposes operator next moves derived from the run's outputs. The recent "push espresso + flag delivery / marketing CAC" enhancement (PR #56, 2026-05-19) is a direct expression of §6 of this audit (corporate / B2B) and §2 (espresso). Closes the loop between audit and ship. |

### What still won't budge without operator focus

- **Real food photography.** Single highest-ROI un-shipped change. The Tuscany mockup uses serif type + parchment cards to compensate; that is _not_ a substitute. PLN 5,000 budget, one day, +5–15% AOV.
- **Address autocomplete.** Still commented out in `CartDrawer.tsx`.
- **Post-order single-tap espresso upsell on the confirmation page.** The model says this is +6–12% on confirmed orders; it is not shipped.
- **Variable-ratio reward + visible streak + DOB capture.** The retention third of §0.2 Play 3 is still ⏳.
- **A/B experimentation framework with a real ledger.** The simulation surfaces sensitivity _ex ante_; without the experimentation ledger, validating which levers actually move the needle in production is still manual.

### Net read

The audit's PLN 240–420k/truck/year cost-of-not-pulling is unchanged. Of the eight levers in §0.1's "Where the money is" table, four are shipped or partly shipped to production (drink attach via espresso prompt, AOV uplift via 3-tier combo, subscription/corporate as Phase 1 queue + invoice cron, promo-code field gating Italian Classic Combo at cart), three are operator-modellable in the new simulation but unshipped to the customer surface (dessert attach, repeat-order frequency via streaks, loyalty point ROI), and one (tip pool capture with named-pizzaiolo framing) remains the same single-day job it was a week ago. The audit's three single-day un-shipped items called out in the body of this document — food photography, address autocomplete, post-order single-tap espresso upsell — remain unshipped. The work-vs-revenue ratio on those has not improved; if anything the simulation makes the missed opportunity more visible. (See also §12.A "Top 50 Highest-ROI Improvements" for the full ranked list — that table is now also auditable inside the simulation.)

— *Delta lens: same audit, seven days later — 21 May 2026*

---

## 2026-05-21 Update #2 — Recipe + per-distributor cost ledger lands the True-CM substrate (later same day)

A second batch of commits today (PR #61 + the recipes sequence) doesn't ship new revenue surfaces, but it materially upgrades the substrate under §10 (cost optimisation), §4 (menu engineering), and the §12.E "Top 20 Margin Improvements" list. Three substrate changes worth flagging for the revenue/psychology reader:

### 1. Per-distributor ingredient offerings drive True CM1, not a typed-in number

The §10 "Cost Optimisation & P&L Improvement" section assumed the operator types a cost into each ingredient row and the recipe sums them. That was correct on the audit date. As of this update, costs flow through a `IngredientProduct` table — one row per (ingredient × distributor) pair (`src/data/types.ts:296`). Each ingredient has an `activeProductId` pointing at the offering currently in effect. Recipe cost + bundle margin alert + per-channel CM1 panel + sensitivity tornado all read through this pointer.

**What that does for the audit's analysis:**

- The §10 "Real cost discipline" critique was right (the seed costs were typed in); the storage shape for resolving it is now in place — each ingredient carries multiple offerings, one is marked active, and every bundle ladder / menu-engineering quadrant / channel CM1 number reads through the active pointer. **The RFQ workflow UI that operationalises this — request quotes from three distributors, score them, one-click activate the winner — is still a future build** (tracked as item 14 ⭐⭐ in the elite-QSR future-recommendations doc; ~1 sprint of UI work since the storage layer is correct). Today the operator can swap distributors by editing the active-offering pointer manually; the bidding workflow is the missing piece.
- The §4 "Menu engineering — quadrant migration" call-out gets an honest cost basis to score against. A "puzzle" item flipping to a "star" because the operator switched distributors is now a measurable event in the menu-engineering matrix, not a recompute artefact.
- The "magic constants" critique in the previous 2026-05-21 update is _further_ reduced — the cost ledger is no longer "one number per ingredient" but "one number per (ingredient × distributor) at a specific timestamp."

### 2. Chain-wide recipes mean a single formula change moves both trucks

Recipes are now keyed by dish base slug, not by location-prefixed menu-item id. Editing the Kraków Margherita formula updates Warsaw automatically. The audit's §6 "Bundle deals must subtract from cart total" → §12.E "Top 20 Margin Improvements" math depends on the formula being identical across locations; that's now structurally enforced rather than visually enforced.

**What that does:**

- The §10 "Tartufata anchor on / off" toggle in the simulation now reads truffle oil cost from whichever distributor the operator has marked active — across both trucks, in one click — instead of operator-typed numbers per location that could silently drift.
- The §12.E "Recipe yield testing workflow" gap (last on the original list because of the per-location fork problem) is now schema-unblocked: a single yield-test entity can drive the whole fleet.

### 3. Auto-computed per-portion kcal + macros let psychology surfaces lean on real data

The recipe nutrition pipeline (`calculateRecipeCalories`, `calculateRecipeNutrition` at `src/lib/store.ts:3890` / `:3940`) sums ingredient `kcalPerUnit × quantity` ÷ `yieldPortions`. **`wasteFactor` is intentionally excluded from nutrition math** because `quantity` is eaten weight; the trim/spill purchased extra is a cost concern, not a calorie one. The customer kcal pill is now a derived figure, not a typed-in one.

**What this unlocks for §3 + §4 of the audit:**

- The §3 "Cross-sell psychology" section talks about "balanced meal" framing in cross-sell chips ("add a side for a complete meal"). With actual per-100g macros now flowing from active offerings, the chip can carry a real "rounds out your protein / fiber" rationale instead of a generic prompt. Schema-ready; UI build not done.
- The §4 "Menu engineering — Nutri-Grade as decoy" play (cited but not shipped in the original audit) is **two structural steps away, not one**: per-100g sugar + total fat are on the active offering, but the schema is still missing `saturatedFatPerUnit` (and the SSB bands distinguish added vs total sugars) — both are NEA inputs the bucketing function would need. Field migration on `IngredientProduct` first, then the computation function. Not written yet.
- The "Defaulted to 0" indicator on incomplete macros keeps the operator honest — partial-data states are visibly marked on the operator side; customer surfaces never show a 0-defaulted figure (they hide rather than mislead). Matches the audit's §8 "Psychological design — trust" principle.

### Where this lands against §12 lists

| List entry | Effect |
|---|---|
| §12.A #4 "Tip pool surfacing with named-pizzaiolo" | Unchanged (no tip-pool work in this batch). |
| §12.A #11 "Real reviews replacing fake `ratings.ts`" | Unchanged from the am update. |
| §12.A #15 "Live True CM1 per item" | **Substrate upgrade.** The simulation already reports per-item True CM1; the cost number it reports now traces to a specific distributor SKU at a specific timestamp. Operator-side True CM1 panel is more defensible. Live per-order CM at completion still ✗. |
| §12.E "Top 20 Margin Improvements" — most entries assume an editable cost ledger | The ledger is now distributor-specific. The §12.E #3 "Renegotiate flour" entry is now a one-click "activate alternative offering" rather than a multi-row recipe-cost rewrite. |
| §12.E "Recipe yield testing workflow" | Schema-unblocked by chain-wide recipes; workflow UI still to build. |
| §12.G #18 "Real reviews" | Unchanged. |

### Three follow-ups that surfaced

1. **NEA Nutri-Grade computation from recipe nutrition.** Schema is **not yet ready** — `IngredientProduct` carries sugar + total fat but not `saturatedFatPerUnit` (a required NEA bucketing input), and the SSB bands also distinguish added vs total sugars which the schema does not separate. The work is: (a) field migration on `IngredientProduct` for saturated fat (and ideally added-sugars), (b) plumbing through `calculateRecipeNutrition`, (c) the A/B/C/D bucketing function reading the recipe sums against NEA thresholds. Closer to 1–2 days than a half-day, and field migration not pure code.
2. **Recipe-derived allergens.** Today `MenuItem.allergens[]` is per-item, hand-flagged. Migrating to "this dish carries allergen X because some ingredient does" would close one of the most-cited compliance foot-guns in the audit. Few-hour job.
3. **Cost-ledger-driven bundle save-time gate** (already flagged as ⭐ in the elite-QSR future-recommendations doc item #12) is materially cheaper now — drops from "1 day" to "half day" because the ledger has audit-traceable provenance.

### Net read on the §0.1 economics

Of the eight levers in §0.1's "Where the money is" table, the substrate moves are:

- **True CM1 per item** — the cost basis is now distributor-specific and audit-traceable. Operator can run RFQ-style cost-discipline in the admin without a code change.
- **Menu engineering quadrant migration** — the matrix scores against the real ledger, not typed-in numbers.
- **Per-channel CM1** — the dine-in vs Wolt vs Glovo comparison now uses real distributor cost on the ingredient side, real channel commission on the revenue side.

The PLN 240–420k/truck/year cost-of-not-pulling is unchanged. The cost-of-getting-it-wrong is **smaller** today than a week ago, because the operator's path from "I want to switch mozzarella suppliers" to "every bundle's True CM1 updates" is one click rather than a multi-row recipe edit.

— *Substrate lens: same audit, structural unblock — 21 May 2026 (pm)*

---

## 2026-05-29 Update — the premium surface this audit kept asking for shipped; the three single-day revenue items did not

Eight days on. The headline is that the **§1.5 "emoji-on-gradient menu" conversion killer — the single most-repeated complaint in this audit family — was addressed at the brand-frame level by shipping the V8 Tuscany storefront to production.** Two of the audit's three single-day un-shipped items (food photography, post-order single-tap espresso upsell) are still un-shipped; the third (address autocomplete) is still commented out. And the retention surface this audit's §5 designs grew real UI — but with two hardcoded values that violate the project's no-fake-data rule.

### §1.5 "Hidden Conversion Killers" — the brand frame closed; the photography gap did not

Every prior update called the Tuscany direction "a mockup at `/mockups/cart.html`, not in production." That is now false. The live storefront is rebuilt on the V8 theme (parchment/terracotta/basil/oxblood/ochre in `src/app/themes/homepage/tokens.css`; Cormorant Garamond + Lora; paper-grain canvas; full-bleed menu band; editorial per-item cards). The "premium frame, empty content" critique splits cleanly now:

- ✅ **Premium frame** — delivered. The serif-on-parchment trattoria reads as a craft restaurant, not a Squarespace prototype. The §8 "psychological design — trust / craft" principle is materially better served.
- ❌ **Empty content** — the emoji is gone from the *frame*, but **real food photography is still missing** (`MenuItem.image` still unpopulated; the V8 cards lean on serif type + paper texture). This was, and remains, the single highest-ROI un-shipped change in this audit. PLN ~5,000, one day, +5–15% AOV. Re-stated here because the brand rebuild makes its absence *more* conspicuous, not less.

### §2 Advanced Upsell — the sequence survived the rebuild, re-themed in place

The §2.1 cart-upsell design-spec surfaces are all still live (verified by source, re-themed V8): `AddToCartToast` (post-add seed), `CartUpsell` ("Pairs beautifully with —", `CartDrawer.tsx:646`), `DeliveryProgress` (per-segment threshold bar, `CartDrawer.tsx:651`), `TodBanner` (five hour-window variants, `:568`), `TierPerkBanner` (`:614`). The §2.4 margin-optimised ranking still drives `getCartSuggestions` (`src/lib/upsell.ts`). **The §2.1 `T+pay` row (Apple Pay primary) is still ⏳** — checkout is still the Stripe redirect; no Payment Request API.

The one item this audit's §2.2 taxonomy marked ✅ "post-Add toast" is intact; the **post-order single-tap espresso upsell** (called out in the body and the 2026-05-21 net read as +6–12% on confirmed orders) is **still ⏳** — the confirmation page (`order-confirmation/page.tsx`) shows a comeback/FOMO + "Order again" block but no add-an-item prompt.

### §0.2 Three Plays — re-verified

| # | Play | Status 2026-05-29 |
|---|---|---|
| 1 | Espresso prompt + bundle math + decoy anchor in cart | ✅ Shipped (unchanged), now on the V8 surface. |
| 2 | Subscription / corporate lunch pass | 🟡 Phase 1 unchanged (`/admin/scheduled-bundles` queue + `/admin/corporate` invoice cron). **New adjacent commerce surface:** the WhatsApp LLM bot (`src/lib/whatsapp/`) now does real Stripe **pay-in-chat** (`confirm_and_pay` → Stripe Checkout link) — a third ordering channel, though still one-shot, not the recurring auto-rebill Phase 2 needs. |
| 3 | Habit loop: variable-ratio reward + streak + DOB + "next order pre-loaded" | 🟡→⚠ **Partially built, partly faked.** The V8 `/rewards` page now *renders* a streak and a weekly challenge — but the **streak is a hardcoded "2"** and the **challenge progress is a hardcoded "33% / 1-of-target"** (`src/app/(public)/rewards/page.tsx`). The variable-ratio mechanic and DOB-driven triggers are still ⏳. This is the §0.2 Play 3 surface finally getting pixels, but with placeholder data — see the Rule-#1 flag below. |

### §5 Loyalty & Retention — the dopamine-loop surface is real UI now, but two values are fake

This audit's §5.2/§5.3 designs (streak, challenge ladder, tiered roadmap, referral give-get) now have a dedicated four-tab V8 `/rewards` dashboard. **What's real:** tier card + spendable/tier points (derived from real `ordersCount`/`points`), tier roadmap, family wallet (`FamilyWalletPanel` wired to `/api/customer/wallet/*`), achievements (`getEarnedAchievements` derives from real order data), phone-only auto-enrolment. **What's fake (Rule #1 violation — flag for fix):**

- **Streak** is a literal "2" ("2 Week streak"), not computed from order recency.
- **Weekly challenge** progress is a literal "33%" / "1-of-target", not derived.
- **Referral code** shown to the customer comes from `generateReferralCode()` which uses `Math.random()` (`src/lib/growth-engine.ts`), so it regenerates every render and is **not** the persisted owner code (the real persistence is `src/lib/referral-loop.ts` — Drizzle-backed `referralCodes`/`referralRedemptions`). The customer can't reliably share a stable code; the give-get loop §6.2 depends on is undermined by the UI surfacing a throwaway code.

These are exactly the "cosmetic implementation pretending to function" failures CLAUDE.md Rule #1 forbids. The §5 dopamine loop is the highest-leverage retention surface in this audit; shipping it with placeholder streak/challenge/referral values is worse than not shipping the widgets, because a returning customer who notices their streak never moves loses trust in the whole program.

### Other movements relevant to this audit's economics

- **Tip default is still "None"** — the §0.1 "tip pool capture" lever (+PLN 18k) is still un-pulled. `TipPicker` presets 0/10/15/20% with "0 — no thanks" preselected (`CartDrawer.tsx`); no default tip, no named-pizzaiolo framing.
- **The §0.1 table is now reproducible against real orders.** `/admin/simulation` layers scenarios over `computeSimulationActuals` (`store.ts:10336`) — menu-mix-weighted COGS from actual line items, cohort retention, per-channel CM1, sensitivity tornado. The PLN 240–320k EBITDA delta is checkable against the trailing-90-day order book, not just modelled.
- **Persistence migrated to relational Drizzle tables** (orders/recipes/ingredients/ingredientProducts/customers/loyalty) with dual-write + lazy backfill — the cost basis behind every §10/§4 number is now indexed and distributor-traceable.
- **A real Anthropic LLM layer landed** (`src/lib/ai/` gateway+forecast+agent+tools) — relevant to the §2 "per-customer personalised upsell" aspiration; the inference plumbing now exists.

### Net read

The audit's PLN 240–420k/truck/year cost-of-not-pulling is unchanged. The brand-frame half of the §1.5 conversion-killer complaint is **closed** (V8 live); the photography half is **still open**. Of the audit's three explicitly-named single-day revenue items — food photography, address autocomplete, post-order single-tap espresso upsell — **all three remain un-shipped after fourteen days.** The eight days of work went into the storefront rebuild, the three-theme design-system split, the data-layer migration, and the LLM layer. The §5 retention surface finally has UI, but it ships with hardcoded streak/challenge/referral values that must be wired to real data before the dopamine loop earns the trust the audit's §8 demands. The work-vs-revenue ratio on the three single-day items has, if anything, worsened — the premium surface now sits above an emoji-free but photo-free menu and a streak counter that doesn't count.

— *Re-run lens: same growth/psychology audit, fifteen days later — 29 May 2026*
