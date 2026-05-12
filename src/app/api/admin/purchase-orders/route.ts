import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import {
  deletePurchaseOrder,
  getPurchaseOrders,
  getSuppliers,
  getIngredients,
  savePurchaseOrder,
  updatePurchaseOrderStatus,
} from "@/lib/store";
import type { PurchaseOrderStatus, PurchaseOrderLine } from "@/data/types";

const VALID_STATUSES: PurchaseOrderStatus[] = ["draft", "sent", "received", "cancelled"];

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
  const status = (req.nextUrl.searchParams.get("status") || undefined) as PurchaseOrderStatus | undefined;
  const supplierId = req.nextUrl.searchParams.get("supplierId") || undefined;
  const pos = await getPurchaseOrders({ locationSlug: location, status, supplierId });

  // Enrich with supplier name + ingredient names
  const [suppliers, ingredients] = await Promise.all([getSuppliers(), getIngredients()]);
  const sMap = new Map(suppliers.map((s) => [s.id, s]));
  const iMap = new Map(ingredients.map((i) => [i.id, i]));
  const enriched = pos.map((p) => ({
    ...p,
    supplierName: sMap.get(p.supplierId)?.name ?? "Unknown supplier",
    lineCount: p.lines.length,
    lines: p.lines.map((l) => {
      const ing = iMap.get(l.ingredientId);
      return {
        ...l,
        name: ing?.name ?? "Unknown",
        unit: ing?.unit ?? "kg",
        lineTotal: Math.round(l.quantity * l.unitCost),
      };
    }),
  }));
  return NextResponse.json(enriched);
}

function parseLines(body: unknown): PurchaseOrderLine[] {
  const arr = Array.isArray((body as { lines?: unknown[] }).lines) ? (body as { lines: unknown[] }).lines : [];
  const out: PurchaseOrderLine[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as { ingredientId?: unknown; quantity?: unknown; unitCost?: unknown };
    if (!r.ingredientId || typeof r.ingredientId !== "string") continue;
    const q = Number(r.quantity);
    const c = Number(r.unitCost);
    if (!Number.isFinite(q) || q <= 0) continue;
    if (!Number.isFinite(c) || c < 0) continue;
    out.push({ ingredientId: r.ingredientId, quantity: q, unitCost: c });
  }
  return out;
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  try {
    const body = await req.json();
    if (!body.supplierId || !body.locationSlug) {
      return NextResponse.json({ error: "Missing supplierId or locationSlug" }, { status: 400 });
    }
    const status: PurchaseOrderStatus = VALID_STATUSES.includes(body.status) ? body.status : "draft";
    const lines = parseLines(body);
    if (lines.length === 0) {
      return NextResponse.json({ error: "At least one line required" }, { status: 400 });
    }
    const saved = await savePurchaseOrder({
      id: body.id,
      supplierId: body.supplierId,
      locationSlug: body.locationSlug,
      status,
      lines,
      expectedAt: body.expectedAt,
      notes: body.notes,
    });
    return NextResponse.json(saved, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    if (body.status) {
      const updated = await updatePurchaseOrderStatus(body.id, body.status);
      if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(updated);
    }
    // Otherwise treat as a full save
    return POST(req);
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const ok = await deletePurchaseOrder(id);
  return NextResponse.json({ ok });
}
