import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { createStockMovement, getStockMovements } from "@/lib/store";
import type { StockMovementType } from "@/data/types";

const VALID_TYPES: StockMovementType[] = ["receive", "waste", "consume", "adjust"];

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
  const ingredientId = req.nextUrl.searchParams.get("ingredientId") || undefined;
  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Math.max(1, Math.min(500, Number(limitRaw))) : undefined;
  const movements = await getStockMovements({ locationSlug: location, ingredientId, limit });
  return NextResponse.json(movements);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  try {
    const body = await req.json();
    if (!body.ingredientId || !body.locationSlug) {
      return NextResponse.json({ error: "Missing ingredientId or locationSlug" }, { status: 400 });
    }
    if (!VALID_TYPES.includes(body.type)) {
      return NextResponse.json({ error: "Invalid movement type" }, { status: 400 });
    }
    const qty = Number(body.quantity);
    if (!Number.isFinite(qty) || qty === 0) {
      return NextResponse.json({ error: "Quantity must be a non-zero number" }, { status: 400 });
    }
    // Sign rule: receive + adjust accept the raw sign;
    // waste + consume are recorded as negative deltas (UI sends positive magnitude).
    let signedQty = qty;
    if (body.type === "waste" || body.type === "consume") {
      signedQty = -Math.abs(qty);
    }
    const movement = await createStockMovement({
      ingredientId: body.ingredientId,
      locationSlug: body.locationSlug,
      type: body.type,
      quantity: signedQty,
      reason: body.reason,
      costImpact: body.costImpact !== undefined ? Number(body.costImpact) : undefined,
      byUser: body.byUser,
    });
    return NextResponse.json(movement, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
}
