import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { createOrder, deletePosTab, getPosTab, getUpsellSettings, updateOrder } from "@/lib/store";
import { getMenuWithOverrides } from "@/data/menus";
import { buildOrderFromTab, priceTab } from "@/lib/pos-tab-order";
import type { UpsellConfig } from "@/lib/upsell";

/**
 * Charge a tab. Marks the linked order paid (or fires + marks paid in one step
 * if the operator charges a check that was never sent to the KDS — the kitchen
 * still gets the ticket), then closes the tab off the rail. The total is
 * recomputed server-side so the charged amount always matches the priced check
 * with combo discounts applied. Staff+.
 */

const METHODS = new Set(["Cash", "Card"]);

export const POST = withAdmin<{ params: Promise<{ id: string }> }>(
  { roles: ["staff"], locationParam: "location" },
  async (req, { params }, { locationSlug }) => {
    const { id } = await params;
    const tab = await getPosTab(id);
    if (!tab) return NextResponse.json({ error: "Tab not found" }, { status: 404 });
    if (locationSlug && tab.locationSlug !== locationSlug) {
      return NextResponse.json({ error: "Tab belongs to another location" }, { status: 403 });
    }
    if (!tab.channel) {
      return NextResponse.json({ error: "Pick a channel before charging" }, { status: 400 });
    }
    if (tab.items.length === 0) {
      return NextResponse.json({ error: "Tab is empty" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const method = METHODS.has(body?.method) ? (body.method as string) : "Cash";

    const [menu, settings] = await Promise.all([
      getMenuWithOverrides(tab.locationSlug),
      getUpsellSettings(),
    ]);
    const config = (settings[tab.locationSlug] ?? null) as UpsellConfig | null;
    const priced = priceTab(tab, menu, config);
    if (priced.cartItems.length === 0) {
      return NextResponse.json({ error: "No valid items for this menu" }, { status: 400 });
    }

    const now = new Date().toISOString();
    let orderId = tab.orderId;
    if (tab.sentKds && tab.orderId) {
      await updateOrder(tab.orderId, {
        items: priced.cartItems,
        totalAmount: priced.total,
        paidAt: now,
      });
    } else {
      const order = buildOrderFromTab(tab, priced, { paid: true });
      const saved = await createOrder(order, { suppressNotifications: true });
      orderId = saved.id;
    }

    await deletePosTab(tab.id);
    return NextResponse.json({ ok: true, orderId, total: priced.total, method });
  },
);
