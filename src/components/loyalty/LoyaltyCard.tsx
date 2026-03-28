"use client";

import { useState } from "react";
import {
  LoyaltyAccount,
  TIER_CONFIG,
  REWARDS,
  calculateTier,
  pointsToNextTier,
  getNextTier,
} from "@/lib/loyalty";
import {
  Star,
  Gift,
  Trophy,
  ChevronRight,
  Sparkles,
  Lock,
} from "lucide-react";

interface LoyaltyCardProps {
  account: LoyaltyAccount | null;
  onLookup: (phone: string) => void;
}

export function LoyaltyCard({ account, onLookup }: LoyaltyCardProps) {
  const [phone, setPhone] = useState("");
  const [showRewards, setShowRewards] = useState(false);

  if (!account) {
    return (
      <div className="bg-gradient-to-br from-italia-gold/5 to-italia-red/5 rounded-2xl border border-italia-gold/20 p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-italia-gold/15 flex items-center justify-center">
            <Star className="h-5 w-5 text-italia-gold" />
          </div>
          <div>
            <h3 className="font-heading font-semibold text-italia-dark">
              Sud Italia Rewards
            </h3>
            <p className="text-xs text-italia-gray">
              Earn points with every order
            </p>
          </div>
        </div>
        <p className="text-sm text-italia-gray mb-3">
          Enter your phone number to check your points balance or join our
          loyalty program.
        </p>
        <div className="flex gap-2">
          <input
            type="tel"
            placeholder="Phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="pub-input flex-1 min-h-[44px]"
          />
          <button
            onClick={() => onLookup(phone)}
            className="px-4 py-2 bg-italia-gold text-white font-semibold rounded-xl hover:bg-italia-gold-dark transition-colors text-sm"
          >
            Look Up
          </button>
        </div>
      </div>
    );
  }

  const tier = calculateTier(account.points);
  const tierConfig = TIER_CONFIG[tier];
  const nextTier = getNextTier(tier);
  const toNext = pointsToNextTier(account.points, tier);

  return (
    <div className="bg-gradient-to-br from-italia-dark to-[#2a1a0a] rounded-2xl p-5 text-white overflow-hidden relative">
      {/* Decorative */}
      <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-italia-gold/10 blur-2xl" />

      {/* Header */}
      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-italia-gold/20 flex items-center justify-center">
            <Trophy className="h-5 w-5 text-italia-gold" />
          </div>
          <div>
            <p className="text-xs text-white/60 uppercase tracking-wide">
              Sud Italia Rewards
            </p>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${tierConfig.color}`}
            >
              <Sparkles className="h-3 w-3" />
              {tierConfig.label}
            </span>
          </div>
        </div>
      </div>

      {/* Points */}
      <div className="mb-4 relative z-10">
        <p className="text-3xl font-heading font-bold text-italia-gold">
          {account.points.toLocaleString()}
        </p>
        <p className="text-sm text-white/60">points earned</p>
      </div>

      {/* Progress to next tier */}
      {nextTier && (
        <div className="mb-4 relative z-10">
          <div className="flex items-center justify-between text-xs text-white/50 mb-1">
            <span>{tierConfig.label}</span>
            <span>
              {toNext} pts to {TIER_CONFIG[nextTier].label}
            </span>
          </div>
          <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-italia-gold to-italia-red rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(
                  ((account.points - (tier === "bronze" ? 0 : tier === "silver" ? 500 : 1500)) /
                    toNext) *
                    100,
                  100
                )}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4 relative z-10">
        <div className="bg-white/5 rounded-xl p-3">
          <p className="text-lg font-bold">{account.ordersCount}</p>
          <p className="text-xs text-white/50">Orders</p>
        </div>
        <div className="bg-white/5 rounded-xl p-3">
          <p className="text-lg font-bold">{tierConfig.multiplier}x</p>
          <p className="text-xs text-white/50">Points multiplier</p>
        </div>
      </div>

      {/* Rewards toggle */}
      <button
        onClick={() => setShowRewards(!showRewards)}
        className="w-full flex items-center justify-between p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors relative z-10"
      >
        <div className="flex items-center gap-2">
          <Gift className="h-4 w-4 text-italia-gold" />
          <span className="text-sm font-medium">Available Rewards</span>
        </div>
        <ChevronRight
          className={`h-4 w-4 text-white/50 transition-transform ${
            showRewards ? "rotate-90" : ""
          }`}
        />
      </button>

      {showRewards && (
        <div className="mt-3 space-y-2 relative z-10">
          {REWARDS.map((reward) => {
            const canRedeem = account.points >= reward.pointsCost;
            return (
              <div
                key={reward.id}
                className={`flex items-center justify-between p-3 rounded-xl ${
                  canRedeem
                    ? "bg-italia-gold/10 border border-italia-gold/20"
                    : "bg-white/5 opacity-60"
                }`}
              >
                <div>
                  <p className="text-sm font-semibold">{reward.name}</p>
                  <p className="text-xs text-white/50">{reward.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-italia-gold">
                    {reward.pointsCost} pts
                  </span>
                  {canRedeem ? (
                    <button className="px-3 py-1 bg-italia-gold text-white text-xs font-bold rounded-lg hover:bg-italia-gold-dark transition-colors">
                      Redeem
                    </button>
                  ) : (
                    <Lock className="h-4 w-4 text-white/30" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
