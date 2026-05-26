import type { CartItem, MenuItem, Order, PosTab, FulfillmentType } from "@/data/types";
import { getActiveComboDeals, type UpsellConfig } from "@/lib/upsell";

/**
 * POS tab → Order bridge. A `PosTab` is the till's working check (only
 * menuItemId + quantity); this module is the single place that re-prices it
 * against the live menu and applies the one best qualifying combo discount —
 * the SAME engine the customer cart and checkout use (getActiveComboDeals) so
 * the operator and the guest never see a different total. The send-to-KDS and
 * charge routes both build the real Order from here, so the discount is
 * subtracted from the persisted total, not merely displayed.
 */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export interface PricedTab {
  cartItems: CartItem[];
  itemsTotal: number;
  comboName: string | null;
  comboSavings: number;
  total: number;
}

export function priceTab(
  tab: PosTab,
  menu: MenuItem[],
  config: UpsellConfig | null,
): PricedTab {
  const byId = new Map(menu.map((m) => [m.id, m]));
  const cartItems: CartItem[] = [];
  for (const li of tab.items) {
    const m = byId.get(li.menuItemId);
    const qty = Math.max(1, Math.min(99, Math.round(Number(li.quantity) || 0)));
    if (!m) continue;
    cartItems.push({ menuItem: m, quantity: qty, locationSlug: tab.locationSlug });
  }
  const itemsTotal = cartItems.reduce((s, ci) => s + ci.menuItem.price * ci.quantity, 0);
  const combo = getActiveComboDeals(cartItems, config, tab.channel ?? null);
  const comboSavings = combo.isComplete ? combo.savings : 0;
  return {
    cartItems,
    itemsTotal,
    comboName: comboSavings > 0 ? (combo.activeDeal?.name ?? null) : null,
    comboSavings,
    total: Math.max(0, itemsTotal - comboSavings),
  };
}

/** Build the real Order a tab becomes when fired to the KDS or charged.
 *  Counter sale → status "confirmed" (active on the KDS immediately), tied to
 *  a synthetic same-day walk-in slot (POS sales aren't pre-booked). */
export function buildOrderFromTab(tab: PosTab, priced: PricedTab, opts: { paid: boolean }): Order {
  const now = new Date();
  const channel: FulfillmentType = tab.channel ?? "takeout";
  return {
    id: `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    locationSlug: tab.locationSlug,
    items: priced.cartItems,
    totalAmount: priced.total,
    status: "confirmed",
    customerName: tab.name?.trim() || "Walk-in",
    customerPhone: "",
    fulfillmentType: channel,
    deliveryAddress: channel === "delivery" && tab.address ? tab.address.trim() : undefined,
    partySize: channel === "dine-in" ? (tab.covers ?? 2) : undefined,
    tableId: channel === "dine-in" ? tab.tableId : undefined,
    slotId: "walkin",
    slotDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    slotTime: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    createdAt: now.toISOString(),
    paidAt: opts.paid ? now.toISOString() : undefined,
  };
}
