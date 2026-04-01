"use client";

import { calculatePointsForOrder } from "@/lib/loyalty";
import { Star } from "lucide-react";

interface LoyaltyEarnPreviewProps {
  cartTotal: number; // in grosze
}

export function LoyaltyEarnPreview({ cartTotal }: LoyaltyEarnPreviewProps) {
  if (cartTotal <= 0) return null;

  // Assume bronze tier for preview (1x multiplier) — actual tier calculated server-side
  const pointsToEarn = calculatePointsForOrder(cartTotal, "bronze");

  if (pointsToEarn <= 0) return null;

  return (
    <div className="flex items-center justify-start gap-2 py-0.5">
      <Star className="h-3.5 w-3.5 text-italia-gold fill-italia-gold flex-shrink-0" />
      <p className="text-xs text-italia-gray">
        You&apos;ll earn{" "}
        <span className="font-bold text-italia-gold-dark">{pointsToEarn} points</span>
        {" "}with this order
      </p>
    </div>
  );
}
