import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getIngredients, saveIngredient, deleteIngredient } from "@/lib/store";
import type { Ingredient } from "@/data/types";

// Ingredients are chain-wide. Writes are manager+ because cost-per-unit
// flows into recipe cost which flows into menu margins.

export const GET = withAdmin({}, async () => {
  return NextResponse.json(await getIngredients());
});

export const POST = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    try {
      const body = await req.json();
      const ingredient: Ingredient = {
        id: body.id || `ing-${crypto.randomUUID().slice(0, 8)}`,
        name: body.name,
        category: body.category || "other",
        unit: body.unit || "kg",
        costPerUnit: Number(body.costPerUnit) || 0,
        supplier: body.supplier || "",
        notes: body.notes || "",
      };

      if (!ingredient.name) {
        return NextResponse.json({ error: "Name is required" }, { status: 400 });
      }

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

      const saved = await saveIngredient(body as Ingredient);
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
