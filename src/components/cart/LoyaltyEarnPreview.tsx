"use client";

import { useEffect, useState } from "react";
import { calculatePointsForOrder } from "@/lib/loyalty";
import { fetchPublicSettings, type PublicLoyaltySettings } from "@/lib/public-settings";
import { Star } from "lucide-react";

interface LoyaltyEarnPreviewProps {
  cartTotal: number; // in grosze
}

/**
 * "You'll earn N points" line shown inside the cart paybar foot. The
 * server is the source of truth for the points-earned number (it
 * resolves the customer's actual tier); this preview assumes bronze
 * and is intentionally cosmetic — it never gates anything. The
 * bronze multiplier is admin-editable in /core/guest/loyalty so the
 * preview tracks whatever earn rate the operator set.
 *
 * V8 styling lives on `.v8-cart-loyalty-preview` in
 * themes/homepage/index.css — italic Lora muted with a filled ochre
 * star + Cormorant 600 ochre-dark tabular point count.
 */
export function LoyaltyEarnPreview({ cartTotal }: LoyaltyEarnPreviewProps) {
  const [loyalty, setLoyalty] = useState<PublicLoyaltySettings | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchPublicSettings().then((s) => {
      if (!cancelled && s?.loyalty) setLoyalty(s.loyalty);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (cartTotal <= 0 || !loyalty) return null;

  const pointsToEarn = calculatePointsForOrder(cartTotal, "bronze", loyalty.tiers);
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
