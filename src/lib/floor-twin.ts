import type { TableStatus } from "@/data/types";

/**
 * Floor Twin engine — keystone of Module 3 (see
 * docs/strategy/restaurant-os-blueprint.md §4). Turns the floor from a
 * status board into a live economic simulation of the room: every table is a
 * revenue unit with a realized turn-time, spend velocity, and a predicted
 * free-in time, so the manager gets *moves* (seat here, T12 frees in ~11m)
 * instead of status.
 *
 * Pure compute over real dine-in orders + the current table list; no I/O,
 * fully unit-testable. The §4.2 realized-dwell signal is the dine-in order
 * timeline (createdAt → paidAt) — already captured, no instrumentation needed.
 * Never hardcode floor state.
 */

const MIN = 60_000;
/** Orders in service right now (mirror the KDS active set). */
const ACTIVE_STATUSES = new Set(["confirmed", "preparing", "ready"]);
/** Guardrails so a stale tab or clock skew can't poison the turn-time physics. */
const MIN_DWELL_MIN = 5;
const MAX_DWELL_MIN = 360;

/* ----------------------------- inputs ----------------------------- */

export interface TwinTableInput {
  id: string;
  number: string;
  seats: number;
  zone?: string;
  status: TableStatus;
}

export interface TwinOrderInput {
  tableId?: string;
  partySize?: number;
  totalAmount: number;
  status: string;
  createdAt: string;
  paidAt?: string | null;
  fulfillmentType?: string;
  simulated?: boolean;
}

/** A logged table status transition (from the floor-events instrumentation). */
export interface FloorTransitionInput {
  tableId: string;
  from: string;
  to: string;
  at: string;
}

export interface FloorTwinInput {
  tables: TwinTableInput[];
  /** All orders; the engine keeps dine-in only. */
  orders: TwinOrderInput[];
  /** Table status transitions — when present, give *measured* seat→clear dwell
   *  (preferred over the order-timeline proxy) and an exact live seat time. */
  transitions?: FloorTransitionInput[];
  now?: Date;
}

/* ----------------------------- outputs ----------------------------- */

export interface TwinTableRow {
  id: string;
  number: string;
  seats: number;
  zone?: string;
  status: TableStatus;
  // realized physics (from this table's completed dine-in orders)
  turns: number;
  medianDwellMin: number | null;
  /** Where the turn-time came from: instrumented transitions vs the order proxy. */
  dwellSource: "measured" | "orders" | null;
  avgSpendGrosze: number | null;
  spendVelocityPerHourGrosze: number | null;
  // live state
  occupied: boolean;
  occupiedSince: string | null;
  elapsedMin: number | null;
  /** Predicted minutes until the table frees (median turn − elapsed). Null when unknown. */
  predictedFreeInMin: number | null;
  party: number | null;
  openCheckGrosze: number | null;
}

export interface SeatingSuggestion {
  tableId: string;
  number: string;
  seats: number;
  /** 0 = open now; otherwise predicted minutes until it frees. */
  readyInMin: number;
  note: string;
}

export interface FloorTwin {
  generatedAt: string;
  tables: TwinTableRow[];
  summary: {
    totalTables: number;
    openTables: number;
    seated: number;
    occupancyPct: number;
    /** Tables predicted to free within 15 / 30 minutes. */
    freeingSoon15: number;
    freeingSoon30: number;
    medianTurnMin: number | null;
    /** Floor-wide realized spend velocity (grosze/hour of occupied table-time). */
    spendVelocityPerHourGrosze: number | null;
  };
}

/* ----------------------------- helpers ----------------------------- */

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function pushTo(m: Map<string, number[]>, key: string, v: number): void {
  const arr = m.get(key);
  if (arr) arr.push(v);
  else m.set(key, [v]);
}

function isDineIn(o: TwinOrderInput): boolean {
  return (o.fulfillmentType ?? "dine-in") === "dine-in" && !o.simulated;
}

/* ----------------------------- engine ----------------------------- */

export function buildFloorTwin(input: FloorTwinInput): FloorTwin {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const dineIn = input.orders.filter(isDineIn);

  // Completed turns → realized dwell + spend, bucketed by table.
  const dwellByTable = new Map<string, number[]>();
  const spendByTable = new Map<string, number[]>();
  const allDwell: number[] = [];
  let occupiedHours = 0;
  let occupiedSpend = 0;
  for (const o of dineIn) {
    if (o.status !== "completed" || !o.paidAt) continue;
    const dwellMin = (new Date(o.paidAt).getTime() - new Date(o.createdAt).getTime()) / MIN;
    if (!(dwellMin >= MIN_DWELL_MIN && dwellMin <= MAX_DWELL_MIN)) continue;
    allDwell.push(dwellMin);
    occupiedHours += dwellMin / 60;
    occupiedSpend += o.totalAmount;
    if (o.tableId) {
      pushTo(dwellByTable, o.tableId, dwellMin);
      pushTo(spendByTable, o.tableId, o.totalAmount);
    }
  }
  // Measured dwell from instrumented transitions: pair each →seated with the
  // next seated→cleared. A still-open seated run gives an exact live seat time.
  const measuredByTable = new Map<string, number[]>();
  const liveSinceByTable = new Map<string, string>();
  if (input.transitions?.length) {
    const evByTable = new Map<string, FloorTransitionInput[]>();
    for (const e of input.transitions) {
      const arr = evByTable.get(e.tableId);
      if (arr) arr.push(e);
      else evByTable.set(e.tableId, [e]);
    }
    for (const [tableId, evs] of evByTable) {
      evs.sort((a, b) => a.at.localeCompare(b.at));
      let openStart: number | null = null;
      for (const e of evs) {
        if (e.to === "seated") openStart = new Date(e.at).getTime();
        else if (e.from === "seated" && openStart != null) {
          const dwellMin = (new Date(e.at).getTime() - openStart) / MIN;
          if (dwellMin >= MIN_DWELL_MIN && dwellMin <= MAX_DWELL_MIN) pushTo(measuredByTable, tableId, dwellMin);
          openStart = null;
        }
      }
      if (openStart != null) liveSinceByTable.set(tableId, new Date(openStart).toISOString());
    }
  }
  const allMeasured = [...measuredByTable.values()].flat();
  // Floor-wide turn-time prefers measured samples when we have any.
  const floorMedianTurn = median(allMeasured.length ? allMeasured : allDwell);

  // Open checks → who's seated right now, and since when.
  const openByTable = new Map<string, TwinOrderInput>();
  for (const o of dineIn) {
    if (!o.tableId || !ACTIVE_STATUSES.has(o.status)) continue;
    const prev = openByTable.get(o.tableId);
    // Keep the earliest open check as the seat time.
    if (!prev || new Date(o.createdAt).getTime() < new Date(prev.createdAt).getTime()) {
      openByTable.set(o.tableId, o);
    }
  }

  const rows: TwinTableRow[] = input.tables.map((t) => {
    const measured = measuredByTable.get(t.id) ?? [];
    const orderDwell = dwellByTable.get(t.id) ?? [];
    // Prefer instrumented (measured) dwell; fall back to the order proxy.
    const samples = measured.length ? measured : orderDwell;
    const dwellSource: "measured" | "orders" | null = measured.length
      ? "measured"
      : orderDwell.length
        ? "orders"
        : null;
    const spend = spendByTable.get(t.id) ?? [];
    const medianDwellMin = median(samples);
    const avgSpendGrosze = spend.length ? Math.round(spend.reduce((a, b) => a + b, 0) / spend.length) : null;
    const turnMin = medianDwellMin ?? floorMedianTurn;
    const spendVelocityPerHourGrosze =
      avgSpendGrosze != null && turnMin && turnMin > 0 ? Math.round(avgSpendGrosze / (turnMin / 60)) : null;

    // Exact live seat time from transitions wins over the open check's createdAt.
    const liveSince = liveSinceByTable.get(t.id) ?? null;
    const open = openByTable.get(t.id);
    const occupied = !!liveSince || !!open || t.status === "seated";
    const occupiedSince = liveSince ?? open?.createdAt ?? null;
    const elapsedMin = occupiedSince ? Math.max(0, (nowMs - new Date(occupiedSince).getTime()) / MIN) : null;
    const predictedFreeInMin =
      elapsedMin != null && turnMin ? Math.max(0, Math.round(turnMin - elapsedMin)) : null;

    return {
      id: t.id,
      number: t.number,
      seats: t.seats,
      zone: t.zone,
      status: t.status,
      turns: samples.length,
      medianDwellMin: medianDwellMin != null ? Math.round(medianDwellMin) : null,
      dwellSource,
      avgSpendGrosze,
      spendVelocityPerHourGrosze,
      occupied,
      occupiedSince,
      elapsedMin: elapsedMin != null ? Math.round(elapsedMin) : null,
      predictedFreeInMin,
      party: open?.partySize ?? null,
      openCheckGrosze: open?.totalAmount ?? null,
    };
  });

  const serviceable = rows.filter((r) => r.status !== "out-of-service");
  const seated = serviceable.filter((r) => r.occupied).length;
  const freeingSoon = (mins: number) =>
    serviceable.filter((r) => r.occupied && r.predictedFreeInMin != null && r.predictedFreeInMin <= mins).length;

  return {
    generatedAt: now.toISOString(),
    tables: rows,
    summary: {
      totalTables: serviceable.length,
      openTables: serviceable.filter((r) => !r.occupied).length,
      seated,
      occupancyPct: serviceable.length ? Math.round((seated / serviceable.length) * 100) : 0,
      freeingSoon15: freeingSoon(15),
      freeingSoon30: freeingSoon(30),
      medianTurnMin: floorMedianTurn != null ? Math.round(floorMedianTurn) : null,
      spendVelocityPerHourGrosze: occupiedHours > 0 ? Math.round(occupiedSpend / occupiedHours) : null,
    },
  };
}

/**
 * Predictive seating — given a party size, rank where to seat them: open
 * tables that fit (best-fit, least wasted seats) first, then seated tables
 * that fit by soonest predicted free-in. Pure, so the UI can run it live as
 * the operator types the party size. Skips out-of-service tables.
 */
export function recommendSeating(twin: FloorTwin, partySize: number): SeatingSuggestion[] {
  const fits = twin.tables.filter((t) => t.status !== "out-of-service" && t.seats >= partySize);

  const openNow = fits
    .filter((t) => !t.occupied)
    .sort((a, b) => a.seats - b.seats) // best-fit: least wasted seats
    .map<SeatingSuggestion>((t) => ({
      tableId: t.id,
      number: t.number,
      seats: t.seats,
      readyInMin: 0,
      note: `Open now · ${t.seats} seats${t.zone ? ` · ${t.zone}` : ""}`,
    }));

  const freeingSoon = fits
    .filter((t) => t.occupied && t.predictedFreeInMin != null)
    .sort((a, b) => (a.predictedFreeInMin ?? 0) - (b.predictedFreeInMin ?? 0))
    .map<SeatingSuggestion>((t) => ({
      tableId: t.id,
      number: t.number,
      seats: t.seats,
      readyInMin: t.predictedFreeInMin ?? 0,
      note:
        (t.predictedFreeInMin ?? 0) <= 0
          ? `Finishing now · ${t.seats} seats`
          : `Frees in ~${t.predictedFreeInMin}m · ${t.seats} seats`,
    }));

  return [...openNow, ...freeingSoon].slice(0, 5);
}
