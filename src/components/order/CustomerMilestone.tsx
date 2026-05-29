"use client";

import { Trophy, Star, Gift, PartyPopper } from "lucide-react";

interface CustomerMilestoneProps {
  orderCount: number;
  customerName: string;
}

const MILESTONES: Record<
  number,
  { en: string; it: string; icon: React.ElementType }
> = {
  1: {
    en: "Welcome to la famiglia.",
    it: "benvenuto alla famiglia",
    icon: Star,
  },
  5: {
    en: "5 orders — you're becoming a regular.",
    it: "cinque visite, ci sei",
    icon: Trophy,
  },
  10: {
    en: "10 orders — a true fan. A dessert is on us, next visit.",
    it: "dolce della casa",
    icon: Gift,
  },
  25: {
    en: "25 orders — VIP. A pizza is on us, next visit.",
    it: "pizza della casa",
    icon: PartyPopper,
  },
  50: {
    en: "50 orders — legendary. Famiglia Oro unlocked.",
    it: "famiglia oro",
    icon: Trophy,
  },
};

/**
 * V8 round-number recognition card on the order-confirmation page.
 * Fires for 1 / 5 / 10 / 25 / 50 lifetime orders. Quiet, non-intrusive —
 * one card, no modals.
 */
export function CustomerMilestone({ orderCount, customerName }: CustomerMilestoneProps) {
  const milestone = MILESTONES[orderCount];
  if (!milestone) return null;

  const Icon = milestone.icon;
  const firstName = customerName.split(" ")[0] || customerName;

  return (
    <div className="v8-order-milestone">
      <div className="v8-order-milestone-mark" aria-hidden="true">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="v8-order-milestone-h3">
        <em>Bravo,</em> {firstName}!
      </h3>
      <p className="v8-order-milestone-sub">
        {milestone.en}{" "}
        <em style={{ color: "var(--color-muted)" }}>· {milestone.it}</em>
      </p>
      <span className="v8-order-milestone-count">Order N° {orderCount}</span>
    </div>
  );
}
