import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  appendAuditLog,
  calculateFoodCost,
  calculateRecipeNutrition,
  deleteRecipe,
  getIngredientProducts,
  getIngredients,
  getRecipe,
  getRecipes,
  getSuppliers,
  saveRecipe,
} from "@/lib/store";
import type { Recipe } from "@/data/types";

// Recipes are chain-wide (keyed by menuItemId), not per-location. Reads are
// open to any authenticated session; writes are manager+ because they
// rewrite per-portion cost which feeds the margin reports.

export const GET = withAdmin({}, async (req) => {
  const menuItemId = req.nextUrl.searchParams.get("menuItemId");

  if (menuItemId) {
    const recipe = await getRecipe(menuItemId);
    if (!recipe) {
      return NextResponse.json(null);
    }
    const [foodCost, nutrition] = await Promise.all([
      calculateFoodCost(menuItemId),
      calculateRecipeNutrition(menuItemId),
    ]);
    return NextResponse.json({
      ...recipe,
      calculatedCost: foodCost,
      calculatedNutrition: nutrition,
      calculatedCalories: nutrition.calories,
    });
  }

  const recipes = await getRecipes();
  const [ingredients, products, suppliers] = await Promise.all([
    getIngredients(),
    getIngredientProducts(),
    getSuppliers(),
  ]);
  const ingredientMap = new Map(ingredients.map((i) => [i.id, i]));
  const productById = new Map(products.map((p) => [p.id, p]));
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));

  /** Resolve the active offering for a recipe line so the recipe row
   *  can surface "via <supplier> · <product>" inline — closes the loop
   *  between recipe edits and which distributor's data is driving cost
   *  + nutrition. Returns null when the ingredient has no active
   *  offering yet (operator hasn't linked a distributor). */
  const offeringFor = (ingredientId: string) => {
    const ing = ingredientMap.get(ingredientId);
    if (!ing?.activeProductId) return null;
    const product = productById.get(ing.activeProductId);
    if (!product) return null;
    const supplier = supplierById.get(product.supplierId);
    const supplierName = supplier?.name
      ?? (product.supplierId.startsWith("legacy:")
        ? product.supplierId.slice("legacy:".length) || "Legacy supplier"
        : "Unknown supplier");
    return {
      productId: product.id,
      supplierId: product.supplierId,
      supplierName,
      displayName: product.displayName ?? null,
      supplierSku: product.supplierSku ?? null,
    };
  };

  const enriched = await Promise.all(
    recipes.map(async (r) => {
      const [cost, nutrition] = await Promise.all([
        calculateFoodCost(r.menuItemId),
        calculateRecipeNutrition(r.menuItemId),
      ]);
      const enrichedIngredients = r.ingredients.map((ri) => {
        const ing = ingredientMap.get(ri.ingredientId);
        const unitKcal = ing?.kcalPerUnit;
        return {
          ...ri,
          name: ing?.name ?? "Unknown",
          unit: ing?.unit ?? "kg",
          unitCost: ing?.costPerUnit ?? 0,
          unitKcal: typeof unitKcal === "number" ? unitKcal : null,
          // Pass through the rest of the macros so the editor can run
          // the same live-compute it does for kcal as the operator
          // tweaks quantities.
          unitProtein: typeof ing?.proteinPerUnit === "number" ? ing.proteinPerUnit : null,
          unitCarbs: typeof ing?.carbsPerUnit === "number" ? ing.carbsPerUnit : null,
          unitSugar: typeof ing?.sugarPerUnit === "number" ? ing.sugarPerUnit : null,
          unitFiber: typeof ing?.fiberPerUnit === "number" ? ing.fiberPerUnit : null,
          unitFat: typeof ing?.fatPerUnit === "number" ? ing.fatPerUnit : null,
          lineCost: Math.round((ing?.costPerUnit ?? 0) * ri.quantity * (ri.wasteFactor || 1)),
          // null when this ingredient is missing kcal data — the dialog
          // surfaces a hint so the operator knows which line is blocking
          // the per-portion total. No wasteFactor here — the trim
          // covered by wasteFactor doesn't reach the customer's plate.
          lineKcal:
            typeof unitKcal === "number"
              ? Math.round(unitKcal * ri.quantity)
              : null,
          // Inline provenance: which distributor offering this recipe
          // line is actually using. Null when the ingredient has no
          // active offering — the row UI surfaces a "Link offering"
          // affordance instead of a value.
          activeOffering: offeringFor(ri.ingredientId),
        };
      });
      return {
        ...r,
        calculatedCost: cost,
        calculatedNutrition: nutrition,
        calculatedCalories: nutrition.calories,
        enrichedIngredients,
      };
    }),
  );

  return NextResponse.json(enriched);
});

export const POST = withAdmin(
  { roles: ["manager", "owner"] },
  async (req, _ctx, { user }) => {
    try {
      const body = await req.json();
      if (!body.menuItemId) {
        return NextResponse.json({ error: "Missing menuItemId" }, { status: 400 });
      }

      const existing = await getRecipe(body.menuItemId);
      const recipe: Recipe = {
        id: body.id || existing?.id || `rcp-${crypto.randomUUID().slice(0, 8)}`,
        menuItemId: body.menuItemId,
        ingredients: (body.ingredients || []).map((ri: Record<string, unknown>) => ({
          ingredientId: ri.ingredientId,
          quantity: Number(ri.quantity) || 0,
          wasteFactor: Number(ri.wasteFactor) || 1,
        })),
        prepTimeMinutes: body.prepTimeMinutes ? Number(body.prepTimeMinutes) : undefined,
        yieldPortions: Number(body.yieldPortions) || 1,
        notes: body.notes || "",
      };

      const saved = await saveRecipe(recipe);
      const [foodCost, nutrition] = await Promise.all([
        calculateFoodCost(saved.menuItemId),
        calculateRecipeNutrition(saved.menuItemId),
      ]);

      // Recipes are chain-wide now (keyed by dish base slug); the menu
      // page derives cost from the recipe at read time via the same
      // base-slug lookup, so there's no per-menu-item override cache to
      // sync. Just log the recompute for traceability.
      await appendAuditLog({
        actor: user.email || user.id,
        action: "recipe.saved",
        entityType: "recipe",
        entityId: saved.menuItemId,
        after: { cost: foodCost, calories: nutrition.calories },
      });

      return NextResponse.json(
        {
          ...saved,
          calculatedCost: foodCost,
          calculatedNutrition: nutrition,
          calculatedCalories: nutrition.calories,
        },
        { status: 201 },
      );
    } catch {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  },
);

export const DELETE = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    const menuItemId = req.nextUrl.searchParams.get("menuItemId");
    if (!menuItemId) {
      return NextResponse.json({ error: "Missing menuItemId" }, { status: 400 });
    }

    const deleted = await deleteRecipe(menuItemId);
    if (!deleted) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  },
);
