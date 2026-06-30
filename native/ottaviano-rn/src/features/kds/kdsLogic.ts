import type { OrderDTO, OrderLineDTO, OrderStatus } from "@/api/types";
import { fmtClock, parseMs } from "@/lib/format";

/**
 * Pure Kitchen Display logic — the column model, station filters, status
 * progression, tone tiers, SLA meter, due countdown, channel tag, station
 * grouping and allergen dedupe the KDS card renders. 1:1 with the web
 * `src/lib/kds-prediction.ts` (ticketTone) + `src/core/kds/CoreKds.tsx`
 * (dueLabel / slaPct) + `kds-board.ts` (grouping) — and the Swift `KDSLogic`
 * port. No UI, no colour: the card maps a `KdsTone` to a palette colour. Operates
 * directly on the server-enriched `OrderDTO` (which already carries the
 * prediction block computed by `analyzeTruck`).
 */

export type KdsTone = "queued" | "firing" | "warn" | "risk" | "late" | "ready";

export const MENU_CATEGORY_LABELS: Record<string, string> = {
  pizza: "Pizza",
  pasta: "Pasta",
  antipasti: "Antipasti",
  panini: "Panini",
  drinks: "Drinks",
  desserts: "Desserts",
};

export const KDS_COLUMNS: { id: OrderStatus; label: string }[] = [
  { id: "confirmed", label: "New" },
  { id: "preparing", label: "Firing" },
  { id: "ready", label: "Ready · Expo" },
];

export const BUMP_LABEL: Partial<Record<OrderStatus, string>> = {
  confirmed: "Start firing",
  preparing: "Mark ready",
  ready: "Bump to pass",
};

export const STATION_FILTERS: { id: string; label: string }[] = [
  { id: "all", label: "All stations" },
  { id: "pizza", label: "Pizza" },
  { id: "pasta", label: "Pasta" },
  { id: "antipasti", label: "Antipasti" },
  { id: "panini", label: "Panini" },
  { id: "drinks", label: "Drinks" },
  { id: "desserts", label: "Desserts" },
];

export function nextStatus(current: OrderStatus): OrderStatus | null {
  if (current === "confirmed") return "preparing";
  if (current === "preparing") return "ready";
  if (current === "ready") return "completed";
  return null;
}

export function paidAtMs(o: OrderDTO): number {
  return parseMs(o.paidAt) ?? parseMs(o.createdAt) ?? Date.now();
}

/** Live tone (web `ticketTone`). With a prediction block this is the SLA/at-risk
 *  model; without one (off-board single reads) it falls back to elapsed age. */
export function toneFor(o: OrderDTO, nowMs: number): KdsTone {
  if (o.status === "ready") return "ready";
  const promised = o.prediction?.promisedReadyAtMs ?? null;
  if (!o.prediction) {
    const mins = Math.max(0, (nowMs - paidAtMs(o)) / 60000);
    if (mins >= 12) return "late";
    if (mins >= 5) return "warn";
    return o.status === "confirmed" ? "queued" : "firing";
  }
  if (promised !== null) {
    const slaRem = promised - nowMs;
    if (slaRem < 0) return "late";
    if (o.prediction.predictedReadyAtMs > promised) return "risk";
    if (slaRem < 180000) return "warn";
  }
  return o.status === "confirmed" ? "queued" : "firing";
}

/** Due text + tone (web `dueLabel`): "done" when ready, "−mm:ss" past promise,
 *  the SLA countdown, or the predicted-ready countdown. */
export function dueLabel(o: OrderDTO, nowMs: number): { text: string; tone: KdsTone } {
  const tone = toneFor(o, nowMs);
  if (o.status === "ready") return { text: "done", tone };
  const promised = o.prediction?.promisedReadyAtMs ?? null;
  if (promised !== null) {
    const slaRemSec = (promised - nowMs) / 1000;
    if (slaRemSec < 0) return { text: `−${fmtClock(-slaRemSec)}`, tone };
    return { text: fmtClock(slaRemSec), tone };
  }
  if (o.prediction) return { text: fmtClock(Math.max(0, (o.prediction.predictedReadyAtMs - nowMs) / 1000)), tone };
  return { text: fmtClock(Math.max(0, (nowMs - paidAtMs(o)) / 1000)), tone };
}

/** Cook-time meter fill 0→1 (web `slaPct` / 100). */
export function slaFraction(o: OrderDTO, nowMs: number): number {
  if (o.status === "ready") return 1;
  const promised = o.prediction?.promisedReadyAtMs ?? null;
  if (promised !== null) {
    const slaRemSec = (promised - nowMs) / 1000;
    if (slaRemSec < 0) return 1;
    const windowSec = Math.max(60, (promised - paidAtMs(o)) / 1000);
    return Math.min(1, Math.max(0, 1 - slaRemSec / windowSec));
  }
  const elapsed = Math.max(0, (nowMs - paidAtMs(o)) / 1000);
  const predRem = Math.max(0, ((o.prediction?.predictedReadyAtMs ?? nowMs) - nowMs) / 1000);
  return Math.min(0.95, elapsed / Math.max(60, predRem + elapsed));
}

export function isLate(o: OrderDTO, nowMs: number): boolean {
  if (o.status === "ready") return false;
  const promised = o.prediction?.promisedReadyAtMs ?? null;
  return promised !== null && promised < nowMs;
}

export function isAtRisk(o: OrderDTO): boolean {
  return o.status !== "ready" && (o.prediction?.atRisk ?? false);
}

export function channelTag(o: OrderDTO): string {
  if (o.fulfillmentType === "dine-in") return `Dine-in${o.partySize ? ` · ${o.partySize}p` : ""}`;
  if (o.fulfillmentType === "delivery") return "Delivery";
  return "Takeaway";
}

const CATEGORY_ORDER = ["pizza", "pasta", "antipasti", "panini", "drinks", "desserts"];
function catRank(c: string): number {
  const i = CATEGORY_ORDER.indexOf(c);
  return i < 0 ? 99 : i;
}
function catLabel(c: string): string {
  return MENU_CATEGORY_LABELS[c] ?? (c ? c[0].toUpperCase() + c.slice(1) : c);
}

/** Group lines by station in canonical order (web `groupItems`). */
export function groupItems(items: OrderLineDTO[]): { label: string; category: string; items: OrderLineDTO[] }[] {
  const buckets = new Map<string, OrderLineDTO[]>();
  for (const it of items) {
    const arr = buckets.get(it.category) ?? [];
    arr.push(it);
    buckets.set(it.category, arr);
  }
  return [...buckets.entries()]
    .sort((a, b) => catRank(a[0]) - catRank(b[0]))
    .map(([cat, arr]) => ({ label: catLabel(cat), category: cat, items: arr }));
}

export function ticketAllergens(o: OrderDTO): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of o.items) for (const a of it.allergens) if (a && !seen.has(a)) (seen.add(a), out.push(a));
  return out;
}

/** Group tickets into board columns with the station filter, oldest-first. */
export function groupByColumn(orders: OrderDTO[], station: string): Map<OrderStatus, OrderDTO[]> {
  const map = new Map<OrderStatus, OrderDTO[]>();
  for (const col of KDS_COLUMNS) map.set(col.id, []);
  for (const o of orders) {
    if (station !== "all" && !o.items.some((i) => i.category === station)) continue;
    map.get(o.status)?.push(o);
  }
  for (const arr of map.values()) arr.sort((a, b) => paidAtMs(a) - paidAtMs(b));
  return map;
}
