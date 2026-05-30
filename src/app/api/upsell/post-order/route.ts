import { NextRequest, NextResponse } from "next/server";
import { getOrderById, getUpsellSettings } from "@/lib/store";
import { getMenuWithOverrides } from "@/data/menus";
import { getCartSuggestions } from "@/lib/upsell";

/**
 * Post-order "complete your meal" suggestions for the confirmation page
 * (Appendix A — "Post-order upsell on confirmation").
 *
 * Runs the same getCartSuggestions() engine the cart drawer + add-to-cart
 * toast use, seeded with the items the customer actually ordered, against the
 * live location menu (with overrides) and the admin-tuned upsell config. Items
 * already in the order are filtered out so the panel is purely additive — a
 * fast follow-on order, not a re-pitch of what they just bought.
 *
 * Public route (customer-facing): returns only menu items + reason copy, no
 * order PII. The orderId is used solely to derive the location and the prior
 * cart for relevance.
 */
export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get("orderId");
  if (!orderId) {
    return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
  }

  const order = await getOrderById(orderId);
  if (!order) {
    // Don't leak existence — an empty suggestion set renders nothing.
    return NextResponse.json({ suggestions: [] });
  }

  const locationSlug = order.locationSlug;
  const [menu, upsell] = await Promise.all([
    getMenuWithOverrides(locationSlug),
    getUpsellSettings(),
  ]);
  const cfg = upsell[locationSlug] || null;

  const orderedIds = new Set(order.items.map((ci) => ci.menuItem.id));

  const suggestions = getCartSuggestions(order.items, menu, 6, cfg)
    // Additive only — drop anything the customer already has on this order.
    .filter((s) => !orderedIds.has(s.item.id))
    .slice(0, 4)
    .map((s) => ({ item: s.item, reason: s.reason }));

  return NextResponse.json({ locationSlug, suggestions });
}
