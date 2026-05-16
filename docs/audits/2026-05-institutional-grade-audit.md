# Sud Italia — Institutional-Grade Audit

**Date:** 2026-05-16
**Auditor lens:** McKinsey operational due diligence + PE operational advisor + Toast/Square systems architect + consumer-psychology operator
**Scope:** Full repository (`/home/user/sud-italia`), business model, ops architecture, UX, monetization, scale readiness
**Mode:** Brutally honest. No flattery. Specific citations.

---

## 0. Pre-flight observation

There are already five thick audits in this directory (admin dashboard, NYC/Singapore viability, bundle ladder, revenue/psychology redesign, elite-QSR recommendations). This one is intentionally **the consolidated outside-in view** — what an investor's first-week diligence team would write after reading the code, not another deep-dive on one surface. Where it overlaps with prior audits, it is harsher and more compressed.

---

## 1. Executive Summary

**One-line verdict:** A genuinely impressive single-operator codebase wearing the costume of a multi-location chain — about 12 months of solo-builder over-engineering disguising a business that has not yet proven it can fill the trucks it already owns.

The product side is sophisticated for a 2-truck Polish pizza concept: 27 admin pages, segmented delivery thresholds, customer-attach-history-weighted upsell scoring, hour-of-day bundle ladders, Stripe + idempotency + webhook dedup, a phone-first loyalty wallet with group pooling, JPK_V7M Polish tax export, dual-write database migration, distributed locking via Upstash, Sentry, structured logging, RBAC with HMAC-signed location-scoped sessions. This is **Toast-tier surface coverage built by what looks like one or two people**.

But:

- **Zero tests.** None. Not one `.test.ts` file in 126 API routes. ([package.json](../../package.json), no test runner declared.)
- **Stock does not decrement on order.** Inventory is a manual logbook with a pretty chart. ([src/lib/store.ts:1088](../../src/lib/store.ts) `createOrder` does not consume recipes.)
- **Admin password is plaintext compared.** Default `admin123`. No bcrypt, no MFA, no rotation. ([src/lib/admin-auth.ts:143](../../src/lib/admin-auth.ts).)
- **The “AI Operating System”** advertised on `/admin/capabilities` is a **7-day moving average** and a heuristic anomaly detector. ([src/components/admin/AdminAI.tsx:147](../../src/components/admin/AdminAI.tsx).)
- **Real-time is 10-second polling** dressed up as SSE. ([src/components/kitchen/KitchenOrderBoard.tsx](../../src/components/kitchen/KitchenOrderBoard.tsx).)
- **Two locations live. Wrocław is hardcoded-but-inactive.** The “100-location” framing in the capabilities page is fiction until a third location exists.

The honest framing: this is a **product engineering exercise** with a real restaurant attached. The risk is the opposite of most startups — the software is far ahead of the business and the operator is at risk of polishing the dashboard while the trucks under-trade. Every hour spent on the 27th admin page is an hour not spent on demand generation, supplier negotiation, or hiring a second great pizzaiolo.

---

## 2. Business Quality Scorecard

| Dimension | Score /10 | One-line justification |
|---|---|---|
| Overall business quality | **5.5** | Brand + product strong; demand and unit economics unproven at two trucks. |
| Scalability (ops) | **3** | Hardcoded locations, no auto-stock, no supplier automation, no labor-to-revenue math. |
| Scalability (tech) | **5** | Architecture passes 1–2 locations; breaks around 300 orders/hour on Upstash lock contention. |
| Defensibility | **3** | No physical, brand, data, or network moat. Replicable in 8 weeks by a serious operator. |
| Operational sophistication | **4** | Pretty admin; weak underlying ops (manual stock, no PAR-driven POs, no schedule-to-sales). |
| Product quality (food) | **Unknown / assumed 7** | Code reflects a serious pizzaiolo (Tipo 00, San Marzano, 48h dough). Not auditable from repo. |
| Systems maturity | **4** | Solid scaffolding, zero tests, manual migrations, plaintext auth, polling-as-realtime. |
| UX / UI sophistication | **7.5** | Genuinely premium for the category. Segment-aware delivery thresholds and combo banners are real differentiators. |
| Profitability potential | **5** | Pizza margins are great. Two trucks, EU labor and ingredient costs, and Polish AOV ceilings cap upside. |
| Strategic positioning | **5** | “Naples in Poland” works; not enough scarcity, ritual, or community to defend price. |

Average around **4.8/10**. The codebase pulls it up; the unit-economics reality pulls it down.

---

## 3. Operational Audit

### What is real

| Surface | Status | Notes |
|---|---|---|
| Order pipeline (web → Stripe → DB → KDS) | Real | Idempotent, webhook-verified, audit-logged. [src/app/api/webhook/route.ts:43](../../src/app/api/webhook/route.ts) |
| Slot capacity | Real, atomic | Unique key + distributed lock prevents oversell. [src/db/schema.ts](../../src/db/schema.ts) |
| Combo / bundle engine | Real | Hardcoded defaults + admin override; correctly caps savings per category. [src/lib/upsell.ts:513](../../src/lib/upsell.ts) |
| Upsell scoring | Real | Margin × hour × customer-attach-history composite. Best piece of code in the repo. [src/lib/upsell.ts:97](../../src/lib/upsell.ts) |
| Loyalty + tiers + wallet pooling | Real | 1 PLN = 1 pt; 4 tiers; manual adjustments summed live. [src/lib/loyalty.ts](../../src/lib/loyalty.ts) |
| RBAC + location-scoped sessions | Real | HMAC binds location scope into the cookie. Genuinely elegant. [src/lib/admin-auth.ts:8](../../src/lib/admin-auth.ts) |
| JPK_V7M Polish tax export | Real | Most teams forget this for 18 months. |
| Audit log | Real | Every write tagged actor + entity. No retention/trim — will become a problem (see §11). |

### What is theatre

| Surface | What it looks like | What it actually is |
|---|---|---|
| Inventory | Stock levels, par, reorder points, variance | Manual ledger; **orders do not consume stock**. Variance compares theoretical-from-recipes to manually-logged actuals. [src/components/admin/AdminInventory.tsx:840](../../src/components/admin/AdminInventory.tsx) |
| Suppliers / POs | Master list + workflow | Operator types orders by hand. No reorder triggers. |
| AI Operating System | "Demand forecast", "anomaly detection", "dynamic pricing suggestions" | 7-day rolling average and threshold rules. [src/components/admin/AdminAI.tsx:141](../../src/components/admin/AdminAI.tsx) |
| Cohort retention | Reports page | Not computed. AOV + revenue per date range. No CLTV. |
| Sales per labor hour | Staff page | Labor cost tracked, never divided by sales. |
| Promised-ready SLA on KDS | Listed in capabilities | UI shows elapsed only; the “red+audible at <0s” claim is aspirational. [src/components/admin/AdminKDS.tsx:70](../../src/components/admin/AdminKDS.tsx) |
| KDS bump-bar hotkeys (1–9, 0) | Listed in capabilities | Button-click only. Will cost ~3 seconds per bump at rush. |
| Push notifications | Listed in capabilities | Templates exist; VAPID keys not configured. |
| WhatsApp ordering | Listed in capabilities | Stubbed; depends on 9 env vars that aren’t set. |

This is the most important section of the audit: **`/admin/capabilities` is currently selling a chain to its own founder.** It is the single most dangerous file in the repo because it lets the operator believe the business is more automated than it is. Rule #9 of CLAUDE.md is good in principle; in practice, several entries are marked “live” when the underlying work is heuristic, stubbed, or manual. Fix this in week one.

### Operational bottlenecks

1. **Manual stock consumption** — at 100 orders/day, each order touches 4–8 ingredients × 2 trucks = 800–1600 manual moves/day to keep the variance report honest. Nobody will do this. The report decays into noise within 30 days.
2. **No PAR-driven purchase orders** — the operator wakes up, eyeballs the dough buckets, calls the supplier. This is fine at 2 trucks. It is unsurvivable at 5.
3. **Promised-ready time is not surfaced on tickets** — KDS shows elapsed but not “target.” In a queue surge this is the difference between “fast” and “late.”
4. **Refunds bypass stock reconciliation** ([variance.ts:10](../../src/lib/variance.ts)). A 6-item refunded order leaves 6 ghost-consumed ingredients in the books.
5. **Cash sessions are soft-delete-only.** No tamper-evident hash chain. EU tax authorities are starting to require that. ([AdminCash](../../src/components/admin/) and [AdminAuditLog](../../src/components/admin/).)

---

## 4. Technology Audit

### What is good

- **Next.js 16 + RSC + Drizzle + Neon** is a defensible, modern stack.
- **Idempotency is taken seriously**: SHA-256(`idempotencyKey:cartHash:slotId`) with 30-min table cache. [src/lib/idempotency.ts:129](../../src/lib/idempotency.ts).
- **Webhook dedup via `INSERT … ON CONFLICT DO NOTHING`** on `webhook_events(provider, event_id)`. Correct.
- **Phase 1 normalization is in progress** — slots, orders, order_items, customers all have proper tables with indices, not just JSON blobs. [src/db/schema.ts](../../src/db/schema.ts).
- **HMAC-signed location-scoped admin sessions** — better than 95% of restaurant SaaS on the market.
- **Sentry + structured stdout JSON logging** with request context. Good defaults.

### What is alarming

| Issue | File | Severity |
|---|---|---|
| **Zero tests** | repo-wide | Critical — refund, slot, payment, RBAC, upsell scoring all unverified |
| **Plaintext password compare** | [src/lib/admin-auth.ts:143](../../src/lib/admin-auth.ts) | Critical — no hashing, no MFA, default `admin123` |
| **Distributed locks degrade silently to in-process** when Redis is down | [src/lib/locks.ts](../../src/lib/locks.ts) | High — silent corruption potential under partial outage |
| **No row-level transactions** for order create + slot increment + customer rollup | [src/lib/store.ts:1088](../../src/lib/store.ts) | High — partial states under failure |
| **Dual-write to normalized table is fire-and-forget** | [src/lib/store.ts:163](../../src/lib/store.ts) | High — silent kv_store/normalized divergence |
| **`kv_store` table is single-row-per-key JSONB** | repo-wide | Medium — `UPDATE … SET value = …` rewrites entire JSON; orders.json becomes O(N) on every write |
| **`webhook_events`, `point_adjustments`, `audit_log` have no retention/trim** | schema | Medium — table bloat in months, query slowdowns in a year |
| **`dangerouslySetInnerHTML`** for theme bootstrap | [src/app/admin/layout.tsx](../../src/app/admin/layout.tsx) | Low — intentional; document it |
| **10-second polling everywhere** (KDS, order tracker, dashboard) | [src/components/kitchen/](../../src/components/kitchen/) | Medium — fine at 2 trucks, expensive past 10 |
| **No CSRF token**, relying on SameSite=Lax | admin POST routes | Low — acceptable for cookie-auth SPA, but document & double-submit a token before going B2B |
| **Self-bootstrapping DDL at runtime** via `ensureTable` | [src/lib/store.ts:131](../../src/lib/store.ts) | Medium — race condition risk on first deploy; migrate to drizzle-kit migrations |
| **126 API routes, no rate-limit on most admin endpoints** | repo-wide | Medium — once you have staff, you have insider risk |
| **No backup/restore documentation** | repo-wide | High — single Neon DB is your single point of failure |
| **No staging env evident** | repo-wide | Medium — every deploy is production |

### Scale ceiling (honest)

| Scenario | Will it work today? | Where it breaks |
|---|---|---|
| 2 locations, 200 orders/day combined | **Yes** | Comfortable |
| 5 locations, 800 orders/day | Marginal | Upstash lock contention at peak; KDS polling load 5× |
| 20 locations, 4,000 orders/day | **No** | Hardcoded `locations.ts`; manual stock; lock storms; webhook table bloat |
| 100 locations | Not without a rewrite | The whole serverless-on-single-Neon assumption breaks |

The "10/100/1,000 locations" framing in the capabilities deck is not credible. **The architecture is honestly good for 3–5 trucks** and that should be the planning horizon for the next 18 months.

---

## 5. UX / UI Audit

### Strengths (real ones)

- **Premium tone done right.** Italian flag stripe + Georgia headings + ingredient sourcing copy ("Tipo 00, San Marzano, 48h dough") reads as authentic, not stock-photo Italian.
- **Cart drawer is best-in-class for the category.** Bundle ladder + combo banner + segmented delivery threshold + real slot scarcity + customer attach history all stacked, none of it feeling spammy. ([src/components/cart/CartDrawer.tsx](../../src/components/cart/CartDrawer.tsx).)
- **Phone-first loyalty.** No account, no password. Lower than Domino's, lower than Uber Eats, lower than Toast. This is genuinely a competitive advantage.
- **Item detail drawer** has nutrition bars, allergen matrix, sourcing provenance — Sweetgreen-tier polish. ([src/components/menu/ItemDetailDrawer.tsx](../../src/components/menu/ItemDetailDrawer.tsx).)
- **Real-time menu availability** flips items live when an ingredient hits zero (or 86). Most restaurants can’t do this.

### Weaknesses

1. **No real food photography.** Emoji + gradient is clean but conversion-killing. Pizza is sold on the shot of the cornicione. **The single biggest non-engineering ROI fix is hiring a food photographer for a day.** Budget: 1 day × ~3,000–5,000 PLN. ROI: 5–15% AOV bump.
2. **Address autocomplete is commented out.** ([src/components/cart/CartDrawer.tsx:609](../../src/components/cart/CartDrawer.tsx)) Polish street addresses are typed manually → typos → failed deliveries → refunds. Wire Google Places or Mapbox.
3. **Glassmorphism on gradient hero** is a WCAG contrast risk and an a11y lawsuit waiting in EU compliance climate. Run axe-core; tune `backdrop-blur` opacity.
4. **No "X more for free delivery" callout on landing page or category page** — only inside the cart. Customers should know the threshold before they’ve added items.
5. **No social proof** — no review count, no "1,200 pizzas delivered this month," no Google rating embed. Founder narrative is good but solo.
6. **No referral CTA prominence.** Loyalty surface mentions it once, quietly. Should be a recurring nudge on order confirmation.
7. **Mobile sticky pay bar is good** — but the bundle ladder and combo banner stack vertically on mobile, pushing the cart line items below the fold. Compress.
8. **No in-app order tracking after Stripe redirect** unless the customer keeps the tab open. Add SMS-link to a tracker page (the data is there, the UI exists, the SMS isn't sent).
9. **"Pizzaiolo del mese" / scarcity** is hardcoded `LTO_UNTIL = 2026-06-30` ([src/data/menus/krakow.ts:125](../../src/data/menus/krakow.ts)). Once the operator forgets to update it, the “limited” item is fake-limited forever — and any sophisticated regular notices.

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
[src/lib/upsell.ts:414–425](../../src/lib/upsell.ts) hardcodes espresso + tiramisù + garlic bread + limonata. The scoring engine is sophisticated; the **set of candidates is not**. There should be ~12 candidate add-ons and the top 4 by composite score should surface — currently those 4 will always surface even when there’s a clearly better match (e.g., the customer’s second-most-ordered item).

### 2. No post-order upsell
The single highest-leverage upsell moment in QSR is **the 8 seconds after payment**: customer is in a buying state, friction is zero, and a single-tap "Add a 9.90 espresso to your order, we’ll prep it together" lands. Toast cites 12–18% attach on this surface. Not implemented.

### 3. Tip default is "None"
This is honorable. It is also leaving 1.5–2.5% of revenue on the table that the kitchen and drivers would directly receive. Polish tipping norms are evolving; an A/B test of 5% default vs none would resolve this in a week.

### 4. No surge / smart pricing
Friday 8pm in Kraków is going to peak. The infrastructure for differential pricing exists ([src/lib/dynamic-pricing.ts](../../src/lib/dynamic-pricing.ts) per capabilities). It is not turned on. **Don’t do per-order surge** — do *time-windowed* premium tiers (e.g., the Pizzaiolo del Mese costs 49.90 only Friday/Saturday; 39.90 weeknights). This is anchoring + scarcity, not gouging.

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
| Real-time stock decrement | ❌ | ✅ | ✅ | n/a | ✅ | ✅ | ❌ |
| Recipe-driven PARs + auto-PO | ❌ | ✅ (paid) | ⚠️ | n/a | ✅ | ✅ | ❌ |
| Driver dispatch + live ETA | Partial | ⚠️ | ❌ | ✅ | ✅ | ⚠️ | ❌ |
| Customer push notifications | ❌ (stubbed) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Real-time KDS (push, not poll) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Real food photography | ❌ | n/a | n/a | ✅ | ✅ | ✅ | ✅ |
| Cohort retention dashboards | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| CLTV / CAC tracking | ❌ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ❌ |
| Tests (engineering hygiene) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a |
| Tax / fiscal compliance (JPK_V7M) | ✅ | ⚠️ | ❌ | ⚠️ | ✅ | n/a | ❌ |
| Group ordering / wallet pooling | ✅ | ⚠️ | ❌ | ✅ | ⚠️ | ❌ | ❌ |
| Brand storytelling | ✅ | n/a | n/a | ❌ | ⚠️ | ✅ | ✅ |

**Where Sud Italia is genuinely ahead of Toast/Square/Uber:** phone-first identity, segmented delivery thresholds with copy, customer attach-history-weighted upsell scoring, Polish fiscal compliance, group wallet pooling, founder narrative authenticity.

**Where it is dangerously behind:** real food photography, push notifications, real-time KDS, recipe-driven stock and PO automation, cohort retention, CLTV/CAC, tests.

**Where it is behind in ways that don't matter yet:** route optimization, driver mobile app, predictive demand modeling, ML personalization. None of these matter under 5 trucks.

---

## 8. Scaling Readiness

| Path | Ready? | What's blocking |
|---|---|---|
| **3rd location (Wrocław)** | 70% | Hardcoded `locations.ts`; need menu file; need photographer for hero shots; supplier relationship local |
| **4th–5th location** | 30% | Lock contention starts; manual stock at 4× volume = unsustainable; one operator becomes single point of failure |
| **Franchising** | 5% | No franchise tech: no per-franchisee royalty splitting, no franchisee accounting export, no enforced brand pack, no franchisee training portal, no compliance auto-monitoring per location, no per-tenant data isolation |
| **International (e.g., Berlin)** | 5% | Hardcoded currency assumptions (grosze everywhere), Polish VAT logic, JPK XML, phone-prefix +48, all Polish-localized copy. Real i18n missing |
| **Licensing / white-label** | 10% | Branding is baked into Tailwind tokens (italia-red etc.); not theme-able. Multi-tenant data model doesn’t exist |
| **SaaS productization** | 15% | The system is well-designed for one chain. Tearing it into a SaaS for other operators is a 6–9 month rewrite |
| **Ghost kitchens** | 60% | The architecture supports it (location-as-truck abstraction); the marketing and brand operate as "trucks" not "kitchens" |
| **Enterprise / corporate ordering** | 40% | Banner + invoice cron exist; pricing model, AR ledger, contract management absent |

**Honest read:** the operator should plan for **5 trucks max under this architecture**, then a serious replatform if franchising or SaaS is the goal. Trying to skip that step will burn 12–18 months.

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
| 10 | Replace `/admin/capabilities` claims with reality: mark heuristic things heuristic, stubbed things `needs-config` | 0.5 day | Stops you fooling yourself; aligns engineering priority |

### Top 10 features elite competitors would already have

1. **Recipe-driven stock decrement on order paid** — Toast, Square, Sweetgreen all do this.
2. **PAR-driven auto-suggested PO**, one-click send to supplier email.
3. **CLTV + CAC + cohort retention dashboard** — at least new-vs-repeat split, AOV by cohort, 30/60/90-day retention.
4. **Real push notifications** (order ready, abandoned cart, tier-up, weekly usual reminder).
5. **Genuine ML demand forecast** — even an SKU-level Prophet or Anthropic-call replacement of the rolling average would land more orders correctly staffed.
6. **Hash chain on cash sessions and audit log** — tamper-evident, EU-tax-authority-pleasing.
7. **A/B experimentation framework that actually runs**, with an experiment ledger and stat-sig stopping rules.
8. **Operator mobile app** — managers running on tablets, not desktops. The admin is responsive; it isn’t mobile-first.
9. **Live driver ETA + map** (Glovo/Uber-style) for delivery customers.
10. **In-store/cashier mode** — currently the customer ordering UX *is* the staff ordering UX. Real POS has cashier-optimized 2-tap flow.

---

## 11. Immediate Fixes (next 30 days)

Pick at most six. Sequence by week.

### Week 1 — Stop the bleed
- Hash + salt the admin password. **No MFA-debate first; just stop the plaintext compare.** [src/lib/admin-auth.ts:143](../../src/lib/admin-auth.ts).
- Rotate the production admin password and document where it’s stored.
- Add basic rate-limit to ALL `/api/admin/*` routes, not just login.
- Add Sentry alerting on > 1% 5xx and on lock-acquisition failure.
- Add a manual nightly Neon backup → S3, cron-driven, with a documented restore script.

### Week 2 — Trust the dashboard again
- Audit `/admin/capabilities` and downgrade every "live" claim that is heuristic, stubbed, or partial. Add a `caveats` field. This is the single highest-leverage operator-honesty move you can make.
- Add four tests: (1) checkout idempotency, (2) slot oversell prevention, (3) refund flow, (4) RBAC location scope enforcement. Use a real test runner (Vitest). Even five tests prevents three production fires.
- Add `audit_log` retention (90d) and `webhook_events` retention (30d) jobs. Stops silent table bloat.

### Week 3 — Move the AOV needle
- Hire the photographer. Shoot 12 items + 3 lifestyle.
- Wire post-order single-tap upsell on the confirmation page.
- Wire address autocomplete.

### Week 4 — Retention
- Wire push notifications (VAPID + a single template: order ready).
- Build a `/usual` page that surfaces "Re-order this Tuesday at 7pm" for repeat customers using the existing attach-history data.
- Switch combo copy to PLN savings.

**At the end of 30 days:** admin is safe, dashboards are honest, AOV is up ~5–10%, push works, basic test coverage exists, backups exist.

---

## 12. Medium-Term Improvements (3–12 months)

### Quarter 2
- **Recipe-driven stock decrement.** Order paid → `consumeRecipe(itemId, locationSlug)` → atomic inventory decrement. The recipe model already exists; this is wiring, not invention. Unlocks honest variance reports for the first time.
- **PAR-driven PO generation.** Daily cron compares on-hand vs par; produces a draft PO per supplier; operator one-click-sends.
- **Real-time KDS via SSE** (server-sent events), with polling as fallback. Drop the 10s default to 2s while building. (`/api/admin/orders/stream` exists in capabilities; finish it.)
- **Cohort dashboard.** New-vs-repeat split, AOV by cohort month, 30/60/90-day retention. Recharts is already in deps.
- **CLTV + CAC.** With UTM-tagged links + Stripe revenue + order count, this is a SQL query, not a project.

### Quarter 3
- **Referral give-get loop** with auto-generated shareable link, tracked from sign-up through 3rd order.
- **B2B / corporate sales motion** — invoice-billed standing orders, volume tiers, dedicated CSM email.
- **A/B experimentation framework** with an experiment table, deterministic bucketing, stat-sig stopping rule.
- **Genuine demand forecast** using either Prophet (Python sidecar) or Claude with structured outputs over 90 days of order history.
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
6–12 trucks across Polish A-cities (Kraków, Warsaw, Wrocław, Poznań, Gdańsk, Łódź, Lublin), all corporate-owned. Tight brand control, premium positioning, founder remains creative director. Code base is sufficient with the Q2–Q4 medium-term work. Margin expansion via supplier consolidation + corporate B2B.

### Path B: Franchise after 5 corporate
The “Subway model” for premium Neapolitan. Requires (1) operational manuals, (2) franchisee tech: royalty splits, mandatory compliance gates, brand-pack enforcement, training portal, (3) data isolation in the tech, (4) a national kitchen-supply contract. 18-month investment.

### Path C: SaaS to other premium QSR chains
The cleanest software story in this audit. There is a real, defensible product here (phone-first identity + customer-attach-history upsell + segmented delivery + Polish fiscal compliance). Spinning it off as a SaaS is **6–9 months of multi-tenant work** and a different fundraise. Founder must decide whether they’re a restaurateur or a software-CEO.

### Path D: Acquisition by Glovo/Wolt/Bolt Food
Realistic exit in 24–36 months if the chain hits 8+ trucks. Acquirers value the proprietary customer data and the loyalty wallet more than the trucks.

### Path E: International (Berlin, Vienna, Prague)
Most expensive path. Hardcoded Polish currency, fiscal codes, and copy mean ~3 months of i18n + 3 months of local supplier and compliance discovery per geography.

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

- **Five major surfaces are theatre, not function.** Inventory, AI, suppliers, KDS SLA, push notifications. Anyone investigating this business with a real diligence checklist will find this within 2 hours and the conversation will change tone.
- **You are one phishing email away from a refund-authority breach.** Hash the password this week.
- **You have zero tests.** Refund, payment, RBAC. This isn’t hygiene; this is malpractice on a payments-handling codebase.
- **Real-time is polling.** Honestly the cheapest thing you can fix.
- **Stock doesn’t decrement on order.** The most expensive thing you’ve avoided fixing because the dashboard looks fine without it.
- **You are competing for the operator’s attention against the trucks.** This is the strongest existential risk in the audit and it has nothing to do with code.

**The business can become elite.** The path is: 30-day safety + honesty pass → 90-day AOV and retention push → 180-day operational automation → 12-month 3rd–5th truck → 24-month franchise decision. Skip the SaaS detour unless it’s funded separately.

**If you change one thing this week:** hire the photographer. Pizza is visual; you’re selling it with emoji.

**If you change one thing this month:** make `/admin/capabilities` honest. The instant you can no longer fool yourself, every priority will align.

**If you change one thing this year:** decide whether you are a restaurateur or a software-CEO and staff the other role from outside immediately. The current trajectory has you doing both badly; either done well is a real business.

The codebase is a 7.5/10. The business model is a 5/10. The operator is, on this evidence, an 8/10. Put a 5/10 operations partner alongside them and this is a 7/10 business. Don’t, and it’s a beautiful Github repo and an empty truck on a slow Tuesday.

---

## Appendix A — Prioritized Action List

Sequence (not optional; the order matters):

| # | Action | Effort | Impact | Phase |
|---|---|---|---|---|
| 1 | Hash admin passwords, rotate, add IP allowlist | 1d | Critical (security) | Week 1 |
| 2 | Add audit retention + webhook retention jobs | 0.5d | Medium | Week 1 |
| 3 | Nightly DB backup + documented restore | 0.5d | Critical (continuity) | Week 1 |
| 4 | Make `/admin/capabilities` honest | 0.5d | Critical (operator psychology) | Week 1 |
| 5 | Write 5 tests (checkout, slot, refund, RBAC, upsell) | 2d | High (regression shield) | Week 2 |
| 6 | Food photographer + ItemImage wiring | 1d + shoot | High (AOV + conversion) | Week 3 |
| 7 | Post-order upsell on confirmation | 1d | High (AOV) | Week 3 |
| 8 | Address autocomplete | 0.5d | Medium (checkout completion) | Week 3 |
| 9 | Push notifications (order ready) | 1d | Medium (retention) | Week 4 |
| 10 | "/usual" page from header for repeat customers | 2d | High (retention) | Week 4 |
| 11 | Combo copy → PLN savings | 1h | Low (AOV) | Week 4 |
| 12 | Recipe-driven stock decrement on order paid | 4d | High (ops integrity) | Month 2 |
| 13 | PAR-driven draft PO generation | 3d | High (labor save) | Month 2 |
| 14 | SSE real-time KDS | 3d | Medium (ops UX) | Month 2 |
| 15 | Cohort retention + CLTV/CAC dashboard | 2d | High (decision-making) | Month 3 |
| 16 | MFA (TOTP) on admin | 2d | High (security) | Month 3 |
| 17 | Staging environment + preview DB branch | 1d | Medium (deployment safety) | Month 3 |
| 18 | Referral give-get with shareable links | 4d | High (acquisition) | Month 4 |
| 19 | A/B experimentation framework w/ ledger | 5d | High (compounding) | Month 4 |
| 20 | B2B / corporate sales motion + AR | 7d | High (revenue) | Month 5–6 |
| 21 | Genuine demand forecast (replace MA) | 5d | Medium (staffing accuracy) | Month 6 |
| 22 | Driver dispatch + live ETA | 7d | Medium (delivery NPS) | Month 7 |
| 23 | Cashier / staff order-mode | 3d | Medium (ops speed) | Month 8 |
| 24 | Hash-chained cash sessions + audit | 3d | Medium (compliance) | Month 9 |
| 25 | Multi-tenant data isolation prep | 14d | High (if franchising) | Month 10–12 |

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
