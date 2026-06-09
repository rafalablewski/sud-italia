import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { appendAuditLog, getOrders, getTables, updateOrder } from "@/lib/store";

const ACTIVE = new Set(["pending", "confirmed", "preparing", "ready"]);

// Live orders for the Service → Floor board: today's active orders for the
// location, tagged with their table, channel (web / whatsapp / qr / pos) and
// paid/unpaid status, plus a line summary — so the floor can show what each
// table owes and which QR orders still need paying, and an order lookup.
export const GET = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [orders, tables] = await Promise.all([
      getOrders(locationSlug ?? undefined, todayStart.toISOString()),
      getTables(locationSlug ?? undefined),
    ]);
    const tableNumber = new Map(tables.map((t) => [t.id, t.number]));
    const rows = orders
      .filter((o) => ACTIVE.has(o.status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((o) => ({
        id: o.id,
        status: o.status,
        paid: !!o.paidAt,
        channel: o.channel ?? "web",
        fulfillmentType: o.fulfillmentType,
        customerName: o.customerName,
        partySize: o.partySize ?? null,
        tableId: o.tableId ?? null,
        tableNumber: o.tableId ? tableNumber.get(o.tableId) ?? null : null,
        totalAmount: o.totalAmount,
        itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
        lines: o.items.map((i) => ({ name: i.menuItem.name, quantity: i.quantity })),
        createdAt: o.createdAt,
      }));
    return NextResponse.json({ orders: rows });
  },
);

// Settle an order from the floor — mark it paid, and fire a still-pending one
// to the kitchen. Idempotent.
export const POST = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (req, _ctx, { locationSlug, user }) => {
    const body = (await req.json().catch(() => null)) as { orderId?: string; action?: string } | null;
    const orderId = typeof body?.orderId === "string" ? body.orderId : null;
    if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });
    if (body?.action !== "settle") return NextResponse.json({ error: "unknown action" }, { status: 400 });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const orders = await getOrders(locationSlug ?? undefined, todayStart.toISOString());
    const order = orders.find((o) => o.id === orderId);
    if (!order) return NextResponse.json({ error: "Order not found at this location" }, { status: 404 });

    const updated = await updateOrder(orderId, {
      paidAt: order.paidAt ?? new Date().toISOString(),
      status: order.status === "pending" ? "confirmed" : order.status,
    });
    if (!updated) return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
    await appendAuditLog({
      actor: user.email || user.id,
      action: "floor.order_settle",
      entityType: "order",
      entityId: orderId,
      after: { paidAt: updated.paidAt, status: updated.status },
    });
    return NextResponse.json({ ok: true, order: { id: orderId, paid: !!updated.paidAt, status: updated.status } });
  },
);
