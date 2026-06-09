import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { appendAuditLog, getOrders, getTables, updateOrder } from "@/lib/store";

const ACTIVE = new Set(["pending", "confirmed", "preparing", "ready"]);

// QR table orders for the POS queue — the dine-in orders a seated guest
// placed by scanning the table QR (channel "qr"). Staff watch this to take
// payment and acknowledge orders the kitchen is already working.
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
    const qr = orders
      .filter((o) => o.channel === "qr" && ACTIVE.has(o.status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((o) => ({
        id: o.id,
        status: o.status,
        paid: !!o.paidAt,
        customerName: o.customerName,
        partySize: o.partySize ?? null,
        tableId: o.tableId ?? null,
        tableNumber: o.tableId ? tableNumber.get(o.tableId) ?? null : null,
        totalAmount: o.totalAmount,
        itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
        lines: o.items.map((i) => ({ name: i.menuItem.name, quantity: i.quantity })),
        createdAt: o.createdAt,
      }));
    return NextResponse.json({ orders: qr });
  },
);

// Settle a QR order: mark it paid (and fire it to the kitchen if it was
// still pending demo-mode payment). Idempotent — re-settling is a no-op.
export const POST = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (req, _ctx, { locationSlug, user }) => {
    const body = (await req.json().catch(() => null)) as { orderId?: string; action?: string } | null;
    const orderId = typeof body?.orderId === "string" ? body.orderId : null;
    if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const orders = await getOrders(locationSlug ?? undefined, todayStart.toISOString());
    const order = orders.find((o) => o.id === orderId);
    if (!order || order.channel !== "qr") {
      return NextResponse.json({ error: "QR order not found at this location" }, { status: 404 });
    }

    if (body?.action !== "settle") {
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }

    const updated = await updateOrder(orderId, {
      paidAt: order.paidAt ?? new Date().toISOString(),
      // A demo-mode QR order sits at "pending" until paid; settling fires it
      // to the kitchen. A Stripe-paid order is already confirmed — leave it.
      status: order.status === "pending" ? "confirmed" : order.status,
    });
    await appendAuditLog({
      actor: user.email || user.id,
      action: "pos.qr_settle",
      entityType: "order",
      entityId: orderId,
      after: { paidAt: updated?.paidAt, status: updated?.status },
    });
    return NextResponse.json({ ok: true, order: { id: orderId, paid: !!updated?.paidAt, status: updated?.status } });
  },
);
