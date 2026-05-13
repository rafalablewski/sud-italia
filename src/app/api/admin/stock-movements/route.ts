import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { hasLocationAccess } from "@/lib/admin-auth";
import { createStockMovement, getStockMovements } from "@/lib/store";
import type { StockMovementType } from "@/data/types";

const VALID_TYPES: StockMovementType[] = ["receive", "waste", "consume", "adjust"];

export const GET = withAdmin(
  { locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    const ingredientId = req.nextUrl.searchParams.get("ingredientId") || undefined;
    const limitRaw = req.nextUrl.searchParams.get("limit");
    const limit = limitRaw ? Math.max(1, Math.min(500, Number(limitRaw))) : undefined;
    const movements = await getStockMovements({
      locationSlug: locationSlug ?? undefined,
      ingredientId,
      limit,
    });
    return NextResponse.json(movements);
  },
);

export const POST = withAdmin(
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
  },
);
