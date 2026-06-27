import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireOperator, scopeAllows } from "@/lib/api/v1/guard";
import { toOrderDTO } from "@/lib/api/v1/order-dto";
import { appendAuditLog, getOrderById, updateOrder } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `POST /api/v1/orders/:id/recall` — un-bump a mis-tapped completion
 * (completed → ready), the native twin of `/api/admin/orders/[id]/recall`. Only
 * `completed` orders are recallable (a non-completed order 409s, matching the
 * web guard); cancellations go through the normal pipeline. Reuses `updateOrder`,
 * which fires the order event the SSE board + KDS lanes listen on, so the ticket
 * reappears on the expo column. Bearer + location-scoped + audited.
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
  if (existing.status !== "completed") {
    return apiError("conflict", `Only completed orders can be recalled (current: ${existing.status})`);
  }

  try {
    const updated = await updateOrder(id, { status: "ready" });
    if (!updated) return apiError("conflict", "Order could not be recalled");
    await appendAuditLog({
      actor: guard.claims.email || guard.claims.sub,
      action: "orders.recall",
      entityType: "order",
      entityId: id,
      before: { status: "completed" },
      after: { status: "ready" },
    });
    return apiOk(toOrderDTO(updated), { changed: true });
  } catch (err) {
    logger.error("v1 order recall failed", { layer: "api.v1.orders", id }, err as Error);
    return apiError("internal", "Could not recall order");
  }
}
