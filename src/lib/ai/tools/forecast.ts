import { getSummary } from "@/lib/store";
import { generateDemandForecast, type ForecastDailyInput } from "@/lib/ai/forecast";
import { registerTool } from "./registry";
import { scopeError, defaultLocation } from "./scope";

/**
 * get_demand_forecast — read-only 7-day-ahead demand prediction. Reuses
 * the platform's cached Claude-backed forecaster (lib/ai/forecast.ts),
 * which falls back to a moving-average heuristic when no API key is set.
 * The COO turns this into a staffing/prep plan; the CEO reads the trend.
 */
registerTool<{ locationSlug?: string }>({
  name: "get_demand_forecast",
  description:
    "Read-only demand forecast for the next ~7 days: predicted daily order count with an 80% confidence " +
    "band, plus the model's reasoning. Backed by the cached forecaster (heuristic fallback when AI is off). " +
    "Use to plan staffing, prep, and inventory.",
  minRole: "manager",
  mutates: false,
  inputSchema: {
    type: "object" as const,
    properties: {
      locationSlug: { type: "string", description: "Location to forecast (defaults to the session's location)." },
    },
  },
  async execute(input, ctx) {
    const err = scopeError(ctx, input.locationSlug);
    if (err) return { ok: false, error: err };
    const loc = defaultLocation(ctx, input.locationSlug);
    const to = new Date();
    const from = new Date(to.getTime() - 60 * 86400000);
    const summary = await getSummary(loc, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10));
    const series: ForecastDailyInput[] = (summary.dailyStats ?? []).map((d) => ({
      date: d.date,
      orderCount: d.orderCount ?? 0,
      revenue: d.revenue ?? 0,
    }));
    const result = await generateDemandForecast(loc ?? "all", series);
    return {
      ok: true,
      output: {
        locationSlug: loc ?? "all",
        source: result.source,
        reasoning: result.reasoning,
        days: result.days,
      },
    };
  },
});
