import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, resolveLocationFilter, requireOperator } from "@/lib/api/v1/guard";
import { getOrders, getStaff, assignOrderDriver, updateOrderStatus } from "@/lib/store";
import { STAFF_ROLE_GROUP } from "@/lib/staff-roles";
import type { Order, OrderStatus } from "@/data/types";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Delivery-lifecycle statuses the dispatch board cares about (still in flight). */
const ACTIVE_DELIVERY: OrderStatus[] = ["confirmed", "preparing", "ready", "assigned", "picked_up"];
/** Statuses a driver can be advanced to from the board. */
const ADVANCE: OrderStatus[] = ["assigned", "picked_up", "delivered"];

/** Slim delivery-order row for the board (money in grosze — never re-priced client-side). */
interface DispatchOrderDTO {
  id: string;
  status: OrderStatus;
  customerName: string;
  deliveryAddress: string | null;
  totalGrosze: number;
  assignedDriverId: string | null;
  items: { name: string; quantity: number }[];
  createdAt: string;
}

interface DispatchDriverDTO {
  id: string;
  name: string;
  role: string;
}

interface DispatchBoardDTO {
  orders: DispatchOrderDTO[];
  drivers: DispatchDriverDTO[];
}

function toDispatchOrder(o: Order): DispatchOrderDTO {
  return {
    id: o.id,
    status: o.status,
    customerName: o.customerName,
    deliveryAddress: o.deliveryAddress ?? null,
    totalGrosze: o.totalAmount,
    assignedDriverId: o.assignedDriverId ?? null,
    items: (o.items ?? []).map((i) => ({ name: i.menuItem.name, quantity: i.quantity })),
    createdAt: o.createdAt,
  };
}

/**
 * `GET /api/v1/admin/dispatch?location=` — the delivery dispatch board: the
 * active (in-flight) delivery orders + the location's drivers (staff in the
 * "delivery" role group). Native twin of web `/api/admin/dispatch` (GET).
 * Staff+ (dispatch is a floor action); location-scoped. Reuses the order/staff
 * store primitives — no new persistence surface (Rule #1: real orders, no mock).
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;
  const filter = resolveLocationFilter(req, guard.claims.scope);
  if ("error" in filter) return filter.error;
  try {
    const [orders, staff] = await Promise.all([getOrders(), getStaff()]);
    const inScope = (slug: string) => filter.slugs === null || filter.slugs.includes(slug);
    const deliveries = orders
      .filter((o) => inScope(o.locationSlug) && o.fulfillmentType === "delivery" && ACTIVE_DELIVERY.includes(o.status) && !o.simulated)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map(toDispatchOrder);
    const drivers: DispatchDriverDTO[] = staff
      .filter((s) => inScope(s.locationSlug) && STAFF_ROLE_GROUP[s.role] === "delivery" && s.status === "active")
      .map((s) => ({ id: s.id, name: s.name, role: s.role }));
    const board: DispatchBoardDTO = { orders: deliveries, drivers };
    return apiOk(board, { orders: deliveries.length, drivers: drivers.length });
  } catch (err) {
    logger.error("v1 dispatch board failed", { layer: "api.v1.admin.dispatch" }, err as Error);
    return apiError("internal", "Could not load the dispatch board");
  }
}

/**
 * `PUT /api/v1/admin/dispatch` — assign / clear a driver and/or advance the
 * delivery status. Body `{ orderId, driverId?, status? }` (driverId null =
 * unassign; status in assigned|picked_up|delivered). Mirrors web
 * `/api/admin/dispatch` (PUT); reuses `assignOrderDriver` / `updateOrderStatus`.
 * Operator (any signed-in staff+) — dispatch advances happen at the pass.
 */
export async function PUT(req: NextRequest) {
  const guard = requireOperator(req);
  if ("error" in guard) return guard.error;
  let body: { orderId?: string; driverId?: string | null; status?: string };
  try { body = await req.json(); } catch { return apiError("bad_request", "Body must be valid JSON"); }
  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  if (!orderId) return apiError("validation_failed", "orderId is required");

  try {
    let order: Order | null = null;
    if ("driverId" in body) {
      const driverId = body.driverId == null ? null : String(body.driverId);
      order = await assignOrderDriver(orderId, driverId);
      if (!order) return apiError("not_found", "Order not found");
    }
    if (typeof body.status === "string") {
      if (!ADVANCE.includes(body.status as OrderStatus)) return apiError("validation_failed", "Invalid delivery status");
      order = await updateOrderStatus(orderId, body.status as OrderStatus);
      if (!order) return apiError("not_found", "Order not found");
    }
    if (!order) return apiError("validation_failed", "Nothing to update");
    return apiOk(toDispatchOrder(order));
  } catch (err) {
    logger.error("v1 dispatch update failed", { layer: "api.v1.admin.dispatch" }, err as Error);
    return apiError("internal", "Could not update the delivery");
  }
}
