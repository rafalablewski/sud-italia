# Sud Italia — Institutional-Grade Audit

**Date:** 2026-05-16
**Last updated:** 2026-05-29 (re-run pass — see the dated Update sections below; the body has been brought current to the code as of this date)
**Auditor lens:** McKinsey operational due diligence + PE operational advisor + Toast/Square systems architect + consumer-psychology operator
**Scope:** Full repository (`/home/user/sud-italia`), business model, ops architecture, UX, monetization, scale readiness
**Mode:** Brutally honest. No flattery. Specific citations.

---

## 0. Pre-flight observation

There are already five thick audits in this directory (admin dashboard, NYC/Singapore viability, bundle ladder, revenue/psychology redesign, elite-QSR recommendations). This one is intentionally **the consolidated outside-in view** — what an investor's first-week diligence team would write after reading the code, not another deep-dive on one surface. Where it overlaps with prior audits, it is harsher and more compressed.

---

## 0.1 Resolution log (post-audit)

**2026-05-21 — i18n + FX + "unnecessary complexity" pass.** Three classes of finding from the NYC/Singapore audit §6.1, §10.2, and §10.3 (cross-referenced into this audit's §4 "What is alarming" and §13 international-expansion blocker) were addressed in one branch:

| Surface | Resolution |
|---|---|
| **Multi-currency display** (NYC/SG audit §6.1 row 5, §10.2 row 4) | `src/lib/currency.ts` formats grosze in PLN / USD / SGD / EUR with operator-set rates. Customer header switcher; admin at `/admin/currency` (owner-only). Rates exposed via `/api/settings/public` so the customer site hydrates the formatter on mount. Charges still settle in PLN via the Stripe merchant account — display-only, with an explicit footer note in the switcher. The Path E "International (Berlin)" row in §13 lifts from 5% → 25% readiness. |
| **Multi-language UI** (NYC/SG audit §6.1, §10.2 row 4) | `src/lib/i18n.ts` dictionary now covers Polish, English, German, Singapore English. Header dropdown switcher; admin at `/admin/languages`. Direct prerequisite for DACH expansion + the SG market. |
| **Fake hand-typed per-item ratings** (NYC/SG audit §1.2 hard truth, §2.1 row, §10.3 cut #1) | `src/data/ratings.ts` deleted. `<StarRating>` chips removed from `MenuItem`, `MenuSection` (incl. "Highest rated" sort that read fake data), and `ItemDetailDrawer`. The `StarRating` component itself is kept — it still powers the post-order feedback survey where customers enter real ratings. Removes legal exposure under FTC §5 / UK CMA / SG CCCS / EU UCPD. |
| **`ai-engine.ts` heuristics masquerading as ML** (NYC/SG audit §1.2 hard truth, §10.3 cut #2) | The dead heuristic exports (`generateDemandForecast`, `generatePriceSuggestions`, `generateInsights`) had zero callers and were deleted. The file is now a labelled FAQ keyword-matcher (`getChatResponse`) for the customer chat widget. The real AI surfaces remain at `src/lib/ai/forecast.ts` (Claude-backed) + `src/lib/ai/gateway.ts` + `src/lib/ai/tools/`. |
| **Auto-accepting aggregator mocks** (NYC/SG audit §1.2 hard truth, §10.3 cut #4) | `WoltMockProvider` + `GlovoMockProvider` deleted. Their `verifyWebhookSignature` returned `true` unconditionally — a forged-webhook foot-gun the moment `ENABLE_AGGREGATORS` flipped on without credentials. `getAggregatorProvider` now throws `AggregatorNotConfigured` and the webhook route returns 503 with the missing env-var list. Live `WoltProvider` / `GlovoProvider` scaffolds remain with real HMAC verification; the three RPC bodies still throw until credentials land. |
| **Per-location lock honesty** (NYC/SG audit §10.3 cut #3) | The capabilities-ledger entry "Per-location lock scoping" was misleading — claimed `orders:${slug}` but the mirror writes still used the global `orders.json` lock. Renamed to "Per-location lock scoping (hot path)" with a `caveats` callout explaining that the hot path is concurrency-safe via Postgres + `withLockScoped`, while the kv-mirror writes are global by necessity (the kv key holds all rows). No new global locks were added; the honest fix is to either split the mirror per-location or delete it now that the DB is source-of-truth. |

**2026-05-16 — Theatre-to-function pass.** The five "theatre, not function" surfaces called out in §3 and §15 (Inventory, AI demand forecast, Suppliers/POs, KDS SLA + hotkeys, Push notifications) were wired end-to-end the same day this audit landed. Commit `c863a3a` on `claude/audit-findings-documentation-2gMJh`:

| Surface | Resolution |
|---|---|
| **Inventory — recipe-driven stock decrement** | `src/lib/inventory-decrement.ts` posts one `consume` movement per recipe ingredient on every paid order; refunds + cancellations restore via `adjust`. Wired into `createOrder`, `updateOrderStatus`, refund route. Variance report now reflects real consumption. |
| **Suppliers / POs — PAR-driven drafts** | `src/lib/par-purchase-orders.ts` + `/api/admin/cron/par-purchase-orders` write one draft PO per supplier per UTC day using lead-time-adjusted thresholds from the trailing 14d of `consume` movements. Idempotent on `par-{slug}-{supplierId}-{YYYYMMDD}`. Added to the daily dispatcher. |
| **AI — Claude demand forecast** | `src/lib/ai/forecast.ts` + `/api/admin/ai/forecast` call Claude for structured-JSON 7-day predicted_orders + 80% confidence band + operator reasoning, cached 24h. Falls back to the 7-day MA when `ANTHROPIC_API_KEY` is unset. Dashboard surfaces a `Claude / Heuristic` source badge so the two aren't conflated. |
| **KDS — promised-ready SLA + bump-bar hotkeys** | `AdminKDS.tsx` renders T-MM:SS remaining vs `estimatedReadyAt` next to elapsed; tone drives from remaining (warning <3min, danger when LATE). Distinct audible chime fires once per ticket on first cross of 0. Number keys 1–9 + 0 advance the Nth ticket in the leftmost active column. |
| **Push notifications** | `web-push` installed, real send path live, 404/410 endpoints pruned automatically. Comms dispatcher fans `order.ready` to every saved subscription alongside SMS. New `PushOptInButton` on `/order-confirmation` (high-intent moment), silently hides for unsupported browsers, denied perms, and already-subscribed devices. |
| **`/admin/capabilities` honesty pass** | Added a `caveats` field rendered as amber callout. Demoted "Dynamic pricing suggestions" from `live` to `needs-config` (no engine). Rewrote Inventory, Suppliers/POs, KDS SLA, KDS hotkeys, Push, Demand forecast, Anomaly, Insights, WhatsApp entries to reflect what's actually wired. |

**Remaining audit findings (untouched by this pass):** zero tests, plaintext admin password compare, 10-second polling on parts of the kitchen UI not reachable from KDS v2, no Neon backup/restore runbook, no MFA, no staging env, no cohort/CLTV/CAC, no food photography, no address autocomplete (plain street-address input, no Google Places/Mapbox). Sections 4, 5, 6, 9, and 11 below are unchanged and still actionable.

The original §3 "What is theatre" table, the §15 "Final Brutal Verdict" bullet about the five surfaces, the §10 top-features list, and Appendix A are preserved below with `~~strikethrough~~` and `✅ RESOLVED` markers so the diligence trail remains intact.

**2026-05-16 (later same day) — Scalability + defensibility pass.** The four lowest-scoring dimensions on the §2 scorecard (Scalability ops 3, Scalability tech 5, Defensibility 3, Operational sophistication 4) were the next obvious target. PR [#38](https://github.com/rafalablewski/sud-italia/pull/38) on `claude/fix-scalability-multi-location-eEue1`:

| Finding | Resolution |
|---|---|
| **Hardcoded locations** (§2 ops, §3, §4) | New `locations` Postgres table + admin CRUD at `/admin/locations/manage`. `src/lib/locations-store.ts` reads DB-first with 30s in-process cache; hardcoded `src/data/locations.ts` is demoted to a first-deploy seed. Server-side iterators (`par-purchase-orders`, `inventory-variance`, `weather-staffing` crons) switched to `getActiveLocationsAsync()` so a third truck is picked up next run with no code change. |
| **Global `orders.json` lock — 300 orders/hour ceiling** (§4) | `createOrder` / `updateOrderStatus` / `updateOrder` / `deleteOrder` are now DB-first via the normalized `orders` table; the hot path is the lock-free normalized `INSERT` gated by a per-location `withLockScoped("orders", slug)`. The legacy kv_store mirror (`mirrorOrderToKvStore`, `store.ts:1007`) moved off the hot path into a `void` fire-and-forget write — it still takes the global `withLock("orders.json")` because the kv key holds all rows (a Gemini PR#38 review reverted an attempted per-location mirror key to global to fix a race; comment `store.ts:991-1006`). The throughput ceiling lifts because the primary path is per-location and lock-free, not because the mirror is scoped. `withLockScoped(base, scope, fn)` added to `src/lib/store.ts` as the canonical pattern for future entities. |
| **No retention/trim on webhook/audit tables** (§4) | New `/api/admin/cron/retention-trim` runs daily, prunes `webhook_events` (>30d), `checkout_attempts` (>7d), `audit_log` (>180d). Cutoffs configurable via `RETENTION_*_DAYS` env vars; bytes-deleted is structured-logged. Added to the dispatcher fan-out. |
| **No labor-to-revenue math; no schedule-to-sales** (§2 ops, §10, §14 McDonald's-ops critique) | `src/lib/labor-efficiency.ts` + daily `labor-efficiency` cron compute (a) yesterday's **sales per labour hour** per location with target band 90–140 zł/hr, (b) **today's schedule-vs-forecast gap** in hours, sourcing the forecast from the existing Claude cache and falling back to a same-DOW trailing-week baseline. Both surface on the dashboard — SPLH as a KPI tile, gap as an amber callout when ≥ 2 hours. |
| **No cohort / CLTV / CAC dashboard** (§5 data, §10 #3) | `src/lib/cohort-analytics.ts` builds the cohort matrix (retention % by month-from-cohort) + per-cohort CLTV at 30/60/90/180/365-day horizons, pure function over the orders list. Dashboard at `/admin/reports/cohort` renders the matrix as a heatmap + the CLTV table + headline totals. API at `/api/admin/reports/cohort` (manager+ scoped). |
| **No data moat — no customer segmentation** (§6 #10, §2 defensibility) | New `customer_segments` table + weekly `customer-segments-rebuild` cron. `scoreCustomer()` deterministically buckets every paying customer into `new` / `occasional` / `regular` / `champion` / `vip` / `lapsed` from RFM signals with a 12-month CLTV estimate. Segment mix surfaces on the cohort dashboard. Powers personalized upsell candidate selection in a future pass. |
| **No referral economic loop** (§6 #5, §2 defensibility) | `src/lib/referral-loop.ts` + `referral_codes` / `referral_redemptions` tables. Stable per-phone code, public `/r/CODE` landing drops a 30-day cookie. Webhook order-paid handler calls `qualifyReferralOnFirstPaidOrder`; comms dispatcher handles the new `referral.qualified` event, credits 100 points + SMSes the referrer. Caveat: cart drawer still needs to read the cookie and apply the 10 PLN referee discount + POST to `/api/referrals` at checkout — backend complete, cart UI hookup pending. |
| **Capabilities page honesty pass (round 2)** | Five new entries under Core (DB-backed locations, per-location locks, retention trim) and four under Reports (SPLH, schedule gap, cohort/CLTV, segments, referral loop). All carry `envVars` so the status badge flips `live` ↔ `needs-config` based on real config. |

**Scorecard movement (§2):** Scalability ops 3 → **8**, Scalability tech 5 → **8**, Defensibility 3 → **7**, Operational sophistication 4 → **8**. None of these are 10/10 because (a) operator-side residual work remains for each (referral cart wiring, MFA, brand/physical moats, full test suite), and (b) "10/10" on Defensibility for a 2-truck regional pizza chain is incoherent — that requires a network, a brand, or a regulatory moat that no codebase can manufacture.

**Remaining work after this pass:** zero tests, plaintext admin password compare, no MFA, no Neon backup/restore runbook, no staging env, no address autocomplete (plain street-address input, no Google Places/Mapbox), food photography still emoji, partial-refund stock restoration still TODO, cart-drawer referral-cookie hookup pending. Sections 5, 9, and 11 below are still actionable; see Appendix A.

A new tsx smoke test (`scripts/legacy/verify-scalability-fixes.ts`) exercises the cohort + segment pure functions with synthetic data — 11 assertions, all green. Drizzle migration `0017_little_fat_cobra.sql` adds the new tables; production picks them up via the existing self-bootstrap DDL path on first read.

**2026-05-21 — Finance modelling, cost ledger, and brand-direction mockups pass.** Five business-days of post-audit shipping (PRs #48, #51, #52, #53, #54, #55, #56). The headline additions:

| Surface | What shipped |
|---|---|
| **`/admin/business-costs`** | First-party cost ledger (`src/components/admin/AdminBusinessCosts.tsx`, 903 LOC). Operator can register every fixed and variable cost line — rent, labour bands, ingredient unit costs, packaging, marketing, card fees, Wolt/Glovo commissions, D&A, interest, tax — as the source of truth that the simulation reads from. Persisted via `withLock` on the store. |
| **`/admin/simulation`** | Full finance simulation sandbox (`src/components/admin/AdminSimulation.tsx`, ~17,400 LOC) gated behind `simulationEnabled` in settings. The single biggest answer to the "you have no unit economics" critique in this audit. See decomposition below. |
| **`public/mockups/cart.html`** | Three concept directions for the customer site — V7 Animated (TikTok-gen gradient), V8 **Elegant Tuscany / rustic-modern trattoria** (Cormorant Garamond + Lora, parchment/terracotta/basil/oxblood/ochre palette, bilingual EN/IT hierarchy), V9 Minimal editorial. Full home + menu + location pages cloned into each frame. Live activity ticker on V8. Hosted on `/mockups/cart.html`. CSP loosened on `/mockups/*` to allow Google Fonts. |

**Simulation engine — what is now answerable from the admin without leaving the app:**

| Question the audit raised | Where it's answered now |
|---|---|
| What is the true CM1 per item including packaging + card fee + delivery commission? | Unit Economics breakdown panel + per-item True CM1 + "margin traps" callout (`feat: per-item True CM1`, 2026-05-19). |
| What is EBITDA / EBITDAR / cash-on-cash / occupancy ratio? | EBITDA / EBITDAR / CoC / occupancy KPI tiles (2026-05-19). |
| What is SSSG and new-vs-returning revenue mix? | SSSG + new vs returning panel (2026-05-19). |
| What is CM1 per channel (dine-in / Wolt / Glovo)? | Per-channel CM1 panel + marketplace contribution (2026-05-19). |
| What is peak orders/hour and ticket time per daypart? | Attachment efficiency + peak orders/hr + ticket time KPIs + daypart breakdown (P3-4) + hourly throughput vs capacity chart (P2-3). |
| What does the cohort retention curve and LTV/CAC look like? | Cohort retention + LTV/CAC panel (P2-1, 2026-05-19). |
| What's the menu engineering matrix (star/cash cow/puzzle/dog)? | Menu engineering matrix (P3-1, 2026-05-19). |
| What's the sensitivity of EBITDA to each cost lever? | Sensitivity tornado (P3-2, 2026-05-19). |
| What's the kitchen capacity ceiling, and does prep complexity derate it? | Oven curve panel (Neapolitan throughput physics) + prep flow + queue model with peak-hour conversion loss + prep-complexity multiplier (2026-05-19). |
| What does the shift plan look like at a given daypart? | Shift plan by daypart with `menuRole` tags (2026-05-19). |
| What does the model say about a 3rd, 5th, 10th truck? | Multi-unit fleet model — §8 scalability path (2026-05-19). |
| Are espresso and delivery the marginal revenue levers? | Push-espresso enhancement + delivery / marketing-as-CAC reclassification (2026-05-19, the "coffee strategy" PR #56 naming). |
| What's the COGS heatmap when seasonality + menu mix shift? | Menu-mix-weighted COGS from real orders (P1-1) + per-month seasonality overrides (P1-3b) + diverging green/red profit heatmap (PR #52). |

The simulation also carries:

- **Five preset menu scenarios + a Custom scenario** with editable + saveable cards and a real-time preview popup.
- **Behaviour assumption levers + weather/calendar levers** with on/off switches, defaulting all-off (PR #54 behaviour-economic hardening pass — a one-time migration forces saved-pre-PR scenarios all-off so old saves can't silently inflate numbers).
- **Ingredient cost stress tests** with sticky headline KPI row that compacts when pinned, a mobile-swipeable KPI slider, and operations KPIs expanded to 8 cards (PR #52, PR #53).
- **Source-of-truth badges** on every input (P3-5) so the operator can see which numbers come from real orders vs. assumed defaults.
- **AI-generated enhancements card** below the sensitivity tornado that proposes next moves from the run's outputs.
- **An `InfoButton` on every concept + KPI tile + lever + 44 textbook-only inputs** with a "Brief" (one-line plain-English) and a longer "InstitutionalAnalysis" annotation (PR #55 + the C-through-HH batch + the May-21 dedupe passes). The annotations are textbook-grade enough that an operator with no MBA can read the simulation, and an institutional reader can cross-check the methodology.

**Where this lands against the §3 scorecard:**

| Dimension | Pre-pass (post 2026-05-16) | Post-pass (2026-05-21) | Why |
|---|---|---|---|
| Operational sophistication | 8 | **8.5** | The simulation gives every dimension of operational decision-making a model. Still need to wire the model's recommendations back into the live ops surfaces — today it informs the operator, doesn't act. |
| Investor readiness | (was 20/100 in NYC/SG audit, ~5.5/10 here) | **6.5–7/10** | Unit economics, cohort retention, LTV/CAC, EBITDA/EBITDAR, peak capacity, fleet scaling are all visible in-app. A diligence partner can now sit beside the operator and run scenarios — that is the single biggest change between this audit and today. |
| Operator capability / honesty | (high) | **higher** | The simulation page replaces every "we don't have the numbers" excuse with a working sandbox. The remaining honesty risk is the operator over-trusting the model's outputs without booking the underlying behaviour-lever evidence — hence the all-off default in PR #54. |

**What the new surfaces do _not_ fix from this audit:**

- Zero tests (the simulation engine itself has no tests; this is the largest unaddressed code-quality regression).
- Plaintext admin password compare.
- No MFA on admin.
- No Neon backup/restore runbook, no staging env.
- No address autocomplete (plain street-address input, no Google Places/Mapbox).
- Real food photography still missing (the V8 Tuscany mockup uses serif typography + parchment cards to compensate, but it doesn't substitute for actual food photography).
- Partial-refund stock restoration still TODO.
- Cart-drawer referral-cookie hookup still pending.
- Hash-chained cash sessions still outstanding.

**The Tuscany mockup is a brand-direction artifact, not a production change.** V8 is hosted only at `/mockups/cart.html` (frame switcher) and `/mockups/v8/*` location pages. It is not deployed to the live customer site. The decision to ship it as a production redesign is a separate go/no-go that the brand strategy in §5 of this audit hasn't yet been asked to make.

**Net effect on the §15 final verdict.** The codebase moves from "no longer the binding constraint on the next three trucks" to "now also carries an institutional-grade financial model that a private-equity or franchise-buyer diligence team can run scenarios against on day one." None of the four still-open bullets in §15 (plaintext password / zero tests / legacy-board polling / operator attention vs trucks) is closed by this pass. What does change is the post-2026-05-16 addendum line in §15 that read "the conversation in a diligence room would now be about marketing and unit economics, not theatre" — half of that ("unit economics") is now answerable inside the admin, so the residual diligence conversation narrows further toward demand generation and the same security + tests hygiene from §11.

**2026-05-21 #2 — Recipe + ingredient + per-distributor nutrition refactor (later same day).** A follow-on batch of commits today (PR #61 + the recipes sequence on the same branch) does not add a new admin page, but rewires three foundational schemas that this audit's §3, §6, §8 and §10 all depend on:

| What changed | Why this audit cares |
|---|---|
| **`IngredientProduct`** (`src/data/types.ts:296`) — one row per (ingredient × distributor) pair, each carrying `costPerUnit` + `kcalPerUnit` + `proteinPerUnit` + `carbsPerUnit` + `sugarPerUnit` + `fiberPerUnit` + `fatPerUnit`. `Ingredient.activeProductId` is a FK into the active offering. Recipe cost + customer kcal pill + PO pricing + inventory valuation + variance theoretical all read through the active pointer. | §3 operational sophistication — the previous "one cost per ingredient" model couldn't represent the actual operator decision (which distributor are we buying from this month). The new schema represents it correctly, and switching distributors is now a single FK flip rather than a re-typing exercise across every recipe. §6 — the simulation's "true CM1" + sensitivity tornado now read from this ledger; the institutional reader can trace every margin number to a specific distributor SKU at a specific timestamp. |
| **Chain-wide recipes.** Recipes are now keyed by dish base slug (`pizza-margherita`), not by location-prefixed menu-item id. Editing Kraków's Margherita formula updates Warsaw automatically. Legacy rows migrate lazily on first read (first-wins dedupe by base slug). `src/lib/store.ts:getRecipe`. | §3 row "chain-wide product consistency" — fixes a class of foot-gun where Kraków + Warsaw could silently diverge. Closes one of the failure modes the franchisee-portal critique in §13 implied (a franchisee with their own Margherita formula is a different product, and the audit was correct to flag that you couldn't model it). Also unblocks §1.5 row 10 ("Recipe yield testing workflow") — a single yield-test entity can now drive every truck. |
| **Auto-computed per-portion kcal + macros from recipe.** `calculateRecipeCalories` + `calculateRecipeNutrition` (`src/lib/store.ts:3890` / `:3940`) sum ingredient `kcalPerUnit` × `quantity` ÷ `yieldPortions`. The customer kcal pill (NYC §81.50) flows from this — fill kcal once on each active offering and every Margherita-bearing dish gets a live figure with no manual retyping. **`wasteFactor` is deliberately excluded from nutrition math** (`quantity` = eaten weight; `wasteFactor` covers extra purchased to cover trim, a cost concern, not a calorie concern). | §10 "Biggest opportunities — international expansion" — the NYC kcal-display claim in row §1.4 of this audit ("operator must complete the data fill before opening") shifts from "fill the kcal pill on every SKU" (~80 SKUs) to "fill `kcalPerUnit` on every ingredient's active offering" (~30 ingredients), one read-flip away from chain-wide display. The data-entry surface area collapses by roughly 2/3 with no change to display correctness. |
| **Product info + dietary moved into recipe editor.** Name, category, tags, description, kcal, halal status, Nutri-Grade, contains-pork, contains-alcohol all edited at `/admin/recipes` (the recipe editor dialog), not at `/admin/menu/[slug]`. The menu detail page focuses narrowly on pricing + modifiers + per-location logistics. | §3 single-source-of-truth criterion — the previous split between menu metadata and recipe metadata was a foot-gun where an item could be flagged "halal" in one place and "contains-pork" in another. Eliminated. |
| **"Defaulted to 0" indicator** on partial nutrition (`090128b`) — when operators backfill macros gradually, the recipe editor's `perPortionMacro()` shows `(N defaulted)` next to each macro and a Calories KPI hint counting unset ingredients. Customer-facing surfaces keep the stricter "all complete or no claim" rule. The operator UI is for diagnostics; legal disclosure gates on completeness. | §10 international-expansion (NYC + SG) — closes a "false-disclosure" foot-gun (operator-visible partial-data states are visibly marked rather than silently coalesced to 0). The customer pill flips on only when every contributing ingredient is complete. |

**Effect on the §3 scorecard:** operational sophistication moves from 8.5 to **8.7**. The lift is small but real — the BOM is now defensible across the fleet and audit-traceable to distributor + SKU + timestamp. The remaining ceiling is still the unaddressed-blocker list (tests, MFA, third-party delivery, offline POS); none of which this pass touches.

**Three follow-ups that surfaced.** (1) The `/admin/capabilities` entry on regulatory disclosures references `wasteFactor / yieldPortions` for kcal; that string is stale and should be tightened to match `calculateRecipeCalories` which drops `wasteFactor` from the nutrition path. (2) Nutrition data fill for every active offering is the remaining manual task before the NYC kcal pill renders chain-wide — schema and surfaces are ready; the operator has not run the data-entry pass yet. (3) The per-distributor offering ledger unblocks an RFQ workflow (§1.5 row 4 "Supplier bidding / RFQ") that was previously gated on a schema migration; it is now a UI build.

---

## 1. Executive Summary

**One-line verdict:** A genuinely impressive single-operator codebase wearing the costume of a multi-location chain — about 12 months of solo-builder over-engineering disguising a business that has not yet proven it can fill the trucks it already owns.

The product side is sophisticated for a 2-truck Polish pizza concept: 27 admin pages, segmented delivery thresholds, customer-attach-history-weighted upsell scoring, hour-of-day bundle ladders, Stripe + idempotency + webhook dedup, a phone-first loyalty wallet with group pooling, JPK_V7M Polish tax export, dual-write database migration, distributed locking via Upstash, Sentry, structured logging, RBAC with HMAC-signed location-scoped sessions. This is **Toast-tier surface coverage built by what looks like one or two people**.

But:

- **Zero tests.** None. Not one `.test.ts` file across 176 API routes. ([package.json](../../package.json), no test runner declared.)
- ~~**Stock does not decrement on order.** Inventory is a manual logbook with a pretty chart.~~ **✅ RESOLVED 2026-05-16** — see §0.1 resolution log. `createOrder` now calls `consumeRecipeForOrder` and refunds/cancellations call `restoreRecipeForOrder`.
- **Admin password is plaintext compared.** No bcrypt, no MFA, no rotation. Production refuses to start without `ADMIN_PASSWORD` set ([admin-auth.ts:136–138](../../src/lib/admin-auth.ts)), but `admin123` is still the local-dev fallback and the live `verifyPassword` is a literal `password === getAdminPassword()` equality check ([src/lib/admin-auth.ts:143–145](../../src/lib/admin-auth.ts)).
- ~~**The “AI Operating System”** advertised on `/admin/capabilities` is a **7-day moving average** and a heuristic anomaly detector.~~ **✅ RESOLVED 2026-05-16** — Demand forecast is now Claude-backed with explicit `Heuristic` fallback badge when `ANTHROPIC_API_KEY` is unset. Anomaly detector is still heuristic but the capabilities page calls it out as such (audit §0.1).
- **Real-time on the customer-facing order tracker is 10-second polling — no SSE, no fallback, just `setInterval(fetchOrder, 10000)`** ([src/components/order/OrderTracker.tsx:137](../../src/components/order/OrderTracker.tsx)). The operator-facing KDS v2 is genuinely on SSE via `useAdminOrdersStream` (with a 15s REST fallback when the stream dies); the legacy `KitchenOrderBoard.tsx` operator board is also still on 10-second polling ([src/components/kitchen/KitchenOrderBoard.tsx:190](../../src/components/kitchen/KitchenOrderBoard.tsx)).
- ~~**Two locations live. Wrocław is hardcoded-but-inactive.** The "100-location" framing in the capabilities page is fiction until a third location exists.~~ **✅ HARDCODING RESOLVED 2026-05-16 (PR #38)** — `locations` table + admin CRUD; adding a third truck is a 30-second admin form, no deploy. The "100-location" framing is still fiction until a third truck actually opens, but the code is no longer the blocker.

The honest framing: this is a **product engineering exercise** with a real restaurant attached. The risk is the opposite of most startups — the software is far ahead of the business and the operator is at risk of polishing the dashboard while the trucks under-trade. Every hour spent on the 27th admin page is an hour not spent on demand generation, supplier negotiation, or hiring a second great pizzaiolo.

---

## 2. Business Quality Scorecard

| Dimension | Score /10 | Post 2026-05-16 | **As of 2026-05-29** | One-line justification |
|---|---|---|---|---|
| Overall business quality | **5.5** | **6.5** | **6.7** | Brand + product strong; demand and unit economics unproven at two trucks. V8 storefront + real LLM layer + relational migration moved the codebase further past chain-ready. |
| Scalability (ops) | **3** | **8** | **8** | ~~Hardcoded locations, no auto-stock, no supplier automation, no labor-to-revenue math.~~ DB-backed locations CRUD, recipe-driven stock, PAR-driven draft POs, SPLH + schedule-vs-forecast all wired (§0.1). |
| Scalability (tech) | **5** | **8** | **8** | ~~Architecture passes 1–2 locations; breaks around 300 orders/hour on Upstash lock contention.~~ Per-location lock keys + DB-first order writes lift the ceiling to N × per-location concurrency; relational migration on hot paths reinforces it. Zero real test coverage + plaintext password keep this off 10. |
| Defensibility | **3** | **7** | **7** | ~~No physical, brand, data, or network moat.~~ Real data moat now exists (cohort retention, CLTV by cohort, weekly RFM segmentation) and a network moat is wired (referral give-get loop, backend + dispatcher complete). Physical and brand moats still aren't a codebase problem. |
| Operational sophistication | **4** | **8** | **8.8** | Auto stock + PAR POs + SPLH + schedule gap, plus (2026-05-29) the KDS/POS rewrite (role lenses, prediction, real POS Tabs terminal), floor/reservations, and a real audited LLM ops agent. No coursing, no offline POS. |
| Product quality (food) | **Unknown / assumed 7** | **Unknown / assumed 7** | **Unknown / assumed 7** | Code reflects a serious pizzaiolo (Tipo 00, San Marzano, 48h dough). Not auditable from repo. |
| Systems maturity | **4** | **5** | **5.5** | Relational migration on hot paths + a three-theme design system + 2 real (tiny) test files; zero coverage on payment/refund/RBAC + plaintext auth + legacy-board polling hold it down. |
| UX / UI sophistication | **7.5** | **7.5** | **8** | V8 Tuscany storefront shipped to production — a coherent premium surface, not a mockup. Capped by missing food photography + two non-V8 legacy surfaces + the fake rewards streak/challenge values. |
| Profitability potential | **5** | **5.5** | **5.5** | Pizza margins are great. Referral loop adds an acquisition lever; the rest still bounded by EU labour costs + Polish AOV ceiling. |
| Strategic positioning | **5** | **5** | **5** | "Naples in Poland" works; not enough scarcity, ritual, or community to defend price. |

Average around ~~**4.8/10**~~ → **6.4/10** (post 2026-05-16) → **~6.6/10 as of 2026-05-29**. The codebase is no longer the bottleneck; demand generation and brand/founder execution are.

---

## 3. Operational Audit

### What is real

| Surface | Status | Notes |
|---|---|---|
| Order pipeline (web → Stripe → DB → KDS) | Real | Idempotent, webhook-verified, audit-logged. [src/app/api/webhook/route.ts:43](../../src/app/api/webhook/route.ts) |
| Slot capacity | Real, atomic | Unique key + distributed lock prevents oversell. [src/db/schema.ts](../../src/db/schema.ts) |
| Combo / bundle engine | Real | Hardcoded defaults + admin override; correctly caps savings per category. [src/lib/upsell.ts:586](../../src/lib/upsell.ts) (`getActiveComboDeals`) |
| Upsell scoring | Real | Margin × hour × customer-attach-history composite. Best piece of code in the repo. [src/lib/upsell.ts:97](../../src/lib/upsell.ts) |
| Loyalty + tiers + wallet pooling | Real | 1 PLN = 1 pt; 4 tiers; manual adjustments summed live. [src/lib/loyalty.ts](../../src/lib/loyalty.ts) |
| RBAC + location-scoped sessions | Real | HMAC binds location scope into the cookie. Genuinely elegant. [src/lib/admin-auth.ts:8](../../src/lib/admin-auth.ts) |
| JPK_V7M Polish tax export | Real | Most teams forget this for 18 months. |
| Audit log | Real | Every write tagged actor + entity. No retention/trim — will become a problem (see §11). |

### What is theatre

| Surface | What it looks like | What it actually is (at audit time) | Resolution |
|---|---|---|---|
| Inventory | Stock levels, par, reorder points, variance | Manual ledger; **orders do not consume stock**. Variance compares theoretical-from-recipes to manually-logged actuals. [src/components/admin/AdminInventory.tsx:840](../../src/components/admin/AdminInventory.tsx) | **✅ RESOLVED 2026-05-16** — `consumeRecipeForOrder` posts `consume` movements on every paid order; refunds + cancellations restore. See §0.1. |
| Suppliers / POs | Master list + workflow | Operator types orders by hand. No reorder triggers. | **✅ RESOLVED 2026-05-16** — daily PAR cron writes one draft PO per supplier per UTC day using lead-time-adjusted thresholds. Operator one-clicks Send. See §0.1. |
| AI Operating System | "Demand forecast", "anomaly detection", "dynamic pricing suggestions" | 7-day rolling average and threshold rules. [src/components/admin/AdminAI.tsx:141](../../src/components/admin/AdminAI.tsx) | **✅ PARTIALLY RESOLVED 2026-05-16** — Demand forecast is now Claude-backed (structured JSON + 80% confidence band + reasoning) with honest `Heuristic` fallback badge. Anomaly detection is still ±20% delta — capabilities page now calls it out. Dynamic pricing demoted to `needs-config` until an engine exists. |
| Cohort retention | Reports page | Not computed. AOV + revenue per date range. No CLTV. | Outstanding. Appendix A row 15. |
| Sales per labor hour | Staff page | Labor cost tracked, never divided by sales. | Outstanding. |
| Promised-ready SLA on KDS | Listed in capabilities | UI shows elapsed only; the “red+audible at <0s” claim is aspirational. [src/components/admin/AdminKDS.tsx:70](../../src/components/admin/AdminKDS.tsx) | **✅ RESOLVED 2026-05-16** — `AdminKDS` now renders T-MM:SS remaining vs `estimatedReadyAt`, tone drives from remaining, distinct chime fires once per ticket on first cross of 0. See §0.1. |
| KDS bump-bar hotkeys (1–9, 0) | Listed in capabilities | Button-click only. Will cost ~3 seconds per bump at rush. | **✅ RESOLVED 2026-05-16** — number keys advance the Nth ticket in the leftmost active column; keydown listener attached at the AdminKDS root, ignores input/textarea focus. |
| Push notifications | Listed in capabilities | Templates exist; VAPID keys not configured. | **✅ RESOLVED 2026-05-16** — `web-push` installed, real send path live, outbox dispatcher fans `order.ready` to every saved subscription, `PushOptInButton` on order-confirmation page. Still requires the operator to generate VAPID keys + set env vars to activate end-to-end in production. |
| WhatsApp ordering | Listed in capabilities | Stubbed; depends on 9 env vars that aren’t set. | Outstanding. Capabilities page now carries a caveat noting the multi-env-var dependency. |

This was the most important section of the audit when written: **`/admin/capabilities` was selling a chain to its own founder.** Rule #9 of CLAUDE.md is good in principle but several entries were marked “live” when the underlying work was heuristic, stubbed, or manual. As of 2026-05-16 the capabilities page now uses a `caveats` field rendered as an amber callout under any entry where reality and the summary diverge; the audited rows above have been rewritten to match what's actually wired.

### Operational bottlenecks

1. ~~**Manual stock consumption** — at 100 orders/day, each order touches 4–8 ingredients × 2 trucks = 800–1600 manual moves/day to keep the variance report honest. Nobody will do this. The report decays into noise within 30 days.~~ **✅ RESOLVED 2026-05-16** — automated via `consumeRecipeForOrder`.
2. ~~**No PAR-driven purchase orders** — the operator wakes up, eyeballs the dough buckets, calls the supplier. This is fine at 2 trucks. It is unsurvivable at 5.~~ **✅ RESOLVED 2026-05-16** — daily PAR cron now writes draft POs per supplier.
3. ~~**Promised-ready time is not surfaced on tickets** — KDS shows elapsed but not “target.” In a queue surge this is the difference between “fast” and “late.”~~ **✅ RESOLVED 2026-05-16** — T-MM:SS countdown next to elapsed on every KDS ticket; chime fires on first cross of 0.
4. ~~**Refunds bypass stock reconciliation** ([variance.ts:10](../../src/lib/variance.ts)). A 6-item refunded order leaves 6 ghost-consumed ingredients in the books.~~ **✅ RESOLVED 2026-05-16** — full refunds + cancellations call `restoreRecipeForOrder`. (Partial refunds still don't restore — see §0.1 caveat.)
5. **Cash sessions are soft-delete-only.** No tamper-evident hash chain. EU tax authorities are starting to require that. ([AdminCash](../../src/components/admin/) and [AdminAuditLog](../../src/components/admin/).) Outstanding.
6. ~~**Hardcoded locations** — adding a third truck requires a code change to `src/data/locations.ts` plus a deploy. Unworkable past 5.~~ **✅ RESOLVED 2026-05-16 (PR #38)** — DB-backed `locations` table + admin CRUD at `/admin/locations/manage`. Adding a truck is a 30-second form entry; the hardcoded list is the first-deploy seed only.
7. ~~**No sales-per-labour-hour metric, no schedule-to-sales gap.**~~ **✅ RESOLVED 2026-05-16 (PR #38)** — daily `labor-efficiency` cron writes both metrics per location; dashboard SPLH tile + amber gap callout surface them above the fold.

---

## 4. Technology Audit

### What is good

- **Next.js 16 + RSC + Drizzle + Neon** is a defensible, modern stack.
- **Idempotency is taken seriously**: SHA-256(`idempotencyKey:cartHash:slotId`) with 30-min table cache. [src/lib/idempotency.ts:137](../../src/lib/idempotency.ts).
- **Webhook dedup via `INSERT … ON CONFLICT DO NOTHING`** on `webhook_events(provider, event_id)`. Correct.
- **Phase 1 normalization is in progress** — slots, orders, order_items, customers all have proper tables with indices, not just JSON blobs. [src/db/schema.ts](../../src/db/schema.ts).
- **HMAC-signed location-scoped admin sessions** — better than 95% of restaurant SaaS on the market.
- **Sentry + structured stdout JSON logging** with request context. Good defaults.

### What is alarming

| Issue | File | Severity |
|---|---|---|
| **Zero tests** | repo-wide | Critical — refund, slot, payment, RBAC, upsell scoring all unverified |
| **Plaintext password compare** | [src/lib/admin-auth.ts:143–145](../../src/lib/admin-auth.ts) | Critical — no hashing, no MFA, no rotation. Production throws if `ADMIN_PASSWORD` is unset ([admin-auth.ts:136–138](../../src/lib/admin-auth.ts)); `admin123` is the local-dev fallback only. |
| **Distributed locks degrade to in-process** when Redis is down or unconfigured. The fallback is logged + counted (`logger.warn` + `metrics.inProcessFallbacks`), but the request itself never fails, so a partial Upstash outage only surfaces if someone is watching the counter. | [src/lib/locks.ts:134–146](../../src/lib/locks.ts), [src/lib/locks.ts:158–164](../../src/lib/locks.ts) | High — cross-instance race returns under outage; relies on operator monitoring of `inProcessFallbacks` |
| **No row-level transactions** for order create + slot increment + customer rollup | [src/lib/store.ts:1234](../../src/lib/store.ts) (`createOrder`, gated by `withLockScoped("orders", slug)` at `:1259`) | High — partial states under failure |
| **Dual-write fire-and-forget — mixed direction by entity.** For **slots** the kv_store blob is still source of truth and `dualWriteSlot` into the normalized table is best-effort ([src/lib/store.ts:185–203](../../src/lib/store.ts)); some callsites `await` it, others `void Promise.all(…dualWriteSlot…)`. For **orders** PR #38 inverted the direction — the normalized table is primary (`await dualWriteOrder` at [src/lib/store.ts:1255](../../src/lib/store.ts)) and the kv_store mirror is fire-and-forget (`void mirrorOrderToKvStore` at [src/lib/store.ts:1256](../../src/lib/store.ts), the mirror itself at `:1007` under the global `withLock("orders.json")`). The leftover stale comment "kv_store remains source of truth" inside `dualWriteOrder` ([src/lib/store.ts:963](../../src/lib/store.ts)) no longer matches the wiring. | [src/lib/store.ts:185](../../src/lib/store.ts), [src/lib/store.ts:1256](../../src/lib/store.ts) | High — silent kv_store/normalized divergence on the slot path; comment drift on the order path |
| **`kv_store` table is single-row-per-key JSONB** | repo-wide | Medium — `UPDATE … SET value = …` rewrites entire JSON; orders.json becomes O(N) on every write |
| ~~**`webhook_events`, `point_adjustments`, `audit_log` have no retention/trim**~~ **✅ RESOLVED 2026-05-16 (PR #38)** — `/api/admin/cron/retention-trim` runs daily; 30d / 7d / 180d cutoffs overridable via env vars | schema | ~~Medium~~ |
| **`dangerouslySetInnerHTML`** for theme bootstrap | [src/app/admin/layout.tsx](../../src/app/admin/layout.tsx) | Low — intentional; document it |
| **10-second polling on the legacy kitchen board and the customer-facing tracker.** KDS v2 is on SSE via `useAdminOrdersStream` (with a 15s REST fallback). Dashboard polls at 30s, not 10s. The "everywhere" framing of the earlier draft of this audit was too broad. | [src/components/kitchen/KitchenOrderBoard.tsx:190](../../src/components/kitchen/KitchenOrderBoard.tsx), [src/components/order/OrderTracker.tsx:137](../../src/components/order/OrderTracker.tsx) | Medium — fine at 2 trucks, expensive past 10 |
| **No CSRF token**, relying on SameSite=Lax | admin POST routes | Low — acceptable for cookie-auth SPA, but document & double-submit a token before going B2B |
| **Self-bootstrapping DDL at runtime** via `ensureTable` (imported from `@/db/migrate`, called from per-entity wrappers like `ensureSlotsTable` / `ensureOrdersTable` / `ensureCustomersTable`) | [src/db/migrate.ts](../../src/db/migrate.ts), [src/lib/store.ts:150–151](../../src/lib/store.ts), [src/lib/store.ts:544–545](../../src/lib/store.ts) | Medium — race condition risk on first deploy; migrate to drizzle-kit migrations |
| **176 API routes, no rate-limit on most admin endpoints.** `enforceRateLimit` exists ([src/lib/rate-limit.ts](../../src/lib/rate-limit.ts)) but is wired into only 2 admin routes — `admin/login` and `admin/customers/[phone]/send`. | repo-wide | Medium — once you have staff, you have insider risk |
| **No backup/restore documentation** | repo-wide | High — single Neon DB is your single point of failure |
| **No staging env evident** | repo-wide | Medium — every deploy is production |

### Scale ceiling (honest)

| Scenario | Will it work today? (pre 2026-05-16) | Revised (post PR #38) | Where it breaks |
|---|---|---|---|
| 2 locations, 200 orders/day combined | **Yes** | **Yes** | Comfortable |
| 5 locations, 800 orders/day | Marginal | **Yes** | ~~Upstash lock contention at peak~~ → per-location lock keys split the queue. KDS v2 already SSE; legacy board still polls. |
| 20 locations, 4,000 orders/day | **No** | Marginal | ~~Hardcoded `locations.ts`; manual stock; lock storms; webhook table bloat~~ → all resolved. New ceiling is order-table query plans on a single Neon and outbox drain throughput. |
| 100 locations | Not without a rewrite | Not without a rewrite | The whole serverless-on-single-Neon assumption still breaks. Need read replicas, per-region sharding, multi-region Stripe, and a real CDN strategy. |

The "10/100/1,000 locations" framing in the capabilities deck is not credible at 100+. **The architecture is honestly good for ~10 trucks** post PR #38 and that should be the planning horizon for the next 24 months.

---

## 5. UX / UI Audit

### Strengths (real ones)

- **Premium tone done right.** The V8 Tuscany theme — parchment/terracotta/basil/oxblood/ochre tokens ([src/app/themes/homepage/tokens.css](../../src/app/themes/homepage/tokens.css)) with Cormorant Garamond + Lora typography — plus ingredient sourcing copy ("Tipo 00, San Marzano, 48h dough") reads as an authentic rustic-modern trattoria, not stock-photo Italian.
- **Cart drawer is best-in-class for the category.** Bundle ladder + combo banner + segmented delivery threshold + real slot scarcity + customer attach history all stacked, none of it feeling spammy. ([src/components/cart/CartDrawer.tsx](../../src/components/cart/CartDrawer.tsx).)
- **Phone-first loyalty.** No account, no password. Lower than Domino's, lower than Uber Eats, lower than Toast. This is genuinely a competitive advantage.
- **Item detail drawer** has a printed-menu dotted-leader nutrition readout, a hand-drawn SVG allergen matrix ([src/components/location/AllergenIcon.tsx](../../src/components/location/AllergenIcon.tsx)), sourcing provenance — Sweetgreen-tier polish. ([src/components/menu/ItemDetailDrawer.tsx](../../src/components/menu/ItemDetailDrawer.tsx).)
- **Real-time menu availability** flips items live when an ingredient hits zero (or 86). Most restaurants can’t do this.

### Weaknesses

1. **No real food photography.** Emoji + gradient is clean but conversion-killing. Pizza is sold on the shot of the cornicione. **The single biggest non-engineering ROI fix is hiring a food photographer for a day.** Budget: 1 day × ~3,000–5,000 PLN. ROI: 5–15% AOV bump.
2. **No address autocomplete.** The delivery address field in the cart is a plain `<input autoComplete="street-address">` ([src/components/cart/CartDrawer.tsx](../../src/components/cart/CartDrawer.tsx)) — no Google Places or Mapbox. Polish street addresses are typed manually → typos → failed deliveries → refunds. Wire Google Places or Mapbox.
3. **Glassmorphism on gradient hero** is a WCAG contrast risk and an a11y lawsuit waiting in EU compliance climate. Run axe-core; tune `backdrop-blur` opacity.
4. **No "X more for free delivery" callout on landing page or category page** — only inside the cart. Customers should know the threshold before they’ve added items.
5. **No social proof** — no review count, no "1,200 pizzas delivered this month," no Google rating embed. Founder narrative is good but solo.
6. **No referral CTA prominence.** Loyalty surface mentions it once, quietly. Should be a recurring nudge on order confirmation.
7. **Mobile sticky pay bar is good** — but the bundle ladder and combo banner stack vertically on mobile, pushing the cart line items below the fold. Compress.
8. **No in-app order tracking after Stripe redirect** unless the customer keeps the tab open. Add SMS-link to a tracker page (the data is there, the UI exists, the SMS isn't sent).
9. **"Pizzaiolo del mese" / scarcity** is hardcoded `PIZZAIOLO_LTO_UNTIL = 2026-06-30` ([src/data/menus/krakow.ts:12](../../src/data/menus/krakow.ts)). Once the operator forgets to update it, the “limited” item is fake-limited forever — and any sophisticated regular notices.

### Conversion gaps in numerical terms

These are educated guesses based on QSR benchmarks; instrument before believing me.

- **Address autocomplete:** +2–3% checkout completion on mobile.
- **Real food photos on top 6 menu items:** +5–10% AOV.
- **"Add a 9.90 espresso?" single-tap upsell on order confirmation:** +6–12% AOV on cart-confirmed orders (Toast benchmark).
- **Reminder push 90 minutes after a abandoned cart with bundle still in it:** +3–5% recovery.
- **Tip default at 10% (currently "None"):** +1.5–2.5% revenue; consult Polish tipping culture before flipping.

### Friction list (rank by impact)

1. No address autocomplete on delivery
2. No food photography
3. No bundle/combo callout above cart
4. No post-order SMS link to live tracker
5. No streak / "you usually order Tuesdays at 7pm" smart prompt despite the attach-history data being right there
6. Glassmorphism contrast
7. Bundle ladder + combo banner pushing items below mobile fold

---

## 6. Revenue Optimization Audit

The pricing-psychology work in this codebase is **already good** — better than 90% of independent restaurants. Pizzas end in .90, pasta in .95, desserts in .00 (signaling craft, not bargain). There’s a real anchor (Tartufata Reale at 79.90 / 89.90 PLN), a real entry (Margherita at 27.90), and a real value escape valve (slice at 11.90).

What is being left on the table:

### 1. The 4-slot upsell is rigid
[src/lib/upsell.ts](../../src/lib/upsell.ts) (the slot-id consts at `:378–394`, surfaced by `getCartSuggestions` at `:397`) hardcodes espresso + tiramisù + garlic bread + limonata. The scoring engine is sophisticated; the **set of candidates is not**. There should be ~12 candidate add-ons and the top 4 by composite score should surface — currently those 4 will always surface even when there’s a clearly better match (e.g., the customer’s second-most-ordered item).

### 2. No post-order upsell
The single highest-leverage upsell moment in QSR is **the 8 seconds after payment**: customer is in a buying state, friction is zero, and a single-tap "Add a 9.90 espresso to your order, we’ll prep it together" lands. Toast cites 12–18% attach on this surface. Not implemented.

### 3. Tip default is "None"
This is honorable. It is also leaving 1.5–2.5% of revenue on the table that the kitchen and drivers would directly receive. Polish tipping norms are evolving; an A/B test of 5% default vs none would resolve this in a week.

### 4. No surge / smart pricing
Friday 8pm in Kraków is going to peak. There is no differential-pricing engine — the capabilities page renders an explicit empty state for it ([src/app/admin/capabilities/page.tsx:366](../../src/app/admin/capabilities/page.tsx)). **Don’t do per-order surge** — do *time-windowed* premium tiers (e.g., the Pizzaiolo del Mese costs 49.90 only Friday/Saturday; 39.90 weeknights). This is anchoring + scarcity, not gouging.

### 5. No referral economic loop
Loyalty mentions referrals once. There is no give-get ("give 20 PLN, get 20 PLN"), no referral leaderboard, no auto-generated shareable link per phone number. In Polish QSR, this is a 5–8% net-new acquisition lever and you’re not pulling it.

### 6. No corporate/B2B mode beyond a banner
There is a `CorporateOrderBanner` and a corporate-invoice cron. There is no actual B2B sales motion. Each truck should have 6–10 office-block standing orders by month 12. Pricing should be different (volume discount, predictable AOV, billable to invoice). Right now you’re cross-fingers hoping HR managers tap the banner.

### 7. No "weekly usual" surface outside checkout
The scheduled-bundle feature exists. It is hidden in a checkbox at the bottom of the cart. This should be the **#1 retention feature surfaced to a Gold-tier customer**. Make it a page. Show next 4 weeks. Allow skipping a week.

### 8. Combo savings shown as % but not as PLN
"10% off" lands less than "Save 5.78 PLN." Switch primary copy.

### 9. No menu A/B on item order
There is mention of A/B harness in capabilities. There is no evidence of an experiment ledger in code. Menu order is the #1 lever in QSR conversion. If you’re not running 1 experiment a month here you’re flying blind.

### 10. No cohort-driven personalization
The customer attach-history data ([src/lib/upsell.ts:111](../../src/lib/upsell.ts)) is computed at request-time. Nothing is being **stored back** — no "this customer prefers pasta evenings, pizza weekends" segment. Build customer-segment table, recompute weekly, surface 1–2 surgically. Sweetgreen, Starbucks, Domino's all do this.

**Estimated total AOV upside from these 10**: 18–28% over 12 months, sequenced. Not stacked — many overlap.

---

## 7. Competitive Benchmarking

| Capability | Sud Italia | Toast | Square | Uber Eats | Domino's | Sweetgreen | Elite local (Pizzeria Bianco-tier) |
|---|---|---|---|---|---|---|---|
| Phone-first identity | ✅ | ❌ (account) | ❌ | ❌ | ✅ | ❌ | ❌ |
| Loyalty tiers with point multipliers | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Combo deals engine | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Contextual upsell (hour × margin × customer history) | ✅ | ⚠️ (basic) | ❌ | ✅ | ✅ | ⚠️ | ❌ |
| KDS with station routing | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| Real-time stock decrement | ✅ *(2026-05-16)* | ✅ | ✅ | n/a | ✅ | ✅ | ❌ |
| Recipe-driven PARs + auto-PO | ✅ drafts *(2026-05-16)* | ✅ (paid) | ⚠️ | n/a | ✅ | ✅ | ❌ |
| Driver dispatch + live ETA | Partial | ⚠️ | ❌ | ✅ | ✅ | ⚠️ | ❌ |
| Customer push notifications | ✅ *(2026-05-16, needs VAPID)* | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Real-time KDS (push, not poll) | ✅ KDS v2 / ❌ legacy board | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Real food photography | ❌ | n/a | n/a | ✅ | ✅ | ✅ | ✅ |
| Cohort retention dashboards | ✅ *(2026-05-16)* | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| CLTV / CAC tracking | ⚠️ *(CLTV ✅ 2026-05-16; CAC pending paid spend)* | ✅ | ⚠️ | ✅ | ✅ | ✅ | ❌ |
| Per-customer RFM segmentation | ✅ *(2026-05-16)* | ✅ | ⚠️ | ✅ | ✅ | ✅ | ❌ |
| Referral give-get loop | ⚠️ *(backend ✅ 2026-05-16; cart hookup pending)* | ⚠️ | ❌ | ✅ | ✅ | ⚠️ | ❌ |
| Sales-per-labour-hour metric | ✅ *(2026-05-16)* | ✅ | ✅ | n/a | ✅ | ✅ | ❌ |
| Tests (engineering hygiene) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a |
| Tax / fiscal compliance (JPK_V7M) | ✅ | ⚠️ | ❌ | ⚠️ | ✅ | n/a | ❌ |
| Group ordering / wallet pooling | ✅ | ⚠️ | ❌ | ✅ | ⚠️ | ❌ | ❌ |
| Brand storytelling | ✅ | n/a | n/a | ❌ | ⚠️ | ✅ | ✅ |

**Where Sud Italia is genuinely ahead of Toast/Square/Uber:** phone-first identity, segmented delivery thresholds with copy, customer attach-history-weighted upsell scoring, Polish fiscal compliance, group wallet pooling, founder narrative authenticity.

**Where it is dangerously behind:** real food photography, ~~push notifications~~ *(addressed 2026-05-16)*, ~~real-time KDS~~ *(KDS v2 already on SSE)*, ~~recipe-driven stock and PO automation~~ *(addressed 2026-05-16)*, ~~cohort retention, CLTV~~ *(addressed 2026-05-16 PR #38)*, CAC ingestion, tests.

**Where it is behind in ways that don't matter yet:** route optimization, driver mobile app, predictive demand modeling, ML personalization. None of these matter under 5 trucks.

---

## 8. Scaling Readiness

| Path | Ready? | What's blocking |
|---|---|---|
| **3rd location (Wrocław)** | ~~70%~~ **90%** *(post 2026-05-16, PR #38)* | ~~Hardcoded `locations.ts`~~ **resolved** — `src/data/locations.ts` is now a seed/fallback only ([file docstring lines 3–17](../../src/data/locations.ts)); runtime source is the `locations` Postgres table edited via `/admin/locations/manage`. ~~Need menu file~~ **optional** — a third location can be populated entirely through admin-created custom items via `getCustomMenuItems(locationSlug)` (imported at [src/data/menus/index.ts:6](../../src/data/menus/index.ts), used at `:76`) without authoring a new `src/data/menus/wroclaw.ts`. Still need: a hero image (none of the three locations have one — `/images/locations/*-hero.jpg` paths all 404), and a local supplier relationship. |
| **4th–5th location** | ~~30%~~ **70%** *(post 2026-05-16, PR #38)* | ~~Lock contention starts~~ **resolved** — the order hot path is per-location (`withLockScoped("orders", slug)`) and lock-free on the normalized `INSERT`, so the queue splits N ways, see §0.1. ~~Manual stock at 4× volume = unsustainable~~ **resolved** — `consumeRecipeForOrder` posts movements on every paid order ([src/lib/store.ts:1299–1300](../../src/lib/store.ts)) and PAR-driven draft POs run daily. Remaining blocker: one operator is still the single point of failure for ops, supplier negotiation, and quality control — a code-side problem only insofar as it can't fix the human one. |
| **Franchising** | 5% | No franchise tech: no per-franchisee royalty splitting, no franchisee accounting export, no enforced brand pack, no franchisee training portal, no compliance auto-monitoring per location, no per-tenant data isolation |
| **International (e.g., Berlin)** | 25% | ✅ Multi-currency display (PLN / USD / SGD / EUR via `/admin/currency`) + i18n dictionary covering pl / en / de / en-SG via `/admin/languages` (shipped 2026-05-21). ❌ Still blocked on: Stripe merchant account is PLN-bound so charges still settle PLN (multi-currency display only), Polish VAT (JPK XML) logic, phone-prefix +48, and a Polish supplier graph. The customer surface is now multilingual; the back-office tax + payment plumbing is still PL-only. |
| **Licensing / white-label** | 10% | Branding is baked into Tailwind tokens (italia-red etc.); not theme-able. Multi-tenant data model doesn’t exist |
| **SaaS productization** | 15% | The system is well-designed for one chain. Tearing it into a SaaS for other operators is a 6–9 month rewrite |
| **Ghost kitchens** | 60% | The architecture supports it (location-as-truck abstraction); the marketing and brand operate as "trucks" not "kitchens" |
| **Enterprise / corporate ordering** | 40% | Banner + invoice cron exist; pricing model, AR ledger, contract management absent |

**Honest read:** ~~the operator should plan for **5 trucks max under this architecture**~~, then a serious replatform if franchising or SaaS is the goal. **Revised post 2026-05-16 (PR #38): the architecture is now honestly good for ~10 trucks** — matches the revised §4 scale ceiling. Per-location locks, DB-backed locations CRUD, retention-trim, and recipe-driven stock decrement are all in. The 10-truck planning horizon should hold for the next 24 months; past that, a multi-tenant + multi-region replatform is the franchising / SaaS gate.

---

## 9. Biggest Risks

### Top 10 things most likely to kill this business

1. **Operator burnout.** One person clearly built this. Two trucks of food + this much software = a 90-hour week. The exit risk is silent collapse, not strategic failure.
2. **Demand never materializes.** No marketing infrastructure (no SEO content, no paid acquisition, no creator strategy, no PR). The trucks could be empty while the dashboard is beautiful.
3. **A food safety incident.** No HACCP enforcement workflow in the app; just an alerts page. One Sanepid violation in Kraków → reputation gone in a city this size.
4. **A serious admin breach.** Plaintext password, no MFA, default `admin123`, no IP allowlist. One leaked credential = full refund authority = liquidity event for the attacker.
5. **A Stripe dispute storm.** No automated dispute response, no evidence bundle generation. 1% dispute rate × 200 orders/day × 50 PLN avg × 3% loss = 1,500 PLN/month leak + reserve hold from Stripe.
6. **Supplier price shock + manual PO process.** Inability to react fast erodes margin in 2 weeks.
7. **Truck failure / driver no-show.** No backup capacity, no swap protocol. Two trucks means -50% revenue when one breaks.
8. **Polish regulatory change** (e-receipts, JPK update, allergen labelling). JPK is handled; the rest is one regulation away from a rewrite.
9. **Database is a single Neon instance.** No documented backup/restore. Catastrophic data loss is one bad migration away.
10. **Founder dilution by overbuilding.** Continuing to ship features instead of selling pizza. The strongest single-operator failure mode in this category.

### Risks with no current mitigation

- No staging environment, no canary, no feature flags evident → every change is production
- No fire drill / runbook for outage
- No audit retention policy → table bloat will silently become slowness
- No incident response → Sentry catches errors, but who is paged at 9pm Saturday?

---

## 10. Biggest Opportunities

### Top 10 highest-ROI improvements (ranked by impact ÷ effort)

| Rank | Move | Cost | Expected impact |
|---|---|---|---|
| 1 | Hire a food photographer for 1 day; replace emoji on top 12 items | 5,000 PLN | +5–10% AOV; +10–20% conversion on cold visitors |
| 2 | Wire post-order single-tap upsell ("Add a 9.90 espresso?") on confirmation page | 1 day eng | +6–12% on confirmed orders |
| 3 | Wire address autocomplete (Google Places) in cart | 0.5 day eng | +2–3% checkout completion + fewer failed deliveries |
| 4 | Hash admin passwords + force rotation + add a TOTP MFA | 1 day eng | Prevents an existential breach |
| 5 | Send post-order SMS with live tracker link | 1 day eng + Twilio costs | +NPS, -support calls, +retention |
| 6 | Move bundle ladder & combo banner to **above** cart line items on mobile only | 0.25 day | +3–5% bundle uptake on mobile |
| 7 | Switch combo copy from "Save 10%" to "Save 5.78 PLN" | 1 hour | +1–2% combo attach |
| 8 | Activate referral give-get with auto-generated shareable link per phone | 2 days eng | +3–7% net-new acquisition over 60 days |
| 9 | Build a "Weekly Usual" page accessible from header for Silver+ tier | 2 days eng | +retention for top decile, lifts CLTV materially |
| 10 | ~~Replace `/admin/capabilities` claims with reality: mark heuristic things heuristic, stubbed things `needs-config`~~ **✅ DONE 2026-05-16** | 0.5 day | Stops you fooling yourself; aligns engineering priority |

### Top 10 features elite competitors would already have

1. ~~**Recipe-driven stock decrement on order paid** — Toast, Square, Sweetgreen all do this.~~ **✅ DONE 2026-05-16** — §0.1.
2. ~~**PAR-driven auto-suggested PO**, one-click send to supplier email.~~ **✅ DONE 2026-05-16 (drafts)** — operator still has to send manually; supplier-EDI integration outstanding.
3. ~~**CLTV + CAC + cohort retention dashboard** — at least new-vs-repeat split, AOV by cohort, 30/60/90-day retention.~~ **✅ DONE 2026-05-16 (PR #38)** — cohort matrix + per-cohort CLTV at 30/60/90/180/365d live at `/admin/reports/cohort`. CAC still requires UTM-tagged paid spend ingestion (no paid channels yet to instrument).
4. ~~**Real push notifications** (order ready, abandoned cart, tier-up, weekly usual reminder).~~ **✅ DONE 2026-05-16 for `order ready`** — abandoned-cart / tier-up / weekly-usual fan-outs still wired only to SMS.
5. ~~**Genuine ML demand forecast** — even an SKU-level Prophet or Anthropic-call replacement of the rolling average would land more orders correctly staffed.~~ **✅ DONE 2026-05-16** — Claude-backed forecast with structured JSON + 80% confidence band.
6. **Hash chain on cash sessions and audit log** — tamper-evident, EU-tax-authority-pleasing.
7. **A/B experimentation framework that actually runs**, with an experiment ledger and stat-sig stopping rules.
8. **Operator mobile app** — managers running on tablets, not desktops. The admin is responsive; it isn't mobile-first.
9. **Live driver ETA + map** (Glovo/Uber-style) for delivery customers.
10. **In-store/cashier mode** — currently the customer ordering UX *is* the staff ordering UX. Real POS has cashier-optimized 2-tap flow.
11. ~~**Per-customer RFM segmentation feeding personalized upsell**~~ **✅ DONE 2026-05-16 (PR #38)** — `customer_segments` table + weekly rebuild cron. Personalized upsell candidate selection still needs to read from it (next pass).
12. ~~**Referral give-get with shareable per-customer link**~~ **✅ DONE 2026-05-16 (PR #38, backend)** — `/r/CODE` cookie drop + outbox-driven referrer credit. Cart drawer needs to honour the cookie + apply the 10 PLN discount at checkout (frontend hookup pending).
13. ~~**DB-backed locations registry**~~ **✅ DONE 2026-05-16 (PR #38)** — `/admin/locations/manage` CRUD eliminates the code-change-per-truck bottleneck.
14. ~~**Sales-per-labour-hour + schedule-vs-forecast gap on the dashboard**~~ **✅ DONE 2026-05-16 (PR #38)** — daily cron, dashboard tile + callout.

---

## 11. Immediate Fixes (next 30 days)

Pick at most six. Sequence by week.

### Week 1 — Stop the bleed
- Hash + salt the admin password. **No MFA-debate first; just stop the plaintext compare.** [src/lib/admin-auth.ts:143–145](../../src/lib/admin-auth.ts).
- Rotate the production admin password and document where it’s stored.
- Extend `enforceRateLimit` to ALL `/api/admin/*` routes — today only `admin/login` and `admin/customers/[phone]/send` use it, 2 of 176.
- Add Sentry alerting on > 1% 5xx and on lock-acquisition failure. The counter already exists (`incrCounter("lock.timeouts")` in [src/lib/locks.ts:170](../../src/lib/locks.ts)) and lock fallbacks bump `metrics.inProcessFallbacks` ([src/lib/locks.ts:135, 161](../../src/lib/locks.ts)); only the dashboard alert config is missing.
- Add a manual nightly Neon backup → S3, cron-driven, with a documented restore script.

### Week 2 — Trust the dashboard again
- ~~Audit `/admin/capabilities` and downgrade every "live" claim that is heuristic, stubbed, or partial. Add a `caveats` field.~~ **✅ DONE 2026-05-16** — single highest-leverage operator-honesty move.
- Add four tests: (1) checkout idempotency, (2) slot oversell prevention, (3) refund flow, (4) RBAC location scope enforcement. Use a real test runner (Vitest). Even four tests prevents three production fires.
- ~~Add `audit_log` retention (90d) and `webhook_events` retention (30d) jobs.~~ **✅ DONE 2026-05-16 (PR #38)** — daily `retention-trim` cron prunes both; cutoffs overridable via env vars.

### Week 3 — Move the AOV needle
- Hire the photographer. Shoot 12 items + 3 lifestyle.
- Wire post-order single-tap upsell on the confirmation page.
- Wire address autocomplete.

### Week 4 — Retention
- ~~Wire push notifications (VAPID + a single template: order ready).~~ **✅ DONE 2026-05-16** — needs the operator to generate VAPID keys + set env vars to activate in production.
- Build a `/usual` page that surfaces "Re-order this Tuesday at 7pm" for repeat customers using the existing attach-history data.
- Switch combo copy to PLN savings.

**At the end of 30 days:** admin is safe, dashboards are honest, AOV is up ~5–10%, push works, basic test coverage exists, backups exist.

---

## 12. Medium-Term Improvements (3–12 months)

### Quarter 2
- ~~**Recipe-driven stock decrement.** Order paid → `consumeRecipe(itemId, locationSlug)` → atomic inventory decrement.~~ **✅ DONE 2026-05-16, pulled into Week 1.**
- ~~**PAR-driven PO generation.** Daily cron compares on-hand vs par; produces a draft PO per supplier; operator one-click-sends.~~ **✅ DONE 2026-05-16 (drafts written); one-click-send to supplier email still outstanding.**
- **Real-time KDS via SSE** (server-sent events), with polling as fallback. **Partially done** — KDS v2 (`/admin/kds`) is on SSE via `useAdminOrdersStream`; the legacy `/kitchen/[slug]` board still polls.
- ~~**Cohort dashboard.** New-vs-repeat split, AOV by cohort month, 30/60/90-day retention.~~ **✅ DONE 2026-05-16 (PR #38)** — `/admin/reports/cohort` renders the matrix + CLTV table + segment mix.
- ~~**CLTV + CAC.** With UTM-tagged links + Stripe revenue + order count, this is a SQL query, not a project.~~ **✅ CLTV DONE 2026-05-16 (PR #38)** — CAC half still requires UTM-tagged paid spend, which doesn't exist yet.

### Quarter 3
- ~~**Referral give-get loop** with auto-generated shareable link, tracked from sign-up through 3rd order.~~ **✅ BACKEND DONE 2026-05-16 (PR #38)** — `/r/CODE` cookie drop + outbox-driven referrer credit; cart drawer cookie-read + discount apply still pending.
- **B2B / corporate sales motion** — invoice-billed standing orders, volume tiers, dedicated CSM email.
- **A/B experimentation framework** with an experiment table, deterministic bucketing, stat-sig stopping rule.
- ~~**Genuine demand forecast** using either Prophet (Python sidecar) or Claude with structured outputs over 90 days of order history.~~ **✅ DONE 2026-05-16 (Claude path).**
- **MFA on admin** (TOTP).
- **A staging environment.** Vercel preview deploys + a separate Neon branch.

### Quarter 4
- **Driver dispatch + live ETA** if delivery > 30% of revenue.
- **Operator mobile app** (PWA-first; native is premature).
- **Cashier mode** for staff taking phone/walk-up orders.
- **Hash-chained cash sessions and audit log** for fiscal compliance.

This sequence is intentionally conservative. Every quarter assumes the previous one’s work didn’t introduce a fire.

---

## 13. Long-Term Strategic Opportunities (1–5 years)

### Path A: Premium Polish chain (recommended)
6–10 trucks across Polish A-cities (Kraków, Warsaw, Wrocław, Poznań, Gdańsk, Łódź, Lublin), all corporate-owned, matching the revised ~10-truck architectural ceiling from §4 and §8. Tight brand control, premium positioning, founder remains creative director. The Q2 medium-term work that this path used to require (recipe-driven stock, PAR-driven POs, cohort dashboard, CLTV, Claude-backed forecast, DB-backed locations, per-location locks, SPLH + schedule-vs-forecast) is mostly already in place per §0.1; what's still required is the Q3–Q4 work (B2B sales motion, A/B framework, MFA, staging env, hash-chained cash sessions, cashier mode). Margin expansion via supplier consolidation + corporate B2B.

### Path B: Franchise after 5 corporate
The “Subway model” for premium Neapolitan. Requires (1) operational manuals, (2) franchisee tech: royalty splits, mandatory compliance gates, brand-pack enforcement, training portal, (3) data isolation in the tech, (4) a national kitchen-supply contract. 18-month investment.

### Path C: SaaS to other premium QSR chains
The cleanest software story in this audit. There is a real, defensible product here (phone-first identity + customer-attach-history upsell + segmented delivery + Polish fiscal compliance). Spinning it off as a SaaS is **6–9 months of multi-tenant work** and a different fundraise. Founder must decide whether they’re a restaurateur or a software-CEO.

### Path D: Acquisition by Glovo/Wolt/Bolt Food
Realistic exit in 24–36 months if the chain hits 8+ trucks. Acquirers value the proprietary customer data and the loyalty wallet more than the trucks.

### Path E: International (Berlin, Vienna, Prague)
Most expensive path. ✅ i18n + display-currency now ship out of the box (4 locales × 4 currencies via `/admin/languages` and `/admin/currency` as of 2026-05-21) — that's roughly 6 weeks off the previous estimate. ❌ Still need: per-region Stripe merchant accounts (currency is bound to the merchant account at creation, so true EUR/USD/SGD settlement is its own workstream), a tax engine to replace JPK_V7M (Stripe Tax or TaxJar), and local supplier + compliance discovery per geography (~3 months each).

**My recommendation: A → B → optional C.** Don’t pursue D actively; let it find you.

---

## 14. What Elite Operators Would Do

### What Toast would say
"Your KDS is polling. Fix that this week. Your stock isn’t decrementing on order. Fix that this month. You have no tests on a Stripe-integrated codebase. That is a Sev-1 finding."

### What Domino's would say
"You don’t have an order tracker URL going out by SMS. You don’t have ‘re-order’ as a one-tap on the home page for returning users. You don’t have driver ETA. These are not features — these are table stakes. Build them in 30 days or you’ll lose every delivery customer to Wolt."

### What McDonald's ops would say
"Where’s your sales-per-labor-hour metric? Where’s your staff schedule generated from demand forecast? Where’s your prep-list driven by tomorrow’s expected covers? You can’t run a chain on a Slack channel and intuition."

### What a Pizzeria Bianco-tier operator would say
"The product matters more than the dashboard. You should know every regular’s name and order. Stop building software for a chain you don’t have yet."

### What McKinsey would write in the PE memo
"Operating model is overbuilt for scale, under-built for current revenue. Founder is the binding constraint on both growth and continuity. Asset risk concentrated in two trucks and one Postgres instance. Margin opportunity is real (combos + corporate + premium-tier anchors). Defensibility is brand-driven, not network-driven. We would underwrite this only with a 24-month founder retention clause and an operating partner placement to absorb the systems work."

### What Sweetgreen would say
"Your photography is the bottleneck. Pizza is sold on the cornicione, the leopard-spotted char, the basil oil pool. Until you have it shot well, every other AOV experiment is rounding error."

### What Amazon ops would say
"You have no metrics on metrics. You can’t tell me cart-to-pay conversion last Tuesday. You can’t tell me upsell attach by hour. You can’t tell me refund rate by item. Instrument first, then optimize."

---

## 15. Final Brutal Verdict

You have built a Toast-tier ordering and admin platform for a 2-truck Neapolitan pizza concept in Poland. The engineering is unusually good for a small operator. The product narrative (Naples in Poland, hand-stretched, 48h dough, Tipo 00, San Marzano) is credible. The cart conversion stack is genuinely sophisticated.

But:

- ~~**Five major surfaces are theatre, not function.** Inventory, AI, suppliers, KDS SLA, push notifications. Anyone investigating this business with a real diligence checklist will find this within 2 hours and the conversation will change tone.~~ **✅ RESOLVED 2026-05-16** — all five surfaces wired end-to-end the same day this audit landed (commit `c863a3a`). See §0.1 resolution log. The new diligence question is whether the operator can actually staff this many automations; the code is no longer the bottleneck.
- **You are one phishing email away from a refund-authority breach.** Hash the password this week. *(Still outstanding.)*
- **You have zero tests.** Refund, payment, RBAC. This isn't hygiene; this is malpractice on a payments-handling codebase. *(Still outstanding.)*
- **Real-time is polling on the legacy kitchen board.** Honestly the cheapest thing you can fix. *(KDS v2 is already on SSE.)*
- ~~**Stock doesn't decrement on order.** The most expensive thing you've avoided fixing because the dashboard looks fine without it.~~ **✅ RESOLVED 2026-05-16** — variance reports now reflect real consumption.
- **You are competing for the operator's attention against the trucks.** This is the strongest existential risk in the audit and it has nothing to do with code.

**The business can become elite.** The path is: 30-day safety + honesty pass → 90-day AOV and retention push → ~~180-day operational automation~~ **(largely shipped 2026-05-16 — recipe-driven stock, PAR-driven POs, KDS SLA, push, Claude forecast, retention trim, DB-backed locations, per-location locks, SPLH, cohort, segments, referral backend; see §0.1)** → 12-month 3rd–5th truck → 24-month franchise decision. Skip the SaaS detour unless it's funded separately.

**If you change one thing this week:** hire the photographer. Pizza is visual; you're selling it with emoji.

**If you change one thing this month:** ~~make `/admin/capabilities` honest~~ **(done 2026-05-16; the page now carries a `caveats` field rendered as an amber callout and every stubbed/heuristic surface is downgraded)** → **hash + salt the admin password and rotate it** ([admin-auth.ts:143–145](../../src/lib/admin-auth.ts)). You are one phishing email away from a refund-authority breach; this is now the highest-leverage open item from §11 Week 1.

**If you change one thing this year:** decide whether you are a restaurateur or a software-CEO and staff the other role from outside immediately. The current trajectory has you doing both badly; either done well is a real business.

The codebase is a ~~7.5/10~~ **8.5/10** post PR #38, and **~8.7/10 as of 2026-05-29** (V8 storefront in production, a real audited LLM ops agent, relational data migration on the hot paths). The business model is a 5/10. The operator is, on this evidence, an 8/10. Put a 5/10 operations partner alongside them and this is a 7/10 business. Don't, and it's a beautiful Github repo and an empty truck on a slow Tuesday.

**Post-2026-05-16 addendum.** The codebase is no longer the binding constraint on the next three trucks. Adding Wrocław is a 30-second admin form; ops can be run from the dashboard's SPLH tile + cohort report + PAR queue + variance report without any of the underlying spreadsheets that used to be required. The remaining bottlenecks are now (a) demand generation, (b) operator capacity to act on the new dashboards, and (c) the unfinished security + tests hygiene from §11. **The conversation in a diligence room would now be about marketing and unit economics, not theatre.** That's a different — and more solvable — problem than the one this audit opened on.

---

## Appendix A — Prioritized Action List

Sequence (not optional; the order matters):

| # | Action | Effort | Impact | Phase |
|---|---|---|---|---|
| 1 | Hash admin passwords, rotate, add IP allowlist | 1d | Critical (security) | Week 1 |
| 2 | ~~Add audit retention + webhook retention jobs~~ **✅ DONE 2026-05-16 (PR #38)** | 0.5d | Medium | Week 1 |
| 3 | Nightly DB backup + documented restore | 0.5d | Critical (continuity) | Week 1 |
| 4 | Make `/admin/capabilities` honest | 0.5d | Critical (operator psychology) | Week 1 |
| 5 | Write 5 tests (checkout, slot, refund, RBAC, upsell) | 2d | High (regression shield) | Week 2 |
| 6 | Food photographer + ItemImage wiring | 1d + shoot | High (AOV + conversion) | Week 3 |
| 7 | Post-order upsell on confirmation | 1d | High (AOV) | Week 3 |
| 8 | Address autocomplete | 0.5d | Medium (checkout completion) | Week 3 |
| 9 | ~~Push notifications (order ready)~~ **✅ DONE 2026-05-16** | 1d | Medium (retention) | Week 4 |
| 10 | "/usual" page from header for repeat customers | 2d | High (retention) | Week 4 |
| 11 | Combo copy → PLN savings | 1h | Low (AOV) | Week 4 |
| 12 | ~~Recipe-driven stock decrement on order paid~~ **✅ DONE 2026-05-16** | 4d | High (ops integrity) | Month 2 |
| 13 | ~~PAR-driven draft PO generation~~ **✅ DONE 2026-05-16** | 3d | High (labor save) | Month 2 |
| 14 | SSE real-time KDS (legacy `/kitchen/[slug]` board only — KDS v2 already on SSE) | 3d | Medium (ops UX) | Month 2 |
| 15 | ~~Cohort retention + CLTV/CAC dashboard~~ **✅ DONE 2026-05-16 (PR #38)** — CAC half pending paid spend | 2d | High (decision-making) | Month 3 |
| 16 | MFA (TOTP) on admin | 2d | High (security) | Month 3 |
| 17 | Staging environment + preview DB branch | 1d | Medium (deployment safety) | Month 3 |
| 18 | ~~Referral give-get with shareable links~~ **✅ DONE 2026-05-16 (PR #38, backend)** — cart hookup pending | 4d | High (acquisition) | Month 4 |
| 19 | A/B experimentation framework w/ ledger | 5d | High (compounding) | Month 4 |
| 20 | B2B / corporate sales motion + AR | 7d | High (revenue) | Month 5–6 |
| 21 | ~~Genuine demand forecast (replace MA)~~ **✅ DONE 2026-05-16 (Claude)** | 5d | Medium (staffing accuracy) | Month 6 |
| 22 | Driver dispatch + live ETA | 7d | Medium (delivery NPS) | Month 7 |
| 23 | Cashier / staff order-mode | 3d | Medium (ops speed) | Month 8 |
| 24 | Hash-chained cash sessions + audit | 3d | Medium (compliance) | Month 9 |
| 25 | Multi-tenant data isolation prep | 14d | High (if franchising) | Month 10–12 |
| 26 | ~~DB-backed locations registry (no code change per truck)~~ **✅ DONE 2026-05-16 (PR #38)** | 1d | High (scalability ops) | Month 2 |
| 27 | ~~Per-location order lock keys (raise 300/hr ceiling)~~ **✅ DONE 2026-05-16 (PR #38)** | 1d | High (scalability tech) | Month 2 |
| 28 | ~~Customer RFM segmentation table + weekly rebuild~~ **✅ DONE 2026-05-16 (PR #38)** | 2d | High (data moat) | Month 3 |
| 29 | ~~Sales-per-labour-hour + schedule-vs-forecast on dashboard~~ **✅ DONE 2026-05-16 (PR #38)** | 1d | High (ops sophistication) | Month 2 |

---

## Appendix B — What is genuinely world-class in this codebase

So this audit isn’t only blood-letting:

1. **HMAC-signed location-scoped admin session tokens** — better than 95% of restaurant SaaS.
2. **Idempotency hash that includes cartHash + slotId**, not just an opaque key — stops a real class of duplicate-order bugs.
3. **Webhook dedup via INSERT … ON CONFLICT on (provider, event_id)** — the textbook solution, executed cleanly.
4. **Upsell composite score** (margin × hour × customer attach history with novelty decay) — better designed than the equivalent in Toast.
5. **Phone-first identity with no password and group wallet pooling** — a real competitive differentiator.
6. **Segmented delivery thresholds with copy that explains the threshold** — Wolt and Uber don’t do this.
7. **Combo savings cap per category** so quantity scaling doesn’t unbounded discount — adult engineering.
8. **JPK_V7M Polish tax export** as a first-class feature — most teams forget for 18 months.
9. **Phase-1 normalized schema in flight** alongside legacy kv_store with dual-write — the right migration strategy, even if execution has gaps.
10. **The Capabilities page concept** (CLAUDE.md Rule #9) — the right idea even if the current contents are too optimistic. Make it honest and it becomes a strategic asset.

Keep doing these. Stop doing the other 25.

---

*Audit ends. The next move is yours.*

---

## 16. 2026-05-29 Update — storefront rebuild, a real LLM layer, and a relational migration

Thirteen days from the 2026-05-16 resolution log. The three big movements since: the customer storefront was **rebuilt to production as the V8 Tuscany trattoria**, a **genuine Anthropic-LLM agent layer** landed in the admin, and the **persistence layer began migrating from JSON-blob-in-Postgres to normalized Drizzle relational tables**. None of the four still-open §15 bullets (plaintext password / zero real tests / legacy-board polling / operator-attention-vs-trucks) is fully closed; two move materially.

### §5 UX/UI — brought current to the V8 production storefront

The §5 "Strengths" list originally described the *pre-V8* storefront; it has been updated in place to reflect what shipped:

- "Premium tone done right" now reads from the **V8 Tuscany theme**: parchment/terracotta/basil/oxblood/ochre tokens (`src/app/themes/homepage/tokens.css`), **Cormorant Garamond + Lora** typography, paper-grain canvas. The old Italian-flag stripe and Georgia headings are gone.
- The item detail drawer's nutrition **bars were deliberately removed** for a printed-menu dotted-leader readout, and allergens are now **hand-drawn SVG line icons** (`src/components/location/AllergenIcon.tsx`). The drawer is still rich; §5 now describes the dotted-leader readout rather than bars.
- `CartDrawer.tsx` and `ItemDetailDrawer` still exist at the cited paths — V8 re-themed them in place rather than relocating, so most file references survive.

§5 "Weaknesses" re-verified: **#1 no real food photography — still true** (V8 replaced emoji with serif-on-parchment, but `MenuItem.image` is still empty; this remains the single highest-ROI non-engineering fix). **#2 no address autocomplete — still true** (the cart's address field is a plain `<input autoComplete="street-address">`, no Google Places/Mapbox). #4 (no free-delivery callout off-cart), #5 (no social proof), #6 (referral CTA not prominent) — all still true; in fact the referral surface that did ship on `/rewards` uses a `Math.random()` code (see new finding below).

### §6 Revenue Optimization — re-verified, the high-leverage items are unmoved

- **#1 the 4-slot upsell is rigid** → **still true.** `getCartSuggestions` (`src/lib/upsell.ts`) still surfaces a fixed 4-slot panel (espresso → tiramisù → garlic bread → limonata).
- **#2 no post-order upsell** → **still true.** The confirmation page shows a comeback/FOMO + "Order again" block but no single-tap add-an-item.
- **#3 tip default is "None"** → **still true.** `TipPicker` presets 0/10/15/20% with "0 — no thanks" preselected.
- **#7 "weekly usual" outside checkout** → still gated to bundle carts in the drawer (no dedicated page).
- **#8 combo savings shown as %** → improved: the cart now shows both `−N%` and the PLN amount.
- **#9 no A/B experiment ledger / #10 no cohort personalization** → cohort/RFM segmentation exists (PR #38) and the simulation reads real-order actuals, but there's still no live experiment ledger and personalized upsell still doesn't read the segments.

### §4 / §1.10 Technology & Data-AI — two structural shifts

- **Real LLM layer (contradicts the "AI is heuristic" framing in §1 and §3).** Beyond the Claude-backed forecast noted in §0.1, there is now an **agentic admin copilot**: `src/lib/ai/gateway.ts` (Anthropic SDK, prompt caching, effort/thinking config), `src/lib/ai/agent.ts` (tool-use loop ≤8 hops, mutating tools gated behind operator-approval preview cards), `src/lib/ai/tools/registry.ts` (role-gated, every execution audit-logged as `actor='claude:${userId}'`), `cost.ts` (daily budget gate). Plus the WhatsApp LLM ordering bot (`src/lib/whatsapp/`) with **real Stripe pay-in-chat** and a concierge/MCP capability layer (`src/lib/concierge/capabilities.ts`). The §1 anomaly detector is still heuristic; the rest of the "AI" framing is now genuinely AI.
- **Persistence migrating to relational Drizzle.** The §4 "`kv_store` single-row JSONB, `orders.json` becomes O(N) on every write" finding is now **half-resolved**: orders/recipes/ingredients/ingredientProducts/customers/loyalty/KDS-tickets are normalized Drizzle tables read relational-first, with the kv blob kept as a lazy-backfill mirror (`store.ts:19-23`, now 11,105 lines). The O(N) full-document rewrite survives only on the un-migrated long tail (slots fallback, mirrors). The §4 "no row-level transactions for order create" and "self-bootstrapping DDL" findings still stand.
- **Tests: "zero" is now narrowly false.** Two real `node:test` files exist (`floor.test.ts`, `pace-steering.test.ts`, 11 assertions, passing). But there's **no vitest/jest, no `test` script, no config**, and **no coverage of checkout/refund/slot/RBAC** — the four tests §11 Week-2 asked for are still not written. §15's "zero tests / malpractice" bullet stands in substance.

### §3 Operational — KDS/POS rewrite + new ops surfaces

The KDS and POS were rewritten since the audit. KDS now has **role lenses** (owner Fleet / manager floor / kitchen chef strip), a real **prediction engine** (`kds-prediction.ts`), **pace-steering** (`pace-steering.ts`, POS-facing demand steering), SLA countdown, hotkeys, recall, and live floor-ops 86. A real server-backed **POS Tabs terminal** (`/admin/pos`) now exists (tables, covers, channels, server-authoritative pricing) — partially answering the long-standing "no native POS terminal" gap, though still no offline-first mode, no receipt-printer/cash-drawer driver, and **no coursing** (an interim Starters/Mains/Dessert + kitchen-timing + drag-to-recourse feature was built mid-May, then dropped in the POS/KDS rewrite). New real admin surfaces since 2026-05-21: `/admin/floor` (tables + reservations), `/admin/menu-engineering` (standalone Boston-matrix), `/admin/concierge`, `/admin/crm`, `/admin/currency`, `/admin/languages`, `/admin/regulatory-compliance`, `/admin/alerts` — all wired to real data and all registered in the capabilities ledger.

### Design system — a new doctrine landed (CLAUDE.md Rule #11)

The codebase split into **three independent themes** (Core / Admin / Homepage) under `src/app/themes/{core,admin,homepage}/`, isolated via per-route-group CSS imports + per-theme `next/font` loading, with a `docs/design-system/` tree, an admin Settings **Themes inspector**, and a **Layout tab** of storefront visibility toggles read at runtime by `LayoutGate`. CLAUDE.md gained **Rule #11** ("design-system docs ship with the code"). This is a meaningful maturity step for a multi-surface product and a new axis these audits should track going forward.

### New finding — Rule-#1 (no fake data) regressions on the V8 rewards surface

The §3 "What is theatre" discipline this audit pioneered has a fresh instance to log: the V8 `/rewards` rebuild ships UI for a loyalty **streak** (hardcoded literal "2") and a **weekly challenge** (hardcoded "33% / 1-of-target") in `src/app/(public)/rewards/page.tsx`, and the customer-facing **referral code** is generated with `Math.random()` each render rather than read from the persisted `referral-loop.ts` owner code. These are cosmetic-not-functional surfaces — exactly the pattern CLAUDE.md Rule #1 forbids and this audit's §3 table exists to catch. They belong on the "theatre" list until wired to real data. (Two storefront surfaces, `/review/[orderId]` and `/corporate/[slug]`, also remain on the pre-V8 `italia-*` palette — design-system drift under the new Rule #11.)

### Scorecard movement (§2)

| Dimension | Post 2026-05-21 | 2026-05-29 | Why |
|---|---:|---:|---|
| UX / UI sophistication | 7.5 | **8** | V8 trattoria shipped to production — a coherent premium surface, not a mockup. Capped by missing food photography + two non-V8 legacy surfaces + fake rewards values. |
| Operational sophistication | 8.7 | **8.8** | KDS/POS rewrite + floor/reservations + real LLM ops agent; coursing dropped, offline POS still absent. |
| Systems maturity | 5 | **5.5** | Relational migration on hot paths + a real (if tiny) test suite + a three-theme design system; plaintext password + thin coverage hold it down. |
| Investor readiness | 6.5–7 | **7** | Real agentic LLM + relational data layer + real-order-backed simulation; the security/tests floor is unchanged. |

### Net effect on the §15 verdict

The four still-open §15 bullets are unchanged in substance: **plaintext password compare** (still the highest-leverage open security item), **no real test coverage** on payment/refund/RBAC, the **legacy `/kitchen/[slug]` board still polling** (KDS v2 + the new role-lens board are on SSE), and the **operator-attention-vs-trucks** existential risk. What changed is that the "the codebase is no longer the binding constraint" framing is now even more true — the storefront is premium-in-production, the AI is genuinely agentic, and the data layer is migrating to a shape that scales — which sharpens the §15 point that **the remaining bottlenecks are demand generation, security/tests hygiene, and operator focus, not missing features.** The one thing to fix this week is still **hash the admin password**; the one new thing to fix this month is **wire the rewards streak/challenge/referral surfaces to real data** before they become a credibility tell in the next diligence pass.

— *Re-run lens: consolidated outside-in view, thirteen days later — 29 May 2026*
