"use client";

import { calculatePointsForOrder } from "@/lib/loyalty";
import { Star } from "lucide-react";

interface LoyaltyEarnPreviewProps {
  cartTotal: number; // in grosze
}

/**
 * "You'll earn N points" line shown inside the cart paybar foot. The
 * server is the source of truth for the points-earned number (it
 * resolves the customer's actual tier); this preview assumes bronze
 * (1× multiplier) and is intentionally cosmetic — it never gates
 * anything.
 *
 * V8 styling lives on `.v8-cart-loyalty-preview` in
 * themes/homepage/index.css — italic Lora muted with a filled ochre
 * star + Cormorant 600 ochre-dark tabular point count.
 */
export function LoyaltyEarnPreview({ cartTotal }: LoyaltyEarnPreviewProps) {
  if (cartTotal <= 0) return null;

  const pointsToEarn = calculatePointsForOrder(cartTotal, "bronze");
  if (pointsToEarn <= 0) return null;

  return (
    <p className="v8-cart-loyalty-preview">
      <Star className="v8-cart-loyalty-preview-icon" fill="currentColor" aria-hidden />
      You&apos;ll earn{" "}
      <strong>
        <span className="num">{pointsToEarn}</span> points
      </strong>{" "}
      <span className="v8-cart-loyalty-preview-it">· {pointsToEarn} punti</span>
    </p>
  );
}
