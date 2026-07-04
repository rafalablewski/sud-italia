# Core · KDS

The kitchen wall. `/core/kds`.

- **Live code:** `src/core/kds/CoreKds.tsx`.
- **Theme:** `.core-kds` (+ children) in `themes/core/index.css`. The
  `.core-kds` scope **re-declares the surface/ink + tone tokens to a dark
  palette by default** (the wall look). The **in-shell board** follows the
  app theme: `.core[data-theme="light"] .core-body .core-kds` re-declares a light
  palette + light tones, so a light Core gets a light KDS. The
  **fullscreen kiosk** (`.core-kiosk`, outside `.core-body`) stays a dark wall
  regardless of theme — that's the mounted night-trucks / glare display.
  Translucent fills use `--kds-veil` / `--kds-track` tokens so they invert
  with the palette instead of being hard-coded white.

## Views

A `viewnav` switch in the subbar (Fleet · Floor · Chef); Fleet shows only
for owners (role from `/api/admin/me`).

All three views (Fleet · Floor · Chef) render in the **liquid-glass** language
1:1 with the Core-suite mockup, on the unified ActionBar: the in-shell board
(`.core-body .core-kds`) sits on the warm KDS radial-gradient, and each view
opens with the `.core-surf-toolbar` — its `.core-surf-id` context anchor left, the
view/scope switch as its `left` (Floor **STATUS** lane · Fleet **SCOPE** kitchen ·
Chef **MODE** expo/all-day, each a `.core-seg`), and the board actions as its
`right` (Σ all-day · refresh · 86 · chime ·
pause · fullscreen — right, via `CoreSurfToolbar`), then the frosted
`.core-statstrip` KPI band (shared `.core-kds .core-statstrip` glass). The
**fullscreen kiosk** (`.core-kiosk`, outside `.core-body`) keeps the flat dark
wall, laying scope + actions out inline in its top strip.

- **Floor** (default) — the expo board. A frosted 7-cell `.core-statstrip.core-kds-strip`
  (**Active · At risk · Late · Ready · Throughput · Covers · Revenue** — counts
  from the live ticket stream; throughput/covers/revenue from
  `GET /api/admin/kds/floor-ops?location=`, 15s poll — real completed orders in
  the last hour, `—` until a location is picked, Rule #1) over a **dark
  `.core-wall` inset** that carries the station strip + three `.core-lane`
  columns (**New → Firing → Ready·Expo**, transparent columns whose tickets
  float on the wall). A stage filter in the subbar focuses a single lane into
  the dense `.core-chefq` wrap. Bump verbs read **Start / Bump / Pass**
  (brand-ember; Pass is basil).
- **Station strip** (`.core-stations` / `.core-stn`) — inside the wall, each
  present station is a one-tap filter chip showing its **live load**
  (`.core-stn-dot` + `.core-stn-load` bar + `.core-stn-pct`, toned basil/amber/
  danger by pace tier, from `floor-ops`'s `stations[]` — Rule #1). A trailing
  `.core-stn-expo` chip summarises the ready-for-pass count. Stations read with
  **kitchen-station** labels (`KDS_STATION_LABELS`: Forno · Primi · Antipasti ·
  Griglia · Bar · Dolci) — distinct from the menu-category labels — across the
  strip, the fleet load chips, the Chef all-day board, and the ticket group headers.
- **All-day rail** (`.core-allday`) — toggled by the **`Σ`** control on Floor, an
  ember-washed strip of `.core-allday-item` chips: every still-to-make item
  (New + Firing, not Ready) summed **by dish across all active tickets**, biggest
  first, with the ticket count. Derived live from the same tickets (Rule #1) and
  respecting the station filter.
- **Chef** — `ChefView`: **expo pass + all-day prep**, a two-panel
  `.core-chef-grid` (an **Expo / All-day** `.core-seg` toggles All-day
  full-width). A frosted 6-cell strip (**On the pass · Awaiting course · Longest
  hold · All-day items · In progress · Allergy flags**, all live) over:
  - **All-day · by station** (`.core-panel` → `.core-ad-group` per category in
    canonical order) — still-to-make dishes grouped by station with a `.core-ad-bar`
    per dish and the station's live **load %** from `floor-ops`.
  - **Expo pass · coursing** (`.core-expo-list` of `.core-expo-card`) — each
    active check as a `.core-cspine` course spine (`.core-cnode` per present
    course, **done / firing / wait** derived from the real POS coursing
    `fired`/`held` + order stage), the toned due clock, and `.core-expo-act`
    actions (**Start firing / Bump to pass / Expedite** + **Recall**) wired to
    the same optimistic bump/recall the boards use.
- **Fleet** — `FleetWall`: the owner Atlas, and the **default view for
  owners** (the role from `/api/admin/me` flips the board to Fleet on load).
  Rendered in the **liquid-glass** language 1:1 with the Core-suite mockup: the
  `.core-fleet` container carries the warm KDS radial-gradient wash, opening with
  the `.core-surf-toolbar` ActionBar — the `.core-surf-id` context anchor left,
  the SCOPE switch as its `left`, and the fleet actions as its `right`.
  - **Fleet SCOPE switch** — a `.core-seg` kitchen filter (**All kitchens** + one
    button per truck, labelled by `city`), first control in the ActionBar `left`. The
    KDS switches + board actions (this filter, the Floor lane filter, the Chef
    Expo/All-day toggle, the
    `.core-tpill` action pills, and the `.core-iconbtn` tool glyphs) is tuned to
    the dense-console mockup (`02-kds.html` — `.seg-lane` / `.pill` / `.tico`)
    rather than the larger default core controls: **10–11px regular-weight
    `--mono` labels**, fully-rounded `--pill` capsules, **translucent
    white-washed fills** (the KDS wall resets `--panel-2`/`--line` to opaque
    dark, so the glassy control fills are written as explicit
    `rgba(255,255,255,…)` / `--t-late` washes), an **inset-`--lg-rim` active
    tab**, a **red inset-ring `86` pill**, and **bare 28px hover-fill tool
    icons**. All of it is scoped to `.core .core-kds` / `.core-kiosk-top`, so
    POS / Orders / Guest keep the larger, opaque, proportional-font default
    controls. The filter scopes the grid **and
    re-aggregates the totals strip** to the selection, then the board actions the
    command bar omits: a labelled **`.core-tpill`** **`Σ fleet all-day`**, **`⟳`**
    refresh (bumps the 6s feed poll on demand), a danger **`.core-tpill`**
    **`86 · N`** (the live 86'd count from the feed, scoped to the selected truck
    or summed across all), a **chime** toggle, and **fullscreen** (Fleet now joins
    Floor/Chef in the kiosk). Floor + Chef carry the same `Σ all-day` / `86` pills.
  - **Totals strip** — a frosted **`.core-statstrip`** (8 cells: **Kitchens ·
    Active · At risk · Late · Ready · Throughput/hr · Covers/hr · Revenue zł/hr**),
    colour-toned mono values from the feed `totals` (re-summed from the filtered
    tiles when a single kitchen is selected).
  - **All-day rail** — the same `.core-allday` strip as Floor/Chef, toggled by
    `Σ`, but summed **cross-truck** from the scoped tiles' live tickets (Rule #1).
  - **Truck cards** — a 2-up `.core-fleet-grid` of **glass `.core-truck`** tiles,
    each a whole-card drill (click / Enter → **Open floor** for that truck). Card
    anatomy: a `.core-truck-h` header (a toned `.core-truck-flag` dot + the `city`
    name + a `.code` line — the location's short **site code + district**
    (`KRK · Rynek`, `WAW · Śródmieście`; new `Location.code`/`Location.district`
    fields, editable in the Locations manager), falling back to the street when
    unset — + a `.core-truck-pill` status — **On pace · Backed up · Under pressure ·
    Slammed**, mapped from `healthClass`); a 5-up `.core-truck-mini`
    row (**Active · Risk · Late · Avg cook · Oldest** — the last two derived from
    the tile's live ticket ages); then a `.core-truck-body` with
    **`.core-tstn` station load chips** (dot + label + bar + `%`, hottest first,
    toned by pace tier — only stations with live demand), a 3-box
    **`.core-lanesum`** (New / Firing / Ready, split from the tickets), and a
    3-row **`.core-mtk`** mini-ticket stack (`#shortId` · dish summary · toned due
    clock, most-urgent first).

## Ticket card (`.core-tk`)

Header: `#shortId` + channel chiplet on the left; an `At risk` pill
(`.core-tk-risk`) + the toned **due** clock on the right (`.core-tk-hend`).
Below, in order, the **safety-relevant** content the line needs:

- `.core-tk-sim` — *Simulation — not a real order* (sandbox tickets; the
  card also goes dashed via `.core-tk.sim`).
- `.core-tk-course.held` — *⊘ Mains · Dessert held* when a dine-in check
  has held courses (`t.coursing.held`) — dimmed with a ⊘ so the line knows
  they exist but aren't fired.
- `.core-tk-voided` / `.core-tk-void-row` — a dish **cancelled after firing**
  (`t.voided`, from `Order.voidedItems` when the POS voids a sent line): a loud
  danger-washed **✕ CANCEL · Nx name · reason** row with the name struck-through,
  so the line stops making it instead of it silently disappearing.
- `.core-tk-items` — lines grouped by station (`.core-tk-grp` header per
  category, canonical order; headers shown only in the all-station Floor
  view). Each `.it` is `.q` qty + an `.it-body` (name, then `.mod`
  modifier lines — flagged picks render `.mod.flag` bold-amber — then any
  note). Items off the active station dim.
- `.core-tk-alrg` — the allergen strip: **large + danger-red** with a 4px
  left safety rule (`Allergens · …`, deduped across the ticket), the one
  thing that must never be missed. **Never dropped, never dimmed** — kept
  even in dense mode. (The toned **due** clock in the header is the big mono
  figure cooks track from.)
- `.core-tk-note` — the order's special instructions (`Note …`).

`.core-tk.is-focus` — the ticket rings + ember-pulses (`@keyframes
core-focus-pulse`, reduced-motion-guarded) when its table is the cross-lens
selected entity (`KdsTicket.tableId === selection.id`), so a table picked on
the Floor lens is visible here without hunting. Shared with `.core-tbl2.is-focus`
(Floor tile) and `.core-pk.is-focus` (Book picker).

Then a `.core-meter` cook-time bar and a `.core-bump` button. SLA **tone**
drives the left border, due colour and meter fill: `queued · firing ·
warn · risk · late · ready`.

**Interaction (one wet hand):** the **whole card is the bump target**
(`.core-tk.bumpable`, cursor + hover-lift) — a tap advances a step
(`nextStatus`); the explicit `.core-bump` button and the `.core-tk-h` pin
target both `stopPropagation` so they don't double-fire. A **long-press**
(~550ms) steps the ticket **back** one status (`prevStatus`) — the on-card
destructive recall. Both are optimistic + roll back on failure.

**Column sort = SLA urgency** (`groupTicketsByColumn(tickets, station,
nowMs)`): predictive tone first (late → risk → warn → …), then least slack
vs the promise, then oldest-paid — the cook reads the ticket that needs a
hand first, not just the oldest.

**Pressure-adaptive density** (`.core-kds.dense`, set when the live
at-risk/late counts tip to risk): cards compact (drop notes + non-flag
modifier descriptions, tighten spacing; 44px targets kept), allergens +
flagged mods stay (safety), and a pulsing danger rail runs across the top
(reduced-motion-guarded).

## Engine + API contract

Wired 1:1 to the shared live engine:

- **Stream** — `useAdminOrdersStream(location, { paused, includeSimulated })`
  (SSE `/api/admin/orders/stream` + REST fallback).
- **Tickets** — `analyzeTruck(orders, now)` (predictions) →
  `buildKdsTicket` → `groupTicketsByColumn(tickets, station)`, all from
  `@/lib/*` + `@/core/kds/kds-board`. Tones via `toneForTicket`.
- **Bump** — `PUT /api/admin/orders` `{ orderId, status: nextStatus(...) }`
  (confirmed → preparing → ready → completed). The ticket moves **optimistically**
  via `useAdminOrdersStream.patchOrder` and is pinned in its new column until the
  stream echoes the status (or the patch ages out / rolls back on failure), so a
  pre-commit stream frame can't snap it backward; then `refresh()`.
- **Fleet** — `GET /api/admin/kds/fleet?includeSimulated=1` (owner), polled 6s.

## At parity

Fullscreen kiosk (bare wall), number-key bump (1–9), a manual `⟳`
refresh, pause/resume, recall (`POST /api/admin/orders/{id}/recall`,
tray persisted per location in `localStorage` so a refresh keeps the undo
window) — surfaced as a labelled **`↩ Undo`** control (`.core-recall-btn`,
amber) rather than a bare glyph, so the affordance reads at a glance; two
opt-in chimes (bright bell on a new ticket, lower alarm the
instant a ticket breaches SLA), the **`Σ` all-day** toggle (`.core-allday`), and
the 86 control (`/api/admin/kds/eighty-six`) are all wired — feature-for-feature.

## Ticket + station parity (2026-07-02)

`src/app/themes/core/parity/kds.css` (imported after base+skin; scoped under `.core .core-kds`). Pass-card header is a bold display **`.tt`** title + a symbol-prefixed **`.due`** (◉ firing · ▲ at-risk · ✓ ready · "−m:ss late"); a **`.core-tk-meta`** row carries a lowercase channel badge (`.core-chan.dine/.take/.deliv`) + party + "fired m:ss ago" (from `paidAtMs`). The station strip renders as plain load rows (dot · name · bar · %) instead of bordered filter pills (the "All stations" chip stays a subtle pill). Allergens keep their danger callout but compact, so the card reads like the mockup's clean ticket while preserving the safety row.
