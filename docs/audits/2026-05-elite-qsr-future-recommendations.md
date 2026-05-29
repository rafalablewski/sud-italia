# Elite QSR — what Sud Italia would still do differently

**Date:** 2026-05  
**Source:** §10 of `2026-05-revenue-growth-psychology-redesign.md` v3 (post-Sprint-9).  
**Audience:** product + engineering planning the next 1–2 quarters of monetization work.

The post-Sprint-9 monetization stack is at A-overall — single-codebase QSR pricing, full A/B harness, end-to-end telemetry, repeat-customer one-tap, operator margin alerts, scheduled-bundle Phase 1. What follows are the items that would push every section to A+, ranked by impact-per-week-of-engineering.

The grading carries forward the v3 audit's standard: **A+** = an elite operator (McDonald's, Domino's, Chipotle, Starbucks, Pret) would be hard-pressed to point at a gap. The items below are the gaps they would point at.

---

## 1. Per-customer ML upsell scoring  ⭐⭐⭐  (highest leverage)

**What it is.** Replace the rules-based cart-suggestion ranker (`getCartSuggestions` + `scorePairing` in `src/lib/upsell.ts`) with a per-customer × per-cart × per-hour scored ranker. Inputs: customer's last 90d order history, current hour, weather, location, current cart shape, customer tier. Output: top-3 attach candidates ranked by predicted (margin × attach probability).

**Why it matters.** Today the cross-sell chips fire the same three items for every cart with a pizza in it. Per-customer scoring captures the long tail: the customer who never adds a drink doesn't get nagged about espresso (drops conversion); the customer who adds dessert 80% of the time gets dessert *first* in the chip list (lifts attach). Industry data: Dynamic Yield reports +8–14% AOV uplift on per-customer cart suggestions vs static rules.

**Who does this well.** Domino's (cart-context "you might like"), Uber Eats ("frequently bought together"), Starbucks (your usual). The ML is a logistic regression in the simplest form; a gradient-boosted tree is the upgrade path.

**Effort.** 1.5–2 sprints. Need: Feature pipeline (Order.items → per-customer aggregates), training set (existing orders), simple model (start with logistic regression on 8–10 features), inference endpoint, and a fallback to the existing rules ranker on cold-start customers.

**Evidence we'd ship it correctly.** A/B framework already in place — ship the new ranker as a variant on a small % of traffic, watch the contribution-profit uplift on the bundle analytics card, ramp to 100%.

---

## 2. Voice-of-customer feedback loop on bundle apply  ⭐⭐⭐

**What it is.** Post-receipt prompt: "How was the value?" 1-tap thumbs-up / thumbs-down on every bundle order. Persist in `bundle-feedback.json`; surface aggregated thumbs-down rate per bundle in `BundleAnalyticsCard`.

**Why it matters.** The bundle audit log captures *what was sold*. It does not capture *what the customer thought about it*. A bundle that converts at 30% but has 22% thumbs-down is a profit center burning brand equity. We have no way to detect that today.

**Who does this well.** Pret (post-pickup feedback in the app), Chipotle (post-order rating). Both use the signal to retire underperforming menu items quietly.

**Effort.** 2–3 days. POST `/api/customer/bundle-feedback`, a persistence file, a column in the analytics card. Trigger UI on the order-confirmation page. No ML required.

---

## 3. Refund × bundle correlation  ⭐⭐

**What it is.** When a refund is issued on a bundle order (via the existing refund flow), capture a refund-reason code. The bundle analytics card joins `BundleEvent` × refund records and shows refund rate per bundle id. Variant of the same join: "refund rate per bundle × A/B variant".

**Why it matters.** A bundle that forces customers to take items they didn't want (forced antipasti, forced 4 drinks for a 2-person table) drives refunds at a higher rate than à-la-carte. Without this signal, we discover the problem from a Glassdoor review.

**Who does this well.** Toast POS (refund-reason taxonomy is built into the payment record). Stripe Disputes integration captures it for chargebacks.

**Effort.** 3–4 days. Schema work (refund-reason enum on `OrderRefund`), admin UI (reason picker on the manager refund button — already half-built per the §3 admin audit), analytics join. Existing `OrderDispute` schema (capabilities entry "Stripe disputes") is the model.

---

## 4. Stripe Subscription auto-rebill for weekly usual  ⭐⭐  (Phase 2 of Sprint 9 #2)

**What it is.** The `ScheduledBundleIntent` data layer is shipped (Sprint 9 #2). Phase 2 wires Stripe Subscriptions: on operator approval, create a subscription with the bundle as the line item, fire the order automatically each week via webhook, handle payment failures with the standard Stripe customer-portal flow.

**Why it matters.** Pret-style subscription is the single highest-LTV customer pattern in QSR. Internal Pret data: subscribers are worth ~3× their non-subscriber LTV at 18-month cohort. Without auto-rebill the operator runs the recurring orders manually from the queue — the queue is shipped, the automation isn't.

**Who does this well.** Pret (Subscription), Domino's (auto-reorder), Starbucks (delivery subscription 2024).

**Effort.** 2–3 sprints. Stripe Subscription create + customer portal + webhook handler + payment failure → status auto-pause + slot pre-claim on the chosen weekday. Gated on `STRIPE_SCHEDULE_WEBHOOK_SECRET` env var.

---

## 5. Slot-capacity × bundle dashboard pivot  ⭐

**What it is.** `BundleEvent.slotId` is captured on every bundle order today. The pivot we don't have: "of slots that hit ≥ 80% capacity, what % had a bundle order in their first 5 minutes?" High correlation = bundles are pushing slots over the edge.

**Why it matters.** When a slot fills, every other customer churns out of that slot. If bundles disproportionately fill slots, suppressing the bundle ladder when slot capacity is high would protect the slot economy.

**Who does this well.** Olo (per-slot rolling capacity dashboards), Toast (slot fill-rate alerts).

**Effort.** 2–3 days. Slot capacity data is already in the orders table; join with `BundleEvent.slotId`, render a stacked bar in `BundleAnalyticsCard`.

---

## 6. Chipotle "bundle is the path" — hide à-la-carte cross-sell when bundle eligible  ⭐

**What it is.** Today we suppress the combo banner when the bundle ladder is showable (✅ Sprint 2 #9). We *don't* suppress the per-item cross-sell chips (`CartUpsell`). When the bundle ladder is showing, the cross-sell chips compete with it for attention.

**Why it matters.** Chipotle's mobile cart has *one* primary path for upsell at any moment. The cross-sell chips drive single-item attach (good); the bundle drives whole-meal upsell (better when applicable). Showing both splits attention.

**Who does this well.** Chipotle, Starbucks. Both algorithmically pick the single best upsell path per cart shape.

**Effort.** Half-day. Pass `isBundleLadderShowable` (already in `lib/bundles.ts`) into `CartDrawer`; when true, demote `CartUpsell` to a single subtle line or hide entirely.

---

## 7. Per-day-of-week bundle conversion analysis  ⭐

**What it is.** `activeDays` is configurable per bundle (Sprint 6 #9). The pivot we don't have: "Friday Family Feast converted at 38%; Wednesday Family Feast converted at 12%" — letting the operator confirm or invalidate their weekday merchandising hypothesis.

**Why it matters.** Without it, operators ship `activeDays: ["friday", "saturday"]` based on intuition and never measure whether intuition was right.

**Effort.** 1 day. Day-of-week breakdown on the `byBundle` rollup; column in the analytics card.

---

## 8. Drone / sidewalk-robot delivery × bundle weight  ⏳ 2027+

**What it is.** Bundle composition affects packaging weight × delivery vehicle constraints. Drone delivery payload caps (~2 kg for Manna, ~5 kg for Wing); sidewalk robots cap at ~10 kg. When the operator's fleet includes any of these, suppressing Feast Deluxe-class bundles for delivery orders becomes correctness-critical.

**Why it matters.** First-order constraint when drones launch in EU (regulation timeline 2027–2028). Until then, paper exercise.

**Effort.** Out of scope. Captured here so the bundle architecture's `maxMains` + `composition.kind` story can extend into a `maxWeightGrams` constraint when the time comes.

---

## 9. Per-segment elasticity testing as a continuous loop  ⭐

**What it is.** The A/B framework supports per-experiment uplift measurement. The next step is a continuous experiment scheduler: every 14 days, auto-create an experiment that nudges the family-feast discount % by ±2 points, run for 14 days, auto-promote the winner.

**Why it matters.** Operators don't run experiments. Every analysis-of-real-data study (Pricewell, Dynamic Yield, Toast) shows continuous price elasticity testing yields 2–4% margin lift per year compounding. Without auto-scheduling, the A/B framework just sits there.

**Who does this well.** Uber Eats (bandit-allocation framework), Stripe Pricing experiments.

**Effort.** 1–2 sprints. Cron job that creates / promotes experiments; statistical-significance auto-stop on the analytics rollup.

---

## 10. Refresh of the customer-side promo overload  ⭐

**What it is.** The cart drawer surfaces (in order): bundle ladder, combo banner (now suppressed when bundle showable), cross-sell chips, delivery progress bar, fulfillment toggle, slot picker, tip picker, loyalty earn preview, "weekly usual" opt-in, pay button.

That's still 10 elements. v1 audit called out 9; v3 reduced to 5–6 in the common case (bundle showable suppresses the combo) but the rest still render.

**Why it matters.** Each non-essential decision on the cart costs 3–5% conversion. Domino's mobile cart is 4 elements. Starbucks is 3.

**Effort.** UX audit + 1 sprint. Algorithmic upsell selector that picks *one* card to render based on (bundle showable, qualifying combo, time-of-day banner, tier perk, cross-sell candidate) — promotes the highest expected value, demotes everything else.

---

## Summary — priority vs effort

| # | Item | Impact | Effort | Sprint slot |
|---|---|---|---|---|
| 1 | Per-customer ML upsell scoring | ⭐⭐⭐ | 1.5–2 sprints | Q3 sprint 1 |
| 2 | Voice-of-customer feedback | ⭐⭐⭐ | 2–3 days | Q3 sprint 1 |
| 3 | Refund × bundle correlation | ⭐⭐ | 3–4 days | Q3 sprint 2 |
| 4 | Stripe Subscription auto-rebill | ⭐⭐ | 2–3 sprints | Q3 sprint 2 |
| 5 | Slot × bundle pivot | ⭐ | 2–3 days | Q3 sprint 2 |
| 6 | Chipotle "bundle is the path" | ⭐ | 0.5 day | Q3 sprint 1 (quick win) |
| 7 | Per-day bundle conversion | ⭐ | 1 day | Q3 sprint 1 (quick win) |
| 8 | Drone/robot weight constraints | ⏳ | Out of scope | 2027+ |
| 9 | Continuous elasticity loop | ⭐ | 1–2 sprints | Q4 |
| 10 | Algorithmic single upsell card | ⭐ | 1 sprint | Q4 |

---

## What ships next quarter takes the stack from A → A+

The ranking above is the answer. Items 1, 2, 4 are the tier that turns "complete monetization stack" into "self-improving monetization stack with a customer-feedback loop." Items 6 and 7 are quick wins. Items 8 and 9 are 2027+.

Items 3, 5, 6, 7 add 4–6 days of engineering and close the analytics gaps the v3 audit grades as A− on §3.2.4 and §3.2.5. Items 1, 2, 4 are the tier that pushes the whole system from "elite QSR clone" to "elite QSR with proprietary data flywheel."

---

## 2026-05-21 Update — status check on the ten

| # | Item | Status today |
|---|---|---|
| 1 | Per-customer ML upsell scoring | ⏳ Still rules-based in `getCartSuggestions` + `scorePairing`. **However**: per-customer **RFM segmentation** (`new` / `occasional` / `regular` / `champion` / `vip` / `lapsed`) shipped 2026-05-16 (PR #38), and the **simulation** now reports per-channel CM1 + attachment efficiency per segment. The remaining work is to wire the segment buckets into the upsell scorer as an additional feature column. Sprint slot Q3-1 still valid. |
| 2 | Voice-of-customer feedback on bundle apply | ⏳ Not shipped. Bundle audit log still captures _what was sold_ only. `BundleAnalyticsCard` does not yet show thumbs-up/down. 2–3 days of work; sprint slot Q3-1 still valid. |
| 3 | Refund × bundle correlation | 🟡 **Half shipped.** `OrderRefund.reasonCode` enum is live (`src/data/types.ts:413` — 8 codes: customer_request, wrong_item, quality_issue, late_or_no_show, missing_item, duplicate_charge, manager_comp, other) and the admin reason-picker is wired into the refund flow in `src/components/admin/AdminOrders.tsx:1028`. ⏳ **Still missing**: the join — `BundleAnalyticsCard` does not yet pull refund records and surface refund-rate per bundle id / per A/B variant. The data is captured; the analytics rollup isn't. |
| 4 | Stripe Subscription auto-rebill for weekly usual | 🟡 **Phase 1 shipped** — `/admin/scheduled-bundles` queue + approval UI is live; the operator can approve and run a scheduled bundle order on the chosen weekday from the queue. **Phase 2 still outstanding** — Stripe Subscription create + customer portal + webhook handler + payment-failure auto-pause are not wired. The intent layer is in place; the auto-rebill is not. Sprint slot Q3-2 still valid. |
| 5 | Slot-capacity × bundle dashboard pivot | ⏳ Not shipped. `BundleEvent.slotId` is still captured on every bundle order; the "of slots that hit ≥ 80% capacity, what % had a bundle in their first 5 minutes" pivot is not yet rendered. 2–3 days of work. |
| 6 | "Bundle is the path" — hide cross-sell chips when bundle showable | ⏳ Not shipped. Combo banner is correctly suppressed when bundle is showable, but `CartUpsell` chips still render alongside. Half-day fix; still a quick win. |
| 7 | Per-day-of-week bundle conversion analysis | 🟡 **Half shipped.** `activeDays` is configurable per bundle, and the `bundle-analytics` endpoint already computes a `perDay: { date, count, revenue }[]` array server-side (`src/app/api/admin/bundle-analytics/route.ts:152–158`). ⏳ **Still missing**: the `BundleAnalytics` interface returned to the client doesn't declare `perDay` and `BundleAnalyticsCard` doesn't render it. The backend half is done; bind it through the response type + add a day-of-week panel to close. Half a day, not 1 day. |
| 8 | Drone / sidewalk-robot delivery × bundle weight | ⏳ Out of scope; still 2027+. |
| 9 | Per-segment elasticity testing as a continuous loop | ⏳ Not shipped. The A/B framework still requires a human to spin up an experiment. **But**: the **simulation page now models sensitivity** for the operator via the tornado chart, which is a useful manual proxy until the auto-scheduler exists. The continuous loop is still 1–2 sprints. |
| 10 | Refresh of the customer-side promo overload | ⏳ Not shipped. Cart drawer still renders bundle ladder + combo banner + cross-sell chips + delivery progress + fulfillment toggle + slot picker + tip picker + loyalty earn preview + weekly-usual opt-in + pay button. 1 sprint. |

**New items that have surfaced since this doc was written and that belong on the list:**

| # | Item | Impact | Effort |
|---|---|---|---|
| 11 | **Wire the simulation's bundle-economics output back into the live ladder ordering** — the sim already ranks bundles by margin-weighted expected value at a given hour × cohort × weather. Today the production ladder is ordered by a static priority. Bridging the two means the simulation stops being purely an operator-facing tool and starts driving customer-facing merchandising. | ⭐⭐ | 1–2 sprints |
| 12 | **Cost-ledger-driven bundle gating** — `/admin/business-costs` now carries the per-ingredient unit cost ledger. The bundle low-margin alert can pre-compute against the ledger at admin save-time, not just post-order. Closes one of the bundle-ladder-revenue-rebuild "still ✗" items. | ⭐ | 1 day |
| 13 | **Brand direction commitment for the customer site** — the V8 Tuscany trattoria mockup at `/mockups/cart.html` is a live brand-direction proposal that, if adopted, materially changes the bundle ladder presentation (parchment cards, Cormorant Garamond display type, bilingual hierarchy). Decision impacts items 6 and 10 of the original list. | strategic | 1 sprint to ship the redesign live; 0 days to decide |

**Net read.** A → A+ remains an honest characterisation, but the **simulation engine** that landed between PR #51 and PR #56 closes a different gap than the ten listed above — it pulls the operator-side from "elite QSR _ordering_" toward "elite QSR with an institutional-grade financial model in the same admin." That is a separate axis of A+ ("self-improving stack" vs "auditable stack"), and the items in this doc remain the right roadmap for the customer-facing flywheel half.

---

## 2026-05-21 Update #2 — Recipes + per-distributor offerings change the substrate (later same day)

A second batch of commits today (PR #61 + the recipes sequence) doesn't tick off any of the original ten items, but it materially changes the **substrate items 1, 3, 11, and 12 run on**. Updating those rows + adding two more.

### Effect on the original ten

| # | Item | Substrate change |
|---|---|---|
| 1 | Per-customer ML upsell scoring | The scorer's feature column for "what does this attach actually cost?" now reads through `Ingredient.activeProductId` → `IngredientProduct.costPerUnit` rather than a typed-in flat cost. When the operator switches distributors, the model's margin-weighted ranking updates the same day, not the next data-warehouse refresh. Effort estimate unchanged (1.5–2 sprints) but the model output is more defensible. |
| 3 | Refund × bundle correlation | Substrate effect is **smaller than the previous draft of this row claimed**. `Order.items` snapshots `MenuItem.cost` (one number per line) at checkout but does **not** snapshot the recipe formula or the active `IngredientProduct` ids in effect at order time, so a refund processed after a distributor switch resolves "what did this cost us?" to today's active offering, not to the historical one. The "we refund Margherita 2.4× more often when we run Galbani vs Lactalis" join is only honest if a separate `OrderRecipeSnapshot` (or equivalent: distributor-id + active-offering-id + per-ingredient unit cost) is captured per line at checkout. Until then the refund × distributor join silently leaks present-day costs into past-period analytics. Effort unchanged on the surface gap; the cost-snapshot work is a prerequisite. |

### Two new items the substrate unlocks

| # | Item | Impact | Effort |
|---|---|---|---|
| 14 | **Per-distributor offering RFQ workflow** — `IngredientProduct` rows already store cost + macros per (ingredient × distributor) combo. An operator-side RFQ overlay lets a buyer request quotes from three distributors on the same SKU list, scores them by total spend × lead time × quality, and one-click activates the winner. The cost flows through to every recipe + bundle the next time the page renders. Closes the institutional-grade audit's §1.5 row 4 ("Supplier bidding / RFQ"). | ⭐⭐ | 1 sprint (UI + workflow; storage is already correct) |
| 15 | **Chain-wide recipe + yield-test entity** — recipes are now keyed by dish base slug, not by location-prefixed menu-item id. A single yield-test entity ("cook 10 Margheritas across Kraków + Warsaw, capture actual flour weight, adjust `wasteFactor`") can drive the whole fleet, not per-location forks. Closes the institutional-grade audit's §1.5 row 10 + the admin-dashboard audit's §5.5 #8 ("Recipe yield testing workflow"). | ⭐ | 1.5 sprints (entity + capture UI + variance-feedback loop) |

### Items 11–13 (added in the previous update) — status check

| # | Item | Status |
|---|---|---|
| 11 | Wire the simulation's bundle-economics output back into the live ladder ordering | Unchanged. The simulation still reads but does not write to the live ladder. The per-distributor cost ledger makes the simulation's recommendations sharper, so the lift from doing this work is now bigger. |
| 12 | Cost-ledger-driven bundle gating | **Half-day effort.** The per-distributor offering chain means the bundle save-time alert pre-computes against a deterministic figure with audit trail (distributor + SKU + cost-update timestamp). Drops from "1 day" to "half day" — the ambiguity that needed a heuristic ("which distributor are we costing this against?") is now resolved by the active-offering pointer. |
| 13 | Brand direction commitment for the customer site | Unchanged. The V8 Tuscany trattoria mockup at `/mockups/cart.html` still shows the parchment + serif + bilingual hierarchy; no production adoption decision has been made. |

### Net read on A → A+

The customer-facing flywheel half (items 1–10) is unchanged in spec but cleaner in supporting data. Items 14 + 15 are new and operator-side; both are direct expressions of the elite-QSR pattern (Toast's RFQ, Domino's chain-wide recipe consistency) that the original list under-weighted because the data shape couldn't support them a week ago. With items 1, 2, 4 still the headline "self-improving stack" work, items 12 + 14 + 15 are now the highest-value operator-side adds at the lowest effort.

---

## 2026-05-29 Update — item 13 shipped; a real LLM substrate now underpins item 1; the rest hold

Eight days on. The big movement is **item 13 — the V8 brand-direction commitment is no longer pending; it shipped to production** — and the arrival of a genuine Anthropic-LLM layer that changes the build path for item 1. The ten original items are otherwise unchanged in status; one new Rule-#1 regression surfaced on the retention surface that this doc's flywheel feeds.

**Item 13 — Brand direction commitment → ✅ SHIPPED.** The V8 Tuscany trattoria look is the live storefront, not a `/mockups/cart.html` proposal. Parchment/terracotta/basil/oxblood/ochre tokens are in `src/app/themes/homepage/tokens.css`; Cormorant Garamond + Lora are loaded per-route; the bundle cards, cart drawer, menu cards, and rewards page are all rebuilt on it. This was the "0 days to decide, 1 sprint to ship" item — both happened. Its downstream effects on items 6 and 10 (how the cart-upsell sequence reads on the page) are now live questions, not hypotheticals.

**Item 1 — Per-customer ML upsell scoring.** Still rules-based in `getCartSuggestions` + `scorePairing` (`src/lib/upsell.ts`, now a 1,245-line composite-weight engine). **But the substrate changed twice over:** (a) RFM segmentation shipped earlier (PR #38), and (b) a real **agentic LLM layer now exists** — `src/lib/ai/gateway.ts` (Anthropic SDK with prompt caching), `src/lib/ai/agent.ts` (tool-use loop, ≤8 hops, operator-approval gates), `src/lib/ai/tools/` (role-gated, audit-logged tools incl. `query-customers`, `query-orders`, `analytics`). The remaining work is unchanged in *spec* (wire the segment bucket + history features into the ranker, ship as an A/B variant) but the inference plumbing the original estimate assumed you'd build from scratch is now partly in place. Sprint estimate holds; the build is cheaper.

**Items 2–12 — re-verified status:**

| # | Item | Status 2026-05-29 |
|---|---|---|
| 2 | Voice-of-customer feedback on bundle apply | ⏳ Still not shipped. `FeedbackSurvey` collects per-item ratings post-order, but there is no thumbs-up/down on the *bundle* and `BundleAnalyticsCard` doesn't surface it. |
| 3 | Refund × bundle correlation | 🟡 Unchanged — `OrderRefund.reasonCode` enum + admin reason-picker live; the analytics **join** (refund-rate per bundle / per A/B variant) still not rendered. The cost-snapshot prerequisite flagged in Update #2 still applies. |
| 4 | Stripe Subscription auto-rebill | 🟡 Unchanged — `/admin/scheduled-bundles` queue + approval is live; Stripe Subscription create + webhook + payment-failure auto-pause still ⏳. (Note: the WhatsApp channel now has real Stripe pay-in-chat via `confirm_and_pay`, but that's one-shot checkout, not recurring billing.) |
| 5 | Slot-capacity × bundle pivot | ⏳ Still not shipped. |
| 6 | "Bundle is the path" — hide cross-sell chips when bundle showable | ⏳ **Still not shipped — re-confirmed by source.** In the V8 cart drawer the combo banner is suppressed when a bundle is showable, but `CartUpsell` chips (`CartDrawer.tsx:645`) still render alongside `BundleLadder` (`:617`). Half-day fix; still a quick win, now on the V8 surface. |
| 7 | Per-day-of-week bundle conversion | 🟡 Unchanged — `perDay` computed server-side; the client interface + `BundleAnalyticsCard` panel still not bound. |
| 8 | Drone/robot delivery × bundle weight | ⏳ Out of scope; still 2027+. |
| 9 | Continuous elasticity loop | ⏳ Still not shipped. The simulation's sensitivity tornado is still the manual proxy; now it runs over **real-order actuals** (`computeSimulationActuals`, `store.ts:10336`) rather than a typed baseline, which sharpens the manual read — but the auto-scheduler/bandit is still 1–2 sprints. |
| 10 | Refresh the customer-side promo overload | ⏳ Still not shipped — re-confirmed. The V8 cart still stacks TodBanner + loyalty line + TierPerkBanner + BundleLadder + ComboDealBanner + CartUpsell + DeliveryProgress + fulfillment selector + slot picker + TipPicker + LoyaltyEarnPreview + (bundle-gated) weekly-usual opt-in + pay bar. The rebuild re-themed the stack; it did not thin it. The "one algorithmically-chosen card" still isn't built. |
| 11 | Wire simulation bundle-economics → live ladder | ⏳ Unchanged. Simulation reads, doesn't write to the ladder. |
| 12 | Cost-ledger-driven bundle gating | 🟡 Unchanged — half-day effort; the cost ledger is now relational + distributor-specific, keeping the estimate. |
| 14 | Per-distributor RFQ workflow | ⏳ Storage still correct (now relational `ingredientProducts`); workflow UI still to build. |
| 15 | Chain-wide recipe + yield-test entity | ⏳ Chain-wide recipes confirmed live (base-slug keyed, relational); yield-test capture UI still to build. |

**New regression on the flywheel's retention surface.** The V8 `/rewards` rebuild ships UI for two of this doc's "self-improving" signals — a **streak** and a **weekly challenge** — but both are **hardcoded display values** (streak literal "2"; challenge bar literal "33% / 1-of-target" in `src/app/(public)/rewards/page.tsx`), and the referral code shown to the customer is generated with `Math.random()` each render rather than read from the persisted `referral-loop.ts` owner code. These are exactly the *fake-not-functional* anti-patterns CLAUDE.md Rule #1 forbids, on the very surface items 2/4 want to instrument. They should be wired to real data before any of the feedback-loop items (2, 3) build on top of them — otherwise the flywheel measures fiction.

**Net read on A → A+.** Item 13 closing (V8 live) and the real LLM layer landing both move the operator-side substrate; the customer-facing flywheel half (items 1–10) is **unchanged in shipped status** — same ten gaps an elite operator would point at, now on a more premium surface. The headline self-improving-stack work (1, 2, 4) is still the right Q3 priority, and the new precondition is "make the rewards streak/challenge/referral surfaces real before instrumenting them."

— *Re-run lens: same planning audit, fourteen days later — 29 May 2026*

---

## 2026-05-29 Verification Ledger (full claim-by-claim pass)

A line-by-line re-verification of all 15 items + the priority table against current code. Per Rule #11 corrections are recorded here, not edited into the body.

**A. Stale file:line pointers (symbol exists; line drifted):**

| Citation | Correction |
|---|---|
| `OrderRefund.reasonCode` enum `types.ts:413` (item 3) | line 413 is blank; `REFUND_REASON_CODES` `:417` (8 codes `:418-425` — **exactly** as listed), `RefundReasonCode` `:428`, `OrderRefund.reasonCode` `:446` |
| admin reason-picker `AdminOrders.tsx:1028` (item 3) | `<Select>` at `:1122` (`reasonCode` state `:1037`) |
| `CartUpsell CartDrawer.tsx:645` (item 6) | `:646` (`:645` is the `<LayoutGate flag="showCartUpsell">` wrapper); `BundleLadder :617` exact |
| `BundleEvent.slotId` implied in `types.ts` (item 5) | `BundleEvent` is in `store.ts:5570`; `slotId?` at `:5588` (the `types.ts:502` `slotId` is `Order.slotId`, a different field) |
| `bundle-analytics route.ts:152-158` `perDay` (item 7) | accurate |
| `computeSimulationActuals store.ts:10336` (item 9) | accurate |

**B. Claims now wrong / over-stated:**

1. **Item 6 effort note cites a non-existent symbol.** "pass `isBundleLadderShowable` (already in `lib/bundles.ts`)" — there is no `isBundleLadderShowable` export. The combo-suppression actually keys off `isBundleActive` (`CartDrawer.tsx:211`); the nearest visibility predicate is `bundleVisibleToCustomer` (`bundles.ts:620`). An implementer following this note would hit a dead reference.
2. **Item 7 over-states the gap.** Both the 2026-05-21 and 2026-05-29 entries say the client `BundleAnalytics` interface "doesn't declare `perDay`" — but the **route-side interface does** (`bundle-analytics/route.ts:46`). The real remaining gap is narrower: only `BundleAnalyticsCard`'s local Props + render omit it. **And `perDay` buckets by calendar date** (`e.createdAt.slice(0,10)`, `route.ts:107`), **not day-of-week** — so closing item 7 needs a `byDayOfWeek` group, not just binding `perDay` through. The "half a day, not 1 day" estimate undersells it.

**C. Confirmed accurate (items 1-15 statuses hold):**

- Item 1 still rules-based (`getCartSuggestions` `upsell.ts:397`, `scorePairing` `:97`, 1,245-line composite engine, no ML); the **real LLM substrate now exists** (`ai/gateway.ts` Anthropic SDK + prompt caching, `agent.ts` `MAX_HOPS=8` + approval gates, `ai/tools/` role-gated registry) — confirmed newly-true.
- Item 2 not shipped (no bundle thumbs-up/down; `FeedbackSurvey` is per-item ratings only). Item 3 half-shipped (enum + picker live; **join still absent** — 0 refund refs in `bundle-analytics/route.ts`). Item 4 Phase 1 only (`/admin/scheduled-bundles` + status PATCH live; **no Stripe Subscription / billingPortal / `STRIPE_SCHEDULE_WEBHOOK_SECRET`**; WhatsApp `confirm_and_pay` is one-shot). Item 5 captured-no-pivot (`BundleEvent.slotId` `store.ts:5588`). Item 6 not shipped (`CartUpsell` renders unconditionally beside `BundleLadder`). Item 9 manual proxy (sensitivity tornado over `computeSimulationActuals`; no auto-scheduler). Item 10 re-themed not thinned (full ~12-element cart stack present). Item 11 unchanged. Item 12 half-day (relational distributor ledger). Item 14 storage correct (`ingredientProducts` relational), no RFQ UI. Item 15 chain-wide recipes live (`getBaseSlug`), no yield-test UI.
- **Item 13 — V8 brand commitment SHIPPED — confirmed:** parchment/terracotta tokens `themes/homepage/tokens.css:26-43`, Cormorant + Lora loaded across `(public)/*`; no `/mockups/cart.html` dependency remains.

**D. New regressions beyond the 2026-05-29 Update:** rewards Rule-#1 finding confirmed (`generateReferralCode` `Math.random()` `growth-engine.ts:18`, called `rewards/page.tsx:292`; streak `:459`; challenge `:482`); the static-template **root is `getActiveChallenges()` `growth-engine.ts:126`** (no progress field). Adjacent: `simulateLiveActivity` (`growth-engine.ts:175,181-182`) is another `Math.random()` fake-data surface in the same module.

— *Verification lens: exhaustive claim-by-claim pass — 29 May 2026*
