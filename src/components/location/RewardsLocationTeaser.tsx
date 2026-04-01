"use client";

import Link from "next/link";
import { ChevronRight, Sparkles } from "lucide-react";
import { AchievementsPanel } from "@/components/gamification/AchievementsPanel";
import { ReferralCard } from "@/components/referral/ReferralCard";

/**
 * Location menu: show a clipped preview of rewards gamification instead of the full stack.
 * Entire card links to /rewards for challenges, achievements, streak & referral.
 */
export function RewardsLocationTeaser() {
  return (
    <Link
      href="/rewards"
      className="group relative block overflow-hidden rounded-2xl border border-italia-gold/25 bg-italia-cream shadow-sm outline-none transition-shadow hover:shadow-md hover:border-italia-gold/40 focus-visible:ring-2 focus-visible:ring-italia-red focus-visible:ring-offset-2"
      aria-label="Open Sud Italia Rewards: weekly challenges, achievements, streaks and referral program"
    >
      <div className="relative max-h-[200px] sm:max-h-[220px] overflow-hidden">
        <div
          className="pointer-events-none select-none space-y-6 opacity-[0.88] [filter:blur(0.4px)] scale-[0.98] origin-top"
          aria-hidden
        >
          <AchievementsPanel />
          <ReferralCard />
        </div>
      </div>

      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-italia-cream from-[35%] via-italia-cream/75 via-50% to-transparent to-85%"
        aria-hidden
      />

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center px-4 pb-4 pt-16 text-center">
        <div className="mb-1.5 flex h-9 w-9 items-center justify-center rounded-full bg-italia-gold/15 text-italia-gold">
          <Sparkles className="h-4 w-4" aria-hidden />
        </div>
        <span className="flex items-center gap-1.5 text-sm font-heading font-bold text-italia-dark group-hover:text-italia-red transition-colors">
          Open Sud Italia Rewards
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
        <span className="mt-0.5 max-w-xs text-[11px] leading-snug text-italia-gray">
          Challenges, achievements, streak &amp; referral — full dashboard on the rewards page
        </span>
      </div>
    </Link>
  );
}
