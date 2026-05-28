import { NextRequest, NextResponse } from "next/server";
import { isCartPresenceEnabled } from "@/lib/cart-presence-config";
import {
  DEFAULT_LAYOUT_SETTINGS,
  getLoyaltySettings,
  getSettings,
  LIVE_WIDGET_LIMIT,
  resolveLocationCompliance,
} from "@/lib/store";

// Public endpoint — returns only non-sensitive settings needed by the frontend
export async function GET(req: NextRequest) {
  const [settings, appSettings] = await Promise.all([
    getLoyaltySettings(),
    getSettings(),
  ]);
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
    /** Audit §3 — admin-tunable per-segment free-delivery thresholds.
     *  Cart drawer uses these so the displayed bar matches the actual
     *  charge calculated server-side. Undefined per-segment fields fall
     *  back to the SEGMENT_FREE_DELIVERY_THRESHOLD defaults at use. */
    deliveryThresholds: appSettings.deliveryThresholds ?? null,
    /** Customer display-currency config: switcher options + rates.
     *  The customer site hydrates the currency module from this so a
     *  switch from PLN → SGD reflects operator-set rates, not the
     *  build-time defaults. */
    currency: appSettings.currency,
    /** Customer locale config: switcher options + default language. */
    locale: appSettings.locale,
    /** Per-location regulatory disclosure resolved for this request's
     *  `?location=` (when present). Customer surfaces use this to decide
     *  whether to render the NYC DOH grade banner, the SG Nutri-Grade
     *  badges, the GST line in the cart, the PDPA consent dialog, etc.
     *  Falls back to the global default zone when no slug is supplied. */
    compliance: location
      ? resolveLocationCompliance(appSettings.compliance, location)
      : { zone: appSettings.compliance?.defaultZone ?? "EU" },
    /** Storefront visibility toggles set in /admin/settings → Layout.
     *  Components like CurrencySwitcher read these and return null when
     *  the corresponding flag is false, so the surface loses its DOM
     *  and visible CSS without a code change. */
    layout: appSettings.layout ?? DEFAULT_LAYOUT_SETTINGS,
  });
}
