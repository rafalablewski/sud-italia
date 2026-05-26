import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { createOrder, getPosTab, getUpsellSettings, savePosTab, updateOrder } from "@/lib/store";
import { getMenuWithOverrides } from "@/data/menus";
import { buildOrderFromTab, priceTab } from "@/lib/pos-tab-order";
import type { UpsellConfig } from "@/lib/upsell";

/**
 * Fire a tab to the Kitchen Display. Creates the real Order (suppressing guest
 * notifications — the customer is at the window) so the check lands on the KDS
 * and in the Orders list like any order, re-priced server-side with combo
 * discounts applied. Re-firing an edited tab patches the existing order rather
 * than duplicating the ticket. Marks the tab sent + ready-to-pay. Staff+.
 */
export const POST = withAdmin<{ params: Promise<{ id: string }> }>(
  { roles: ["staff"], locationParam: "location" },
  async (_req, { params }, { locationSlug }) => {
    const { id } = await params;
    const tab = await getPosTab(id);
    if (!tab) return NextResponse.json({ error: "Tab not found" }, { status: 404 });
    if (locationSlug && tab.locationSlug !== locationSlug) {
      return NextResponse.json({ error: "Tab belongs to another location" }, { status: 403 });
    }
    if (!tab.channel) {
      return NextResponse.json({ error: "Pick a channel before sending" }, { status: 400 });
    }
    if (tab.items.length === 0) {
      return NextResponse.json({ error: "Tab is empty" }, { status: 400 });
    }

    const [menu, settings] = await Promise.all([
      getMenuWithOverrides(tab.locationSlug),
      getUpsellSettings(),
    ]);
    const config = (settings[tab.locationSlug] ?? null) as UpsellConfig | null;
    const priced = priceTab(tab, menu, config);
    if (priced.cartItems.length === 0) {
      return NextResponse.json({ error: "No valid items for this menu" }, { status: 400 });
    }

    let orderId = tab.orderId;
    if (tab.sentKds && tab.orderId) {
      const updated = await updateOrder(tab.orderId, {
        items: priced.cartItems,
        totalAmount: priced.total,
      });
      orderId = updated?.id ?? tab.orderId;
    } else {
      const order = buildOrderFromTab(tab, priced, { paid: false });
      const saved = await createOrder(order, { suppressNotifications: true });
      orderId = saved.id;
    }

    const savedTab = await savePosTab({
      id: tab.id,
      locationSlug: tab.locationSlug,
      name: tab.name,
      channel: tab.channel,
      status: tab.status === "open" ? "pay" : tab.status,
      items: tab.items,
      tableId: tab.tableId,
      covers: tab.covers,
      address: tab.address,
      sentKds: true,
      orderId,
    });
    return NextResponse.json({ tab: savedTab, orderId, total: priced.total });
  },
);
