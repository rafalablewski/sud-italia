# Core · Service

The merged Floor + Slots surface. `/core/service` (redirects to Floor).
Three nested views via `serviceTabs` (`src/core/service/serviceTabs.ts`): Floor · Slots · Dispatch.

## Floor (`/core/service/floor`) — wired

- **Live code:** `src/core/service/CoreFloor.tsx`.
- **Theme:** `.core-crumb` (dense-console breadcrumb) · `.core-sectionhead` ·
  `.core-statstrip` · `.core-floor` / `.core-zone-h` / `.core-tables` /
  `.core-tbl2` (+ `.core-tbl2-wrap` / `.core-tbl2-edit`) · `.core-floor-bar` /
  `.core-fchip` · `.core-tbl-field` · `.core-bottleneck` in
  `themes/core/index.css`.
- The live room, in the **dense-console** language (1:1 with
  `tests/sketches/core-pages/04-service-floor.html`): a `.core-crumb`
  breadcrumb (`CORE — SERVICE · FLOOR · liquid glass · [loc · dine-in]`), a
  `.core-sectionhead`, then a **6-up `.core-statstrip`** — **seated · free · on
  bill · covers · occupancy · spend / hr** — every figure from live floor +
  order state (Rule #1; the value colours read info/basil/amber/brand and each
  cell carries a mono delta). Tiles are **landscape `.core-tbl2` cards** with a
  state-tinted left accent rail (`--accent`): **free** = basil · **seated** =
  info · **billing** (a table carrying an unpaid order) = amber · **freeing**
  (predicted ≤15m) = amber · **reserved** muted · **out-of-service** faded.
  Each tile reads a big table number + a lowercase status dot on the top row,
  then a covers line (`N covers` / `N-top`), a dwell line (`N min` / `open` /
  `reserved`), an optional check line (`zł` + `open`/`on bill`), and a **single
  most-urgent chip** chosen by priority (food-up → guest-ordered → allergy →
  unpaid → note → paid) rather than stacking them all. Hover reveals a `⋯`
  **edit** affordance. The tile of the **cross-lens selected
  table** rings + ember-pulses via `.core-tbl2.is-focus` (shared
  `@keyframes core-focus-pulse`, reduced-motion-guarded) — so the entity in
  focus is visible on the Floor even after it was picked on another lens.
- **Tap a table → a state-aware RadialActions bloom** (`.core-radial`,
  portaled to the `.core` root per Rule #4) offers 3-4 verbs for that table's
  state (seated → Open check · Move · Free · Edit; free/reserved → Seat · Reserve ·
  Edit; out-of-service → Restore · Edit). The tap also feeds the Context Dock.
  Zones are filterable via the mockup's **`Zone` subbar** (`.core-zonetabs`
  with a `.core-zone-lbl` label — `Zone · All zones · <zone>×N`).
- **Open check → the check opens as a panel over the floor** — the core IA
  move. The radial's **Open check** verb mounts the **embedded till** (`<CorePos embedded>`)
  in a docked `.core-check-panel` inside a `.core-check-overlay` scrim, portaled
  into the **`.core` theme root** (not `document.body`, so it keeps core tokens —
  same rule as `CoreDialog`). The panel opens (or focuses) that table's dine-in
  check with the party as covers and is where build / modify / course / split /
  pay all happen — **no navigation to a separate till**. The panel header is
  table-forward (back-arrow · **Table N** · party + item count + running total ·
  QR · Done); **Esc** or the back-arrow closes it, the scrim-click dismisses, and
  body scroll is locked while it's open. Closing reloads the
  floor so pay-status / occupancy refresh. An occupied tile also carries a small
  secondary **Free** button (`.core-tbl2-clear`) to clear the table without
  opening the check. Floor is Core's **home** (`/core` and `/core/service`
  both land here; the bottom switcher leads with **Floor**).
- **Predictive-seating recommender** (`.core-floor-bar`): type a party size
  and `recommendSeating(twin, n)` ranks best-fit tables as `.core-fchip`
  chips — *seat* now or *~Nm* until free; click to seat directly.
- **Table CRUD**: *+ Add table* (subbar) / the per-tile `⋯` opens the
  `TableDialog` (core `CoreDialog`, portaled) — number · seats · zone
  · status, with delete.
- The **kitchen-bottleneck banner** (`.core-bottleneck`, dense-console card:
  `.bn-ic` icon chip · `.bn-msg` with a seating recommendation · `.bn-tag` ·
  `.bn-act` route action) fires when the KDS engine reports a strained
  station — amber at `warn`, danger-red at `risk`.
- **Engine:** `GET /api/admin/floor-twin?location=` → `{ twin, kitchen }`
  (visibility-aware 15s `usePolling`; create/edit/delete merge optimistically
  into the twin so a tile never blanks until the refetch lands); seat/clear =
  `POST /api/admin/floor-twin { action, tableId }`;
  table create/update = `POST /api/admin/floor/tables?location=`, delete =
  `DELETE /api/admin/floor/tables?location=&id=`.

## Slots (`/core/service/slots`) — wired

- **Live code:** `src/core/service/CoreSlots.tsx`.
- **Theme:** `.core-crumb` · `.core-sectionhead` · `.core-statstrip` ·
  `.core-surge-banner` · `.core-slots-grid` (two-column) · `.core-frame` /
  `.core-frame-h` / `.core-frame-b` · Manage rows `.core-mslot` (`.barwrap` /
  `.mbar` fill + `.meta` + `.core-tchip` tier chip + `.mcap`) ·
  `.core-slot-week` / `.core-slot-day-h` (week grouping) · Demand rows
  `.core-exch-head` / `.core-applyall` / `.core-exrow` / `.core-tier` /
  `.core-lever` (`.lv` + `.why`) / `.core-apply`.
- Rendered in the **dense-console** language (1:1 with
  `tests/sketches/core-pages/05-service-slots.html`): a `.core-crumb`
  breadcrumb, a `.core-sectionhead`, a **Day / Week** + date + New-slot
  sub-toolbar, then a **6-up `.core-statstrip`** — **booked · capacity · fill ·
  surge windows · peak fill · demand price** (all live from the slot set —
  Rule #1; a "surge window" is one filled ≥85%, peak drives the price
  multiplier). When any window is ≥85% a **`.core-surge-banner`** offers a
  one-tap *Apply surge levers* — its `.sb-h` title and `.sb-s` detail are
  block-level so they stack (title over detail) like the mockup, not jammed
  onto one line.
- **Manage** and **Demand exchange** are shown **side by side** in
  `.core-slots-grid` (not tab-switched — both columns are live; the grid
  stacks below 1000px):
  - **Manage · service windows** — each `.core-mslot` is a capacity fill bar
    (basil→amber→danger ≥85%), a booked/status meta line, a **tier chip**
    (healthy · tight · full) that doubles as the **active/draft toggle**, and
    `N / max`; hover reveals a delete affordance. Week mode groups the seven
    days under `.core-slot-day` headers.
  - **Demand exchange** — per-slot forecast vs capacity with a **tier**
    (under · healthy · tight · over · kitchen-capped) and a **lever** (`.lv`
    raise / protect / trim / hold + a `.why` note); **Apply** one or the
    **⚡ Apply all** header action.
- **Create** (`+ New slot`) opens a `CoreDialog` with a **Single / Bulk**
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

## Dispatch (`/core/service/dispatch`) — wired

- **Live code:** `src/core/service/CoreDispatch.tsx`; API
  `src/app/api/admin/dispatch/route.ts`; store helper `assignOrderDriver`
  (`src/lib/store.ts`).
- **Theme:** dense-console (mockup 06-service-dispatch): `.core-crumb` +
  `.core-sectionhead` + `.core-statstrip`, then a `.core-disp-grid` (queue +
  drivers). The order cards stay token-styled inline; `.core-disp-drivers` /
  `.core-disp-driver` / `.core-disp-dstat` style the drivers panel.
- The delivery driver board. `GET /api/admin/dispatch?location=` returns the
  active delivery orders (`fulfillmentType==="delivery"`, status in
  confirmed→preparing→ready→assigned→picked_up, non-simulated) plus the
  location's **drivers** (staff whose role is in the `delivery` group —
  `driver`/`courier` — and `status==="active"`).
- A **6-up `.core-statstrip`** (in kitchen · ready · on road · delivered today
  · drivers · unassigned — all live, Rule #1) and a command-bar **⚡ Auto-assign
  nearest** action (assigns the earliest unassigned ready order to the first
  idle driver). Left column **Pass · delivery queue**: each card shows
  `#shortId`, address, items + total + customer, a status chip, and driver
  controls (unassigned → one-tap **assign chips**; assigned → driver +
  **Unassign**). Right column **Drivers** panel: each driver with a status
  derived live from the board — **en route** (a picked-up order) / **loading**
  (assigned, at pass) / **idle** — via `driverState`.
- Writes go through `PUT /api/admin/dispatch` — `{orderId, driverId}` calls
  `assignOrderDriver` (sets `Order.assignedDriverId`; the `assigned_driver_id`
  column + row mappers already existed) and `{orderId, status}` advances the
  lifecycle via the shared `updateOrderStatus` (assigned → picked_up →
  delivered). Both are audit-logged (`orders.assign_driver` /
  `orders.status_change`). The board polls every 8s. No parallel money/lifecycle
  state — it drives the same `Order`.
