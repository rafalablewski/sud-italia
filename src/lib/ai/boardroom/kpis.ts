import {
  getSummary,
  getLaborCostInRange,
  computeSssg,
  computeSimulationActuals,
  getFeedback,
} from "@/lib/store";
import type { BoardroomPersonaId } from "./personas";

/**
 * Boardroom KPI / traffic-light engine. Computes the headline operating
 * metrics from REAL store data (no mock — CLAUDE.md Rule #1) and assigns
 * each a green/yellow/red status against restaurant benchmarks (food cost
 * 28–32%, labour 25–30%, prime <60%). The same snapshot drives the
 * dashboard traffic lights AND seeds the meeting agenda: every non-green
 * KPI becomes a flagged problem the agents must address.
 */

export type KpiStatus = "green" | "yellow" | "red" | "neutral";

export interface BoardroomKpi {
  id: string;
  label: string;
  /** Pre-formatted display string (PLN / % / count). */
  display: string;
  /** Raw numeric value for sorting / charts. */
  value: number;
  status: KpiStatus;
  /** Which C-suite agent owns this metric. */
  owner: BoardroomPersonaId;
  /** One-line "what good looks like" benchmark. */
  benchmark: string;
  /** Optional sparkline series (e.g. daily revenue). */
  spark?: number[];
}

export interface BoardroomKpiSnapshot {
  scope: string;
  generatedAt: string;
  kpis: BoardroomKpi[];
  /** Non-green KPIs phrased as problems — the meeting agenda. */
  flags: string[];
  /** Per-agent count of the metrics they own that are off-target. */
  agentConcerns: Record<BoardroomPersonaId, number>;
}

const pln = (grosze: number) => `${(grosze / 100).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN`;
const pct = (frac: number) => `${(frac * 100).toFixed(1)}%`;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Status where lower is better (cost ratios). Exported for unit tests. */
export function statusLowerBetter(value: number, green: number, yellow: number): KpiStatus {
  if (!Number.isFinite(value) || value <= 0) return "neutral";
  if (value <= green) return "green";
  if (value <= yellow) return "yellow";
  return "red";
}
/** Status where higher is better (ratings, growth). Exported for unit tests. */
export function statusHigherBetter(value: number, green: number, yellow: number): KpiStatus {
  if (!Number.isFinite(value)) return "neutral";
  if (value >= green) return "green";
  if (value >= yellow) return "yellow";
  return "red";
}

export async function computeBoardroomKpis(scope?: string): Promise<BoardroomKpiSnapshot> {
  const loc = scope && scope !== "all" ? scope : undefined;
  const now = new Date();
  const today = isoDay(now);
  const from7 = isoDay(new Date(now.getTime() - 6 * 86400000));
  const from30 = isoDay(new Date(now.getTime() - 29 * 86400000));

  const [summary30, summary7, summaryToday, labor7, sssg, actuals, feedback] = await Promise.all([
    getSummary(loc, from30, today),
    getSummary(loc, from7, today),
    getSummary(loc, today, today),
    getLaborCostInRange(loc, new Date(now.getTime() - 6 * 86400000).toISOString(), now.toISOString()),
    computeSssg(30),
    computeSimulationActuals(30),
    getFeedback(),
  ]);

  // Food cost % — COGS ÷ revenue over the trailing 30 days (location-aware).
  const foodCostPct = summary30.totalRevenue > 0 ? summary30.totalCost / summary30.totalRevenue : 0;
  // Labour % — paired-punch labour cost ÷ revenue over the trailing 7 days.
  const laborPct = summary7.totalRevenue > 0 ? labor7.laborGrosze / summary7.totalRevenue : 0;
  const primeCostPct = foodCostPct + laborPct;

  // Customer satisfaction — average rating over the trailing 30 days.
  const cutoff30 = new Date(now.getTime() - 30 * 86400000).toISOString();
  const recentReviews = feedback.filter((f) => (!loc || f.locationSlug === loc) && f.date >= cutoff30);
  const avgRating = recentReviews.length
    ? recentReviews.reduce((s, f) => s + (f.overallRating ?? 0), 0) / recentReviews.length
    : NaN;

  const revSpark = summary7.dailyStats.map((d) => d.revenue);
  const avgTicket = summaryToday.totalOrders > 0 ? summaryToday.avgOrderValue : actuals.avgTicketGrosze;

  const kpis: BoardroomKpi[] = [
    {
      id: "today-revenue",
      label: "Today's sales",
      display: pln(summaryToday.totalRevenue),
      value: summaryToday.totalRevenue,
      status: "neutral",
      owner: "ceo",
      benchmark: `${summaryToday.totalOrders} orders so far today`,
      spark: revSpark,
    },
    {
      id: "food-cost",
      label: "Food cost %",
      display: pct(foodCostPct),
      value: foodCostPct,
      status: statusLowerBetter(foodCostPct, 0.32, 0.35),
      owner: "cfo",
      benchmark: "Healthy 28–32%; red above 35%",
    },
    {
      id: "labor-cost",
      label: "Labour cost %",
      display: pct(laborPct),
      value: laborPct,
      status: statusLowerBetter(laborPct, 0.3, 0.35),
      owner: "coo",
      benchmark: "Healthy 25–30%; red above 35%",
    },
    {
      id: "prime-cost",
      label: "Prime cost %",
      display: pct(primeCostPct),
      value: primeCostPct,
      status: statusLowerBetter(primeCostPct, 0.6, 0.65),
      owner: "cfo",
      benchmark: "Keep under 60%; 55% is excellent",
    },
    {
      id: "avg-ticket",
      label: "Average ticket",
      display: pln(avgTicket),
      value: avgTicket,
      status: "neutral",
      owner: "cfo",
      benchmark: "Grow via mix/upsell, not just price",
    },
    {
      id: "satisfaction",
      label: "Customer satisfaction",
      display: Number.isFinite(avgRating) ? `${avgRating.toFixed(2)} ★` : "No reviews",
      value: Number.isFinite(avgRating) ? avgRating : 0,
      status: statusHigherBetter(avgRating, 4.3, 4.0),
      owner: "cmo",
      benchmark: `≥4.3 healthy (${recentReviews.length} reviews / 30d)`,
    },
    {
      id: "refund-rate",
      label: "Refund / cancel rate",
      display: pct(actuals.refundPct),
      value: actuals.refundPct,
      status: statusLowerBetter(actuals.refundPct, 0.03, 0.05),
      owner: "coo",
      benchmark: "Under 3% is healthy (chain-wide, 30d)",
    },
    {
      id: "revenue-growth",
      label: "Revenue growth (MoM)",
      display: `${sssg.revenueGrowthPct >= 0 ? "+" : ""}${(sssg.revenueGrowthPct * 100).toFixed(1)}%`,
      value: sssg.revenueGrowthPct,
      status: statusHigherBetter(sssg.revenueGrowthPct, 0.05, -0.05),
      owner: "ceo",
      benchmark: "Positive same-store growth (chain-wide, 30d vs prior 30d)",
    },
  ];

  const flags: string[] = [];
  const agentConcerns: Record<BoardroomPersonaId, number> = { ceo: 0, coo: 0, cfo: 0, cmo: 0 };
  for (const k of kpis) {
    if (k.status === "red" || k.status === "yellow") {
      agentConcerns[k.owner] += 1;
      flags.push(`${k.label} is ${k.display} (${k.status}). Benchmark: ${k.benchmark}.`);
    }
  }

  return { scope: loc ?? "all", generatedAt: now.toISOString(), kpis, flags, agentConcerns };
}
