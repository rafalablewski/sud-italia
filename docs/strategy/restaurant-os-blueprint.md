# Restaurant OS — Transformation Blueprint

> **Status:** strategy / architecture blueprint. Not a feature spec — a thesis
> for turning three modules (Loyalty, Slots/Booking, Floor) into a
> category-defining restaurant operating system. Every claim is grounded in
> the data this codebase **already** captures (file references inline) so the
> roadmap is executable, not aspirational.
>
> **Authors' lens:** Thiel (monopoly / proprietary secret), Karp (the data
> ontology + decision automation), Toast founder (the wedge → platform →
> infrastructure motion in restaurants specifically).

---

## 0. The thesis in one paragraph

We are not building a loyalty app, a reservation widget, and a table map. We
are building **the proprietary transaction graph of the restaurant** — the
only system that simultaneously owns *who the guest is*, *when demand will
arrive*, and *what is physically happening on the floor right now* — and then
collapsing the three into one self-reinforcing dataset that competitors
cannot reconstruct because they never sat in the seat where it was generated.
Toast won the POS layer; the next $10B company wins the **intelligence layer
that sits on top of the transaction** and turns every order into a forecast,
every seat into a yield-managed inventory unit, and every regular into a
predictable cash flow. The three modules are not products. They are three
**sensors** feeding one brain.

The Thiel question that governs the whole document:

> *"What valuable company is nobody building?"* — The restaurant **decision
> layer**. Everyone sells restaurants tools that report what happened.
> Nobody sells them a system that **makes the operating decisions for them**
> and gets monotonically better the more the restaurant transacts.

---

## 1. The shared substrate (why these three, together, are a monopoly)

The secret is not any single module. It is that **one company captures all
three primary keys of a restaurant's reality at the moment of truth**:

| Sensor | Primary key | What it proves we own | Where it lives today |
| --- | --- | --- | --- |
| **Loyalty / orders** | `customerPhone` (E.164) | *Who* and *what they buy* | `orders` + `customers` rollup, `src/lib/store.ts` |
| **Slots / booking** | `slotId · slotDate · slotTime` | *When* demand arrives, by channel | slots store + `Order.slotId/slotDate/slotTime` |
| **Floor / tables** | `tableId` + dwell/turn | *Where* it happens + physical capacity | `src/lib/floor.ts`, `Order.tableId/partySize` |

A competitor can clone any one feature in a sprint. What they cannot clone is
the **join**: `customer × time × seat × kitchen-pace`, accumulated per
restaurant over years. That join is the proprietary dataset. The rest of this
document is about deliberately engineering that join into a flywheel.

What already exists to build on (do not rebuild — unify):

- `src/lib/cohort-analytics.ts` — retention + CLTV by first-order cohort.
- `src/lib/ltv-cac.ts` — margin-adjusted LTV, CAC, payback.
- `src/lib/customer-segments.ts` — RFM segments + naive 12-mo CLTV, persisted to `customer_segments`.
- `src/app/api/admin/crm/route.ts` — the enriched per-customer profile (favourites, channels, lifecycle, reliability).
- `src/lib/kds-prediction.ts` — `analyzeTruck()`: per-station capacity/util/tier + per-ticket ETA + `atRisk` + bottleneck.
- `src/lib/pace-steering.ts` — load-based slot open/close recommendations.
- `src/lib/ai/forecast.ts` — 7-day demand forecast (Claude + moving-average fallback).
- `src/app/api/admin/campaigns/triggers/route.ts` — birthday / anniversary eligibility.
- `src/lib/upsell.ts` — margin- and context-aware attach scoring.

The transformation is **80% unification of scattered intelligence into three
products, 20% new predictive cores.** That ratio is why this is fundable: the
data is already being captured; we have just been throwing away its compound
value by rendering it as reports instead of decisions.

---

## 2. Module 1 — Loyalty → **Customer Identity Network**

### 2.1 The hidden monopoly
Points are a liability (you owe free pizza). **Identity is an asset.** The
monopoly is not the rewards ledger; it is becoming the **system of record for
the guest's eating behavior** across every restaurant on the platform. Once
the restaurant's understanding of its own customers lives only in our graph,
the loyalty "program" is just the UI on top of a customer-intelligence
database the operator can no longer reconstruct from their bank statements.

### 2.2 The proprietary dataset competitors can't acquire
Per `customerPhone`, derived only from sitting in the transaction:
- Dish affinity vector (top SKUs, modifiers, category mix) — from `Order.items[]`.
- **Temporal signature** — day-of-week × hour cadence ("Friday 18:30").
- Inter-order interval distribution → expected next visit + churn hazard.
- Party-size behavior + the *conditional attach* ("+ tiramisù when party ≥ 4").
- Channel elasticity (dine-in vs delivery vs takeout split, and what flips it).
- Price/coupon sensitivity — does AOV move with promos? (`Order.totalAmount` vs campaign exposure).
- Dietary/allergen inference from repeated orders (the EU-14 matrix already exists in Concierge).
- Reliability (no-shows) from dine-in reservation history.

No aggregator (Glovo/Wolt) has the dine-in + identity join. No POS vendor has
the cross-channel behavioral history. We do, because we own all the sensors.

### 2.3 Why it gets smarter with volume (the data network effect)
- **Within a restaurant:** every order sharpens that guest's temporal signature
  and attach rules; prediction error falls as `1/√n` per customer.
- **Across the network (the real moat):** a *new* restaurant with zero history
  inherits **population priors** — "in a Kraków pizzeria, party-≥4 dine-in at
  19:00 attaches dessert 38% of the time" — so cold-start customers are
  already modeled on day one. Each restaurant that joins improves the priors
  for the next. This is the Toast-scale flywheel applied to *behavior* rather
  than payments.

### 2.4 AI workflows that eliminate managerial decisions
Today a manager *decides* who to text, what to comp, which regular is slipping.
Replace the decision, not the dashboard:
- **Auto-retention:** churn-hazard crosses threshold → system drafts and (on
  approval, then fully auto at maturity) sends the right offer on the
  consented channel. Built on `customer-segments` + the new hazard model +
  `campaigns/triggers` + the per-channel consent flags already in `customers`.
- **Auto-attach at the POS/online:** the cart surfaces *this customer's* proven
  attach, not a generic rule (extends `src/lib/upsell.ts` with per-customer history).
- **Pre-cognition for staff:** when a known phone books or walks in, the floor/
  POS shows "usually orders X at this time; reorder?" before they speak.

### 2.5 The 10x advantages
1. Predicts the *next order's contents and timing*, not just "you have 230 points."
2. Cross-channel identity (one guest = one record across web/WhatsApp/dine-in) — aggregators can't.
3. Network priors solve cold-start — competitors' models are empty on day one forever.
4. Margin-aware retention (spend comp dollars only where CLTV justifies it — `ltv-cac.ts`).
5. Consent-correct by construction (per-channel flags + GDPR export/erase already shipped).

### 2.6 How it strengthens the others
- Feeds **Demand Exchange**: "who will show up" is the demand forecast's strongest feature.
- Feeds **Floor Twin**: known party → predicted dwell + spend velocity → smarter seating.

### 2.7 The moat
- **3-year:** the operator's customer intelligence (CLTV models, churn, attach
  graphs, segments) lives only here; leaving means going blind on their own regulars.
- **10-year:** cross-restaurant identity — a guest recognized across venues —
  becomes infrastructure (the "Plaid for restaurant customers"). New entrants
  face a behavioral dataset they cannot buy at any price.

### 2.8 Why the restaurant becomes operationally dependent
Retention, comps, staffing-to-regulars, and marketing spend all route through
the graph's decisions. Turning it off doesn't lose a feature — it loses the
ability to know which regulars are leaving and what they'll order.

---

## 3. Module 2 — Slots/Booking → **Restaurant Demand Exchange**

### 3.1 The hidden monopoly
Restaurants optimize food and labor but treat **time as free**. Today a slot
is literally `TimeSlot { maxOrders, currentOrders }` (`src/data/types.ts:361`)
— a static counter with a hard `currentOrders >= maxOrders` cutoff
(`src/lib/slot-capacity.ts`, enforced atomically in `incrementSlotOrders`,
`src/lib/store.ts`). The monopoly is reframing that counter as **seat-minute
inventory** and running airline-style yield management on it: a slot is a unit
of perishable inventory with a clearing price, not a row that fills up.

### 3.2 The proprietary dataset
Per `slotDate · slotTime × location × fulfillment`:
- **Realized fill** (`currentOrders/maxOrders`) — captured today, but only as a
  daily `SlotUtilization` roll-up in insights, never as a learnable series.
- **Throughput reality** — the gold we already log: `kds_tickets`
  (`firedAt → readyAt/bumpedAt`, `promisedReadyAt`) gives `getKdsServiceHistory`
  (on-time %, throughput series) and `getKdsStationAnalytics` (p50/p95 bump,
  throughput/hr). This is the *true* capacity ceiling, per station.
- **The missing-but-decisive signal (instrument this):** **rejected demand** —
  the guests who hit `isSlotFull()` and bounced. We don't log it yet. Capturing
  "offered-but-full" + "searched-no-slot" events turns fill-rate into a real
  **demand curve** (demand can exceed capacity), which is exactly the asset no
  competitor has because they never saw the turned-away guest.
- Plus no-show hazard (from `Reservation.status = "no-show"`), and the
  demand curve by daypart/weekday/weather/event.

### 3.3 Smarter with volume
More bookings → tighter per-slot demand distributions → the system learns each
restaurant's *true* capacity (the **throughput ceiling** from `analyzeTruck()`
and the realized `p95BumpMs` per station in `getKdsStationAnalytics`, not the
naive seat/`maxOrders` count) and prices/throttles accordingly. `ai/forecast.ts`
already forecasts *daily* order volume (Claude + MA fallback, 80% band); the
build pushes it to **per-slot, per-category** resolution so we can predict
*which station* a given evening will bottleneck — a gap the current daily-only
forecast can't fill.

> **Status — keystone + first decision shipped.** The **Demand view** on
> `/admin/slots` (`src/lib/demand-exchange.ts`, `GET/POST
> /api/admin/demand-exchange`) forecasts covers per slot from same-weekday
> history, compares against the kitchen's *demonstrated* covers/hour ceiling,
> and prescribes the yield action (raise / trim / protect / hold). It
> **instruments rejected demand** — every checkout that hits a full slot logs a
> signal (`recordDemandSignal` → `demand-signals.json`), so fill-rate becomes a
> real demand curve. **Phase 2 (the act) is live with both yield levers:**
> one-click **Apply** resizes capacity for demand the kitchen can take, and for
> **kitchen-capped (`protect`)** slots it sets a **minimum spend** (sized from
> the slot's realized AOV) — raise price when you can't raise volume. **Apply
> all** re-derives the board server-side and applies capacity + min-spend to
> every changed slot (audit-logged `slots.resize`, capacity never below booked).
> The minimum is enforced end-to-end: exposed on the public `/api/slots`,
> shown on the cart slot picker, and gated server-side at checkout
> (`below_min_spend`). **Module 2 is product-complete.** Future refinement:
> per-category / per-station demand resolution.

### 3.4 AI workflows that remove decisions
- **Dynamic capacity:** auto-open/close and auto-resize `maxOrders` from
  predicted demand × kitchen throughput — promotes `pace-steering.ts`
  (`deriveSteeringPlan`'s `deliveryCapNextWindow`, `makeNow`, `throttle`) from
  a recommendation the manager reads to an action the system takes.
- **Yield actions:** on predicted over-demand, auto-raise dine-in minimum spend,
  prioritize high-CLTV guests (join to Module 1), and *deflect* overflow to
  pickup (protecting the bottleneck station the pace engine already identifies).
- **Overbooking model:** book to predicted-show, not to seats, using no-show
  hazards from `Reservation.status` history.

### 3.5 10x advantages
Time becomes revenue-optimized, not merely scheduled; capacity is
**throughput-true** (kitchen-aware), not seat-count-naive; demand-shaping fills
troughs via Module 1 targeting; cross-channel (the same engine governs
dine-in, pickup, delivery slots).

### 3.6 Strengthens the others
Reservations with party + time + predicted-show flow into the **Floor Twin** as
a forward-looking seating plan; high-value demand routes to the **Customer
Network** for trough-filling campaigns.

### 3.7 Moat
- **3-year:** the restaurant's demand curve + true throughput ceiling are
  proprietary; pricing/throttling decisions can't be replicated externally.
- **10-year:** a cross-restaurant **demand exchange** — neighborhood-level,
  weather- and event-adjusted demand as a data product (and eventually a
  marketplace that reallocates overflow demand between venues).

### 3.8 Operational dependence
Once capacity, minimum-spend, and slot pricing are auto-managed against the
kitchen's real ceiling, manual scheduling can't match the revenue and the
operator won't go back to a static grid.

---

## 4. Module 3 — Tables/Floor → **Real-Time Restaurant Digital Twin**

### 4.1 The hidden monopoly
The floor is currently a status board: `FloorTable.status ∈ {available,
seated, reserved, out-of-service}` (`src/data/types.ts:556`) plus
`findReservationConflicts()` double-booking guard (`src/lib/floor.ts:39`). The
monopoly is a **live economic simulation of the room** where every table is a
revenue unit with a predicted turn-time, dwell, and spend velocity —
Palantir-for-the-room. The operator stops reading status and starts receiving
*moves*.

### 4.2 The proprietary dataset
Per `tableId`: turn-time and dwell distribution, spend velocity, server
performance, bottleneck propagation. What we have vs. what to instrument:
- **Have:** the join keys (`Order.tableId`, `Order.partySize`,
  `Order.coursing.{fired,held}`), reservation windows
  (`Reservation.durationMin`, default 90), and — critically — the kitchen's
  realized timing per order from the `kds_tickets` ledger.
- **Instrument (Phase 1):** realized dwell. Reservations carry only `createdAt`
  today — no `seatedAt`/`completedAt`. The `FloorTable.status` transitions
  (available→seated→available) and the dine-in order's `paidAt` are the cheap
  way to start logging *actual* turn-times. **`durationMin` is a planned
  number; the moat is the realized one.** Once we log seat→pay→clear, dwell and
  spend-velocity become a learnable per-table series.

The twin fuses `floor.ts` (room state) with `kds-prediction.ts` (per-ticket
`predictedReadyAtMs`, `atRisk`, bottleneck) into one forward simulation.

> **Status — keystone shipped (v1).** The **Twin view** (Service › Floor, `/admin/service?view=floor`)
> (`src/lib/floor-twin.ts`, `GET /api/admin/floor-twin`) derives per-table
> realized turn-time + spend velocity, live occupancy and a predicted free-in
> time, and a **predictive-seating recommender** (party size → best-fit open,
> then soonest-to-free). **Realized dwell is now instrumented** (§4.2): table
> status transitions are logged (`saveTable` → `recordFloorEvent` →
> `floor-events.json`) and seated→cleared pairs give *measured* seat-occupancy
> turn-time + an exact live seat time; tables with no transition history yet
> fall back to the dine-in order-timeline proxy (`createdAt → paidAt`).
> **Phase 2 (the acts) is live:** Seat / Clear straight from the Twin (flips the
> status, logs the transition — so operating the floor from the Twin is what
> feeds the measured-dwell loop), and **bottleneck pre-emption** — the Twin runs
> the live KDS pace engine (`analyzeTruck`) and warns "Kitchen overloaded — pace
> new seating" with the bottleneck station. **Module 3 is product-complete.**
> Future refinement: explicit reservation-arrival seating + auto-hold seating
> when the kitchen is in the red.

### 4.3 Smarter with volume
Turn-time and dwell predictions sharpen per table and per server with every
cover; the room's behavioral physics (which sections turn fast, where service
slows) become a calibrated model unique to that floor.

### 4.4 AI workflows that remove decisions
- **Predictive seating:** "seat the 4-top in section B; table 12 frees in ~11
  min; table 7 will order dessert" — the manager gets the move, not the data.
- **Bottleneck pre-emption:** kitchen bottleneck predicted in 14 min (already
  computable from `analyzeTruck`) → auto-pace seating + hold a slot.
- **Server load balancing:** auto-route the next party to the server with
  capacity and the best turn-time, not the manager's gut.

### 4.5 10x advantages
The room self-optimizes (Autopilot for the floor); seating is throughput- and
CLTV-aware; turn-times are predicted, not observed-after-the-fact; the twin is
the single source that reconciles reservations, walk-ins, kitchen pace, and spend.

### 4.6 Strengthens the others
Turn-times → **true capacity** for the Demand Exchange (closing the loop on
slot sizing). Predicted dwell + party identity → **Customer Network** spend
models. The floor proves or refutes the slot forecast in real time.

### 4.7 Moat
- **3-year:** the calibrated turn-time/dwell physics of *this* room can't be
  exported; the operator's seating intelligence lives here.
- **10-year:** standardized floor telemetry across the network = the
  **operational benchmark layer** for hospitality (the "Bloomberg terminal"
  for restaurant operations).

### 4.8 Operational dependence
When seating, pacing, and server assignment are system-driven and demonstrably
beat the manager, the floor literally runs on the twin.

---

## 5. The cross-module flywheel (where the value compounds)

```
        Customer Identity Network  ──"who shows up + what they spend"──▶  Demand Exchange
                 ▲                                                              │
   "spend models,│                                                 "fill troughs,│
    attach, churn"│                                                  yield targets"│
                 │                                                              ▼
            Floor Digital Twin ◀──"forward seating plan, predicted-show"── (reservations)
                 │   ▲
   "true turn-   │   │ "bottleneck in 14m → pace seating + hold slots"
    time → true  │   │
    capacity"    ▼   │
              KDS Pace engine (analyzeTruck) — the shared real-time clock
```

Every loop tightens the others: identity sharpens demand → demand shapes the
floor → the floor reveals true capacity → true capacity corrects demand → and
the kitchen pace engine is the heartbeat all three read. **One restaurant
running all three for a year produces a dataset that a competitor with three
separate best-in-class apps can never assemble**, because the value is in the
joins, and the joins only exist when one company owns all three sensors.

---

## 6. The data-network-effect ladder (smarter with volume, formally)

1. **Per-entity learning:** error falls with each customer/slot/table's own history.
2. **Per-restaurant calibration:** the venue's behavioral physics (attach rates, turn-times, demand curves) calibrate.
3. **Network priors:** new restaurants inherit population models → no cold start.
4. **Cross-restaurant products:** benchmarks, demand exchange, cross-venue identity — only possible at network scale, and self-reinforcing.

---

## 7. Moats & lock-in summary

| | 3-year moat | 10-year moat | Switching cost created |
| --- | --- | --- | --- |
| **Customer Network** | Operator's CLTV/churn/attach models live only here | Cross-venue guest identity = infrastructure | Lose visibility into your own regulars |
| **Demand Exchange** | Proprietary demand curve + true throughput ceiling | Neighborhood demand data product / marketplace | Revenue drop from reverting to static slots |
| **Floor Twin** | Calibrated turn-time/dwell physics of the room | Hospitality operational benchmark layer | Floor decisions revert to gut |
| **Combined** | The `customer × time × seat × pace` join | Industry transaction-intelligence infrastructure | The restaurant runs *on* the OS, not *with* it |

---

## 8. Roadmap: SaaS tool → Operating System → Industry infrastructure

**Phase 0 — Unify (weeks).** Pull the scattered intelligence
(`cohort`, `ltv-cac`, `customer-segments`, `crm`, `kds-prediction`,
`pace-steering`, `ai/forecast`) behind three coherent product surfaces inside
the Core Guest hub + Slots + Floor. No new science — just stop shipping reports
and start shipping one intelligence object per module.

**Phase 1 — Predict (the keystone builds).**
- Customer Intelligence engine: per-customer temporal signature, attach rules, next-order + churn hazard.
- Slot demand engine: per-slot forecast at throughput-true capacity.
- Floor twin: per-table turn-time/dwell/spend-velocity prediction.

**Phase 2 — Decide (remove the manager).** Turn each prediction into an
auto-action with an approval gate that decays to full autonomy as accuracy is
proven: auto-retention sends, auto-capacity/min-spend, auto-seating moves.
This is the SaaS→OS transition: the product stops informing and starts operating.

> **Status — first decision shipped, now acting end-to-end.** Auto-retention is
> live: the **Win-back** worklist (`src/lib/retention.ts`, `GET/POST
> /api/admin/retention`, the Win-back tab in the Loyalty view) decides *who* is
> slipping (churn hazard), ranks by value-at-risk, and prescribes the incentive,
> the consented channel and the drafted message. Approving grants the incentive
> on the real ledger **and sends** the message on the consented channel
> (`getSmsProvider`/`getEmailProvider`, opt-outs honoured, audit-logged); **Send
> all reachable** runs the whole queue in one click — the decay-to-autonomy
> lever. Sends degrade to a logged no-op when no provider is configured.
> **Demand Exchange Phase 2 is complete** — capacity resize + minimum-spend on
> `protect` slots + "apply all" (`slots.resize`), with the minimum enforced at
> checkout. **Floor Twin Phase 2 is complete** — Seat / Clear from the Twin
> (status transition → measured dwell) + bottleneck pre-emption from the live
> pace engine. All three modules now have a shipped Phase-2 act; the SaaS→OS
> transition is demonstrated across the whole platform.

**Phase 3 — Network (infrastructure).** Population priors, cross-restaurant
benchmarks, the demand exchange, and cross-venue customer identity. This is the
OS→infrastructure transition: the platform becomes more valuable to each
restaurant *because* other restaurants are on it — the defining property of a
$10B company rather than a restaurant app.

---

## 9. What we build first (the keystone) and how we'll know it worked

**Keystone:** the **Customer Intelligence engine** (Module 1, Phase 1). It is
the highest-leverage starting point because (a) the data is the richest and
fully captured, (b) it is the strongest input to the other two engines, and
(c) it produces a visible "wow" (the system predicting a regular's next order)
that proves the thesis to operators and investors alike.

> **Status — shipped (v1).** Engine `src/lib/customer-intelligence.ts`
> (pure-compute, unit-tested), route `GET
> /api/admin/customer-intelligence?phone=`, surfaced as the per-member
> **Intelligence** dialog in the Loyalty view
> (`docs/design-system/core/modules/loyalty.md`). v1 derives dish affinity,
> the Warsaw-time temporal signature, cadence + churn hazard, conditional
> attach rules, channel mix and the next-order headline. Next: fold these
> features into a churn/next-order *model* scored against the baselines below,
> then feed the graph into the Demand Exchange (who shows up) and Floor Twin
> (predicted spend/dwell).

**Success metrics (all measurable from existing data):**
- Next-order *contents* top-3 hit-rate vs. naive "most-frequent-item" baseline.
- Next-visit *timing* MAE (days) vs. average-interval baseline.
- Churn-hazard precision/recall on the already-defined `lapsed` transition.
- Attach-rate lift when surfacing per-customer attach vs. the generic rule.

If the keystone beats its baselines on real order history, the strategy is
de-risked and Phases 2–3 are funded by results, not faith.
