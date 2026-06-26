import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireOperator, scopeAllows } from "@/lib/api/v1/guard";
import { appendAuditLog, getOrderById } from "@/lib/store";
import { printReceipt } from "@/lib/receipt/print";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `POST /api/v1/orders/:id/receipt` — render/print a thermal receipt, the native
 * twin of `/api/admin/orders/[id]/print-receipt`. Returns
 * `{ mode, bytes, preview, printer? }`:
 *  - `printed`  — a RECEIPT_PRINTER_HOST is configured and the ESC/POS bytes were
 *                 streamed to it.
 *  - `simulated`— no printer host; `preview` is the exact plain-text receipt the
 *                 app can show or share (the no-hardware fallback).
 * Bearer + location-scoped + audited.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireOperator(req);
  if ("error" in guard) return guard.error;

  const { id } = await ctx.params;
  const order = await getOrderById(id);
  if (!order) return apiError("not_found", "Order not found");
  if (!scopeAllows(guard.claims.scope, order.locationSlug)) {
    return apiError("forbidden", "Not authorized for this order's location");
  }

  try {
    const result = await printReceipt(order);
    await appendAuditLog({
      actor: guard.claims.email || guard.claims.sub,
      action: "receipt.print",
      entityType: "order",
      entityId: id,
      after: { mode: result.mode, bytes: result.bytes, printer: result.printer ?? null },
    });
    return apiOk(result);
  } catch (err) {
    logger.error("v1 receipt print failed", { layer: "api.v1.orders", id }, err as Error);
    return apiError("service_unavailable", err instanceof Error ? err.message : "Print failed");
  }
}
