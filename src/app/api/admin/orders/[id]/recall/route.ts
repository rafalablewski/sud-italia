import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { hasLocationAccess } from "@/lib/admin-auth";
import { appendAuditLog, getOrderById, updateOrder } from "@/lib/store";

/**
 * Recall a bumped KDS ticket — the order the cook just hit "Bump · Done"
 * on by accident. Restores it to "ready" so it reappears on the expo column.
 *
 * Only `completed` orders are recallable; cancelled orders go through the
 * normal status pipeline to be revived (deliberately separate flow because
 * cancellation usually involves a refund / slot release).
 *
 * Tenancy check happens inside the handler because the order's location
 * isn't known until we read it. Any kitchen/staff role can recall — the
 * action is operationally low-risk (the cook fat-fingered a bump).
 */
export const POST = withAdmin<{ params: Promise<{ id: string }> }>(
  { roles: ["kitchen", "staff", "manager", "owner"] },
  async (_req, { params }, { user }) => {
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

    if (order.status !== "completed") {
      return NextResponse.json(
        {
          error: `Only completed orders can be recalled (current: ${order.status})`,
        },
        { status: 409 },
      );
    }

    const updated = await updateOrder(orderId, { status: "ready" });
    if (!updated) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    await appendAuditLog({
      actor: user.email || user.id,
      action: "orders.recall",
      entityType: "order",
      entityId: orderId,
      before: { status: "completed" },
      after: { status: "ready" },
    });

    return NextResponse.json(updated);
  },
);
