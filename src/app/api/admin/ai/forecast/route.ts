import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getSummary } from "@/lib/store";
import { generateDemandForecast, type ForecastDailyInput } from "@/lib/ai/forecast";

/**
 * Demand-forecast endpoint (audit §3 — replaces the rolling-average
 * "AI" with a Claude-backed forecast). When ANTHROPIC_API_KEY is set
 * the model returns a structured 7-day-ahead prediction with operator
 * reasoning; otherwise the route returns the heuristic fallback so
 * the dashboard always has data.
 *
 * Cached for 24h per (location, last-day) — see lib/ai/forecast.ts.
 */
export const GET = withAdmin(
  { locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    const days = Math.min(
      90,
      Math.max(14, Number(req.nextUrl.searchParams.get("days")) || 60),
    );
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    const fromIso = from.toISOString().slice(0, 10);
    const toIso = to.toISOString().slice(0, 10);
    const summary = await getSummary(locationSlug ?? undefined, fromIso, toIso);
    const series: ForecastDailyInput[] = (summary.dailyStats ?? []).map((d) => ({
      date: d.date,
      orderCount: d.orderCount ?? 0,
      revenue: d.revenue ?? 0,
    }));
    const result = await generateDemandForecast(locationSlug ?? "all", series);
    return NextResponse.json(result);
  },
);
