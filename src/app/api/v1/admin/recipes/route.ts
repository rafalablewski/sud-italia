import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole } from "@/lib/api/v1/guard";
import { getRecipes, getIngredients } from "@/lib/store";
import { getMenuWithOverrides } from "@/data/menus";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const baseSlug = (id: string) => id.replace(/^(krk|waw)-/, "");

/**
 * `GET /api/v1/admin/recipes` — chain-wide recipes (one per dish, keyed by base
 * slug — Rule #10), joined with dish names and ingredient names/units so the app
 * can render them. Manager+.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  try {
    const [recipes, ingredients, krk, waw] = await Promise.all([
      getRecipes(),
      getIngredients(),
      getMenuWithOverrides("krakow"),
      getMenuWithOverrides("warszawa"),
    ]);
    const ingName = new Map(ingredients.map((i) => [i.id, i]));
    const dishName = new Map<string, string>();
    for (const m of [...krk, ...waw]) dishName.set(baseSlug(m.id), m.name);

    const out = recipes.map((r) => ({
      id: r.id,
      menuItemId: r.menuItemId,
      dishName: dishName.get(baseSlug(r.menuItemId)) ?? r.menuItemId,
      yieldPortions: r.yieldPortions,
      prepTimeMinutes: r.prepTimeMinutes ?? null,
      ingredients: r.ingredients.map((ri) => ({
        name: ingName.get(ri.ingredientId)?.name ?? ri.ingredientId,
        unit: ingName.get(ri.ingredientId)?.unit ?? "",
        quantity: ri.quantity,
      })),
    }));
    out.sort((a, b) => a.dishName.localeCompare(b.dishName));
    return apiOk(out, { count: out.length });
  } catch (err) {
    logger.error("v1 admin recipes failed", { layer: "api.v1.admin.recipes" }, err as Error);
    return apiError("internal", "Could not load recipes");
  }
}
