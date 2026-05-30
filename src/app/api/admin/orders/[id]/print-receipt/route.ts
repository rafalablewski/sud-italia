import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getCurrentActor, hasLocationAccess } from "@/lib/admin-auth";
import { appendAuditLog, getOrderById } from "@/lib/store";
import { printReceipt } from "@/lib/receipt/print";
import { logger } from "@/lib/logger";

// Print a thermal receipt for an order (audit §11.2 / §12.4 #7). Printing is a
// counter task — any authenticated staff member, with per-location tenancy.
export const POST = withAdmin<{ params: Promise<{ id: string }> }>(
  {},
  async (_req, { params }) => {
    const { id: orderId } = await params;
    if (!orderId) {
      return NextResponse.json({ error: "Missing order id" }, { status: 400 });
    }
    const order = await getOrderById(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (!(await hasLocationAccess(order.locationSlug))) {
      return NextResponse.json(
        { error: `Session is not authorized for location "${order.locationSlug}"` },
        { status: 403 },
      );
    }

    try {
      const result = await printReceipt(order);
      const actor = await getCurrentActor();
      await appendAuditLog({
        actor,
        action: "receipt.print",
        entityType: "order",
        entityId: orderId,
        after: { mode: result.mode, bytes: result.bytes, printer: result.printer ?? null },
      });
      return NextResponse.json(result);
    } catch (err) {
      logger.error(
        "receipt print failed",
        { route: "POST /api/admin/orders/[id]/print-receipt", orderId },
        err,
      );
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Print failed" },
        { status: 502 },
      );
    }
  },
);
