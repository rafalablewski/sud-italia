"use client";

import { Star, Sparkles } from "lucide-react";

interface LoyaltyPointsEarnedProps {
  pointsEarned: number;
  totalPoints: number;
  tierName: string;
}

export function LoyaltyPointsEarned({
  pointsEarned,
  totalPoints,
  tierName,
}: LoyaltyPointsEarnedProps) {
  return (
    <div className="bg-gradient-to-r from-italia-gold/10 to-italia-red/5 rounded-2xl border border-italia-gold/20 p-4 text-center animate-slide-up">
      <div className="flex items-center justify-center gap-2 mb-1">
        <Star className="h-5 w-5 text-italia-gold fill-italia-gold" />
        <span className="text-2xl font-heading font-bold text-italia-gold-dark">
          +{pointsEarned}
        </span>
        <span className="text-sm font-medium text-italia-gray">points earned</span>
      </div>
      <p className="text-xs text-italia-gray">
        Total balance:{" "}
        <span className="font-semibold text-italia-dark">{totalPoints} pts</span>
        {" "}&middot;{" "}
        <span className="inline-flex items-center gap-0.5">
          <Sparkles className="h-3 w-3 text-italia-gold" />
          {tierName}
        </span>
      </p>
      <p className="text-[11px] text-italia-gray/70 mt-1">
        Credited to the phone number on this order — same number, same balance.
      </p>
    </div>
  );
}
