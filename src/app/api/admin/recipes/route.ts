import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  appendAuditLog,
  calculateFoodCost,
  calculateRecipeCalories,
  deleteRecipe,
  getIngredients,
  getRecipe,
  getRecipes,
  saveRecipe,
  setMenuOverride,
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
    const [foodCost, kcal] = await Promise.all([
      calculateFoodCost(menuItemId),
      calculateRecipeCalories(menuItemId),
    ]);
    return NextResponse.json({ ...recipe, calculatedCost: foodCost, calculatedCalories: kcal });
  }

  const recipes = await getRecipes();
  const ingredients = await getIngredients();
  const ingredientMap = new Map(ingredients.map((i) => [i.id, i]));

  const enriched = await Promise.all(
    recipes.map(async (r) => {
      const [cost, kcal] = await Promise.all([
        calculateFoodCost(r.menuItemId),
        calculateRecipeCalories(r.menuItemId),
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
          lineCost: Math.round((ing?.costPerUnit ?? 0) * ri.quantity * (ri.wasteFactor || 1)),
          // null when this ingredient is missing kcal data — the dialog
          // surfaces a hint so the operator knows which line is blocking
          // the per-portion total.
          lineKcal:
            typeof unitKcal === "number"
              ? Math.round(unitKcal * ri.quantity * (ri.wasteFactor || 1))
              : null,
        };
      });
      return { ...r, calculatedCost: cost, calculatedCalories: kcal, enrichedIngredients };
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
      const [foodCost, kcal] = await Promise.all([
        calculateFoodCost(recipe.menuItemId),
        calculateRecipeCalories(recipe.menuItemId),
      ]);

      // Keep the menu page honest: every recipe save writes the per-portion
      // cost back to MenuOverride.cost so the Menu admin's cost + margin
      // columns reflect the real ingredient maths instead of the static
      // seed value.
      await setMenuOverride(recipe.menuItemId, { cost: foodCost });
      await appendAuditLog({
        actor: user.email || user.id,
        action: "menu.cost_synced_from_recipe",
        entityType: "menu_item",
        entityId: recipe.menuItemId,
        after: { cost: foodCost },
      });

      return NextResponse.json(
        { ...saved, calculatedCost: foodCost, calculatedCalories: kcal },
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
