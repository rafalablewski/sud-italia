import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  getOrders,
  createOrder,
  updateOrder,
  getPosTab,
  linkPosTabOrder,
  deletePosTab,
  getUpsellSettings,
} from "@/lib/store";
import { getMenuWithOverrides } from "@/data/menus";
import { getActiveComboDeals } from "@/lib/upsell";
import type { CartItem, FulfillmentType, Order, PosTab } from "@/data/types";

/**
 * POS order actuator. The counter-side bridge between an open check (a PosTab)
 * and a real Order:
 *
 *   GET   → this location's live (active) orders, for any board that wants them.
 *   POST  → "Send to KDS": build the order from the persisted tab + the real
 *           menu (prices/discount resolved server-side, never client-supplied)
 *           and fire it onto the Kitchen Display. Idempotent per tab — a tab
 *           already linked to an order re-syncs that order instead of creating
 *           a duplicate ticket.
 *   PATCH → "Charge": ensure the order exists, mark it paid, and close the tab.
 *
 * Both write paths read the tab from the store as the source of truth, so the
 * till can only point at a tab id — it can't dictate items, prices or totals.
 * Notifications are suppressed (the guest is at the window) and the sale is
 * tied to a synthetic same-day "walk-in" slot (counter sales aren't pre-booked
 * time slots). Staff+, location-scoped.
 */

const ACTIVE = new Set(["confirmed", "preparing", "ready"]);

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Resolve a tab's lines against the real menu and price them server-side,
 *  applying any fully-satisfied combo discount for the tab's channel. */
async function buildOrderShape(
  tab: PosTab,
  locationSlug: string,
): Promise<
  | { error: string; status: number }
  | { items: CartItem[]; totalAmount: number; fulfillmentType: FulfillmentType }
> {
  if (!tab.channel) return { error: "Pick a channel first", status: 400 };
  if (tab.items.length === 0) return { error: "Tab has no items", status: 400 };
  if (tab.channel === "delivery" && !tab.address?.trim()) {
    return { error: "Add a delivery address first", status: 400 };
  }

  const menu = await getMenuWithOverrides(locationSlug);
  const byId = new Map(menu.map((m) => [m.id, m]));
  const items: CartItem[] = [];
  for (const li of tab.items) {
    const m = byId.get(li.menuItemId);
    const qty = Math.max(1, Math.min(99, Math.round(li.quantity)));
    if (!m) continue;
    items.push({ menuItem: m, quantity: qty, locationSlug });
  }
  if (items.length === 0) return { error: "No valid items for this menu", status: 400 };

  const itemsTotal = items.reduce((s, ci) => s + ci.menuItem.price * ci.quantity, 0);
  const config = (await getUpsellSettings())[locationSlug];
  const combo = getActiveComboDeals(items, config ?? null, tab.channel);
  const discount = combo.isComplete ? combo.savings : 0;

  return {
    items,
    fulfillmentType: tab.channel,
    totalAmount: Math.max(0, itemsTotal - discount),
  };
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

// Send a tab to the kitchen (create or re-sync its Order).
export const POST = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    if (!locationSlug) {
      return NextResponse.json({ error: "location required" }, { status: 400 });
    }
    const body = await req.json().catch(() => null);
    const tabId = body && typeof body.tabId === "string" ? body.tabId : "";
    if (!tabId) return NextResponse.json({ error: "tabId required" }, { status: 400 });

    const tab = await getPosTab(tabId);
    if (!tab || tab.locationSlug !== locationSlug) {
      return NextResponse.json({ error: "Tab not found" }, { status: 404 });
    }

    const shape = await buildOrderShape(tab, locationSlug);
    if ("error" in shape) {
      return NextResponse.json({ error: shape.error }, { status: shape.status });
    }

    const order = await persistTabOrder(tab, locationSlug, shape, false);
    await linkPosTabOrder(tab.id, { orderId: order.id, sentKds: true, status: "pay" });
    return NextResponse.json({ order, orderId: order.id });
  },
);

// Charge a tab: ensure the order exists, mark it paid, then close the tab.
export const PATCH = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    if (!locationSlug) {
      return NextResponse.json({ error: "location required" }, { status: 400 });
    }
    const body = await req.json().catch(() => null);
    const tabId = body && typeof body.tabId === "string" ? body.tabId : "";
    if (!tabId) return NextResponse.json({ error: "tabId required" }, { status: 400 });

    const tab = await getPosTab(tabId);
    if (!tab || tab.locationSlug !== locationSlug) {
      return NextResponse.json({ error: "Tab not found" }, { status: 404 });
    }

    const shape = await buildOrderShape(tab, locationSlug);
    if ("error" in shape) {
      return NextResponse.json({ error: shape.error }, { status: shape.status });
    }

    const order = await persistTabOrder(tab, locationSlug, shape, true);
    await deletePosTab(tab.id);
    return NextResponse.json({ ok: true, orderId: order.id, totalAmount: order.totalAmount });
  },
);

/** Create the tab's Order, or re-sync the one it's already linked to. When
 *  `paid` is set the order is stamped paid (charge flow). */
async function persistTabOrder(
  tab: PosTab,
  locationSlug: string,
  shape: { items: CartItem[]; totalAmount: number; fulfillmentType: FulfillmentType },
  paid: boolean,
): Promise<Order> {
  const now = new Date();
  const partySize = tab.channel === "dine-in" ? tab.covers ?? 2 : undefined;
  const tableId = tab.channel === "dine-in" ? tab.tableId : undefined;
  const deliveryAddress = tab.channel === "delivery" ? tab.address : undefined;

  if (tab.orderId) {
    const patched = await updateOrder(tab.orderId, {
      items: shape.items,
      totalAmount: shape.totalAmount,
      fulfillmentType: shape.fulfillmentType,
      partySize,
      tableId,
      deliveryAddress,
      ...(paid ? { paidAt: now.toISOString() } : {}),
    });
    if (patched) return patched;
    // Linked order vanished (manual delete) — fall through to a fresh create.
  }

  const order: Order = {
    id: `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    locationSlug,
    items: shape.items,
    totalAmount: shape.totalAmount,
    status: "confirmed",
    customerName: tab.name?.trim() || "Walk-in",
    customerPhone: "",
    fulfillmentType: shape.fulfillmentType,
    partySize,
    tableId,
    deliveryAddress,
    slotId: "walkin",
    slotDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    slotTime: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    createdAt: now.toISOString(),
    paidAt: paid ? now.toISOString() : undefined,
  };
  return createOrder(order, { suppressNotifications: true });
}
