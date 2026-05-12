import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { hasLocationAccess } from "@/lib/admin-auth";
import {
  deleteIngredientStock,
  getIngredientStock,
  getIngredients,
  upsertIngredientStock,
} from "@/lib/store";

export const GET = withAdmin(
  { locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    const stock = await getIngredientStock(locationSlug ?? undefined);
    const ingredients = await getIngredients();
    const map = new Map(ingredients.map((i) => [i.id, i]));
    const enriched = stock.map((s) => {
      const ing = map.get(s.ingredientId);
      return {
        ...s,
        name: ing?.name ?? "Unknown",
        unit: ing?.unit ?? "kg",
        category: ing?.category ?? "produce",
        costPerUnit: ing?.costPerUnit ?? 0,
        supplier: ing?.supplier,
      };
    });
    return NextResponse.json(enriched);
  },
);

// Stock writes touch on-hand counts at a specific location — staff+ in scope.
// Per-location enforcement uses the body's locationSlug for PUT and the
// query param for DELETE.
export const PUT = withAdmin(
  { roles: ["staff", "manager", "owner"] },
  async (req) => {
    try {
      const body = await req.json();
      if (!body.ingredientId || !body.locationSlug) {
        return NextResponse.json({ error: "Missing ingredientId or locationSlug" }, { status: 400 });
      }
      if (!(await hasLocationAccess(body.locationSlug))) {
        return NextResponse.json(
          { error: `Session is not authorized for location "${body.locationSlug}"` },
          { status: 403 },
        );
      }
      const saved = await upsertIngredientStock({
        ingredientId: body.ingredientId,
        locationSlug: body.locationSlug,
        onHand: Number(body.onHand ?? 0),
        parLevel: Number(body.parLevel ?? 0),
        reorderPoint: Number(body.reorderPoint ?? 0),
        lastCountedAt: body.lastCountedAt,
        lastCountedBy: body.lastCountedBy,
      });
      return NextResponse.json(saved);
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
  },
);

export const DELETE = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    const ingredientId = req.nextUrl.searchParams.get("ingredientId");
    const locationSlug = req.nextUrl.searchParams.get("locationSlug");
    if (!ingredientId || !locationSlug) {
      return NextResponse.json({ error: "Missing query params" }, { status: 400 });
    }
    if (!(await hasLocationAccess(locationSlug))) {
      return NextResponse.json(
        { error: `Session is not authorized for location "${locationSlug}"` },
        { status: 403 },
      );
    }
    const ok = await deleteIngredientStock(ingredientId, locationSlug);
    return NextResponse.json({ ok });
  },
);
