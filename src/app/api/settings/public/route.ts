import { NextRequest, NextResponse } from "next/server";
import { isCartPresenceEnabled } from "@/lib/cart-presence-config";
import {
  DEFAULT_LAYOUT_SETTINGS,
  getActiveSurveys,
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
  // Merge over the defaults so every flag is a guaranteed boolean even for
  // installs whose persisted layout predates a newer toggle (getSettings
  // doesn't inject DEFAULT_LAYOUT_SETTINGS into a saved partial).
  const layout = { ...DEFAULT_LAYOUT_SETTINGS, ...(appSettings.layout ?? {}) };
  // Only read + ship the Pulse catalogue when the feature is on, so the
  // kill-switch truly drops it out (no per-request read, no payload weight).
  const activeSurveys = layout.showNpsSurvey ? await getActiveSurveys() : [];
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
    /** Loyalty programme config — tier ladder + active rewards catalogue.
     *  Customer surfaces (the /rewards page, cart tier banners, the earn
     *  preview) read tier thresholds + multipliers + perks from here so
     *  the operator's edits in /admin/loyalty land immediately, not at
     *  the next deploy. Only `active: true` rewards are shipped.        */
    loyalty: {
      tiers: settings.tiers,
      rewards: settings.rewards.filter((r) => r.active).map((r) => ({
        id: r.id,
        name: r.name,
        pointsCost: r.pointsCost,
        description: r.description,
      })),
      /** Active referral mechanics — only shipped when the operator
       *  has the programme turned on, so customer surfaces render
       *  the Give/Get card from a single source of truth. */
      referral: settings.referral.active
        ? {
            referrerPoints: settings.referral.referrerPoints,
            refereeDiscountGrosze: settings.referral.refereeDiscountGrosze,
          }
        : null,
    },
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
    /** Flat delivery fee (grosze) — the charge applied when a cart is
     *  below the free-delivery threshold. Operator-edited at
     *  /admin/settings → Delivery fee; cart drawer passes it to
     *  computeDeliveryFee so the bar + the receipt agree. */
    deliveryFee: appSettings.deliveryFee,
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
    layout,
    /** Live NPS-style Pulse surveys (active only). The storefront trigger
     *  engine matches one to a fired signal (post-order, prolonged-browse,
     *  exit-intent, …). Only customer-facing copy is shipped — no operator
     *  internals. Overall on/off is `layout.showNpsSurvey`. */
    surveys: activeSurveys.map((s) => ({
      id: s.id,
      trigger: s.trigger,
      question: s.question,
      subtext: s.subtext,
      scaleLow: s.scaleLow,
      scaleHigh: s.scaleHigh,
      commentPrompt: s.commentPrompt,
      cooldownDays: s.cooldownDays,
    })),
    /** Operator-managed contact + social handles rendered in the
     *  public footer. Empty values let the footer hide the matching
     *  row / link without a code change. */
    businessPhone: appSettings.businessPhone,
    businessEmail: appSettings.businessEmail,
    socialLinks: appSettings.socialLinks,
  });
}
