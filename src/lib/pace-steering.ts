import {
  type TruckAnalysis,
  type PaceStation,
  type PaceTier,
  PACE_WINDOW_MIN,
  itemPrepMinutes,
} from "./kds-prediction";
import { type MenuCategory, type MenuItem, MENU_CATEGORY_LABELS } from "@/data/types";

/**
 * Pace → demand steering. Turns the KDS Pace signal (analyzeTruck) into an
 * actionable plan the POS can apply at the point of order — the actuator end
 * of the kitchen control loop.
 *
 * The Pace layer already tells us, per station, demand-vs-capacity and which
 * station is the bottleneck (the violet "risk" tier when util > 1.0). Today
 * that only paints a gauge. This module derives, from the *same* analysis, what
 * to do about it on the sell side:
 *   - quote a capacity-true promise time per station (honest queue depth, not a
 *     flat number),
 *   - surface "make-now" items that don't touch the bottleneck (≈ free to make),
 *   - soft-throttle the lowest-yield items that *do* load the bottleneck,
 *   - cap how many more bottleneck units to accept this window (delivery dumps).
 *
 * Guardrail: this only ever re-ranks, badges, quotes honestly, or caps intake.
 * It never hides items or fabricates scarcity, and every plan carries a `reason`
 * so the operator can see (and override) why the line is steering. Pure +
 * deterministic — no I/O, same inputs → same plan — so it's unit-testable and
 * safe to call on every Pace tick.
 */

export interface SteeringPlan {
  /** True once the bottleneck leaves "calm" — i.e. there is something to steer.
   *  When false the POS shows its normal menu; only promise times still update. */
  active: boolean;
  /** Capacity-true promise, in seconds, for a new order routed to each station:
   *  time to clear the station's current queue (demand ÷ throughput). */
  promiseSecondsByCategory: Partial<Record<MenuCategory, number>>;
  /** Menu item ids to surface first — they don't load the bottleneck, so they're
   *  ≈ free to make against the current line. Ranked by contribution margin. */
  makeNow: string[];
  /** Menu item ids to soft-demote — the lowest margin-per-bottleneck-second items
   *  that *do* load the constrained station. Never hidden, just eased back. */
  throttle: string[];
  /** Units the bottleneck station can still absorb this window — a cap on
   *  incoming delivery/aggregator tickets so a dump can't detonate a hot line.
   *  null when there is no active bottleneck. */
  deliveryCapNextWindow: number | null;
  /** The constrained station, echoed for the POS/operator surface. */
  bottleneck: { id: MenuCategory; label: string; util: number; tier: PaceTier } | null;
  /** Operator-facing explanation; null when calm. The loop is never a black box. */
  reason: string | null;
}

export interface SteeringOptions {
  /** Max make-now items to surface. Default 6. */
  makeNowLimit?: number;
  /** Max items to soft-throttle. Default 3. */
  throttleLimit?: number;
}

const WINDOW_SEC = PACE_WINDOW_MIN * 60;

function contributionMargin(m: MenuItem): number {
  return m.price - m.cost; // grosze
}

/** Gross margin earned per second this item occupies the bottleneck station.
 *  Items that don't touch the bottleneck consume ~0 bottleneck-seconds, so they
 *  score Infinity → always preferred (the "make-now" set). */
function marginPerBottleneckSecond(m: MenuItem, hot: PaceStation): number {
  if (m.category !== hot.id) return Infinity;
  const sec = itemPrepMinutes(m) * 60;
  return sec > 0 ? contributionMargin(m) / sec : Infinity;
}

/** Honest queue wait for a new order at this station: demand units ahead of you,
 *  cleared at the station's single-server throughput (capacity per window). */
function stationPromiseSeconds(s: PaceStation): number {
  if (s.capacity <= 0) return 0;
  return Math.round((s.demand * WINDOW_SEC) / s.capacity);
}

export function deriveSteeringPlan(
  analysis: TruckAnalysis,
  menu: MenuItem[],
  opts: SteeringOptions = {},
): SteeringPlan {
  const makeNowLimit = opts.makeNowLimit ?? 6;
  const throttleLimit = opts.throttleLimit ?? 3;

  // Capacity-true promise per station is always useful — quote it even when calm.
  const promiseSecondsByCategory: Partial<Record<MenuCategory, number>> = {};
  for (const s of analysis.stations) {
    promiseSecondsByCategory[s.id] = stationPromiseSeconds(s);
  }

  const b = analysis.bottleneck;
  const bottleneck = b
    ? { id: b.id, label: MENU_CATEGORY_LABELS[b.id] ?? b.id, util: b.util, tier: b.tier }
    : null;

  // Steer once the bottleneck is "warn" (≈0.8) or "risk" (>1.0) — act before the
  // breach, not after it. Calm line → normal menu, no steering.
  if (!b || b.tier === "calm") {
    return {
      active: false,
      promiseSecondsByCategory,
      makeNow: [],
      throttle: [],
      deliveryCapNextWindow: null,
      bottleneck,
      reason: null,
    };
  }

  const sellable = menu.filter((m) => m.available && !m.deliveryOnly);

  // make-now: items off the hot station, best contribution margin first.
  const makeNow = sellable
    .filter((m) => m.category !== b.id)
    .sort((x, y) => contributionMargin(y) - contributionMargin(x))
    .slice(0, makeNowLimit)
    .map((m) => m.id);

  // throttle: items ON the hot station, worst margin-per-bottleneck-second first
  // (the low-yield items jamming the constraint — ease these, not the heroes).
  const throttle = sellable
    .filter((m) => m.category === b.id)
    .sort((x, y) => marginPerBottleneckSecond(x, b) - marginPerBottleneckSecond(y, b))
    .slice(0, throttleLimit)
    .map((m) => m.id);

  const deliveryCapNextWindow = Math.max(0, Math.floor(b.capacity - b.currentLoad));
  const pct = Number.isFinite(b.util) ? Math.round(b.util * 100) : 999;

  return {
    active: true,
    promiseSecondsByCategory,
    makeNow,
    throttle,
    deliveryCapNextWindow,
    bottleneck,
    reason:
      `${bottleneck!.label} at ${pct}% capacity — surfacing ${makeNow.length} make-now item` +
      `${makeNow.length === 1 ? "" : "s"}, easing ${throttle.length}, ` +
      `delivery intake capped at ${deliveryCapNextWindow}/${PACE_WINDOW_MIN} min`,
  };
}
