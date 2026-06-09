# Core v2 · KDS

The kitchen wall. `/core-v2/kds`.

- **Live code:** `src/core-v2/kds/CoreV2Kds.tsx`.
- **Theme:** `.cv-kds` (+ children) in `themes/core-v2/index.css`. The
  `.cv-kds` scope **re-declares the surface/ink + tone tokens to a dark
  palette by default** (the wall look). The **in-shell board** follows the
  app theme: `.cv2[data-theme="light"] .cv-body .cv-kds` re-declares a light
  palette + light tones, so a light Core v2 gets a light KDS. The
  **fullscreen kiosk** (`.cv-kiosk`, outside `.cv-body`) stays a dark wall
  regardless of theme — that's the mounted night-trucks / glare display.
  Translucent fills use `--kds-veil` / `--kds-track` tokens so they invert
  with the palette instead of being hard-coded white.

## Views

A `viewnav` switch in the subbar (Fleet · Floor · Chef); Fleet shows only
for owners (role from `/api/admin/me`).

- **Floor** (default) — the expo board. A manager **ops band** (the
  responsive `.cv-kpi`: Open · New · Firing · Ready · At risk · Late ·
  Oldest · Avg age · Done/hr · On shift) over three `.cv-lane` columns
  (**New → Firing → Ready·Expo**). Counts + Oldest/Avg-age are derived
  from the live ticket stream; **Done/hr** and **On shift** come from
  `GET /api/admin/kds/floor-ops?location=` (15s poll). A stage filter in
  the subbar focuses a single lane into the dense `.cv-chefq` wrap.
- **Chef** — the same tickets as a single station-filtered make-queue
  (`.cv-chefq`), under a `.cv-chef-depth` strip showing the cook's
  focused-station **queue depth** + **oldest** ticket (amber past 8 min)
  and the active station name.
- **Fleet** — `FleetWall`: the owner Atlas, and the **default view for
  owners** (the role from `/api/admin/me` flips the board to Fleet on
  load). A cross-truck totals band (`.cv-fleet-kpi`: Active · At risk ·
  Late · Ready · Throughput/hr · Covers/hr · Revenue zł/hr, from the feed
  `totals`) over the `.cv-fleet-bench` (one promise-accuracy `.cv-track`
  bar per truck,
  leader flagged) over a 2-up `.cv-fleet-grid` of `.cv-truck` tiles. Each
  tile carries a health `.cv-ring`, the `Open · N active · STATE` line, a
  5-up `.cv-truck-stats` strip (**Active · At risk · Late · Ready · On
  shift**), per-station **`.cv-pace` bars** (`Pace · next 15m`, one
  `.cv-track` per loaded station, hottest first, coloured by tier — the
  header flips to *predicted to fall behind* when any station hits the
  **risk** tier), and a 3-row `.cv-preview` ticket stack (`#shortId` ·
  channel chip · dish summary · toned due clock, most-urgent first). Two
  drills per tile — **Open floor →** / **Chef line →** — set the location
  and switch to that view.

## Ticket card (`.cv-tk`)

Header: `#shortId` + channel chiplet on the left; an `At risk` pill
(`.cv-tk-risk`) + the toned **due** clock on the right (`.cv-tk-hend`).
Below, in order, the **safety-relevant** content the line needs:

- `.cv-tk-sim` — *Simulation — not a real order* (sandbox tickets; the
  card also goes dashed via `.cv-tk.sim`).
- `.cv-tk-course` — *Coursed · Mains, Dessert held* when a dine-in check
  has held courses (`t.coursing.held`).
- `.cv-tk-items` — lines grouped by station (`.cv-tk-grp` header per
  category, canonical order; headers shown only in the all-station Floor
  view). Each `.it` is `.q` qty + an `.it-body` (name, then `.mod`
  modifier lines — flagged picks render `.mod.flag` bold-amber — then any
  note). Items off the active station dim.
- `.cv-tk-alrg` — an amber-hairline allergen strip (`Allergens · …`,
  deduped across the ticket). **Never dropped** — it's a safety line.
- `.cv-tk-note` — the order's special instructions (`Note …`).

Then a `.cv-meter` cook-time bar and a `.cv-bump` button. SLA **tone**
drives the left border, due colour and meter fill: `queued · firing ·
warn · risk · late · ready`.

## Engine + API contract

Wired 1:1 to the same engine as today's `/core/kds`:

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
window), two opt-in chimes (bright bell on a new ticket, lower alarm the
instant a ticket breaches SLA), and the 86 control
(`/api/admin/kds/eighty-six`) are all wired — feature-for-feature with
today's `/core/kds`.
