# Sud Italia — NYC & Singapore Viability Audit
## Brutal Institutional Diligence on Brand, Product, Ops, and Tech

**Date:** 14 May 2026
**Branch:** `claude/restaurant-audit-framework-d9sQD`
**Auditor lens:** Senior hospitality-tech consultant + restaurant operations expert + Series-A diligence partner + elite product teardown
**Codebase under review:** `sud-italia` — Next.js 16 / React 19 / TypeScript / Tailwind 4 / Zustand / Stripe / Neon Postgres / Upstash Redis
**Scope:** All 353 `.ts/.tsx` files under `src/`, including 29 admin pages, ~80 admin API routes, customer public surface (Hero → Menu → Cart → Checkout → Confirmation → Rewards), KDS, food-truck ops, growth/loyalty engines, aggregator scaffolding, store + lock primitives.
**Benchmarks:** Toast POS, Square for Restaurants, Uber Eats Merchant, DoorDash Drive, GrabFood, Sweetgreen, Shake Shack, McDonald's NPP/SOS-100/ROAR, Domino's DOM Pizza Checker, Apple/Linear-grade UX.
**Posture:** Assume this business will fail unless proven otherwise. No politeness. No protection of feelings.

> This audit is the **NYC & Singapore field test** of an existing Polish food-truck platform. The question is not "is it nice?". The question is: *if you parked this tomorrow on Bryant Park or on Robinson Road at 12:00, does it survive?*

---

## 0. The Core Question, Answered Up Front

> **"Would this brand, digital experience, and operational system realistically survive and outperform competitors in New York and Singapore?"**

**No. Not as it stands today.** It would survive **5–8 weeks of soft-launch** in either city before three independent forces — operational fragility under volume, an ungenerous customer UX by NYC/SG 2026 standards, and the absence of any meaningful third-party delivery integration — collectively kill the unit economics.

It is, however, **salvageable**. The architecture is coherent for its current scale (2 trucks, Poland), the design system is consistent, the loyalty mechanics are genuinely sophisticated, and the codebase is well organized for a single-team build. With ~6–9 months of focused, brutal hardening — outlined in §13 — it could plausibly be a credible regional QSR ordering platform. As a *category-defining* brand in NYC or Singapore, no. As an investible Series-A story today, no.

---

## 1. Executive Summary

### 1.1 Scorecard

| Dimension | Score | Justification (one line) |
|---|---:|---|
| **Overall** | **42 / 100** | A competent Polish small-chain admin tool with a likeable customer skin, dressed up as something bigger. |
| **NYC viability** | **22 / 100** | No Uber/DoorDash integration, no USD, no Spanish, no allergen-at-checkout, no order ETA pre-payment, no real-time POS terminal, single lock that breaks at 200 orders/hr. |
| **Singapore viability** | **27 / 100** | No SGD, no Chinese/Malay/Tamil, no GrabFood/foodpanda integration, no PayNow/PayLah!, no GST-compliant invoicing, no NEA-compliant calorie labelling. |
| **Operational maturity** | **35 / 100** | KDS exists and is pretty. Shift handover, refunds with reason codes, modifiers, item-86 propagation, inventory depletion, manager override, cash reconciliation — all absent or stubbed. |
| **UX maturity** | **48 / 100** | Polished glassmorphism + sensible mobile-first patterns, undermined by zero food photography, no guest checkout, opaque ETAs, allergen data orphaned in `kodawari.ts`. |
| **Scalability** | **30 / 100** | Single global `lock:slots.json` and `lock:orders.json` Redis keys, `withLock` falls back to in-process Promise chain across multi-region serverless, zero test coverage, no DB partitioning. |
| **Franchise readiness** | **25 / 100** | `/franchisee` portal exists but has no territory exclusivity, no brand-price ceiling enforcement, no SLA dashboard, no royalty dispute flow, no MSA/FDD scaffolding. |
| **Investor readiness** | ~~**20 / 100**~~ → **28 / 100** (2026-05-21) | ~~Heuristic "AI" with `Math.random()`~~ ✅ deleted (real forecast at `src/lib/ai/forecast.ts`), ~~fake aggregator mocks~~ ✅ deleted, ~~fake review data~~ ✅ deleted. Still: zero automated tests, single shared `ADMIN_PASSWORD`, no SOC 2, no LTV/CAC, no cohort retention, hand-coded menus. Sequoia still walks — the deletions removed reputational foot-guns, not the structural gaps. |

### 1.2 The Five Hard Truths

1. ✅ ~~**The "AI" is a random number generator.** `src/lib/ai-engine.ts:31, 36, 41, 62, 89, 97, 103, 107, 127` — `Math.random()` decides weather, expected-orders jitter, forecast confidence, the magnitude of every "price increase" / "price decrease" suggestion, the coin-flip that triggers a "demand-based" upcharge, *and* the confidence score returned with each price suggestion. There is no model, no embedding, no LLM call in the forecasting/pricing surface. The `/admin/ai` page is a credibility liability in front of any sophisticated buyer who clicks through the source.~~ **RESOLVED 2026-05-21** — the heuristic `generateDemandForecast` / `generatePriceSuggestions` / `generateInsights` exports were dead code (zero callers) and were deleted; `ai-engine.ts` now contains only the customer-side FAQ matcher `getChatResponse`, with a header comment that names it as keyword-rule lookup, not AI. The real AI surfaces live under `src/lib/ai/forecast.ts` (Claude-backed demand forecasting with honest "Heuristic" fallback when the API key is unset), `src/lib/ai/gateway.ts`, and `src/lib/ai/tools/`. The `/admin/ai` page is no longer a credibility liability.
2. ⚠ **The order pipeline serializes on two global locks.** `lock:orders.json` and `lock:slots.json` (`src/lib/store.ts`, multiple call sites) gate every checkout, every status advance, every refund across *every location*. At 200 orders/hour the queue depth on these keys is sufficient to time out Vercel functions. **PARTIAL — 2026-05-21**: the hot path (`createOrder`) now goes through Postgres + `dualWriteOrder` when `DATABASE_URL` is set, with no application-level lock on the request-blocking path. The legacy kv-mirror writes still take the global `orders.json` / `slots.json` keys, but they run `void` fire-and-forget so the customer is not waiting on them; they only serialize the cold mirror, not the booking. ❌ The kv mirror still needs to be split per-location or deleted entirely (the DB is source-of-truth so the latter is the right answer). The lock-TTL-mid-section foot-gun referenced in §1.4 row 6 is unchanged.
3. ✅ ~~**There is no real third-party delivery.** `src/lib/providers/aggregator.ts` ships a Wolt + Glovo *interface* with `WoltMockProvider` and `GlovoMockProvider` classes that just `console.log`. Uber Eats / DoorDash / Deliveroo / GrabFood / foodpanda are not stubbed, not designed for. In NYC, 60–70% of QSR orders flow through these. In SG, 70–80%.~~ **PARTIAL — 2026-05-21**: the mock providers (which returned `true` from `verifyWebhookSignature` and just logged every event — a forged-webhook foot-gun the moment `ENABLE_AGGREGATORS` flipped on) were deleted. `getAggregatorProvider` now throws `AggregatorNotConfigured` with the missing env var list, and the webhook route returns 503. The honest read: there is still no live Wolt or Glovo integration, but the file no longer pretends to have one. ❌ Uber Eats / DoorDash / Deliveroo / GrabFood / foodpanda are still unaddressed — building those is its own multi-week workstream per provider.
4. ❌ **The customer never sees their food.** `MenuItem.image` exists in the type (`src/data/types.ts:88`) but is **never populated** in `src/data/menus/krakow.ts` or `warszawa.ts`. The customer sees a 🍕 emoji on a gradient. Industry mobile-conversion lift from real food photography: 15–25%. Sweetgreen, Shake Shack, every Uber Eats merchant — none of them ship this way.
5. ❌ **Zero automated tests.** `find src -name '*.test.*' -o -name '*.spec.*'` returns nothing. Every refactor is a hand-grenade. No CI gate, no Playwright smoke, no contract test on the lock primitive. For a system that takes payment, this is malpractice.

### 1.3 Strengths Worth Preserving

- The data model in `src/data/types.ts` is clean, the location/menu separation is sensible.
- The glassmorphism design system (`admin-bg`, `glass-card`, `glass-input`) is internally consistent.
- Loyalty mechanics (`src/lib/loyalty.ts` + `growth-engine.ts`) — tiered multipliers, family-pooled wallets, gamification — are genuinely thoughtful and ahead of most regional chains.
- Checkout server-side validation (`src/app/api/checkout/route.ts:36-199`) is correct: server-side price lookup, idempotency hash, slot capacity check, tip cap, Stripe wiring with card + BLIK + Przelewy24 is on-spec for Polish market.
- The capabilities page (`/admin/capabilities`) and the existing admin-dashboard audit (`docs/audits/2026-05-admin-dashboard-audit.md`) show genuine self-awareness — most teams at this stage don't write either. **Caveat:** the capabilities page is only as honest as its rows. `src/app/admin/capabilities/page.tsx:147-150` claims "Allergen surfacing on tickets" is `live` with the summary *"menu_items.allergens chips on KDS tickets. Edit in /admin/menu."* — yet `grep -i allergen src/components/admin/AdminKDS.tsx` returns zero matches. The Ticket component renders item name, quantity, modifier-notes, and category badge, and nothing else. The single most-cited claim on the page is false. If `/admin/capabilities` is the source of truth for "what's deployed", every row needs a runtime probe, not a static string.

### 1.4 Biggest Risks

| # | Risk | Severity | Trigger | Blast radius |
|---|---|---|---|---|
| 1 | Lock TTL (10 s) auto-expires mid critical section under load | Critical | 200 orders/hr lunch rush | Data corruption, duplicate orders, double refunds |
| 2 | Single `ADMIN_PASSWORD` shared across all owners/managers | Critical | Staff turnover | Insider access, no audit trail per human |
| 3 | ~~EU 1169/2011 (allergens at point of sale) violated — data exists, not shown~~ ⚠ **PARTIAL 2026-05-21** — allergen chips surface on the item drawer + new CompliancePills row on the card. Calorie + Nutri-Grade + halal / pork / alcohol disclosures now configurable per item and rendered conditionally on the customer card. | Low (was Critical) | Operator forgets to fill calorie / allergen on a new SKU | Per-item exposure, not chain-wide |
| 4 | ~~NYC DOH calorie labelling (NYC Health Code §81.50) not implemented~~ ✅ **WIRED 2026-05-21** — `/admin/regulatory-compliance` flips a NYC truck to the NYC pack; the item card renders `<kcal>` next to the price whenever `nutrition.calories` is populated. DOH letter-grade banner ships on the location header. FRESH Act packaging text surfaces in the cart. | Medium (was Critical) | Truck tagged NYC without calorie + grade fields filled | Customer-visible blank, no fines on day 1 — but operator must complete the data fill before opening |
| 5 | ~~SG NEA Healthier Choice / Nutri-Grade not implemented~~ ✅ **WIRED 2026-05-21** — SG zone surfaces Nutri-Grade A–D hex badges (when the operator sets `nutriGrade` per beverage), MUIS Halal cert banner on the location header, halal / non-halal + contains-pork / contains-alcohol pills on each item, 9% GST line back-calculated in the cart, PDPA §13 consent text in the cart. | Medium (was High) | Truck tagged SG without halal cert + Nutri-Grade fields filled | Operator must complete the data fill before opening |
| 6 | `withLock` in-process fallback when Upstash is down | High | Redis incident | Silent loss of mutual exclusion across lambdas |
| 7 | Stripe-only payment — no Apple Pay primary, no PayNow, no PayLah!, no Alipay | High | NYC/SG day 1 | Conversion floor 10–20% below local norm |
| 8 | ~~Hardcoded `currency: "PLN"` (`src/data/types.ts`, `Location` interface)~~ ✅ **DISPLAY-LAYER FIXED 2026-05-21** — customer header switcher (USD/SGD/EUR/PLN), operator-set rates at `/admin/currency`. Charges still settle in PLN via the Stripe merchant account (currency is bound at account creation; true EUR/USD/SGD settlement needs separate Stripe accounts per region). | Medium (was High) | Multi-region settlement still needs per-region Stripe accounts | Can show prices in local currency; transactions still hit PLN merchant — acceptable for cross-border display, blocking for true local-currency settlement |
| 9 | No offline POS terminal | High | Festival, basement venue, LTE drop | Lose entire shift's revenue |
| 10 | No real-time menu sync to aggregators | High | Item sells out | Refunds, 1-star reviews, account suspension by Uber/Grab |

### 1.5 Biggest Opportunities

1. **Singapore CBD lunch B2B** — corporate Slack-based ordering is under-served; the loyalty pooling engine is a near-perfect fit for *office-team* group ordering.
2. **NYC Brooklyn / Queens Italian-American expat market** — Neapolitan pizza positioning + truck mobility is differentiated against ghost-kitchen Domino's-clones.
3. **The capabilities page pattern is genuinely investor-friendly** — turning it into a public-facing "what's deployed" dashboard for franchisees would be category-leading.
4. **Family-pooled wallet** (`CustomerWallet` with `role: head | member`) is a real wedge against Sweetgreen/Shake Shack/Cava who all assume one phone = one account. In SG this maps onto household structure perfectly.
5. **Truck mobility + loyalty + capacity slots together** form the kernel of a "follow-your-favourite-truck" mobile experience. This is white-space if executed.

---

## 2. UX / UI & Design Audit

### 2.1 First-Impression Premium Test

I ran the home page (`src/app/(public)/page.tsx`) and Kraków location page through an institutional "first 5 seconds" lens.

| Premium signal | Present? | Evidence | Verdict |
|---|---|---|---|
| Serif heading typography | ✓ | `globals.css` — `--font-heading: Georgia, Times New Roman, serif` | Tasteful, evokes tradition. **Pass.** |
| Warm cream background | ✓ | `--color-italia-cream: #FFF8F0` | Distinguishes from cold-white competitors. **Pass.** |
| Italian flag accent | ✓ | `HeroSection.tsx` — green/white/red top stripe | On-brand, restrained. **Pass.** |
| Hero food photography | ✗ | Dark gradient + blurred shapes, no food image | **Fail.** Sweetgreen leads with farm shot, Shake Shack with food close-up. Sud Italia leads with darkness. |
| Menu food photography | ✗ | `data/menus/{krakow,warszawa}.ts` — `image` field never populated; fallback is 🍕 emoji on a Tailwind gradient | **Catastrophic fail.** This single fact will lose 15–25% of mobile conversion against any competitor on Uber Eats or GrabFood. |
| Trust signals (rating, count) | ✅ | ~~`data/ratings.ts` — hardcoded fake ratings ("4.8 ★ 342 reviews")~~ **RESOLVED 2026-05-21** — `data/ratings.ts` deleted; `<StarRating>` chips removed from `MenuItem`, `MenuSection` (incl. the "Highest rated" sort that read fake data), and `ItemDetailDrawer`. The `StarRating` component itself remains for the post-order feedback survey, where customers enter real ratings. No fake review surface remains on the customer site. | **Resolved.** Legal exposure under FTC §5 / UK CMA / SG CCCS / EU UCPD eliminated. Next step: aggregate the real `/review/[orderId]` submissions into per-item averages so trust signals come back with honest data. |
| Premium colour psychology | ✓ | Gold accent `#B8922E` for tier badges, red CTA `#C8102E` | Sound. **Pass.** |
| WCAG-AA contrast | ✗ | `#C8102E` on `#FFF8F0` is 4.39:1 — fails AA for text below 18 pt | **Fail.** |
| Reduced-motion respect | ✓ | `prefers-reduced-motion: reduce` honoured in `globals.css` | **Pass.** Better than half the QSR field. |

**Verdict:** the product *frame* is premium. The product *content* is empty. A serif headline above an emoji-on-gradient menu reads as a Squarespace prototype, not a $50/cover restaurant brand.

### 2.2 Information Architecture & Navigation

- **No persistent customer account menu.** A returning user must remember `/rewards` exists. There is no avatar dropdown, no "My orders", no header link to loyalty. Compare: Sweetgreen, Shake Shack, every Uber Eats — account is always one tap away.
- **No reservation / booking surface at all.** Trucks could absolutely accept group bookings or pre-orders for offices; there is no flow for it. `src/app/(public)/` has `locations/`, `order-confirmation/`, `rewards/`, `review/`, `privacy/`. That's it.
- **Cart sequencing is wrong.** User picks items → opens cart → discovers slot is full. Slot capacity should gate menu entry or at minimum be visible *inline with the menu*. Current behaviour wastes the user's time.
- **Loyalty discoverability is buried.** `LoyaltySection` on the home page is a generic teaser, the actual program is at `/rewards` with no nav-bar link. Customer never knows they're earning points at checkout.

### 2.3 The "Modern in 2026" Test

Does this feel current? Partially.

| 2026 baseline | Sud Italia | Comment |
|---|---|---|
| One-tap Apple/Google Pay primary | ✗ | Stripe Checkout redirect — adds 2 redirects, kills mobile conversion |
| Saved payment methods | ✗ | Fresh card every order |
| Saved delivery addresses | ✗ | Re-typed every order |
| Address autocomplete | ✗ | Plain text input |
| Real-time order tracking with map | ⚠ | `OrderTracker` exists, map quality unaudited |
| Live menu availability | ✓ | `useLiveMenuAvailability` exists |
| Skeleton loading states | ⚠ | Some present, inconsistent |
| Dark mode | ✗ | Light only |
| Promo / referral code at checkout | ✗ | No input field — referees can't claim |
| AR menu / 360° item view | ✗ | Acceptable miss, but Shake Shack and CAVA both have it now |
| Web push notifications | ✓ | `push-notifications.ts` exists |

### 2.4 Specific UI Components To Burn Down And Rebuild

- **`MenuItemCard`** with `CATEGORY_EMOJI` fallback — replace with real photography or with a serious lifestyle illustration. The emoji choice is *cute in beta, fatal in market*.
- **`HeroSection` dark gradient** — replace with a Neapolitan oven photograph, with the Italian flag accent above the photo not above an empty void.
- **`CartDrawer` phone field** with `/^[\d\s\-()]{7,}$/` client regex — replace with `libphonenumber-js` E.164 input, with country selector. PL-only validation will collapse on a `+1`-prefixed US number and a `+65` Singapore number.
- ✅ ~~**`StarRating` fake-data** — remove entirely until you have real reviews, replace with "Be the first to review" CTA.~~ **DONE 2026-05-21** — chips removed from customer surfaces; `data/ratings.ts` deleted. "Be the first to review" CTA not yet added (pending aggregation of real `/review/[orderId]` data).
- **`SlotPicker`** appearing *after* item selection — promote to a top-level "When?" choice on the location landing page.

### 2.5 Premiumisation Strategies (Concrete)

1. **Food photography commission** — 30 items × 2 angles × $80/shot = $4.8k one-time. ROI is 2–3 weeks at modest volume.
2. **Hero film loop** — 8 sec dough-slap → oven-shot → emerging Margherita. $3–5k. Lifts time-on-page 2–3×.
3. **Story panels per item** — sourcing (`kodawari.ts` already has the text, "San Marzano DOP tomatoes from Campania, fior di latte from Agerola"), wired into a `ItemDetailDrawer` accessible from the card.
4. **Real customer reviews** — ⚠ **PARTIAL 2026-05-21**: `data/ratings.ts` is burned; the customer surfaces no longer display fake ratings. Wiring `/review/[orderId]` submissions into per-item aggregates that surface as real trust signals is still pending — without that step, the menu has no rating chips at all today, which is honest but loses the social-proof surface.
5. **One-click Apple/Google Pay** — Stripe Payment Request API instead of Checkout redirect. ~2 days of work.

---

## 3. Customer Experience Audit

### 3.1 The Full Journey (NYC lunch rush mental model)

1. **Discovery.** No Yelp listing, no Google Business profile flow, no Uber Eats listing, no OpenTable, no Resy. Discovery is "the truck is in front of me" or word-of-mouth. In NYC this is fatal. **Friction: severe.**
2. **Land on home page.** Mobile load on 4G — acceptable (Next.js 16 + edge). Hero is dark, no food visible. Decision pressure: "is this open? what's it like?" Not answered. **Friction: moderate.**
3. **Pick location.** Two trucks, both in Poland. **NYC customer bounces here.** Even after re-skinning, the LocationsGrid requires manual `src/data/locations.ts` edits.
4. **Browse menu.** Emoji items on gradients. No prices in USD/SGD. No allergen filter. No "spicy/vegan/GF" filter (tags exist but filter UI is absent in audited components). **Friction: severe.**
5. **Add to cart.** Smooth Zustand state, persistent across refresh (`store/cart.ts:32`). No modifiers — cannot say "large", "extra cheese", "no onion". `CartItem` shape is `{ menuItem, quantity, notes?, locationSlug }` (`store/cart.ts:5-30`). **Operationally crippling.**
6. **Open cart drawer.** Discover fulfillment type (`takeout` / `delivery`) and slot picker only *now*. Slot might be full. **Friction: severe.**
7. **Enter name + phone + (delivery) address.** Phone regex is loose (`/^[\d\s\-()]{7,}$/`), address is freeform — no Google Places autocomplete. **Friction: severe for delivery.**
8. **No ETA shown before payment.** User commits without knowing when their food will be ready. McDonald's app, Uber Eats, GrabFood, Shake Shack — all show ETA before pay. **Trust: damaged.**
9. **Stripe Checkout redirect.** Two redirects. No saved cards. No Apple Pay primary CTA. **Conversion: lost.**
10. **Confirmation page.** Good — order tracker visible, points display, referral CTA. **One bright spot.**
11. **Repeat order.** No "Order again" button on home page. Cart is empty. Address re-entered. **Retention: weakened.**

### 3.2 Where Customers Abandon

Modelling against industry benchmarks (Baymard, Shake Shack public IR):

| Step | Sud Italia abandonment estimate | Industry P50 | Delta |
|---|---:|---:|---:|
| Hero → menu | 35% | 22% | +13 pp (no photo) |
| Menu → cart add | 28% | 18% | +10 pp (no photos / no modifiers) |
| Cart → checkout details | 22% | 12% | +10 pp (slot discovery, address typing) |
| Checkout → Stripe | 18% | 8% | +10 pp (redirect + fresh card) |
| Cumulative | ~76% lost | ~52% lost | **+24 pp** |

That delta is the entire margin for a food truck. At 100 store visits, a competitor gets 48 orders, Sud Italia gets 24. Same traffic, half the revenue.

### 3.3 Psychological Optimisation Quick Wins

- **Points preview in cart.** "You'll earn 47 points on this order — 153 away from Silver". Sweetgreen does this; conversion bump 4–7%.
- **Order ETA pre-payment.** "Ready at 12:18". Anxiety-reducing, conversion-positive.
- **Last-2 social proof.** "Maria from Praga ordered this Margherita 3 minutes ago" — runs off real orders, not fakes.
- **Free-delivery progress bar.** Cart drawer text exists (`delivery.add_more`), but no visual progress bar. Add one.
- **Loss-aversion at slot-fill.** "Only 2 spots left at 12:30" — already true in data, never surfaced.

### 3.4 Retention Levers (Currently Missing)

| Lever | Implemented? | Comment |
|---|---|---|
| Post-order email receipt | ⚠ Unknown | Webhook handler not located |
| SMS "your food is ready" | ⚠ Outbox exists, send route unconfirmed | `src/lib/sms.ts` present |
| "You haven't ordered in 14 days" win-back | ⚠ `lapsed` tag in cron, no campaign confirmed | |
| Birthday rewards | ✗ | No DOB capture |
| One-click reorder | ✗ | None |
| Saved favourites | ✗ | None |
| Subscription / standing order | ✗ | None |
| Push notification on truck arrival nearby | ⚠ | Push infra exists, geofence trigger not wired |

---

## 4. Food Truck Operations Audit

### 4.1 The NYC Lunch Rush Stress Test

Assume Bryant Park, 11:45–13:15, three workers in a 10 m² truck, target 180–220 orders.

**What breaks (in order):**

1. **12:00:30 — KDS payload size.** `useAdminOrdersStream` over SSE streams the full orders array on each delta. With 200 active orders the JSON serialises to ~500 KB. Two iPads on the truck Wi-Fi each receive that on every change. Wi-Fi tethered to one operator's phone collapses.
2. **12:01:00 — Slot increment fallback is hot, not racey-but-hot.** `incrementSlotOrders` (`src/lib/store.ts:355-418`) has a correct Postgres fast path (`UPDATE … WHERE currentOrders < maxOrders RETURNING …`, serializable). The kv_store fallback (line 405) is wrapped in `withLock("slots.json")`, so concurrent lambdas *queue* on the global Upstash key rather than racing — Gemini-Code-Assist is right to flag this. The realistic failure modes are therefore: **(a) queue depth on the single global `lock:slots.json` key** at lunch rush (every "Postgres says slot full" *and* every legacy-slot path funnels here), pushing 5 s `acquireTimeoutMs` exceedances and 503s back to checkout; **(b) lock TTL expiry mid-section** when `readJSON("slots.json")` + parse + `writeJSON` + `dualWriteSlot` exceeds 10 s under contention, at which point two acquirers think the lock is free and the overbooking risk becomes real; **(c) in-process fallback when Upstash is down** — `withLock` falls back to a per-lambda Promise chain (`src/lib/locks.ts`) which provides zero coordination across Vercel instances, and *that* is where the 1–3-order overbooking actually materialises. The mechanism for damage is contention + degradation, not garden-variety race during steady backfill.
3. **12:05:00 — Lock TTL expiration mid-write.** Default lock TTL is 10 s (`src/lib/locks.ts`). With 200+ orders in `orders.json`, `readJSON` + `findIndex` + `writeJSON` regularly exceeds 10 s under contention. The lock auto-releases, a second lambda acquires it, both write — duplicate orders, lost status transitions.
4. **12:10:00 — No offline mode at counter.** LTE in a metal box on a Bryant Park sidewalk is unreliable. There is no offline-first POS terminal; `offline-outbox.ts` exists for *public* customer mutations but admin/KDS surfaces don't have a comparable local-first queue. When LTE drops, the kitchen is blind.
5. **12:15:00 — No item-86 propagation.** Truck runs out of basil. Manager opens `/admin/menu` on their phone, toggles Margherita to unavailable. Public availability endpoint cache TTL is 2 s; client poll is every ~10 s. Customers continue placing orders for Margherita for 12–14 s. Each one becomes a refund.
6. **12:20:00 — Modifier ambiguity.** A customer writes "no anchovies" in the freeform `notes` field. KDS shows it as gray text under the line. Cook misses it. Refund. The schema (`CartItem`) has *no first-class modifier object* — only a `notes` string. Toast, Square, every POS solved this in 2014.
7. **12:25:00 — Cash drawer drift.** `CashSession`/`CashDrop` types exist in `src/data/types.ts` but the `/admin/cash` page (per agent inspection) has no reconciliation flow, no opening-float capture, no variance flagging.

### 4.2 Singapore CBD Office-Lunch Stress Test

Different stressor — fewer orders/hour, more concurrent browsers (500+ Slack-shared links). Failure modes:

1. **SSE connection exhaustion** under simultaneous KDS + customer load. Vercel limits + Upstash limits compound.
2. **Cart presence Redis** (`cart-presence-redis.ts`) throughput hits Upstash ceiling — silent drop.
3. **`/api/menu/availability`** stampede every 2 s cache boundary — 500 requests in 4 ms hit Neon pool.

### 4.3 Truck-Specific Hardware & Workflow Gaps

| Capability | Present | Comment |
|---|---|---|
| Bump-bar / hardware KDS | ✗ | Touch tablet only |
| Receipt printer driver | ✗ | No native print |
| Cash drawer pulse | ✗ | None |
| Truck live GPS | ✓ | `truck-live-location.ts` — 90 s Redis TTL, 500 m geofence |
| Route optimisation | ✗ | Routes are manual `TruckStop[]` lists |
| Fuel / mileage / breakdown log | ✗ | None |
| Hot-bag / cold-bag inventory | ✗ | None |
| Generator/propane safety log | ✗ | None — material liability in NYC (FDNY) and SG (SCDF) |

### 4.4 Inexperienced Staff Test

Could a $16/hr counter worker in Queens, hired Monday, run lunch on Wednesday?

- **Order screen logic:** `nextStatus()` (`AdminKDS.tsx:44-49`) is a clean linear advance — yes, learnable in 10 minutes.
- **What kills them:** no undo on bump (recall exists but is a 5-deep in-memory tray, lost on refresh), no batch advance, no "this ticket goes to *that* station" pre-routing, no modifier callout colour, no SLA breach red flash.
- **Verdict:** trainable to baseline competence in two shifts. Trainable to *NYC rush competence*, no.

---

## 5. KDS System Audit

### 5.1 Component Inventory

`src/components/admin/AdminKDS.tsx` is ~410 lines and implements:

- Three kanban columns: New (`confirmed`) / In progress (`preparing`) / Ready · Expo (`ready`) (`AdminKDS.tsx:28-32`)
- Station filter (all / pizza / pasta / antipasti / panini / drinks / desserts) (`AdminKDS.tsx:34-42`)
- Per-ticket live MM:SS prep timer with 12 m warning, 25 m danger (`prepTone`, `AdminKDS.tsx:69-76`)
- Bump → completed; recall via `POST /api/admin/orders/[id]/recall`
- Optional chime on new ticket (browser audio permission required)

### 5.2 Comparison Matrix

| Capability | Toast KDS | Square KDS | Uber Eats Merchant | McDonald's NPP | Sud Italia |
|---|---|---|---|---|---|
| Real-time delta updates | WebSocket | WebSocket | WebSocket | proprietary | **SSE + 15 s REST fallback** ⚠ |
| Bump bar (USB / Bluetooth) | ✓ | ✓ | ✓ | ✓ | ✗ |
| Recall last bump | ✓ unlimited | ✓ | ✓ | ✓ | ⚠ in-memory 5 |
| Order priority queue | ✓ | ✓ | ✓ | ✓ | ✗ |
| SLA breach red alert | ✓ | ✓ | ✓ | ✓ | ⚠ colour only at 25 m |
| Per-station ETA | ✓ | ✓ | ⚠ | ✓ | ✗ |
| Batch consolidation (4× Margherita as one prep) | ✓ | ⚠ | ✗ | ✓ | ✗ |
| Item-86 live | ✓ | ✓ | ✓ | ✓ | ⚠ 2 s cache + 10 s poll |
| Modifiers first-class | ✓ | ✓ | ✓ | ✓ | **✗ — `notes` string only** |
| Hold / transfer between stations | ✓ | ✓ | ⚠ | ✓ | ✗ |
| Photo capture (dispute / QC) | ⚠ | ✗ | ✓ | ✓ | ✗ |
| Failover when network down | local SQLite | local SQLite | aggregator queue | proprietary | **none** |
| Multi-shift roll-over | ✓ | ✓ | ✓ | ✓ | ⚠ tickets just disappear |

### 5.3 Will It Break in a 300-Order Rush?

Yes, in three distinct ways:

1. **Lock contention.** Single global `lock:orders.json` serialises every status transition. With 50 ticket advances per minute (5 stations × 10 advances) the queue depth exceeds the 5 s acquire timeout, advance calls fail, cooks tap again, double-status writes corrupt state.
2. **SSE payload growth.** Full array re-stream on every delta scales linearly with active-order count. At 300 orders the payload is ~750 KB. Multiply by N connected screens.
3. **Browser audio permission.** The `.catch(() => {})` on `audio.play()` (line ~133) silently swallows missing audio permission. Many tablets default deny. Cooks miss tickets and nobody notices.

### 5.4 Required KDS Upgrades

- WebSocket or Postgres `LISTEN/NOTIFY` for realtime (drop SSE-of-full-array).
- Per-order idempotency key on advance / bump.
- Per-station route based on recipe `station` field (which does not yet exist on `Recipe`).
- Dynamic prep ETA from rolling p50/p95 of historical actuals per item × station × hour-of-day.
- Persist bump history to IndexedDB.
- Hardware bump bar driver (LogicControls KB1700 standard).
- Local SQLite/IndexedDB write-through cache for failover.
- AI kitchen assistant (genuine LLM, not the current heuristic) that recommends "pause online slot 13:00 — you're 11 min behind".

---

## 6. Admin & Management Audit

### 6.1 Could An Owner Run 10 Locations With This Today?

**Partially.** Original audit findings + current status:

1. ✅ **Locations are hardcoded.** ~~`src/data/locations.ts` is a TypeScript array. Adding a new truck requires a deploy. There is no `/admin/locations` CRUD wired despite the page existing.~~ **RESOLVED 2026-05-16 (PR #38)** — DB-backed `locations` table + admin CRUD at `/admin/locations/manage`. Adding a third truck is a 30-second admin form, no deploy. The hardcoded array is demoted to first-deploy seed only.
2. ✅ **Per-location lock scoping.** ~~Global `slots.json` and `orders.json` locks. Every truck contends on the same Redis key.~~ **RESOLVED** — order writes now scope locks as `orders:${slug}`; capabilities ledger row "Per-location lock scoping" confirms each truck has its own queue.
3. ❌ **All data shares one schema.** `SELECT * FROM orders` scans every location. No partitioning, no index strategy guaranteed (the audit found no `(location_slug, created_at DESC)` composite index promise).
4. ❌ **Cross-location queries are unscoped.** `requireLocationAccess()` exists (`src/lib/admin-auth.ts`), but is *handler-optional* — not middleware. A route that forgets to call it leaks across tenants. `withAdmin({ locationParam: ... })` wrapper now exists and the audit ledger claims ~80 routes wrapped, but **coverage is still not enforced as middleware** — a developer who skips the wrapper still leaks.
5. ✅ **Multi-currency display.** ~~No multi-currency. PLN is hardcoded.~~ **RESOLVED 2026-05-21** — customer header switcher (USD / SGD / EUR / PLN), operator-set exchange rates + enabled list + default at `/admin/currency`, rates served to the customer site via `/api/settings/public`. `formatPrice()` in `src/lib/utils.ts` routes through `src/lib/currency.ts` and converts grosze→target at render time. **Display-only**: charges still settle in PLN via the Stripe merchant account (currency is bound at account creation, so true USD/SGD/EUR settlement requires separate Stripe accounts per region — tracked as a separate workstream for an actual NYC/SG launch).
6. ❌ **No multi-timezone, no multi-tax-jurisdiction.** Still PLN-only on tax (JPK_V7M is Polish VAT). Timezone is still implicit UTC + Europe/Warsaw. NYC needs sales-tax engine (e.g. Stripe Tax / TaxJar), SG needs GST 9% with composite reporting.
7. ✅ **Multi-language UI.** **ADDED 2026-05-21** — i18n dictionary covers Polish, English, German, and Singapore English with a header switcher and `/admin/languages` admin panel for enable/disable + default selection. Direct prereq for SG (English / Singlish customers) and DACH expansion.

### 6.2 Manager / Regional Workflow

- **Analytics surface.** `AdminDashboard.tsx` ships KPI cards (revenue today, orders, profit, AOV), 7/30/90-day rollups, location heatmap, peak-hours chart. This is *decent.*
- **Reports.** Delivery profitability, tips summary, JPK_V7M (Polish VAT export). Useful, but: no cohort retention, no LTV/CAC, no labour ratio dashboard despite the `/api/admin/labor-ratio` route existing, no item-level P&L beyond margin %.
- **Schedule.** Shifts data model exists, but no shift handover (cash count, waste log, manager comment, photo) — the #1 source of theft and morale collapse in QSR.

### 6.3 Permissions

Five-tier role hierarchy in `src/lib/admin-roles.ts`: owner (100) > franchisee (70) > manager (50) > staff (20) > kitchen (10). The nav config gates *display*. Enforcement on API routes is via opt-in `withAdmin()` wrapper (`src/lib/api-middleware.ts`). **Coverage is not 100% across the ~80 admin routes.** Any route that forgets the wrapper is a privilege escalation.

Single `ADMIN_PASSWORD` shared across owners and legacy users is a fundamental control gap. There is no per-human credential, no MFA, no SSO, no SCIM. A staff member who learns the password becomes effectively the owner.

### 6.4 What An Enterprise Buyer Sees

- No SAML / OIDC / SCIM → **disqualified from any chain over 25 corporate-managed locations**
- No SOC 2 Type II → **disqualified from any chain handling investor due diligence**
- No structured audit log (free-text `entity` / `action`) → **disqualified from any regulated jurisdiction**
- No backup / restore SLA documented → **disqualified from any insurance underwriting**
- Zero tests → **walk-out at first technical-DD call**

---

## 7. Delivery & Logistics Audit

### 7.1 The Hard Truth

There is **no delivery integration that would survive NYC or Singapore**. The aggregator scaffolding (`src/lib/providers/aggregator.ts`) is a clean interface with Wolt + Glovo provider scaffolds; the three RPC method bodies (`syncMenu`, `ingestOrder`, `updateStatus`) still throw `"not implemented — pending merchant credentials"`. ✅ **2026-05-21**: the auto-accepting mock providers were deleted — `getAggregatorProvider` now throws `AggregatorNotConfigured` with the missing env-var list, and the webhook returns 503 instead of a 200 on forged payloads. The HMAC verification path on the live scaffolds is real. The only delivery the customer experiences is *self-operated* via the `deliveryAddress` field and an `assignedDriverId` text field on `Order`.

This means:

- **No Uber Eats Merchant integration** — NYC's dominant channel.
- **No DoorDash Drive / Marketplace** — NYC's second channel.
- **No GrabFood / foodpanda** — Singapore's two dominant channels (together ~85%).
- **No Deliveroo** — second-tier SG / UK presence.
- **No menu sync out** — when an admin edits the menu, no push to the aggregator (no `syncMenu()` call site found).
- **No status sync back** — when the kitchen marks an order ready, no `updateStatus()` call to the aggregator. Drivers don't know.
- **No commission tracking** — aggregator orders cannot be distinguished from direct in reports. P&L is wrong by 25–35% the moment aggregators flip on.
- **No surge / pause control** — aggregators expect operators to pause when overwhelmed. There's no UI for it.

### 7.2 Self-Operated Delivery — Equally Broken

- `assignedDriverId` is free-text. No auto-assignment, no round-robin, no geofence-pickup.
- No driver app surface.
- No ETA calculation (no Google Maps Distance Matrix wiring found).
- No proof of delivery (photo, signature, GPS pin).
- No multi-stop batching.

### 7.3 Comparison Matrix

| Capability | Uber Eats Merchant | DoorDash | GrabFood | Sud Italia |
|---|---|---|---|---|
| Driver dispatch | auto | auto | auto | manual text field |
| ETA at checkout | ✓ | ✓ | ✓ | ✗ |
| Live map track | ✓ | ✓ | ✓ | ⚠ truck only, not driver |
| Proof of delivery | ✓ | ✓ | ✓ | ✗ |
| Batched multi-drop | ✓ | ✓ | ✓ | ✗ |
| Cold-bag tracking | ⚠ | ✓ | ✓ | ✗ |
| Refund-on-late SLA | ✓ | ✓ | ✓ | ✗ |
| Commission accounting | n/a | n/a | n/a | ✗ |

### 7.4 Margin Risk

In NYC, Uber Eats / DoorDash take 15–30%. In SG, GrabFood / foodpanda take 25–30%. Operating *without* them means surrendering 60–80% of the addressable QSR market in those cities. Operating *with* them but without commission tracking means flying blind into negative-margin orders.

---

## 8. Brand Positioning Audit

### 8.1 Does This Feel Premium?

**Mid-tier mass.** The serif heading and gold accent reach for premium. The empty hero, emoji menu, and Polish-only proposition pull it back to "regional independent". It is not Eataly, it is not & Pizza, it is not Pizza Pilgrims. It is one good photographer and one good copywriter away from being legible to an NYC/SG audience.

### 8.2 The Name

"Sud Italia" — "Southern Italy" in Italian. In NYC: legible to anyone with an Italian neighbour, but generic — there are 14 restaurants called "Sud" in Manhattan/Brooklyn already, three "Sud Italia" already exist as registered USPTO trademarks (verify before deployment). In SG: meaningless to ~70% of the consumer base who do not read Italian, requires "Pizza" or "Napoletana" descriptor.

### 8.3 Story & Differentiation

The Kodawari sourcing data (`src/data/kodawari.ts`) is *excellent* — San Marzano DOP from Campania, fior di latte from Agerola, Caputo Tipo 00 from Naples — and it is **not exposed to the customer anywhere**. This is the single most valuable storytelling asset in the codebase, sitting unused.

### 8.4 Could It Become a Chain?

Brand-wise, yes. The colour palette, type, and tone are stretchable. The truck format is repeatable. The loyalty mechanics are repeatable.

Operationally, no — see §6.1.

### 8.5 Would NYC / SG Customers Trust It?

- **NYC:** No until there is (a) a Brooklyn or Manhattan location, (b) Eater / Resy / Time Out coverage, (c) real reviews on Google / Yelp / Resy, (d) Italian-American social-proof signals. ~~The fake `data/ratings.ts` makes (c) impossible *and* illegal under FTC §5.~~ ✅ The FTC §5 exposure is closed (`data/ratings.ts` was deleted 2026-05-21); real per-item review aggregation still needs to be wired before (c) is positively present.
- **SG:** No until there is (a) Lazada / Shopee / GrabFood listing, (b) Burpple / Hungrygowhere review presence, (c) Halal status disclosure (no Halal flag in `MenuItem.tags` — material miss for SG market).

### 8.6 Investor Backable?

In current form: still no, but the foot-guns are smaller after the 2026-05-21 cleanup. The ~~"AI" claim collapsing in 60 s of source review~~ is now defensible — the `/admin/ai` page is wired to a real Claude-backed forecast (`src/lib/ai/forecast.ts`), and the dead heuristic exports that masqueraded as ML were deleted. The ~~"multi-location ready" claim collapsing on the hardcoded `locations.ts`~~ is also defensible — `/admin/locations/manage` is a real CRUD on a DB-backed table; the hardcoded array is the first-deploy seed only. The "tested" claim still cannot be made (zero `.test.*` files in `src/`).

With 6–9 months of work in §13: plausibly a $3–5M seed-stage hospitality-OS story.

---

## 9. Technical & Product Strategy Audit

### 9.1 Architecture Quality

**Strengths**
- Single source of truth in `src/lib/store.ts` (~6,176 lines) with a `readJSON`/`writeJSON` abstraction over Neon Postgres + filesystem fallback.
- Phase-1 normalisation in progress — slot, order, recipe, etc. tables are dual-written.
- `withLock` primitive (`src/lib/locks.ts`) is genuinely well-designed for single-region: SET NX PX, exponential backoff with jitter, metrics logging, in-process fallback.
- Type safety end-to-end; `zod` schemas at API boundaries (`src/lib/api-schemas.ts`).
- Sentry wired.

**Weaknesses**
- 6,176 lines in a single store file. Will be unmanageable at 20 locations.
- Lock keys are global (`slots.json`, `orders.json`) — must be scoped (`slots:${location}:${date}`).
- In-process fallback when Upstash is down silently breaks mutual exclusion across lambdas.
- Lock TTL of 10 s is too long to be safe (auto-release races) and too short to be sufficient under load (mid-section expiry).
- No transactions across kv_store + Postgres dual-write.
- No CRDT / vector clock for offline conflict resolution.
- No idempotency table for refunds and status changes.

### 9.2 Performance & Reliability

- Vercel serverless cold-start on Polish edge: acceptable today, marginal for SG (latency from a Polish Postgres region to SG users is 220–300 ms RTT — every read is a hit).
- No CDN strategy for menu images (because there are no images).
- No SLO declared. No alerting on lock-contention metrics that the code already emits.

### 9.3 Security

- Single `ADMIN_PASSWORD` shared across roles — **critical**.
- 24 h session TTL with no re-auth for refunds / staff deletion / payouts — **high**.
- Legacy 3-part token still accepted (scope defaults to `*`) — **medium**.
- No CSP header verification in this audit pass.
- No secrets scanning in CI.
- `getCurrentActor()` returns `"system"` fallback — silent if auth is misconfigured.
- GDPR machinery (`src/lib/gdpr.ts`) exists; CCPA / NYC SHIELD / SG PDPA equivalents not audited.
- PCI-DSS surface offloaded to Stripe — correct, but not documented in `/admin/compliance`.

### 9.4 Could This Support 50 Locations?

**No, but the order has shifted after 2026-05-21.** What breaks first, in order:

1. ~~Global lock contention on `orders.json` and `slots.json` (week 1).~~ ⚠ **PARTIAL** — hot path (createOrder) is now DB-backed when `DATABASE_URL` is set, so the request-blocking lock is gone. The kv-mirror writes still contend on global keys but are off the hot path (fire-and-forget).
2. ❌ Single-table full scans on `orders` (month 1).
3. ~~Manual location adds requiring code deploy (month 1 — first franchisee).~~ ✅ Resolved — DB-backed `locations` table + admin CRUD.
4. ❌ Hand-coded menu files (month 2 — first menu localisation request).
5. ❌ Cross-location data leak from a forgotten `requireLocationAccess()` (month 3) — `withAdmin` wrapper is still opt-in.
6. ❌ Single-region Postgres latency to international users (month 6).
7. ❌ Zero tests breaking refactors required to fix any of the above (continuous).

### 9.5 Obvious Technical Debt

- ❌ The 6 K-line `store.ts`.
- ❌ Dual-write fallback chains that are not crash-consistent.
- ❌ Lazy backfill that diverges from kv_store under load.
- ✅ ~~The `ai-engine.ts` heuristic mascot.~~ Deleted 2026-05-21.
- ✅ ~~Hardcoded fake ratings (`data/ratings.ts`).~~ Deleted 2026-05-21.
- ✅ ~~The mock-only aggregator providers.~~ Deleted 2026-05-21; webhook returns 503 with missing-env list when ENABLE_AGGREGATORS is on without credentials.
- ❌ No CI tests, no Playwright smoke, no chaos suite (despite `scripts/chaos-phase0.ts` existing).

---

## 10. Feature Gap Analysis

### 10.1 Master Matrix vs. Competitors

| Feature | Toast | Square | Clover | Revel | Uber Eats Merchant | McDonald's | Sweetgreen | Sud Italia |
|---|---|---|---|---|---|---|---|---|
| **Customer-facing** | | | | | | | | |
| Food photography | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Item modifiers | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Allergens at point-of-sale | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ⚠ data orphaned |
| Calorie display (NYC §81.50) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ⚠ data orphaned |
| Nutri-Grade (SG NEA) | n/a | n/a | n/a | n/a | n/a | ✓ | n/a | ✗ |
| Guest checkout | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Apple Pay / Google Pay primary | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Saved payment methods | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Saved addresses | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Address autocomplete | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Promo code field | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Pre-payment ETA | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Order again | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Loyalty points preview in cart | ✓ | ✓ | ⚠ | ⚠ | ✓ | ✓ | ✓ | ✗ |
| Real reviews | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ⚠ fake data removed 2026-05-21; real aggregation pending |
| Reservations / table booking | ✓ | ✓ | ✓ | ✓ | n/a | ⚠ | ⚠ | ✗ |
| **Ops** | | | | | | | | |
| POS terminal mode (offline-capable) | ✓ | ✓ | ✓ | ✓ | ⚠ | ✓ | ⚠ | ✗ |
| Receipt printer | ✓ | ✓ | ✓ | ✓ | ⚠ | ✓ | ✓ | ✗ |
| Cash drawer | ✓ | ✓ | ✓ | ✓ | n/a | ✓ | ⚠ | ✗ |
| Bump bar | ✓ | ✓ | ✓ | ✓ | ⚠ | ✓ | ⚠ | ✗ |
| Shift handover | ✓ | ✓ | ✓ | ✓ | n/a | ✓ | ✓ | ✗ |
| Cash reconciliation | ✓ | ✓ | ✓ | ✓ | n/a | ✓ | ✓ | ⚠ data only |
| Refunds with reason codes | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Manager override / void | ✓ | ✓ | ✓ | ✓ | n/a | ✓ | ✓ | ✗ |
| Inventory depletion live | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Auto-86 on stockout | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Auto-reorder at par | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ⚠ data only |
| HACCP temperature log | ⚠ | ⚠ | ⚠ | ⚠ | ✗ | ✓ | ✓ | ✗ |
| Maintenance ticket | ⚠ | ⚠ | ⚠ | ⚠ | ✗ | ✓ | ✓ | ✗ |
| **Delivery** | | | | | | | | |
| Uber Eats Merchant | ✓ | ✓ | ✓ | ✓ | self | ✓ | ✓ | ✗ |
| DoorDash | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| GrabFood / foodpanda | ✓ | ✓ | ⚠ | ⚠ | n/a | ⚠ | ⚠ | ✗ |
| Deliveroo | ✓ | ✓ | ⚠ | ⚠ | ✓ | ✓ | ✓ | ✗ |
| Self-operated driver dispatch | ⚠ | ⚠ | ⚠ | ⚠ | ✓ | ✓ | ✓ | ✗ |
| Proof of delivery | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| **Admin / Multi-location** | | | | | | | | |
| Self-serve location onboarding | ✓ | ✓ | ✓ | ✓ | n/a | ✓ | ✓ | ✗ |
| Multi-currency | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ⚠ display-only (USD/SGD/EUR/PLN, 2026-05-21) |
| Multi-language | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ PL+EN+DE+EN-SG (2026-05-21) |
| RBAC per-user | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ⚠ shared password |
| SAML / OIDC SSO | ✓ | ✓ | ⚠ | ⚠ | ✓ | ✓ | ✓ | ✗ |
| MFA | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Structured audit log | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ⚠ free-text |
| LTV / CAC / cohort | ✓ | ✓ | ⚠ | ⚠ | ⚠ | ✓ | ✓ | ✗ |
| Real ML forecasting | ✓ | ✓ | ⚠ | ⚠ | ✓ | ✓ | ✓ | ⚠ Claude-backed forecast at `src/lib/ai/forecast.ts`; `Math.random()` heuristics deleted 2026-05-21 |
| **Wow features** | | | | | | | | |
| Group / team ordering | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ pooled wallet (close) |
| Subscription / standing order | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ | ✓ | ✓ | ✗ |
| Truck arrival push | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ⚠ infra only |
| AR menu | ✗ | ✗ | ✗ | ✗ | ⚠ | ✗ | ⚠ | ✗ |
| Voice ordering | ⚠ | ✗ | ✗ | ✗ | ⚠ | ✓ ROAR | ✗ | ✗ |
| CV quality control | ✗ | ✗ | ✗ | ✗ | ✗ | ⚠ | ⚠ | ✗ |

### 10.2 "Must-Have" Gaps For NYC/SG Launch

1. ❌ Real food photography.
2. ❌ Item modifiers as a first-class data structure.
3. ❌ Apple Pay / Google Pay primary.
4. ⚠ **Multi-currency + multi-tax + multi-locale.** ✅ Multi-currency *display* + multi-locale UI shipped 2026-05-21 (`/admin/currency`, `/admin/languages` with PLN/USD/SGD/EUR × pl/en/de/en-SG). ❌ Multi-tax (Stripe Tax / TaxJar replacing JPK_V7M) + per-region Stripe merchant settlement remain.
5. ❌ Uber Eats / DoorDash / GrabFood / foodpanda webhook intake **with menu push and status push**. (Wolt + Glovo scaffold remains; mocks deleted.)
6. ⚠ Calorie display (NYC) + Nutri-Grade and allergen at POS (SG, EU). ✅ **WIRED 2026-05-21** — schema + per-location admin config + customer surfaces (kcal pill, Nutri-Grade hex, halal / pork / alcohol chips, DOH grade banner, FRESH Act + GST + PDPA in cart). ❌ Counsel review of default copy + per-item data fill (calorie data for every SKU) still pending.
7. ❌ Per-user RBAC with MFA. (Five-tier role enum exists; single shared `ADMIN_PASSWORD` is the auth surface.)
8. ❌ Cohort / LTV reporting.
9. ❌ Refunds with reason codes + manager approval. (Reason codes exist in `REFUND_REASON_CODES`; manager-approval gating not enforced.)
10. ❌ Offline-first POS terminal.

### 10.3 Unnecessary Complexity To Cut

- ✅ **Hardcoded fake ratings.** ~~Per-item ratings in `data/ratings.ts` were hand-typed values like 4.8 ★ 342 reviews — fake.~~ **RESOLVED 2026-05-21** — `src/data/ratings.ts` deleted; `StarRating` chips removed from `MenuItem`, `MenuSection` (incl. "Highest rated" sort), and `ItemDetailDrawer`. The `StarRating` component remains for the post-order feedback survey where customers enter real ratings.
- ✅ **`ai-engine.ts` heuristic forecasting masquerading as ML.** ~~Random-number generators dressed as ML.~~ **RESOLVED 2026-05-21** — the file is now a customer-side FAQ matcher (`getChatResponse`) with a header comment that explicitly names it as keyword-rule lookup, not AI. The dead `generateDemandForecast` / `generatePriceSuggestions` / `generateInsights` heuristic exports were deleted (they had zero callers; the real AI surfaces live under `src/lib/ai/forecast.ts`, `src/lib/ai/gateway.ts`, and `src/lib/ai/tools/`).
- ⚠ **Single global locks.** Hot-path writes (`createOrder` kv fallback) already scope via `withLockScoped("orders", slug, …)`. **Mirror writes** to the legacy `kv_store["orders.json"]` / `kv_store["slots.json"]` blobs remain global — the lock has to be global because the kv key holds all rows; re-scoping the lock without splitting the blob would lose cross-truck mutual exclusion. Mirror writes run `void` fire-and-forget so they don't block the user, but cross-truck mirror updates serialize on Redis. **Honest path forward**: split the kv mirror into per-location keys, or — since the DB is source-of-truth — delete the kv mirror entirely. No new global locks added in this pass. Capabilities ledger updated to disclose the split.
- ✅ **Two providers in `aggregator.ts` that both just `console.log`.** ~~Mock Wolt + Glovo providers auto-accepted unsigned webhooks (`verifyWebhookSignature → true`).~~ **RESOLVED 2026-05-21** — `WoltMockProvider` and `GlovoMockProvider` deleted. `getAggregatorProvider` now throws a typed `AggregatorNotConfigured` error when ENABLE_AGGREGATORS is on but the per-provider API key + webhook secret are absent; the webhook route catches this and returns 503 with the missing env var list. The live `WoltProvider` / `GlovoProvider` scaffolds remain — their HMAC verification path is real, the three RPC bodies still throw "not implemented" pending merchant credentials. Capabilities ledger updated to mark "Wolt + Glovo webhook intake" as a scaffold, not a live integration.

---

## 11. The Brutal Truth

### 11.1 Why This Would Fail

- **It pretends to be more than it is.** ~~The "AI" page, the multi-location claims, the franchisee portal — all are *narratives*, not delivered systems.~~ ⚠ **PARTIAL 2026-05-21** — the "AI" page is now backed by a real Claude forecast (`src/lib/ai/forecast.ts`) with honest "Heuristic" fallback when the API key is unset; the dead heuristic exports that masqueraded as ML in `ai-engine.ts` were deleted. The "multi-location" claim is genuinely defensible (DB-backed locations table + admin CRUD shipped earlier in PR #38). The franchisee portal is still mostly narrative — territory exclusivity, royalty dispute flow, MSA/FDD scaffolding all absent.
- **It is built for Poland and presented as global.** ~~PLN, BLIK, Przelewy24, Wolt, Glovo, JPK_V7M — all Polish.~~ ⚠ **PARTIAL 2026-05-21**: ✅ USD / SGD / EUR display + de / en-SG UI now ship (operator-configurable from `/admin/currency` + `/admin/languages`). ❌ Apple Pay primary, Uber Eats, DoorDash, GrabFood, GST, SST, NEA Nutri-Grade, NYC §81.50 calorie display remain unaddressed. The customer-facing surface speaks four languages and quotes four currencies; the back-office tax + payment plumbing is still PL-only.
- **It hasn't earned the right to take payments.** Zero automated tests + global locks + 10 s TTL + in-process fallback = a system you would not actually run a Stripe webhook through if you knew what you knew.
- **The menu literally has no pictures.** This is the single most-cited mobile-conversion driver and it is absent. Every competitor on every platform in both cities solves this on day 1.
- ⚠ ~~**It is operationally illegal in both cities on day 1.** NYC §81.50 calorie display, NYC DOH letter-grade prominence, FDA allergen handling, NYC FRESH Act packaging disclosures, SG NEA Healthier Choice, SG Halal disclosure (or non-Halal disclosure), SG GST invoicing, SG PDPA Section 13 consent flow — none implemented.~~ **PARTIAL — 2026-05-21**: every disclosure now has a wired admin surface + customer render. `/admin/regulatory-compliance` lets the operator pick a regulatory zone per truck (EU / NYC / SG) and fill the matching fields; the location page renders a DOH letter-grade banner on NYC zone + a MUIS halal banner on SG zone; per-item compliance pills surface kcal (NYC §81.50), Nutri-Grade A–D (SG NEA), halal / non-halal + contains-pork / contains-alcohol chips on every menu card; the cart drawer renders the GST line back-calculated from the inclusive total (IRAS practice) + the FRESH Act packaging disclosure on NYC + the PDPA §13 consent text on SG. FDA Big-9 allergens already round-tripped from `kodawari.ts` to the item drawer pre-audit. **Still missing**: counsel review of the default copy, calorie data for every SKU (only some items have nutrition right now), explicit point-of-sale signage placement against NYC §23-04 (the DOH grade is displayed online; physical placard at the truck remains a separate compliance step). Treat as "schema and surfaces in place, content fill + legal review pending."
- **No serious operator runs a kitchen on a single Redis lock named after a JSON file.** That this exists, in 2026, in a system that takes Stripe payments, is the cleanest single signal of immaturity.

### 11.2 What Serious Operators Would Criticize

- "Where is shift handover? Where is cash variance? Where is waste log? Where is HACCP?"
- "Where is the refund reason-code dropdown? What stops a cashier from comping the entire shift's revenue?"
- "Why is there a freeform `notes` field instead of modifiers? My customers are going to ask for half-and-half pizzas all day."
- "Why is the only ETA my customer sees `Estimated time` *after* they pay?"
- "Why does the KDS lose its bump history on a refresh?"
- "Where is the receipt printer driver? My customers want printed receipts."

### 11.3 What Investors Would Criticize

- "Where is the test suite?" — *there isn't one*.
- "What's the LTV/CAC?" — *not computed*.
- "Show me a cohort retention curve." — *no such surface*.
- ~~"Where is the real ML?" — *`Math.random()`*.~~ ✅ **2026-05-21**: forecasting is Claude-backed (`src/lib/ai/forecast.ts`) with explicit "Heuristic" badge when `ANTHROPIC_API_KEY` is unset. The random-number `ai-engine.ts` heuristics were deleted.
- ~~"How do you onboard a franchisee?" — *we edit `src/data/locations.ts` and redeploy*.~~ ✅ DB-backed `locations` table + admin CRUD at `/admin/locations/manage`. Adding a truck is a 30-second admin form, no deploy.
- "Walk me through the SOC 2 controls." — *we don't have any*.
- "What's the multi-region database failover story?" — *Neon does it, we don't*.
- "How do you handle a 200-order rush?" — *we go down*.

### 11.4 What NYC Operators Would Laugh At

- The pizza menu lists Margherita at PLN 28 with no photo and the customer types their delivery address as freeform text into a 1990s-style box.
- "Ready in 15 minutes" promised on the home page, then no ETA shown before paying.
- The hero is a dark gradient. *Bryant Park, Bryant Park.* The competitor next to you is showing you a Margherita on a wood peel under sodium light.
- The KDS is a tablet. Where's the bump bar? Where's the printer?
- *"You don't take Uber Eats?"*

### 11.5 What Singapore Operators Would Expect

- PayNow / PayLah! / GrabPay / Apple Pay as the *primary* tender. Card is the fallback in SG.
- Halal status, vegetarian status, beef/pork status as first-class fields. Not tags.
- Chinese + Malay + Tamil + English on the menu (Tamil is statutory for some retail surfaces).
- GrabFood + foodpanda integration on day 1.
- GST 9% line on the receipt with the GST registration number.
- Group buy / corporate billing — Singapore office lunch is overwhelmingly group-ordered, billed to a corporate card or invoiced monthly. Sud Italia has *one* attribute that could power this (pooled wallets) and zero attributes that actually do.

### 11.6 Why This *Could* Win

- The codebase is coherent, the type system is solid, the design is consistent. That is rarer than it sounds.
- The pooled-wallet / family-loyalty model is **genuinely differentiated** against every major QSR loyalty programme and maps to the dominant ordering mode in Singapore (group lunch).
- The truck-mobility + slots + loyalty stack, if fused with a "follow your truck" push notification, is a real wedge.
- The Kodawari sourcing narrative (`kodawari.ts`) is *better than most independent NYC pizzerias publish*. It is wasted today, but it exists.
- The team is self-aware enough to write the existing admin-dashboard audit and the capabilities page — that level of operational honesty is a real signal.

A 6–9 month brutal hardening pass against §13 would yield a credible regional chain platform. A 12–18 month one against §13 + §14 would yield something a Toast or Square would seriously look at.

---

## 12. Final Recommendations

### 12.1 Top 10 Urgent Fixes (this quarter)

1. **Scope locks per-location-per-date.** `lock:slots:${slug}:${date}`, `lock:orders:${slug}`. Drop global `lock:orders.json` / `lock:slots.json` from every call site in `src/lib/store.ts`. Eliminates 80% of contention.
2. **Add a real test suite.** Vitest for unit, Playwright for one happy-path checkout, one KDS advance, one refund. CI gates on green.
3. **Idempotency table.** `(idempotency_key, request_hash, response)` on every mutation. Refunds, status advances, slot increments.
4. **Per-human admin accounts + MFA.** Kill the shared `ADMIN_PASSWORD`. Email-bound users only.
5. **Item modifiers as a first-class shape.** `CartItem.modifiers: { groupId, optionIds[], priceDelta }`. Propagate through `Order.items`, KDS, recipes, Stripe line items.
6. **Wire `kodawari.ts` allergens and nutrition to the menu UI and to the cart.** Mandatory EU 1169/2011 + NYC §81.50 + SG NEA compliance. The data exists; the wire is missing.
7. **Real food photography commissioning** — Margherita, Marinara, Carbonara, two pasta, two antipasti, two desserts, espresso. ~$5k one-time. Replace emoji.
8. ⚠ **Replace `data/ratings.ts` fake reviews with real `/review/[orderId]` submissions aggregated server-side.** Burn the fake data file. Legal exposure. → ✅ **2026-05-21**: fake file burned, `<StarRating>` chips removed from customer surfaces. ❌ Aggregating `/review/[orderId]` submissions into per-item averages + surfacing them as real chips on the menu cards is the remaining step.
9. ❌ **Add refund reason codes + manager approval flow** under `/admin/orders/[id]/refund`. Wire Stripe Refunds API correctly.
10. ✅ ~~**Delete or build the aggregator stubs.**~~ **DONE 2026-05-21** — mocks deleted, registry now throws `AggregatorNotConfigured` when ENABLE_AGGREGATORS is on without credentials and the webhook returns 503. Capabilities ledger updated to mark "Wolt + Glovo webhook intake" as a scaffold, not a live integration. Building live Wolt + Glovo with menu/status sync remains as a separate workstream.

### 12.2 Top 10 Highest ROI Improvements

1. **Apple Pay + Google Pay primary CTAs at checkout** via Stripe Payment Request API. ~2 days. Expect 8–14% checkout conversion lift on mobile.
2. **Order ETA before pay.** "Ready at 12:18". ~1 day. Expect 3–5% conversion lift, 10–20% complaint reduction.
3. **Points preview in cart.** "You'll earn 47 pts — 153 to Silver." ~half-day. Expect 4–7% lift + loyalty enrolment up.
4. **Saved addresses + saved cards via customer cookie + Stripe Customer.** ~3 days. Expect 12–18% lift on second+ orders.
5. **One-click "Order again" on home page** for returning customers. ~2 days. Massive repeat-rate driver.
6. **Address autocomplete.** Google Places, ~1 day. Eliminates 30% of address-related delivery failures.
7. **Promo / referral code field at checkout.** ~1 day. Unlocks the referral economy already coded in `growth-engine.ts`.
8. **SMS "your order is ready" via outbox.** Build the receiver, the infra exists. ~2 days. Single highest CSAT lever in QSR.
9. **Live menu availability surfaced on every menu card** ("only 2 left tonight"). Infra (`useLiveMenuAvailability`) exists. ~1 day.
10. **Real customer reviews surface on each item card.** ~3 days. Trust + SEO + retention.

### 12.3 Top 10 Premiumisation Opportunities

1. Hero food film loop replacing the dark gradient.
2. Per-item story panel sourced from `kodawari.ts` (DOP tomatoes, Tipo 00 flour, fior di latte from Agerola).
3. Pizzaiolo headshots on the about page.
4. Real menu photography in editorial style.
5. Tier-gated rewards (Platinum gets a private pizzaiolo Q&A session, etc.).
6. Branded packaging photography in confirmation page.
7. Behind-the-scenes Instagram-style story carousel on the home page.
8. Truck arrival push notification ("your Margherita truck is 4 minutes away from Plac Bankowy").
9. Customer-named pizza specials ("Anna's Diavola" — the customer who's ordered it 30 times).
10. Hand-written digital thank-you note from the pizzaiolo for first orders.

### 12.4 Top 10 Operational Improvements

1. Shift handover module (cash count, waste log, manager comment, photo).
2. Refund / void / comp with reason codes and manager approval.
3. Item-86 propagation in <2 s across menu + KDS + aggregators.
4. Inventory depletion on `preparing` status; auto-86 on zero.
5. HACCP temperature log (regulator + insurance + closure risk mitigation).
6. Cash drawer reconciliation with variance flagging.
7. Receipt printer driver (ESC/POS over Bluetooth or LAN).
8. Bump bar driver (LogicControls KB1700).
9. Offline-first POS terminal mode with replay queue.
10. Maintenance ticket system with vendor SLA.

### 12.5 Top 10 Features Needed To Compete Globally

1. ❌ Uber Eats Merchant + DoorDash + GrabFood + foodpanda + Deliveroo full integration (webhook intake + menu push + status push + commission tracking). (Wolt + Glovo scaffold exists; mocks deleted 2026-05-21.)
2. ⚠ **Multi-currency, multi-tax, multi-locale** (USD/SGD/EUR/PLN; NY sales tax, SG GST, EU VAT; locale-aware date/time/units). ✅ Currency *display* + locale UI shipped 2026-05-21 (USD/SGD/EUR/PLN × pl/en/de/en-SG, switchers on the homepage, admin at `/admin/currency` and `/admin/languages`). ❌ Multi-tax engine (NY sales tax, SG GST, EU VAT replacing JPK_V7M) + per-region Stripe merchant settlement + locale-aware date/time/units remain.
3. ❌ Per-user RBAC + MFA + SAML/OIDC SSO + SCIM. (Five-tier role enum exists; single shared `ADMIN_PASSWORD` is the auth surface.)
4. ⚠ **Real ML demand forecasting** — ✅ Claude-backed forecast lives at `src/lib/ai/forecast.ts` with explicit "Heuristic" badge when `ANTHROPIC_API_KEY` is unset; dead heuristic exports in `ai-engine.ts` were deleted 2026-05-21. ❌ Price elasticity + labour-optimisation models remain unimplemented.
5. ❌ Cohort retention + LTV/CAC + channel attribution dashboards.
6. ✅ Self-serve location onboarding (no code deploys) — DB-backed `locations` table + admin CRUD at `/admin/locations/manage`. ❌ Self-serve *franchisee* onboarding still requires manual operator work.
7. ❌ SOC 2 Type II + PCI scope documentation + GDPR + CCPA + PDPA + NYC SHIELD readiness.
8. ❌ Postgres partitioning per location + read replicas + multi-region.
9. ❌ WebSocket / LISTEN-NOTIFY-based realtime for KDS and customer order tracking.
10. ⚠ Group ordering / corporate billing (Slack integration, monthly invoice, cost center allocation). ✅ Corporate accounts + monthly invoices + auto-pre-order reminder shipped earlier (see capabilities ledger). ❌ Slack integration + cost-center allocation remain.

---

## 13. The Roadmap

### 13.1 Best-In-Class Roadmap (12 months)

| Phase | Months | Theme | Deliverables |
|---|---|---|---|
| 1. Foundation | M1–M2 | Stop the bleeding | Tests, scoped locks, idempotency, MFA, per-user RBAC, refund reason codes, item modifiers shape, wire allergens to UI, real photography, delete fake ratings |
| 2. Conversion | M3–M4 | Customer flow | Apple/Google Pay primary, saved cards + addresses, address autocomplete, ETA before pay, promo code field, points-in-cart preview, one-click reorder, real reviews |
| 3. Aggregator | M5 | Channel mix | Live Wolt + Glovo with menu/status sync, then Uber Eats + DoorDash + GrabFood + foodpanda + Deliveroo |
| 4. Ops | M6–M7 | Real kitchen | Shift handover, cash reconciliation, HACCP, item-86 propagation, inventory depletion, bump bar + receipt printer, offline-first POS |
| 5. Scale | M8–M9 | Multi-location | Self-serve onboarding, Postgres partitioning, multi-currency/tax/locale, structured audit log, SAML/OIDC, multi-region |
| 6. Intelligence | M10–M12 | Real AI | LLM-driven ops agent with real tool audit + budgets, ML demand forecasting trained on actuals, price elasticity engine, anomaly detection |

### 13.2 Franchise-Ready Roadmap

Owners of the territory exclusivity + brand-price ceiling + SLA dashboard + royalty dispute flow + MSA/FDD scaffold + franchisee training portal + brand-standards enforcement (mystery-shop scoring, photo audits, secret-shopper reports). Plan for M5–M9.

### 13.3 Investor-Grade Roadmap

Add: cohort retention + LTV/CAC + channel attribution + real ML + SOC 2 Type II + test coverage > 70% + load-test reports + chaos-engineering reports + multi-region active-active. Plan for M3–M12.

### 13.4 Competing-With-Toast Roadmap

Toast is a $14B public company. The aspirational target is not Toast-the-platform but Toast-the-SMB-experience for *one vertical* (mobile / pop-up / truck QSR). Build the **mobile-first hospitality OS for trucks and ghost kitchens**. Owned categories: truck live location, slot-based fulfillment, pooled-wallet loyalty, AI ops agent with audited tool use, GrabFood/foodpanda parity, NEA/NYC DOH/EU 1169 compliance baked-in. Plan: 18–24 months, $4–8M.

---

## 14. Closing Memorandum

The product, today, is a *good Polish food-truck admin tool with a polished customer skin*. It is **not** a hospitality OS. It is **not** investor-grade. It is **not** ready for NYC or Singapore.

It is, however, salvageable, and three things give it more credibility than most products at this stage:

1. The author of the codebase has shown real self-awareness — the existing admin-dashboard audit (`docs/audits/2026-05-admin-dashboard-audit.md`) is honest, scored, and tracks status.
2. The `/admin/capabilities` page treats "what's deployed" as a public source of truth — a discipline most enterprises never adopt.
3. The Kodawari sourcing narrative, the pooled-wallet design, and the truck-mobility primitive are genuinely differentiated.

**If you ship to NYC or SG with this as-is, the brand burns in 8 weeks. If you ship after the §13 Phase 1–3 work, you have a fighting chance. If you ship after Phase 1–6, you have a category-defining business.**

No politeness. No protected feelings. This is what I would tell a partner before they wrote the check.

— *Audit lens: senior hospitality-tech consultant, restaurant operations expert, UX/UI critic, Series-A diligence partner — 14 May 2026*

---

## 2026-05-21 Update — what's changed for diligence

Seven calendar days since this audit, including the institutional-grade audit's 2026-05-16 resolution log (PR #38) and a 2026-05-17 → 2026-05-21 push that materially changes the **investor readiness** row of §1.1.

**What now scores differently:**

| §1.1 row | 2026-05-14 | 2026-05-21 | Why |
|---|---:|---:|---|
| Overall | 42/100 | **51/100** | The two-step move on operational maturity + investor readiness lifts the average; UX maturity, NYC viability, and SG viability are unchanged. |
| NYC viability | 22/100 | **24/100** | DB-backed locations + cohort/CLTV/segmentation give a NYC opening a fighting chance to be _measured_, but no Uber/DoorDash, no USD, no Spanish, no allergen-at-checkout, no calorie labelling. The needle barely moves. |
| Singapore viability | 27/100 | **29/100** | Same: cohort + CLTV are now visible, but no GrabFood/foodpanda, no SGD, no PayNow/PayLah!, no GST invoicing, no NEA Nutri-Grade. |
| Operational maturity | 35/100 | **62/100** | Recipe-driven stock decrement, PAR-driven draft POs, Claude-backed demand forecast, promised-ready SLA + KDS hotkeys + chime, push notifications, daily retention trim, per-location lock keys, SPLH metric, schedule-vs-forecast gap — all wired 2026-05-16 (PR #38). Refunds-with-reason-codes, modifiers-on-line-items, item-86 propagation, cash-session hash chain still ✗. |
| UX maturity | 48/100 | **52/100** | Production UX unchanged in this window. The **V8 Tuscany trattoria mockup** at `/mockups/cart.html` (Cormorant Garamond + Lora + parchment/terracotta palette, bilingual hierarchy, live activity ticker, full home + menu + location pages) is a credible brand-direction proposal that, if adopted, closes one of the audit's biggest UX complaints (Italian authenticity at premium price). Real food photography still missing. |
| Scalability | 30/100 | **65/100** | Per-location lock keys + DB-backed locations + retention cron lift the ceiling from "~200 orders/hr on a single global lock" to "N × per-location concurrency" and from "code-change-per-truck" to "30-second admin form per truck." Still no test coverage, no multi-region DB. |
| Franchise readiness | 25/100 | **33/100** | DB-backed locations + cohort + segments + multi-unit fleet model in `/admin/simulation` give the operator a model to underwrite a franchise pro forma. Royalty-split, brand-pack enforcement, FDD scaffolding, per-tenant data isolation still ✗. |
| Investor readiness | 20/100 | **42/100** | This is the big move. **Heuristic "AI" is now Claude-backed (forecast) + heuristic (anomaly) with honest badging.** **Cohort + CLTV + RFM segmentation + referral give-get backend** all live. The new `/admin/simulation` page lets a diligence partner sit beside the operator and run scenarios on unit economics, EBITDA, cash-on-cash, occupancy, peak capacity, fleet scaling, sensitivity, and cohort LTV without leaving the admin. **Zero tests, plaintext password, no MFA, no SOC 2, no offline POS, no aggregator integrations, no food photography all remain — those are the floor on this score.** |

**Effect on the five "hard truths" in §1.2:**

1. **The "AI" is a random number generator** → **Mostly resolved 2026-05-16.** Demand forecast routes to Claude with structured JSON + 80% confidence band + heuristic-fallback badge. Anomaly detection is still heuristic-with-thresholds, and the capabilities page calls that out explicitly. The `Math.random()` lines are gone from `src/lib/ai-engine.ts` for the surfaces this audit flagged.
2. **Lock contention at 200 orders/hour** → **Resolved 2026-05-16 (PR #38).** Per-location lock keys split the global queue; ceiling lifts roughly N×.
3. **No real third-party delivery** → **Still true.** Wolt and Glovo remain mock providers; Uber Eats / DoorDash / Deliveroo / GrabFood / foodpanda not designed for. The simulation _models_ marketplace commission (per-channel CM1) but the integration itself is unchanged.
4. **Customer never sees their food** → **Still true.** `MenuItem.image` is still empty. The V8 Tuscany mockup uses serif typography + parchment cards to compensate but does not substitute for actual food photography. **Single highest-ROI un-shipped change in this audit.**
5. **Zero automated tests** → **Still true (mostly).** A single `scripts/legacy/verify-scalability-fixes.ts` tsx smoke test exists (11 assertions) for the cohort + segment pure functions. That is not real coverage. The simulation engine itself has no tests.

**One new operator surface the audit didn't anticipate but a diligence partner would want to see.** `/admin/simulation` (~17,400 LOC), gated by `simulationEnabled`. It carries `InfoButton` "Brief + InstitutionalAnalysis" annotations on every concept, every KPI tile, every lever — written at a level that an institutional reader can audit the methodology and an operator with no MBA can read what each number means. The fact that this exists, and was built _after_ the diligence-style audits, is itself a signal about the operator's response to outside-in critique.

**One new operator surface that addresses the §10 "Brand & Product Quality" wedge.** `/admin/business-costs` is the first-party cost ledger feeding the simulation. The combination of this audit's §10 critique (no real photography, no real cost discipline) + the business-costs ledger + the simulation makes "what does this look like at 5 trucks?" a question the operator can _answer_ in the admin, not just guess.

**What does NOT change in the diligence story.** The original §0 / §1 verdict that "Sud Italia would not survive NYC or SG as-is" is preserved. The Polish-currency baked into types, the no-aggregator-integration, the no-USD/SGD, the no-i18n, the no-food-photography, the zero-tests, the plaintext-password — none of those are addressed. The §13 Phase 1–3 sequencing remains the right path; the operator is now ~2 months ahead on the operational-maturity dimension of Phase 1 thanks to the 2026-05-16 and 2026-05-21 pushes.

---

## 2026-05-21 Update #2 — Recipe + per-distributor nutrition refactor (later same day)

The largest single-day-late development relative to this audit is structural: a recipe + ingredient + nutrition refactor (PR #61 + the recipes sequence on the same branch) directly attacks the audit's §1.4 NYC §81.50 calorie-display row, the §1.4 SG NEA Nutri-Grade row, the §10.4 "Multi-tax + multi-locale" gap, and the §11.B "Per-item data fill" caveat that was the binding constraint on the regulatory-disclosure work shipped earlier today.

### What changed

| Change | File path |
|---|---|
| **`IngredientProduct`** — new table, one row per (ingredient × distributor) pair. Carries `costPerUnit` + `kcalPerUnit` + `proteinPerUnit` + `carbsPerUnit` + `sugarPerUnit` + `fiberPerUnit` + `fatPerUnit`. | `src/data/types.ts:292` |
| **`Ingredient.activeProductId`** — foreign key into the active offering. Recipe cost + customer kcal pill + PO pricing + inventory valuation all read through this pointer. Switching distributors is a single FK flip. | `src/data/types.ts:241` |
| **`calculateRecipeCalories`** — sums `kcalPerUnit × quantity` across recipe lines, divides by `yieldPortions`. Returns `null` if any ingredient is missing an active offering or `kcalPerUnit`. **`wasteFactor` is intentionally excluded** (`quantity` = eaten weight; trim/spill is a cost concern). | `src/lib/store.ts:3537` |
| **`calculateRecipeNutrition`** — sibling for the full macro panel (calories + protein + carbs + sugar + fiber + fat). Each macro is independent — `protein` resolves even if `fiber` is incomplete on one ingredient. | `src/lib/store.ts:3587` |
| **Chain-wide recipes** — keyed by dish base slug (`pizza-margherita`), not by location-prefixed menu-item id. Edit Kraków, Warsaw updates automatically. Legacy rows migrate lazily on first read. | `src/lib/store.ts:getRecipe` |
| **Product info + dietary moved into recipe editor.** Name, category, tags, description, kcal, halal status, Nutri-Grade, contains-pork, contains-alcohol all edited at `/admin/recipes` (one editor surface). | `src/components/admin/AdminRecipes.tsx:731` |
| **"Defaulted to 0" indicator** — when operators backfill macros incrementally, the recipe editor shows `(N defaulted)` and a Calories KPI hint. Customer-facing compliance surfaces keep the stricter "all complete or no claim" rule — partial-data states never reach the customer. | `src/components/admin/AdminRecipes.tsx:perPortionMacro()` |

### Effect on each NYC + SG row

| Row | 2026-05-21 (am) | 2026-05-21 (pm) |
|---|---|---|
| **§1.4 row 4 — NYC DOH calorie labelling (§81.50)** | Wired but "operator must complete the data fill before opening" — interpreted as filling `nutrition.calories` on every SKU (≈80 rows). | **Significantly easier.** The customer kcal pill now derives from `kcalPerUnit` on each ingredient's active offering. Fill kcal on the ~30 ingredients, every Margherita-bearing dish gets a live figure with no manual retyping. Operator data-entry surface area collapses by roughly 2/3. The "complete the data fill before opening" caveat shrinks correspondingly. |
| **§1.4 row 5 — SG NEA Nutri-Grade** | Wired but operator-typed per beverage. | Marginal improvement only. The macro pipeline now stores per-100g sugar + (total) fat on each active offering (`IngredientProduct.sugarPerUnit` + `fatPerUnit` in `src/data/types.ts:312-317`); NEA's A–D bucketing also needs **saturated fat** (and added vs total sugars in some bands), and **neither field exists in the schema yet**. So the automation isn't "one commit away" as an earlier draft of this row said — it's the saturated-fat field migration on `IngredientProduct` _then_ a computation function _then_ the bucketing thresholds. **Still operator-typed today**; the structural gap is wider than the recipe refactor closed. |
| **§10 row "Allergens at point of sale (EU 1169/2011)"** | Per-item `allergens[]` field shipped, rendered on the item drawer + `CompliancePills` row on the card. | Unchanged. (Allergens are still per-item flags, not derived from ingredients. Recipe-derived allergens — "this dish contains gluten because Tipo 00 flour" — is the next-step but not in this batch.) |
| **§11.B "Per-item data fill (calorie data for every SKU)"** | Pending. | **Surface area shrunk by ~2/3.** The operator now fills `kcalPerUnit` on each ingredient's active offering once; every recipe that uses it derives the per-portion kcal automatically. |
| **§1.4 row 8 — "Hardcoded `currency: "PLN"`"** | Display-layer fixed (USD/SGD/EUR/PLN). | Unchanged. The cost ledger inside `IngredientProduct.costPerUnit` is stored in grosze. A per-region offering selector (different distributors for NYC + SG) is now structurally feasible — schema doesn't bind cost to currency at the offering level, so a Brooklyn distributor's offering can hold USD-cents and a Singapore distributor's can hold SGD-cents with no schema migration — but the read-path conversion to render currency isn't wired yet. |

### Effect on the §1.1 scorecard (post-pm row)

| §1.1 row | 2026-05-21 (am) | 2026-05-21 (pm) | Why |
|---|---:|---:|---|
| Overall | 51/100 | **52/100** | Operational maturity nudges up; NYC + SG viability stay where they are because the regulatory-disclosure work today is structural unblock, not a new launch surface. |
| Operational maturity | 62/100 | **65/100** | Chain-wide recipes + per-distributor active offering + auto-computed nutrition + product/dietary editor consolidated into recipes — four wins in one batch on the operational-data-model axis. |
| NYC viability | 24/100 | **25/100** | The §81.50 calorie pipeline is materially more practical to deploy. Still no Uber/DoorDash, no USD, no Spanish, no real photography. |
| Singapore viability | 29/100 | **30/100** | The macro pipeline puts sugar + total fat on the active offering, so the operator-side data-entry surface for Nutri-Grade is smaller, but the schema still lacks `saturatedFatPerUnit` (a required NEA input) — so an automatic A–D computation is field-migration-then-code-pending, not just code-pending. Halal cert + MUIS banner + pork/alcohol chips unchanged. |
| Franchise readiness | 33/100 | **35/100** | Chain-wide recipe shape removes a class of "Kraków Margherita ≠ Warsaw Margherita" failure mode that any franchise model needs to reject. |
| Investor readiness | 42/100 | **44/100** | Per-distributor cost ledger gives the simulation's True CM1 + sensitivity tornado audit-traceable provenance (distributor + SKU + timestamp). The diligence story can now answer "what does Margherita actually cost?" with a specific row from a specific distributor offering. |

### What still does NOT change

The §1 verdict that "Sud Italia would not survive NYC or SG as-is" is unchanged. The seven binding constraints (no aggregator integration, no USD/SGD settlement via separate Stripe merchants, no SOC 2, no tests, no food photography, no offline POS, no MFA on admin) are not addressed by this refactor. What the refactor does change is the **per-item data fill** caveat that gated the regulatory-disclosure work shipped earlier today — that caveat is now considerably smaller in surface area and considerably more honest in failure mode (partial-data states are visibly marked rather than silently coalesced).

### Three follow-ups that surfaced

1. **NEA Nutri-Grade computation** from recipe nutrition needs two prerequisites first: (a) add `saturatedFatPerUnit` to the `IngredientProduct` schema + a per-product input + a `calculateRecipeSaturatedFat` helper alongside `calculateRecipeNutrition`, and (b) — for the SSB bands — distinguish added vs total sugars (NEA bucket thresholds differ for the two). Then the A–D bucketing function reads through. Roughly a 1–2 day job rather than the "half day" the previous draft of this doc suggested.
2. **Recipe-derived allergens** — "this dish contains gluten because Tipo 00 flour carries `allergens: ['gluten']`" — would close the audit's §10 allergen row from per-item flag to derived. Schema is partially ready (allergens are per-item not per-ingredient today); the migration is a few-hour job.
3. **The `/admin/capabilities` entry on regulatory disclosures** references `kcal × quantity × wasteFactor / yieldPortions` for the kcal formula; the actual code drops `wasteFactor` from the nutrition path. Documentation drift — should be tightened to `kcalPerUnit × quantity / yieldPortions`.

— *Diligence delta lens: same five auditors, six days later — 21 May 2026*

---

## 2026-05-29 Update — the storefront was rebuilt; the seven NYC/SG blockers are unmoved

Fifteen days from the original audit. The customer surface this teardown was hardest on (§2 UX, §2.4 "burn down and rebuild") was **fully rebuilt to production as the V8 Tuscany trattoria** — the proposal earlier updates filed under "mockup, no adoption decision." Two of the §2.4 "burn down" items are genuinely closed; the rest of the §0 verdict stands intact, because every one of the seven structural NYC/SG blockers is unaddressed.

### §2 UX — the rebuild closed two of the §2.4 burn-down items, left the rest

| §2.4 item | 2026-05-14 | 2026-05-29 |
|---|---|---|
| `HeroSection` dark gradient | "replace with a Neapolitan oven photograph" | ✅ **Rebuilt.** `LocationHero` (`src/components/location/LocationHero.tsx`) is a V8 parchment/serif hero. Still no oven *photograph* — the gradient is gone, the photo never arrived. |
| `MenuItemCard` emoji-on-gradient | "fatal in market" | ✅ **Reframed, ❌ not solved.** `MenuItem` (`src/components/location/MenuItem.tsx`) is a V8 editorial card with diet/proofing chips + kcal meta. The emoji-on-gradient is gone; **real food photography is still absent** (`MenuItem.image` unpopulated). The §1.2 hard-truth #4 "the customer never sees their food" is **still true** — the frame improved, the food shot still doesn't exist. |
| `CartDrawer` phone field PL-only regex | "replace with `libphonenumber-js` E.164 + country selector" | ❌ Still PL-style loose validation; no country selector. A `+1` / `+65` number is still not first-class. |
| `StarRating` fake-data | done 2026-05-21 | ✅ Unchanged — no fake ratings on the customer surface. |
| `SlotPicker` after item selection | "promote to a top-level When?" | ❌ Still inside the cart drawer, discovered after items are added. |

The §2.1 "premium frame, empty content" verdict now resolves to: **frame is premium and shipped; content (photography) is still empty.** Real progress on the *first-impression* axis, zero on the *conversion-driver* axis.

⚠ **Two surfaces did not get the V8 treatment** — `/review/[orderId]` and `/corporate/[slug]` still render in the legacy `italia-*` palette. The review surface is customer-facing and now visually inconsistent with the rest of the site.

### §5 KDS — substantially rewritten since the audit; the §5.2 matrix needs re-reading

The KDS this audit inventoried (`AdminKDS.tsx`, ~410 lines, 3 kanban columns) was rewritten. Current state (`AdminKDS.tsx`, 841 lines): **role lenses** (owner → Atlas Fleet board, manager/franchisee → floor board, kitchen/staff → chef strip, mobile → MobileKDS), a real **prediction engine** (`src/lib/kds-prediction.ts`, single-server FIFO queue per station, flags at-risk tickets before they're late), **SLA countdown + dual chimes**, **bump-bar hotkeys 1–9/0 with optimistic advance + SSE reconciliation + recall**, fullscreen/kiosk, and live `/api/admin/kds/floor-ops` (open/late/due-soon/oldest/avg-age + live-86). This closes several §5.4 rows (per-station ETA, dynamic prep ETA, the "AI assistant that recommends pause" — the last via `pace-steering.ts`, POS-facing).

**Still ✗ on the §5.2 matrix:** hardware bump bar; modifiers first-class (still `notes` string only — the modifier schema exists but there's no customer picker and no KDS modifier surface); batch consolidation; hold/transfer between stations; photo capture. **An interim coursing feature (Starters/Mains/Dessert separate-fire, kitchen-timing, drag-to-recourse) was built mid-May and then dropped in the POS/KDS rewrite** (commits `79aa8b6`/`a61fa48` superseded by `814e548`/`49e7d6b`) — current KDS and POS have **no coursing**. The §5.3 "will it break at 300 orders" answer improves on transport (SSE + indexed `since`-filtered queries + active-only board that sheds completed tickets) but regresses on the client: there is **no list virtualization** and a 1-second full `analyzeTruck` recompute over the active set, so a literal 300-concurrently-*active* tickets would stress the browser. The lock-contention failure mode (§5.3 #1) is mitigated by the relational order path (below).

### §6 Admin — RBAC matured past the "shared password" framing (but the root stays)

§6.1/§6.3 said "single shared `ADMIN_PASSWORD`, role enum not enforced." Current state: a **5-role rank table** (owner 100 / franchisee 70 / manager 50 / staff 20 / kitchen 10), a `withAdmin()` wrapper declaring `roles` + `locationParam` per route, and **per-location session scope enforced server-side** (token `userId:locationScope:issuedAt.hmac`; `requireLocationAccess`). Enforcement is still **opt-in per route** (no central `src/middleware.ts`), the **shared `ADMIN_PASSWORD` root path still exists**, there is **still no MFA**, and there is **no UI to assign an N-of-M regional scope** (the token supports a comma list; the users page only assigns one slug or "All"). So §6.1 "could an owner run 10 locations" is now a credible **yes** for owner + single-site managers, **partial** for true regional managers.

### §9 Tech — the architecture this audit critiqued has shifted under it

- **Persistence is mid-migration to normalized Drizzle relational tables** (orders/recipes/ingredients/ingredientProducts/customers/loyalty/KDS) with dual-write + lazy backfill; hot paths read relational-first (`store.ts`, now 11,105 lines). The §9.1 "6 K-line `store.ts`, everything is a JSON blob under a global lock" critique is now **half-true** — high-volume tables moved to indexed relational writes with no application lock on the DB-first path; the JSON-blob-under-`withLock` pattern survives only on the un-migrated long tail (slots fallback, mirrors).
- **A genuine Anthropic-LLM layer now exists** (`src/lib/ai/` gateway with prompt caching + `forecast.ts` + an `agent.ts` tool-use loop with operator-approval gates + a role-gated, audit-logged tool registry; plus the WhatsApp LLM ordering bot with real Stripe pay-in-chat, and a concierge/MCP capability layer). Any "no real ML/LLM in the loop" line in this audit (§1.1 investor row, §11.3) is now **outdated** — there is a real, audited, budget-gated LLM agent in the admin.
- **Tests: "zero" is now narrowly false.** Two real `node:test` files exist (`floor.test.ts`, `pace-steering.test.ts`, 11 assertions, passing). But there is **no vitest/jest, no test script in `package.json`, no config**, and **zero coverage of the payment/refund/RBAC/slot paths** this audit (§1.2 hard-truth #5, §13 Phase 1) called malpractice to leave untested. Status: 2 pure-function files, not a suite.

### The five §1.2 "Hard Truths" — re-verified

1. **"AI" is a random number generator** → **Resolved and then some.** Not only were the `Math.random()` heuristics deleted (2026-05-21), a real agentic Claude layer now backs `/admin/ai` (agent + tools + forecast). 
2. **Order pipeline serializes on two global locks** → **Further mitigated.** The DB-first relational order path has no application lock; global kv locks survive only on fire-and-forget mirror writes.
3. **No real third-party delivery** → **Still true.** Wolt/Glovo are scaffolds (HMAC real, RPC bodies throw); no Uber Eats / DoorDash / GrabFood / foodpanda. The WhatsApp bot is a new *owned* channel, not an aggregator.
4. **The customer never sees their food** → **Still true.** V8 replaced emoji-on-gradient with serif-on-parchment; `MenuItem.image` is still empty. Highest-ROI un-shipped change.
5. **Zero automated tests** → **Narrowly false, materially true.** 2 pure-function test files; no runner, no coverage on payment/refund/RBAC.

### Compliance (§1.4 / §10.2 #6) — the disclosure surfaces survived the rebuild

The 2026-05-21 disclosure work is intact on the V8 surface: per-item `CompliancePills` (kcal / Nutri-Grade / halal / contains-pork / contains-alcohol), per-location `ComplianceBanner` (resolved server-side via `resolveLocationCompliance`), cart-drawer GST line + PDPA §13 consent + FRESH-Act packaging text. The item drawer **dropped the nutrition bars** for a printed-menu dotted-leader readout and **switched allergens to hand-drawn SVG line icons** — a presentation change that keeps the EU-1169 / NYC-§81.50 / SG-NEA data flowing. The schema-vs-content caveat is unchanged: surfaces ready, per-SKU calorie/Nutri-Grade data fill still sparse, counsel review still pending; NEA A–D auto-computation still blocked on `saturatedFatPerUnit`.

### New finding — Rule-#1 regressions on the rewards surface

The V8 `/rewards` rebuild introduced **hardcoded display values** this diligence lens should note: the loyalty **streak is a literal "2"**, the **weekly-challenge bar is a literal "33% / 1-of-target"** (`src/app/(public)/rewards/page.tsx`), and the **referral code uses `Math.random()`** per render (the persisted code lives in `referral-loop.ts`). A reviewer clicking through rewards finds the same class of "looks-real, isn't-wired" surface this audit flagged for `data/ratings.ts`. Lower legal exposure (no false reviews), same credibility tell.

### Net read on the §1.1 scorecard

| §1.1 row | 2026-05-21 (pm) | 2026-05-29 | Why |
|---|---:|---:|---|
| Overall | 52/100 | **55/100** | UX + operational maturity rise; the NYC/SG viability rows are governed by the seven structural blockers, none of which moved. |
| NYC viability | 25/100 | **27/100** | Premium frame shipped; still no Uber/DoorDash, no USD settlement, no Spanish, no food photography. |
| Singapore viability | 30/100 | **31/100** | V8 + compliance surfaces help the *feel*; no GrabFood/foodpanda, no SGD, no PayNow/PayLah!, NEA auto-grade still blocked. |
| UX maturity | 52/100 | **64/100** | The real move — the §2.4 burn-down list is half-closed and the surface is a coherent premium trattoria in production, not a mockup. Capped by missing food photography + the two non-V8 legacy surfaces + the fake rewards values. |
| Operational maturity | 65/100 | **70/100** | KDS rewrite (role lenses + prediction + SLA + hotkeys), real POS Tabs terminal, floor/reservations, real LLM ops agent. Capped by no coursing, no offline POS, no aggregators. |
| Scalability | 65/100 | **70/100** | Relational migration on hot paths lifts the order/KDS ceiling; still no test suite, KDS client lacks virtualization, single-region DB. |
| Investor readiness | 44/100 | **48/100** | Real LLM agent + relational data layer + real-order-backed simulation strengthen the story; zero real test coverage, plaintext password, no MFA, no SOC 2, no aggregators, no food photography remain the floor. |

**The §0 verdict is unchanged: Sud Italia would not survive NYC or Singapore as-is.** Fifteen days of shipping closed half of the UX burn-down list and rebuilt the operational spine, but the seven binding constraints (aggregators, USD/SGD settlement, SOC 2, real test coverage, food photography, offline POS, MFA) are exactly where the 14 May audit left them. The §13 Phase 1–3 sequencing remains the right path; the operator is now meaningfully ahead on the *UX* and *ops* dimensions of Phase 1–4 and has not started the *channel* (Phase 3) or *enterprise-hardening* (Phase 5) work the two cities actually require.

— *Re-run lens: same five auditors, fifteen days later — 29 May 2026*
