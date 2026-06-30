import type { LoyaltyTierConfig, PublicSettingsDTO } from "@/api/types";

/**
 * Loyalty tier math — the native port of web `src/lib/loyalty.ts`. Thresholds,
 * multipliers and perks all come from the loaded programme config
 * (`/settings/public`), never hardcoded (loyalty.md rule #1).
 */

export type TierKey = "bronze" | "silver" | "gold" | "platinum";
export const TIER_ORDER: TierKey[] = ["bronze", "silver", "gold", "platinum"];

type Tiers = PublicSettingsDTO["loyalty"]["tiers"];

/** Highest tier whose threshold the customer's lifetime points have reached. */
export function calculateTier(points: number, tiers: Tiers): TierKey {
  let tier: TierKey = "bronze";
  for (const key of TIER_ORDER) {
    if (points >= tiers[key].threshold) tier = key;
  }
  return tier;
}

export function nextTierKey(current: TierKey): TierKey | null {
  const i = TIER_ORDER.indexOf(current);
  return i >= 0 && i < TIER_ORDER.length - 1 ? TIER_ORDER[i + 1] : null;
}

export interface TierProgress {
  current: TierKey;
  currentConfig: LoyaltyTierConfig;
  next: TierKey | null;
  nextConfig: LoyaltyTierConfig | null;
  toNext: number;
  /** 0–1 fill of the progress rail toward the next tier (1 at the top). */
  fraction: number;
}

export function tierProgress(points: number, tiers: Tiers): TierProgress {
  const current = calculateTier(points, tiers);
  const next = nextTierKey(current);
  const currentConfig = tiers[current];
  if (!next) {
    return { current, currentConfig, next: null, nextConfig: null, toNext: 0, fraction: 1 };
  }
  const nextConfig = tiers[next];
  const span = Math.max(1, nextConfig.threshold - currentConfig.threshold);
  const into = Math.max(0, points - currentConfig.threshold);
  return {
    current,
    currentConfig,
    next,
    nextConfig,
    toNext: Math.max(0, nextConfig.threshold - points),
    fraction: Math.min(1, into / span),
  };
}

/**
 * Points a cart subtotal would earn at the customer's current tier —
 * floor(złoty spent) × base rate × tier multiplier. Drives the cart's
 * "you'll earn N points" preview (checkout.md). Display-only; the server
 * is authoritative for the credited balance.
 */
export function earnPreview(
  subtotalGrosze: number,
  settings: PublicSettingsDTO | null,
  currentPoints: number,
): number {
  if (!settings) return Math.floor(subtotalGrosze / 100);
  const tier = calculateTier(currentPoints, settings.loyalty.tiers);
  const multiplier = settings.loyalty.tiers[tier].multiplier || 1;
  const base = settings.loyalty.pointsPerCurrencyUnit || 1;
  return Math.floor((subtotalGrosze / 100) * base * multiplier);
}
