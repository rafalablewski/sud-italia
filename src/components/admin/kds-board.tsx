"use client";

import type { MenuCategory, Order, OrderStatus } from "@/data/types";
import { MENU_CATEGORY_LABELS } from "@/data/types";
import { Badge } from "./v2/ui";
import { ticketTone, type TicketTone } from "@/lib/kds-prediction";
import type { KdsTicket } from "@/lib/kds-ticket";
import { KdsTicketCard } from "./kds/KdsTicketCard";

/**
 * Shared Kitchen Display board primitives.
 *
 * The three-column board (New / In progress / Ready · Expo) renders the shared
 * KdsTicketCard — the same card the Atlas fleet board uses — so the floor board
 * keeps its lane workflow but the cards are byte-for-byte identical to Fleet.
 * The live KDS (AdminKDS) layers its operational chrome (sound, pause, recall,
 * hotkeys, role lenses) on top.
 */

export const ACTIVE_STATUSES: OrderStatus[] = ["confirmed", "preparing", "ready"];

export const KDS_COLUMNS: { id: OrderStatus; label: string; tone: "warning" | "info" | "success" }[] = [
  { id: "confirmed", label: "New", tone: "warning" },
  { id: "preparing", label: "In progress", tone: "info" },
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

export function totalPrepSeconds(order: Order): number {
  const base = order.paidAt ? new Date(order.paidAt).getTime() : new Date(order.createdAt).getTime();
  return Math.max(0, Math.round((Date.now() - base) / 1000));
}

/**
 * Seconds remaining until the order's promised-ready timestamp. Returns
 * null when the order has no SLA (legacy rows before the m2_5 migration,
 * or orders fired without a recipe-driven promise). Negative values
 * mean the order is overdue.
 */
export function remainingSlaSeconds(order: Order): number | null {
  if (!order.estimatedReadyAt) return null;
  const target = new Date(order.estimatedReadyAt).getTime();
  if (!Number.isFinite(target)) return null;
  return Math.round((target - Date.now()) / 1000);
}

export function fmtClock(s: number): string {
  const abs = Math.abs(s);
  const m = Math.floor(abs / 60);
  const r = abs % 60;
  const sign = s < 0 ? "-" : "";
  return `${sign}${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function ticketCategories(order: Order): MenuCategory[] {
  const set = new Set<MenuCategory>();
  for (const ci of order.items) set.add(ci.menuItem.category);
  return Array.from(set);
}

/**
 * Group KDS tickets into the board columns, applying the station filter
 * (a ticket is shown when it has any item for the focused station; rows for
 * other stations are dimmed inside the card) and sorting oldest-first so the
 * most-urgent ticket sits at the top of each column.
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

/** Live tone for a ticket — the same predictive model the Atlas board uses, so
 *  the floor cards colour identically (at-risk violet tier included). */
export function toneForTicket(t: KdsTicket, nowMs: number): TicketTone {
  return ticketTone({
    status: t.status,
    promisedReadyAtMs: t.promisedReadyAtMs,
    predictedReadyAtMs: t.predictedReadyAtMs,
    nowMs,
  });
}

export interface KdsBoardProps {
  /** Tickets grouped into columns — pass groupTicketsByColumn(tickets, station). */
  columns: Map<OrderStatus, KdsTicket[]>;
  stationFilter: MenuCategory | "all";
  nowMs: number;
  updatingId: string | null;
  onAdvance: (t: KdsTicket) => void;
}

export interface KdsLaneProps {
  /** Tickets for the focused status — pass columns.get(status). */
  tickets: KdsTicket[];
  stationFilter: MenuCategory | "all";
  nowMs: number;
  updatingId: string | null;
  onAdvance: (t: KdsTicket) => void;
}

/**
 * Single-stage focus view. When the operator switches the board to one lane
 * (New / In prep / Ready), the tickets for that status wrap into a dense
 * full-width grid instead of one narrow column — far more readable from across
 * the line. Reuses the shared KdsTicketCard so the cards never drift from Fleet.
 */
export function KdsLane({ tickets, stationFilter, nowMs, updatingId, onAdvance }: KdsLaneProps) {
  if (tickets.length === 0) {
    return <div className="v2-kds-lane-empty">No tickets in this lane.</div>;
  }
  return (
    <div className="v2-kds-lane-grid">
      {tickets.map((t) => (
        <KdsTicketCard
          key={t.id}
          t={t}
          now={nowMs}
          tone={toneForTicket(t, nowMs)}
          station={stationFilter}
          advancing={updatingId === t.id}
          onAdvance={onAdvance}
        />
      ))}
    </div>
  );
}

/**
 * The three-column KDS board (New / In progress / Ready · Expo) rendered from
 * a pre-grouped column map, using the shared KdsTicketCard so the floor board
 * keeps its lane workflow while the cards match the Atlas fleet board exactly.
 */
export function KdsBoard({ columns, stationFilter, nowMs, updatingId, onAdvance }: KdsBoardProps) {
  return (
    <div className="v2-kds-board">
      {KDS_COLUMNS.map((col) => {
        const tickets = columns.get(col.id) || [];
        return (
          <div key={col.id} className={`v2-kds-col v2-kds-col-${col.tone}`}>
            <div className="v2-kds-col-header">
              <Badge tone={col.tone} variant="solid">
                {col.label}
              </Badge>
              <span className="v2-kds-col-count">{tickets.length}</span>
            </div>
            <div className="v2-kds-col-body">
              {tickets.length === 0 ? (
                <div className="v2-kds-col-empty">No tickets here.</div>
              ) : (
                tickets.map((t) => (
                  <KdsTicketCard
                    key={t.id}
                    t={t}
                    now={nowMs}
                    tone={toneForTicket(t, nowMs)}
                    station={stationFilter}
                    advancing={updatingId === t.id}
                    onAdvance={onAdvance}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
