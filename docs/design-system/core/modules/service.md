# Service — the merged Floor + Slots surface

The unified **Core** surface that collapses Slots (time-slot capacity) and Floor
(tables + reservations) into one place, on the `.core-suite` theme (CoreShell),
so it reads like POS / Guest / KDS. Three views ride the topbar `.viewnav`
(`ServiceViewNav`, same pattern as the Guest hub):

- **Book** — book a dine-in slot **and** assign a table in one step.
- **Floor** — the live room (Module 3's Twin): tables, occupancy, predicted
  free-in, seat/clear, the seating recommender, the bottleneck banner, table CRUD.
- **Slots** — time-slot capacity management + the Demand Exchange yield board.

The old `/admin/floor` and `/admin/slots` routes now `redirect()` into
`/admin/service?view=floor|slots`; the separate nav entries are gone.

← back to [Core README](../README.md)

> **Live code:** `src/app/admin/service/page.tsx` (CoreShell route — in
> `CORE_ROUTES`, so AdminShell steps its chrome aside), shell
> `ServiceConsole.tsx` + `ServiceViewNav.tsx`, views `BookView.tsx` /
> `FloorView.tsx` / `SlotsView.tsx` (all in
> `src/components/admin/service/`), styles under the `SERVICE` block in
> `src/app/themes/core/suite.css` (`.svc-*` / `.flr-*` / `.slt-*`). Booking
> engine `src/lib/booking.ts` + `POST /api/admin/booking`; Floor reuses
> `/api/admin/floor-twin` + `/api/admin/floor/tables`; Slots reuses
> `/api/admin/slots` + `/api/admin/demand-exchange`.

## Why merge them

Slots answered *when* (capacity per time window); Floor answered *where* (the
table). For dine-in those are one decision — "a party of 4 at 19:00 needs a
table" — so they live on one surface and one booking does both, conflict-checked
on each.

## The booking console (Book view)

Three steps, left-to-right, then **Book slot + table**:

1. **When** — `.filters` of `.fchip` slot pills (active dine-in slots for the
   day), each showing remaining booking capacity (`N left` / `full`). Full slots
   disable unless **Override** is ticked.
2. **Where** — `.fchip` table pills; each lights up live for the chosen slot via
   the **same pure `findReservationConflicts`** the server enforces — too-small
   / already-booked tables strike through and disable. A **Recommend** button
   auto-picks the best-fit open table.
3. **Who** — party size, name, phone, notes (`.svc-fields`).

`POST /api/admin/booking` is conflict-checked again server-side (the client
preview is convenience, not the gate); a 409 returns the overridable reason.
The right rail (`.svc-side`) lists the day's bookings (time · party · table ·
status), sticky.

## Floor view

The live room as a Core surface (Module 3's Twin, folded in) — `.flr-*`:

- `.flr-kitchen` bottleneck banner (warn / risk) from the KDS pace engine.
- `.flr-kpis` (`.bk` cards): occupancy, open, median turn, spend/hr.
- `.flr-rec` seating recommender — type a party size, `recommendSeating` ranks
  best-fit open tables as `.fchip`s; click to **Seat**.
- `.flr-grid` of `.flr-card` tables: number (click → edit), status badge, live
  facts (predicted free-in, median turn + `✓` when measured, spend/hr), and
  **Seat / Clear** (`POST /api/admin/floor-twin` → logs the transition).
- Table CRUD via a `Dialog theme="core"`.

## Slots view

Capacity management + yield (`.slt-*`), with a `.seg` sub-toggle:

- **Manage** — `.slt-row` per slot (time · `current/max` · fulfilment types ·
  min-spend · status), Activate/Draft + Delete, and a New-slot dialog (single or
  bulk). `/api/admin/slots`.
- **Demand** — the Demand Exchange board (`.tbl`): per-slot tier + forecast +
  recommendation, **Apply** / **Apply all** (capacity + min-spend).
  `/api/admin/demand-exchange`.

## Theme notes

- Renders **inside `.core-suite`** (CoreShell), so it uses core primitives
  directly — `.seg` (location), `.fchip` / `.filters` (pickers), `.input`,
  `.btn`, `.badge`, `.eyebrow`, `.pane-msg` — plus the `.svc-*` layout classes.
- `findReservationConflicts` (`src/lib/floor.ts`) is pure (types only), so it's
  safe to import into this client component for the live conflict preview.

## What Service is not

- Not the POS — that's the till (`/admin/pos`); Service is bookings + floor state.
- Not the customer dine-in flow — the storefront cart books a slot and the
  checkout **auto-assigns** a table (`pickOpenTable`); this surface is the
  operator's side.
