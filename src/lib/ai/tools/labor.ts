import { getLaborCostInRange, getStaff } from "@/lib/store";
import { registerTool } from "./registry";
import { scopeError, defaultLocation } from "./scope";

/**
 * get_labor_cost — read-only labour spend for the COO/CFO. Pairs time
 * punches with each staffer's full hourly cost over a date range and
 * returns the roster size so the agent can reason about labour % and
 * coverage. Date format: YYYY-MM-DD.
 */
registerTool<{ locationSlug?: string; dateFrom?: string; dateTo?: string }>({
  name: "get_labor_cost",
  description:
    "Read-only labour cost over a date range: total labour grosze, labour hours, open (un-clocked-out) " +
    "shifts, and headcount. Pair with get_pnl_snapshot revenue to compute labour %. Dates are YYYY-MM-DD; " +
    "defaults to the last 7 days.",
  minRole: "manager",
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
    const err = scopeError(ctx, input.locationSlug);
    if (err) return { ok: false, error: err };
    const loc = defaultLocation(ctx, input.locationSlug);

    const to = input.dateTo ? new Date(`${input.dateTo}T23:59:59.999Z`) : new Date();
    const from = input.dateFrom
      ? new Date(`${input.dateFrom}T00:00:00.000Z`)
      : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [labor, staff] = await Promise.all([
      getLaborCostInRange(loc, from.toISOString(), to.toISOString()),
      getStaff(loc),
    ]);
    const activeStaff = staff.filter((s) => s.status === "active");
    return {
      ok: true,
      output: {
        locationSlug: loc ?? "all",
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        laborGrosze: labor.laborGrosze,
        laborHours: Math.round(labor.laborHours * 10) / 10,
        openShifts: labor.openShifts,
        headcount: activeStaff.length,
        rolesBreakdown: activeStaff.reduce<Record<string, number>>((acc, s) => {
          acc[s.role] = (acc[s.role] ?? 0) + 1;
          return acc;
        }, {}),
      },
    };
  },
});
