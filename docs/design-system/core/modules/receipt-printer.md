# Receipt printer (ESC/POS)

← back to [Core README](../README.md)

Thermal receipt printing for orders (audit §11.2 / §12.4 #7). Built to
work **with or without hardware**: a real ESC/POS network printer when
configured, a simulator + browser-print fallback when not.

## Surfaces

- **Trigger:** `Print receipt` button on the order detail footer
  (`/admin/orders` → open an order). Staff+.
- **Endpoint:** `POST /api/admin/orders/[id]/print-receipt` — per-location
  tenancy enforced; every print audit-logged as `receipt.print`.

## Pipeline

```
Order ──► buildReceiptModel ──► renderEscPos  ──► printReceipt ──► TCP :9100
          (src/lib/receipt/      renderPlainText   (print.ts)        or simulate
           escpos.ts, pure)
```

- `src/lib/receipt/escpos.ts` (pure, client-safe, unit-tested) — resolves
  each line's modifiers + notes and the modifier-inclusive unit price, then
  renders **either** an 80mm ESC/POS byte payload (init · centred bold
  header · items · total · partial cut) **or** a plain-text receipt. Text is
  ASCII-folded so it prints cleanly on the factory code page.
- `src/lib/receipt/print.ts` (server-only) — the transport. See below.

## Two modes

| Mode | When | Behaviour |
| --- | --- | --- |
| **Printed** | `RECEIPT_PRINTER_HOST` is set | Opens a TCP socket to `HOST:PORT` (default `9100`, the raw/JetDirect port) and streams the ESC/POS bytes. |
| **Simulated** | no host configured | Returns the byte count + a plain-text preview; the UI prints that preview through the browser so a receipt still comes out. |

This means the **whole flow is exercised end-to-end without hardware** —
the simulator is not a stub, it produces the real payload and a real
(browser) printout.

## Configuration

| Env var | Default | Notes |
| --- | --- | --- |
| `RECEIPT_PRINTER_HOST` | _unset_ | Printer / print-bridge host. Unset ⇒ simulator. |
| `RECEIPT_PRINTER_PORT` | `9100` | Raw ESC/POS socket port. |

## Going live with real hardware

A truck-local thermal printer sits on the **truck's LAN**, which a
serverless function in the cloud cannot reach directly. Pick one:

1. **Print-bridge (recommended).** Run a tiny daemon on the truck (the POS
   tablet or a Raspberry Pi) that receives the bytes from the app and
   writes them to the printer's `9100` socket on the local network. Point
   `RECEIPT_PRINTER_HOST` at the bridge. This also lets you queue/retry
   when the head is offline.
2. **Reverse tunnel.** Expose the printer through Tailscale / ngrok and set
   `RECEIPT_PRINTER_HOST` to the tunnel address.

Hardware notes:

- Set the printer's **code page** (CP852 / Latin-2) if you need `ł ó ż`
  verbatim, then drop the ASCII fold in `escpos.ts`.
- For a **bump bar / cash drawer kick**, extend `escpos.ts` with the kick
  pulse (`ESC p 0 …`) — the byte-builder is the right place.
- Bluetooth heads generally expose the same raw socket via a bridge; treat
  them like a LAN printer.

## What this is not

- Not a Stripe-hosted receipt (those still go out by email).
- Not a label/KOT printer split — one customer receipt per order today; a
  per-station kitchen-ticket print would reuse the same `escpos.ts`
  builder with a station-filtered model.
