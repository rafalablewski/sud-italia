import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  orderDeleteSchema,
  orderStatusChangeSchema,
  parseBody,
} from "@/lib/api-schemas";
import { appendAuditLog, getOrders, updateOrderStatus, deleteOrder } from "@/lib/store";

export const GET = withAdmin(
  { locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    // Simulator tickets are opt-in (?includeSimulated=1) — only the Kitchen
    // Display board asks for them, so they surface on the KDS (clearly marked)
    // but never leak into the dashboard, Orders list or any report.
    const includeSimulated = req.nextUrl.searchParams.get("includeSimulated") === "1";
    const orders = await getOrders(locationSlug ?? undefined, undefined, { includeSimulated });
    orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return NextResponse.json(orders);
  },
);

export const PUT = withAdmin(
  { roles: ["staff", "kitchen", "manager", "owner"] },
  async (req, _ctx, { user }) => {
    const parsed = await parseBody(req, orderStatusChangeSchema);
    if ("error" in parsed) return parsed.error;
    const { orderId, status } = parsed.data;

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
  },
);

export const DELETE = withAdmin(
  { roles: ["manager", "owner"] },
  async (req, _ctx, { user }) => {
    const parsed = await parseBody(req, orderDeleteSchema);
    if ("error" in parsed) return parsed.error;
    const { orderId } = parsed.data;

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
  },
);
