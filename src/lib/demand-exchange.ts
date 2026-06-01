import type { FulfillmentType, OrderStatus } from "@/data/types";

/**
 * Demand Exchange engine — keystone of Module 2 (see
 * docs/strategy/restaurant-os-blueprint.md §3). Reframes the booking grid from
 * a static `currentOrders / maxOrders` counter into **seat-minute inventory**
 * with a demand forecast and a throughput-true capacity ceiling, then
 * prescribes the yield action per slot (raise / trim / protect / hold).
 *
 * Pure compute over real slots + orders (+ the rejected-demand signal the rest
 * of the platform now logs); no I/O, fully unit-testable. The API route feeds
 * it live data. Never hardcode demand.
 */

/* ----------------------------- inputs ----------------------------- */

export interface DemandSlotInput {
  id: string;
  date: string; // YYYY-MM-DD (local)
  time: string; // HH:MM (local)
  maxOrders: number;
  currentOrders: number;
  fulfillmentTypes: FulfillmentType[];
  status: "draft" | "active";
}

export interface DemandOrderInput {
  slotDate: string;
  slotTime: string;
  status: OrderStatus;
  simulated?: boolean;
}

/** A logged rejection — a guest who wanted a slot that was full (real demand > supply). */
export interface DemandSignalInput {
  date: string;
  time: string;
}

export interface DemandBoardInput {
  date: string;
  slots: DemandSlotInput[];
  /** All orders (any date) — the historical demand profile is built from these. */
  orders: DemandOrderInput[];
  signals?: DemandSignalInput[];
  /** Demonstrated kitchen ceiling (covers/hour) from realized throughput; null = unknown. */
  kitchenCoversPerHour?: number | null;
  now?: Date;
}

/* ----------------------------- outputs ----------------------------- */

export type DemandTier = "under" | "healthy" | "tight" | "over" | "kitchen-capped";
export type DemandAction = "raise" | "trim" | "protect" | "hold";

export interface DemandSlotRow {
  slotId: string;
  time: string;
  status: "draft" | "active";
  fulfillmentTypes: FulfillmentType[];
  maxOrders: number;
  currentOrders: number;
  /** Forecast covers for this slot (≥ currentOrders, the booked floor). */
  predictedDemand: number;
  /** Throughput-true capacity for the slot window; null when kitchen data is unknown. */
  throughputCapacity: number | null;
  /** predictedDemand / maxOrders. */
  advertisedUtil: number;
  /** predictedDemand / throughputCapacity; null when unknown. */
  kitchenUtil: number | null;
  tier: DemandTier;
  recommendedMaxOrders: number;
  action: DemandAction;
  /** Logged rejections at this slot time (demand that walked). */
  missedDemand: number;
  note: string;
}

export interface DemandBoard {
  date: string;
  weekday: number; // 0=Sun … 6=Sat
  generatedAt: string;
  intervalMin: number;
  kitchenCoversPerHour: number | null;
  slots: DemandSlotRow[];
  summary: {
    predictedCovers: number;
    advertisedCapacity: number;
    throughputCapacity: number | null;
    /** predicted / advertised, as a %. */
    fillForecastPct: number;
    overCount: number;
    underCount: number;
    kitchenCappedCount: number;
    missedDemand: number;
  };
}

/* ----------------------------- helpers ----------------------------- */

function weekdayOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

function isCounted(o: DemandOrderInput): boolean {
  return o.status !== "pending" && o.status !== "cancelled" && !o.simulated;
}

/** Modal gap (minutes) between consecutive distinct slot times; default 30. */
function inferIntervalMin(times: string[]): number {
  const mins = [...new Set(times)].map(toMinutes).filter((n) => n >= 0).sort((a, b) => a - b);
  if (mins.length < 2) return 30;
  const gaps = new Map<number, number>();
  for (let i = 1; i < mins.length; i++) {
    const g = mins[i] - mins[i - 1];
    if (g > 0) gaps.set(g, (gaps.get(g) ?? 0) + 1);
  }
  let best = 30;
  let bestN = 0;
  for (const [g, n] of gaps) if (n > bestN) ((best = g), (bestN = n));
  return best;
}

function toMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}

/* ----------------------------- engine ----------------------------- */

export function buildDemandBoard(input: DemandBoardInput): DemandBoard {
  const now = input.now ?? new Date();
  const targetWeekday = weekdayOf(input.date);
  const intervalMin = inferIntervalMin(input.slots.map((s) => s.time));

  // Historical demand profile from real orders: average realized covers at a
  // (weekday, time), denominated by how often the truck was open that weekday.
  const counted = input.orders.filter(isCounted);
  const countByDateTime = new Map<string, number>(); // "date|time" -> covers
  const openDatesByWeekday = new Map<number, Set<string>>(); // weekday -> {dates open}
  for (const o of counted) {
    if (o.slotDate === input.date) continue; // don't leak the target date into its own forecast
    const key = `${o.slotDate}|${o.slotTime}`;
    countByDateTime.set(key, (countByDateTime.get(key) ?? 0) + 1);
    const wd = weekdayOf(o.slotDate);
    const set = openDatesByWeekday.get(wd) ?? new Set<string>();
    set.add(o.slotDate);
    openDatesByWeekday.set(wd, set);
  }

  const openDates = openDatesByWeekday.get(targetWeekday);
  const predictDemand = (time: string, bookedFloor: number): number => {
    if (!openDates || openDates.size === 0) return bookedFloor;
    let sum = 0;
    for (const d of openDates) sum += countByDateTime.get(`${d}|${time}`) ?? 0;
    const avg = sum / openDates.size;
    // Booked-so-far is a hard floor — demand can't be below what's already in.
    return Math.max(bookedFloor, Math.round(avg * 10) / 10);
  };

  // Rejections by slot time on the target date.
  const missedByTime = new Map<string, number>();
  for (const s of input.signals ?? []) {
    if (s.date !== input.date) continue;
    missedByTime.set(s.time, (missedByTime.get(s.time) ?? 0) + 1);
  }

  const cph = input.kitchenCoversPerHour ?? null;
  const throughputCapacityFor = (): number | null =>
    cph != null && cph > 0 ? Math.max(1, Math.round((cph * intervalMin) / 60)) : null;

  const rows: DemandSlotRow[] = input.slots
    .slice()
    .sort((a, b) => toMinutes(a.time) - toMinutes(b.time))
    .map((s) => {
      const predicted = predictDemand(s.time, s.currentOrders);
      const throughputCapacity = throughputCapacityFor();
      const advertisedUtil = s.maxOrders > 0 ? predicted / s.maxOrders : 0;
      const kitchenUtil = throughputCapacity ? predicted / throughputCapacity : null;
      const missed = missedByTime.get(s.time) ?? 0;

      const kitchenCapped = throughputCapacity != null && predicted > throughputCapacity;
      let tier: DemandTier;
      if (kitchenCapped) tier = "kitchen-capped";
      else if (predicted > s.maxOrders) tier = "over";
      else if (advertisedUtil >= 0.9) tier = "tight";
      else if (advertisedUtil < 0.5) tier = "under";
      else tier = "healthy";

      // Right-size to demand, but never above the kitchen ceiling and never
      // below what's already booked (you can't un-sell a seat).
      const ceil = throughputCapacity ?? Number.POSITIVE_INFINITY;
      const recommendedMaxOrders = Math.max(
        1,
        s.currentOrders,
        Math.min(Math.ceil(predicted * 1.1), ceil),
      );

      let action: DemandAction;
      let note: string;
      if (kitchenCapped) {
        action = "protect";
        note = `Demand ~${predicted} exceeds the kitchen's ~${throughputCapacity}/slot ceiling — raise minimum spend, prioritise high-value guests, deflect overflow to pickup.`;
      } else if (predicted > s.maxOrders) {
        action = "raise";
        note = `Demand ~${predicted} exceeds capacity ${s.maxOrders}${missed ? ` (${missed} already walked)` : ""} — raise to ${recommendedMaxOrders}.`;
      } else if (tier === "under" && s.maxOrders > recommendedMaxOrders) {
        action = "trim";
        note = `Forecast ~${predicted} vs capacity ${s.maxOrders} — trim to ${recommendedMaxOrders} or promote this window to fill it.`;
      } else {
        action = "hold";
        note = `Forecast ~${predicted} against capacity ${s.maxOrders} — well matched.`;
      }

      return {
        slotId: s.id,
        time: s.time,
        status: s.status,
        fulfillmentTypes: s.fulfillmentTypes,
        maxOrders: s.maxOrders,
        currentOrders: s.currentOrders,
        predictedDemand: predicted,
        throughputCapacity,
        advertisedUtil,
        kitchenUtil,
        tier,
        recommendedMaxOrders,
        action,
        missedDemand: missed,
        note,
      };
    });

  const predictedCovers = rows.reduce((s, r) => s + r.predictedDemand, 0);
  const advertisedCapacity = rows.reduce((s, r) => s + r.maxOrders, 0);
  const throughputCapacity =
    cph != null ? rows.reduce((s, r) => s + (r.throughputCapacity ?? 0), 0) : null;

  return {
    date: input.date,
    weekday: targetWeekday,
    generatedAt: now.toISOString(),
    intervalMin,
    kitchenCoversPerHour: cph,
    slots: rows,
    summary: {
      predictedCovers: Math.round(predictedCovers * 10) / 10,
      advertisedCapacity,
      throughputCapacity,
      fillForecastPct: advertisedCapacity > 0 ? Math.round((predictedCovers / advertisedCapacity) * 100) : 0,
      overCount: rows.filter((r) => r.tier === "over").length,
      underCount: rows.filter((r) => r.tier === "under").length,
      kitchenCappedCount: rows.filter((r) => r.tier === "kitchen-capped").length,
      missedDemand: rows.reduce((s, r) => s + r.missedDemand, 0),
    },
  };
}

/**
 * Demonstrated kitchen ceiling: the busiest realized covers-in-an-hour over a
 * trailing window — "we've delivered up to N/hour before". A high-water mark,
 * not a theoretical max. Returns null when there isn't enough history.
 */
export function demonstratedCoversPerHour(
  orderInstantsMs: number[],
  opts: { minSamples?: number } = {},
): number | null {
  const minSamples = opts.minSamples ?? 20;
  if (orderInstantsMs.length < minSamples) return null;
  const perHour = new Map<number, number>(); // hour-bucket epoch -> count
  for (const ms of orderInstantsMs) {
    const bucket = Math.floor(ms / 3_600_000);
    perHour.set(bucket, (perHour.get(bucket) ?? 0) + 1);
  }
  const counts = [...perHour.values()].sort((a, b) => b - a);
  if (counts.length === 0) return null;
  // 90th-percentile-busy hour (ignore a single freak hour) — the sustained peak.
  const idx = Math.min(counts.length - 1, Math.floor(counts.length * 0.1));
  return counts[idx];
}
