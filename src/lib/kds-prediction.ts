import type { MenuCategory, Order, OrderStatus } from "@/data/types";

/**
 * KDS predicted-ready engine (Atlas fleet command).
 *
 * A genuine, data-grounded completion-time model — NO fabricated numbers.
 * Every input is real:
 *   - per-item prep time comes from `MenuItem.prepTimeMinutes` (the same basis
 *     the promise model `computePromisedReadyAt` already uses),
 *   - live queue depth comes from the active orders the KDS already streams,
 *   - the New vs In-progress split (confirmed vs preparing) maps to
 *     incoming-forecast vs work-on-the-line.
 *
 * The model treats each menu category as a single-server FIFO station and
 * predicts when each ticket actually clears given everything ahead of it. A
 * ticket is flagged "at risk" when the model says it will miss its promised-
 * ready time BEFORE it is actually late — the signature predictive tier.
 *
 * Pure functions, no IO. Imports only erased types + a plain data constant
 * from `@/data/types`, so it is safe to import from both API routes and
 * `"use client"` components (CLAUDE.md rule #3).
 */

/** Stations the kitchen organises around — the menu categories. */
export const PACE_STATIONS: MenuCategory[] = [
  "pizza",
  "pasta",
  "antipasti",
  "panini",
  "drinks",
  "desserts",
];

/** Forecast / capacity horizon, minutes. */
export const PACE_WINDOW_MIN = 15;

/** Promise-accuracy target, %. Health drops below this. */
export const PROMISE_TARGET = 90;

/** Neutral fallback when a menu item is missing its optional prepTimeMinutes
 *  (legacy / admin-created rows). One honest default for an absent field —
 *  mirrors the `?? 0` fallback in computePromisedReadyAt rather than inventing
 *  per-category numbers. */
const DEFAULT_PREP_MIN = 6;

const ACTIVE: OrderStatus[] = ["confirmed", "preparing", "ready"];

export type PaceTier = "calm" | "warn" | "risk";
export type TicketTone = "queued" | "firing" | "warn" | "risk" | "late" | "ready";

export interface PaceStation {
  id: MenuCategory;
  /** Item-units in prep right now (preparing tickets). */
  currentLoad: number;
  /** Item-units queued, not yet started (confirmed tickets) — the incoming load. */
  forecast: number;
  /** currentLoad + forecast. */
  demand: number;
  /** Item-units this station can clear within the window (single server). */
  capacity: number;
  /** demand / capacity. */
  util: number;
  tier: PaceTier;
}

export interface TicketPrediction {
  orderId: string;
  /** Seconds the model expects until this ticket is plated, from `nowMs`. */
  predSeconds: number;
  /** Absolute predicted-ready instant (ms epoch). */
  predictedReadyAtMs: number;
  /** Promised-ready instant (ms epoch) from the order SLA, or null. */
  promisedReadyAtMs: number | null;
  /** Model predicts the promise will be missed, before it is actually late. */
  atRisk: boolean;
}

export interface TruckAnalysis {
  predictions: Map<string, TicketPrediction>;
  stations: PaceStation[];
  bottleneck: PaceStation | null;
  counts: { active: number; ready: number; late: number; risk: number; newCount: number; preparing: number };
}

export function itemPrepMinutes(item: { prepTimeMinutes?: number }): number {
  const p = item.prepTimeMinutes;
  return typeof p === "number" && p > 0 ? p : DEFAULT_PREP_MIN;
}

export function paceTier(util: number): PaceTier {
  if (util > 1.0) return "risk";
  if (util >= 0.8) return "warn";
  return "calm";
}

function paidMs(o: Order): number {
  const base = o.paidAt ? Date.parse(o.paidAt) : Date.parse(o.createdAt);
  return Number.isFinite(base) ? base : Date.now();
}

function promisedMs(o: Order): number | null {
  if (!o.estimatedReadyAt) return null;
  const t = Date.parse(o.estimatedReadyAt);
  return Number.isFinite(t) ? t : null;
}

/** Intrinsic prep for a ticket = the slowest item on it (stations within a
 *  ticket run in parallel — matches computePromisedReadyAt's max()). Seconds. */
function intrinsicPrepSeconds(o: Order): number {
  let max = 0;
  for (const ci of o.items) {
    const m = itemPrepMinutes(ci.menuItem);
    if (m > max) max = m;
  }
  return max * 60;
}

/** Sum item-units per category for one order, restricted to known stations. */
function unitsByCategory(o: Order): Map<MenuCategory, number> {
  const m = new Map<MenuCategory, number>();
  for (const ci of o.items) {
    const c = ci.menuItem.category;
    if (!PACE_STATIONS.includes(c)) continue;
    m.set(c, (m.get(c) ?? 0) + ci.quantity);
  }
  return m;
}

/**
 * Analyse one truck's active orders: per-station pace + per-ticket predicted
 * ready + at-risk flags. `nowMs` keeps it deterministic / testable.
 */
export function analyzeTruck(orders: Order[], nowMs: number): TruckAnalysis {
  const active = orders.filter((o) => ACTIVE.includes(o.status));
  const working = active.filter((o) => o.status !== "ready");

  // Typical per-unit prep per station depends only on the `working` snapshot,
  // so compute it once here rather than re-scanning `working` for every station
  // and again for every category of every ticket below. `unitsByCategory`
  // restricts to PACE_STATIONS, so this covers every category used downstream.
  const avgPrepByStation = new Map<MenuCategory, number>();
  for (const id of PACE_STATIONS) avgPrepByStation.set(id, stationPerUnitMinutes(working, id));

  // --- Per-station pace -----------------------------------------------------
  const load = new Map<MenuCategory, number>(); // preparing (on the line)
  const forecast = new Map<MenuCategory, number>(); // confirmed (queued, incoming)
  for (const o of working) {
    const target = o.status === "preparing" ? load : forecast;
    for (const [c, q] of unitsByCategory(o)) target.set(c, (target.get(c) ?? 0) + q);
  }

  const stations: PaceStation[] = PACE_STATIONS.map((id) => {
    const currentLoad = load.get(id) ?? 0;
    const forecastUnits = forecast.get(id) ?? 0;
    const demand = currentLoad + forecastUnits;
    // Single-server capacity over the window: how many units this station can
    // clear in PACE_WINDOW_MIN at the typical per-unit prep for its queue.
    const perUnitMin = avgPrepByStation.get(id) ?? DEFAULT_PREP_MIN;
    const capacity = perUnitMin > 0 ? PACE_WINDOW_MIN / perUnitMin : 0;
    const util = capacity > 0 ? demand / capacity : demand > 0 ? Infinity : 0;
    return { id, currentLoad, forecast: forecastUnits, demand, capacity, util, tier: paceTier(util) };
  });
  let bottleneck: PaceStation | null = null;
  for (const s of stations) {
    if (s.demand <= 0) continue;
    if (!bottleneck || s.util > bottleneck.util) bottleneck = s;
  }

  // --- Per-ticket predicted ready (FIFO single-server queue per station) ----
  // Service order: tickets already on the line (preparing) first, then queued
  // (confirmed), each oldest-first by paid time — how a kitchen actually pulls.
  const serviceOrder = [...working].sort((a, b) => {
    const sa = a.status === "preparing" ? 0 : 1;
    const sb = b.status === "preparing" ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return paidMs(a) - paidMs(b);
  });

  const stationFreeMs = new Map<MenuCategory, number>(); // when each station is next free
  const predictions = new Map<string, TicketPrediction>();

  for (const o of serviceOrder) {
    const units = unitsByCategory(o);
    const elapsedSec = Math.max(0, (nowMs - paidMs(o)) / 1000);
    let finishMs = nowMs;

    for (const [c, q] of units) {
      let svcSec = q * (avgPrepByStation.get(c) ?? DEFAULT_PREP_MIN) * 60;
      // Work already absorbed by an in-progress ticket shortens its remaining
      // service (it's been cooking since it was fired).
      if (o.status === "preparing") svcSec = Math.max(0, svcSec - elapsedSec);
      const freeMs = stationFreeMs.get(c) ?? nowMs;
      const startMs = Math.max(freeMs, nowMs);
      const doneMs = startMs + svcSec * 1000;
      stationFreeMs.set(c, doneMs);
      if (doneMs > finishMs) finishMs = doneMs;
    }

    // Floor the prediction at the ticket's own intrinsic remaining prep so a
    // lone ticket on an idle line still reads its real cook time.
    const intrinsicRemSec =
      o.status === "preparing"
        ? Math.max(0, intrinsicPrepSeconds(o) - elapsedSec)
        : intrinsicPrepSeconds(o);
    const floorMs = nowMs + intrinsicRemSec * 1000;
    if (floorMs > finishMs) finishMs = floorMs;

    const promised = promisedMs(o);
    const predSeconds = Math.max(0, Math.round((finishMs - nowMs) / 1000));
    const slaRem = promised !== null ? promised - nowMs : null;
    const atRisk = promised !== null && slaRem !== null && slaRem >= 0 && finishMs > promised;
    predictions.set(o.id, {
      orderId: o.id,
      predSeconds,
      predictedReadyAtMs: finishMs,
      promisedReadyAtMs: promised,
      atRisk,
    });
  }

  for (const o of active) {
    if (o.status === "ready" && !predictions.has(o.id)) {
      predictions.set(o.id, {
        orderId: o.id,
        predSeconds: 0,
        predictedReadyAtMs: nowMs,
        promisedReadyAtMs: promisedMs(o),
        atRisk: false,
      });
    }
  }

  const ready = active.filter((o) => o.status === "ready").length;
  let late = 0;
  let risk = 0;
  for (const o of working) {
    const p = predictions.get(o.id);
    const promised = promisedMs(o);
    if (promised !== null && promised - nowMs < 0) late++;
    else if (p?.atRisk) risk++;
  }

  return {
    predictions,
    stations,
    bottleneck,
    counts: {
      active: working.length,
      ready,
      late,
      risk,
      newCount: working.filter((o) => o.status === "confirmed").length,
      preparing: working.filter((o) => o.status === "preparing").length,
    },
  };
}

/** Typical per-unit prep (minutes) for a station, from the real items queued
 *  there now; falls back to the neutral default when the station is empty. */
function stationPerUnitMinutes(workingOrders: Order[], category: MenuCategory): number {
  let sum = 0;
  let n = 0;
  for (const o of workingOrders) {
    for (const ci of o.items) {
      if (ci.menuItem.category !== category) continue;
      sum += itemPrepMinutes(ci.menuItem) * ci.quantity;
      n += ci.quantity;
    }
  }
  return n > 0 ? sum / n : DEFAULT_PREP_MIN;
}

/**
 * Tone for a ticket from live timing. Recomputed client-side every tick so
 * timers + the predictive tier shift across thresholds in real time.
 *   ready → late (sla<0) → risk (predicted miss) → warn (<3m) → firing/queued.
 */
export function ticketTone(args: {
  status: OrderStatus;
  promisedReadyAtMs: number | null;
  predictedReadyAtMs: number;
  nowMs: number;
}): TicketTone {
  const { status, promisedReadyAtMs, predictedReadyAtMs, nowMs } = args;
  if (status === "ready") return "ready";
  const slaRem = promisedReadyAtMs !== null ? promisedReadyAtMs - nowMs : null;
  if (slaRem !== null && slaRem < 0) return "late";
  if (promisedReadyAtMs !== null && predictedReadyAtMs > promisedReadyAtMs) return "risk";
  if (slaRem !== null && slaRem < 180_000) return "warn";
  return status === "confirmed" ? "queued" : "firing";
}

/** Truck health score (0-100). Same shape as the Atlas mockup, real inputs. */
export function computeHealth(args: { late: number; risk: number; promiseAcc: number }): {
  health: number;
  state: string;
  cls: "good" | "warn" | "risk" | "alert";
} {
  const { late, risk, promiseAcc } = args;
  let health = 100;
  health -= late * 18;
  health -= risk * 9;
  if (promiseAcc < PROMISE_TARGET) health -= (PROMISE_TARGET - promiseAcc) * 2;
  health = Math.max(0, Math.min(100, Math.round(health)));

  let state: string;
  let cls: "good" | "warn" | "risk" | "alert";
  if (health >= 85) {
    state = "Healthy";
    cls = "good";
  } else if (health >= 70) {
    state = "Steady";
    cls = "good";
  } else if (health >= 55) {
    state = "Strained";
    cls = "warn";
  } else if (risk >= late) {
    state = "At risk";
    cls = "risk";
  } else {
    state = "Critical";
    cls = "alert";
  }
  return { health, state, cls };
}
