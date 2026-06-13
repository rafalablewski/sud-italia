// Client-side single-flight cache for /api/settings/public.
//
// Multiple top-bar components (CurrencySwitcher, LanguageSwitcher, the
// cart drawer's compliance read) all need the same public settings on
// mount. Without dedup, a single page load triggers three identical
// requests; this module gives them one shared promise.

import { ALL_CURRENCIES, setExchangeRates, type Currency } from "./currency";
import type { Locale } from "./i18n";

type Zone = "EU" | "NYC" | "SG";

export interface PublicLoyaltyTier {
  label: string;
  threshold: number;
  multiplier: number;
  perks: string[];
}

export interface PublicLoyaltyReward {
  id: string;
  name: string;
  pointsCost: number;
  description: string;
}

export interface PublicLoyaltyReferral {
  referrerPoints: number;
  refereeDiscountGrosze: number;
}

export interface PublicLoyaltySettings {
  tiers: {
    bronze: PublicLoyaltyTier;
    silver: PublicLoyaltyTier;
    gold: PublicLoyaltyTier;
    platinum: PublicLoyaltyTier;
  };
  rewards: PublicLoyaltyReward[];
  /** Null when the operator has the referral programme disabled —
   *  customer surfaces should hide the Give/Get card in that case. */
  referral: PublicLoyaltyReferral | null;
}

export interface PublicSettings {
  /** Loyalty programme config — tier ladder + active rewards. Sourced
   *  from `getLoyaltySettings()` on the server so admin edits land
   *  immediately on customer surfaces. */
  loyalty?: PublicLoyaltySettings;
  currency?: {
    defaultCurrency: Currency;
    enabledCurrencies: Currency[];
    rates: Record<Currency, number>;
  };
  locale?: {
    defaultLocale: Locale;
    enabledLocales: Locale[];
  };
  compliance?: {
    zone: Zone;
    dohGrade?: "A" | "B" | "C" | "Pending" | null;
    dohGradeIssued?: string | null;
    calorieDisclosureRequired?: boolean;
    halalCertId?: string | null;
    halalCertExpires?: string | null;
    gstRegistered?: boolean;
    gstNumber?: string | null;
    gstRateBps?: number;
    nutriGradeRequired?: boolean;
    packagingDisclosure?: string | null;
    pdpaConsentText?: string | null;
  };
  deliveryThresholds?: Record<string, number | undefined> | null;
  /** Operator-managed flat delivery fee (grosze) — see /admin/settings. */
  deliveryFee?: number;
  /** Global minimum order value (grosze) — see /admin/settings. The cart
   *  gates checkout against it client-side; createOrder enforces it server-side. */
  minOrderAmount?: number;
  /** Suggested tip percentages (fractions, e.g. [0.1,0.15,0.2]) for the cart. */
  tipPresets?: number[];
  /** Speed-guarantee SLA shown on the menu page ("X minutes guaranteed").
   *  Sourced from `LoyaltySettings.speedGuarantee` so the operator controls
   *  the promised minutes + copy — and can switch it OFF when the kitchen
   *  can't honour it, rather than the home page promising a number it can't
   *  keep. `active: false` hides the banner entirely. */
  speedGuarantee?: {
    active: boolean;
    maxMinutes: number;
    guaranteeText: string;
  };
  /** Operator-managed contact + social handles rendered in the
   *  public footer. */
  businessPhone?: string;
  businessEmail?: string;
  socialLinks?: {
    instagram: string;
    facebook: string;
    tiktok: string;
  };
  /** Storefront visibility toggles set via /admin/settings → Layout.
   *  Components (or the LayoutGate wrapper) read these and return null
   *  when the corresponding flag is `false`. */
  layout?: {
    showCurrencySwitcher: boolean;
    showLanguageSwitcher: boolean;
    showBundlesShowcase: boolean;
    showLoyaltySection: boolean;
    showSeasonalSpecials: boolean;
    showCartUpsell: boolean;
    showDeliveryProgress: boolean;
    showPushOptIn: boolean;
    showFeedbackSurvey: boolean;
    showNpsSurvey: boolean;
    showPostOrderUpsell: boolean;
    showChatWidget: boolean;
  };
  /** Live NPS-style Pulse surveys (active only) the storefront may
   *  surface. The client trigger engine reads these and matches one to a
   *  fired trigger. Empty / absent ⇒ nothing to show. Gated overall by
   *  `layout.showNpsSurvey`. */
  surveys?: PublicSurvey[];
}

export interface PublicSurvey {
  id: string;
  trigger:
    | "post-order"
    | "prolonged-browse"
    | "exit-intent"
    | "rewards-page"
    | "repeat-visit";
  question: string;
  subtext?: string;
  scaleLow: string;
  scaleHigh: string;
  commentPrompt: string;
  cooldownDays: number;
}

// One in-flight promise per location key. `null` location = origin-wide
// fetch (no ?location= param) which the cart drawer also calls when no
// location is set yet.
const inflight = new Map<string, Promise<PublicSettings | null>>();
const cached = new Map<string, PublicSettings>();

function cacheKey(locationSlug?: string | null): string {
  return locationSlug ?? "__origin__";
}

export function getCachedPublicSettings(
  locationSlug?: string | null,
): PublicSettings | undefined {
  return cached.get(cacheKey(locationSlug));
}

export async function fetchPublicSettings(
  locationSlug?: string | null,
  opts: { force?: boolean } = {},
): Promise<PublicSettings | null> {
  const key = cacheKey(locationSlug);
  if (!opts.force) {
    const hit = cached.get(key);
    if (hit) return hit;
    const pending = inflight.get(key);
    if (pending) return pending;
  }
  const url = locationSlug
    ? `/api/settings/public?location=${encodeURIComponent(locationSlug)}`
    : "/api/settings/public";
  const p = fetch(url, { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<PublicSettings>) : null))
    .then((data) => {
      if (data) {
        cached.set(key, data);
        // Hydrate the currency module's rate table the first time we see
        // the operator-set rates so every formatPrice() call returns the
        // configured number, not the build-time DEFAULT_RATES.
        if (data.currency?.rates) {
          const rates: Partial<Record<Currency, number>> = {};
          for (const c of ALL_CURRENCIES) {
            const v = data.currency.rates[c];
            if (typeof v === "number" && Number.isFinite(v) && v > 0) {
              rates[c] = v;
            }
          }
          setExchangeRates(rates);
        }
      }
      inflight.delete(key);
      return data;
    })
    .catch(() => {
      inflight.delete(key);
      return null;
    });
  inflight.set(key, p);
  return p;
}
