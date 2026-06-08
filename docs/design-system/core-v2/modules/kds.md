# Core v2 · KDS

The always-dark kitchen wall. `/core-v2/kds`.

- **Live code:** `src/core-v2/kds/CoreV2Kds.tsx`.
- **Theme:** `.cv-kds` (+ children) in `themes/core-v2/index.css` — the
  `.cv-kds` scope **re-declares the surface/ink tokens to a fixed dark
  palette**, so the wall stays dark even when the rest of Core v2 is in
  light mode.

## Views

A `viewnav` switch in the subbar (Fleet · Floor · Chef); Fleet shows only
for owners (role from `/api/admin/me`).

- **Floor** (default) — the expo board. A 6-up `.cv-kpi` band (Open · New
  · Firing · Ready · At risk · Late) over three `.cv-lane` columns
  (**New → Firing → Ready·Expo**). A stage filter in the subbar focuses a
  single lane into the dense `.cv-chefq` wrap.
- **Chef** — the same tickets as a single station-filtered make-queue
  (`.cv-chefq`).
- **Fleet** — `FleetWall`: per-truck `.cv-truck` tiles with a health
  `.cv-ring`, counts (ready / at-risk / late / throughput / promise), and
  a drill-in that sets the location + switches to Floor.

## Ticket card (`.cv-tk`)

`#shortId` + channel chiplet · a toned **due** clock · the item lines
(`.q` qty + name + italic notes; items off the active station dim) · a
`.cv-meter` cook-time bar · a `.cv-bump` button. SLA **tone** drives the
left border, due colour and meter fill: `queued · firing · warn · risk ·
late · ready`.

## Engine + API contract

Wired 1:1 to the same engine as today's `/core/kds`:

- **Stream** — `useAdminOrdersStream(location, { paused, includeSimulated })`
  (SSE `/api/admin/orders/stream` + REST fallback).
- **Tickets** — `analyzeTruck(orders, now)` (predictions) →
  `buildKdsTicket` → `groupTicketsByColumn(tickets, station)`, all from
  `@/lib/*` + `@/core/kds/kds-board`. Tones via `toneForTicket`.
- **Bump** — `PUT /api/admin/orders` `{ orderId, status: nextStatus(...) }`
  (confirmed → preparing → ready → completed), then `refresh()`.
- **Fleet** — `GET /api/admin/kds/fleet?includeSimulated=1` (owner), polled 6s.

## At parity

Fullscreen kiosk (bare wall), number-key bump (1–9), recall
(`POST /api/admin/orders/{id}/recall`), an opt-in chime, and the 86
control (`/api/admin/kds/eighty-six`) are all wired — feature-for-feature
with today's `/core/kds`.
