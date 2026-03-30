"use client";

import { Trophy, Star, Gift, PartyPopper } from "lucide-react";

interface CustomerMilestoneProps {
  orderCount: number;
  customerName: string;
}

const MILESTONES: Record<number, { message: string; icon: React.ElementType; color: string }> = {
  1: { message: "Welcome to the Sud Italia family!", icon: Star, color: "text-italia-gold" },
  5: { message: "5 orders! You're becoming a regular!", icon: Trophy, color: "text-amber-500" },
  10: { message: "10 orders! You're a true fan! Here's a free dessert on us.", icon: Gift, color: "text-italia-red" },
  25: { message: "25 orders! You're a VIP! Enjoy a complimentary pizza.", icon: PartyPopper, color: "text-purple-500" },
  50: { message: "50 orders! You're legendary! Gold status unlocked.", icon: Trophy, color: "text-italia-gold" },
};

export function CustomerMilestone({ orderCount, customerName }: CustomerMilestoneProps) {
  const milestone = MILESTONES[orderCount];
  if (!milestone) return null;

  const Icon = milestone.icon;

  return (
    <div className="bg-gradient-to-r from-italia-gold/5 to-italia-red/5 rounded-2xl border border-italia-gold/20 p-5 text-center animate-bounce-in">
      <div className={`w-14 h-14 rounded-full bg-white shadow-sm flex items-center justify-center mx-auto mb-3 ${milestone.color}`}>
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="font-heading font-bold text-lg text-italia-dark mb-1">
        Congratulations, {customerName}!
      </h3>
      <p className="text-sm text-italia-gray">
        {milestone.message}
      </p>
      <p className="text-xs text-italia-gold-dark font-semibold mt-2">
        Order #{orderCount}
      </p>
    </div>
  );
}
