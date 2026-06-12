import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  getSummary, getInsights, getOpsGoals, getTruckEvents, getSurveyResponses,
  computeHourlyThroughput, computeCohortSnapshot,
} from "@/lib/store";
import { computeLaborEfficiencyDaily } from "@/lib/labor-efficiency";
import { pulseBreakdown } from "@/lib/surveys";

/**
 * Morning Brief — the analytics half of /admin/welcome, computed server-side in
 * one pass (the decisions / notifications half stays on the boardroom +
 * notifications routes the brief already calls). Everything here is real,
 * chain-wide, and derived from the same store functions the Dashboard, Reports,
 * Calculator and Surveys surfaces use — so the brief can never drift from them.
 * Manager+. Modules that can't be computed return null and the client omits
 * them; nothing is faked.
 */
const iso = (d: Date) => d.toISOString().slice(0, 10);

export const GET = withAdmin({ roles: ["manager"] }, async () => {
  const now = new Date();
  const today = iso(now);
  const yest = iso(new Date(now.getTime() - 864e5));
  const prev = iso(new Date(now.getTime() - 2 * 864e5));
  const monthStart = `${today.slice(0, 7)}-01`;
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getUTCDate();
  const in14 = iso(new Date(now.getTime() + 14 * 864e5));

  const [sY, sP, sM, ins, goals, eff, hourly, cohort, events, surveys] = await Promise.all([
    getSummary(undefined, yest, yest),
    getSummary(undefined, prev, prev),
    getSummary(undefined, monthStart, today),
    getInsights(yest, yest),
    getOpsGoals(),
    computeLaborEfficiencyDaily().catch(() => null),
    computeHourlyThroughput(30).catch(() => []),
    computeCohortSnapshot(30).catch(() => null),
    getTruckEvents({ from: today, to: in14 }).catch(() => []),
    getSurveyResponses().catch(() => []),
  ]);

  // ── yesterday's close + contribution per order ──
  const yRev = sY.totalRevenue;
  const pRev = sP.totalRevenue;
  const deltaPct = pRev > 0 ? Math.round(((yRev - pRev) / pRev) * 1000) / 10 : null;
  const perOrderProfitGrosze = sY.totalOrders > 0 ? Math.round(sY.totalProfit / sY.totalOrders) : 0;

  // ── today: goal + forecast (real labour-model forecast × yesterday's AOV) ──
  const dailyGoal = goals.dailyRevenueGoalGrosze ?? 0;
  const aov = sY.avgOrderValue || 0;
  const forecastOrders = (eff?.perLocation ?? []).reduce(
    (s, p) => s + (p.today?.forecastSource && p.today.forecastSource !== "none" ? p.today?.forecastOrders ?? 0 : 0), 0,
  );
  const forecastGrosze = forecastOrders > 0 && aov > 0 ? Math.round(forecastOrders * aov) : null;
  const todayPacePct = dailyGoal > 0 && forecastGrosze != null ? Math.min(100, Math.round((forecastGrosze / dailyGoal) * 100)) : null;

  // ── monthly goal-pacing (daily goal × days = month target; run-rate projection) ──
  const monthGoal = dailyGoal > 0 ? dailyGoal * daysInMonth : 0;
  const mtd = sM.totalRevenue;
  const projection = dayOfMonth > 0 ? Math.round((mtd / dayOfMonth) * daysInMonth) : mtd;
  const pacing = monthGoal > 0 ? {
    mtdGrosze: mtd, monthGoalGrosze: monthGoal, projectionGrosze: projection,
    aheadGrosze: projection - monthGoal, pct: Math.round((mtd / monthGoal) * 100),
    dayOfMonth, daysInMonth,
  } : null;

  // ── the constraint: the busiest hour (your throughput ceiling to watch) ──
  const peak = hourly.reduce((a, b) => (b.avgOrdersPerHour > (a?.avgOrdersPerHour ?? -1) ? b : a), hourly[0] ?? null);
  const constraint = peak && peak.totalOrders > 0
    ? { peakHour: peak.hour, peakAvgPerHour: Math.round(peak.avgOrdersPerHour * 10) / 10, peakTotal: peak.totalOrders }
    : null;

  // ── leading indicators ──
  const upcoming = events.filter((e) => e.status !== "cancelled");
  const bookingsAttendance = upcoming.reduce((s, e) => s + (e.expectedAttendance ?? 0), 0);
  // Pulse (NPS-style) — last 30d vs the prior 30d, off the 5★ survey control.
  const t30 = now.getTime() - 30 * 864e5, t60 = now.getTime() - 60 * 864e5;
  const last30 = surveys.filter((r) => Date.parse(r.date) >= t30);
  const prior30 = surveys.filter((r) => { const t = Date.parse(r.date); return t >= t60 && t < t30; });
  const pulse = last30.length >= 3 ? pulseBreakdown(last30).pulse : null;
  const pulseDeltaPts = pulse != null && prior30.length >= 3 ? pulse - pulseBreakdown(prior30).pulse : null;
  const leading = {
    repeatRatePct: cohort ? Math.round(cohort.repeatRatePct * 100) : null,
    newCustomersPerMonth: cohort ? Math.round(cohort.newCustomersPerMonth) : null,
    bookingsCount: upcoming.length,
    bookingsAttendance,
    pulse, pulseDeltaPts, pulseResponses: last30.length,
  };

  // ── anomaly: the location whose avg ticket most beats the chain (worth copying) ──
  const locs = ins.locationComparison ?? [];
  const totRev = locs.reduce((s, l) => s + l.revenue, 0);
  const totOrders = locs.reduce((s, l) => s + l.orderCount, 0);
  const chainAvg = totOrders > 0 ? Math.round(totRev / totOrders) : 0;
  let anomaly: { city: string; avgTicketGrosze: number; chainAvgGrosze: number; deltaPct: number } | null = null;
  if (locs.length >= 2 && chainAvg > 0) {
    for (const l of locs) {
      const at = l.avgOrderValue ?? (l.orderCount > 0 ? Math.round(l.revenue / l.orderCount) : 0);
      const dp = Math.round(((at - chainAvg) / chainAvg) * 100);
      if (dp >= 5 && (!anomaly || dp > anomaly.deltaPct)) anomaly = { city: l.city, avgTicketGrosze: at, chainAvgGrosze: chainAvg, deltaPct: dp };
    }
  }

  return NextResponse.json({
    yesterday: {
      revenue: yRev, prevRevenue: pRev, deltaPct,
      orders: sY.totalOrders, avgOrderValue: sY.avgOrderValue, profitMargin: sY.profitMargin,
      perOrderProfitGrosze, topItems: (sY.topItems ?? []).slice(0, 2).map((t) => ({ name: t.name, quantity: t.quantity })),
    },
    today: { goalGrosze: dailyGoal, forecastGrosze, pacePct: todayPacePct },
    pacing,
    constraint,
    leading,
    anomaly,
    locations: locs.map((l) => ({ slug: l.locationSlug, city: l.city, revenue: l.revenue, orderCount: l.orderCount, avgOrderValue: l.avgOrderValue ?? null })),
  });
});
