# Service — the merged Floor + Slots surface

The unified **Core** surface that collapses Slots (time-slot capacity) and Floor
(tables + reservations) into one place, on the `.core-suite` theme (CoreShell),
so it reads like POS / Guest / KDS. Its first view is the **booking console**:
book a dine-in time slot **and** assign a table in one step.

← back to [Core README](../README.md)

> **Live code:** `src/app/admin/service/page.tsx` (CoreShell route — in
> `CORE_ROUTES`, so AdminShell steps its chrome aside), UI
> `src/components/admin/service/ServiceConsole.tsx`, styles under the `SERVICE`
> block in `src/app/themes/core/suite.css` (`.svc-*`). Booking engine:
> `src/lib/booking.ts` + `POST /api/admin/booking` (see
> [operations.md → Unified booking](../../admin/sections/operations.md)).

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

## Theme notes

- Renders **inside `.core-suite`** (CoreShell), so it uses core primitives
  directly — `.seg` (location), `.fchip` / `.filters` (pickers), `.input`,
  `.btn`, `.badge`, `.eyebrow`, `.pane-msg` — plus the `.svc-*` layout classes.
- `findReservationConflicts` (`src/lib/floor.ts`) is pure (types only), so it's
  safe to import into this client component for the live conflict preview.

## What's folding in next

Floor (tables + Twin) and Slots (capacity + Demand) become additional views of
this surface (a CoreShell `.viewnav`, like the Guest hub), at which point the
separate `/admin/floor` and `/admin/slots` entries collapse into Service and
redirect here. Until then they remain reachable for table/slot configuration.

## What Service is not

- Not the POS — that's the till (`/admin/pos`); Service is bookings + floor state.
- Not the customer dine-in flow — the storefront cart books a slot and the
  checkout **auto-assigns** a table (`pickOpenTable`); this surface is the
  operator's side.
