import { getAnalytics } from "@/lib/store";
import { registerTool } from "./registry";

/**
 * get_daily_stats — read-only. The agent uses this to answer "how
 * busy were we yesterday" / "compare last weekend to the weekend
 * before" questions without doing the orders-table math itself.
 */
registerTool<{ locationSlug?: string; dateFrom?: string; dateTo?: string }>({
  name: "get_daily_stats",
  description:
    "Aggregated daily KPIs (revenue, item count, food cost) for a location and date range. " +
    "Date format: YYYY-MM-DD. Read-only.",
  minRole: "staff",
  mutates: false,
  inputSchema: {
    type: "object" as const,
    properties: {
      locationSlug: { type: "string", description: "Optional single-location filter." },
      dateFrom: { type: "string", description: "Start date inclusive, YYYY-MM-DD." },
      dateTo: { type: "string", description: "End date inclusive, YYYY-MM-DD." },
    },
  },
  async execute(input, ctx) {
    if (
      input.locationSlug &&
      ctx.actor.locationScope !== "*" &&
      !ctx.actor.locationScope.split(",").includes(input.locationSlug)
    ) {
      return { ok: false, error: `Session is not authorized for location '${input.locationSlug}'` };
    }
    const stats = await getAnalytics(input.locationSlug, input.dateFrom, input.dateTo);
    return { ok: true, output: { count: stats.length, stats } };
  },
});
