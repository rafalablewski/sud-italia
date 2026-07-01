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

- **Floor** (default) — the expo board. A manager **ops band** (the
  responsive `.core-kpi`: Open · New · Firing · Ready · At risk · Late ·
  Oldest · Avg age · Done/hr · On shift) over three `.core-lane` columns
  (**New → Firing → Ready·Expo**). Counts + Oldest/Avg-age are derived
  from the live ticket stream; **Done/hr** and **On shift** come from
  `GET /api/admin/kds/floor-ops?location=` (15s poll). A stage filter in
  the subbar focuses a single lane into the dense `.core-chefq` wrap.
- **All-day rail** (`.core-allday`) — toggled by the **`Σ`** control, an
  ember-washed strip of `.core-allday-item` chips: every still-to-make item
  (New + Firing, not Ready) summed **by dish across all active tickets**, biggest
  first, with the ticket count. The line's "make-now" batch — derived live from
  the same tickets (no mock data, Rule #1) and respecting the station filter.
  Available in Floor + Chef views.
- **Chef** — the same tickets as a single station-filtered make-queue
  (`.core-chefq`), under a `.core-chef-depth` strip showing the cook's
  focused-station **queue depth** + **oldest** ticket (amber past 8 min)
  and the active station name.
- **Fleet** — `FleetWall`: the owner Atlas, and the **default view for
  owners** (the role from `/api/admin/me` flips the board to Fleet on
  load). A cross-truck totals band (`.core-fleet-kpi`: Active · At risk ·
  Late · Ready · Throughput/hr · Covers/hr · Revenue zł/hr, from the feed
  `totals`) over the `.core-fleet-bench` (one promise-accuracy `.core-track`
  bar per truck,
  leader flagged) over a 2-up `.core-fleet-grid` of `.core-truck` tiles. Each
  tile carries a health `.core-ring`, the `Open · N active · STATE` line, a
  5-up `.core-truck-stats` strip (**Active · At risk · Late · Ready · On
  shift**), per-station **`.core-pace` bars** (`Pace · next 15m`, one
  `.core-track` per loaded station, hottest first, coloured by tier — the
  header flips to *predicted to fall behind* when any station hits the
  **risk** tier), and a 3-row `.core-preview` ticket stack (`#shortId` ·
  channel chip · dish summary · toned due clock, most-urgent first). Two
  drills per tile — **Open floor →** / **Chef line →** — set the location
  and switch to that view.

## Ticket card (`.core-tk`)

Header: `#shortId` + channel chiplet on the left; an `At risk` pill
(`.core-tk-risk`) + the toned **due** clock on the right (`.core-tk-hend`).
Below, in order, the **safety-relevant** content the line needs:

- `.core-tk-sim` — *Simulation — not a real order* (sandbox tickets; the
  card also goes dashed via `.core-tk.sim`).
- `.core-tk-course.held` — *⊘ Mains · Dessert held* when a dine-in check
  has held courses (`t.coursing.held`) — dimmed with a ⊘ so the line knows
  they exist but aren't fired.
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
