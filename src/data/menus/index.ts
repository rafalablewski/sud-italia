import { cache } from "react";
import { MenuItem } from "../types";
import { getItemDetails } from "../kodawari";
import {
  getCustomMenuItems,
  getIngredientProducts,
  getIngredients,
  getMenuOverrides,
  getRecipes,
} from "@/lib/store";
import { getBaseSlug } from "@/lib/utils";

// POS (and any multi-location render) calls getMenuWithOverrides once per
// location, and each call re-reads the chain-wide recipe/ingredient/override
// catalog — N identical Neon round-trips per request. React cache() memoizes
// these for the lifetime of a single request so the shared catalog is read
// once regardless of how many locations render. (No effect outside a request.)
const getMenuOverridesOnce = cache(getMenuOverrides);

// `getMenu` lives in a separate module so client components can read
// the sync seed without pulling @/lib/store (and its node-only deps)
// into the browser bundle. Re-exported here so server callers keep a
// single entry point at `@/data/menus`.
export { getMenu } from "./seed";
import { getMenu } from "./seed";

/** Per-portion nutrition map (kcal + protein + carbs + sugar + fiber +
 *  fat) for every dish that has a recipe. Each macro field populates
 *  independently — `protein` is set when every recipe line has
 *  `proteinPerUnit`, even if (say) one ingredient is missing fibre data.
 *  Mirror of the admin getRecipeDerivedMaps so the customer card
 *  reflects the same value the operator sees while editing. */
type RecipeMacro = "calories" | "protein" | "carbs" | "sugar" | "fiber" | "fat";
const RECIPE_MACRO_FIELDS: Array<[RecipeMacro, string]> = [
  ["calories", "kcalPerUnit"],
  ["protein", "proteinPerUnit"],
  ["carbs", "carbsPerUnit"],
  ["sugar", "sugarPerUnit"],
  ["fiber", "fiberPerUnit"],
  ["fat", "fatPerUnit"],
];
const getRecipeNutritionMap = cache(async (): Promise<Map<string, Partial<Record<RecipeMacro, number>>>> => {
  const [recipes, ingredients, products] = await Promise.all([
    getRecipes(),
    getIngredients(),
    getIngredientProducts(),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const activeByIngredient = new Map(
    ingredients.map((i) => [i.id, i.activeProductId ? productById.get(i.activeProductId) : undefined]),
  );
  const map = new Map<string, Partial<Record<RecipeMacro, number>>>();
  for (const r of recipes) {
    if (r.ingredients.length === 0) continue;
    const macros: Partial<Record<RecipeMacro, number>> = {};
    for (const [field, key] of RECIPE_MACRO_FIELDS) {
      let total = 0;
      let complete = true;
      for (const ri of r.ingredients) {
        const product = activeByIngredient.get(ri.ingredientId);
        const raw = product ? (product as unknown as Record<string, unknown>)[key] : undefined;
        if (typeof raw !== "number") {
          complete = false;
          break;
        }
        // No wasteFactor on macros — see /api/admin/menu enrich.
        total += raw * ri.quantity;
      }
      if (complete) macros[field] = Math.round(total / (r.yieldPortions || 1));
    }
    if (Object.keys(macros).length > 0) map.set(r.menuItemId, macros);
  }
  return map;
});

export async function getMenuWithOverrides(locationSlug: string): Promise<MenuItem[]> {
  const base = getMenu(locationSlug);
  const [overrides, customItems, recipeNutritions] = await Promise.all([
    getMenuOverridesOnce(),
    getCustomMenuItems(locationSlug),
    getRecipeNutritionMap(),
  ]);
  const applyOverride = (item: MenuItem): MenuItem => {
    const o = overrides[item.id];
    // Recipes are chain-wide (keyed by dish base slug), so the
    // Margherita's nutrition is the same on krk-pizza-margherita and
    // waw-pizza-margherita. Look up by base slug.
    const recipeNutrition = recipeNutritions.get(getBaseSlug(item.id));
    const hasCalorieOverride =
      o?.calories !== undefined && o?.calories !== null;
    if (!o && !recipeNutrition) return item;
    // `null = clear back to seed` semantics. `merged` is initialised as
    // a shallow copy of the seed item, so skipping null preserves the
    // seed value. Deleting the key would leave required fields like
    // `category` / `tags` undefined and break renderers downstream.
    const merged: Record<string, unknown> = { ...item };
    if (o) {
      for (const [k, v] of Object.entries(o)) {
        if (v === null || v === undefined) continue;
        // `calories` is a flat override convenience: the customer card
        // reads `item.nutrition.calories`, but we don't want operators
        // to retype protein / carbs / fat just to nudge kcal. Merge
        // it into the nested struct instead of replacing it.
        if (k === "calories") {
          merged.nutrition = { ...(item.nutrition ?? { calories: 0, protein: 0, carbs: 0, fat: 0 }), calories: v as number };
          continue;
        }
        merged[k] = v;
      }
    }
    // Recipe-derived macros win over the seed nutrition values but
    // calories yields to an explicit per-item override (so an operator
    // can pin a legally-vetted figure that differs from the live recipe
    // sum). Per-macro merge so a missing fibre value doesn't blank the
    // others.
    if (recipeNutrition) {
      const nutrition = (merged.nutrition ?? item.nutrition) as
        | {
            calories: number;
            protein: number;
            carbs: number;
            fat: number;
            sugar?: number;
            fiber?: number;
            sodium?: number;
          }
        | undefined;
      merged.nutrition = {
        ...(nutrition ?? { calories: 0, protein: 0, carbs: 0, fat: 0 }),
        ...(hasCalorieOverride ? {} : recipeNutrition.calories !== undefined ? { calories: recipeNutrition.calories } : {}),
        ...(recipeNutrition.protein !== undefined ? { protein: recipeNutrition.protein } : {}),
        ...(recipeNutrition.carbs !== undefined ? { carbs: recipeNutrition.carbs } : {}),
        ...(recipeNutrition.sugar !== undefined ? { sugar: recipeNutrition.sugar } : {}),
        ...(recipeNutrition.fiber !== undefined ? { fiber: recipeNutrition.fiber } : {}),
        ...(recipeNutrition.fat !== undefined ? { fat: recipeNutrition.fat } : {}),
      };
    }
    // Allergens: kodawari seed is the default; operator override (when
    // present and not null) replaces it entirely. Empty array on the
    // override means "explicitly no major allergens" and is preserved.
    if (merged.allergens === undefined) {
      const seedAllergens = getItemDetails(item.id)?.allergens;
      if (seedAllergens) merged.allergens = seedAllergens;
    }
    return merged as unknown as MenuItem;
  };
  const merged = base.map(applyOverride);
  // Admin-created items live alongside the seed catalogue. Same override
  // pipeline applies so an operator can still 86 a custom item or tweak
  // its price without re-creating the row.
  for (const custom of customItems) {
    // Strip the storage-only fields so the consumer never sees them.
    const { locationSlug: _loc, createdAt: _c, updatedAt: _u, ...item } = custom;
    void _loc; void _c; void _u;
    merged.push(applyOverride(item as MenuItem));
  }
  // Soft-deleted rows (`override.hidden === true`) are filtered out for
  // the customer + ops surfaces. The admin /api/admin/menu endpoint
  // surfaces them with a `_hidden` flag so they can be restored via the
  // "Show hidden" toggle.
  return merged.filter((item) => {
    const o = overrides[item.id];
    return !(o && o.hidden === true);
  });
}

export async function getAvailableMenu(locationSlug: string): Promise<MenuItem[]> {
  const menu = await getMenuWithOverrides(locationSlug);
  return menu.filter((item) => item.available);
}
