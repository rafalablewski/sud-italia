# Core · Orders

← back to [core README](../README.md)

Live code: `src/core/orders/CoreOrders.tsx` · route `src/app/core/orders/page.tsx` · nav `src/core/shell/CoreNav.tsx` (5th surface).

One surface for **every order at the location** — live (current) and paid
history — so staff aren't limited to the POS's open tickets.

Rendered in the **dense-console** language: the unified **`.core-surf-toolbar`**
ActionBar — the `.core-surf-id` context anchor left, the filters (search · a
labelled `Channel` `.core-seg` · date) as its `left`, Refresh as its `right` —
then a 7-up `.core-statstrip`, then a `.core-otable`.

- **Data:** `GET /api/admin/orders?location=` (all orders, newest-first) +
  `GET /api/admin/floor/tables` (table-number map), polled every 15s.
- **Stat strip** (`.core-statstrip`, 7 cells, every figure live — Rule #1):
  **open orders** (+ to-pay delta) · **revenue today** (brand) · **avg check**
  (basil) · **refunds** (danger, with −zł delta) · **dine-in %** (info) ·
  **takeaway %** (amber) · **delivery %** — the last three split today's order
  mix by `fulfillmentType` (`takeout` labels as *takeaway*).
- **Scope** lives in the **command-bar view tabs** — **Current** (active
  statuses) · **Paid** (has `paidAt`) · **All** — so the prompt reads
  `orders:current` and the chrome matches every other surface.
- **ActionBar** (`.core-surf-toolbar` via `CoreSurfToolbar`): on the left a
  `.core-searchfield` over id / guest / phone / table, a labelled **`Channel`**
  `.core-seg` (all / dine-in / takeaway / delivery / qr — fulfillment types + the
  QR channel, shared brand-ember active) and a `.core-datefield` (today); on the
  right a refresh icon.
- **Table** (`.core-otable`): columns **# · Time · Channel · Guest · Table ·
  Items · Total · Status**. The channel cell is a `.core-chanchip` toned by
  type (dinein basil · takeaway amber · delivery/qr info); the status cell is a
  `.core-stpill` bucketed new/preparing/ready/paid/cancelled. The selected
  (open-detail) row highlights via `tr.sel`.
- **Detail dialog:** the full ticket (lines + notes + total), guest, channel,
  status, a **`.core-od-track`** status timeline (**placed → fired → ready →
  paid**, driven by the live order status + `paidAt`), a **Mark paid** action
  for unpaid orders (`POST /api/admin/floor/orders {action:"settle"}` →
  `updateOrder` sets `paidAt`, fires a still-pending order to the kitchen), and
  a **Print receipt** action (`POST /api/admin/orders/[id]/print-receipt`) — see
  [`receipt-printer.md`](./receipt-printer.md).

Mutations reuse the floor settle endpoint; the single Order stays the source
of truth (no duplicate ticket). Verified live: the 7-cell strip, filterbar,
`.core-otable` rows, and the detail-modal status timeline all render against
real orders (Warszawa demo set screenshotted).

## Dense-console 1:1 parity pass (2026-07-02)

Parity layer: `src/app/themes/core/parity/orders.css` (imported after base+skin; scoped under `.core`). See `../redesign/PARITY-AUDIT.md`. Detail dialog: header is `.core-od-idbig` + a single `.core-od-meta` row (guest · T · channel · time); ticket lines carry a `.m` ingredient subtitle; `.core-od-totals` renders Subtotal / fees / Discount / VAT / Total (+ Refund); actions are Mark paid (green, check) then Print (printer); `.core-stpill.refunded` added. Server name / stored discount-reason / per-location VAT are not on the Order model (VAT shown at the statutory 8%).
