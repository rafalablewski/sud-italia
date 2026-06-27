import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireOperator, scopeAllows } from "@/lib/api/v1/guard";
import { toOrderDTO } from "@/lib/api/v1/order-dto";
import { appendAuditLog, getOrderById, updateOrder } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `POST /api/v1/orders/:id/settle` — mark an order paid at the counter (cash /
 * terminal), the native twin of the web floor settle action
 * (`/api/admin/floor/orders` action:settle). Idempotent: an already-paid order
 * returns `meta.changed=false`. A still-`pending` order is confirmed as it
 * settles, so it fires to the kitchen — matching the web. Bearer + location-
 * scoped + audited. (Money total stays server-authoritative; this only stamps
 * `paidAt`.)
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireOperator(req);
  if ("error" in guard) return guard.error;

  const { id } = await ctx.params;
  const existing = await getOrderById(id);
  if (!existing) return apiError("not_found", "Order not found");
  if (!scopeAllows(guard.claims.scope, existing.locationSlug)) {
    return apiError("forbidden", "Not authorized for this order's location");
  }

  // Idempotent — already settled (double tap / offline replay).
  if (existing.paidAt) {
    return apiOk(toOrderDTO(existing), { changed: false });
  }

  try {
    const updated = await updateOrder(id, {
      paidAt: new Date().toISOString(),
      status: existing.status === "pending" ? "confirmed" : existing.status,
    });
    if (!updated) return apiError("conflict", "Order could not be settled");
    await appendAuditLog({
      actor: guard.claims.email || guard.claims.sub,
      action: "orders.settle",
      entityType: "order",
      entityId: id,
      after: { paidAt: updated.paidAt, status: updated.status },
    });
    return apiOk(toOrderDTO(updated), { changed: true });
  } catch (err) {
    logger.error("v1 order settle failed", { layer: "api.v1.orders", id }, err as Error);
    return apiError("internal", "Could not settle order");
  }
}
