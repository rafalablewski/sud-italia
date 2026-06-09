# Core v2 · Service

The merged Floor + Slots surface. `/core-v2/service` (redirects to Floor).
Two nested views via `serviceTabs` (`src/core-v2/service/serviceTabs.ts`).

## Floor (`/core-v2/service/floor`) — wired

- **Live code:** `src/core-v2/service/CoreV2Floor.tsx`.
- **Theme:** `.cv-floor` / `.cv-zone-h` / `.cv-tables` / `.cv-tbl2`
  (+ `.cv-tbl2-wrap` / `.cv-tbl2-edit`) · `.cv-floor-bar` / `.cv-fchip` ·
  `.cv-tbl-field` · `.cv-bottleneck` in `themes/core-v2/index.css`.
- The live room: a 5-up KPI strip (covers seated · occupancy · turn time ·
  **spend / hr** · freeing ≤15m) over zoned table tiles. Each `.cv-tbl2`
  is toned by state — free · seated · **freeing** (predicted ≤15m) ·
  reserved · out-of-service — and shows party / dwell / open check; hover
  reveals a `⋯` **edit** affordance. Tap a table to **seat / clear**.
- **Predictive-seating recommender** (`.cv-floor-bar`): type a party size
  and `recommendSeating(twin, n)` ranks best-fit tables as `.cv-fchip`
  chips — *seat* now or *~Nm* until free; click to seat directly.
- **Table CRUD**: *+ Add table* (subbar) / the per-tile `⋯` opens the
  `TableDialog` (core-v2 `CoreV2Dialog`, portaled) — number · seats · zone
  · status, with delete.
- The **kitchen-bottleneck banner** (`.cv-bottleneck`) fires when the KDS
  engine reports a strained station.
- **Engine:** `GET /api/admin/floor-twin?location=` → `{ twin, kitchen }`
  (visibility-aware 15s `usePolling`; create/edit/delete merge optimistically
  into the twin so a tile never blanks until the refetch lands); seat/clear =
  `POST /api/admin/floor-twin { action, tableId }`;
  table create/update = `POST /api/admin/floor/tables?location=`, delete =
  `DELETE /api/admin/floor/tables?location=&id=`.

## Slots (`/core-v2/service/slots`) — wired

- **Live code:** `src/core-v2/service/CoreV2Slots.tsx`.
- **Theme:** `.cv-slot-list` / `.cv-slot` (capacity bars, `.cv-slot-min`
  min-spend badge) · `.cv-slot-week` / `.cv-slot-day-h` (week grouping) ·
  `.cv-tier-d` / `.cv-act` (the demand board).
- Two tabs: **Manage** — a **Day / Week** toggle over the slot list, each
  row a capacity fill bar (green→amber→red ≥85%), covers, channels, a
  min-spend badge when set, and an active/draft toggle, over a KPI strip
  (slots · booked · fill rate · demand-price multiplier; week mode
  aggregates the seven days, grouped under `.cv-slot-day` headers).
  **Demand** — the Demand Exchange: per-slot forecast vs capacity with a
  **tier** (under · healthy · tight · over · kitchen-capped) and a
  recommended lever spelled out in prose (**Raise capacity · Trim /
  promote · Protect kitchen · Hold**); Apply one or Apply-all.
- **Create** (`+ New`) opens a `CoreV2Dialog` with a **Single / Bulk**
  mode toggle: Single posts one slot (time + capacity); Bulk generates a
  start→end range at an interval.
- **Engine:** `GET /api/admin/slots?location=[&date=]` (day = date-scoped,
  week = whole location sliced client-side) +
  `GET /api/admin/demand-exchange?location=&date=` (forecast); toggle =
  `PUT /api/admin/slots`; create = `POST /api/admin/slots` (single) /
  `POST /api/admin/slots?bulk=1` (range); delete =
  `DELETE /api/admin/slots?id=`; apply = `POST /api/admin/demand-exchange`
  (`{ slotId, maxOrders, minSpendGrosze }` single / `{ mode: "apply-all" }`).

Parity target: today's `/core/service`. The booking console (slot + table
in one move) lives in the Guest hub's **Book** view (`CoreV2Book`), shared.

## Floor — live orders, lookup & notes

Live code: `src/core-v2/service/CoreV2Floor.tsx` · API `src/app/api/admin/floor/orders/route.ts` (orders) + `/api/admin/floor/tables` (CRUD, now incl. `notes`) + `/api/admin/floor-twin`.

The Floor board pairs the predictive twin with the table's **live orders**:

- **Per-table status chip** — each tile shows what the table owes, driven by
  `GET /api/admin/floor/orders` (today's active orders, grouped by `tableId`,
  tagged with channel + paid/unpaid). Unpaid → a brand `… to pay` chip
  (prefixed `QR ·` for QR-channel orders); fully paid → a basil `✓ paid` chip.
  A `📝` glyph on the table number flags a service note. Polls every 10s.
- **To pay KPI** — count of unpaid active orders across the floor.
- **Order lookup** — a `⌕ Find order` box filters active orders by id, guest
  name or table number; each result shows channel + paid status with a
  **Mark paid** action (`POST /api/admin/floor/orders {action:"settle"}` →
  `updateOrder` sets `paidAt`, fires a still-pending order to the kitchen).
- **Table detail** (the `⋯` editor) — adds a **Service note** textarea
  (persisted on `FloorTable.notes`, threaded through `buildFloorTwin` →
  `TwinTableRow.notes`) and an **Orders at this table** list with the same
  settle action.
