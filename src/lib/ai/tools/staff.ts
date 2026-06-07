import { getStaff, getShifts } from "@/lib/store";
import { registerTool } from "./registry";
import { scopeError, defaultLocation } from "./scope";

/**
 * get_staff_roster — read-only roster + the week's planned shifts for the
 * COO. Lets the agent reason about coverage by role and day before it
 * proposes a re-rostering against the demand forecast.
 */
registerTool<{ locationSlug?: string }>({
  name: "get_staff_roster",
  description:
    "Read-only staff roster (active members by role) plus this week's planned shifts grouped by day. " +
    "Use to assess coverage and propose scheduling changes against the demand forecast.",
  minRole: "manager",
  mutates: false,
  inputSchema: {
    type: "object" as const,
    properties: {
      locationSlug: { type: "string", description: "Optional single-location filter." },
    },
  },
  async execute(input, ctx) {
    const err = scopeError(ctx, input.locationSlug);
    if (err) return { ok: false, error: err };
    const loc = defaultLocation(ctx, input.locationSlug);
    const now = new Date();
    const from = new Date(now.getTime() - now.getDay() * 86400000);
    from.setUTCHours(0, 0, 0, 0);
    const to = new Date(from.getTime() + 7 * 86400000);

    const [staff, shifts] = await Promise.all([
      getStaff(loc),
      getShifts({ locationSlug: loc, from: from.toISOString(), to: to.toISOString() }),
    ]);
    const active = staff.filter((s) => s.status === "active");
    const byRole = active.reduce<Record<string, number>>((acc, s) => {
      acc[s.role] = (acc[s.role] ?? 0) + 1;
      return acc;
    }, {});
    const shiftsByDay = shifts.reduce<Record<string, number>>((acc, s) => {
      const day = s.startAt.slice(0, 10);
      acc[day] = (acc[day] ?? 0) + 1;
      return acc;
    }, {});
    return {
      ok: true,
      output: {
        locationSlug: loc ?? "all",
        headcount: active.length,
        byRole,
        weekShiftCount: shifts.length,
        shiftsByDay,
      },
    };
  },
});
