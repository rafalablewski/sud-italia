import type { Order } from "@/data/types";
import { MENU_CATEGORY_LABELS, type MenuCategory } from "@/data/types";
import { analyzeTruck, computeHealth, PACE_WINDOW_MIN, PROMISE_TARGET } from "@/lib/kds-prediction";
import { toOrderDTO } from "./order-dto";
import type { FleetBoardDTO, FleetTileDTO } from "./schemas";

/**
 * Pure mappers for the owner fleet feed (`/api/v1/admin/kds/fleet`) — the native
 * twin of the web `/api/admin/kds/fleet` route. The route does the per-location
 * I/O (orders, KDS service history, labor); these turn that real data into the
 * published `FleetBoard` shape, so the math is unit-tested and can't drift from
 * the contract. Reuses `analyzeTruck` (predicted-ready + pace) and `toOrderDTO`
 * so the tile's ticket previews are the SAME enriched orders the KDS board ships.
 */

const ACTIVE = new Set(["confirmed", "preparing", "ready"]);

export interface FleetTileInput {
  slug: string;
  name: string;
  /** Location orders since the start of the day (simulated stripped upstream). */
  orders: Order[];
  /** ms-epoch cutoff for the "last hour" rate metrics. */
  hourAgoMs: number;
  /** Promise accuracy % from the KDS ticket ledger (PROMISE_TARGET fallback). */
  promiseAccuracy: number;
  /** Open time-punches right now. */
  onShift: number;
  nowMs: number;
}

export function buildFleetTile(input: FleetTileInput): FleetTileDTO {
  const active = input.orders.filter((o) => ACTIVE.has(o.status));
  const analysis = analyzeTruck(active, input.nowMs);

  // Real rate metrics from completed orders in the last hour (matches the
  // floor-ops throughput approximation: completed, created within the hour).
  const recentCompleted = input.orders.filter(
    (o) => o.status === "completed" && Date.parse(o.createdAt) >= input.hourAgoMs,
  );
  const throughputHr = recentCompleted.length;
  const coversHr = recentCompleted.reduce((s, o) => s + (o.partySize ?? 1), 0);
  const revenueHr = recentCompleted.reduce((s, o) => s + (o.totalAmount ?? 0), 0);

  const { health, state, cls } = computeHealth({
    late: analysis.counts.late,
    risk: analysis.counts.risk,
    promiseAcc: input.promiseAccuracy,
  });

  const stations = analysis.stations.map((s) => ({
    id: s.id as string,
    label: MENU_CATEGORY_LABELS[s.id as MenuCategory] ?? s.id,
    currentLoad: s.currentLoad,
    forecast: s.forecast,
    demand: s.demand,
    capacity: Math.round(s.capacity * 10) / 10,
    pct: Number.isFinite(s.util) ? Math.round(s.util * 100) : 999,
    tier: s.tier,
  }));

  // Tile ticket previews are the same enriched DTO the KDS board renders, each
  // carrying its own prediction from this truck's analysis.
  const tickets = active.map((o) => toOrderDTO(o, analysis.predictions.get(o.id)));

  return {
    slug: input.slug,
    name: input.name,
    counts: {
      active: analysis.counts.active,
      ready: analysis.counts.ready,
      late: analysis.counts.late,
      risk: analysis.counts.risk,
    },
    health,
    healthState: state,
    healthClass: cls,
    onShift: input.onShift,
    throughputHr,
    coversHr,
    revenueHr,
    promiseAccuracy: input.promiseAccuracy,
    stations,
    tickets,
  };
}

export function buildFleetBoard(tiles: FleetTileDTO[], generatedAt: string): FleetBoardDTO {
  const totals = {
    active: tiles.reduce((s, t) => s + t.counts.active, 0),
    late: tiles.reduce((s, t) => s + t.counts.late, 0),
    risk: tiles.reduce((s, t) => s + t.counts.risk, 0),
    ready: tiles.reduce((s, t) => s + t.counts.ready, 0),
    throughputHr: tiles.reduce((s, t) => s + t.throughputHr, 0),
    coversHr: tiles.reduce((s, t) => s + t.coversHr, 0),
    revenueHr: tiles.reduce((s, t) => s + t.revenueHr, 0),
  };

  // Cross-truck promise-accuracy benchmark (throughput-weighted fleet mean).
  const weightDenom = tiles.reduce((s, t) => s + Math.max(1, t.throughputHr), 0) || 1;
  const fleetAccuracy =
    tiles.length > 0
      ? Math.round(
          tiles.reduce((s, t) => s + t.promiseAccuracy * Math.max(1, t.throughputHr), 0) / weightDenom,
        )
      : PROMISE_TARGET;
  const sortedByAcc = [...tiles].sort((a, b) => b.promiseAccuracy - a.promiseAccuracy);
  const leader = sortedByAcc[0]?.name ?? null;
  const gap =
    sortedByAcc.length > 1
      ? sortedByAcc[0].promiseAccuracy - sortedByAcc[sortedByAcc.length - 1].promiseAccuracy
      : 0;

  return {
    generatedAt,
    paceWindowMin: PACE_WINDOW_MIN,
    promiseTarget: PROMISE_TARGET,
    totals,
    benchmark: { fleetAccuracy, leader, gap },
    tiles,
  };
}
