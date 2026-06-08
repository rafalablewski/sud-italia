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
  (15s poll); seat/clear = `POST /api/admin/floor-twin { action, tableId }`;
  table create/update = `POST /api/admin/floor/tables?location=`, delete =
  `DELETE /api/admin/floor/tables?location=&id=`.

## Slots (`/core-v2/service/slots`) — wired

- **Live code:** `src/core-v2/service/CoreV2Slots.tsx`.
- **Theme:** `.cv-slot-list` / `.cv-slot` (capacity bars) + `.cv-tier-d` /
  `.cv-act` (the demand board).
- Two tabs: **Manage** — the slot list with a capacity fill bar
  (green→amber→red ≥85%), covers, channels, and an active/draft toggle,
  over a KPI strip (slots · booked · fill rate · demand-price multiplier).
  **Demand** — the Demand Exchange: per-slot forecast vs capacity with a
  **tier** (under · healthy · tight · over · kitchen-capped) and a
  recommended lever (**raise · trim · protect · hold**); Apply one or
  Apply-all.
- **Engine:** `GET /api/admin/slots?location=&date=` (capacity) +
  `GET /api/admin/demand-exchange?location=&date=` (forecast); toggle =
  `PUT /api/admin/slots`; create/bulk = `POST /api/admin/slots[?bulk=1]`;
  delete = `DELETE /api/admin/slots?id=`; apply =
  `POST /api/admin/demand-exchange`
  (`{ slotId, maxOrders, minSpendGrosze }` single / `{ mode: "apply-all" }`).

Parity target: today's `/core/service`. The booking console (slot + table
in one move) lives in the Guest hub's **Book** view (`CoreV2Book`), shared.
