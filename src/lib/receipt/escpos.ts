/**
 * ESC/POS receipt rendering (audit §11.2 / §12.4 #7 — "where is the receipt
 * printer driver?"). Pure + client-safe: builds a normalized receipt model from
 * an order, then renders it either as an ESC/POS byte payload for a thermal
 * printer or as plain text (for the simulator preview + browser-print fallback).
 *
 * No server imports — unit-tested against fixed bytes. The transport (raw TCP to
 * the printer, or the simulator) lives in the server-only print.ts.
 */
import type { Order, CartItem } from "@/data/types";
import { effectiveUnitPrice } from "@/lib/upsell";
import { SITE_NAME } from "@/lib/constants";

const WIDTH = 42; // chars per line for an 80mm thermal head at Font A

export interface ReceiptLine {
  name: string;
  quantity: number;
  /** Modifier labels chosen on the line (resolved from the menu). */
  modifiers: string[];
  notes?: string;
  /** Per-unit price incl. modifiers, grosze. */
  unitGrosze: number;
}

export interface ReceiptModel {
  /** Operator trading name printed as the receipt header. */
  brand: string;
  orderShortId: string;
  locationSlug: string;
  customerName: string;
  fulfillmentType: string;
  slotTime: string;
  placedAt: string;
  lines: ReceiptLine[];
  totalGrosze: number;
}

/** Strip diacritics to ASCII so a printer on the default code page renders
 *  "Margherita", "zl" etc. cleanly. Go-live note: set the printer's code page
 *  (e.g. CP852 / Latin-2) and drop this fold if you need ł/ó/ż verbatim. */
function ascii(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .replace(/[^\x20-\x7e]/g, "");
}

function zl(grosze: number): string {
  return `${(grosze / 100).toFixed(2)} zl`;
}

export function buildReceiptModel(order: Order, brand: string = SITE_NAME): ReceiptModel {
  const lines: ReceiptLine[] = order.items.map((ci: CartItem) => {
    const groups = ci.menuItem.modifierGroups ?? [];
    const modifiers = (ci.selectedModifiers ?? [])
      .map(
        (sel) =>
          groups
            .find((g) => g.id === sel.groupId)
            ?.options.find((o) => o.id === sel.optionId)?.label,
      )
      .filter((x): x is string => !!x);
    return {
      name: ci.menuItem.name,
      quantity: ci.quantity,
      modifiers,
      notes: ci.notes,
      unitGrosze: effectiveUnitPrice(ci),
    };
  });
  return {
    brand,
    orderShortId: order.id.slice(-6).toUpperCase(),
    locationSlug: order.locationSlug,
    customerName: order.customerName,
    fulfillmentType: order.fulfillmentType,
    slotTime: order.slotTime,
    placedAt: order.paidAt ?? order.createdAt,
    lines,
    totalGrosze: order.totalAmount,
  };
}

/** "2x Margherita ............... 56.00 zl" — name left, price right-aligned. */
function row(left: string, right: string): string {
  const l = ascii(left);
  const r = ascii(right);
  const gap = Math.max(1, WIDTH - l.length - r.length);
  if (l.length + r.length + 1 > WIDTH) {
    // Too long — wrap the name, price on its own right-aligned line.
    return `${l}\n${" ".repeat(Math.max(0, WIDTH - r.length))}${r}`;
  }
  return `${l}${" ".repeat(gap)}${r}`;
}

/** Plain-text receipt — the simulator preview + the browser-print fallback. */
export function renderPlainText(m: ReceiptModel): string {
  const out: string[] = [];
  out.push(center(ascii(m.brand).toUpperCase()));
  out.push(center("Neapolitan restaurant"));
  out.push(center(m.locationSlug.toUpperCase()));
  out.push("");
  out.push(`Order #${m.orderShortId}`);
  out.push(`${m.customerName} · ${m.fulfillmentType}`);
  out.push(`Ready: ${m.slotTime}`);
  out.push(new Date(m.placedAt).toLocaleString("en-GB"));
  out.push("-".repeat(WIDTH));
  for (const l of m.lines) {
    out.push(row(`${l.quantity}x ${l.name}`, zl(l.unitGrosze * l.quantity)));
    for (const mod of l.modifiers) out.push(`   + ${ascii(mod)}`);
    if (l.notes) out.push(`   * ${ascii(l.notes)}`);
  }
  out.push("-".repeat(WIDTH));
  out.push(row("TOTAL", zl(m.totalGrosze)));
  out.push("");
  out.push(center("Grazie mille!"));
  out.push(center("mangia bene, ridi spesso"));
  return out.join("\n");
}

function center(s: string): string {
  const t = ascii(s);
  if (t.length >= WIDTH) return t;
  const pad = Math.floor((WIDTH - t.length) / 2);
  return " ".repeat(pad) + t;
}

// --- ESC/POS command bytes ----------------------------------------------
const ESC = 0x1b;
const GS = 0x1d;
const INIT = [ESC, 0x40];
const ALIGN_LEFT = [ESC, 0x61, 0x00];
const ALIGN_CENTER = [ESC, 0x61, 0x01];
const BOLD_ON = [ESC, 0x45, 0x01];
const BOLD_OFF = [ESC, 0x45, 0x00];
const SIZE_DOUBLE = [GS, 0x21, 0x11];
const SIZE_NORMAL = [GS, 0x21, 0x00];
const FEED_AND_CUT = [GS, 0x56, 0x42, 0x03]; // partial cut after a small feed

function bytes(s: string): number[] {
  return Array.from(ascii(s), (c) => c.charCodeAt(0) & 0xff);
}
function line(acc: number[], s = ""): void {
  acc.push(...bytes(s), 0x0a);
}

/** Render the model to an ESC/POS byte payload for an 80mm thermal printer. */
export function renderEscPos(m: ReceiptModel): Uint8Array {
  const a: number[] = [];
  a.push(...INIT);
  a.push(...ALIGN_CENTER, ...BOLD_ON, ...SIZE_DOUBLE);
  line(a, ascii(m.brand).toUpperCase());
  a.push(...SIZE_NORMAL, ...BOLD_OFF);
  line(a, "Neapolitan restaurant");
  line(a, m.locationSlug.toUpperCase());
  a.push(...ALIGN_LEFT);
  line(a);
  a.push(...BOLD_ON);
  line(a, `Order #${m.orderShortId}`);
  a.push(...BOLD_OFF);
  line(a, `${m.customerName} · ${m.fulfillmentType}`);
  line(a, `Ready: ${m.slotTime}`);
  line(a, new Date(m.placedAt).toLocaleString("en-GB"));
  line(a, "-".repeat(WIDTH));
  for (const l of m.lines) {
    line(a, row(`${l.quantity}x ${l.name}`, zl(l.unitGrosze * l.quantity)));
    for (const mod of l.modifiers) line(a, `   + ${mod}`);
    if (l.notes) line(a, `   * ${l.notes}`);
  }
  line(a, "-".repeat(WIDTH));
  a.push(...BOLD_ON);
  line(a, row("TOTAL", zl(m.totalGrosze)));
  a.push(...BOLD_OFF);
  line(a);
  a.push(...ALIGN_CENTER);
  line(a, "Grazie mille!");
  line(a, "mangia bene, ridi spesso");
  line(a);
  line(a);
  a.push(...FEED_AND_CUT);
  return Uint8Array.from(a);
}
