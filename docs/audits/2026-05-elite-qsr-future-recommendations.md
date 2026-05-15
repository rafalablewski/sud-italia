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
