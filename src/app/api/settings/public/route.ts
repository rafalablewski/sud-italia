import { NextRequest, NextResponse } from "next/server";
import { isCartPresenceEnabled } from "@/lib/cart-presence-config";
import { getLoyaltySettings, LIVE_WIDGET_LIMIT } from "@/lib/store";

// Public endpoint — returns only non-sensitive settings needed by the frontend
export async function GET(req: NextRequest) {
  const settings = await getLoyaltySettings();
  const location = req.nextUrl.searchParams.get("location");

  // Filter seasonal items by location if specified
  const seasonalItems = settings.seasonalItems
    .filter((item) => item.active && new Date(item.availableUntil) >= new Date())
    .filter((item) => !location || !item.locationSlug || item.locationSlug === location);

  const liveWidgets = settings.liveWidgets
    .filter((w) => w.active)
    .filter((w) => {
      if (!location) return true;
      const slugs = w.locationSlugs;
      return !slugs || slugs.length === 0 || slugs.includes(location);
    })
    .slice()
    .sort((a, b) => a.order - b.order)
    .slice(0, LIVE_WIDGET_LIMIT);

  return NextResponse.json({
    /** Server runtime flag so browsers post snapshots even if NEXT_PUBLIC was missing at build time. */
    cartPresenceEnabled: isCartPresenceEnabled(),
    liveWidgets,
    speedGuarantee: {
      active: settings.speedGuarantee.active,
      maxMinutes: settings.speedGuarantee.maxMinutes,
      guaranteeText: settings.speedGuarantee.guaranteeText,
    },
    abandonedCart: {
      active: settings.abandonedCart.active,
      delaySeconds: settings.abandonedCart.delaySeconds,
      message: settings.abandonedCart.message,
    },
    seasonalItems: seasonalItems.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      category: item.category,
      price: item.price,
      availableUntil: item.availableUntil,
      badge: item.badge,
    })),
  });
}
