import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { hasLocationAccess } from "@/lib/admin-auth";
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

export const GET = withAdmin(
  { locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    const status = (req.nextUrl.searchParams.get("status") || undefined) as PurchaseOrderStatus | undefined;
    const supplierId = req.nextUrl.searchParams.get("supplierId") || undefined;
    const pos = await getPurchaseOrders({
      locationSlug: locationSlug ?? undefined,
      status,
      supplierId,
    });

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
  },
);

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

async function saveFromBody(body: { id?: string; supplierId?: string; locationSlug?: string; status?: string; lines?: unknown; expectedAt?: string; notes?: string }) {
  if (!body.supplierId || !body.locationSlug) {
    return NextResponse.json({ error: "Missing supplierId or locationSlug" }, { status: 400 });
  }
  if (!(await hasLocationAccess(body.locationSlug))) {
    return NextResponse.json(
      { error: `Session is not authorized for location "${body.locationSlug}"` },
      { status: 403 },
    );
  }
  const status: PurchaseOrderStatus = VALID_STATUSES.includes(body.status as PurchaseOrderStatus)
    ? (body.status as PurchaseOrderStatus)
    : "draft";
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
}

export const POST = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    try {
      return await saveFromBody(await req.json());
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
  },
);

export const PUT = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    try {
      const body = await req.json();
      if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
      if (body.status && !VALID_STATUSES.includes(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      if (body.status && body.lines === undefined) {
        const updated = await updatePurchaseOrderStatus(body.id, body.status);
        if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json(updated);
      }
      return await saveFromBody(body);
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
  },
);

export const DELETE = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const ok = await deletePurchaseOrder(id);
    return NextResponse.json({ ok });
  },
);
