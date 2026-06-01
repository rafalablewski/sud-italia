# Admin — Inventory

← back to [Admin README](../README.md)

The three pages that move physical goods through the truck: what's on
hand, who supplies it, what's on order.

| Page                       | Code                                              | Role-gate |
| -------------------------- | ------------------------------------------------- | --------- |
| `/admin/inventory`         | `src/components/admin/AdminInventory.tsx`         | **staff+** (line cooks need low-stock visibility during service) |
| `/admin/suppliers`         | `src/components/admin/AdminSuppliers.tsx`         | manager+  |
| `/admin/purchase-orders`   | `src/components/admin/AdminPurchaseOrders.tsx`    | manager+  |

The role gate matters: **stock is visible to staff but supplier
relationships + POs are manager-only** — line cooks need to know "out of
mozzarella" mid-service, but they don't need to see supplier margins.

## Common rules across the section

1. **Three-state stock model.** `ok` / `low` / `out` (`stockTone()` in
   `AdminInventory.tsx`) → maps to the canonical `success` / `warning` /
   `danger` Badge tones. Never invent a fourth state.
2. **Per-location reads.** A Kraków stock count doesn't tell you
   anything about Warszawa. Every list view requires a location filter
   in the header.
3. **Movements as the audit trail.** Every stock change writes a
   `stock-movements` row (in, out, waste, transfer) — `/admin/inventory`
   shows the last 50 below the stock table; never edit `onHand` without
   a corresponding movement log.
4. **Reorder point per item, not per category.** `reorderPoint` is per
   ingredient — managers calibrate it from observed usage; the system
   never auto-sets it.
5. **One responsive layout for stock, suppliers + POs.** The same desktop
   surfaces reflow on a phone (the mobile shell is retired — see
   [`mobile/README.md`](../mobile/README.md)); line cooks pull stock on a
   phone during service via the manual code field (camera scan retired with
   the shell), and the supplier-call PO workflow reads the same on desktop.

## Inventory — `/admin/inventory`

The live stock dashboard + the recent-movements log.

- **Header:** `Stock` (h1), location switcher, search + status filter
  chips (`all` / `ok` / `low` / `out`).
- **Counts row** (`v2-kpi-grid`) at the top — total items, low-stock
  count, out-of-stock count. The counts are the answer to "what do I
  need to look at right now?".
- **Stock table:** ingredient, on-hand quantity, reorder point, status
  badge, last movement timestamp, row actions (edit reorder point,
  record movement).
- **Movement form:** inline (no modal) — quantity + direction (in / out
  / waste / transfer) + optional note. Persists immediately, toast
  confirms, table refreshes.
- **Code entry:** a manual code field on the stock table. (A camera
  `BarcodeScanner` shipped only inside the now-retired mobile shell — see
  [`mobile/README.md`](../mobile/README.md) — so live barcode scanning is
  not currently wired into the responsive layout; the manual field is the
  path until it's re-added.)
- **Movements log** (last 50) underneath the table — ingredient,
  direction, quantity, who, when, note.

## Suppliers — `/admin/suppliers`

The vendor book — who we buy from, contact details, default lead time.

- **Header:** `Suppliers` (h1), `+ Add supplier` primary.
- **Table:** name, category (produce / meat / dry goods / packaging /
  other), contact (phone + email), lead time (days), active toggle, row
  actions (edit, delete with confirmation).
- **No location filter** — suppliers are chain-wide (one mozzarella
  vendor, two locations).
- **Delete soft-confirms** (`pendingDelete` state, portalled dialog),
  with awareness of in-flight POs ("X open POs from this supplier —
  archive instead?").
- **Responsive** — the desktop suppliers surface reflows on a phone (the
  dedicated `MobileSuppliers` variant was deleted with the retired shell).

## Purchase orders — `/admin/purchase-orders`

The order pipeline — `draft` → `sent` → `received` → `closed`, with a
`cancelled` terminal.

- **Header:** `Purchase orders` (h1), location switcher, status filter
  chips with counts (`all 12 · draft 2 · sent 5 · received 4 · closed
  1`), `+ New PO` primary.
- **Table:** PO number, supplier, items count, total, status badge with
  dot variant (`<Badge tone={STATUS_TONE[p.status]} variant="soft"
  dot>`), expected delivery date, advance-status action.
- **Status advance is one-tap.** From `draft`: `Send`. From `sent`:
  `Receive`. From `received`: `Close`. Each writes immediately
  (`advance()`) and toasts (`PO sent`, `PO received`, `PO closed`).
- **Items per PO** open in a side panel — line items with quantity,
  cost, optional received-quantity reconciliation on receive.
- **Reconciliation on receive.** When advancing `sent` → `received`,
  prompt for actual quantities (defaults to ordered); short-receives
  auto-create stock movement logs.

## What Inventory is not

- It is **not** menu management — what gets *sold* lives in Operations
  ([`operations.md`](./operations.md)).
- It is **not** the recipe / cost engine — recipe cost-per-portion is
  derived from ingredient prices and lives in the Recipe board.
- It is **not** finance — invoices and supplier payments are tracked
  under Finance.
- It is **not** menu-engineering — the menu profitability analysis
  lives under Intelligence (`/admin/menu-engineering`).

Inventory is the **physical-goods ledger**: what's in the truck, who
brought it, and what's en route.
