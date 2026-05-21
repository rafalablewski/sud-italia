import type { Ingredient, Order, Recipe, StockMovement } from "@/data/types";
import { getIngredients, getOrders, getRecipes, getStockMovements } from "@/lib/store";

export interface IngredientVariance {
  ingredientId: string;
  name: string;
  unit: Ingredient["unit"];
  /** Quantity that recipes × sold orders predicts should have been consumed. */
  theoreticalUsage: number;
  /** Quantity actually drained (consume + waste). Refunded orders don't claw back ingredients,
   *  so we leave actual consumption unchanged; only theoretical is reduced on cancellation. */
  actualUsage: number;
  /** actual − theoretical. Positive = over-consumption (likely shrink / theft); negative = recipes overstated. */
  variance: number;
  /** Variance as % of theoretical. Capped + signed so the UI can colour-code easily. */
  variancePercent: number;
  /** Cost impact in grosze of the variance (per-unit cost × variance). */
  varianceCostGrosze: number;
}

const ORDER_REVENUE_STATUSES = new Set<Order["status"]>([
  "confirmed",
  "preparing",
  "ready",
  "completed",
]);

/**
 * Compute the theoretical-vs-actual ingredient variance for a location over a
 * date window. Theoretical is the sum of `recipe-derived per-portion consumption
 * × portions sold` across the window's orders; actual is the sum of `consume`
 * and `waste` stock movements in the same window (both deplete inventory).
 *
 * Positive variance ⇒ ingredients drained faster than recipes predicted —
 * the canonical signal for shrink / theft / over-portioning. Negative
 * variance ⇒ recipes overstate consumption (good for margin, bad for
 * production planning).
 *
 * Cost impact uses the ingredient's current `costPerUnit`. We accept this
 * approximation rather than reconstructing historic costs because the
 * tile is a daily heads-up, not a financial-grade reconciliation.
 */
export async function computeVariance(
  locationSlug: string,
  fromIso: string,
  toIso: string,
): Promise<IngredientVariance[]> {
  const [orders, recipes, ingredients, movements] = await Promise.all([
    getOrders(locationSlug),
    getRecipes(),
    getIngredients(),
    getStockMovements({ locationSlug }),
  ]);

  const recipeByMenuItem = new Map<string, Recipe>();
  for (const r of recipes) recipeByMenuItem.set(r.menuItemId, r);
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));

  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();

  // Theoretical: walk every sold line item, look up its recipe, accumulate
  // the predicted draw per ingredient using wasteFactor and yieldPortions.
  const theoretical = new Map<string, number>();
  for (const o of orders) {
    if (!ORDER_REVENUE_STATUSES.has(o.status)) continue;
    const occurred = new Date(o.paidAt || o.createdAt).getTime();
    if (occurred < fromMs || occurred > toMs) continue;
    for (const line of o.items) {
      const recipe = recipeByMenuItem.get(line.menuItem.id);
      if (!recipe) continue;
      const portions = recipe.yieldPortions || 1;
      const portionsSold = line.quantity;
      for (const ri of recipe.ingredients) {
        const perPortion = (ri.quantity * (ri.wasteFactor || 1)) / portions;
        const total = perPortion * portionsSold;
        theoretical.set(ri.ingredientId, (theoretical.get(ri.ingredientId) || 0) + total);
      }
    }
  }

  // Actual: every `consume` + `waste` movement in the window depletes
  // inventory. Quantities are signed in the store, but only the magnitude
  // matters for the comparison.
  const actual = new Map<string, number>();
  for (const m of movements as StockMovement[]) {
    if (m.type !== "consume" && m.type !== "waste") continue;
    const t = new Date(m.occurredAt).getTime();
    if (t < fromMs || t > toMs) continue;
    actual.set(m.ingredientId, (actual.get(m.ingredientId) || 0) + Math.abs(m.quantity));
  }

  // Build a row per ingredient that appears in either map. Skip ingredients
  // missing from the master list — that'd be a recipe-data bug worth
  // surfacing separately.
  const ids = new Set<string>();
  for (const k of theoretical.keys()) ids.add(k);
  for (const k of actual.keys()) ids.add(k);

  const rows: IngredientVariance[] = [];
  for (const id of ids) {
    const ing = ingredientById.get(id);
    if (!ing) continue;
    const theo = theoretical.get(id) || 0;
    const act = actual.get(id) || 0;
    const variance = act - theo;
    const variancePercent = theo > 0 ? (variance / theo) * 100 : 0;
    const varianceCostGrosze = Math.round(variance * (ing.costPerUnit ?? 0));
    rows.push({
      ingredientId: id,
      name: ing.name,
      unit: ing.unit,
      theoreticalUsage: Math.round(theo * 1000) / 1000,
      actualUsage: Math.round(act * 1000) / 1000,
      variance: Math.round(variance * 1000) / 1000,
      variancePercent: Math.round(variancePercent * 10) / 10,
      varianceCostGrosze,
    });
  }

  // Worst (most positive) variance first — that's what the manager
  // wants to investigate.
  rows.sort((a, b) => b.varianceCostGrosze - a.varianceCostGrosze);
  return rows;
}
