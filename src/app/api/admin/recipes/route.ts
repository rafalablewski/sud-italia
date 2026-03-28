import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { getRecipes, getRecipe, saveRecipe, deleteRecipe, calculateFoodCost, getIngredients } from "@/lib/store";
import type { Recipe } from "@/data/types";

async function requireAuth() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const menuItemId = req.nextUrl.searchParams.get("menuItemId");

  if (menuItemId) {
    const recipe = await getRecipe(menuItemId);
    if (!recipe) {
      return NextResponse.json(null);
    }
    const foodCost = await calculateFoodCost(menuItemId);
    return NextResponse.json({ ...recipe, calculatedCost: foodCost });
  }

  // Return all recipes with calculated costs + ingredient details
  const recipes = await getRecipes();
  const ingredients = await getIngredients();
  const ingredientMap = new Map(ingredients.map((i) => [i.id, i]));

  const enriched = await Promise.all(
    recipes.map(async (r) => {
      const cost = await calculateFoodCost(r.menuItemId);
      const enrichedIngredients = r.ingredients.map((ri) => {
        const ing = ingredientMap.get(ri.ingredientId);
        return {
          ...ri,
          name: ing?.name ?? "Unknown",
          unit: ing?.unit ?? "kg",
          unitCost: ing?.costPerUnit ?? 0,
          lineCost: Math.round((ing?.costPerUnit ?? 0) * ri.quantity * (ri.wasteFactor || 1)),
        };
      });
      return { ...r, calculatedCost: cost, enrichedIngredients };
    })
  );

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await req.json();
    if (!body.menuItemId) {
      return NextResponse.json({ error: "Missing menuItemId" }, { status: 400 });
    }

    // Preserve existing ID on update, generate new one for create
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
    const foodCost = await calculateFoodCost(recipe.menuItemId);
    return NextResponse.json({ ...saved, calculatedCost: foodCost }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const menuItemId = req.nextUrl.searchParams.get("menuItemId");
  if (!menuItemId) {
    return NextResponse.json({ error: "Missing menuItemId" }, { status: 400 });
  }

  const deleted = await deleteRecipe(menuItemId);
  if (!deleted) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
