import net from "node:net";
import type { Order } from "@/data/types";
import { buildReceiptModel, renderEscPos, renderPlainText } from "./escpos";
import { logger } from "@/lib/logger";

/**
 * Server-side receipt transport. When a network printer is configured
 * (`RECEIPT_PRINTER_HOST`, optional `RECEIPT_PRINTER_PORT`, default 9100 — the
 * raw/JetDirect port every ESC/POS LAN + most Bluetooth-bridged thermal heads
 * listen on) it opens a TCP socket and streams the ESC/POS bytes. With no host
 * set it runs as a SIMULATOR: it returns the exact byte count + a plain-text
 * preview of what would print, so the whole flow is exercised end-to-end without
 * hardware.
 *
 * GO-LIVE (real hardware): a truck-local thermal printer is on the truck's LAN,
 * not reachable from a serverless function in the cloud. Two supported paths:
 *   1. Run a tiny print-bridge on the truck (a Raspberry Pi / the POS tablet)
 *      that holds a WebSocket/poll to the app and writes received bytes to the
 *      printer's 9100 socket. Point this code at the bridge.
 *   2. Expose the printer through a reverse tunnel (Tailscale / ngrok) and set
 *      RECEIPT_PRINTER_HOST to the tunnel address.
 * Also set the printer's code page (CP852 / Latin-2) if you need ł/ó/ż verbatim;
 * escpos.ts ASCII-folds by default so it prints cleanly on the factory code page.
 */

export interface PrintResult {
  mode: "printed" | "simulated";
  bytes: number;
  /** Plain-text rendering of the receipt — shown in the simulator + usable as a
   *  browser-print fallback. */
  preview: string;
  printer?: string;
  message: string;
}

function sendRaw(host: string, port: number, payload: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(5000);
    socket.on("connect", () => {
      socket.write(Buffer.from(payload), () => socket.end());
    });
    socket.on("error", (err) => reject(err));
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("printer connection timed out"));
    });
    socket.on("close", () => resolve());
  });
}

export async function printReceipt(order: Order): Promise<PrintResult> {
  const model = buildReceiptModel(order);
  const payload = renderEscPos(model);
  const preview = renderPlainText(model);

  const host = process.env.RECEIPT_PRINTER_HOST?.trim();
  const port = Number(process.env.RECEIPT_PRINTER_PORT || 9100);

  if (!host) {
    return {
      mode: "simulated",
      bytes: payload.length,
      preview,
      message:
        "Simulated — no RECEIPT_PRINTER_HOST configured. The preview is exactly what would print; wire a printer or print-bridge to go live.",
    };
  }

  await sendRaw(host, port, payload);
  logger.info("receipt printed", {
    layer: "receipt.print",
    orderId: order.id,
    printer: `${host}:${port}`,
    bytes: payload.length,
  });
  return {
    mode: "printed",
    bytes: payload.length,
    preview,
    printer: `${host}:${port}`,
    message: `Sent ${payload.length} bytes to ${host}:${port}.`,
  };
}
