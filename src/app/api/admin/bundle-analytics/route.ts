import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  getBundleEvents,
  getBundleFunnelEvents,
  getBundleFeedback,
  getUpsellSettings,
  type BundleEvent,
  type BundleFunnelEvent,
  type BundleFeedbackEvent,
} from "@/lib/store";
import type { Experiment, ExperimentMetric } from "@/lib/experiments";
import {
  compareProportions,
  compareMeans,
  recommendDecision,
  requiredSampleSizePerArm,
  type ComparisonResult,
  type DecisionKind,
  type MeanSample,
} from "@/lib/experiment-stats";

/**
 * Bundle KPI aggregator (Sprint 3 #13). Reads the append-only audit log
 * written by createOrderFromCart and rolls it up into the metrics the
 * QSR red-team audit demanded: penetration, AOV, savings, margin, per-
 * tier mix, per-variant uplift. Single endpoint feeds the admin tile +
 * the experimentation dashboard.
 */

interface BundleRollup {
  bundleId: string;
  bundleName: string;
  count: number;
  avgFinalGrosze: number;
  avgSavingsGrosze: number;
  avgMainsCount: number;
  totalRevenueGrosze: number;
  totalSavingsGrosze: number;
  /** % discount given relative to refPrice across all events. */
  effectiveDiscount: number;
  /** Voice-of-customer (audit elite-qsr §2): post-order thumbs on this
   *  bundle. thumbsDownRate flags a bundle that sells but disappoints. */
  thumbsUp: number;
  thumbsDown: number;
  thumbsDownRate: number;
}

interface VariantVerdict {
  metric: ExperimentMetric;
  /** Relative lift vs control on the primary metric. */
  relativeLift: number;
  pValue: number;
  significant: boolean;
  decision: DecisionKind;
  reason: string;
}

interface VariantRollup {
  variantId: string;
  /** Human label from the experiment config, when one is in scope. */
  label?: string;
  /** True for the experiment's control variant. */
  isControl: boolean;
  count: number;
  /** Impressions for this variant from the funnel beacon (0 when the
   *  experiment wasn't tagging impressions, e.g. before it started). */
  impressions: number;
  /** applies / impressions. 0 when impressions is 0. */
  conversionRate: number;
  avgFinalGrosze: number;
  avgSavingsGrosze: number;
  totalRevenueGrosze: number;
  /** Mean contribution per order (finalPrice × marginRatio), over events
   *  that carry a margin. 0 when none do. */
  avgContributionGrosze: number;
  totalContributionGrosze: number;
  /** Significance vs control on the experiment's primary metric. Null for
   *  the control row, or when no experiment is in scope. */
  verdict: VariantVerdict | null;
}

/** Compact experiment context echoed back so the admin card can label the
 *  variants + show the lifecycle without a second fetch. */
interface ExperimentSummary {
  id: string;
  name: string;
  status: Experiment["status"] | null;
  primaryMetric: ExperimentMetric;
  controlVariantId: string;
  startedAt: string | null;
  stoppedAt: string | null;
}

interface BundleAnalytics {
  windowDays: number;
  totalBundleOrders: number;
  totalBundleRevenueGrosze: number;
  totalSavingsGrosze: number;
  byBundle: BundleRollup[];
  byVariant: VariantRollup[];
  /** The live/most-recent experiment for the location in scope, when one
   *  exists. Null for chain-wide views or locations with no experiment. */
  experiment: ExperimentSummary | null;
  perDay: { date: string; count: number; revenueGrosze: number }[];
  /** Sprint 7 #5: impression → composer → applied funnel. Apply count
   *  comes from BundleEvent (already aggregated above) so the funnel
   *  here ends at composer_opened — the analytics card joins both. */
  funnel: {
    impressions: number;
    composerOpens: number;
    composerAbandons: number;
    applies: number;
    composerOpenRate: number;
    applyFromComposerRate: number;
  };
  /** Sprint 7 #6: new vs repeat customer split. Tells the operator
   *  whether bundles are driving acquisition or just discounting
   *  existing repeat customers. */
  byCohort: { cohort: "new" | "repeat" | "unknown"; count: number; avgFinalGrosze: number }[];
}

function rollupFunnel(events: BundleFunnelEvent[]) {
  let impressions = 0;
  let opens = 0;
  let abandons = 0;
  for (const e of events) {
    if (e.kind === "impression") impressions++;
    else if (e.kind === "composer_opened") opens++;
    else if (e.kind === "composer_abandoned") abandons++;
  }
  return { impressions, opens, abandons };
}

function rollupCohort(events: BundleEvent[]) {
  const buckets = new Map<"new" | "repeat" | "unknown", BundleEvent[]>();
  for (const e of events) {
    const k = e.customerCohort ?? "unknown";
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(e);
  }
  return Array.from(buckets.entries()).map(([cohort, list]) => ({
    cohort,
    count: list.length,
    avgFinalGrosze: Math.round(
      list.reduce((s, e) => s + e.finalPriceGrosze, 0) / list.length,
    ),
  }));
}

/** Contribution per order in grosze = finalPrice × marginRatio. Events
 *  without a margin are excluded from contribution stats (unknown cost
 *  shouldn't bias the mean toward zero). */
function contributionOf(e: BundleEvent): number | null {
  if (typeof e.marginRatio !== "number") return null;
  return e.finalPriceGrosze * e.marginRatio;
}

function meanSample(values: number[]): MeanSample {
  const n = values.length;
  if (n === 0) return { n: 0, mean: 0, variance: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance =
    n < 2 ? 0 : values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (n - 1);
  return { n, mean, variance };
}

/** Relative MDE used to size the conversion experiment (detect a 10%
 *  relative change). Continuous metrics fall back to a 200-order/arm
 *  floor since the binomial sample formula doesn't apply to them. */
const CONVERSION_MDE = 0.1;
const CONTINUOUS_TARGET_PER_ARM = 200;

/** Per-variant aggregate the verdict math runs on. */
interface VariantAgg {
  applies: number;
  impressions: number;
  finalValues: number[];
  contributionValues: number[];
}

function buildVerdict(
  metric: ExperimentMetric,
  control: VariantAgg,
  variant: VariantAgg,
): VariantVerdict {
  let result: ComparisonResult;
  let observed: number;
  let required: number;

  if (metric === "conversion") {
    result = compareProportions(
      { successes: control.applies, trials: control.impressions },
      { successes: variant.applies, trials: variant.impressions },
    );
    const controlRate = control.impressions === 0 ? 0 : control.applies / control.impressions;
    observed = Math.min(control.impressions, variant.impressions);
    required = requiredSampleSizePerArm(controlRate, CONVERSION_MDE);
  } else {
    const pick = (a: VariantAgg) =>
      metric === "contribution" ? a.contributionValues : a.finalValues;
    result = compareMeans(meanSample(pick(control)), meanSample(pick(variant)));
    observed = Math.min(pick(control).length, pick(variant).length);
    required = CONTINUOUS_TARGET_PER_ARM;
  }

  const decision = recommendDecision(result, observed, required);
  return {
    metric,
    relativeLift: result.relativeLift,
    pValue: result.pValue,
    significant: result.significant,
    decision: decision.kind,
    reason: decision.reason,
  };
}

function impressionsByVariant(funnel: BundleFunnelEvent[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of funnel) {
    if (e.kind !== "impression" || !e.experimentVariant) continue;
    m.set(e.experimentVariant, (m.get(e.experimentVariant) ?? 0) + 1);
  }
  return m;
}

function buildVariantRollups(
  byVariant: Map<string, BundleEvent[]>,
  funnel: BundleFunnelEvent[],
  experiment: Experiment | null,
): VariantRollup[] {
  const impressions = impressionsByVariant(funnel);
  const metric: ExperimentMetric = experiment?.primaryMetric ?? "contribution";
  const controlId = experiment?.controlVariantId ?? experiment?.variants[0]?.id ?? null;
  const labels = new Map<string, string>();
  for (const v of experiment?.variants ?? []) labels.set(v.id, v.label);

  // Variant id universe: config order first, then any observed-only ids.
  const ids: string[] = [];
  for (const v of experiment?.variants ?? []) ids.push(v.id);
  for (const id of byVariant.keys()) if (!ids.includes(id)) ids.push(id);

  const aggOf = (id: string): VariantAgg => {
    const list = byVariant.get(id) ?? [];
    return {
      applies: list.length,
      impressions: impressions.get(id) ?? 0,
      finalValues: list.map((e) => e.finalPriceGrosze),
      contributionValues: list
        .map(contributionOf)
        .filter((v): v is number => v !== null),
    };
  };

  const controlAgg = controlId ? aggOf(controlId) : null;

  return ids
    .map((id) => {
      const agg = aggOf(id);
      const list = byVariant.get(id) ?? [];
      const totalRevenue = agg.finalValues.reduce((s, v) => s + v, 0);
      const totalContribution = agg.contributionValues.reduce((s, v) => s + v, 0);
      const isControl = id === controlId;
      const verdict =
        experiment && controlAgg && !isControl ? buildVerdict(metric, controlAgg, agg) : null;
      return {
        variantId: id,
        label: labels.get(id),
        isControl,
        count: agg.applies,
        impressions: agg.impressions,
        conversionRate: agg.impressions === 0 ? 0 : agg.applies / agg.impressions,
        avgFinalGrosze: list.length === 0 ? 0 : Math.round(totalRevenue / list.length),
        avgSavingsGrosze:
          list.length === 0
            ? 0
            : Math.round(list.reduce((s, e) => s + e.savingsGrosze, 0) / list.length),
        totalRevenueGrosze: totalRevenue,
        avgContributionGrosze:
          agg.contributionValues.length === 0
            ? 0
            : Math.round(totalContribution / agg.contributionValues.length),
        totalContributionGrosze: Math.round(totalContribution),
        verdict,
      };
    })
    .sort((a, b) => {
      if (a.isControl !== b.isControl) return a.isControl ? -1 : 1;
      return b.count - a.count;
    });
}

function experimentSummary(experiment: Experiment | null): ExperimentSummary | null {
  if (!experiment) return null;
  return {
    id: experiment.id,
    name: experiment.name,
    status: experiment.status ?? null,
    primaryMetric: experiment.primaryMetric ?? "contribution",
    controlVariantId: experiment.controlVariantId ?? experiment.variants[0]?.id ?? "",
    startedAt: experiment.startedAt ?? null,
    stoppedAt: experiment.stoppedAt ?? null,
  };
}

/** thumbsUp / thumbsDown per bundle id from the voice-of-customer log. */
function feedbackByBundle(feedback: BundleFeedbackEvent[]): Map<string, { up: number; down: number }> {
  const m = new Map<string, { up: number; down: number }>();
  for (const f of feedback) {
    const cur = m.get(f.bundleId) ?? { up: 0, down: 0 };
    if (f.rating === "up") cur.up++;
    else cur.down++;
    m.set(f.bundleId, cur);
  }
  return m;
}

function rollup(
  events: BundleEvent[],
  funnel: BundleFunnelEvent[],
  feedback: BundleFeedbackEvent[],
  windowDays: number,
  experiment: Experiment | null,
): BundleAnalytics {
  const feedbackMap = feedbackByBundle(feedback);
  const byBundle = new Map<string, BundleEvent[]>();
  const byVariant = new Map<string, BundleEvent[]>();
  const byDay = new Map<string, BundleEvent[]>();
  for (const e of events) {
    if (!byBundle.has(e.bundleId)) byBundle.set(e.bundleId, []);
    byBundle.get(e.bundleId)!.push(e);
    if (e.experimentVariant) {
      if (!byVariant.has(e.experimentVariant)) byVariant.set(e.experimentVariant, []);
      byVariant.get(e.experimentVariant)!.push(e);
    }
    const day = e.createdAt.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(e);
  }

  const totalRevenue = events.reduce((s, e) => s + e.finalPriceGrosze, 0);
  const totalSavings = events.reduce((s, e) => s + e.savingsGrosze, 0);

  return {
    windowDays,
    totalBundleOrders: events.length,
    totalBundleRevenueGrosze: totalRevenue,
    totalSavingsGrosze: totalSavings,
    byBundle: Array.from(byBundle.entries())
      .map(([bundleId, list]) => {
        const totalRev = list.reduce((s, e) => s + e.finalPriceGrosze, 0);
        const totalRef = list.reduce((s, e) => s + e.refPriceGrosze, 0);
        const totalSav = list.reduce((s, e) => s + e.savingsGrosze, 0);
        const fb = feedbackMap.get(bundleId) ?? { up: 0, down: 0 };
        const fbTotal = fb.up + fb.down;
        return {
          bundleId,
          bundleName: list[0].bundleName,
          count: list.length,
          avgFinalGrosze: Math.round(totalRev / list.length),
          avgSavingsGrosze: Math.round(totalSav / list.length),
          avgMainsCount:
            list.reduce((s, e) => s + e.mainsCount, 0) / list.length,
          totalRevenueGrosze: totalRev,
          totalSavingsGrosze: totalSav,
          effectiveDiscount: totalRef === 0 ? 0 : (totalRef - totalRev) / totalRef,
          thumbsUp: fb.up,
          thumbsDown: fb.down,
          thumbsDownRate: fbTotal === 0 ? 0 : fb.down / fbTotal,
        };
      })
      .sort((a, b) => b.count - a.count),
    byVariant: buildVariantRollups(byVariant, funnel, experiment),
    experiment: experimentSummary(experiment),
    perDay: Array.from(byDay.entries())
      .map(([date, list]) => ({
        date,
        count: list.length,
        revenueGrosze: list.reduce((s, e) => s + e.finalPriceGrosze, 0),
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    funnel: (() => {
      const f = rollupFunnel(funnel);
      const applies = events.length;
      return {
        impressions: f.impressions,
        composerOpens: f.opens,
        composerAbandons: f.abandons,
        applies,
        composerOpenRate: f.impressions === 0 ? 0 : f.opens / f.impressions,
        applyFromComposerRate: f.opens === 0 ? 0 : applies / f.opens,
      };
    })(),
    byCohort: rollupCohort(events),
  };
}

export const GET = withAdmin({}, async (req) => {
  const url = new URL(req.url);
  const locationSlug = url.searchParams.get("location") || undefined;
  const days = Math.max(1, Math.min(365, Number(url.searchParams.get("days")) || 30));
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const sinceIso = new Date(sinceMs).toISOString();
  // The verdict math is per-location (an experiment lives on one location's
  // upsell config). Chain-wide views (no location) skip the experiment so
  // we never compare variants pooled across different live experiments.
  const [events, funnel, feedback, experiment] = await Promise.all([
    getBundleEvents({ locationSlug, sinceIso }),
    getBundleFunnelEvents({ locationSlug, sinceIso }),
    getBundleFeedback({ locationSlug, sinceIso }),
    locationSlug
      ? getUpsellSettings().then((s) => s[locationSlug]?.experiment ?? null)
      : Promise.resolve(null),
  ]);
  return NextResponse.json(rollup(events, funnel, feedback, days, experiment));
});
