"use client";

import { useState } from "react";
import { Container } from "@/components/ui/Container";
import { useCustomer } from "@/store/customer";
import {
  TIER_CONFIG,
  TIER_THRESHOLDS,
  REWARDS,
  LoyaltyTier,
  calculateTier,
  pointsToNextTier,
  getNextTier,
} from "@/lib/loyalty";
import {
  ACHIEVEMENTS,
  getActiveChallenges,
  generateReferralCode,
  REFERRAL_REWARD,
} from "@/lib/growth-engine";
import { COMBO_DEALS } from "@/lib/upsell";
import {
  Star,
  Trophy,
  Target,
  Gift,
  Share2,
  Copy,
  Check,
  Lock,
  Sparkles,
  Flame,
  ChevronRight,
  Crown,
  Ticket,
  Percent,
  Clock,
  LogIn,
  UserPlus,
  LogOut,
  User,
  Heart,
  Zap,
} from "lucide-react";

// Simulated earned achievements
const EARNED_IDS = new Set(["first-order", "early-bird"]);

function daysUntil(dateStr: string): number {
  return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000));
}

function SignInSection() {
  const { identify } = useCustomer();
  const [phone, setPhone] = useState("");
  const [checking, setChecking] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const getFullPhone = () => {
    const cleaned = phone.replace(/\D/g, "");
    return cleaned.startsWith("48") ? `+${cleaned}` : `+48${cleaned}`;
  };

  const handleSignIn = async () => {
    if (phone.replace(/\D/g, "").length < 7) return;
    setChecking(true);
    setNotFound(false);
    await identify(getFullPhone());
    setTimeout(() => setNotFound(true), 300);
    setChecking(false);
  };

  const handleSignUp = async () => {
    setChecking(true);
    await identify(getFullPhone(), true);
    setChecking(false);
  };

  return (
    <div className="max-w-md mx-auto text-center py-10">
      <div className="w-20 h-20 bg-italia-gold/10 rounded-full flex items-center justify-center mx-auto mb-6">
        <Star className="h-10 w-10 text-italia-gold" />
      </div>
      <h1 className="text-3xl font-heading font-bold text-italia-dark mb-2">
        Sud Italia Rewards
      </h1>
      <p className="text-italia-gray mb-8">
        Earn points, unlock rewards, and get exclusive offers. Enter your phone number to sign in or join for free.
      </p>

      <div className="flex gap-2 max-w-sm mx-auto mb-3">
        <div className="flex items-center gap-0 flex-1">
          <span className="inline-flex items-center px-3 min-h-[48px] rounded-l-xl border-y-[1.5px] border-l-[1.5px] border-r-0 border-[#e5e7eb] bg-gray-50 text-sm font-medium text-italia-gray select-none">
            +48
          </span>
          <input
            type="tel"
            placeholder="Phone number"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setNotFound(false); }}
            onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
            className="pub-input min-h-[48px] text-base rounded-l-none flex-1"
          />
        </div>
        <button
          onClick={handleSignIn}
          disabled={checking || phone.replace(/\D/g, "").length < 7}
          className="px-5 py-2 bg-italia-gold text-white font-semibold rounded-xl hover:bg-italia-gold-dark transition-colors text-sm min-h-[48px] flex items-center gap-2 disabled:opacity-40"
        >
          <LogIn className="h-4 w-4" />
          {checking ? "..." : "Sign in"}
        </button>
      </div>

      {notFound && (
        <div className="mt-4 p-4 bg-white rounded-2xl border border-gray-100 max-w-sm mx-auto animate-fade-in">
          <p className="text-sm text-italia-dark mb-3">
            New here? Join rewards — it&apos;s completely free!
          </p>
          <button
            onClick={handleSignUp}
            disabled={checking}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-italia-green text-white font-semibold rounded-xl hover:bg-italia-green-dark transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            Join Rewards Program
          </button>
        </div>
      )}

      <p className="text-xs text-italia-gray/60 mt-4">
        Just your phone number — no password, no email required
      </p>
    </div>
  );
}

function RewardsDashboard() {
  const { customer, logout } = useCustomer();
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "rewards" | "achievements" | "offers">("overview");

  if (!customer) return null;

  const tier = calculateTier(customer.points);
  const tierConfig = TIER_CONFIG[tier];
  const nextTier = getNextTier(tier);
  const toNext = pointsToNextTier(customer.points, tier);
  const challenges = getActiveChallenges();
  const referralCode = generateReferralCode(customer.name);

  const earned = ACHIEVEMENTS.filter((a) => EARNED_IDS.has(a.id));
  const locked = ACHIEVEMENTS.filter((a) => !EARNED_IDS.has(a.id));

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {}
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `Get ${REFERRAL_REWARD.refereeDiscountPLN} PLN off at Sud Italia!`,
        text: `Use my code ${referralCode} for ${REFERRAL_REWARD.refereeDiscountPLN} PLN off your first order at Sud Italia!`,
        url: `https://suditalia.pl?ref=${referralCode}`,
      }).catch(() => {});
    }
  };

  const tabs = [
    { id: "overview" as const, label: "Overview", icon: Star },
    { id: "rewards" as const, label: "Rewards", icon: Gift },
    { id: "achievements" as const, label: "Achievements", icon: Trophy },
    { id: "offers" as const, label: "Offers", icon: Percent },
  ];

  return (
    <div className="py-6 md:py-10">
      <Container>
        {/* Header with tier card */}
        <div className="bg-gradient-to-br from-italia-dark to-[#2a1a0a] rounded-3xl p-6 md:p-8 text-white mb-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-italia-gold/10 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-italia-red/10 blur-2xl" />

          <div className="relative z-10">
            {/* User info + sign out */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                  <User className="h-6 w-6 text-white/80" />
                </div>
                <div>
                  <h1 className="text-xl font-heading font-bold">{customer.name}</h1>
                  <p className="text-sm text-white/50">{customer.phone}</p>
                </div>
              </div>
              <button onClick={logout} className="text-xs text-white/40 hover:text-white flex items-center gap-1">
                <LogOut className="h-3 w-3" /> Sign out
              </button>
            </div>

            {/* Points + tier */}
            <div className="flex items-end justify-between mb-4">
              <div>
                <p className="text-4xl md:text-5xl font-heading font-bold text-italia-gold">
                  {customer.points.toLocaleString()}
                </p>
                <p className="text-sm text-white/50 mt-1">points earned</p>
              </div>
              <div className="text-right">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold ${tierConfig.color}`}>
                  <Crown className="h-4 w-4" />
                  {tierConfig.label} Tier
                </span>
                <p className="text-xs text-white/40 mt-1">{tierConfig.multiplier}x points multiplier</p>
              </div>
            </div>

            {/* Progress to next tier */}
            {nextTier && (
              <div>
                <div className="flex items-center justify-between text-xs text-white/40 mb-1.5">
                  <span>{tierConfig.label}</span>
                  <span>{toNext} pts to {TIER_CONFIG[nextTier].label}</span>
                </div>
                <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-italia-gold to-italia-red rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.min(
                        ((customer.points - TIER_THRESHOLDS[tier]) /
                          (TIER_THRESHOLDS[nextTier] - TIER_THRESHOLDS[tier])) * 100,
                        100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-3 mt-6">
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <p className="text-xl font-bold">{customer.ordersCount}</p>
                <p className="text-[11px] text-white/40">Orders</p>
              </div>
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <p className="text-xl font-bold">{tierConfig.multiplier}x</p>
                <p className="text-[11px] text-white/40">Multiplier</p>
              </div>
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <p className="text-xl font-bold flex items-center justify-center gap-1">
                  2 <Flame className="h-4 w-4 text-orange-400" />
                </p>
                <p className="text-[11px] text-white/40">Week Streak</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 overflow-x-auto scrollbar-hide pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === t.id
                  ? "bg-italia-red text-white shadow-sm"
                  : "text-italia-gray bg-white border border-gray-100 hover:bg-gray-50"
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* === OVERVIEW TAB === */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Streak */}
            <div className="bg-gradient-to-r from-orange-50 to-red-50 rounded-2xl border border-orange-200/30 p-5 flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white flex-shrink-0">
                <Flame className="h-7 w-7" />
              </div>
              <div className="flex-1">
                <p className="font-heading font-bold text-xl text-italia-dark flex items-center gap-2">
                  2 week streak! 🔥
                </p>
                <p className="text-sm text-italia-gray">
                  Order again this week to keep it going. 3-week streak = +30 bonus points!
                </p>
              </div>
            </div>

            {/* Weekly challenges */}
            <div>
              <h2 className="font-heading font-bold text-lg text-italia-dark mb-3 flex items-center gap-2">
                <Target className="h-5 w-5 text-italia-red" />
                Weekly Challenges
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {challenges.map((ch) => (
                  <div key={ch.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-sm text-italia-dark">{ch.title}</h3>
                      <span className="flex items-center gap-1 text-[10px] text-italia-red font-medium">
                        <Clock className="h-3 w-3" />
                        {daysUntil(ch.expiresAt)}d
                      </span>
                    </div>
                    <p className="text-xs text-italia-gray mb-3">{ch.description}</p>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-1.5">
                      <div className="h-full bg-italia-red rounded-full" style={{ width: "33%" }} />
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-italia-gray">1 / {ch.target}</span>
                      <span className="font-bold text-italia-gold-dark">+{ch.rewardPoints} pts</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Referral */}
            <div className="bg-gradient-to-br from-italia-red/5 to-purple-50 rounded-2xl border border-italia-red/15 p-5">
              <h2 className="font-heading font-bold text-lg text-italia-dark mb-1 flex items-center gap-2">
                <Share2 className="h-5 w-5 text-italia-red" />
                Refer Friends — Earn {REFERRAL_REWARD.referrerPoints} Points
              </h2>
              <p className="text-sm text-italia-gray mb-4">
                Share your code. Your friend gets {REFERRAL_REWARD.refereeDiscountPLN} PLN off, you get {REFERRAL_REWARD.referrerPoints} bonus points.
              </p>
              <div className="flex gap-2 mb-3">
                <div className="flex-1 bg-white rounded-xl border-2 border-dashed border-italia-red/20 px-4 py-3 text-center">
                  <span className="font-mono font-bold text-lg text-italia-dark tracking-wider">{referralCode}</span>
                </div>
                <button onClick={handleCopyCode} className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all ${copiedCode ? "bg-italia-green text-white" : "bg-gray-100 text-italia-gray hover:bg-gray-200"}`}>
                  {copiedCode ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                </button>
              </div>
              <button onClick={handleShare} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-italia-red text-white font-semibold rounded-xl hover:bg-italia-red-dark transition-colors active:scale-[0.98]">
                <Share2 className="h-4 w-4" /> Share with Friends
              </button>
            </div>

            {/* Tier roadmap */}
            <div>
              <h2 className="font-heading font-bold text-lg text-italia-dark mb-3 flex items-center gap-2">
                <Crown className="h-5 w-5 text-italia-gold" />
                Tier Roadmap
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(["bronze", "silver", "gold", "platinum"] as LoyaltyTier[]).map((t) => {
                  const cfg = TIER_CONFIG[t];
                  const isActive = t === tier;
                  const isUnlocked = customer.points >= TIER_THRESHOLDS[t];
                  return (
                    <div key={t} className={`rounded-2xl p-4 border transition-all ${isActive ? "bg-italia-gold/5 border-italia-gold/30 shadow-sm" : isUnlocked ? "bg-white border-gray-100" : "bg-gray-50 border-gray-100 opacity-60"}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${cfg.color}`}>{cfg.label}</span>
                        {isActive && <span className="text-[10px] text-italia-green font-bold">CURRENT</span>}
                      </div>
                      <p className="text-sm font-bold text-italia-dark">{cfg.multiplier}x points</p>
                      <p className="text-xs text-italia-gray mt-0.5">{TIER_THRESHOLDS[t]} pts to unlock</p>
                      <div className="mt-2 space-y-1">
                        {cfg.perks.map((p, i) => (
                          <p key={i} className="text-[10px] text-italia-gray flex items-center gap-1">
                            <Check className="h-3 w-3 text-italia-green flex-shrink-0" /> {p}
                          </p>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* === REWARDS TAB === */}
        {activeTab === "rewards" && (
          <div className="space-y-6">
            <div className="bg-italia-cream rounded-2xl p-4 text-center">
              <p className="text-sm text-italia-gray">Your balance</p>
              <p className="text-3xl font-heading font-bold text-italia-gold">{customer.points.toLocaleString()} pts</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {REWARDS.map((reward) => {
                const canRedeem = customer.points >= reward.pointsCost;
                return (
                  <div key={reward.id} className={`rounded-2xl border p-5 transition-all ${canRedeem ? "bg-white border-italia-gold/30 shadow-sm" : "bg-gray-50 border-gray-100"}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-xl bg-italia-gold/10 flex items-center justify-center">
                        <Ticket className="h-5 w-5 text-italia-gold" />
                      </div>
                      <span className="text-lg font-bold text-italia-gold">{reward.pointsCost} pts</span>
                    </div>
                    <h3 className="font-heading font-semibold text-italia-dark text-lg mb-1">{reward.name}</h3>
                    <p className="text-sm text-italia-gray mb-4">{reward.description}</p>
                    {canRedeem ? (
                      <button className="w-full px-4 py-2.5 bg-italia-gold text-white font-semibold rounded-xl hover:bg-italia-gold-dark transition-colors">
                        Redeem Now
                      </button>
                    ) : (
                      <div className="flex items-center justify-center gap-2 text-sm text-italia-gray py-2.5">
                        <Lock className="h-4 w-4" />
                        Need {reward.pointsCost - customer.points} more pts
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* === ACHIEVEMENTS TAB === */}
        {activeTab === "achievements" && (
          <div className="space-y-6">
            {/* Earned */}
            <div>
              <h2 className="font-heading font-bold text-lg text-italia-dark mb-3">
                Unlocked ({earned.length})
              </h2>
              {earned.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {earned.map((a) => (
                    <div key={a.id} className="flex items-center gap-3 p-4 bg-italia-gold/5 rounded-2xl border border-italia-gold/20">
                      <span className="text-3xl">{a.emoji}</span>
                      <div>
                        <p className="font-semibold text-italia-dark">{a.name}</p>
                        <p className="text-xs text-italia-gray">{a.description}</p>
                        <p className="text-xs font-bold text-italia-gold mt-1">+{a.pointsReward} pts earned</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-italia-gray">Place your first order to start unlocking achievements!</p>
              )}
            </div>

            {/* Locked */}
            <div>
              <h2 className="font-heading font-bold text-lg text-italia-dark mb-3">
                Locked ({locked.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {locked.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl opacity-70">
                    <span className="text-2xl grayscale">{a.emoji}</span>
                    <div>
                      <p className="text-sm font-semibold text-italia-dark">{a.name}</p>
                      <p className="text-xs text-italia-gray">{a.description}</p>
                      <p className="text-[11px] text-italia-gold-dark mt-0.5">+{a.pointsReward} pts</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* === OFFERS TAB === */}
        {activeTab === "offers" && (
          <div className="space-y-6">
            {/* Active combos */}
            <div>
              <h2 className="font-heading font-bold text-lg text-italia-dark mb-3 flex items-center gap-2">
                <Percent className="h-5 w-5 text-italia-red" />
                Combo Deals
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {COMBO_DEALS.map((deal) => (
                  <div key={deal.id} className="bg-white rounded-2xl border border-gray-100 p-5">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-heading font-semibold text-italia-dark">{deal.name}</h3>
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-italia-red/10 text-italia-red">
                        -{deal.discountPercent}%
                      </span>
                    </div>
                    <p className="text-sm text-italia-gray mb-3">{deal.description}</p>
                    <p className="text-xs text-italia-gray">
                      Add {deal.categories.join(" + ")} to your cart — discount applies automatically
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Tier perks */}
            <div>
              <h2 className="font-heading font-bold text-lg text-italia-dark mb-3 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-italia-gold" />
                Your Tier Perks
              </h2>
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${tierConfig.color}`}>
                    <Crown className="h-3 w-3 inline mr-1" />{tierConfig.label}
                  </span>
                </div>
                <div className="space-y-2">
                  {tierConfig.perks.map((perk, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-italia-dark">
                      <Check className="h-4 w-4 text-italia-green flex-shrink-0" />
                      {perk}
                    </div>
                  ))}
                </div>
                {nextTier && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-xs text-italia-gray">
                      Reach <strong>{TIER_CONFIG[nextTier].label}</strong> ({toNext} more pts) to unlock:
                    </p>
                    <div className="mt-2 space-y-1">
                      {TIER_CONFIG[nextTier].perks.map((perk, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-italia-gray">
                          <Lock className="h-3 w-3 text-italia-gray/50 flex-shrink-0" />
                          {perk}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Refer for discount */}
            <div className="bg-gradient-to-r from-italia-green/5 to-italia-cream rounded-2xl border border-italia-green/15 p-5 text-center">
              <Heart className="h-8 w-8 text-italia-red mx-auto mb-2" />
              <h3 className="font-heading font-bold text-lg text-italia-dark mb-1">
                Give {REFERRAL_REWARD.refereeDiscountPLN} PLN, Get {REFERRAL_REWARD.referrerPoints} Points
              </h3>
              <p className="text-sm text-italia-gray mb-3">
                Share your referral code with friends. They save, you earn.
              </p>
              <button onClick={handleShare} className="px-6 py-3 bg-italia-red text-white font-semibold rounded-xl hover:bg-italia-red-dark transition-colors inline-flex items-center gap-2">
                <Share2 className="h-4 w-4" /> Share Code
              </button>
            </div>
          </div>
        )}
      </Container>
    </div>
  );
}

export default function RewardsPage() {
  const { customer, loading } = useCustomer();

  if (loading) {
    return <div className="py-32 text-center text-italia-gray">Loading...</div>;
  }

  return customer ? <RewardsDashboard /> : <SignInSection />;
}
