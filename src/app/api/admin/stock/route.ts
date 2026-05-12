import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import {
  deleteIngredientStock,
  getIngredientStock,
  getIngredients,
  upsertIngredientStock,
} from "@/lib/store";

async function requireAuth() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  const location = req.nextUrl.searchParams.get("location") || undefined;
  const stock = await getIngredientStock(location);
  // Enrich with ingredient name/unit/cost so the UI doesn't need a second fetch
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
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  try {
    const body = await req.json();
    if (!body.ingredientId || !body.locationSlug) {
      return NextResponse.json({ error: "Missing ingredientId or locationSlug" }, { status: 400 });
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
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  const ingredientId = req.nextUrl.searchParams.get("ingredientId");
  const locationSlug = req.nextUrl.searchParams.get("locationSlug");
  if (!ingredientId || !locationSlug) {
    return NextResponse.json({ error: "Missing query params" }, { status: 400 });
  }
  const ok = await deleteIngredientStock(ingredientId, locationSlug);
  return NextResponse.json({ ok });
}
