import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { appendAuditLog, getOrderById, updateOrder } from "@/lib/store";

/**
 * Recall a bumped KDS ticket — the order the cook just hit "Bump · Done"
 * on by accident. Restores it to "ready" so it reappears on the expo column.
 *
 * Only `completed` orders are recallable; cancelled orders go through the
 * normal status pipeline to be revived (deliberately separate flow because
 * cancellation usually involves a refund / slot release).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: orderId } = await params;
  if (!orderId) {
    return NextResponse.json({ error: "Missing order id" }, { status: 400 });
  }

  const order = await getOrderById(orderId);
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
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
    actor: "admin",
    action: "orders.recall",
    entityType: "order",
    entityId: orderId,
    before: { status: "completed" },
    after: { status: "ready" },
  });

  return NextResponse.json(updated);
}
