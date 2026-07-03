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
  { id: "ready", label: "Ready · Pass", tone: "success" },
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

/** One step back — the destructive "recall" a long-press performs on a card. */
export function prevStatus(current: OrderStatus): OrderStatus | null {
  if (current === "preparing") return "confirmed";
  if (current === "ready") return "preparing";
  if (current === "completed") return "ready";
  return null;
}

/** Urgency rank for the in-column sort — lower sorts to the top (most urgent). */
const TONE_URGENCY: Record<TicketTone, number> = {
  late: 0, risk: 1, warn: 2, firing: 3, queued: 4, ready: 5,
};

export function fmtClock(s: number): string {
  // Round to whole seconds first — callers may pass a fractional seconds value
  // (e.g. an age derived from ms / 1000), and an unfloored remainder rendered as
  // "00:3.96099" instead of "00:04". Round so the clock reads cleanly.
  const total = Math.round(Math.abs(s));
  const m = Math.floor(total / 60);
  const r = total % 60;
  const sign = s < 0 ? "-" : "";
  return `${sign}${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/**
 * Group KDS tickets into the board columns, applying the station filter
 * (a ticket is shown when it has any item for the focused station) and sorting
 * each column by **SLA urgency** — the predictive tone first (late → risk →
 * warn → …), then least slack vs the promise (most over the wire first), then
 * oldest-paid as a tiebreak. The cook always reads the ticket that needs a hand
 * first, not just the oldest one. `nowMs` anchors the live tone.
 */
export function groupTicketsByColumn(
  tickets: KdsTicket[],
  station: MenuCategory | "all",
  nowMs: number,
): Map<OrderStatus, KdsTicket[]> {
  const map = new Map<OrderStatus, KdsTicket[]>();
  for (const col of KDS_COLUMNS) map.set(col.id, []);
  for (const t of tickets) {
    if (station !== "all" && !t.items.some((i) => i.category === station)) continue;
    map.get(t.status)?.push(t);
  }
  const slack = (t: KdsTicket) => (t.promisedReadyAtMs ?? t.predictedReadyAtMs) - t.predictedReadyAtMs;
  for (const arr of map.values()) {
    arr.sort((a, b) => {
      const ra = TONE_URGENCY[toneForTicket(a, nowMs)];
      const rb = TONE_URGENCY[toneForTicket(b, nowMs)];
      if (ra !== rb) return ra - rb; // most-urgent tone first
      const sa = slack(a), sb = slack(b);
      if (sa !== sb) return sa - sb; // least slack (most over promise) first
      return a.paidAtMs - b.paidAtMs; // oldest first
    });
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
