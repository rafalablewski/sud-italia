# Core v2 · Orders

← back to [core-v2 README](../README.md)

Live code: `src/core-v2/orders/CoreV2Orders.tsx` · route `src/app/core-v2/orders/page.tsx` · nav `src/core-v2/shell/CoreV2Nav.tsx` (5th surface).

One surface for **every order at the location** — live (current) and paid
history — so staff aren't limited to the POS's open tickets.

- **Data:** `GET /api/admin/orders?location=` (all orders, newest-first) +
  `GET /api/admin/floor/tables` (table-number map), polled every 15s.
- **KPI strip:** Orders today · Current (active) · To pay · Paid today (zł).
- **Filters:** a scope `cv-switch.sm` segmented control — **Current**
  (active statuses) · **Paid** (has `paidAt`) · **All** — a channel
  `<select>` (All / QR / Web / WhatsApp / POS), and a search box over
  id / guest / phone / table number.
- **Rows** (`.cv-order-row`): time + date · table-or-fulfillment + guest ·
  item count + id · channel chip · status chip · paid/unpaid chip · total.
- **Detail dialog:** the full ticket (lines + notes + total), guest, channel,
  status, and a **Mark paid** action for unpaid orders
  (`POST /api/admin/floor/orders {action:"settle"}` → `updateOrder` sets
  `paidAt`, fires a still-pending order to the kitchen).

Mutations reuse the floor settle endpoint; the single Order stays the source
of truth (no duplicate ticket). Verified: 38 orders list, filter + search +
Mark-paid all live.
