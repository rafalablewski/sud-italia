"use client";

import {
  Clock,
  FlaskConical,
  MapPin,
  Timer,
  Users,
} from "lucide-react";
import type { MenuCategory, Order, OrderStatus } from "@/data/types";
import { MENU_CATEGORY_LABELS } from "@/data/types";
import { fulfillmentLabel } from "@/lib/fulfillment";
import { FulfillmentIcon } from "@/components/FulfillmentIcon";
import { Badge, Button } from "./v2/ui";

/**
 * Shared Kitchen Display board primitives.
 *
 * Single source of truth for how a KDS ticket and the three-column board
 * look, so the live KDS (AdminKDS) and the KDS-simulator render byte-for-byte
 * identical cards. Anything visual lives here; the live board layers its
 * operational chrome (sound, pause, recall, hotkeys, role lenses) on top.
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

export function nextLabel(current: OrderStatus): string {
  if (current === "confirmed") return "Start prep";
  if (current === "preparing") return "Mark ready";
  if (current === "ready") return "Bump · Done";
  return "";
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

/**
 * Severity tone for a ticket. When the order has a promised-ready SLA
 * we drive the colour off remaining-vs-target (audit §3 — KDS was
 * surfacing elapsed-only, which lets a 5-minute order look as urgent
 * as a 25-minute order). Fall back to elapsed for legacy rows.
 */
export function prepTone(
  elapsedSeconds: number,
  remainingSeconds: number | null,
  status: OrderStatus,
): "neutral" | "warning" | "danger" {
  if (status === "ready") return "neutral";
  if (remainingSeconds !== null) {
    if (remainingSeconds < 0) return "danger";
    if (remainingSeconds < 180) return "warning";
    return "neutral";
  }
  const minutes = elapsedSeconds / 60;
  if (minutes > 25) return "danger";
  if (minutes > 12) return "warning";
  return "neutral";
}

export function ticketCategories(order: Order): MenuCategory[] {
  const set = new Set<MenuCategory>();
  for (const ci of order.items) set.add(ci.menuItem.category);
  return Array.from(set);
}

/**
 * Group active tickets into the board columns, applying the station filter
 * (a ticket is shown when it has any item for the focused station; rows for
 * other stations are dimmed inside the card) and sorting oldest-first so the
 * most-urgent ticket sits at the top of each column.
 */
export function groupByColumn(
  orders: Order[],
  station: MenuCategory | "all",
): Map<OrderStatus, Order[]> {
  const map = new Map<OrderStatus, Order[]>();
  for (const col of KDS_COLUMNS) map.set(col.id, []);
  for (const o of orders) {
    if (station !== "all" && !ticketCategories(o).includes(station)) continue;
    map.get(o.status)?.push(o);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => (a.paidAt || a.createdAt).localeCompare(b.paidAt || b.createdAt));
  }
  return map;
}

export interface TicketProps {
  order: Order;
  stationFilter: MenuCategory | "all";
  onAdvance: () => void;
  isUpdating: boolean;
  nowMs: number;
}

export function Ticket({ order, stationFilter, onAdvance, isUpdating, nowMs }: TicketProps) {
  // nowMs forces a recompute every tick
  void nowMs;
  const seconds = totalPrepSeconds(order);
  const remaining = remainingSlaSeconds(order);
  const tone = prepTone(seconds, remaining, order.status);
  const byCategory = new Map<MenuCategory, typeof order.items>();
  for (const ci of order.items) {
    const arr = byCategory.get(ci.menuItem.category) || [];
    arr.push(ci);
    byCategory.set(ci.menuItem.category, arr);
  }
  const itemCount = order.items.reduce((n, ci) => n + ci.quantity, 0);
  const shortId = order.id.slice(-6).replace(/^[^a-z0-9]+/i, "").toUpperCase();
  const overdue = remaining !== null && remaining < 0;
  const showSla = remaining !== null && order.status !== "ready";

  return (
    <div className={`v2-ticket v2-ticket-${tone}${order.simulated ? " v2-ticket-sim" : ""}`}>
      {order.simulated && (
        <div className="v2-ticket-sim-tag">
          <FlaskConical className="h-3 w-3" /> Simulation — not a real order
        </div>
      )}
      <header className="v2-ticket-header">
        <span className="v2-ticket-id mono">#{shortId}</span>
        <span className={`v2-ticket-timer v2-ticket-timer-${tone}`} title="Time since the order was placed">
          <Timer className="h-3.5 w-3.5" />
          <span className="tabular">{fmtClock(seconds)}</span>
        </span>
      </header>
      <div className="v2-ticket-body">
        <div className="v2-ticket-meta">
          <span className="v2-ticket-customer">{order.customerName || "Guest"}</span>
          <span className="v2-ticket-channel">
            <FulfillmentIcon type={order.fulfillmentType} className="h-3 w-3" />
            {fulfillmentLabel(order.fulfillmentType)}
            {order.fulfillmentType === "dine-in" && order.partySize ? (
              <span className="v2-ticket-party">
                <Users className="h-3 w-3" /> {order.partySize}
              </span>
            ) : null}
            <span className="v2-ticket-loc">
              <MapPin className="h-3 w-3" /> {order.locationSlug}
            </span>
          </span>
        </div>

        <div className="v2-ticket-stations">
          {Array.from(byCategory.entries()).map(([cat, items]) => {
            const dim = stationFilter !== "all" && stationFilter !== cat;
            return (
              <div key={cat} className={`v2-ticket-station ${dim ? "is-dim" : ""}`}>
                <div className="v2-ticket-station-label">{MENU_CATEGORY_LABELS[cat]}</div>
                <ul>
                  {items.map((ci, i) => (
                    <li key={`${ci.menuItem.id}-${i}`}>
                      <span className={`v2-ticket-qty${ci.quantity > 1 ? " is-multi" : ""}`}>
                        {ci.quantity}×
                      </span>
                      <span className="v2-ticket-name">{ci.menuItem.name}</span>
                      {ci.notes && (
                        <span className="v2-ticket-item-note">⚠ {ci.notes}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {order.specialInstructions && (
          <div className="v2-ticket-notes">
            <span className="v2-ticket-notes-label">Notes</span>
            <span>{order.specialInstructions}</span>
          </div>
        )}

        <footer className="v2-ticket-foot">
          <div className="v2-ticket-foot-info">
            <span className="v2-ticket-slot">
              <Clock className="h-3 w-3" /> {order.slotTime}
            </span>
            <span className="v2-ticket-count">
              {itemCount} item{itemCount === 1 ? "" : "s"}
            </span>
            {showSla && (
              <span
                className={`v2-ticket-sla v2-ticket-sla-${tone}`}
                title="Time remaining to promised-ready"
              >
                {overdue ? "Late " : "Due "}
                {fmtClock(Math.abs(remaining))}
              </span>
            )}
          </div>
          <Button
            block
            size="md"
            variant={order.status === "ready" ? "success" : "primary"}
            onClick={onAdvance}
            disabled={isUpdating}
          >
            {nextLabel(order.status)}
          </Button>
        </footer>
      </div>
    </div>
  );
}

export interface KdsBoardProps {
  /** Active tickets grouped into columns — pass groupByColumn(orders, station). */
  columns: Map<OrderStatus, Order[]>;
  stationFilter: MenuCategory | "all";
  nowMs: number;
  updatingId: string | null;
  onAdvance: (order: Order) => void;
}

export interface KdsLaneProps {
  /** Tickets for the focused status — pass columns.get(status). */
  tickets: Order[];
  stationFilter: MenuCategory | "all";
  nowMs: number;
  updatingId: string | null;
  onAdvance: (order: Order) => void;
}

/**
 * Single-stage focus view. When the operator switches the board to one lane
 * (New / In prep / Ready), the tickets for that status wrap into a dense
 * full-width grid instead of one narrow column — far more readable from across
 * the line and the core of the institutional fullscreen display. Reuses the
 * same Ticket primitive as the three-column board so the cards never drift.
 */
export function KdsLane({ tickets, stationFilter, nowMs, updatingId, onAdvance }: KdsLaneProps) {
  if (tickets.length === 0) {
    return <div className="v2-kds-lane-empty">No tickets in this lane.</div>;
  }
  return (
    <div className="v2-kds-lane-grid">
      {tickets.map((o) => (
        <Ticket
          key={o.id}
          order={o}
          stationFilter={stationFilter}
          onAdvance={() => onAdvance(o)}
          isUpdating={updatingId === o.id}
          nowMs={nowMs}
        />
      ))}
    </div>
  );
}

/**
 * The three-column KDS board (New / In progress / Ready · Expo) rendered from
 * a pre-grouped column map. Identical markup for the live board and the
 * simulator so they stay visually in lock-step.
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
                tickets.map((o) => (
                  <Ticket
                    key={o.id}
                    order={o}
                    stationFilter={stationFilter}
                    onAdvance={() => onAdvance(o)}
                    isUpdating={updatingId === o.id}
                    nowMs={nowMs}
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
