import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  appendAuditLog,
  getCustomMenuItems,
  getIngredientProducts,
  getIngredients,
  getMenuOverrides,
  getRecipes,
  setMenuOverride,
  setMenuOverridesBulk,
  type MenuOverride,
} from "@/lib/store";
import { getMenu } from "@/data/menus";
import { getItemDetails } from "@/data/kodawari";
import type { MenuItem } from "@/data/types";
import { locations } from "@/data/locations";
import { menuOverridePutSchema, parseBody } from "@/lib/api-schemas";
import { getBaseSlug } from "@/lib/utils";

/** Per-portion food cost + full nutrition map for every dish that has a
 * recipe, computed in a single pass instead of N+1 calls. The recipe is
 * the source of truth: any item with a recipe gets its menu-shown cost
 * derived from the current ingredient prices, so the Menu and Recipes
 * admin pages can never disagree (or drift when an ingredient price
 * changes). Each macro is independent — `protein` is set even when
 * `fiber` is missing, so operators can roll macros out gradually.
 */
type MacroKey = "calories" | "protein" | "carbs" | "sugar" | "fiber" | "fat";
type IngredientMacroKey =
  | "kcalPerUnit"
  | "proteinPerUnit"
  | "carbsPerUnit"
  | "sugarPerUnit"
  | "fiberPerUnit"
  | "fatPerUnit";
const MACRO_FIELD_MAP: Array<[MacroKey, IngredientMacroKey]> = [
  ["calories", "kcalPerUnit"],
  ["protein", "proteinPerUnit"],
  ["carbs", "carbsPerUnit"],
  ["sugar", "sugarPerUnit"],
  ["fiber", "fiberPerUnit"],
  ["fat", "fatPerUnit"],
];

async function getRecipeDerivedMaps(): Promise<{
  cost: Map<string, number>;
  nutrition: Map<string, Partial<Record<MacroKey, number>>>;
}> {
  const [recipes, ingredients, products] = await Promise.all([
    getRecipes(),
    getIngredients(),
    getIngredientProducts(),
  ]);
  // Resolve each ingredient → its active distributor offering once,
  // then read cost + macros off the offering. Switching distributors
  // on an ingredient (setting a different activeProductId) flows
  // through here automatically — no recipe re-edit needed.
  const productById = new Map(products.map((p) => [p.id, p]));
  const activeByIngredient = new Map(
    ingredients.map((i) => [i.id, i.activeProductId ? productById.get(i.activeProductId) : undefined]),
  );
  const cost = new Map<string, number>();
  const nutrition = new Map<string, Partial<Record<MacroKey, number>>>();
  for (const r of recipes) {
    if (r.ingredients.length === 0) continue;
    let totalCost = 0;
    for (const ri of r.ingredients) {
      const product = activeByIngredient.get(ri.ingredientId);
      const unitCost = product?.costPerUnit ?? 0;
      totalCost += unitCost * ri.quantity * (ri.wasteFactor || 1);
    }
    cost.set(r.menuItemId, Math.round(totalCost / (r.yieldPortions || 1)));

    const macros: Partial<Record<MacroKey, number>> = {};
    for (const [field, key] of MACRO_FIELD_MAP) {
      let total = 0;
      let complete = true;
      for (const ri of r.ingredients) {
        const product = activeByIngredient.get(ri.ingredientId);
        const raw = product ? (product as unknown as Record<string, unknown>)[key] : undefined;
        if (typeof raw !== "number") {
          complete = false;
          break;
        }
        // No wasteFactor on macros — `quantity` is what ends up in
        // the dish; the trim covered by wasteFactor is thrown away
        // and never reaches the customer's plate, so its calories
        // shouldn't count.
        total += raw * ri.quantity;
      }
      if (complete) macros[field] = Math.round(total / (r.yieldPortions || 1));
    }
    if (Object.keys(macros).length > 0) nutrition.set(r.menuItemId, macros);
  }
  return { cost, nutrition };
}

// Menu reads are scoped per-location when a slug is provided. When omitted
// (returning all locations' menus), the session must hold unrestricted scope
// — withAdmin's "missing locationParam = require *" semantics enforces that.
export const GET = withAdmin(
  { locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    const [overrides, recipeMaps, customItems] = await Promise.all([
      getMenuOverrides(),
      getRecipeDerivedMaps(),
      getCustomMenuItems(),
    ]);
    const { cost: recipeCosts, nutrition: recipeNutritions } = recipeMaps;

    const customIds = new Set(customItems.map((c) => c.id));

    const enrich = (item: MenuItem, opts?: { isCustom?: boolean }) => {
      const override = overrides[item.id];
      // Recipes are chain-wide — keyed by dish base slug. Same recipe
      // applies to krk-pizza-margherita and waw-pizza-margherita, so
      // both look up under `pizza-margherita`.
      const recipeKey = getBaseSlug(item.id);
      const recipeCost = recipeCosts.get(recipeKey);
      const recipeNutrition = recipeNutritions.get(recipeKey);
      const recipeKcal = recipeNutrition?.calories;
      const hasRecipe = recipeCost !== undefined;
      // Recipe is canonical: when one exists, its computed per-portion cost
      // wins over both the seed cost and the override.cost (override.cost is
      // still stored, but reflects whatever was last synced — possibly stale).
      const cost = hasRecipe ? recipeCost : (override?.cost ?? item.cost);
      // An override that contains only `cost` is the recipe-save sync, not a
      // human edit — don't surface "Overridden" for it.
      const overrideKeys = override ? Object.keys(override).filter((k) => k !== "cost") : [];
      // Apply override with `null = clear back to seed` semantics so admin
      // reads match the public path (see data/menus/index.ts:applyOverride).
      // `merged` is initialised as a shallow copy of the seed item, so
      // skipping null preserves the seed value. Deleting would leave the
      // field undefined and break required props (category, tags).
      const merged: Record<string, unknown> = { ...item };
      const hasCalorieOverride =
        override?.calories !== undefined && override?.calories !== null;
      if (override) {
        for (const [k, v] of Object.entries(override)) {
          if (v === null || v === undefined) continue;
          // Mirror applyOverride: a flat `calories` override nests
          // into `nutrition.calories` so the admin editor (which
          // reads `item.nutrition?.calories`) sees the operator's
          // last write, not the stale seed value.
          if (k === "calories") {
            merged.nutrition = {
              ...(item.nutrition ?? { calories: 0, protein: 0, carbs: 0, fat: 0 }),
              calories: v as number,
            };
            continue;
          }
          merged[k] = v;
        }
      }
      // When no explicit calorie override is on this row, the recipe
      // is the source of truth: write the computed per-portion macros
      // into `nutrition` so admin reads (and the customer pill) reflect
      // the live ingredient data instead of a stale seed value. Each
      // macro is independent — kcal can populate even if `fiber` is
      // missing on one ingredient — so operators can roll macros out
      // gradually without blanking everything.
      if (recipeNutrition && Object.keys(recipeNutrition).length > 0) {
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
          // Operator's explicit calorie override (if any) still wins over
          // the recipe sum for that one field — pinned legally-vetted
          // figures shouldn't drift when an ingredient kcal changes.
          ...(hasCalorieOverride ? {} : recipeNutrition.calories !== undefined ? { calories: recipeNutrition.calories } : {}),
          ...(recipeNutrition.protein !== undefined ? { protein: recipeNutrition.protein } : {}),
          ...(recipeNutrition.carbs !== undefined ? { carbs: recipeNutrition.carbs } : {}),
          ...(recipeNutrition.sugar !== undefined ? { sugar: recipeNutrition.sugar } : {}),
          ...(recipeNutrition.fiber !== undefined ? { fiber: recipeNutrition.fiber } : {}),
          ...(recipeNutrition.fat !== undefined ? { fat: recipeNutrition.fat } : {}),
        };
      }
      const calorieSource: "override" | "recipe" | "seed" = hasCalorieOverride
        ? "override"
        : recipeKcal !== undefined
        ? "recipe"
        : "seed";
      // Allergens: backfill from kodawari when the operator hasn't set an
      // override. The recipe editor reads `item.allergens` and the
      // customer surfaces (item drawer, expo) prefer it over the kodawari
      // direct read, so this single line unifies the data source.
      if ((merged as { allergens?: unknown }).allergens === undefined) {
        const seedAllergens = getItemDetails(item.id)?.allergens;
        if (seedAllergens) (merged as { allergens?: unknown }).allergens = seedAllergens;
      }
      return {
        ...(merged as unknown as MenuItem),
        cost,
        _hasOverride: overrideKeys.length > 0,
        _hasRecipe: hasRecipe,
        _costSource: hasRecipe ? "recipe" : override?.cost !== undefined ? "override" : "seed",
        _calorieSource: calorieSource,
        _isCustom: Boolean(opts?.isCustom),
        // Surface the soft-delete flag so the admin UI can offer a
        // "Show hidden" toggle + restore action. Customer surfaces filter
        // hidden rows in getMenuWithOverrides() instead.
        _hidden: override?.hidden === true,
      };
    };

    const customByLocation = (slug: string) =>
      customItems
        .filter((c) => c.locationSlug === slug)
        .map(({ locationSlug: _l, createdAt: _c, updatedAt: _u, ...rest }) => {
          void _l; void _c; void _u;
          return enrich(rest as MenuItem, { isCustom: true });
        });

    if (locationSlug) {
      const merged = [
        ...getMenu(locationSlug)
          .filter((i) => !customIds.has(i.id))
          .map((i) => enrich(i)),
        ...customByLocation(locationSlug),
      ];
      return NextResponse.json(merged);
    }

    const active = locations.filter((l) => l.isActive);
    const result: Record<string, unknown[]> = {};
    for (const loc of active) {
      result[loc.slug] = [
        ...getMenu(loc.slug)
          .filter((i) => !customIds.has(i.id))
          .map((i) => enrich(i)),
        ...customByLocation(loc.slug),
      ];
    }
    return NextResponse.json(result);
  },
);

/** Menu-name lookup across every active location so audit entries include
 * the human-readable item name without forcing the caller to send it.
 * Menu data is static (seed code), so the result never changes within a
 * single Node process — cached at module scope to keep PUT requests fast
 * as the chain scales out to more trucks / SKUs. */
let cachedMenuItemNames: Map<string, string> | null = null;
function buildMenuItemNames(): Map<string, string> {
  if (cachedMenuItemNames) return cachedMenuItemNames;
  const lookup = new Map<string, string>();
  for (const loc of locations) {
    if (!loc.isActive) continue;
    for (const item of getMenu(loc.slug)) lookup.set(item.id, item.name);
  }
  cachedMenuItemNames = lookup;
  return lookup;
}

// Menu overrides (price, availability, 86'ing) touch revenue + customer
// experience — manager+ only. The override map is keyed by item id and is
// effectively global across locations; cross-location tightening waits for
// Phase 1 normalized menu_items.
export const PUT = withAdmin(
  { roles: ["manager", "owner"] },
  async (req, _ctx, { user }) => {
    const parsed = await parseBody(req, menuOverridePutSchema);
    if ("error" in parsed) return parsed.error;
    const body = parsed.data;
    const previousOverrides = await getMenuOverrides();
    const names = buildMenuItemNames();

    const writeAudits = async (updates: Record<string, MenuOverride>) => {
        for (const [id, next] of Object.entries(updates)) {
          const prev = previousOverrides[id];
          if (typeof next.available === "boolean" && prev?.available !== next.available) {
            await appendAuditLog({
              actor: user.email || user.id,
              action: next.available ? "menu.item_available" : "menu.item_86",
              entityType: "menu_item",
              entityId: id,
              before: { available: prev?.available ?? true },
              after: { available: next.available, name: names.get(id) ?? null },
            });
          }
          const otherChanged =
            (next.price !== undefined && next.price !== prev?.price) ||
            (next.cost !== undefined && next.cost !== prev?.cost) ||
            (next.name !== undefined && next.name !== prev?.name) ||
            (next.description !== undefined && next.description !== prev?.description) ||
            (next.menuRole !== undefined && next.menuRole !== prev?.menuRole) ||
            (next.isLimited !== undefined && next.isLimited !== prev?.isLimited) ||
            (next.limitedUntil !== undefined && next.limitedUntil !== prev?.limitedUntil) ||
            (next.deliveryOnly !== undefined && next.deliveryOnly !== prev?.deliveryOnly) ||
            (next.packagingCost !== undefined && next.packagingCost !== prev?.packagingCost) ||
            (next.sku !== undefined && next.sku !== prev?.sku) ||
            (next.category !== undefined && next.category !== prev?.category) ||
            (next.tags !== undefined &&
              JSON.stringify(next.tags) !== JSON.stringify(prev?.tags)) ||
            (next.hidden !== undefined && next.hidden !== prev?.hidden) ||
            (next.modifierGroups !== undefined &&
              JSON.stringify(next.modifierGroups) !== JSON.stringify(prev?.modifierGroups)) ||
            (next.halalStatus !== undefined && next.halalStatus !== prev?.halalStatus) ||
            (next.nutriGrade !== undefined && next.nutriGrade !== prev?.nutriGrade) ||
            (next.containsPork !== undefined && next.containsPork !== prev?.containsPork) ||
            (next.containsAlcohol !== undefined && next.containsAlcohol !== prev?.containsAlcohol) ||
            (next.calories !== undefined && next.calories !== prev?.calories);
          if (otherChanged) {
            await appendAuditLog({
              actor: user.email || user.id,
              action: "menu.override_update",
              entityType: "menu_item",
              entityId: id,
              before: prev ?? null,
              after: next,
            });
          }
        }
      };

    if (body.items) {
      const updates = body.items as Record<string, MenuOverride>;
      await setMenuOverridesBulk(updates);
      await writeAudits(updates);
      return NextResponse.json({ success: true });
    }

    // Schema's refine guarantees `id` is present when `items` is absent.
    const { id, items: _items, ...override } = body;
    const singleId = id as string;
    await setMenuOverride(singleId, override as MenuOverride);
    await writeAudits({ [singleId]: override as MenuOverride });
    return NextResponse.json({ success: true });
  },
);
