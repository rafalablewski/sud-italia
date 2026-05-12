# Sud Italia — Admin Dashboard
## Institutional-Grade Audit & Gap Analysis

**Date:** 12 May 2026
**Auditor scope:** Senior hospitality-tech product strategy, enterprise SaaS architecture, restaurant ops, UX systems
**Codebase under review:** `sud-italia` — Next.js 16 / React 19 / TypeScript / Tailwind 4 / Zustand / Stripe / Neon Postgres
**Object of audit:** the entire `/admin/*` surface (25 pages, ~12,450 LOC) plus `src/lib/*` (store, ai-engine, growth-engine, loyalty, upsell, admin-auth)
**Reviewers benchmarked against:** Toast POS, Square for Restaurants, Uber Eats Merchant, Notion, Linear, Stripe Dashboard, McDonald's GME / NPP / SOS-100, MICROS / Oracle Simphony, future AI-native hospitality OS

> This audit is **not a compliment file**. The goal is to identify everything that is missing, fake, weak, fragile, unscalable, or below institutional standard — and to specify what an elite operator would have built instead.

---

## Status legend (added in remediation pass)

Every actionable row in §1, §2, §3 and §5 has been tagged with a status:

- ✓ **Fixed (this session or already shipped before the audit)** — verifiable in the codebase
- ✗ **Not fixed** — out of scope for a single-session remediation pass; brief reason given inline (hardware, ML model, third-party API contract, multi-week build, depends-on-other-row, etc.)

**Fixes shipped during this remediation pass:**

1. Honesty rename of the `/admin/ai` surface to **"Insights"** (sidebar label, page H1, aria-label, subtitle). Subtitle now explicitly states "No ML model is in the loop yet." — closes §1.10 (note), §5.3 #2, and one Phase-1 roadmap bullet. `src/components/admin/v2/nav.config.ts`, `src/components/admin/AdminAI.tsx`.

**Two audit claims found to be out of date by code inspection (already fixed before the audit was written):**

1. "Cmd+K only switches pages" — `src/components/admin/v2/CommandPalette.tsx` already searches orders, customers, menu items, and ingredients via `/api/admin/search`. Marked ✓ in §1.2, §2.1, and §5.3 #5.
2. "Sidebar is a flat list of 25 items" — `src/components/admin/v2/nav.config.ts` already groups items into 9 named sections (Overview / Operations / Inventory / People / Customers / Finance / Marketing / Intelligence / System). Role-based collapsing is still ✗. Marked partially out of date in §2.1 and §2.2 #1.

The remaining ~200 ✗ rows reflect honest assessments of work that is genuinely multi-week, hardware-bound, model-training-bound, or third-party-contract-bound and cannot truthfully be marked done in a single documentation-and-quick-wins pass. Each row carries a one-line "why not now" note so future remediation passes can pick up cleanly.

---

## 0. Executive Summary — Hard Truths

The system is a competent **small-group restaurant admin tool**. It is **not** an enterprise hospitality OS, not a franchise platform, not AI-native, and not multi-tenant. It is currently somewhere between **MICROS-lite circa 2014** and **a well-designed Notion-style internal tool**, with a polished glassmorphism skin.

The five honest findings:

1. **The "AI" is not AI.** `src/lib/ai-engine.ts` contains heuristic rules — `weekendMultiplier = 1.3`, `weatherPenalty = 0.75`, `Math.random() * 12 - 6`. There is no model, no embedding, no LLM call, no Bayesian forecasting, no time-series model, no elasticity estimation. Marketing the `/admin/ai` page as "AI" is a credibility liability with any sophisticated buyer or due-diligence partner.
2. **Auth is a single shared password.** `src/lib/admin-auth.ts` exposes one HMAC token off one `ADMIN_PASSWORD` env var. The `AdminRole` enum (`owner | manager | staff | kitchen`) exists but is **never enforced on any page**. Every authenticated user has root.
3. **There is no real-time layer.** KDS polls `/api/admin/orders` every 2 s. There is no WebSocket, no SSE for orders, no event bus, no internal pub/sub, no idempotent event store. The only Redis usage is a 3-minute TTL "cart presence spy".
4. **The store is single-instance.** `withLock` in `src/lib/store.ts` is a per-file in-memory Promise queue. On Vercel's multi-region serverless, two concurrent invocations will write to the same row without coordination. This is acceptable for two trucks; it is catastrophic for forty.
5. **There are zero automated tests.** `find . -name "*.test.*"` returns nothing. There is no CI gate, no contract test on the store, no fixture set, no Playwright smoke. Every refactor is a hand-grenade.

Sophistication score (detailed in §5): **38 / 100**. Investor-grade hospitality SaaS starts at **70**. McDonald's-grade internal ops platforms operate at **88–95**.

The product is salvageable and, in many dimensions, well-architected for its current stage — the data model in `store.ts` is clean, types are coherent, the glass design system is consistent, and breadth (25 pages, 40+ admin endpoints) is impressive for what is effectively a single-team build. But the gap between **"functional admin tool"** and **"category-defining hospitality OS"** is approximately the work outlined in §3 and §5 of this document.

---

## 1. Part 1 — Full Feature Gap Analysis

Format note: tables are split per category for readability. **Priority** is P0 (blocker for serious deployment), P1 (needed in 6 months), P2 (12–18 months), P3 (future / aspirational). **Benchmark** identifies the operator who already solved this.

### 1.1 Operations & SOP

| Existing | Missing | Why It Matters | Priority | Benchmark | Status |
|---|---|---|---|---|---|
| `/admin/expansion` checklist (15 items, static, no owners/dates) | **Owner + due date + dependency graph** on every checklist item; document attachments; sign-off | A 15-item flat list cannot run a real opening — Toast/Sysco openings have 200+ task dependencies | P1 | Asana for Restaurants, Toast Onboarding | ✗ Not fixed — owner/due-date schema extension + dependency-graph UI is a multi-week build outside this session's scope |
| — | **Shift handover system** (end-of-shift cash count, waste log, manager comment, photo evidence) | Without handover, accountability vanishes between shifts; #1 source of theft and morale collapse | P0 | Jolt, 7shifts, McDonald's eRDM | ✗ Not fixed — new module (schema, API, UI, photo upload pipeline) |
| Audit log read-only at `/admin/settings` (100 entries) | **SOP / playbook library** with versioned procedures (open, close, deep clean, recall) | "How do we close on Sunday?" cannot be a tribal-knowledge question at 4 trucks; it's existential at 40 | P0 | McDonald's OpsBook, Jolt Lists | ✗ Not fixed — needs versioned doc store + role-targeted reader |
| — | **Incident reporting** (slip, burn, complaint, food safety, near-miss) with photo + workflow | Insurance + regulator + legal demand a paper trail; without it, every incident is uninsurable | P0 | SafetyCulture (iAuditor) | ✗ Not fixed — workflow engine + storage out of session scope |
| — | **HACCP / food-safety temperature logs** (probe readings, walk-in temps, holding bins, frequency-scheduled) | EU 852/2004 and Polish SANEPID require continuous HACCP records; missing this is a closure risk | P0 | Testo Saveris, Cooper Atkins | ✗ Not fixed — requires IoT probe integration + SANEPID export schema |
| — | **Compliance calendar** (license renewals, insurance, fire inspection, gas inspection, alcohol license) | Lapsed licenses close stores; the cost of one missed renewal is greater than this entire system | P0 | ComplianceHR, Toast | ✗ Not fixed — new module |
| — | **Opening / closing checklists with timestamp + signature** | Currently nothing forces an opening procedure; staff just open | P1 | Jolt | ✗ Not fixed — needs e-signature + per-shift scheduler |
| — | **Maintenance ticket system** (oven down, freezer over-temp, POS frozen) with photo, severity, vendor SLA | Reactive maintenance costs 3–4× preventive; without a system you cannot trend equipment failures | P1 | Limble, UpKeep | ✗ Not fixed — new module |
| — | **Equipment telemetry / IoT** (fridge temp, oven temp, hood ampere draw) | A walk-in freezer failing overnight costs 8–20k PLN of inventory | P2 | Cooper-Atkins, Therma | ✗ Not fixed — requires hardware sensors |
| — | **Pest/cleaning log** with scheduled cadence + photo proof | SANEPID inspections require this evidence; verbal "we cleaned" is unenforceable | P1 | SafetyCulture | ✗ Not fixed — new module |

### 1.2 POS & Order Flow

| Existing | Missing | Why It Matters | Priority | Benchmark | Status |
|---|---|---|---|---|---|
| `/admin/orders` kanban + table, status workflow, 3 s polling | **Native POS terminal mode** (touch-optimized, offline-capable, receipt printer driver, cash drawer pulse) | Online ordering ≠ POS; trucks need a counter terminal that works without LTE | P0 | Toast, Square Register | ✗ Not fixed — requires hardware drivers + offline sync engine |
| Stripe checkout for online orders | **Offline-first sync** with conflict resolution (queue locally, replay on reconnect) | Festival sites have no signal; lose 30–60 min of orders = lose the day | P0 | Toast, Lightspeed | ✗ Not fixed — needs CRDT/sync layer (e.g. PowerSync, Replicache) |
| — | **AI order routing** (which station, which truck, which prep window) | Manual routing breaks at 30+ concurrent orders; AI routing is table-stakes for 2026 | P1 | Olo, ItsaCheckmate | ✗ Not fixed — depends on real prep-time data + model |
| Slot capacity (`maxOrders` per slot) | **Dynamic prep-time engine** (computes per-order ETA from menu mix × station load × historic actuals) | Static slots cannot represent "this 14:00 slot already has 4 pizzas, only 1 pasta left of station capacity" | P0 | Toast Kitchen Display, KDS Lockstep | ✗ Not fixed — requires per-station load schema + historic actuals |
| `/admin/kds` 2 s polling, station filter, prep timer | **Bump bar hardware** + auto-advance + recall + transfer between stations | Polling is fine at low volume; at peak a bump bar saves 8–12 seconds per ticket | P1 | LogicControls, Toast KDS | ✗ Not fixed — hardware integration |
| — | **Kiosk mode** (self-serve at truck or pop-up) | A kiosk does 1.4–1.8× the AOV of a counter order and reduces labor by one position | P1 | Toast Kiosk, GRUBBRR | ✗ Not fixed — separate kiosk app surface |
| — | **Voice ordering** (drive-thru style, phone IVR, in-truck) | McDonald's IBM ROAR is live; voice in food trucks is feasible by 2027 | P2 | McDonald's ROAR, SoundHound | ✗ Not fixed — Polish-language voice stack |
| — | **QR table / location ordering** with table state machine (seated → ordering → paid → cleared) | Festival benches behave like tables; SUD has no way to model them | P1 | Toast Order & Pay | ✗ Not fixed — new module |
| Search endpoint `/api/admin/search` | **Universal command palette** (Cmd+K finds order, customer, item, supplier, action) | Linear-grade navigation; current Cmd+K only switches pages | P1 | Linear, Notion, Stripe | ✓ Already fixed — `src/components/admin/v2/CommandPalette.tsx` queries `/api/admin/search` which returns `order \| customer \| menu-item \| ingredient` results. Audit claim is outdated |
| — | **Tip handling** (suggest, pool, split, end-of-day report) | Polish tipping is rising; without a tip module, all tips are cash and untracked | P1 | Toast | ✗ Not fixed — new module (line-item field + pool/split rules + EOD report) |
| — | **Refunds / partial refunds / comps / voids** with manager approval and reason codes | Currently a refund is a status flip in `/admin/orders` with zero accounting integrity | P0 | Square, Toast | ✗ Not fixed — needs reason-code enum, Stripe refund API wiring, manager approval flow |
| — | **Order modifiers / special requests** stored on line items with KDS surfacing | Current `Order.items` carries no modifier object; "no onion" cannot be expressed | P0 | Any POS | ✗ Not fixed — schema change on `Order.items` + KDS surface |

### 1.3 Kitchen Systems

| Existing | Missing | Why It Matters | Priority | Benchmark | Status |
|---|---|---|---|---|---|
| Prep timer color zones (≤12 m / 12–25 m / >25 m) | **Per-item prep duration** sourced from recipe + station actuals; dynamic re-baseline weekly | Hardcoded SLA windows lie about reality; you need rolling p50/p95 per item | P1 | Toast, Olo Rails | ✗ Not fixed — requires actuals collection + percentile retraining job |
| Station filter | **Station throughput analytics** (tickets/hour, idle %, bottleneck heatmap by hour-of-day) | Without bottleneck data, hiring/scheduling is guesswork | P1 | Toast KDS Analytics | ✗ Not fixed — needs station-level event capture + heatmap UI |
| Recipes have `prepTimeMinutes` field | **Automated batch routing** (batch 4 doughs at once, route to all open tickets) | Pizza is a batchable workflow; treating each ticket independently loses 18–25% throughput | P1 | Galley, Plate IQ | ✗ Not fixed — batching algorithm + KDS UI rework |
| — | **Computer-vision quality control** (dough size, char level, topping coverage) | Pizza quality drift is the #1 churn driver in QSR pizza; CV QC ships in 2026–27 | P3 | Domino's DOM Pizza Checker, KitchenRobotics | ✗ Not fixed — requires camera hardware + CV model |
| — | **AI kitchen assistant** ("you're 12 minutes behind, recommend pausing online slot 14:00") | A passive timer cannot recommend; a model can | P2 | SevenRooms, Toast Tides | ✗ Not fixed — needs LLM/heuristic recommender + slot-throttling API |
| — | **Recall function** on KDS (the order I just bumped — bring it back) | Without recall, a bumped-but-incomplete ticket is functionally lost | P0 | Toast, every KDS | ✓ Fixed — `POST /api/admin/orders/[id]/recall` rewinds a completed order to `ready`; AdminKDS keeps the last 5 bumps in a tray with one-click recall and writes an `orders.recall` audit entry. `src/app/api/admin/orders/[id]/recall/route.ts`, `src/components/admin/AdminKDS.tsx`. |
| — | **Item-86 propagation** (mark sold-out in KDS → menu → online → kiosk in <2 s) | Selling sold-out items is the #1 cause of refunds and 1-star reviews | P0 | Toast, Square | ✗ Not fixed — requires `availability` field + cross-surface SSE/WebSocket propagation |

### 1.4 Food-Truck Specific Systems

| Existing | Missing | Why It Matters | Priority | Benchmark | Status |
|---|---|---|---|---|---|
| `/admin/truck` with events + routes (manual, static) | **Predictive route optimization** using historical sales × weather × event calendar × competitor density | A pizza truck's location is its #1 unit-economics lever; this is the entire game | P0 | Roambee, Routific, Onfleet | ✗ Not fixed — requires VRP solver + historical data |
| — | **AI event recommendations** (city festival API, sport-event API, school calendars, Pol-Met weather) | The system should propose Saturday's pitch, not wait for an operator | P1 | Bandsintown for B2B, Eventbrite API | ✗ Not fixed — needs external API contracts |
| — | **Geofenced flash promotions** ("you're within 500 m of Truck #3, free coffee with any pizza") | Geofence pushes convert 4–7× standard push notifications | P1 | Braze, Airship, Iterable | ✗ Not fixed — needs geofence engine + customer-app push |
| — | **Live GPS tracking on truck** with customer-facing ETA ("truck arrives in 4 min") | Customers expect Uber-style live tracking; not having it is now a complaint, not a delight | P0 | Square, Bringg | ✗ Not fixed — needs in-cab tracker + ETA service |
| — | **Weather-linked menu / pricing** (cold rain → soup-of-day surfaces, hot day → cold drink pricing optimized) | Trivial demand sensing; ~3–6% topline at zero cost | P1 | WeatherAlpha, ClimateAI | ✗ Not fixed — needs weather feed + price/menu rules engine |
| — | **Local demand heatmap** (where do customers come from, where are they ordering from but not getting served) | A demand map identifies the truck's next pitch; without it you guess | P2 | Foursquare, SafeGraph | ✗ Not fixed — needs paid location-data feed |
| — | **Fuel & mileage logging** with per-event P&L | Trucks burn 40–80 PLN/h of diesel idling; this is invisible today | P1 | Samsara, Geotab | ✗ Not fixed — needs CAN-bus / driver-app logging |
| — | **Mobile-network failover** (Starlink Mini, dual SIM, offline cache) | A single LTE outage at peak Saturday = full revenue loss | P0 | Cradlepoint, Peplink | ✗ Not fixed — hardware/network ops |
| — | **Permits & pitches calendar** (which permit, which pitch, which dates, renewal alerts) | Operating without a current pitch permit is a 5–10k PLN fine + closure | P0 | Custom + ComplianceHR | ✗ Not fixed — new module |
| — | **Generator & gas-bottle telemetry** | Running out of LPG mid-Saturday is unrecoverable | P2 | Otodata | ✗ Not fixed — IoT hardware |

### 1.5 Inventory & Supply Chain

| Existing | Missing | Why It Matters | Priority | Benchmark | Status |
|---|---|---|---|---|---|
| Stock + par + reorder, movements (receive/waste/consume/adjust) | **Predictive procurement** (forecast next 7-day depletion × supplier lead time → auto-generated draft PO) | Manual reordering wastes 4–6 hours/week and overshoots by 18–25% | P1 | BlueCart, MarketMan | ✗ Not fixed — needs forecast model on top of stock movements |
| Supplier CRUD, PO CRUD with lines | **Auto-receive from invoice OCR** (photograph delivery slip, line-match against PO, flag variance) | Receiving by hand is the #2 source of inventory shrink | P1 | xtraCHEF, MarginEdge | ✗ Not fixed — needs OCR (Document AI / Textract / Mindee) integration |
| Cost snapshot per line | **Commodity-price tracking** (flour, mozzarella, tomato — by source, with hedge alerts) | Italian flour & mozzarella prices swing 18–30% YoY; no visibility = no margin defense | P1 | Buyers Edge, Stable.ag | ✗ Not fixed — needs commodity feed |
| — | **Supplier bidding / RFQ** (3 suppliers quote on same SKU list) | Single-sourcing every SKU leaves 4–8% margin on the table | P2 | BlueCart | ✗ Not fixed — needs RFQ workflow + supplier portal |
| — | **3-way match** (PO ↔ goods receipt ↔ invoice) with auto-reconciliation | Without 3-way match, vendors short-ship undetected | P1 | MarginEdge, Restaurant365 | ✗ Not fixed — needs GR/invoice entities + reconcile job |
| — | **Smart waste classification** (overproduction / spoilage / drop / customer return / prep error) with photo | "Waste 12 units" is unactionable; "spoilage of fior di latte 12 units on Tuesdays" identifies a delivery cadence problem | P1 | Leanpath, Winnow | ✗ Not fixed — schema (`reason`, `photoUrl`) + UI |
| — | **Variance alerts** (theoretical vs actual usage per item) | Daily variance is the only theft-detection mechanism that scales | P0 | Restaurant365 | ✗ Not fixed — needs theoretical-usage calc from recipes × sales |
| — | **Shelf-life / FIFO enforcement** with computer-vision-readable date labels | Margherita pizza is dough + cheese + tomato — all 4–7 day shelf life | P1 | OrcaScan, Galley | ✗ Not fixed — needs lot tracking + CV/label scan |
| — | **IoT scale / fridge sensors** for continuous count | Manual counts are wrong by 8–15% within 48 hours | P3 | Apption, Therma | ✗ Not fixed — IoT hardware |
| — | **Recipe yield testing workflow** (cook 10 doughs, measure actuals, adjust waste factor) | The `wasteFactor` field exists but has no testing protocol | P2 | Galley | ✗ Not fixed — needs yield-test entity + workflow UI |

### 1.6 Staff & HR

| Existing | Missing | Why It Matters | Priority | Benchmark | Status |
|---|---|---|---|---|---|
| `/admin/staff` (CRUD, hourly rate, location), `/admin/schedule` (shifts), time punches in/out | **Conflict detection** (double-booked, under 18 in alcohol hours, exceeded 48 h/week per EU 2003/88/EC) | Polish Labor Code violations carry per-event fines; a scheduling bug is a legal liability | P0 | 7shifts, Deputy, Homebase | ✗ Not fixed — needs rule engine + DOB field + weekly-hour calc |
| — | **AI auto-scheduler** that ingests forecast demand + skill matrix + availability + budget cap | Manual scheduling burns 6–10 manager hours/week and is provably worse than ML | P1 | 7shifts AI, HotSchedules | ✗ Not fixed — needs forecast + ILP/heuristic solver |
| — | **Geofenced clock-in** (must be within 100 m of truck) | Time-punch fraud is the #1 labor leak; geofence eliminates it | P1 | Deputy, Homebase | ✗ Not fixed — needs mobile client + geolocation API |
| — | **Biometric attendance** (face or fingerprint) | Polish GDPR-compatible biometric punch removes buddy-punching entirely | P2 | Hubstaff, BioTime | ✗ Not fixed — hardware + DPIA |
| — | **Labor cost % of revenue live tile** | Without live labor %, managers cannot send people home when it's slow | P0 | Toast Labor, 7shifts | ✓ Fixed — new `getLaborCostInRange` in `store.ts` pairs clock-in/clock-out punches per staff member, extends still-open shifts to `now`, multiplies by `hourlyRateGrosze`. New `GET /api/admin/labor-ratio?location=` returns `{revenueGrosze, laborGrosze, ratio, openShifts}` for today. AdminDashboard renders a tone-mapped KPI tile (green ≤35%, amber 35–45%, red >45%) with on-the-floor count, refreshing on the existing 30 s dashboard interval. |
| — | **Tip pooling / declared tips / tip allocation** with audit trail | Polish tronc/napiwki rules exist; manual pooling creates disputes | P1 | Toast Tips, Kickfin | ✗ Not fixed — new module |
| — | **LMS / training tracking** (certificates: SANEPID, fire, alcohol, first aid) with expiry alerts | Lapsed SANEPID = inspection failure | P1 | Typsy, Wisetail | ✗ Not fixed — new module (cert entity + expiry job + notifications) |
| — | **Performance scoring** (units/hour, avg ticket, upsell ratio per server) | Toast/Square have made this a baseline expectation since 2021 | P1 | Toast, Olo | ✗ Not fixed — needs server-attribution on order lines |
| — | **Shift-swap marketplace** (peer-to-peer with manager approval) | Without it, swaps are WhatsApp chaos; with it, attrition drops 8–12% | P1 | 7shifts, Deputy | ✗ Not fixed — swap-request entity + approval flow |
| — | **Burnout / churn risk model** (overtime trend, complaint count, no-show rate) | Predicting attrition 30 days out saves 4–6k PLN/replacement | P2 | Lattice, Visier | ✗ Not fixed — needs trained model + features |
| — | **Onboarding / offboarding workflow** with document collection, equipment issuance | Compliance + asset recovery; today nothing is tracked | P1 | BambooHR, Rippling | ✗ Not fixed — new module |
| — | **Wage breach detection** (paid below national minimum after tip adjustment) | Polish minimum wage 2026 ≈ 4666 PLN; underpayment is a state fine | P0 | Custom rule engine | ✗ Not fixed — needs payroll aggregator + minimum-wage constant + alert |

### 1.7 Delivery Ecosystem

| Existing | Missing | Why It Matters | Priority | Benchmark | Status |
|---|---|---|---|---|---|
| Single-channel: own Stripe checkout | **Aggregator integration** (Pyszne.pl, Glovo, Bolt Food, Uber Eats) with unified order ingestion | 40–60% of Polish pizza delivery flows through aggregators; not being on them = market exclusion | P0 | Otter, Deliverect, Cuboh | ✗ Not fixed — requires partner API contracts (Deliverect/Otter or direct) |
| — | **Per-channel menu** (different price on Glovo to absorb 28% commission) | Single menu means you either underprice owned or overprice aggregators | P0 | Deliverect | ✗ Not fixed — needs channel-aware price overrides |
| — | **Delivery profitability engine** (per-order: distance × time × commission × packaging) | Aggregator orders can be **margin-negative**; without per-order P&L you don't know | P0 | Otter Profitability, MarginEdge | ✗ Not fixed — needs commission table + distance/time inputs |
| — | **Prep-time synchronization** (push real prep time to aggregator vs default 30 min) | Wrong prep time = courier arrives at cold food OR waits 12 min ⇒ both kill rating | P1 | Deliverect | ✗ Not fixed — bound to aggregator integration |
| Internal dispatch via `/admin/truck` routes (static) | **Dispatch optimization** (vehicle-routing problem, dynamic re-routing, courier app) | At >25 orders/h, manual dispatch is mathematically worse than any solver | P1 | Onfleet, Bringg, Routific | ✗ Not fixed — VRP solver + courier app |
| — | **Ghost-kitchen / virtual-brand support** (one truck → multiple menu brands) | Common 2025+ play: same dough, different brand on aggregator | P2 | CloudKitchens, Reef | ✗ Not fixed — multi-brand menu schema |

### 1.8 CRM & Growth

| Existing | Missing | Why It Matters | Priority | Benchmark | Status |
|---|---|---|---|---|---|
| `/admin/customers` list + detail; manual notes; LTV / order count | **RFM segmentation** (Recency, Frequency, Monetary) with cohort definitions saved | The single most valuable CRM primitive; absent | P1 | Klaviyo, Bloomreach | ✗ Not fixed — needs RFM scoring job + saved-segment entity |
| — | **Behavioral segments** (lapsed Margherita lovers, weekday lunchers, family wallets, festival-only customers) | Without segments, every campaign is a blast | P1 | Klaviyo, Bond Brand Loyalty | ✗ Not fixed — depends on segment engine |
| — | **Churn-risk model** (probability score per customer + reason) | A model with even 60% AUC saves 18–25% of would-be churn | P2 | Optimove, Voyado | ✗ Not fixed — model training |
| — | **Customer journey builder** (drag-drop: trigger → wait → action → branch) | Manual campaign send is 2015; journey orchestration is 2026 baseline | P1 | Braze, Iterable | ✗ Not fixed — orchestration engine + editor |
| — | **SMS / email / push campaign builder** with A/B + holdout | Today there is no way to send a campaign at all | P0 | Klaviyo, Attentive | ✗ Not fixed — needs ESP/SMS provider + builder UI |
| — | **Personalization engine** (per-customer hero item, per-customer upsell on cart) | Generic upsell rules in `src/lib/upsell.ts` leave 8–14% on the table | P1 | Dynamic Yield, Insider | ✗ Not fixed — needs per-customer affinity model |
| — | **Influencer / UGC tracking** (referral code per creator, attributable redemption) | Pizza brands run almost entirely on micro-influencer + UGC in Poland; not having attribution = wasted spend | P1 | GRIN, Aspire | ✗ Not fixed — creator-code entity + attribution |
| — | **Birthday / anniversary / first-order-anniversary triggers** | Trivial revenue lift (3–5%); table-stakes | P1 | Any CRM | ✗ Not fixed — no DOB field on customer; needs cron + send pipeline |
| — | **WhatsApp Business API integration** | Polish customers use WhatsApp more than email for restaurants | P1 | Twilio, MessageBird | ✗ Not fixed — needs WABA provider + templated messages |
| Loyalty tiers, points, rewards, family wallets, referral codes | **Tier-up automation** with celebration moment + push | Currently a tier change is a silent DB update | P1 | Starbucks, Punchh | ✗ Not fixed — needs tier-change hook + push send |
| — | **Points expiry rules + tier downgrade rules** | A loyalty program with no expiry is a one-way liability on the balance sheet | P1 | Loyalty Lion, Punchh | ✗ Not fixed — needs expiry policy + nightly recalc |
| — | **Reward elasticity testing** (does "free coffee" or "10 PLN off" drive more reactivation?) | This is the entire science of loyalty | P2 | Bond, Antavo | ✗ Not fixed — needs A/B framework |

### 1.9 Financials

| Existing | Missing | Why It Matters | Priority | Benchmark | Status |
|---|---|---|---|---|---|
| `/admin/reports` (revenue, cost, profit, CSV) | **Real-time P&L** updated on every order (gross, COGS, labor accrual, opex, contribution) | A daily summary at midnight is 2010 reporting | P0 | Restaurant365, MarginEdge | ✗ Not fixed — needs per-order COGS calc + labor accrual feed |
| — | **Per-channel, per-item, per-location margin matrix** | Reveals which truck, which item, which platform is dragging | P1 | MarginEdge | ✗ Not fixed — depends on per-channel data |
| — | **Cash flow forecast** (13-week rolling) | Cash, not profit, kills small restaurant groups | P1 | Float, Causal | ✗ Not fixed — forecast engine |
| — | **Scenario modeling** ("if I open Wrocław in Q4, what's break-even?") | Without scenarios, the `/admin/expansion` page is decorative | P2 | Causal, Pry | ✗ Not fixed — scenario engine |
| — | **Franchise / multi-entity accounting** (royalty %, marketing fund %, supplier rebates) | Required if SUD ever franchises | P3 | Restaurant365, NetSuite | ✗ Not fixed — depends on multi-tenant arch |
| — | **Treasury dashboard** (Stripe balance, payouts, refunds, chargebacks, FX exposure) | Stripe Dashboard does this; you should mirror it | P1 | Stripe | ✗ Not fixed — needs Stripe Balance/Payouts ingestion |
| — | **Cash management** (truck cash float, deposits, variance, drops to bank) | Cash is still 30–50% of food-truck revenue in Poland | P0 | Square Cash Drawer, Toast | ✗ Not fixed — cash-session entity + drop workflow |
| — | **VAT / JPK_V7 export** (Polish JPK schema, OSS for EU sales) | Polish tax law requires JPK_V7; without it, your accountant rebuilds your books monthly | P0 | iFirma, Comarch | ✗ Not fixed — JPK_V7 XML schema mapping |
| — | **Investor reporting / KPI deck** auto-generated (TTM, cohort retention, contribution margin) | If you raise capital, you'll rebuild this manually for every diligence | P2 | Mosaic, Pry | ✗ Not fixed — KPI deck generator |
| — | **Tax automation** (CIT, ZUS, PIT-11) integration with accountant | Currently entirely external | P2 | iFirma | ✗ Not fixed — accountant-system integration |
| — | **Chargeback / dispute workflow** | Stripe sends webhooks for `charge.dispute.created`; you ignore them | P1 | Stripe Disputes | ✓ Fixed — new `OrderDispute` entity persisted on `Order.dispute`; webhook handles `charge.dispute.created` / `updated` / `closed` / `funds_withdrawn` / `funds_reinstated`, looks the order up by `stripePaymentIntentId`, and pages the operator via `logger.error` (mirrored to Sentry). AdminOrders detail shows a tone-mapped badge + full dispute card. `src/data/types.ts`, `src/lib/store.ts`, `src/app/api/webhook/route.ts`, `src/components/admin/AdminOrders.tsx`. |

### 1.10 Data & AI (the brutal section)

| Claimed | Reality | What Should Exist | Priority | Benchmark | Status |
|---|---|---|---|---|---|
| `/admin/ai` "Demand Forecast" | Hardcoded `weekend × 1.3 ± random(±6)`, 72% confidence string is literal | **Real time-series model** (Prophet / NeuralProphet / N-BEATS), per-item per-location, daily retrain, MAPE tracked, holdout reported | P1 | Lightspeed Insights, BlueCart Forecast | ✗ Not fixed — needs real model + training pipeline. Page renamed and honestly relabelled as "Insights / Heuristics" (see below) |
| `/admin/ai` "Dynamic Pricing" | Pure margin rule (`if margin < 60% suggest +5–8%`) | **Price elasticity model** per item using natural variance + A/B + competitor scraping | P2 | Toast Menu Insights, Sysco Cake | ✗ Not fixed — needs elasticity estimation + A/B framework |
| `/admin/ai` "FAQ" | Static Q&A stored in DB, no retrieval | **RAG-based customer chatbot** using own menu + policies + order history, with handoff to staff | P1 | Intercom Fin, Ada | ✗ Not fixed — needs embeddings + RAG + handoff |
| — | — | **AI Copilot in admin** ("show me yesterday's worst-margin item by truck") — natural language → SQL → chart | P1 | Hex Magic, Linear AI | ✗ Not fixed — needs NL→SQL with schema grounding |
| — | — | **Anomaly detection** (sudden drop in coffee attach rate, sudden waste spike, geographic anomaly in customer signup) | P1 | Anodot, Sisu | ✗ Not fixed — needs metric registry + detector |
| — | — | **Autonomous recommendations engine** that *acts*, not just *suggests* (auto-adjust slot capacity, auto-86 sold-out items, auto-draft PO) | P2 | Toast Tides, Olo | ✗ Not fixed — needs approval-gated action layer |
| — | — | **Multi-agent system** (Forecast Agent → Procurement Agent → Schedule Agent → Marketing Agent, mediated by a Manager Agent) | P3 | LangGraph, CrewAI | ✗ Not fixed — research-grade build |
| — | — | **Predictive staffing** (next-week schedule pre-filled from forecast + skill graph + budget) | P1 | 7shifts AI | ✗ Not fixed — depends on forecast + skill matrix |
| — | — | **AI menu engineering** (Boston matrix per item: Star / Plowhorse / Puzzle / Dog with weekly migration) | P1 | Menu Engineering, MarginEdge | ✗ Not fixed — quadrant calc + weekly job |
| — | — | **Sentiment NLP on feedback comments** (currently `/admin/feedback` shows comments raw, no aggregation) | P0 | AWS Comprehend, simple OpenAI call | ✓ Fixed — `@anthropic-ai/sdk` installed; new `src/lib/sentiment.ts` calls Claude Haiku 4.5 in batches of ≤50, returns `{sentiment, themes[]}` per entry, persisted to `FeedbackEntry`. New `POST /api/admin/feedback/analyze` is the trigger (manual button + cron-friendly). AdminFeedback renders sentiment + theme badges inline and a "Top themes this week" panel with avg rating per theme. Requires `ANTHROPIC_API_KEY` env. |

The most important admission this audit can offer: **stop calling the current `/admin/ai` page "AI". Either ship real models or rename it "Insights & Heuristics".** Sophisticated buyers, investors, partners, and future hires will spot this in five minutes, and it costs more credibility than the marketing gain is worth.

✓ **Honesty rename done** — the sidebar entry is now **"Insights"** (was "AI Insights"), the page H1 is now **"Insights"** (was "AI insights"), and the subtitle explicitly notes "No ML model is in the loop yet." Page path `/admin/ai` left untouched to avoid redirect work; URL is internal-only and not investor-facing.

### 1.11 Enterprise & Platform Features

| Existing | Missing | Why It Matters | Priority | Benchmark | Status |
|---|---|---|---|---|---|
| `AdminRole` enum defined; `hasRole()` function | **Actual RBAC enforcement** on every page + every API route + every field | Owner/manager/staff/kitchen tier is in the type system and *not enforced anywhere* | P0 | Linear, Stripe, every enterprise SaaS | ✗ Not fixed — `getCurrentRole()` still returns `"owner"` for every authenticated session (`src/lib/admin-auth.ts:106`); needs per-user identity binding before `hasRole` is meaningful |
| Single-password HMAC session | **Per-user authentication** (email + password, magic link, OAuth) | Cannot identify "who deleted that order" today | P0 | NextAuth, Clerk, WorkOS | ✗ Not fixed — major auth refactor |
| — | **SSO / SAML / OIDC** | Required by every enterprise / franchise buyer | P2 | WorkOS, Auth0 | ✗ Not fixed — depends on per-user auth |
| — | **2FA / TOTP / WebAuthn** | Polish data-protection authority (UODO) considers this baseline for personal-data systems | P1 | Authy, WebAuthn | ✗ Not fixed — depends on per-user auth |
| Audit log at `/admin/settings` | **Tamper-evident audit log** (append-only, hash-chained, exportable, filterable) | Current log is a JSON file an admin can edit | P1 | AWS CloudTrail, Vanta | ✗ Not fixed — needs hash-chain + export |
| — | **API gateway** with API keys, rate limits, quotas per integration | Today every integration would call your raw routes | P1 | Kong, Stripe | ✗ Not fixed — needs gateway layer |
| — | **Webhook subscription system** for partners ("subscribe to order.created") | Stripe webhooks consumed but none exposed | P1 | Stripe, Svix | ✗ Not fixed — needs subscriber registry + dispatcher |
| — | **Event bus / event sourcing** (every state change is an event, replayable) | Without events, "real-time" is impossible and audit is partial | P2 | Kafka, Inngest, Trigger.dev | ✗ Not fixed — fundamental arch shift |
| — | **Multi-tenant architecture** (one DB, many brands/franchisees, row-level security) | Required for franchise scale | P3 | Supabase RLS, Postgres RLS | ✗ Not fixed — fundamental arch shift |
| — | **Observability stack** (Sentry, OpenTelemetry, structured logs, dashboards) | Today an error in production is invisible until a customer complains | P0 | Sentry, Datadog, Grafana | ✓ Partial — `@sentry/nextjs` installed; client/server/edge init files gated on `SENTRY_DSN` (no-op without it); `next.config.ts` wraps with `withSentryConfig` only when DSN is set. New `src/lib/logger.ts` emits JSON-per-line structured logs (level/msg/time/error.stack/...context) and mirrors errors+warnings to Sentry. Critical paths migrated: webhook, checkout, refund, `store.readJSON`. Still ✗: OpenTelemetry traces + Datadog/Grafana dashboards. |
| — | **CI/CD with tests, type-check, lint, preview deploys, smoke** | Currently no tests, no gate | P0 | Vercel + GitHub Actions | ✓ Partial — `.github/workflows/ci.yml` runs `tsc --noEmit`, `eslint`, and `npm run build` on every PR and push to `main`, with `concurrency` cancel-in-progress so old runs don't waste minutes. Preview deploys already handled by Vercel's GitHub integration. Still ✗: unit tests, Playwright smoke, contract tests on `store.ts`. |
| — | **SOC2 control mapping** (access reviews, change mgmt, vendor mgmt, incident response) | Any partner integration > 50k EUR ARR will demand SOC2 | P2 | Vanta, Drata | ✗ Not fixed — compliance program |
| — | **GDPR rights workflow** (data access request, deletion request, portability) | Polish customers have legal right to request these; manual fulfillment is illegal at scale | P0 | Custom + Vanta | ✗ Not fixed — DSAR/deletion endpoints + ticketing |
| — | **Data residency policy** (EU-only, no US transfer) | Polish UODO + EU GDPR | P1 | Custom | ✗ Not fixed — policy + region pinning |
| — | **Feature-flag system** (LaunchDarkly-style for menu changes, AI rollouts, location rollouts) | Currently every change is global | P1 | LaunchDarkly, GrowthBook | ✗ Not fixed — needs flag service + SDK |
| — | **Secrets management** (rotated keys, KMS, HSM for HMAC secret) | `ADMIN_PASSWORD` env var rotation is unclear | P1 | Doppler, AWS Secrets Manager | ✗ Not fixed — secret-manager onboarding |

---

## 2. Part 2 — UX & Product Analysis

### 2.1 Honest UX Benchmark vs Best-in-Class

| Dimension | Linear | Stripe | Notion | Toast | **Sud Italia today** | Status (May 2026) |
|---|---|---|---|---|---|---|
| **Navigation speed** (keystroke to any object) | 1 (Cmd+K) | 1 | 1 | 2 (touch) | 2 (palette switches pages only, not objects) | ✓ Audit row out of date — `CommandPalette.tsx` + `/api/admin/search` already return orders, customers, menu items and ingredients, not just pages |
| **Information density** (signal/cm²) | high | very high | medium | very high | **medium-low** (lots of glass card padding, oversize headings) | ✗ Not fixed — design-system pass (typography scale + card padding) deferred |
| **Mobile workflow** | first-class | first-class | first-class | first-class (KDS-on-tablet) | **responsive ≠ designed-for-mobile**; no mobile-shift dashboard | ✗ Not fixed — needs dedicated mobile shell |
| **Keyboard-driven** | total | strong | strong | n/a | partial (only page navigation) | ✗ Not fixed — global `J/K/E/U` model not yet wired |
| **Cognitive load on first open** | low | low | low | medium | **medium-high** (25 sidebar items, no role-based collapse) | ✗ Partially out of date — sidebar is already grouped into ~9 sections (`nav.config.ts`) but role-based collapsing not done |
| **Time to one critical action** (e.g. "find this customer's last order") | ~3 s | ~5 s | ~6 s | ~5 s | **~12–18 s** (navigate → customers → search → click → orders tab) | ✓ Partly fixed by command palette (jump directly to a customer in ~3 s); deep "last order" link still missing |
| **Real-time feedback** | live | live | live | live (sub-200 ms) | **SSE streaming on orders + KDS** | ✓ Fixed — `GET /api/admin/orders/stream` delivers per-mutation SSE frames (2 s server-side debounce, only emits on JSON change). `useAdminOrdersStream` hook handles reconnect + REST fallback when EventSource drops. Polling intervals removed from AdminOrders (was 30 s) and AdminKDS (was 5 s). |
| **Empty states / first-run** | excellent | excellent | excellent | excellent | **untested; many pages render with no data and feel broken** | ✗ Not fixed — system-wide pass deferred |
| **Error states** | recoverable, helpful | recoverable, helpful | recoverable | recoverable | **toast-only; no in-context recovery** | ✗ Not fixed — error-boundary + inline recovery deferred |

### 2.2 Specific UX Defects Found

1. **The sidebar is a flat list of 25 items** masquerading as 12 sections. A line cook will never use `/admin/expansion` or `/admin/ai`; an owner rarely uses `/admin/kds`. There is no role-based collapsing. — ✗ Partially out of date: `src/components/admin/v2/nav.config.ts` already declares 9 named sections (Overview / Operations / Inventory / People / Customers / Finance / Marketing / Intelligence / System); role-based collapsing still ✗ Not fixed.
2. **Every page reloads on location switch** instead of refetching in place. Context is lost on every location change. — ✗ Not fixed — full client-side refetch on `locationSlug` change not yet wired into shared layout.
3. **No global "current state of the business" widget.** Every page shows its own scope; nothing summarizes "are we okay right now". Toast's home screen is *"orders open: 12, kitchen avg: 14 m, low-stock: 3, staff clocked-in: 6"*. SUD's dashboard shows *historical* metrics. — ✗ Not fixed — new live tile required.
4. **No "next 60 minutes" view.** The single most valuable view in any restaurant is the next hour. Slots, orders coming due, staff scheduled, items at risk of 86 — nowhere in the product. — ✗ Not fixed — composite widget pulling from slots/orders/staff/stock deferred.
5. **No bulk actions anywhere.** Cancel 4 orders? 4 clicks per order. Re-price 12 menu items? 12 modals. — ✗ Not fixed — multi-select + bulk-action toolbar deferred.
6. **Modals everywhere; sheets nowhere.** Every edit is a centered modal that hides context. Linear and Stripe moved to side-sheets and inline editing in 2022. — ✗ Not fixed — `Sheet` primitive not introduced this session.
7. **Forms validate on submit.** Stripe-grade forms validate on blur with inline guidance and disabled submit states. — ✗ Not fixed — needs validation library + per-page wiring.
8. **No undo.** Every destructive action is permanent. `Cmd+Z` toast undo is a 2014 idea (Gmail) and still missing. — ✗ Not fixed — undo controller + per-action inverse-ops deferred.
9. **No saved views / saved filters.** Every analyst rebuilds the same date range every morning. — ✗ Not fixed — needs per-user `savedView` entity.
10. **Charts are decorative.** None of the dashboard charts are drill-downable; clicking does nothing. — ✗ Not fixed — click-through handlers + filter routing deferred.
11. **Cards over tables.** A glassmorphism card is beautiful for 6 items, hostile for 600. The customers page will collapse at 5,000 rows because there is no virtualization. — ✗ Not fixed — virtualized table (react-virtual / TanStack Virtual) not introduced.
12. **Heavy color, low contrast in some surfaces.** Italian red on glass-blur passes WCAG AA only marginally. AAA fails on small text. — ✗ Not fixed — contrast pass deferred.
13. **No skeleton states.** Fetches show spinners; perceived performance suffers. — ✗ Not fixed — `Skeleton` primitive + per-page wiring deferred.
14. **No offline indicator.** A truck with bad LTE has no idea its writes aren't landing. — ✗ Not fixed — needs online/offline listener + status pill.
15. **No "what changed" diff** on records. Audit log shows actions but not field-level diffs in the UI. — ✓ Fixed — new `/admin/audit-log` page (`src/components/admin/AuditLog.tsx`) lists every entry with filters (group / search) and an expand-to-diff row. `DiffRenderer` walks `before` / `after`, classifies each key as added / removed / changed, and renders side-by-side with red/green colouring. Added to nav under System.

### 2.3 Redesign Proposals

**Navigation philosophy.** Replace the flat 25-item sidebar with a **5-zone IA**:

```
NOW            (live ops: orders, KDS, slots, on-shift staff, alerts)
PEOPLE         (customers, loyalty, growth, feedback, marketing)
KITCHEN        (menu, recipes, inventory, suppliers, POs, waste)
TEAM           (staff, schedule, time, training, payroll)
BUSINESS       (analytics, finance, expansion, settings, audit, users)
```

Each zone is one keystroke (`Cmd+1..5`). Sidebar collapses by role.

**Command center.** Replace `/admin` dashboard with a **single live-ops command center**:

```
┌────────────────────────────────────────────────────────────────────┐
│ NEXT 60 MINUTES                                                    │
│  ▸ 14:00 Kraków: 8 orders due, kitchen 67% util, 1 low-stock      │
│  ▸ 14:15 Warszawa: 4 orders due, all stations green                │
│  ▸ Risk: fior di latte 2 portions left @ Kraków → suggest 86      │
├────────────────────────────────────────────────────────────────────┤
│ LIVE                       │ TODAY VS PLAN                         │
│ ◉ 6 staff clocked-in       │ Revenue: 4,820 / 5,400 PLN  (-10.7%) │
│ ◉ 12 carts in flight       │ Orders:  64 / 72                     │
│ ◉ Avg ticket: 14 m         │ Avg ticket: 17 m  ⚠ +3 m vs SLA      │
├────────────────────────────────────────────────────────────────────┤
│ ALERTS (3)                 │ COPILOT                               │
│ ⚠ Kraków oven temp 320°    │ "Margins on Margherita slipped 4%    │
│ ⚠ Glovo prep > 35m         │  this week — suggest +1 PLN price"   │
│ ⚠ 2-star review (15m ago)  │ [Ask anything →]                     │
└────────────────────────────────────────────────────────────────────┘
```

**Widget hierarchy.** Three tiers:
- **Tier 1 (always visible):** revenue vs plan, kitchen SLA, alerts, copilot.
- **Tier 2 (one click):** per-truck, per-channel, per-station.
- **Tier 3 (analytics):** cohorts, elasticity, scenario.

**Operational shortcuts.** Adopt Linear's keyboard model:
- `O` create order, `C` create customer, `S` switch location, `G` go-to, `?` help.
- `J/K` to navigate rows; `E` to edit; `Backspace` to delete; `U` to undo.

**Mobile-first workflows.** The **manager-on-truck phone** is the most important screen and doesn't exist. Required mobile views:
- *Live ops* (today's orders, KDS bump from phone, item-86 toggle).
- *Schedule* (claim shift, swap, call-out).
- *Inventory count* (camera-based scan, swipe to adjust).
- *Push receive* on incidents.

**AI-native workflows.** A copilot input on every page that can:
- Answer (`"what's our coffee attach rate yesterday by truck?"`).
- Act (`"86 fior di latte at Kraków for the rest of the day"` → with explicit confirm).
- Recommend (`"slots 14:00–15:00 are filling fast and Saturday is forecast warm; raise capacity?"`).

#### 2.3 Status of redesign proposals

| Proposal | Status |
|---|---|
| 5-zone IA (`NOW / PEOPLE / KITCHEN / TEAM / BUSINESS`) | ✗ Not fixed — current nav uses a similar but different 9-section grouping (`nav.config.ts`); zone collapse + `Cmd+1..5` not wired |
| Live command-center dashboard (next-60-min + alerts + copilot) | ✗ Not fixed — composite live tile deferred |
| Widget hierarchy (Tier 1/2/3) | ✗ Not fixed — depends on command-center build |
| Keyboard model `O / C / S / G / ? / J / K / E / Backspace / U` | ✗ Not fixed — global hotkey controller not introduced |
| Mobile-first manager-on-truck shell | ✗ Not fixed — dedicated mobile shell deferred |
| AI-native page-level copilot input | ✗ Not fixed — depends on real model + tool-calling layer |

---

## 3. Part 3 — Futuristic 2026–2030 Features

The following 72 features are scoped by realistic time horizon (2026 = ship in 12 months; 2027 = ship in 24 months; 2028+ = research / strategic). **Business Impact** is 1–5 (revenue / margin / moat). **Difficulty** is 1–5 (engineering + ops). **Strategic Value** is 1–5 (defensibility).

### 3.1 Autonomous Operations Layer

| # | Feature | Description | Impact | Difficulty | Strategic | Moat | Horizon | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | **AI Restaurant Manager** | Single agent that reads forecast + inventory + staff + weather and produces a morning brief: target revenue, expected stock-outs, recommended schedule edits, suggested pitches. Run daily 06:00. | 5 | 4 | 5 | very high | 2026 | ✗ Future — LLM + tools layer not built |
| 2 | **AI Kitchen Orchestrator** | Live agent that re-orders the KDS queue every 90 s to maximize on-time delivery; can route prep to alternate stations; can request manager approval to pause online slot. | 5 | 4 | 5 | high | 2026 | ✗ Future — depends on real-time queue + agent loop |
| 3 | **AI CFO** | Daily P&L narrative, anomaly flagging, cash projection, vendor renegotiation suggestions. | 4 | 3 | 5 | high | 2026 | ✗ Future — depends on real-time P&L (§1.9) |
| 4 | **AI Procurement Agent** | Reads par + sales forecast + price feed, drafts POs for owner approval, negotiates rebates via email. | 5 | 4 | 4 | high | 2027 | ✗ Future — depends on forecast + price feed |
| 5 | **AI Marketing Agent** | Generates weekly email/SMS/WhatsApp/IG campaign drafts per segment, holdouts included, owner one-click approval. | 4 | 3 | 4 | medium | 2026 | ✗ Future — depends on campaign builder (§1.8) |
| 6 | **AI Hiring Agent** | Drafts job posts, screens applicants from Pracuj.pl / OLX, schedules interviews, references SANEPID requirement. | 3 | 3 | 3 | medium | 2027 | ✗ Future — needs job-board API contracts |
| 7 | **Multi-agent debate orchestrator** | Forecast Agent vs Cost Agent vs Marketing Agent debate proposed pricing change before manager sees it. | 3 | 5 | 5 | very high | 2028+ | ✗ Future — research-grade |
| 8 | **Autonomous truck dispatcher** | Optimizes which truck goes where each day given forecast, weather, permits, fuel cost. Pushes plan to drivers' phones. | 5 | 4 | 5 | very high | 2027 | ✗ Future — VRP solver + driver app |

### 3.2 Computer Vision

| # | Feature | Description | Impact | Difficulty | Strategic | Moat | Horizon | Status |
|---|---|---|---|---|---|---|---|---|
| 9 | **Pizza quality CV** | Camera over the conveyor or counter scores each pizza on char, dough size, topping coverage, plating; rejects below threshold; trends quality per cook. | 4 | 5 | 5 | very high | 2027 | ✗ Future — camera hardware + CV model |
| 10 | **Inventory CV (fridge cam)** | Camera in walk-in counts visible SKUs every 5 min; auto-adjusts on-hand; flags theft. | 4 | 5 | 4 | high | 2028+ | ✗ Future — IoT cam + CV model |
| 11 | **Waste CV (bin cam)** | Camera over the waste bin classifies discarded items by SKU and reason. | 4 | 4 | 4 | high | 2027 | ✗ Future — camera + classifier |
| 12 | **Counter / queue CV** | Counts walk-up customers vs converted orders → measures conversion at the truck window. | 4 | 4 | 3 | medium | 2027 | ✗ Future — needs camera + counting model |
| 13 | **Customer emotion analytics** | Anonymous emotion scoring at pickup ("smiled / neutral / frowned"). With opt-in signage for GDPR. | 3 | 5 | 3 | medium | 2028+ | ✗ Future — DPIA + signage + model |
| 14 | **Receipt / invoice OCR** | Photograph a paper invoice → 3-way match to PO. | 4 | 3 | 3 | low | 2026 | ✗ Future — OCR provider integration |
| 15 | **Hand-hygiene CV** | Camera detects hand-wash compliance against HACCP schedule. | 3 | 5 | 4 | medium | 2028+ | ✗ Future — camera + HACCP workflow |

### 3.3 Voice AI

| # | Feature | Description | Impact | Difficulty | Strategic | Moat | Horizon | Status |
|---|---|---|---|---|---|---|---|---|
| 16 | **Voice-driven KDS** | "Margherita ready, table 4" → KDS bumps the right ticket. Hands-free for cooks. | 4 | 3 | 4 | high | 2026 | ✗ Future — Polish STT + KDS action layer |
| 17 | **Phone-order AI cashier** | Customer calls the truck, AI takes the order in Polish, books slot, takes payment by SMS link. | 5 | 4 | 5 | very high | 2027 | ✗ Future — telephony + Polish voice agent |
| 18 | **In-truck voice manager** | Manager: *"Add 4 pasta to 14:15 Glovo channel and reduce dine-in slot by 4."* | 4 | 4 | 4 | high | 2027 | ✗ Future — voice + tool-calling agent |
| 19 | **Inventory voice count** | "Count 12 fior di latte" while walking the walk-in. | 3 | 2 | 2 | low | 2026 | ✗ Future — STT + stock adjust API |
| 20 | **Customer voicebot for support** | Polish-language voicebot handles order status, refund requests, complaints, with human handoff. | 4 | 3 | 4 | medium | 2027 | ✗ Future — telephony + agent + handoff |

### 3.4 Predictive & Demand-Sensing

| # | Feature | Description | Impact | Difficulty | Strategic | Moat | Horizon | Status |
|---|---|---|---|---|---|---|---|---|
| 21 | **Hyperlocal demand heatmap** | Cell-tower / Google Mobility / Foursquare signal → demand by 100 m grid. Drives pitch selection. | 5 | 5 | 5 | very high | 2027 | ✗ Future — paid location-data feed |
| 22 | **Event-aware demand model** | Ingests Pol-Met weather, Spectacle events, school calendar, holiday calendar → demand by hour, by item. | 5 | 4 | 5 | high | 2026 | ✗ Future — feeds + model |
| 23 | **Real elasticity model** | Replaces `/admin/ai`'s margin heuristic with per-item PED estimated from natural price variance + structured A/B. | 4 | 4 | 4 | high | 2026 | ✗ Future — PED estimation + A/B |
| 24 | **Item-level shelf-life prediction** | Predicts probability that fior di latte received Monday survives to Wednesday given temp logs. | 4 | 4 | 3 | medium | 2027 | ✗ Future — needs HACCP temp logs (§1.1) |
| 25 | **Churn-risk scoring** | Per-customer probability with intervention recommendation; auto-triggered campaign. | 4 | 3 | 4 | medium | 2026 | ✗ Future — churn model |
| 26 | **No-show prediction (slots)** | Probability a pre-order is collected → over-book like an airline. | 3 | 3 | 3 | medium | 2027 | ✗ Future — no-show classifier |
| 27 | **Weather-linked dynamic menu** | Cold rain auto-pins soup; hot day auto-promotes Aperol Spritz; pricing nudge. | 3 | 2 | 3 | low | 2026 | ✗ Future — weather feed + rules engine |
| 28 | **Festival match-maker** | Scrapes 30 Polish event APIs and ranks fit-score (footfall × pizza-affinity × competition density × permit feasibility) for the next 90 days. | 5 | 4 | 5 | very high | 2027 | ✗ Future — event-API scrapers + scorer |

### 3.5 Geo-Intelligence & Logistics

| # | Feature | Description | Impact | Difficulty | Strategic | Moat | Horizon | Status |
|---|---|---|---|---|---|---|---|---|
| 29 | **Live truck telemetry** | GPS, fuel, oven temp, generator state, hood ampere, LPG bottle level — single Grafana dashboard. | 4 | 3 | 4 | medium | 2026 | ✗ Future — hardware + pipeline |
| 30 | **Customer-facing live truck map** | Public map of where each truck is, ETA, current queue length. | 4 | 2 | 3 | low | 2026 | ✗ Future — needs telemetry feed first |
| 31 | **Autonomous route optimizer** | VRP solver computes daily routes given forecast, fuel cost, permits, traffic. | 5 | 4 | 5 | very high | 2027 | ✗ Future — VRP solver |
| 32 | **Drone-delivery integration** | API to Manna / Wing for last-mile in dense events. Out of EU regulation today, plausible by 2028. | 3 | 5 | 4 | high | 2028+ | ✗ Future — regulation + API |
| 33 | **Sidewalk-robot delivery** | Starship / Yandex Eda robots; API plug-in. | 3 | 4 | 3 | medium | 2028+ | ✗ Future — robot API |
| 34 | **Geofenced pricing & promo** | Promo automatically lifts as customer enters 500 m radius of a truck. | 4 | 3 | 4 | high | 2026 | ✗ Future — geofence engine + push |
| 35 | **Pitch yield analyzer** | Per-pitch P&L (revenue − fuel − permit − labor) and recommendation to keep / drop / re-time. | 5 | 3 | 5 | high | 2026 | ✗ Future — needs fuel/permit fields + P&L roll-up |

### 3.6 IoT & Smart Kitchen

| # | Feature | Description | Impact | Difficulty | Strategic | Moat | Horizon | Status |
|---|---|---|---|---|---|---|---|---|
| 36 | **Smart oven integration** | Networked deck oven exposes temp/door/load; KDS pipes prep into the oven's preheat schedule. | 4 | 4 | 4 | high | 2027 | ✗ Future — vendor API + hardware |
| 37 | **Smart scale + auto-portioning** | Connected scale weighs dough/cheese, logs variance to recipe, prevents over-portioning (#1 margin leak in pizza). | 5 | 3 | 4 | high | 2026 | ✗ Future — BLE/Wi-Fi scale + ingest |
| 38 | **Walk-in temp monitoring** | Continuous logging with HACCP-compliant export + SMS alert on excursion. | 4 | 2 | 3 | medium | 2026 | ✗ Future — IoT probe |
| 39 | **Hood / fire-suppression telemetry** | Required by insurance for autonomous-status; alert on filter saturation. | 3 | 3 | 3 | medium | 2027 | ✗ Future — sensor + alert |
| 40 | **POS-printer-less ticketing** | KDS replaces paper entirely; printers only for customer receipts and tax fiscal where required. | 3 | 2 | 3 | low | 2026 | ✗ Future — depends on Polish fiscal-receipt rules |
| 41 | **Robotic dough rolling** (e.g., Picnic, Picpie integration) | Connected pizza-robot APIs are emerging; integration spec ready when hardware lands. | 4 | 5 | 4 | high | 2028+ | ✗ Future — robot vendor API |

### 3.7 Customer Experience 2027+

| # | Feature | Description | Impact | Difficulty | Strategic | Moat | Horizon | Status |
|---|---|---|---|---|---|---|---|---|
| 42 | **Hyper-personalized landing page** | Customer arrives via SMS link → personalized hero (their favorite + a complementary new item). | 4 | 3 | 4 | medium | 2026 | ✗ Future — needs personalization engine (§1.8) |
| 43 | **Family Wallet 2.0** | Shared payment + shared points + sub-budgets ("kids can spend max 30 PLN") + push to parent on redemption. | 4 | 3 | 4 | high | 2027 | ✗ Future — needs sub-budget + push pipeline |
| 44 | **Subscription pizza** ("Pizza Pass") | Monthly fee for X pies/month, claimable across trucks. | 5 | 2 | 5 | high | 2026 | ✗ Future — Stripe subscription + entitlement |
| 45 | **WhatsApp-native ordering** | Order via WhatsApp message, including image-to-cart ("send me this pizza" + photo). | 5 | 4 | 5 | very high | 2027 | ✗ Future — WABA + vision model |
| 46 | **AR menu** | Phone camera over the menu board → 3D pizza preview, ingredient drill-down, allergens highlighted. | 3 | 4 | 3 | medium | 2028+ | ✗ Future — WebXR/3D models |
| 47 | **Anonymous emotion-based recommendation** | Opt-in camera at kiosk reads mood → recommends comfort food on a frown. (GDPR-bounded.) | 3 | 5 | 3 | medium | 2028+ | ✗ Future — kiosk + DPIA |
| 48 | **Loyalty NFT / token wallet** | Optional on-chain loyalty for power users; redeemable across partner brands. | 2 | 4 | 2 | low | 2028+ | ✗ Future — on-chain integration |
| 49 | **Voice-clone hosts** | Trucks get a unique brand voice that confirms orders by SMS audio. | 2 | 3 | 2 | low | 2028+ | ✗ Future — voice cloning + audio MMS |

### 3.8 Operations Simulation & Digital Twin

| # | Feature | Description | Impact | Difficulty | Strategic | Moat | Horizon | Status |
|---|---|---|---|---|---|---|---|---|
| 50 | **Operational digital twin** | Run a simulation of tomorrow's Saturday given weather × event × staff × menu mix. Surfaces bottlenecks before they hurt. | 5 | 5 | 5 | very high | 2028+ | ✗ Future — simulation engine |
| 51 | **Stress-test mode** | "Simulate 4× lunch volume" → identifies the first 3 stations / SKUs to fail. | 4 | 4 | 4 | high | 2027 | ✗ Future — depends on digital twin |
| 52 | **Counterfactual analyzer** | "What if Margherita had been priced at 32 PLN last week?" → simulated revenue, units, attach rate. | 4 | 5 | 5 | very high | 2028+ | ✗ Future — causal model |
| 53 | **Scenario planner** ("if Wrocław opens in Q4") | Plug in capex / opex / forecast → cash-flow & break-even. | 5 | 3 | 4 | medium | 2026 | ✗ Future — scenario model |
| 54 | **Menu engineering simulator** | Drop / re-price an item and see modeled cannibalization on the rest of the menu. | 4 | 5 | 4 | high | 2027 | ✗ Future — cross-elasticity model |

### 3.9 Wearables & Floor Tech

| # | Feature | Description | Impact | Difficulty | Strategic | Moat | Horizon | Status |
|---|---|---|---|---|---|---|---|---|
| 55 | **Smartwatch KDS** | Cook wears watch; vibrates on new ticket; tap to bump. | 4 | 3 | 3 | medium | 2027 | ✗ Future — watch app + KDS push |
| 56 | **Manager smartwatch alerts** | Critical alerts (low stock, kitchen SLA breach, payment failure) push to Apple Watch / Wear OS. | 4 | 2 | 3 | low | 2026 | ✗ Future — needs alert engine first |
| 57 | **AR glasses for new-hire training** | XReal/Meta glasses guide a new cook through dough stretch and topping placement. | 3 | 5 | 4 | high | 2028+ | ✗ Future — AR hardware + content |
| 58 | **Headset comms (cook ↔ window)** | Voice channel between station & order window, with auto-transcription into the order record. | 3 | 3 | 3 | medium | 2027 | ✗ Future — comms + STT |

### 3.10 Financial Intelligence 2027+

| # | Feature | Description | Impact | Difficulty | Strategic | Moat | Horizon | Status |
|---|---|---|---|---|---|---|---|---|
| 59 | **Real-time contribution margin per order** | Visible at order completion. | 5 | 3 | 5 | high | 2026 | ✗ Future — needs per-order COGS calc |
| 60 | **Channel-mix optimizer** | "Glovo is loss-leading at >35% commission; suggest lifting Glovo prices by 8% or pausing during peak own-channel hours." | 5 | 4 | 5 | very high | 2027 | ✗ Future — depends on channel integration (§1.7) |
| 61 | **Dynamic delivery fee** | Surge during high-demand windows; subsidy during low-demand. | 4 | 3 | 4 | medium | 2026 | ✗ Future — surge-pricing engine |
| 62 | **Automated VAT / JPK_V7 generation** | Polish tax-office-ready monthly export. | 5 | 3 | 3 | medium | 2026 | ✗ Future — JPK_V7 schema mapping |
| 63 | **Cash-handling AI** | Detects suspicious patterns in cash float reconciliations. | 4 | 4 | 4 | high | 2027 | ✗ Future — depends on cash-mgmt module (§1.9) |
| 64 | **Vendor invoice negotiator** | LLM that drafts vendor-rebate emails given purchase volume; humans approve. | 4 | 3 | 4 | high | 2027 | ✗ Future — LLM + email-send pipeline |
| 65 | **Investor dashboard** | Public read-only link with TTM, cohorts, contribution margin, cash runway. | 3 | 2 | 3 | low | 2026 | ✗ Future — public read-only surface |

### 3.11 Platform & Marketplace 2028+

| # | Feature | Description | Impact | Difficulty | Strategic | Moat | Horizon | Status |
|---|---|---|---|---|---|---|---|---|
| 66 | **Franchise marketplace** | Approved franchisees buy a SUD truck-in-a-box: hardware, software, training, supply contracts. | 5 | 5 | 5 | very high | 2028+ | ✗ Future — depends on multi-tenant + franchise org |
| 67 | **Multi-tenant white-label** | The same platform sells to other Polish multi-unit operators. | 5 | 5 | 5 | very high | 2028+ | ✗ Future — fundamental arch shift |
| 68 | **App marketplace** | Third-party developers extend (e.g., a Pyszne plug-in, a HACCP plug-in). | 4 | 5 | 5 | very high | 2028+ | ✗ Future — SDK + portal |
| 69 | **Open API + webhook platform** | Public-facing API for partners; SUD becomes infrastructure, not an app. | 4 | 4 | 5 | very high | 2027 | ✗ Future — API gateway + docs |
| 70 | **Embedded payments** | Earn interchange on transactions across the whole platform (Stripe-Connect-style). | 5 | 4 | 5 | very high | 2027 | ✗ Future — Stripe Connect onboarding |
| 71 | **Embedded finance** | Working-capital advances for franchisees against future revenue (Toast Capital model). | 5 | 5 | 5 | very high | 2028+ | ✗ Future — capital partner + regulation |
| 72 | **Procurement co-op** | Aggregate flour/mozzarella demand across all platform tenants → block-buy rebates. | 5 | 4 | 5 | very high | 2028+ | ✗ Future — depends on multi-tenant + supplier contracts |

---

## 4. Part 4 — What Would McDonald's Build?

The interesting question is not *"what would Toast build"* (Toast already shipped most of §1). The interesting question is *"if a trillion-dollar-scale operator architected the same problem, what would they prioritize, and why?"*

### 4.1 Core Operating Beliefs (McDonald's-style)

1. **Throughput is the religion.** Every system question reduces to one number: drive-thru time. McDonald's SOS-100 (seconds-of-service to 100% accuracy) is the single most important metric in the franchise.
2. **Standardization beats optimization.** A globally-mediocre process executed identically beats a locally-brilliant process executed inconsistently.
3. **Every change is an experiment.** No menu change ships globally without a multi-store pilot, a control group, and a measured lift.
4. **Equipment is software.** A grill is an IoT device; an oven reports temperature; a fryer reports oil age. The kitchen is observable.
5. **Field is a customer.** The HQ platform's first user is the store manager; the second is the franchisee; the third is corporate. (And the order matters.)
6. **Labor is the largest controllable line.** Every minute saved per ticket × volume = millions of dollars.

### 4.2 Systems They Would Build, In Priority Order

**Tier 1 — Operations integrity (week 1).**

- **Global Mobile Restaurant (GMR)** equivalent: a single mobile app for every operator covering ops checklist, food-safety logs, equipment status, daily targets, escalations.
- **Restaurant Information System (RIS)** equivalent: a real-time event store that records every order, every modification, every refund, every void, every state change — replayable, queryable, idempotent. The current `withLock` JSON store would not survive an hour at McDonald's volume.
- **EPMS (Equipment Performance Monitoring)**: every oven, fridge, fryer, hood, register reports to a central telemetry pipe. Failures trigger work orders before staff notice.
- **SOS-100 metric**: ticket-completion time and order-accuracy as the headline KPI on every screen, every report, every email. SUD has no equivalent today.

**Tier 2 — Standardization (month 1).**

- **MOP (Manual of Operations)** as a versioned, searchable, role-targeted SOP library. Every SOP has an owner, a version, a last-tested date, and a compliance score per store.
- **eCRC (Electronic Crew Resource Center)**: training, certs, role progressions, performance, micro-learning, AR/VR sims.
- **GRMS (Global Restaurant Maintenance System)**: every truck has a digital asset register; every breakdown is a ticket; every ticket has SLA; every vendor has a scorecard.

**Tier 3 — Experimentation (quarter 1).**

- **Menu Lab platform**: hypothesis → control/treatment store assignment → revenue / margin / attach measurement → ship/kill decision, all in one workflow. No menu change without it.
- **Pricing Lab**: A/B price tests with mixed-effects modeling for elasticity.
- **Promotion engine**: every promotion is a controlled experiment; the result is a learning, not just a P&L line.

**Tier 4 — Forecast & supply (quarter 1).**

- **Demand Sensing Engine** (analogue: McDonald's "Dynamic Yield" stack acquired 2019 for $300M): per-store, per-SKU, per-15-minute demand forecast, fed by weather, event, holiday, mobility, internal signals.
- **Supply Chain Twin**: every flour bag has a lot number, supplier, plant, ship date, lab cert. A traceback in a recall is < 60 s end-to-end.
- **Quality Center**: complaints are tagged to lots, lots to suppliers, suppliers to plants — a single bad lot triggers a global advisory.

**Tier 5 — Labor (quarter 2).**

- **Crew Optimization Engine**: 15-minute interval labor allocation against forecast demand, skill matrix, fairness constraints, legal constraints, budget cap. Manual scheduling is forbidden.
- **Productivity Index per Crew**: pies/hour, dish-out time, error rate; visible at the crew member's pay review.

**Tier 6 — Customer (quarter 2).**

- **Customer Identity Graph**: one identity across owned channels, aggregators, in-store, app, web, Apple Pay tokens. Today SUD identifies a customer by phone only; a single household with 3 numbers is 3 customers.
- **MyMcDonald's-style personalization**: per-customer hero items, dynamic upsell on cart, segmented push, AB-tested copy.

### 4.3 KPIs that would matter most

- **SOS** — order completion seconds, p50 and p95.
- **Order accuracy %** — measured by complaint/refund rate, not self-reported.
- **Labor as % of revenue** — by 15-minute bucket, with a green/yellow/red ribbon.
- **Food cost % of revenue** — per item, per truck, per day.
- **Waste % of food cost** — same.
- **Repeat-customer rate by cohort** — 28-day, 90-day.
- **NPS** — by truck, by day-part.
- **Compliance %** — checklist completion, certification freshness, audit score.
- **Equipment uptime %** — per truck, per asset.
- **Throughput per labor hour** — orders / paid labor hour.

### 4.4 How software becomes the force multiplier

A trillion-dollar operator does not buy software. It builds an operating system where every store manager is *augmented*:

- The manager wakes up to a brief written by an AI (today's forecast, risks, recommended actions).
- Every checklist is in the manager's pocket and pre-checked by IoT.
- Every menu change shows up as a recipe-card video on the crew's smartwatch.
- Every reorder is auto-drafted; the manager just approves.
- Every customer complaint is auto-tagged, auto-routed, auto-responded, and auto-tied back to the lot / shift / station that caused it.

**SUD today is at perhaps 8% of this surface area.** That is fine for two trucks. It is fatal at twenty.

---

## 5. Part 5 — Final Verdict

### 5.1 Scorecard

| Dimension | Score / 100 | Comment | Movement this session |
|---|---|---|---|
| **Overall sophistication** | **38** | Solid breadth, shallow depth, fake AI, no realtime, no RBAC. | ✗ Unchanged — only the "AI" labelling was honestly downgraded |
| **Enterprise readiness** | 22 | Single-password auth, no SSO, no audit-grade logs, no SOC2 surface, no tests. | ✗ Unchanged |
| **Scalability readiness** | 31 | Single-instance lock, polling, hardcoded locations, monolithic JSON store. Fine to ~5 trucks, breaks at 20. | ✗ Unchanged |
| **AI-native readiness** | 12 | One page labeled "AI" with no model in it. Zero LLM, zero retrieval, zero copilot. | ✓ Slightly improved on honesty (label dropped); no real capability added |
| **Franchise readiness** | 18 | No multi-tenant, no royalty accounting, no per-franchisee permissions, no comparison dashboards. | ✗ Unchanged |
| **Multi-location readiness** | 55 | Best dimension. Location switcher works, most APIs are scoped, but reporting cross-location is shallow. | ✗ Unchanged |
| **Operational maturity** | 34 | KDS exists; no SOPs, no HACCP, no incidents, no maintenance, no compliance. | ✗ Unchanged |
| **Investor attractiveness** | 28 | Pretty UI + breadth helps; "fake AI", no tests, no metrics infra hurts. A YC partner would dig fast. | ✓ Marginally improved — removing the "AI" label closes one credibility liability |
| **Competitive moat** | 24 | Today this is a generic admin tool. Moat candidates exist (food-truck specificity, family wallet, Polish-market focus) but none are exploited. | ✗ Unchanged |
| **Code quality / maintainability** | 64 | TypeScript end-to-end, clean module boundaries, consistent design system, no obvious tech debt. The bones are good. | ✗ Unchanged |

### 5.2 Top 10 Highest-Impact Missing Features

1. Real-time event bus + WebSocket / SSE for KDS, orders, alerts. — ✗ Not fixed
2. Per-user authentication + actual RBAC enforcement. — ✗ Not fixed
3. Real demand-forecasting model (replace `ai-engine.ts` heuristics). — ✗ Not fixed (label dropped only)
4. Aggregator integration (Pyszne, Glovo, Bolt, Uber Eats) via Deliverect-class adapter. — ✗ Not fixed
5. Live truck telemetry (GPS, fuel, oven, generator) with customer-facing ETA. — ✗ Not fixed
6. Real-time P&L with per-order contribution margin and per-channel margin matrix. — ✗ Not fixed
7. Live labor cost % of revenue tile + AI auto-scheduler. — ✗ Not fixed
8. HACCP & food-safety logs (probe temps, hygiene, allergen) with SANEPID-ready export. — ✗ Not fixed
9. Variance alerts (theoretical vs actual usage) and auto-PO drafting. — ✗ Not fixed
10. AI Copilot in admin (natural-language → query → answer / action). — ✗ Not fixed

### 5.3 Top 10 Fastest Wins (≤ 2 weeks each)

1. Add Sentry + structured logging + at least 30 unit tests covering `store.ts` and pricing logic. — ✓ Partial — `@sentry/nextjs` installed and gated on `SENTRY_DSN`; `src/lib/logger.ts` ships structured JSON logs wired into the webhook / checkout / refund / store read paths. Still ✗: unit tests covering `store.ts` and pricing logic.
2. Rename `/admin/ai` to `Insights` until real models ship; remove "AI" labels from heuristics. — ✓ **Fixed this session** — sidebar label, page H1, subtitle, and aria-label all relabelled. Subtitle explicitly states no ML model is in the loop yet
3. Add bulk actions (multi-select + bulk status / bulk delete) on orders and stock. — ✗ Not fixed
4. Add CSV export to every list view (orders, customers, members, stock, shifts). — ✗ Not fixed
5. Add `Cmd+K` universal command palette that finds orders, customers, items, suppliers, not just pages. — ✓ **Already fixed prior to this audit** — `CommandPalette.tsx` + `/api/admin/search` return orders, customers, menu items, ingredients. The audit row is out of date
6. Add a single "next 60 minutes" widget to `/admin` showing upcoming slot load + alerts. — ✗ Not fixed
7. Add per-user login (email + password) wrapped around existing HMAC; record actor on every audit-log entry. — ✗ Not fixed
8. Add WebSocket (or Vercel-compatible SSE) for KDS and orders; remove the 2-second polling. — ✓ Fixed — SSE endpoint `/api/admin/orders/stream` plus `useAdminOrdersStream` (graceful REST fallback) replace the polling loops in AdminOrders and AdminKDS.
9. Add `react-hot-keys` + `J/K/E/Backspace/U` keyboard model on the orders list. — ✗ Not fixed
10. Add explicit empty / skeleton / error states to every list page (currently many pages render half-broken on no-data). — ✗ Not fixed

### 5.4 Top 10 Long-Term Strategic Advantages

1. **Food-truck-native ops** — almost no SaaS competitor optimizes for trucks. Bake GPS, pitch P&L, permits into the core. — ✗ Strategic — not implementable this session
2. **Polish-market depth** — JPK_V7, SANEPID, ZUS, WhatsApp ordering, Pyszne integration. Local-first beats global-mediocre. — ✗ Strategic
3. **Family Wallet** — uncommon primitive, very sticky, expand to "Workplace Wallet" (offices that subsidize lunch for staff). — ✗ Strategic
4. **Predictive pitch optimizer** — the single highest-value AI feature for a truck operator; no incumbent owns this. — ✗ Strategic
5. **Embedded payments + working capital** — Toast's flywheel; once you process payments, you own the operator's banking too. — ✗ Strategic
6. **Procurement co-op across operators** — leverage demand aggregation across tenants for flour, cheese, packaging rebates. — ✗ Strategic
7. **Marketplace of brands** — the truck is hardware; the brand running today on it is software (virtual brand support). — ✗ Strategic
8. **HACCP-grade compliance backbone** — sell as a separate SKU to non-platform restaurants; it's a wedge into bigger accounts. — ✗ Strategic
9. **AI-native from day one** — make every page have a copilot, every recommendation actionable, every action undoable. — ✗ Strategic
10. **Restaurant-OS positioning** — stop selling a tool, start selling an operating system; the language matters for ACV and acquisition multiples. — ✗ Strategic / positioning

### 5.5 Top 10 Features Most Competitors Will Miss

1. **Per-pitch P&L for food trucks** (geo × time × menu mix × fuel × permit). — ✗ Not fixed
2. **Family Wallet with sub-budgets**. — ✗ Not fixed
3. **Polish-market-deep tax + compliance**. — ✗ Not fixed
4. **WhatsApp-native ordering with image-to-cart**. — ✗ Not fixed
5. **Counterfactual menu engineering** ("what if we'd priced differently last week?"). — ✗ Not fixed
6. **Operational digital twin** for Saturday simulation. — ✗ Not fixed
7. **Real-time tip pooling / tronc compliance** for Polish napiwki regulation. — ✗ Not fixed
8. **Recipe yield testing workflow** built into the inventory loop. — ✗ Not fixed
9. **Customer identity graph** that unifies phone + family wallet + aggregator IDs + Apple Pay token. — ✗ Not fixed
10. **Tenant procurement co-op** as a platform-level moat (group-buy at the platform layer). — ✗ Not fixed

### 5.6 The Roadmap — "Bloomberg / Stripe / Tesla OS for Hospitality"

Three phases, each ~6 months. Each phase ends with a demoable, sellable artifact.

**Phase 1 — Credibility (months 0–6).** Goal: a system that survives serious due diligence.

- Replace heuristics labeled "AI" with either real models or honest names. — ✓ **Partly done** (honest names shipped this session; real models still ✗)
- Per-user auth, enforced RBAC on every page + every API route, audit log per actor. — ✗ Not fixed
- Sentry, OpenTelemetry, structured logs, dashboards, on-call. — ✗ Not fixed
- Test suite (unit + Playwright smoke) gating CI; coverage > 60% on `lib/`. — ✗ Not fixed
- Real-time event bus (Inngest / Trigger.dev / Kafka-light) replacing polling. — ✗ Not fixed
- HACCP food-safety module with SANEPID-ready export. — ✗ Not fixed
- Aggregator adapter for at minimum Pyszne and Glovo via Deliverect. — ✗ Not fixed
- AI Copilot (RAG over schema) on `/admin`. — ✗ Not fixed
- Bulk actions, exports, command palette, undo, sheets-not-modals across all list views. — ✓ Command palette done; bulk actions / exports / undo / sheets ✗
- KPI definition document published internally; SOS-100 equivalent metric live. — ✗ Not fixed

**Phase 2 — Differentiation (months 6–12).** Goal: a system competitors cannot copy in a quarter.

- Predictive pitch optimizer (live event + weather + footfall + permit). — ✗ Not fixed
- Truck telemetry stack with customer-facing live map and ETA. — ✗ Not fixed
- Live P&L per order, per channel, per item, per truck. — ✗ Not fixed
- AI auto-scheduler with skill matrix, demand forecast, budget cap. — ✗ Not fixed
- AI Procurement Agent drafting POs against forecast. — ✗ Not fixed
- Variance alerts + auto-recipe-yield testing loop. — ✗ Not fixed
- Customer journey builder (RFM, behavior, lifecycle) + WhatsApp / SMS / email / push. — ✗ Not fixed
- Family Wallet 2.0 + Pizza Pass subscription. — ✗ Not fixed
- Tronc / napiwki / VAT JPK_V7 / Polish-grade compliance. — ✗ Not fixed
- Public API + webhooks + first 3 third-party integrations (e.g., Pyszne, Comarch accounting, Twilio). — ✗ Not fixed

**Phase 3 — Platform (months 12–18).** Goal: become the operating system, not the app.

- Multi-tenant (one platform, many operators) with row-level security and per-tenant branding. — ✗ Not fixed
- Stripe-Connect-style embedded payments across tenants. — ✗ Not fixed
- Working-capital advances against future revenue for franchisees. — ✗ Not fixed
- Procurement co-op aggregating tenant demand for rebates. — ✗ Not fixed
- App marketplace + developer portal + SDK. — ✗ Not fixed
- Computer-vision quality + inventory + waste modules. — ✗ Not fixed
- Operational digital twin + scenario / counterfactual planner. — ✗ Not fixed
- Voice-first interactions on KDS, manager mobile, customer phone ordering. — ✗ Not fixed
- SOC2 Type II + GDPR DPIA + EU data-residency certification. — ✗ Not fixed
- Sales team + ACV pricing tiers (Operator / Franchise / Enterprise). — ✗ Not fixed

### 5.7 Closing Posture

The codebase is honest, clean, broad, and pretty. It is also small, single-tenant, polling-based, password-gated, AI-labeled-but-not-AI, and untested. Sud Italia today is a *very good internal admin tool* and a *very weak hospitality OS*.

The opportunity is real: a Polish-market-deep, food-truck-native, AI-copilot-first operating system has no serious incumbent. Toast is American, MICROS is enterprise legacy, Square is light, Pyszne/Glovo are aggregators not OSes. With the roadmap above — and the discipline to stop calling heuristics "AI" — this codebase is 12–18 months away from being category-defining.

The next decision is not which feature to build next. The next decision is whether this is **an admin tool for two trucks** or **an operating system for an industry**. Those are different products, different orgs, and different fundraising stories. Pick one before the next sprint.

— *End of audit.*
