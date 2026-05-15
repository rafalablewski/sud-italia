import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  getBundleEvents,
  getBundleFunnelEvents,
  type BundleEvent,
  type BundleFunnelEvent,
} from "@/lib/store";

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
}

interface VariantRollup {
  variantId: string;
  count: number;
  avgFinalGrosze: number;
  avgSavingsGrosze: number;
  totalRevenueGrosze: number;
}

interface BundleAnalytics {
  windowDays: number;
  totalBundleOrders: number;
  totalBundleRevenueGrosze: number;
  totalSavingsGrosze: number;
  byBundle: BundleRollup[];
  byVariant: VariantRollup[];
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

function rollup(
  events: BundleEvent[],
  funnel: BundleFunnelEvent[],
  windowDays: number,
): BundleAnalytics {
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
        };
      })
      .sort((a, b) => b.count - a.count),
    byVariant: Array.from(byVariant.entries())
      .map(([variantId, list]) => ({
        variantId,
        count: list.length,
        avgFinalGrosze: Math.round(
          list.reduce((s, e) => s + e.finalPriceGrosze, 0) / list.length,
        ),
        avgSavingsGrosze: Math.round(
          list.reduce((s, e) => s + e.savingsGrosze, 0) / list.length,
        ),
        totalRevenueGrosze: list.reduce((s, e) => s + e.finalPriceGrosze, 0),
      }))
      .sort((a, b) => b.count - a.count),
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
  const [events, funnel] = await Promise.all([
    getBundleEvents({ locationSlug, sinceIso }),
    getBundleFunnelEvents({ locationSlug, sinceIso }),
  ]);
  return NextResponse.json(rollup(events, funnel, days));
});
