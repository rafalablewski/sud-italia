import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { appendAuditLog, getOrders, getStaff, assignOrderDriver, updateOrderStatus } from "@/lib/store";
import { STAFF_ROLE_GROUP } from "@/lib/staff-roles";
import type { Order } from "@/data/types";

/** Delivery-lifecycle statuses the dispatch board cares about (still in flight). */
const ACTIVE_DELIVERY: Order["status"][] = ["confirmed", "preparing", "ready", "assigned", "picked_up"];
/** Statuses a driver can be advanced to from the board. */
const ADVANCE: Order["status"][] = ["assigned", "picked_up", "delivered"];

/**
 * Delivery dispatch — the board's data + write API. GET returns the active
 * delivery orders + the location's drivers (staff in the "delivery" role
 * group). PUT assigns a driver and/or advances the delivery status. Reuses the
 * existing order store primitives (assignOrderDriver / updateOrderStatus), so
 * it adds no new persistence surface. See docs/design-system/core/modules/.
 */
export const GET = withAdmin({ locationParam: "location" }, async (_req, _ctx, { locationSlug }) => {
  const [orders, staff] = await Promise.all([getOrders(locationSlug ?? undefined), getStaff(locationSlug ?? undefined)]);
  const deliveries = orders
    .filter((o) => o.fulfillmentType === "delivery" && ACTIVE_DELIVERY.includes(o.status) && !o.simulated)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const drivers = staff
    .filter((s) => STAFF_ROLE_GROUP[s.role] === "delivery" && s.status === "active")
    .map((s) => ({ id: s.id, name: s.name, role: s.role }));
  return NextResponse.json({ orders: deliveries, drivers });
});

export const PUT = withAdmin(
  { roles: ["staff", "kitchen", "manager", "owner"] },
  async (req, _ctx, { user }) => {
    let body: { orderId?: string; driverId?: string | null; status?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const orderId = typeof body.orderId === "string" ? body.orderId : "";
    if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });

    let order: Order | null = null;

    // Assign / clear driver (driverId may be null to unassign).
    if ("driverId" in body) {
      const driverId = body.driverId == null ? null : String(body.driverId);
      order = await assignOrderDriver(orderId, driverId);
      if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
      await appendAuditLog({
        actor: user.email || user.id,
        action: "orders.assign_driver",
        entityType: "order",
        entityId: orderId,
        after: { assignedDriverId: driverId },
      });
    }

    // Advance delivery status.
    if (typeof body.status === "string") {
      if (!ADVANCE.includes(body.status as Order["status"])) {
        return NextResponse.json({ error: "Invalid delivery status" }, { status: 400 });
      }
      order = await updateOrderStatus(orderId, body.status as Order["status"]);
      if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
      await appendAuditLog({
        actor: user.email || user.id,
        action: "orders.status_change",
        entityType: "order",
        entityId: orderId,
        after: { status: body.status },
      });
    }

    if (!order) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    return NextResponse.json(order);
  },
);
