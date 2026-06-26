import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, resolveLocationFilter } from "@/lib/api/v1/guard";
import { getPurchaseOrders, getSuppliers } from "@/lib/store";
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
