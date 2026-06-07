import { getIngredientStock, getIngredients } from "@/lib/store";
import { registerTool } from "./registry";
import { scopeError, defaultLocation } from "./scope";

/**
 * get_inventory_status — read-only stock-on-hand for the COO. Flags every
 * ingredient at or below its reorder point so the agent can recommend a
 * purchase order before service runs short. Staff+ because the kitchen
 * line needs visibility during service.
 */
registerTool<{ locationSlug?: string; lowOnly?: boolean }>({
  name: "get_inventory_status",
  description:
    "Read-only ingredient stock: on-hand vs par level vs reorder point per location, with a " +
    "below-reorder flag. Use to spot stockouts and recommend reorders. Set lowOnly=true to return " +
    "only items at/under their reorder point.",
  minRole: "staff",
  mutates: false,
  inputSchema: {
    type: "object" as const,
    properties: {
      locationSlug: { type: "string", description: "Optional single-location filter." },
      lowOnly: { type: "boolean", description: "When true, only return items at/under reorder point." },
    },
  },
  async execute(input, ctx) {
    const err = scopeError(ctx, input.locationSlug);
    if (err) return { ok: false, error: err };
    const loc = defaultLocation(ctx, input.locationSlug);
    const [stock, ingredients] = await Promise.all([getIngredientStock(loc), getIngredients()]);
    const nameById = new Map(ingredients.map((i) => [i.id, i.name]));
    const rows = stock.map((s) => ({
      ingredient: nameById.get(s.ingredientId) ?? s.ingredientId,
      locationSlug: s.locationSlug,
      onHand: s.onHand,
      parLevel: s.parLevel,
      reorderPoint: s.reorderPoint,
      belowReorder: s.onHand <= s.reorderPoint,
    }));
    const filtered = input.lowOnly ? rows.filter((r) => r.belowReorder) : rows;
    return {
      ok: true,
      output: {
        locationSlug: loc ?? "all",
        lowCount: rows.filter((r) => r.belowReorder).length,
        totalTracked: rows.length,
        items: filtered.slice(0, 60),
      },
    };
  },
});
