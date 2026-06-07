import { computeMenuEngineering } from "@/lib/store";
import { registerTool } from "./registry";
import { scopeError, defaultLocation } from "./scope";

/**
 * get_menu_engineering — read-only Kasavana-Smith menu matrix from real
 * order mix. Each line carries units sold, gross profit per unit, total
 * contribution, and a quadrant (star/plowhorse/puzzle/dog). The CEO uses
 * it for innovation/cuts, the CFO for pricing, the COO for prep focus.
 */
registerTool<{ locationSlug?: string; windowDays?: number }>({
  name: "get_menu_engineering",
  description:
    "Read-only menu-engineering matrix from real sales: per-item units sold, gross profit per unit (grosze), " +
    "revenue + cost contribution, and Kasavana-Smith quadrant (star = high margin + high volume, " +
    "plowhorse = low margin + high volume, puzzle = high margin + low volume, dog = low both). " +
    "Use to decide what to promote, reprice, or cut. windowDays defaults to 90.",
  minRole: "manager",
  mutates: false,
  inputSchema: {
    type: "object" as const,
    properties: {
      locationSlug: { type: "string", description: "Optional single-location filter." },
      windowDays: { type: "number", description: "Trailing window in days (default 90)." },
    },
  },
  async execute(input, ctx) {
    const err = scopeError(ctx, input.locationSlug);
    if (err) return { ok: false, error: err };
    const loc = defaultLocation(ctx, input.locationSlug);
    const windowDays = Math.min(180, Math.max(14, Math.round(input.windowDays ?? 90)));
    const lines = await computeMenuEngineering(windowDays, undefined, loc);
    // Trim to the fields the agent needs and cap so the prompt stays bounded.
    const trimmed = lines
      .slice()
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 40)
      .map((l) => ({
        name: l.name,
        category: l.category,
        unitsSold: l.unitsSold,
        gpPerUnitGrosze: l.gpPerUnit,
        revenueGrosze: l.revenue,
        quadrant: l.quadrant,
        menuRole: l.menuRole,
      }));
    const counts = trimmed.reduce<Record<string, number>>((acc, l) => {
      acc[l.quadrant] = (acc[l.quadrant] ?? 0) + 1;
      return acc;
    }, {});
    return { ok: true, output: { locationSlug: loc ?? "all", windowDays, quadrantCounts: counts, items: trimmed } };
  },
});
