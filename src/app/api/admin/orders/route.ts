import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { appendAuditLog, getOrders, updateOrderStatus, deleteOrder } from "@/lib/store";
import { Order } from "@/data/types";

export const GET = withAdmin(
  { locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    const orders = await getOrders(locationSlug ?? undefined);
    orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return NextResponse.json(orders);
  },
);

export const PUT = withAdmin(
  { roles: ["staff", "kitchen", "manager", "owner"] },
  async (req, _ctx, { user }) => {
    try {
      const { orderId, status } = await req.json();

      if (!orderId || !status) {
        return NextResponse.json({ error: "Missing orderId or status" }, { status: 400 });
      }

      const validStatuses: Order["status"][] = ["pending", "confirmed", "preparing", "ready", "completed", "cancelled"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }

      const order = await updateOrderStatus(orderId, status);
      if (!order) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }

      await appendAuditLog({
        actor: user.email || user.id,
        action: "orders.status_change",
        entityType: "order",
        entityId: orderId,
        after: { status },
      });

      return NextResponse.json(order);
    } catch {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  },
);

export const DELETE = withAdmin(
  { roles: ["manager", "owner"] },
  async (req, _ctx, { user }) => {
    try {
      const { orderId } = await req.json();

      if (!orderId || typeof orderId !== "string") {
        return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
      }

      const ok = await deleteOrder(orderId);
      if (!ok) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }

      await appendAuditLog({
        actor: user.email || user.id,
        action: "orders.delete",
        entityType: "order",
        entityId: orderId,
      });

      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  },
);
