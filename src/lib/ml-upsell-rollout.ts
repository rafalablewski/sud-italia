import { createHash } from "crypto";
import type { Order } from "@/data/types";
import { ANCHOR_CATEGORIES, ATTACH_CATEGORIES } from "@/lib/ml-upsell";
import {
  compareProportions,
  compareMeans,
  recommendDecision,
  requiredSampleSizePerArm,
  type ComparisonResult,
  type Decision,
} from "@/lib/experiment-stats";

/**
 * ML upsell rollout assignment + measurement (audit elite-qsr §1).
 *
 * The serving path (/api/customer/upsell-rank) and the measurement
 * surface (/api/admin/ml-upsell/compare) MUST agree on which arm a
 * customer is in, so the deterministic phone bucket lives here and both
 * import it. Because the bucket is reproducible from any order's phone,
 * the ML-vs-rules arms can be compared retroactively without ever
 * storing per-order assignments.
 *
 * Server-only (Node crypto) — never import into a "use client" module.
 */

/** Stable 0–99 bucket for a phone, salted per location + feature so it's
 *  independent of the bundle experiment's bucketing. */
export function mlUpsellBucket(phone: string, locationSlug: string): number {
  const h = createHash("sha256").update(`ml-upsell|${locationSlug}|${phone}`).digest();
  const n = (h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3];
  return Math.abs(n) % 100;
}

/** Is this phone in the ML arm at the given rollout %? */
export function inMlArm(phone: string, locationSlug: string, rolloutPct: number): boolean {
  if (rolloutPct <= 0) return false;
  return mlUpsellBucket(phone, locationSlug) < Math.min(100, rolloutPct);
}

export type UpsellArm = "ml" | "rules";

export interface ArmStats {
  arm: UpsellArm;
  /** Anchor (pizza/pasta) orders attributed to this arm in the window. */
  orders: number;
  /** Those that attached at least one cross-sell item. */
  attachOrders: number;
  attachRate: number;
  avgOrderValueGrosze: number;
}

export interface UpsellArmComparison {
  windowSinceIso: string;
  rolloutPct: number;
  ml: ArmStats;
  rules: ArmStats;
  /** Attach-rate comparison (proportion): control = rules, variant = ml. */
  attach: ComparisonResult;
  /** AOV comparison (mean): control = rules, variant = ml. */
  aov: ComparisonResult;
  /** Stop/continue recommendation on the primary metric (attach rate). */
  decision: Decision;
}

const ATTACH_SET = new Set<string>(ATTACH_CATEGORIES);
const ANCHOR_SET = new Set<string>(ANCHOR_CATEGORIES);

function orderHasAnchor(order: Order): boolean {
  return order.items.some((ci) => ANCHOR_SET.has(ci.menuItem.category));
}

function orderHasAttach(order: Order): boolean {
  return order.items.some((ci) => ATTACH_SET.has(ci.menuItem.category));
}

function variance(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  return values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (values.length - 1);
}

/** Relative MDE the attach-rate comparison is powered for (10%). */
const ATTACH_MDE = 0.1;

/**
 * Compare the ML and rules arms over real orders. Each anchor order with
 * a phone is attributed to the arm its phone hashes to at the current
 * rollout %, and attach rate + AOV are compared with the significance
 * engine. Pure (apart from the hash) → unit-testable.
 *
 * Caller is responsible for the window: pass orders already filtered to
 * [max(since, model.trainedAt), now] so ML-arm orders genuinely saw the
 * ML ranker (it falls back to rules before a model exists).
 */
export function compareUpsellArms(
  orders: Order[],
  opts: { locationSlug: string; rolloutPct: number; windowSinceIso: string },
): UpsellArmComparison {
  const acc: Record<UpsellArm, { orders: number; attach: number; values: number[] }> = {
    ml: { orders: 0, attach: 0, values: [] },
    rules: { orders: 0, attach: 0, values: [] },
  };

  for (const o of orders) {
    const phone = o.customerPhone;
    if (!phone || !orderHasAnchor(o)) continue;
    const arm: UpsellArm = inMlArm(phone, opts.locationSlug, opts.rolloutPct) ? "ml" : "rules";
    acc[arm].orders += 1;
    if (orderHasAttach(o)) acc[arm].attach += 1;
    acc[arm].values.push(o.totalAmount);
  }

  const armStats = (arm: UpsellArm): ArmStats => {
    const a = acc[arm];
    const mean = a.values.length ? a.values.reduce((s, v) => s + v, 0) / a.values.length : 0;
    return {
      arm,
      orders: a.orders,
      attachOrders: a.attach,
      attachRate: a.orders ? a.attach / a.orders : 0,
      avgOrderValueGrosze: Math.round(mean),
    };
  };

  const ml = armStats("ml");
  const rules = armStats("rules");

  const attach = compareProportions(
    { successes: rules.attachOrders, trials: rules.orders },
    { successes: ml.attachOrders, trials: ml.orders },
  );

  const rulesMean = rules.avgOrderValueGrosze;
  const mlMean = ml.avgOrderValueGrosze;
  const aov = compareMeans(
    { n: acc.rules.orders, mean: rulesMean, variance: variance(acc.rules.values, rulesMean) },
    { n: acc.ml.orders, mean: mlMean, variance: variance(acc.ml.values, mlMean) },
  );

  const required = requiredSampleSizePerArm(rules.attachRate || 0.01, ATTACH_MDE);
  const decision = recommendDecision(attach, Math.min(ml.orders, rules.orders), required);

  return {
    windowSinceIso: opts.windowSinceIso,
    rolloutPct: opts.rolloutPct,
    ml,
    rules,
    attach,
    aov,
    decision,
  };
}
