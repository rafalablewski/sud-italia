import type { MenuCategory, OrderStatus } from "@/data/types";
import { MENU_CATEGORY_LABELS } from "@/data/types";
import { ticketTone, type TicketTone } from "@/lib/kds-prediction";
import type { KdsTicket } from "@/lib/kds-ticket";

/**
 * Pure Kitchen Display board logic — the column model, station filters, status
 * progression, clock formatting, grouping + ticket tone. No UI, no theme: the
 * KDS surface renders its own cards/lanes from these helpers. Shared by the
 * Core KDS surface; kept framework-free so it stays trivially testable.
 */

export const KDS_COLUMNS: { id: OrderStatus; label: string; tone: "warning" | "info" | "success" }[] = [
  { id: "confirmed", label: "New", tone: "warning" },
  { id: "preparing", label: "Firing", tone: "info" },
  { id: "ready", label: "Ready · Expo", tone: "success" },
];

export const STATION_FILTERS: { id: MenuCategory | "all"; label: string }[] = [
  { id: "all", label: "All stations" },
  { id: "pizza", label: MENU_CATEGORY_LABELS.pizza },
  { id: "pasta", label: MENU_CATEGORY_LABELS.pasta },
  { id: "antipasti", label: MENU_CATEGORY_LABELS.antipasti },
  { id: "panini", label: MENU_CATEGORY_LABELS.panini },
  { id: "drinks", label: MENU_CATEGORY_LABELS.drinks },
  { id: "desserts", label: MENU_CATEGORY_LABELS.desserts },
];

export function nextStatus(current: OrderStatus): OrderStatus | null {
  if (current === "confirmed") return "preparing";
  if (current === "preparing") return "ready";
  if (current === "ready") return "completed";
  return null;
}

export function fmtClock(s: number): string {
  const abs = Math.abs(s);
  const m = Math.floor(abs / 60);
  const r = abs % 60;
  const sign = s < 0 ? "-" : "";
  return `${sign}${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/**
 * Group KDS tickets into the board columns, applying the station filter
 * (a ticket is shown when it has any item for the focused station) and sorting
 * oldest-first so the most-urgent ticket sits at the top of each column.
 */
export function groupTicketsByColumn(
  tickets: KdsTicket[],
  station: MenuCategory | "all",
): Map<OrderStatus, KdsTicket[]> {
  const map = new Map<OrderStatus, KdsTicket[]>();
  for (const col of KDS_COLUMNS) map.set(col.id, []);
  for (const t of tickets) {
    if (station !== "all" && !t.items.some((i) => i.category === station)) continue;
    map.get(t.status)?.push(t);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => a.paidAtMs - b.paidAtMs);
  }
  return map;
}

/** Live tone for a ticket — the shared predictive model (at-risk violet tier
 *  included) so every KDS surface colours a ticket identically. */
export function toneForTicket(t: KdsTicket, nowMs: number): TicketTone {
  return ticketTone({
    status: t.status,
    promisedReadyAtMs: t.promisedReadyAtMs,
    predictedReadyAtMs: t.predictedReadyAtMs,
    nowMs,
  });
}
