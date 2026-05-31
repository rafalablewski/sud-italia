export type LoyaltyTier = "Bronze" | "Silver" | "Gold" | "Platinum";

/**
 * Loyalty tier from a lifetime points total. Single source of truth shared by
 * the CRM book, the customer rollup and the Guest inbox so a guest reads the
 * same tier everywhere. Thresholds mirror the loyalty programme bands.
 */
export function loyaltyTier(points: number): LoyaltyTier {
  if (points >= 5000) return "Platinum";
  if (points >= 1500) return "Gold";
  if (points >= 500) return "Silver";
  return "Bronze";
}
