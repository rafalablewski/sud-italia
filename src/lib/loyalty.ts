// Loyalty program engine.
//
// All programme config (tier thresholds, multipliers, perks, labels,
// rewards catalogue) lives in `LoyaltySettings` (see store.ts) and is
// served to the customer site via /api/settings/public so admin edits
// in /core/guest/loyalty land immediately. This module is the pure-compute
// layer — every helper takes the tier ladder as a parameter so it's
// trivially unit-testable + has no I/O.

import type { LoyaltySettings } from "@/lib/store";

export interface LoyaltyAccount {
  phone: string;
  points: number;
  totalSpent: number; // in grosze
  ordersCount: number;
  tier: LoyaltyTier;
  joinedAt: string;
}

export type LoyaltyTier = "bronze" | "silver" | "gold" | "platinum";

/** Bronze → Silver → Gold → Platinum. Order matters for getNextTier
 *  and for any reduce over the ladder. */
export const TIER_ORDER: LoyaltyTier[] = ["bronze", "silver", "gold", "platinum"];

/** Tier chrome — Tailwind utility tuples, theme-code per design-system
 *  decision (operators don't reskin the loyalty ladder). The label,
 *  thresholds, multiplier + perks ARE admin-editable; this is just
 *  the colour. */
export const TIER_COLORS: Record<LoyaltyTier, string> = {
  bronze: "bg-amber-700/10 text-amber-700",
  silver: "bg-gray-400/15 text-gray-600",
  gold: "bg-italia-gold/15 text-italia-gold-dark",
  platinum: "bg-purple-500/10 text-purple-600",
};

type Tiers = LoyaltySettings["tiers"];

export function calculateTier(totalPoints: number, tiers: Tiers): LoyaltyTier {
  if (totalPoints >= tiers.platinum.threshold) return "platinum";
  if (totalPoints >= tiers.gold.threshold) return "gold";
  if (totalPoints >= tiers.silver.threshold) return "silver";
  return "bronze";
}

export function calculatePointsForOrder(
  amountInGrosze: number,
  tier: LoyaltyTier,
  tiers: Tiers,
): number {
  const basePoints = Math.floor(amountInGrosze / 100); // 1 point per 1 PLN
  return Math.floor(basePoints * tiers[tier].multiplier);
}

export function getNextTier(current: LoyaltyTier): LoyaltyTier | null {
  const idx = TIER_ORDER.indexOf(current);
  return idx < TIER_ORDER.length - 1 ? TIER_ORDER[idx + 1] : null;
}

export function pointsToNextTier(
  totalPoints: number,
  current: LoyaltyTier,
  tiers: Tiers,
): number {
  const next = getNextTier(current);
  if (!next) return 0;
  return Math.max(0, tiers[next].threshold - totalPoints);
}
