# Core · Service

The merged Floor + Slots surface. `/core/service` (redirects to Floor).
Two nested views via `serviceTabs` (`src/core/service/serviceTabs.ts`).

## Floor (`/core/service/floor`) — wired

- **Live code:** `src/core/service/CoreFloor.tsx`.
- **Theme:** `.core-floor` / `.core-zone-h` / `.core-tables` / `.core-tbl2`
  (+ `.core-tbl2-wrap` / `.core-tbl2-edit`) · `.core-floor-bar` / `.core-fchip` ·
  `.core-tbl-field` · `.core-bottleneck` in `themes/core/index.css`.
- The live room: a 5-up KPI strip (covers seated · occupancy · turn time ·
  **spend / hr** · freeing ≤15m) over zoned table tiles. Each `.core-tbl2`
  is toned by state — free · seated · **freeing** (predicted ≤15m) ·
  reserved · out-of-service — and shows party / dwell / open check; hover
  reveals a `⋯` **edit** affordance. Tap a table to **seat / clear**.
- **Order → (`.core-tbl2-order`)** — a brand link on each non-OOS tile that
  deep-links to the till (`/core/pos?table=<id>&covers=<party|seats>`). The POS
  opens (or focuses, if one already exists) a **dine-in check pre-assigned to
  that table** with the party as covers — so the floor map and the till share
  one table model instead of two. Always shown on touch (`@media (hover:none)`),
  hover-revealed on pointer devices.
- **Predictive-seating recommender** (`.core-floor-bar`): type a party size
  and `recommendSeating(twin, n)` ranks best-fit tables as `.core-fchip`
  chips — *seat* now or *~Nm* until free; click to seat directly.
- **Table CRUD**: *+ Add table* (subbar) / the per-tile `⋯` opens the
  `TableDialog` (core `CoreDialog`, portaled) — number · seats · zone
  · status, with delete.
- The **kitchen-bottleneck banner** (`.core-bottleneck`) fires when the KDS
  engine reports a strained station.
- **Engine:** `GET /api/admin/floor-twin?location=` → `{ twin, kitchen }`
  (visibility-aware 15s `usePolling`; create/edit/delete merge optimistically
  into the twin so a tile never blanks until the refetch lands); seat/clear =
  `POST /api/admin/floor-twin { action, tableId }`;
  table create/update = `POST /api/admin/floor/tables?location=`, delete =
  `DELETE /api/admin/floor/tables?location=&id=`.

## Slots (`/core/service/slots`) — wired

- **Live code:** `src/core/service/CoreSlots.tsx`.
- **Theme:** `.core-slot-list` / `.core-slot` (capacity bars, `.core-slot-min`
  min-spend badge) · `.core-slot-week` / `.core-slot-day-h` (week grouping) ·
  `.core-tier-d` / `.core-act` (the demand board).
- Two tabs: **Manage** — a **Day / Week** toggle over the slot list, each
  row a capacity fill bar (green→amber→red ≥85%), covers, channels, a
  min-spend badge when set, and an active/draft toggle, over a KPI strip
  (slots · booked · fill rate · demand-price multiplier; week mode
  aggregates the seven days, grouped under `.core-slot-day` headers).
  **Demand** — the Demand Exchange: per-slot forecast vs capacity with a
  **tier** (under · healthy · tight · over · kitchen-capped) and a
  recommended lever spelled out in prose (**Raise capacity · Trim /
  promote · Protect kitchen · Hold**); Apply one or Apply-all.
- **Create** (`+ New`) opens a `CoreDialog` with a **Single / Bulk**
  mode toggle: Single posts one slot (time + capacity); Bulk generates a
  start→end range at an interval.
- **Engine:** `GET /api/admin/slots?location=[&date=]` (day = date-scoped,
  week = whole location sliced client-side) +
  `GET /api/admin/demand-exchange?location=&date=` (forecast); toggle =
  `PUT /api/admin/slots`; create = `POST /api/admin/slots` (single) /
  `POST /api/admin/slots?bulk=1` (range); delete =
  `DELETE /api/admin/slots?id=`; apply = `POST /api/admin/demand-exchange`
  (`{ slotId, maxOrders, minSpendGrosze }` single / `{ mode: "apply-all" }`).

Wired 1:1 to the same shared server engine. The booking console (slot + table
in one move) lives in the Guest hub's **Book** view (`CoreBook`), shared.

## Floor — live orders, lookup & notes

Live code: `src/core/service/CoreFloor.tsx` · API `src/app/api/admin/floor/orders/route.ts` (orders) + `/api/admin/floor/tables` (CRUD, now incl. `notes`) + `/api/admin/floor-twin`.

The Floor board pairs the predictive twin with the table's **live orders**:

- **Per-table status chip** — each tile shows what the table owes, driven by
  `GET /api/admin/floor/orders` (today's active orders, grouped by `tableId`,
  tagged with channel + paid/unpaid). Unpaid → a brand `… to pay` chip
  (prefixed `QR ·` for QR-channel orders); fully paid → a basil `✓ paid` chip.
  A glanceable service-note chip (`.core-tnote-chip`) sits on the tile; a note
  naming an allergy/dietary risk goes amber (`.alrg`, `⚠`) so it reads across
  the room, not on hover. Polls every 10s.
- **To pay KPI** — count of unpaid active orders across the floor.
- **Order lookup** — a `⌕ Find order` box filters active orders by id, guest
  name or table number; each result shows channel + paid status with a
  **Mark paid** action (`POST /api/admin/floor/orders {action:"settle"}` →
  `updateOrder` sets `paidAt`, fires a still-pending order to the kitchen).
- **Table detail** (the `⋯` editor) — adds a **Service note** textarea
  (persisted on `FloorTable.notes`, threaded through `buildFloorTwin` →
  `TwinTableRow.notes`) and an **Orders at this table** list with the same
  settle action.
