import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, resolveLocationFilter, scopeAllows } from "@/lib/api/v1/guard";
import { getPurchaseOrder, getPurchaseOrders, getSuppliers, updatePurchaseOrderStatus } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/purchase-orders` — POs with supplier names resolved,
 * mirroring web `/admin/purchase-orders`. Manager+; location-scoped. Newest first.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  const filter = resolveLocationFilter(req, guard.claims.scope);
  if ("error" in filter) return filter.error;
  try {
    const [pos, suppliers] = await Promise.all([getPurchaseOrders(), getSuppliers()]);
    const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
    const list = (filter.slugs === null ? pos : pos.filter((p) => filter.slugs!.includes(p.locationSlug)))
      .map((p) => ({
        id: p.id,
        supplierId: p.supplierId,
        supplierName: supplierName.get(p.supplierId) ?? p.supplierId,
        locationSlug: p.locationSlug,
        status: p.status,
        lineCount: p.lines.length,
        totalCents: p.totalCents,
        expectedAt: p.expectedAt ?? null,
        receivedAt: p.receivedAt ?? null,
        createdAt: p.createdAt,
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return apiOk(list, { count: list.length });
  } catch (err) {
    logger.error("v1 admin purchase-orders failed", { layer: "api.v1.admin.po" }, err as Error);
    return apiError("internal", "Could not load purchase orders");
  }
}

const PO_STATUSES = new Set(["draft", "sent", "received", "cancelled"]);

/**
 * `PATCH /api/v1/admin/purchase-orders` — advance a PO's status, mirroring the
 * web `/admin/purchase-orders` PUT status path. Body `{ id, status }`. Marking
 * `received` posts the receive stock movements (updatePurchaseOrderStatus →
 * receivePurchaseOrder). Manager+. Returns the updated PO (supplier resolved).
 */
export async function PATCH(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;

  let body: { id?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return apiError("bad_request", "Body must be valid JSON");
  }
  if (!body.id || !body.status || !PO_STATUSES.has(body.status)) {
    return apiError("validation_failed", "id and a valid status (draft | sent | received | cancelled) are required");
  }
  try {
    // Authorize BEFORE mutating — marking "received" posts stock movements, so an
    // out-of-scope write must be rejected before any side effect commits.
    const existing = await getPurchaseOrder(body.id);
    if (!existing) return apiError("not_found", "Purchase order not found");
    if (!scopeAllows(guard.claims.scope, existing.locationSlug)) {
      return apiError("forbidden", `Not authorized for location "${existing.locationSlug}"`);
    }
    const updated = await updatePurchaseOrderStatus(body.id, body.status as "draft" | "sent" | "received" | "cancelled");
    if (!updated) return apiError("not_found", "Purchase order not found");
    const suppliers = await getSuppliers();
    const supplierName = suppliers.find((s) => s.id === updated.supplierId)?.name ?? updated.supplierId;
    return apiOk(
      {
        id: updated.id,
        supplierId: updated.supplierId,
        supplierName,
        locationSlug: updated.locationSlug,
        status: updated.status,
        lineCount: updated.lines.length,
        totalCents: updated.totalCents,
        expectedAt: updated.expectedAt ?? null,
        receivedAt: updated.receivedAt ?? null,
        createdAt: updated.createdAt,
      },
      { changed: true },
    );
  } catch (err) {
    logger.error("v1 admin po patch failed", { layer: "api.v1.admin.po" }, err as Error);
    return apiError("internal", "Could not update the purchase order");
  }
}
