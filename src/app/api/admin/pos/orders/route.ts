import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getOrders, createOrder } from "@/lib/store";
import { getMenuWithOverrides } from "@/data/menus";
import type { CartItem, FulfillmentType, Order } from "@/data/types";

/**
 * POS order entry. The counter-side actuator: GET returns the location's live
 * (active) orders so the POS can show open checks; POST takes a new order from
 * the till and persists it through createOrder — so it lands on the KDS and in
 * the Orders list like any real order, but with notifications suppressed (the
 * guest is at the window) and tied to a synthetic walk-in slot (POS sales are
 * not pre-booked time slots). Staff+, location-scoped.
 */

const ACTIVE = new Set(["confirmed", "preparing", "ready"]);
const FULFILLMENTS: FulfillmentType[] = ["takeout", "delivery", "dine-in"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export const GET = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const orders = await getOrders(locationSlug ?? undefined, todayStart.toISOString());
    const active = orders
      .filter((o) => ACTIVE.has(o.status))
      .map((o) => ({
        id: o.id,
        status: o.status,
        fulfillmentType: o.fulfillmentType,
        customerName: o.customerName,
        partySize: o.partySize,
        tableId: o.tableId,
        totalAmount: o.totalAmount,
        itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
        createdAt: o.createdAt,
      }));
    return NextResponse.json({ orders: active });
  },
);

export const POST = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    if (!locationSlug) {
      return NextResponse.json({ error: "location required" }, { status: 400 });
    }
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    const fulfillmentType: FulfillmentType = FULFILLMENTS.includes(body.fulfillmentType)
      ? body.fulfillmentType
      : "takeout";

    const rawItems: Array<{ menuItemId?: string; quantity?: number }> = Array.isArray(body.items)
      ? body.items
      : [];
    if (rawItems.length === 0) {
      return NextResponse.json({ error: "Order has no items" }, { status: 400 });
    }

    // Resolve item ids against this location's real menu (no client-supplied prices).
    const menu = await getMenuWithOverrides(locationSlug);
    const byId = new Map(menu.map((m) => [m.id, m]));
    const items: CartItem[] = [];
    for (const li of rawItems) {
      const m = li.menuItemId ? byId.get(li.menuItemId) : undefined;
      const qty = Math.max(1, Math.min(99, Math.round(Number(li.quantity) || 0)));
      if (!m || qty < 1) continue;
      items.push({ menuItem: m, quantity: qty, locationSlug });
    }
    if (items.length === 0) {
      return NextResponse.json({ error: "No valid items for this menu" }, { status: 400 });
    }

    const itemsTotal = items.reduce((s, ci) => s + ci.menuItem.price * ci.quantity, 0);
    const tip = Number.isFinite(Number(body.tipAmount)) ? Math.max(0, Math.round(Number(body.tipAmount))) : 0;

    const partySize =
      fulfillmentType === "dine-in" && Number.isFinite(Number(body.partySize))
        ? Math.max(1, Math.min(50, Math.round(Number(body.partySize))))
        : undefined;
    const tableId = fulfillmentType === "dine-in" && body.tableId ? String(body.tableId) : undefined;

    const now = new Date();
    const order: Order = {
      id: `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      locationSlug,
      items,
      totalAmount: itemsTotal + tip,
      status: "confirmed", // counter sale is confirmed on the spot → active on the KDS
      customerName: body.customerName ? String(body.customerName).trim() : "Walk-in",
      customerPhone: body.customerPhone ? String(body.customerPhone).trim() : "",
      fulfillmentType,
      partySize,
      tableId,
      specialInstructions: body.notes ? String(body.notes).trim() : undefined,
      // POS sales aren't pre-booked: a synthetic same-day "walk-in" slot keeps
      // the required slot fields populated without touching slot capacity.
      slotId: "walkin",
      slotDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      slotTime: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
      createdAt: now.toISOString(),
      paidAt: body.paid === true ? now.toISOString() : undefined,
      tipAmount: tip > 0 ? tip : undefined,
    };

    const saved = await createOrder(order, { suppressNotifications: true });
    return NextResponse.json({ order: saved });
  },
);
