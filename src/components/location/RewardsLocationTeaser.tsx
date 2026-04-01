"use client";

import Link from "next/link";
import { ChevronRight, Flame, Gift, Target } from "lucide-react";
import { useCustomer } from "@/store/customer";

const previewRows = [
  {
    icon: Target,
    label: "Weekly challenges",
    hint: "Limited-time goals",
  },
  {
    icon: Flame,
    label: "Streaks & achievements",
    hint: "Unlock as you order",
  },
  {
    icon: Gift,
    label: "Referral rewards",
    hint: "Share with friends",
  },
] as const;

/**
 * Location menu: compact frosted card that invites customers to /rewards.
 * Intentionally does not embed AchievementsPanel — avoids blurry duplicates and heavy layout.
 */
export function RewardsLocationTeaser() {
  const { customer } = useCustomer();

  return (
    <Link
      href="/rewards"
      className="group relative isolate block overflow-hidden rounded-[1.25rem] outline-none transition-[transform,box-shadow] duration-300 ease-out focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:ring-offset-2 focus-visible:ring-offset-italia-cream hover:shadow-lg active:scale-[0.99]"
      aria-label="Open Sud Italia Rewards — weekly challenges, achievements, streaks and referral program"
    >
      {/* Layered glass surface */}
      <div
        className="absolute inset-0 rounded-[1.25rem] bg-gradient-to-br from-white/90 via-white/55 to-white/30 shadow-[0_1px_0_0_rgba(255,255,255,0.8)_inset,0_8px_32px_-8px_rgba(0,0,0,0.12)]"
        aria-hidden
      />
      <div
        className="absolute inset-0 rounded-[1.25rem] border border-black/[0.06] bg-white/25 backdrop-blur-2xl backdrop-saturate-150"
        aria-hidden
      />
      <div
        className="absolute -top-24 -right-16 h-48 w-48 rounded-full bg-italia-red/[0.06] blur-3xl"
        aria-hidden
      />
      <div
        className="absolute -bottom-20 -left-10 h-40 w-56 rounded-full bg-italia-gold/[0.08] blur-3xl"
        aria-hidden
      />

      <div className="relative px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
              Sud Italia
            </p>
            <h3 className="font-sans text-xl font-semibold tracking-[-0.02em] text-black/88 sm:text-[1.35rem]">
              Rewards
            </h3>
            {customer ? (
              <p className="font-sans text-[13px] leading-snug text-black/45">
                <span className="font-medium text-black/55">
                  {customer.points.toLocaleString()} pts
                </span>
                <span className="mx-1.5 text-black/25">·</span>
                {customer.ordersCount}{" "}
                {customer.ordersCount === 1 ? "order" : "orders"}
              </p>
            ) : (
              <p className="font-sans text-[13px] leading-snug text-black/45">
                Your full dashboard lives here
              </p>
            )}
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-black/35 transition-all duration-300 group-hover:bg-black/[0.08] group-hover:text-black/55">
            <ChevronRight
              className="h-[18px] w-[18px] transition-transform duration-300 group-hover:translate-x-0.5"
              strokeWidth={2}
              aria-hidden
            />
          </div>
        </div>

        <ul className="mt-5 space-y-0.5" role="list">
          {previewRows.map(({ icon: Icon, label, hint }) => (
            <li
              key={label}
              className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors duration-200 group-hover:bg-black/[0.02]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black/[0.04] text-black/40">
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-sans text-[15px] font-medium tracking-[-0.01em] text-black/80">
                  {label}
                </span>
                <span className="block font-sans text-[12px] leading-tight text-black/38">
                  {hint}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-4 border-t border-black/[0.06] pt-4 font-sans text-[12px] leading-relaxed text-black/42">
          Tap to open your rewards hub — same experience as signing in on the Rewards page.
        </p>
      </div>
    </Link>
  );
}
