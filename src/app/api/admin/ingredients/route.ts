import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getIngredients, saveIngredient, deleteIngredient } from "@/lib/store";
import type { Ingredient } from "@/data/types";

// Ingredients are chain-wide. Writes are manager+ because the active
// offering (cost + nutrition source of truth, lives at
// /api/admin/ingredient-products) feeds recipe cost which feeds menu
// margins.
//
// This route handles the ingredient *identity* only: name, category,
// unit, notes, activeProductId. Cost / kcal / macros / supplier all
// live on `ingredient_products`. Use /api/admin/ingredient-products
// to create / edit / delete the per-distributor offerings; this route
// changes which one is active via `activeProductId`.

export const GET = withAdmin({}, async () => {
  return NextResponse.json(await getIngredients());
});

export const POST = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    try {
      const body = await req.json();
      if (!body.name) {
        return NextResponse.json({ error: "Name is required" }, { status: 400 });
      }
      const ingredient: Ingredient = {
        id: body.id || `ing-${crypto.randomUUID().slice(0, 8)}`,
        name: body.name,
        category: body.category || "other",
        unit: body.unit || "kg",
        activeProductId: body.activeProductId || undefined,
        notes: body.notes || undefined,
      };
      const saved = await saveIngredient(ingredient);
      return NextResponse.json(saved, { status: 201 });
    } catch {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  },
);

export const PUT = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    try {
      const body = await req.json();
      if (!body.id) {
        return NextResponse.json({ error: "Missing ingredient id" }, { status: 400 });
      }
      const ingredient: Ingredient = {
        id: body.id,
        name: body.name,
        category: body.category,
        unit: body.unit,
        activeProductId: body.activeProductId || undefined,
        notes: body.notes || undefined,
      };
      const saved = await saveIngredient(ingredient);
      return NextResponse.json(saved);
    } catch {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  },
);

export const DELETE = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const deleted = await deleteIngredient(id);
    if (!deleted) {
      return NextResponse.json({ error: "Ingredient not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  },
);
