import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  orderDeleteSchema,
  orderStatusChangeSchema,
  parseBody,
} from "@/lib/api-schemas";
import { appendAuditLog, getOrders, updateOrderStatus, deleteOrder, ORDERS_BOARD_LIMIT } from "@/lib/store";

export const GET = withAdmin(
  { locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    // Simulated records are stripped by default; ?includeSimulated=1 is a
    // reserved opt-in for future simulation tooling (no current consumer —
    // the KDS order simulator was removed).
    const includeSimulated = req.nextUrl.searchParams.get("includeSimulated") === "1";
    // Cap to the most-recent orders by default so a deep-history dataset never
    // serializes 16k rows / many MB to the browser (the board only shows recent
    // activity, newest first). `?all=1` bypasses for export-style needs;
    // `?limit=N` overrides. The store returns newest-first when a limit is set,
    // so the explicit sort is only needed on the uncapped path.
    const all = req.nextUrl.searchParams.get("all") === "1";
    const limitParam = Number(req.nextUrl.searchParams.get("limit"));
    const limit = all
      ? undefined
      : Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(limitParam, 2000)
        : ORDERS_BOARD_LIMIT;
    const orders = await getOrders(locationSlug ?? undefined, undefined, { includeSimulated, limit });
    if (limit === undefined) {
      orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
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
