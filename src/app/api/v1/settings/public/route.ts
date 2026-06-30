import { apiOk, apiError } from "@/lib/api/v1/envelope";
import type { PublicSettingsDTO } from "@/lib/api/v1/schemas";
import { getLoyaltySettings, getSettings } from "@/lib/store";
import { DEFAULT_COMBO_DEALS, FREE_DELIVERY_THRESHOLD } from "@/lib/upsell";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/settings/public` — the customer app's single programme-config
 * read. The native twin of the web `/api/settings/public`, pared to exactly
 * what the storefront surfaces need and nothing operator-internal:
 *
 *  - **loyalty** — the tier ladder (label/threshold/multiplier/perks), the
 *    active rewards catalogue, and the give-get referral mechanics. Drives the
 *    Rewards screen's tier roadmap, rewards grid + referral card so an operator
 *    edit in `/core/guest/loyalty` lands with no App Store release.
 *  - **combos** — the auto-applied combo ladder (`DEFAULT_COMBO_DEALS`, the
 *    same source the web menu reads) so the cart's combo banner discounts the
 *    real total (Rule #8), not just a badge.
 *  - **speedGuarantee / delivery / minOrder / tipPresets** — the menu's speed
 *    banner + the cart's delivery, tip and min-order math.
 *
 * Public (no auth) — Rule #6 zero-friction. Programme config only (Rule #1):
 * every value is read from the same store the operator writes to.
 */
export async function GET() {
  try {
    const [loyalty, app] = await Promise.all([getLoyaltySettings(), getSettings()]);

    const dto: PublicSettingsDTO = {
      loyalty: {
        // Canonical earn rate (CLAUDE: "1 pt per PLN"); the tier multiplier
        // layers on top. The app shows "× multiplier at {tier}" off `tiers`.
        pointsPerCurrencyUnit: 1,
        tiers: loyalty.tiers,
        rewards: loyalty.rewards
          .filter((r) => r.active)
          .map((r) => ({
            id: r.id,
            name: r.name,
            pointsCost: r.pointsCost,
            description: r.description,
          })),
        referral: loyalty.referral.active
          ? {
              referrerPoints: loyalty.referral.referrerPoints,
              refereeDiscountGrosze: loyalty.referral.refereeDiscountGrosze,
            }
          : null,
      },
      combos: DEFAULT_COMBO_DEALS.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        categories: c.categories,
        discountPercent: c.discountPercent,
        minItems: c.minItems,
        requiredItems: (c.requiredItems ?? []).map((r) => ({ suffix: r.suffix, label: r.label })),
      })),
      speedGuarantee: {
        active: loyalty.speedGuarantee.active,
        maxMinutes: loyalty.speedGuarantee.maxMinutes,
        guaranteeText: loyalty.speedGuarantee.guaranteeText,
      },
      delivery: {
        fee: app.deliveryFee,
        freeThresholdGrosze: FREE_DELIVERY_THRESHOLD,
      },
      minOrderGrosze: app.minOrderAmount,
      tipPresets: Array.isArray(app.tipPresets) ? app.tipPresets : [],
    };
    return apiOk(dto);
  } catch (err) {
    logger.error("v1 public settings failed", { layer: "api.v1.settings" }, err as Error);
    return apiError("internal", "Could not load settings");
  }
}
