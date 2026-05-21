import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  deleteIngredientProduct,
  getIngredientProducts,
  getIngredients,
  saveIngredient,
  saveIngredientProduct,
} from "@/lib/store";
import type { IngredientProduct } from "@/data/types";

// Per-distributor offerings of an ingredient. Recipes reference the
// ingredient; each ingredient points at one "active" offering via
// `Ingredient.activeProductId`, which drives recipe cost + nutrition.
// Switching distributors = pointing the active id at a different row.

/** Numeric macro fields the operator can set on each offering. Empty
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

function pickMacros(body: Record<string, unknown>): Partial<IngredientProduct> {
  const out: Partial<IngredientProduct> = {};
  for (const key of MACRO_FIELDS) {
    const raw = body[key];
    if (raw === null || raw === undefined || raw === "") continue;
    const n = Math.max(0, Math.round(Number(raw)));
    if (Number.isFinite(n)) (out as Record<string, number>)[key] = n;
  }
  return out;
}

export const GET = withAdmin({}, async (req) => {
  const url = new URL(req.url);
  const ingredientId = url.searchParams.get("ingredientId")?.trim() || undefined;
  const supplierId = url.searchParams.get("supplierId")?.trim() || undefined;
  const products = await getIngredientProducts({ ingredientId, supplierId });
  return NextResponse.json(products);
});

export const POST = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    try {
      const body = await req.json();
      if (!body.ingredientId || !body.supplierId) {
        return NextResponse.json(
          { error: "ingredientId + supplierId required" },
          { status: 400 },
        );
      }
      const cost = Math.max(0, Math.round(Number(body.costPerUnit) || 0));
      const product = await saveIngredientProduct({
        ingredientId: body.ingredientId,
        supplierId: body.supplierId,
        supplierSku: body.supplierSku?.trim() || undefined,
        displayName: body.displayName?.trim() || undefined,
        costPerUnit: cost,
        ...pickMacros(body),
        notes: body.notes?.trim() || undefined,
      });
      // First offering for an ingredient → flip it active automatically
      // so the operator doesn't have to do a second click. Subsequent
      // additions require an explicit "Make active" toggle to avoid
      // surprises (someone adds a new offering for cost comparison and
      // doesn't want their recipes to silently switch).
      if (body.makeActive) {
        await flipActive(product.ingredientId, product.id);
      } else {
        const existing = await getIngredientProducts({ ingredientId: product.ingredientId });
        if (existing.length === 1) {
          await flipActive(product.ingredientId, product.id);
        }
      }
      return NextResponse.json(product, { status: 201 });
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
        return NextResponse.json({ error: "Missing id" }, { status: 400 });
      }
      const cost = Math.max(0, Math.round(Number(body.costPerUnit) || 0));
      const product = await saveIngredientProduct({
        id: body.id,
        ingredientId: body.ingredientId,
        supplierId: body.supplierId,
        supplierSku: body.supplierSku?.trim() || undefined,
        displayName: body.displayName?.trim() || undefined,
        costPerUnit: cost,
        ...pickMacros(body),
        notes: body.notes?.trim() || undefined,
      });
      if (body.makeActive) {
        await flipActive(product.ingredientId, product.id);
      }
      return NextResponse.json(product);
    } catch {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  },
);

/** PATCH /api/admin/ingredient-products — flip the active offering for
 *  an ingredient without re-writing the row. Body: { ingredientId,
 *  productId }. Used by the "Make active" radio in the dialog. */
export const PATCH = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    try {
      const body = await req.json();
      if (!body.ingredientId || !body.productId) {
        return NextResponse.json(
          { error: "ingredientId + productId required" },
          { status: 400 },
        );
      }
      await flipActive(body.ingredientId, body.productId);
      return NextResponse.json({ success: true });
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
    const removed = await deleteIngredientProduct(id);
    if (!removed) {
      return NextResponse.json({ error: "Offering not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  },
);

/** Point an ingredient's `activeProductId` at the given offering. The
 *  recipe-derived maps refresh on the next read, so the menu admin
 *  + customer cards pick up the new cost / nutrition without any
 *  recipe-side edit. */
async function flipActive(ingredientId: string, productId: string): Promise<void> {
  const all = await getIngredients();
  const ing = all.find((i) => i.id === ingredientId);
  if (!ing) return;
  if (ing.activeProductId === productId) return;
  await saveIngredient({ ...ing, activeProductId: productId });
}
