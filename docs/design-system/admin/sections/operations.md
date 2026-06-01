# Admin — Operations

← back to [Admin README](../README.md)

The pages an operator hits during service to keep the menu live, the
recipes consistent across locations, the kitchen compliant, and the shift
handed over cleanly.

| Page               | Code                                                                 | Role-gate   |
| ------------------ | -------------------------------------------------------------------- | ----------- |
| `/admin/menu`      | `src/components/admin/AdminMenu.tsx`                                 | manager+    |
| `/admin/recipes`   | `src/components/admin/AdminRecipes.tsx`                              | manager+    |
| `/admin/haccp`     | `src/components/admin/AdminHaccp.tsx`                                | staff+      |
| `/admin/waste`     | `src/components/admin/AdminWaste.tsx`                                | staff+      |
| `/admin/handover`  | `src/components/admin/AdminHandover.tsx`                             | manager+    |

> **Slots & Floor live under the Core nav group now.** `/admin/slots`
> (`AdminSlots.tsx`) and `/admin/floor` (`AdminFloor.tsx`) are the
> foundation of running a restaurant, so they were moved out of the
> Operations nav section into **Core** (see
> [`../../core/README.md`](../../core/README.md)). They remain
> **admin-themed** pages — same v2 components, same per-location rules — so
> their anatomy stays documented here (below). Group membership ≠ theme
> ownership.

## Common rules across the section

1. **Live edits, not staged.** Every page here writes through to the
   database on save (no draft-then-publish workflow). Operators need
   today's menu live now, not on next deploy.
2. **Per-location reads, chain-wide writes for recipes only.** Menu /
   slots / floor are per-location; recipes are chain-wide (CLAUDE rule
   10) — a Margherita's formula is the same in Kraków and Warszawa.
3. **Search lives at the top of the page**, before any filter chips,
   never inside a card. Typing should be the operator's first reflex.
4. **Toast on every persisted action.** "Slot activated", "Item marked
   sold out", "Recipe saved" — confirms the write landed.
5. **Bulk select where lists exceed 20 rows.** Menu and slots both
   support multi-select for "mark sold out on all of these" /
   "deactivate all of these" actions.

## Menu — `/admin/menu`

The unified menu surface: the chain catalogue with per-location price /
availability overrides.

- **Header:** `Menu` (h1), location switcher, search input
  (`Search items, descriptions, tags…`), `+ Add item` primary button.
- **Body:** the **management table** (`v2-mng-*` classes) — one row per
  dish with: checkbox, dish name + thumbnail, category, price (per
  location), availability toggle (sold-out one-click), per-location
  badges, row actions (edit, delete, restore).
- **Bulk actions bar** appears when ≥ 1 row selected — bulk price, bulk
  description rewrite, bulk delete.
- **Soft-delete** with restore for 30 days; never hard-delete during
  service.
- **The chain summary row** (`v2-mng-row-meta aria-label="Chain summary"`)
  shows which locations list the dish — operators see at a glance if a
  dish is Kraków-only or chain-wide.

## Recipes — `/admin/recipes`

The recipe board — one card per dish (deduped by base slug; CLAUDE rule
10). No per-location switch.

- **Header:** `Recipes & Ingredients` (h1), no location filter (chain-wide
  by design).
- **Card per dish:** name, formula (ingredient × quantity), per-portion
  cost, per-portion nutrition (`aria-label="Per-portion nutrition"`),
  allergens, the dietary tag row.
- **Per-location price + margin chips** live on the card itself
  (`v2-rcp-locs aria-label="Listed price and margin per location"`) —
  this is the *only* per-location data on a recipe card because the
  listed price is the only thing that legitimately varies per location.
- **Cost-breakdown bar** (`v2-rcp-cost-bar role="img"`) renders the
  ingredient share visually — top contributor first, smallest sliver
  last, accessible label spells out the percentages.
- **"X-only" tag** when a dish isn't on every location's menu — operators
  see the chain coverage from the card.
- **Ingredient catalogue** is shared chain-wide; never expose a
  per-location ingredient list.

## Slots — `/admin/slots`

> Surfaced under the **Core** nav group (foundation of restaurant ops);
> admin-themed page, documented here.

Time-slot availability — operators control which pickup / delivery
windows accept orders today, this week, or are paused.

- **Header:** `Time slots` (h1), location switcher, `+ New slot` primary
  button.
- **Each slot:** the time window, status (`active` / `draft` /
  `paused`), the booking count, primary action (`Activate` / `Draft`).
- **One-tap status toggle** (`persistSlot` writes immediately, toast
  confirms — "Slot activated" / "Slot drafted").
- **Delete** soft-confirms (small portalled dialog), then removes with
  toast — no "are you sure" full-screen interstitial.
- **Per-location.** A Kraków slot doesn't exist for Warszawa.

### Demand view — the yield layer (Module 2)

A third view tab (Day / Week / **Demand**) turns the capacity grid into a
**Demand Exchange** (see
[`../../../strategy/restaurant-os-blueprint.md`](../../../strategy/restaurant-os-blueprint.md)
§3). It forecasts covers per slot from real same-weekday order history and
compares them against the kitchen's *demonstrated* ceiling (busiest realized
covers/hour over the last 90 days), then prescribes the yield action.

- **KPI strip** (reuses `SlotKpi` / `v2-kpi-grid`): predicted covers + fill
  forecast %, advertised capacity, kitchen ceiling (covers/hr), missed demand.
- **Per-slot yield table** (v2 `Table`): each slot's demand tier
  (`under` / `healthy` / `tight` / `over` / `kitchen-capped`), forecast vs
  capacity (+ kitchen ceiling), walked-guest count, and the recommended action
  (`raise → N` / `trim → N` / `protect` / `hold`) as a toned `Badge`, plus a
  notes list for the actionable slots.
- **Two yield levers.** For demand the kitchen *can* take, the action is
  capacity (`raise → N` / `trim → N`). For **kitchen-capped** (`protect`) slots
  — demand above the kitchen's ceiling — raising volume isn't an option, so the
  lever is **price**: a recommended **minimum spend** (sized from the slot's
  realized AOV × 1.5, rounded to 5 zł) shown as a `min N zł` badge. Push the
  average ticket up so fewer, bigger orders fit the line.
- **Apply the recommendation (Phase 2 — the act).** Each changed row carries an
  **Apply** button that writes the demand-matched capacity **and** minimum spend
  (`POST /api/admin/demand-exchange { slotId, maxOrders, minSpendGrosze }` →
  `updateSlot`, audit-logged `slots.resize`); the header's **Apply all (N)** is
  the autonomy lever — it re-derives the board server-side and applies every
  changed slot in one confirmed click. Capacity is never dropped below what's
  already booked; a slot that's no longer capped has its minimum cleared.
- **The minimum is real, not cosmetic.** `TimeSlot.minSpendGrosze` (additive
  `min_spend_grosze` column) is exposed on the public `/api/slots`
  (`SlotPicker` shows "min N zł") and **enforced server-side at checkout** —
  `createOrder` returns `below_min_spend` when the food subtotal is under it.
- **Rejected demand is instrumented.** Every checkout that hits a full slot
  logs a demand signal (`createOrder` → `recordDemandSignal` →
  `demand-signals.json`), so the board can show demand that *exceeded* supply —
  the data a fill-rate counter throws away.
- **Engine:** `src/lib/demand-exchange.ts` (pure-compute, unit-tested);
  `GET /api/admin/demand-exchange?location=&date=`, manager+. No new theme CSS
  — the view is built from existing v2 primitives.

## Floor — `/admin/floor`

> Surfaced under the **Core** nav group (foundation of restaurant ops);
> admin-themed page, documented here.

The dine-in seating map: tables + status, drag/drop layout, party
attribution.

- **Header:** `Floor` (h1), location switcher, `+ Add table` primary.
- **Table card:** number, seats, current status (`open` / `seated` /
  `reserved` / `cleaning` / `out-of-service`), party name (if seated),
  open-tab indicator if a POS tab is attached.
- **Status badges** use the canonical `BadgeTone` ramp (`success`,
  `warning`, `danger`, `info`, `default`) — never invent a new tone.
- **Delete is destructive** — confirmation dialog required
  (`pendingTableDelete`), portalled per the admin portal rule.

### Twin view — the live digital twin (Module 3)

A third view tab (Tables / Reservations / **Twin**) turns the floor into a
live economic simulation of the room (see
[`../../../strategy/restaurant-os-blueprint.md`](../../../strategy/restaurant-os-blueprint.md)
§4). All derived from **real dine-in orders** — the §4.2 realized-dwell signal
is the order timeline (`createdAt → paidAt`), already captured, no
instrumentation.

- **KPI strip** (`FloorKpi` / `v2-kpi-grid`): occupancy %, open tables, median
  turn-time, floor spend/hour.
- **Predictive seating recommender:** type a party size → ranked tables
  (best-fit open first, then soonest-to-free), computed live client-side via
  `recommendSeating(twin, party)` so it updates as the operator types.
- **Live tables table** (v2 `Table`): per-table state (open / seated + party),
  predicted free-in (median turn − elapsed), median turn, spend/hr, turns.
- **Turn-time has two sources.** **Measured** seat-occupancy is the §4.2
  instrumentation: every table status change is logged (`saveTable` →
  `recordFloorEvent` → `floor-events.json`), and seated→cleared pairs give true
  dwell (pre-order wait + bussing); a still-open seated run gives an exact live
  seat time. When a table has no transition history yet, it falls back to the
  dine-in order-timeline proxy (`createdAt → paidAt`). Measured rows wear a
  `measured` badge.
- **Engine:** `src/lib/floor-twin.ts` (`buildFloorTwin` + `recommendSeating`,
  pure-compute, unit-tested; dwell guardrails 5–360m drop stale tabs / clock
  skew); `GET /api/admin/floor-twin?location=`, staff+. Read-only intelligence
  (predictive-seating moves + bottleneck pre-emption are the Phase-2 acts). No
  new theme CSS — built from existing v2 primitives.

## HACCP temperature log — `/admin/haccp`

Per-shift cold/hot-holding checks (audit §11.2). Staff+.

- **Header:** `HACCP temperature log` (h1) + location switcher
  (per-location only — a probe reading belongs to one truck; no
  "all locations" view).
- **KPI grid** (`v2-kpi-grid` + `v2-kds-stat`): readings today, flagged
  today (red when > 0).
- **Log form:** a holding-point `Select` (presets from
  `@/lib/haccp` `HACCP_SENSORS`) + a `°C` `Input`. The safe band + the
  ok/flagged verdict are previewed live from `tempVerdict()` — the same
  client-safe helper the server uses on save, so preview never lies.
- **Readings list:** today's readings with the safe band, value,
  `success`/`danger` status `Badge`, and time. Out-of-range readings
  also raise a danger toast and append a `haccp.temp_flagged` audit row.

## Waste log — `/admin/waste`

Reason-coded write-off capture at the line (audit §11.2). Staff+.

- **Header:** `Waste log` (h1) + location switcher.
- **KPI grid:** entries today + zł written off today (warning-tinted
  when non-zero).
- **Log form:** item + reason (`Select` — spoilage / prep error /
  dropped / over-production / customer return / expired / other) +
  quantity + unit + optional zł cost + note.
- **List:** today's entries, reason `Badge`, cost, time. Distinct from
  the Inventory `waste` stock movement — this is the fast at-the-line
  log, audit-logged as `waste.log`.

## Shift handover — `/admin/handover`

End-of-shift sign-off (audit §11.2 / §12.4 #1). Manager+.

- **Header:** `Shift handover` (h1) + location switcher.
- **Record form:** shift (`open` / `mid` / `close`), a cash-session
  `Select` (fetched from `/api/admin/cash`) + counted-drawer `zł` input
  — the server reconciles the two into a real `cashVarianceGrosze` on
  save — three `Switch` confirmations (temp checks logged / waste
  logged / equipment OK), outgoing (→ incoming) manager, and a comment
  for the next shift.
- **History:** last 7 days, each row showing the shift `Badge`,
  managers, a variance `Badge` on the canonical
  (`success`/`warning`/`danger`) ramp, the three check badges, and the
  timestamp. Audit-logged as `shift.handover`.

## What Operations is not

- It is **not** order management — live orders live under Overview
  (`/admin/orders`) and the Core KDS surface (`/admin/kds`).
- It is **not** stock management — that's Inventory ([`inventory.md`](./inventory.md)).
- It is **not** the POS — the customer-facing order-entry surface is a
  Core module, not an admin page.
- It is **not** marketing / promotions — those live under Growth.

Operations is the **state of the menu, the recipes, and the compliance /
handover logs** — the things an operator must keep correct so service can
run. (Slots + Floor are documented here too, but the nav surfaces them
under the Core group.)
