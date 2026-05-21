import type { Order, Recipe } from "@/data/types";
import { createStockMovement, getRecipes } from "@/lib/store";
import { logger } from "@/lib/logger";
import { getBaseSlug } from "@/lib/utils";

/**
 * Recipe-driven stock decrement (audit §3 — turns the inventory module
 * from a manual ledger into a real consumption record).
 *
 * On every paid order we walk the line items, look up each menu item's
 * recipe, and post one `consume` stock movement per ingredient. The
 * quantity is `(recipe.quantity × wasteFactor / yieldPortions) ×
 * portionsSold`, mirroring the same per-portion math the variance
 * report already uses in lib/variance.ts.
 *
 * On refund / cancellation we run the inverse via `adjust` movements so
 * the books reconcile: a fully refunded 6-item order leaves no ghost
 * ingredient draw. Partial refunds (no line-level data captured today)
 * are left alone — they're rare and the operator can reconcile from
 * the audit log if needed.
 *
 * Failures here never block the order. The customer pays, KDS sees the
 * ticket, the stock log just trails. We log loudly so Sentry catches
 * recurring miscounts.
 */

interface DraftMovement {
  ingredientId: string;
  quantity: number;
}

function buildDraws(
  order: Order,
  recipes: Recipe[],
): DraftMovement[] {
  // Recipes are chain-wide (keyed by dish base slug); the menu line
  // carries the per-location prefixed id. Derive the base slug to
  // resolve back to the shared formula.
  const recipeByBaseSlug = new Map<string, Recipe>();
  for (const r of recipes) recipeByBaseSlug.set(r.menuItemId, r);

  const draws = new Map<string, number>();
  for (const line of order.items) {
    const recipe = recipeByBaseSlug.get(getBaseSlug(line.menuItem.id));
    if (!recipe) continue;
    const portions = recipe.yieldPortions || 1;
    const portionsSold = line.quantity;
    for (const ri of recipe.ingredients) {
      const perPortion = (ri.quantity * (ri.wasteFactor || 1)) / portions;
      const total = perPortion * portionsSold;
      if (total <= 0) continue;
      draws.set(ri.ingredientId, (draws.get(ri.ingredientId) || 0) + total);
    }
  }
  return Array.from(draws.entries()).map(([ingredientId, quantity]) => ({
    ingredientId,
    quantity,
  }));
}

/**
 * Post `consume` movements for every recipe ingredient touched by the
 * order. Idempotency is best-effort: a retry creates duplicate
 * movements. Wire from a code path that itself dedupes (createOrder is
 * idempotent on idempotencyKey).
 */
export async function consumeRecipeForOrder(order: Order): Promise<{
  movements: number;
  skipped: number;
}> {
  let movements = 0;
  let skipped = 0;
  try {
    const recipes = await getRecipes();
    const draws = buildDraws(order, recipes);
    if (draws.length === 0) {
      // Either no recipes are configured, or none of the items in this
      // order have one. Skip silently — operator is responsible for
      // adding recipes if they want variance reporting.
      return { movements: 0, skipped: order.items.length };
    }
    for (const draw of draws) {
      try {
        await createStockMovement({
          ingredientId: draw.ingredientId,
          locationSlug: order.locationSlug,
          type: "consume",
          // Stock movements are signed deltas applied to onHand. Negative
          // for consumption.
          quantity: -Math.abs(draw.quantity),
          reason: `order ${order.id}`,
          byUser: "system:checkout",
        });
        movements += 1;
      } catch (err) {
        skipped += 1;
        logger.error(
          "inventory.consume.movement_failed",
          {
            layer: "inventory.decrement",
            orderId: order.id,
            ingredientId: draw.ingredientId,
            quantity: draw.quantity,
          },
          err,
        );
      }
    }
  } catch (err) {
    logger.error(
      "inventory.consume.lookup_failed",
      { layer: "inventory.decrement", orderId: order.id },
      err,
    );
  }
  return { movements, skipped };
}

/**
 * Inverse of consumeRecipeForOrder — used by full refunds and order
 * cancellations so the books reconcile.
 */
export async function restoreRecipeForOrder(order: Order, reasonLabel: string): Promise<{
  movements: number;
  skipped: number;
}> {
  let movements = 0;
  let skipped = 0;
  try {
    const recipes = await getRecipes();
    const draws = buildDraws(order, recipes);
    if (draws.length === 0) return { movements: 0, skipped: order.items.length };
    for (const draw of draws) {
      try {
        await createStockMovement({
          ingredientId: draw.ingredientId,
          locationSlug: order.locationSlug,
          // `adjust` is the canonical type for corrections. Positive
          // delta returns the predicted draw to the shelf.
          type: "adjust",
          quantity: Math.abs(draw.quantity),
          reason: `${reasonLabel} ${order.id}`,
          byUser: "system:refund",
        });
        movements += 1;
      } catch (err) {
        skipped += 1;
        logger.error(
          "inventory.restore.movement_failed",
          {
            layer: "inventory.decrement",
            orderId: order.id,
            ingredientId: draw.ingredientId,
            quantity: draw.quantity,
          },
          err,
        );
      }
    }
  } catch (err) {
    logger.error(
      "inventory.restore.lookup_failed",
      { layer: "inventory.decrement", orderId: order.id },
      err,
    );
  }
  return { movements, skipped };
}
