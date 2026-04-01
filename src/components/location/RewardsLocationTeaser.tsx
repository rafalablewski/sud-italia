"use client";

import Link from "next/link";
import { ChevronRight, Flame, Gift, Star, Target } from "lucide-react";
import { useCustomer } from "@/store/customer";

const previewRows = [
  {
    icon: Target,
    label: "Weekly challenges",
    hint: "Limited-time goals and bonus points",
    iconWrap: "bg-italia-red/10 text-italia-red",
  },
  {
    icon: Flame,
    label: "Streaks & achievements",
    hint: "Unlock badges as you order",
    iconWrap: "bg-italia-gold/15 text-italia-gold-dark",
  },
  {
    icon: Gift,
    label: "Referral rewards",
    hint: "Share your code — you both win",
    iconWrap: "bg-italia-red/10 text-italia-red",
  },
] as const;

/**
 * Location menu: compact card in the same visual language as LoyaltyCard / location promos.
 */
export function RewardsLocationTeaser() {
  const { customer } = useCustomer();

  return (
    <Link
      href="/rewards"
      className="group block rounded-2xl border border-italia-gold/20 bg-gradient-to-br from-italia-gold/5 to-italia-red/5 p-5 outline-none transition-all hover:border-italia-gold/35 hover:shadow-md focus-visible:ring-2 focus-visible:ring-italia-red focus-visible:ring-offset-2 focus-visible:ring-offset-white"
      aria-label="Open Sud Italia Rewards — challenges, achievements, streaks and referral program"
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-italia-gold/15 flex items-center justify-center flex-shrink-0">
          <Star className="h-5 w-5 text-italia-gold" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-italia-gold-dark font-medium text-xs tracking-[0.12em] uppercase mb-0.5">
            Loyalty
          </p>
          <h3 className="font-heading font-semibold text-lg text-italia-dark leading-tight">
            Sud Italia Rewards
          </h3>
          {customer ? (
            <p className="text-xs text-italia-gray mt-1">
              <span className="font-semibold text-italia-gold-dark">
                {customer.points.toLocaleString()} pts
              </span>
              <span className="mx-1">·</span>
              {customer.ordersCount} {customer.ordersCount === 1 ? "order" : "orders"}
            </p>
          ) : (
            <p className="text-xs text-italia-gray mt-1">
              Challenges, streaks &amp; referral — all on your rewards page
            </p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-3.5 space-y-1">
        {previewRows.map(({ icon: Icon, label, hint, iconWrap }) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-lg px-1 py-2 transition-colors group-hover:bg-gray-50/80"
          >
            <span
              className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${iconWrap}`}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-italia-dark leading-snug">{label}</p>
              <p className="text-[11px] text-italia-gray leading-snug">{hint}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-italia-dark">
        <span className="text-italia-red group-hover:underline">Open rewards dashboard</span>
        <ChevronRight className="h-4 w-4 text-italia-red transition-transform group-hover:translate-x-0.5" aria-hidden />
      </div>
    </Link>
  );
}
