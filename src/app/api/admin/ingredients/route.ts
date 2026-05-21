import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getIngredients, saveIngredient, deleteIngredient } from "@/lib/store";
import type { Ingredient } from "@/data/types";

// Ingredients are chain-wide. Writes are manager+ because cost-per-unit
// flows into recipe cost which flows into menu margins.

/** Numeric macro fields the operator can set on each ingredient. Empty
 *  string / null / undefined / NaN means "no claim" — drop the field
 *  instead of writing 0, which would otherwise satisfy downstream
 *  `typeof === "number"` checks and resolve to a fake 0-g/kcal value
 *  in recipe totals. */
const MACRO_FIELDS = [
  "kcalPerUnit",
  "proteinPerUnit",
  "carbsPerUnit",
  "sugarPerUnit",
  "fiberPerUnit",
  "fatPerUnit",
] as const;

function pickMacros(body: Record<string, unknown>): Partial<Ingredient> {
  const out: Partial<Ingredient> = {};
  for (const key of MACRO_FIELDS) {
    const raw = body[key];
    if (raw === null || raw === undefined || raw === "") continue;
    const n = Math.max(0, Math.round(Number(raw)));
    if (Number.isFinite(n)) (out as Record<string, number>)[key] = n;
  }
  return out;
}

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
        ...pickMacros(body),
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
      const incoming = body as Ingredient;
      const macros = pickMacros(body);
      // Strip macro keys from the incoming row first so unset fields
      // (cleared by the operator) actually clear instead of round-
      // tripping the old value. Then re-apply the parsed macros — any
      // field absent from `macros` ends up undefined → dropped on
      // write → SQL NULL.
      const stripped: Ingredient = { ...incoming };
      for (const key of MACRO_FIELDS) {
        (stripped as unknown as Record<string, unknown>)[key] = undefined;
      }
      const normalised: Ingredient = { ...stripped, ...macros };
      const saved = await saveIngredient(normalised);
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
