# OttavianoKDS — Screen-by-Screen Parity Audit

> **Scope & method.** Audits the **operator** app's screens against their web
> counterparts. The native app can't be screenshotted from the backend container
> (SwiftUI is macOS-only), so this is a *source-level* audit: each native screen
> read against the web route it mirrors, the `/api/v1` endpoint it consumes, and
> the design-system contract. Structural IA parity is machine-verified in
> `PARITY-LEDGER.md` (54 surfaces, 52 live, 2 scaffold); this doc covers *does each
> screen render the right thing, the DS way?*
>
> **The web facts below are now resolved** against the canonical Core source
> (`src/core/kds`, `src/core/orders`, `src/core/pos`) — no more "(confirm vs web)"
> guesses. Where native can't match yet, the reason is the `/api/v1` facade
> (missing endpoint or DTO field), called out honestly rather than faked (Rule #1).

Legend: ✅ at parity · 🟡 functional, gaps noted (reason given) · 🏗 scaffold by design.

---

## High-traffic surfaces (deep dive)

### KDS — Kitchen Display (`/core/kds` · `KDSBoardView.swift`) ✅🟡
- **Web (resolved):** three columns — **New** (confirmed) → **Firing** (preparing)
  → **Ready·Expo** (ready); station filters; forward bump (`nextStatus`); a
  **recall** tray (last completions, 10-min window); **predictive at-risk tone
  tiers** + SLA meter + due countdown; a KPI strip; a Chef station make-queue; a
  Fleet (owner) atlas; an 86 dialog; sound chimes; pause; kiosk fullscreen.
- **Shipped — ticket detail parity (this pass):** the v1 order DTO was enriched
  (`schemas.ts`/`order-dto.ts`) so the native **`KDSTicket`** now renders 1:1 with
  the web `TicketCard`: short id + channel chip (party size), **predictive due
  countdown + SLA meter + at-risk pill** (server `prediction` block, computed per
  location via `analyzeTruck` in the board-level `toOrderDTOs`), **coursing-held**
  callout, **station-grouped** lines with **KDS-flagged modifiers** + notes, an
  allergen line, the guest note. Pure tone/timing/grouping in
  `CoreModels/KDSLogic.swift` (shared, mirroring the web `kds-board`/`kds-prediction`).
- **Shipped — board chrome (this pass):** a live **KPI strip** (Open / New /
  Firing / Ready / At risk / Late / Oldest / Avg age, board-derived, on a 2s
  aggregate clock), a **station filter strip**, a **status lane segment** (focus
  collapses to one column), a **Chef** make-queue mode (station queue, oldest-first
  + depth header), a **multi-entry recall tray** (`KDSStore.liveRecents`, 10-min,
  via `POST /api/v1/orders/:id/recall`), and a **pause/resume** SSE control.
- **Shipped — Service OS redesign parity (this pass):** the web Core "Liquid Glass /
  Service OS" interaction pass carried onto the native Pass. `KDSTicket` now shows
  **held courses as per-course `⊘` chips** (fire-later at a glance) and promotes the
  **allergen line to a filled danger callout** (web `.core-tk-alrg` large-danger,
  icon + colour). The board gains a **line-pressure banner** (`KDSBoardView.pressureBanner`)
  — the native twin of the web `PressureBadge`, tiered calm/busy/slammed off the live
  board's late + at-risk counts and oldest age (Rule #1 — derived, never faked).
- **Shipped — Fleet + floor-ops (this pass):** the two facade feeds landed.
  - **Fleet (owner atlas)** — `GET /api/v1/admin/kds/fleet` (owner; pure mappers in
    `fleet-dto.ts`, unit-tested) + a native **`KDSFleetView`** (owner-gated view
    segment, polled by `KDSFleetStore`): cross-truck totals, the promise-accuracy
    benchmark, per-truck tiles (health · counts · pace · urgent-first ticket
    preview). Tile previews reuse the enriched Order, so they match the KDS board.
  - **Done/hr + On-shift KPIs** — `GET /api/v1/admin/kds/floor-ops` (manager+,
    scope-aware, aggregates chain-wide) → two extra KPI cells for manager+ tokens.
  - **86 (eighty-six) dialog** — a native **`EightySixSheet`** (manager+ toolbar
    action): since availability is per-location and the board streams chain-wide,
    the sheet carries its own **location picker**, then reads `GET /api/v1/admin/
    menu?location=` and writes `PATCH /api/v1/admin/menu` to 86 / restore items.
- **Shipped — sound chimes + kiosk (this pass):** `KDSChime` rings a short system
  sound (`AudioServicesPlaySystemSound`, mute-switch-aware, no bundled asset) +
  a success haptic when a genuinely new ticket lands — gated on a toolbar
  **sound toggle** and the pause state, with a `chimeArmed` guard so opening the
  board isn't a burst of dings. A toolbar **Kiosk** action hides the nav bar +
  status bar + home indicator (`.toolbar(.hidden)` · `.statusBarHidden` ·
  `.persistentSystemOverlays(.hidden)`), keeps the screen awake
  (`UIApplication.isIdleTimerDisabled`, UIKit-gated), and shows a floating exit
  button. **Needs on-device confirmation** (audio + idle-timer can't be exercised
  from the Linux container) — the one verification step that wants a Mac/iPad.

### POS — Till (`/core/pos` · `OperatorPOSView.swift`) ✅🟡
- **Web (resolved):** open **tabs**, category **coursing** (fire course-by-course),
  combo discount + cross-sell, Send-to-KDS / Fire-course / Charge. **No split-bill**
  (the nav blurb overstates; the web does coursing, not bill-splitting).
- **Native now:** single-ticket counter sale off the live menu → `ChargeSheet`
  with guest capture + a **Card/Cash** payment step (**`POSKeypad`** cash tender
  with change-due; total stays server-priced via `POST /api/v1/admin/pos/order`).
- **Shipped:** **cross-sell** — `POST /api/v1/admin/pos/suggestions` runs the
  storefront getCartSuggestions engine; native shows add-chips on the ticket bar.
- **Shipped:** **tabs** — `/api/v1/admin/pos/tabs` CRUD + a native Tabs surface
  (open several checks, load one into the ticket, save back, void; charge via the
  counter-sale path).
- **Shipped:** **coursing** — a shared `@/lib/pos/fireTab` actuator (web + v1 fire
  through one implementation) + `/api/v1/admin/pos/tabs/:id/{fire,charge}`; native
  Coursed toggle + Fire-course menu + Charge-tab (courses auto-assign by category).
- **Shipped — check editor + broken-flow fix (this pass):** `fireTab`/`chargeTab`
  hard-require a channel ("Pick a channel first"), but the app opened tabs with no
  way to set one — so native tabs **couldn't fire or charge**. New **`CheckSheet`**
  (off the ticket bar): **channel** picker (dine-in / takeaway / delivery, required),
  dine-in **covers** stepper, delivery **address**, **per-line +/- editing** (was
  add-only — no decrement except Clear), a manual **discount** (percent / amount,
  discounted-total footer preview; server re-prices), and a **park** (hold) toggle.
- **Shipped — facade:** the v1 tab PUT now forwards **`discount`** (was dropped);
  `PosTab` DTO + `PosTabSaveBody` carry `discount`/`address`, with explicit-clear
  encoding (omit = preserve, null = clear). Also fixed a KDS-pass bug where
  `/api/v1/customer/orders` fed `map`'s index as the new `prediction` arg.
- **Shipped — table assignment (this pass):** `GET /api/v1/admin/floor/tables`
  (staff+, read-only twin of web `/api/admin/floor/tables`) + a native table
  picker in `CheckSheet` (dine-in) that seats the check (`tableId`).
- **Honest gaps (not faked — Rule #1):** **Tender method** (Cash/Card) on a *tab*
  charge — the counter sale captures it (`POSKeypad`), the tab charge settles
  without recording the method. (Still *not* split-bill — the web does coursing,
  not bill-splitting.)

### Orders board (`/admin`,`/core/orders` · `OperatorBoardView.swift`) ✅🟡
- **Web (resolved):** scope tabs (current/paid/all) + channel filter + **search**
  (id/guest/phone/table), KPI strip, a **detail dialog** (inspect the full ticket)
  with **Mark paid** (settle) + **Print receipt**. **No "refund"** (the earlier
  audit note was wrong — it's settle + print).
- **Shipped:** **Mark paid** — `POST /api/v1/orders/:id/settle` (idempotent,
  audited) wired into the detail sheet; the DTO already carried `channel`/`paidAt`
  so the native model now decodes them (paid/channel badges + an "unpaid" row
  marker).
- **Shipped:** **Print receipt** — `POST /api/v1/orders/:id/receipt`; native shows
  the printer confirmation or a shareable plain-text preview (no-hardware fallback).
- **Shipped:** **channel dropdown** filter.
- **Shipped — board parity (this pass):** the KPI strip now mirrors the web's
  **business** metrics (Orders **today** / **Current** / **To pay** / **Paid
  today** revenue) instead of raw status counts (the sections still show those);
  the scope toggle is the full **Current / Paid / All** (was Current/All); dine-in
  rows + the detail sheet resolve **table numbers** (via the new
  `GET /api/v1/admin/floor/tables`, loaded per board location since the board is
  chain-wide) and **search now matches on table**; the detail sheet shows the
  **seating line** (table · party size). No facade change — the order DTO already
  carries `tableId`/`partySize`/`channel`/`paidAt`.

### Dashboard (`/admin` · `OperatorDashboardView.swift`) ✅
- **Native now (institutional uplift):** a live-ops strip (board counts + board
  total) over a **range-scoped executive KPI rail** — Revenue / Orders / Avg
  ticket / Margin as **`OperatorKPICard`**s with inline sparklines and **true
  period-over-period deltas** (current window vs the equal prior window), a
  7d/30d/90d **`DSSegmented`** control, an **`OperatorAreaChart`** revenue trend,
  **`OperatorHourBars`** daypart demand, the fulfilment ring, and a top-seller
  **`OperatorLeaderRow`** board. Driven by `GET /api/v1/orders` (live) +
  `/admin/summary?from=&to=` (current + prior) + `/admin/insights` (daypart).
  Every KPI keeps a five-section ⓘ (Rule #12).

### Institutional analytics uplift (this pass) ✅
The four flagship analytics surfaces moved from flat tile/row grids to the web's
institutional vocabulary, on a new shared kit (`DesignSystem/Analytics.swift`,
see DESIGN-SYSTEM §4.2) + range scaffolding (`OperatorAnalyticsSupport.swift`):
- **Reports** — 7d/30d/90d range chips that re-scope `/admin/summary?from=&to=`,
  a six-card KPI rail with sparklines + prior-window deltas, an area revenue
  chart, a **P&L waterfall**, and a **net-margin gauge** (fills toward the 25%
  top-decile). All six KPIs + the waterfall carry five-section ⓘ.
- **Insights** — a cancellation-rate **gauge**, daypart **hour bars**, top/worst
  seller **leaderboards** (magnitude bars), and a cross-location revenue/profit
  **comparison** + per-site KPI cards. KPIs carry five-section ⓘ.
- **Calculator** — now a **live what-if sandbox**: drag the five exposed levers
  (orders/day, days open, avg ticket, food cost %, card %) and the year-1 KPIs
  (with vs-saved deltas), a P&L **waterfall**, a sensitivity **tornado** (±10%
  per lever) and an orders×ticket **profit-map heatmap** all recompute live. The
  math is anchored to the server's saved `projectTwelveMonths` projection
  (reproduces year-1 exactly at baseline; labour + fixed held at saved, clearly
  labelled — Rule #1) and never writes the scenario. The saved 12-month curve is
  drawn as an area chart. Eleven five-section ⓘ explainers.

### Institutional analytics uplift — wave 2 (this pass) ✅
Extended the kit (`OperatorScatter`, `OperatorBandChart`) and carried the
institutional treatment into the next tier of surfaces:
- **Menu engineering** — the Kasavana-Smith matrix as a real **scatter**
  (units × GP/unit) with a median crosshair + tinted quadrants, a 30/60/90-day
  window control, quadrant KPI rail, and a revenue-ranked dish list. Matrix ⓘ.
- **HACCP** — per-sensor **temperature trend** charts over the observed
  compliant band (out-of-band readings flagged red), a flagged-rate **gauge**,
  and per-sensor latest/band/flagged stats. Keeps the live log action. Two ⓘ.
- **Cash** — a **variance trend** across closed sessions, a KPI rail (sessions,
  open, drops, abs variance with sparkline), and the session list + open-till
  action. Variance ⓘ.
- **Inventory** — each row gained an **on-hand-vs-par meter** with the reorder
  point as a benchmark tick (no fabricated history — the facade has none).
- **Agent HQ** — a 7-day success **gauge**, a **cost-by-agent donut**, an agent
  **spend leaderboard**, fleet KPI cards and the activity timeline. Three ⓘ.
- **Multi-location** — a **revenue-share donut**, a revenue-vs-profit
  **comparison**, a **margin leaderboard** + per-site KPI cards, chain KPI rail.
  Chain-margin ⓘ.
- **KDS Fleet** — a **promise-accuracy gauge** + per-hour pace header
  (throughput / covers / revenue) on the owner Atlas board, off the real
  `/admin/kds/fleet` station-capacity feed. Fleet-pace ⓘ.

### Core UX overhaul (this pass) ✅
The Core front-of-house surfaces were functionally wired but visually thin /
cramped. This pass rebuilds their layouts to a polished, iPad-first standard.
- **POS (`/core/pos`)** — rebuilt from a single scrolling list + crammed bottom
  bar + three sheets into a proper **split-pane till**: a top **open-checks strip**
  (chips with line-count badges, Quick-sale, + New, context-void), a **menu grid**
  (category rail + live search + tappable item cards with qty badges and 86-state)
  on the left, and an **always-visible Check panel** on the right (channel +
  covers/table or delivery address, line steppers, cross-sell, inline discount,
  coursing, totals, Fire/course/Charge). Adaptive: on iPhone the panel becomes a
  cart-bar → sheet. A counter-sale ticket can be promoted to a saved check. Same
  `OperatorPOSStore` actuator (server-priced, combos/discount/coursing resolve
  server-side). The walk-in cash keypad (`ChargeSheet`) is retained.
- **Service (`/core/service/slots`)** — rebuilt from a flat list into a capacity
  board: a KPI strip (slots · booked · capacity · **fill-rate gauge**), slots
  **grouped by day** with per-day load, and per-slot rows with a green→amber→red
  **capacity fill bar**, channel chips, a min-spend badge and active/draft status.
  Tapping opens the existing capacity/status editor. Two five-section ⓘ.
- **Guest (`/core/guest`)** — rebuilt the loyalty roster with a KPI strip
  (members · new-30d · **birthdays this month** · contactable), search + sort
  (recent / A–Z) and richer member cards. Two five-section ⓘ.

### Operator ergonomics — substrate UX uplift (this pass) ✅
"Keep the web's complexity, make it smoother on touch" — applied to **every**
list-based admin/core page at once by upgrading the shared `OperatorListView`
substrate (`OperatorData.swift`) rather than 25 screens individually:
- **Quick-filter chips** — a tap-to-narrow chip bar (each chip shows its live
  count) so an operator slices a dense board without scrolling. New optional
  `filters:` param (`OperatorFilter<T>`).
- **Sort menu** — a toolbar sort control with the active order checked. New
  optional `sorts:` param (`OperatorSortOption<T>`).
- **Pinned search + result count** — search stays reachable and a "N of M"
  caption shows when the list is narrowed.
- **Glanceable detail sheets** — `OperatorDetailSheet` now opens at a
  medium/large **detent** (drag to expand) instead of a full-screen slab, so a
  drill-in is a glance, not a context switch — across every surface that uses it.
All additive + backward-compatible: every existing call site keeps working and
gains the base ergonomics (pinned search, result count, refined chrome) for free.
Bespoke filters/sorts now wired into **every** `OperatorListView` surface (22):
Customers (VIP / has-points / lapsed), Staff (active/inactive), Suppliers,
Inventory (low-stock), Users (active / MFA), Business costs, Compliance (expired /
expiring-30d), Events (upcoming / live / done), Waste, Surveys (active/off),
Schedule (scheduled / in-progress / done), Recipes, Alerts (unread),
Announcements (pinned), Corporate, Manage-locations (active / off / alcohol),
Campaigns (sent / sending / failures), Handover (issues), Expansion (in-progress /
ready), Scheduled-bundles (active/paused), Regulatory (calorie / halal) — each with
a matching sort set. The 2 non-list admin pages (Permissions matrix, settings
renderer) keep their bespoke layouts.

### Core completion — Floor plan, Guest hub (CRM + Booking) (this pass) ✅
Closed the big CORE functional gaps with real `/api/v1` facade routes (each a thin
proxy over existing store logic; backend typechecks clean) + native screens:
- **Service → Floor plan** (`OperatorFloorView`, hub `OperatorServiceView`
  segments Floor | Slots): live room off `/api/v1/admin/floor/twin` — occupancy
  gauge, covers-seated / freeing-≤15m / spend-per-hour KPIs, kitchen-bottleneck
  banner, zone-grouped status-toned table tiles with party / dwell / predicted-free
  / open-check, tap-to-seat/clear, table detail (service note, turns). Location
  picker off `/locations`. Two five-section ⓘ.
- **Guest → hub** (`OperatorGuestView` now segments **Inbox | Guests | Loyalty |
  Concierge | Book** — full five-tab parity with the web subbar `guestTabs.ts`):
  - **Guests (CRM)** — roster (filters/sorts) → rich profile off
    `/api/v1/admin/customers/:phone`: lifetime/orders/avg/points stat band, recent
    orders, **points adjust**, **SMS/email consent toggles**, and **notes**
    (add/delete) — all real writes via the new `/notes`, `/consent`, `/points`
    facade routes.
  - **Book** — slot+table **booking console** off `/api/v1/admin/floor/booking`
    (+ `/reservations`): pick a dine-in slot + best-fit table, party, guest,
    override; list + cancel upcoming bookings. Reuses the shared `createBooking`.
- POS **member-attach** + **QR queue** shipped in the prior pass (existing endpoints).

### Guest → Inbox + Concierge — the last two CORE tabs (this pass) ✅
The two Guest sub-tabs previously listed as honest gaps are now live, on thin
`/api/v1` proxies over the existing WhatsApp + concierge stores (backend
typechecks clean; **verified live** against `npm run dev`).
- **Inbox** (`GuestInboxTab`, mirrors web `CoreInbox` / `/core/guest/inbox`) —
  `GET /api/v1/admin/whatsapp` returns the **merged conversation list** (live
  WhatsApp sessions overlaid on historic transcript heads — a 1:1 port of the web
  `mergeConversations`) plus a derived channel **KPI strip** (chats · live ·
  to-pay · 7-day conversion), in one call. Tapping a row opens the **transcript
  thread** (`GET /api/v1/admin/whatsapp/:phone`) with chat bubbles (actor-toned,
  inbound/outbound) and an **operator reply composer** (`POST …/:phone/message`).
  The reply only delivers inside Meta's 24-hour window; outside it (or with the
  provider unconfigured) the facade returns `service_unavailable` and the app
  surfaces the real reason rather than faking a send (Rule #1). Audited like the
  web path. *Verified:* merge overlays a live session's cart/pending-pay onto its
  head; empty phone → 422; conversion KPI computes (1 paid / 2 inbound → 50%).
- **Concierge** (`GuestConciergeTab`, mirrors web `CoreConcierge` /
  `/core/guest/concierge`) — `GET /api/v1/admin/concierge` (manager+) returns the
  six **MCP capabilities** from the same `CAPABILITY_META` + `getConciergeSettings`
  the web page and the public `/api/agent/:capability` endpoint read, with each
  capability's live/hidden **exposure**, the two **transports** (HTTP read API +
  WhatsApp webhook), and the `whatsAppConfigured` flag. Now a **full write surface**:
  `PATCH /api/v1/admin/concierge` ({ capability, exposed }, manager+, audited
  `concierge.exposure.set`) flips a capability live — the native tab renders a real
  per-capability **`Toggle`** (optimistic, reverts on failure, VoiceOver switch with
  label/value/hint), so hiding `place_order` takes it offline for agents instantly,
  exactly like the web. No secrets are ever returned; provider tokens stay in env.
  *Verified live:* toggle hides/restores + `liveCount` tracks; unknown capability →
  422, missing `exposed` → 422, no token → 401.

**Honest scope note.** Still deliberately deferred (need endpoints/data not yet
present, or genuinely new server logic): the **POS split-bill** (splitting an order
into N checks — no server function exists). These remain honest gaps rather than
mocked surfaces (Rule #1). (Slots **Demand-Exchange** is now live — Service hub
**Floor | Slots | Demand**, off `/api/v1/admin/demand-exchange`.)

---

## Wave D — first write surface beyond the existing ones (done this pass)

The Admin write surfaces that already had `/api/v1` endpoints (HACCP, Waste,
Cash, Announcements, Feedback, Purchase orders, Menu 86, Tasks) keep their
actions. Wave D opens the **first new write** that needed facade work:
- **Inventory adjust** — new `POST /api/v1/admin/inventory` (manager+, scope-
  gated, `{ ingredientId, locationSlug, delta, reason? }`) records an `adjust`
  stock movement through the shared `createStockMovement` (same path the rest of
  the app uses, so audit history + on-hand stay consistent). **Verified live**
  against `npm run dev`: +12 → 12, −4 → 8, GET reflects it, unknown id → 404,
  delta 0 → 422, missing token → 401.
- **Native:** `StockDetailView` became a stateful sheet — a ±stepper with a live
  "→ N on hand" preview and an Apply button that POSTs, updates on-hand in place
  and reloads the list. `OperatorListView.detail:` now passes a `reload` closure
  (same contract as `toolbar:`), so any detail sheet can write-then-refresh.

**Service slots — capacity + status (this pass).** New `PATCH /api/v1/admin/slots`
(manager+, scope-gated, `{ id, maxOrders?, status? }`); `maxOrders` can't drop
below the booked count. Native `SlotDetailView` — a capacity ±stepper (floored at
the booked count) + an Active toggle (draft⇄active) → PATCH + reload. **Verified
live:** capacity 40→45, below-booked → 422, status flip ok, unknown → 404, no
token → 401.

**Events — lifecycle status (this pass).** New `PATCH /api/v1/admin/events`
(manager+, `{ id, status }` ∈ {scheduled, live, done, cancelled}); re-saves via
`saveEvent` so revenue/attendance persist. Native `EventDetailView` — a status
chip row (`FlowStatusRow`) → PATCH + reload. **Verified live:** scheduled→live→
done with fields preserved, invalid → 422, unknown → 404.

**Compliance — renew (this pass).** New `PATCH /api/v1/admin/compliance`
(manager+, scope-gated, `{ id, expiresAt }`) sets the new expiry and stamps
`lastRenewedAt`. Native `ComplianceDetailView` — +6mo / +1yr / +2yr renewal-term
chips (the app computes the date) → PATCH + reload. **Verified live:** expired →
renew to 2027 → expired=false + lastRenewedAt set; invalid date → 422, unknown →
404, no token → 401.

**Schedule — shift status (this pass).** New `PATCH /api/v1/admin/schedule`
(manager+, scope-gated, `{ id, status }` ∈ {scheduled, in-progress, done,
missed}); re-saves via `saveShift` so times/staff/role persist. Native
`ScheduleDetailView` — a `FlowStatusRow` status row → PATCH + reload. **Verified
live:** scheduled→in-progress→done with fields preserved, invalid → 422,
unknown → 404, no token → 401.

**Shift handover — record (this pass).** New `POST /api/v1/admin/handover`
(manager+, scope-gated; `{ locationSlug, shift, outgoingManager, tempChecksOk,
equipmentOk, wasteNoted?, incomingManager?, managerComment? }`, shift ∈ {open,
mid, close}). Native `NewHandoverButton` → `NewHandoverSheet` (location · shift
segmented · outgoing/incoming manager · the two safety toggles + waste-noted ·
comment) → POST → reload, on the toolbar-create pattern. **Verified live:**
valid → 201 + GET shows it, bad shift → 422, missing booleans → 422, no token →
401.

**Wave D is now complete across every named surface.** Detail-drill-in + write
spans **Customers, Staff, Guest, Suppliers, Stock (adjust), Service slots
(capacity/status), Events (status), Compliance (renew), Schedule (status)**, and
the create-form surfaces (**HACCP, Waste, Cash, Announcements, Handover**) plus
the per-row write surfaces (**Feedback, Purchase orders, Tasks, Menu 86**). The
last hardware-bound items — **KDS sound chimes + kiosk fullscreen** — are now
implemented too (system-sound chime + kiosk chrome-hide/keep-awake); only their
**on-device confirmation** remains, the single step that needs a Mac/iPad.

## Wave C — CORE depth + detail-sheet breadth (partial this pass)

Extends the Wave A drill-in and Wave B ⓘ patterns across CORE + more of Admin:
- **Guest (loyalty) profile sheet** (`/core/guest`) — member identity + contact +
  signed-up / birthday tiles. Spend/points stay on the Customers record (keyed by
  phone), not duplicated/invented (Rule #1).
- **Supplier** and **Stock-item** detail sheets — contact + lead time + notes;
  on-hand vs par vs reorder with the server's low-stock verdict.
- **Dashboard money KPIs** (board revenue, avg ticket) gained five-section ⓘ
  explainers.
Detail drill-in now covers **Customers, Staff, Guest, Suppliers, Stock**; the
pattern keeps extending.

**Honest gaps in Wave C (not faked):**
- **KDS sound chimes / kiosk fullscreen** — now implemented (see the KDS section
  above); only on-device confirmation remains.
- **Service slot editing** — a write surface; needs a `/api/v1/admin/slots`
  mutation endpoint (read-only today). Tracked with Wave D.

## Wave B — analytics + five-section ⓘ explainers (done this pass)

Brings the web's charted analytics and its Rule #12 metric explainers to native.
- **`MetricExplainer` + `InfoButton`** (`DesignSystem/Explainers.swift`) — native
  twin of `src/admin-v3/ui/Explainer.tsx`: every ⓘ opens a sheet with the five
  required sections in the fixed order/labels (description → INSTITUTIONAL
  ANALYSIS → IN PLAIN TERMS → TIPS → METHODOLOGY); all five props required so a
  stub won't compile.
- **Chart primitives** (`DesignSystem/Charts.swift`) — `OperatorBarChart`,
  `OperatorDonut`, `OperatorBarRow`, hand-rolled (no Swift Charts API surface).
- **Reports rebuilt** — six KPIs each with a full ⓘ explainer; the "by day" text
  list became a 14-day **revenue bar chart**; fulfilment mix became a **ring +
  legend**; top sellers gained **magnitude bars**. All off `summary` (Rule #1).
The same `InfoButton` now seeds the remaining KPI surfaces (Dashboard, Cash,
Calculator, Insights, Menu engineering) as they're polished. Preview:
`tests/sketches/ottaviano-kds-wave-b-analytics-explainers.html`.

## Wave A — rich rows + detail drill-in (done this pass)

Admin list surfaces were flat single-line rows with no inspect path; the web
admin opens a detail dialog on click. Native now mirrors that:
- **`OperatorListView` gained an opt-in `detail:` projection** — supply it and
  every row becomes tappable (chevron affordance) and presents a sheet via
  `.sheet(item:)`. Purely additive; inert without it.
- **Shared sheet primitives** (`OperatorDetail.swift`): `OperatorDetailSheet`
  (gradient initials/icon avatar + title + status badge + contact meta lines,
  Done-dismiss, drag indicator), `OperatorStatTile` / `OperatorStatBand` (the
  header stat band), `OperatorMetaRow`, and a list-row `Avatar`.
- **Customer profile** — VIP chip + recency + points on the row; sheet shows
  lifetime / orders / points / avg-ticket tiles, contact + member-since, notes,
  opt-out badges. **Rule #1:** every field comes from the `AdminCustomer` DTO —
  recent-order history is *not* faked; it needs a customer-scoped orders endpoint
  (tracked facade gap).
- **Staff card** — sheet shows rate + role tiles, contact, hire date, status,
  notes. Upcoming shifts stay on the Schedule surface (not duplicated/faked).

The same `detail:` pattern extends to the remaining surfaces as their DTOs (or
new facade endpoints) justify a drill-in. Preview: `tests/sketches/
ottaviano-kds-wave-a-detail-sheets.html`.

## Shell + navigation polish — done this pass

The operator rail is the one surface seen across all 54 screens, so it got the
visual + usability pass first (`OttavianoKDSApp.swift`):
- **Branded identity header** — a tappable card (mark · operator · role badge ·
  on-shift dot) replacing the bare wordmark; opens the account sheet.
- **`.searchable` over the whole IA** — filters `OPERATOR_NAV` live on label +
  blurb, empty sections drop, no-match → `ContentUnavailableView.search`; prompt
  counts the role's reachable surfaces.
- **`OperatorNavRow`** — icon-chip + label rows (web-rail parity); scaffolds
  carry a subtle wrench glyph (live vs. layout-parity at a glance).
- **Universal list search** — `OperatorListView` gained an optional `search:`
  projection; wired into Customers, Staff, Suppliers, Inventory, Guest, Recipes,
  Schedule, Users, Audit log. Header KPIs stay over the full set (search is a
  row-finder, not a metric filter). Purely additive — bar-free without `search:`.

All chrome resolves through the generated web tokens (`themes/core/tokens.css` →
`tokens.generated.ts`); native RN (React Navigation) is reserved for the nav container.

## Design-system adoption — done this pass

Every **fixed-size text** site (`.font(.system(size:))` on `Text`/`MoneyText`) —
a **DS rule #1 (Dynamic Type) violation** — is gone from the operator + customer
features. Migrated: Dashboard + Orders KPIs → `MetricTile`; Reports / Agent HQ /
Calculator metric values + the Rewards loyalty-points hero → `.textRole(…)`. The
only remaining `.system(size:)` calls are **SF Symbol images** (icons), which are
legitimately fixed-size. Verified by grep in CI-adjacent review.

## Remaining live surfaces (~48) — interaction depth

Render real `/api/v1/admin/*` data through the shared loaders
(`OperatorListLoader`, `OperatorScreens*.swift`) + dedicated views. Now DS-clean
on typography. Remaining work is **interaction depth** (filters / detail / write
actions) per surface, most of it facade-gated.

**Write-action template (shipped).** `OperatorListView` now takes an optional
`toolbar:` slot that receives a `reload` closure, so any list surface gains a
write action that refreshes on success — no bespoke store per screen. First two
operator-log surfaces on it:
- **HACCP** — `POST /api/v1/admin/haccp` (staff+, server computes the ok/flagged
  verdict) + a native **`LogTempButton` → Log-temperature sheet** (location
  picker, sensor, °C → tenths).
- **Waste** — `POST /api/v1/admin/waste` (staff+) + a native **`LogWasteButton` →
  Log-waste sheet** (location, item, qty + unit, reason, optional cost).
- **Announcements** — `POST /api/v1/admin/announcements` (**owner**, web parity) +
  a native **`NewAnnouncementButton` → New-announcement sheet** (title, message,
  pin). The view takes `role` and shows the action only to owners (managers see
  the list) — `toolbar:` is simply `nil` otherwise.
- **Cash** — `POST /api/v1/admin/cash` (manager, opens a till session; 409 if one
  is already open) + a native **`OpenCashButton` → Open-till sheet** (location,
  opening float, notes).
- **Feedback** — `PATCH /api/v1/admin/feedback` (manager) + a **per-row status
  menu** (new → reviewed → responded). Shows the other variant: `OperatorFeedbackView`
  became a dedicated mutable view (store + per-row write + reload), the template
  for any per-item action that the toolbar slot can't express.
- **Purchase orders** — `PATCH /api/v1/admin/purchase-orders` (manager) + a per-row
  status menu (draft → sent → received → cancelled); marking **received** posts the
  receive stock movements server-side (`updatePurchaseOrderStatus` →
  `receivePurchaseOrder`). `OperatorPurchaseOrdersView` is now a mutable view.

The same template extends to the other write surfaces as they land (handover
close, inventory adjust, events, compliance, …) — each is a v1 mutation endpoint
+ a toolbar or per-row action. Tracked as the waves continue.

## Scaffolds (2) 🏗 — intentional
`/admin/soc2` and `/admin/capabilities` render `OperatorSurfaceView` (purpose +
honest "pending /api/v1" status). Hardcoded TSX content pages on the web with no
data source; mirroring them would duplicate a Rule #9/#11 source of truth. Leave.

---

## Action items (updated)

- ✅ **DS adoption sweep** — done (no fixed-size text remains; KPIs on `MetricTile`).
- ✅ **KDS 3-lane parity** — done (New/Firing/Ready).
- ✅ **Orders search + scope + inspect** — done (read path).
- ✅ **KDS recall** (`/recall`) + **station filter** (`category` DTO + native Menu).
- ✅ **Orders settle** (`/settle`) + **print receipt** (`/receipt`); `channel`/
  `paidAt` decoded (badges + unpaid marker).
- ✅ **POS cross-sell** (`/admin/pos/suggestions`) + **tabs** (`/admin/pos/tabs`
  CRUD + native load/save/void/charge).
- ✅ **Orders channel dropdown** filter.
- ✅ **POS coursing** — shared `fireTab` actuator + v1 fire/charge + native course UI.
- ✅ **KDS ticket detail parity** — enriched v1 order DTO (modifier labels+flag,
  allergens, coursing, simulated, per-location `prediction`); native `KDSTicket`
  renders due countdown + SLA meter + at-risk pill + coursing + station groups +
  modifiers + allergens + guest note.
- ✅ **KDS board chrome** — KPI strip, station strip, lane segment, Chef mode,
  multi-entry recall tray, pause/resume.
- ✅ **KDS Fleet (owner atlas)** — `/api/v1/admin/kds/fleet` + native `KDSFleetView`
  (totals, benchmark, per-truck tiles with pace + ticket preview).
- ✅ **KDS Done/hr + On-shift KPIs** — `/api/v1/admin/kds/floor-ops` (manager+).
- ✅ **KDS 86 dialog** — native `EightySixSheet` (manager+) with a location picker
  over the existing `/api/v1/admin/menu` GET/PATCH.
- ✅ **KDS sound chimes / kiosk fullscreen** — implemented (`KDSChime` system
  sound + haptic; kiosk chrome-hide + keep-awake). On-device confirmation pending.
- ⏳ **Verify on-device** — the one step needing both apps running: walk KDS, POS,
  Orders, Dashboard side-by-side on a simulator vs `npm run dev` once a Mac is in
  the loop. Everything resolvable from source is resolved above.

## RN bespoke surfaces — graduating from generic `DataSurface` (2026-06-30, bare RN)

> Context: the prior detailed Inventory above belonged to the **retired SwiftUI
> seed**. In the bare-RN app most surfaces render through the generic live
> `DataSurface` (a real key/value list off `/api/v1/admin/*`); the parity upgrade
> is rebuilding each as a **bespoke native screen** 1:1 with the web. Tracked here;
> wired via `src/features/operator/bespoke.ts` (checked before `surfaceConfig`).

- ✅ **Inventory** (`/admin/inventory`) — bespoke `Inventory.tsx` mirroring web
  `InventoryV3` stock view: KPI rail (**inventory value · low/out · items**),
  **In stock / Low / Out** status taxonomy + filter chips with live counts, search
  by ingredient/category, and per-row on-hand-vs-par meter + valuation. Backed by
  an **extended** `GET /api/v1/admin/inventory` (added `costPerUnit` + `valueGrosze`
  per row, and `meta.outCount`/`meta.totalValueGrosze`) so the value KPI is real
  (Rule #1). Waste·7d KPI omitted — not in this facade yet (no fabrication).
- ⏭️ **Next candidates** (generic → bespoke): Suppliers, Purchase orders, Cash,
  Customers — each already live via `DataSurface`, upgraded wave by wave.
