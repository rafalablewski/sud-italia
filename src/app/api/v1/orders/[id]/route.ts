import { NextRequest } from "next/server";
import { z } from "zod";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireOperator, scopeAllows } from "@/lib/api/v1/guard";
import { toOrderDTO } from "@/lib/api/v1/order-dto";
import { getOrderById, updateOrderStatus } from "@/lib/store";
import { ORDER_STATUSES } from "@/data/types";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const patchSchema = z.object({ status: z.enum(ORDER_STATUSES) });

/** `GET /api/v1/orders/:id` — order detail (Bearer, location-scoped). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireOperator(req);
  if ("error" in guard) return guard.error;

  const { id } = await ctx.params;
  const order = await getOrderById(id);
  if (!order) return apiError("not_found", "Order not found");
  if (!scopeAllows(guard.claims.scope, order.locationSlug)) {
    return apiError("forbidden", "Not authorized for this order's location");
  }
  return apiOk(toOrderDTO(order));
}

/**
 * `PATCH /api/v1/orders/:id` — advance the order through the pipeline (the KDS
 * bump). Idempotent: setting the status it already holds is a no-op success, so
 * a retried/offline-replayed bump can't error. Reuses updateOrderStatus, which
 * fires the order event the SSE feed and web board both listen on.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireOperator(req);
  if ("error" in guard) return guard.error;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError("bad_request", "Body must be valid JSON");
  }
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError("validation_failed", "Invalid status", {
      allowed: ORDER_STATUSES,
    });
  }

  const { id } = await ctx.params;
  const existing = await getOrderById(id);
  if (!existing) return apiError("not_found", "Order not found");
  if (!scopeAllows(guard.claims.scope, existing.locationSlug)) {
    return apiError("forbidden", "Not authorized for this order's location");
  }

  // Idempotent no-op — already at the target status (offline replay / double tap).
  if (existing.status === parsed.data.status) {
    return apiOk(toOrderDTO(existing), { changed: false });
  }

  try {
    const updated = await updateOrderStatus(id, parsed.data.status);
    if (!updated) return apiError("conflict", "Order could not be updated");
    return apiOk(toOrderDTO(updated), { changed: true });
  } catch (err) {
    logger.error("v1 order status update failed", { layer: "api.v1.orders", id }, err as Error);
    return apiError("internal", "Could not update order");
  }
}
