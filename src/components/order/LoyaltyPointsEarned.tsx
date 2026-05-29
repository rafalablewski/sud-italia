"use client";

import { Star } from "lucide-react";

interface LoyaltyPointsEarnedProps {
  pointsEarned: number;
  totalPoints: number;
  tierName: string;
}

/**
 * V8 "+N points earned" ochre paper card shown on the
 * order-confirmation page after a successful checkout. The number is
 * computed client-side from the order total (1 pt / PLN) for display
 * only — the server credits the canonical balance off the actual
 * receipt.
 */
export function LoyaltyPointsEarned({
  pointsEarned,
  totalPoints,
  tierName,
}: LoyaltyPointsEarnedProps) {
  return (
    <div className="v8-order-loyalty">
      <div className="v8-order-loyalty-row">
        <Star className="h-6 w-6" fill="currentColor" aria-hidden />
        <span className="v8-order-loyalty-num">+{pointsEarned}</span>
        <span className="v8-order-loyalty-suffix">
          points earned <em>· punti guadagnati</em>
        </span>
      </div>
      <div className="v8-order-loyalty-balance">
        Balance: <strong>{totalPoints}</strong> pts ·{" "}
        <span className="v8-order-loyalty-tier">{tierName}</span>
      </div>
      <div className="v8-order-loyalty-foot">
        Credited to the phone number on this order — same number, same balance.
      </div>
    </div>
  );
}
