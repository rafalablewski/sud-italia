// Loyalty program engine
// 1 PLN spent = 1 point, 100 points = 10 PLN voucher

export interface LoyaltyAccount {
  phone: string;
  points: number;
  totalSpent: number; // in grosze
  ordersCount: number;
  tier: LoyaltyTier;
  joinedAt: string;
}

export type LoyaltyTier = "bronze" | "silver" | "gold" | "platinum";

export const TIER_THRESHOLDS: Record<LoyaltyTier, number> = {
  bronze: 0,
  silver: 500,
  gold: 1500,
  platinum: 5000,
};

export const TIER_CONFIG: Record<
  LoyaltyTier,
  { label: string; color: string; multiplier: number; perks: string[] }
> = {
  bronze: {
    label: "Bronze",
    color: "bg-amber-700/10 text-amber-700",
    multiplier: 1,
    perks: ["1 point per 1 PLN spent"],
  },
  silver: {
    label: "Silver",
    color: "bg-gray-400/15 text-gray-600",
    multiplier: 1.5,
    perks: ["1.5x points multiplier", "Free birthday dessert"],
  },
  gold: {
    label: "Gold",
    color: "bg-italia-gold/15 text-italia-gold-dark",
    multiplier: 2,
    perks: ["2x points multiplier", "Priority ordering", "Free delivery"],
  },
  platinum: {
    label: "Platinum",
    color: "bg-purple-500/10 text-purple-600",
    multiplier: 3,
    perks: ["3x points multiplier", "Exclusive menu items", "VIP events"],
  },
};

export const REWARDS = [
  { id: "free-drink", name: "Free Drink", pointsCost: 50, description: "Any drink from the menu" },
  { id: "10-off", name: "10 PLN Off", pointsCost: 100, description: "Discount on your next order" },
  { id: "free-dessert", name: "Free Dessert", pointsCost: 120, description: "Any dessert from the menu" },
  { id: "free-pizza", name: "Free Pizza", pointsCost: 250, description: "Any pizza from the menu" },
  { id: "25-off", name: "25 PLN Off", pointsCost: 200, description: "Big discount on your next order" },
];

export function calculateTier(totalPoints: number): LoyaltyTier {
  if (totalPoints >= TIER_THRESHOLDS.platinum) return "platinum";
  if (totalPoints >= TIER_THRESHOLDS.gold) return "gold";
  if (totalPoints >= TIER_THRESHOLDS.silver) return "silver";
  return "bronze";
}

export function calculatePointsForOrder(amountInGrosze: number, tier: LoyaltyTier): number {
  const basePoints = Math.floor(amountInGrosze / 100); // 1 point per 1 PLN
  const multiplier = TIER_CONFIG[tier].multiplier;
  return Math.floor(basePoints * multiplier);
}

export function getNextTier(current: LoyaltyTier): LoyaltyTier | null {
  const tiers: LoyaltyTier[] = ["bronze", "silver", "gold", "platinum"];
  const idx = tiers.indexOf(current);
  return idx < tiers.length - 1 ? tiers[idx + 1] : null;
}

export function pointsToNextTier(totalPoints: number, current: LoyaltyTier): number {
  const next = getNextTier(current);
  if (!next) return 0;
  return Math.max(0, TIER_THRESHOLDS[next] - totalPoints);
}
