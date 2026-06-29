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
- **Honest gaps (hardware-gated, not faked — Rule #1):**
  - **Sound chimes / kiosk fullscreen** — on-device (audio + fullscreen are iOS
    runtime concerns; the iPad app is already chromeless).

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
- **Native now:** KPI trio via **`MetricTile`**, a **search field + Current/All
  scope** toggle (`shown` filter), `DSSectionHeader` sections, and **tappable rows
  → read-only order detail sheet** (the inspect path) — added this pass.
- **Shipped:** **Mark paid** — `POST /api/v1/orders/:id/settle` (idempotent,
  audited) wired into the detail sheet; the DTO already carried `channel`/`paidAt`
  so the native model now decodes them (paid/channel badges + an "unpaid" row
  marker).
- **Shipped:** **Print receipt** — `POST /api/v1/orders/:id/receipt`; native shows
  the printer confirmation or a shareable plain-text preview (no-hardware fallback).
- **Shipped:** **channel dropdown** filter in the Orders filter bar (scope +
  channel, over the decoded field).

### Dashboard (`/admin` · `OperatorDashboardView.swift`) ✅
- **Native now:** six KPIs via **`MetricTile`** (status-tinted icons), "Latest
  orders" under a `DSSectionHeader`, live off `GET /api/v1/orders`. Migrated off
  the hand-rolled fixed-size tiles this pass.

---

## Design-system adoption — done this pass

Every **fixed-size text** site (`.font(.system(size:))` on `Text`/`MoneyText`) —
a **DS rule #1 (Dynamic Type) violation** — is gone from the operator + customer
features. Migrated: Dashboard + Orders KPIs → `MetricTile`; Reports / Agent HQ /
Calculator metric values + the Rewards loyalty-points hero → `.textRole(…)`. The
only remaining `.system(size:)` calls are **SF Symbol images** (icons), which are
legitimately fixed-size. Verified by grep in CI-adjacent review.

## Remaining live surfaces (48)

Render real `/api/v1/admin/*` data through the shared loaders
(`OperatorListLoader`, `OperatorScreens*.swift`) + dedicated views. Now DS-clean
on typography. Remaining work is **interaction depth** (filters/detail/write
actions) per surface, which is facade-gated — tracked as the waves land.

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
- ⏳ **KDS sound chimes / kiosk fullscreen** — on-device only (hardware-gated).
- ⏳ **Verify on-device** — the one step needing both apps running: walk KDS, POS,
  Orders, Dashboard side-by-side on a simulator vs `npm run dev` once a Mac is in
  the loop. Everything resolvable from source is resolved above.
