"use client";

import { useMemo } from "react";
import { Medal, X } from "lucide-react";

import { useCartStore } from "@/store/cart";
import { useCustomer } from "@/store/customer";
import { calculateTier } from "@/lib/loyalty";
import type { MenuItem } from "@/data/types";

interface TierPerkBannerProps {
  /** Full location menu so we can find the comp candidate (e.g. bruschetta)
   *  by id-suffix in a location-agnostic way. */
  allMenuItems: MenuItem[];
}

/** Internal id we tag the comp'd line with so we can find + remove it without
 *  collateral damage to a genuine paid line of the same item. */
const PERK_LINE_PREFIX = "perk-gold-";

/**
 * Gold-tier comp'd perk banner — audit §2.2 row 6.
 *
 * Only renders for Gold / Platinum members. Offers a comp'd antipasto (the
 * pesto bruschetta when available, otherwise the first antipasto on the
 * menu). The CTA toggles a price-0 line in the cart; tapping the × pulls
 * the line back out. Same one-tap-add / explicit-× pattern as
 * "Complete your meal."
 *
 * When no antipasto is in stock today the banner self-hides — no point
 * advertising a perk we can't fulfil.
 */
export function TierPerkBanner({ allMenuItems }: TierPerkBannerProps) {
  const { customer } = useCustomer();
  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const removeItem = useCartStore((s) => s.removeItem);
  const locationSlug = useCartStore((s) => s.locationSlug);

  const tier = useMemo(() => {
    if (!customer) return null;
    return calculateTier(customer.points);
  }, [customer]);

  const compCandidate = useMemo(() => {
    const bruschetta = allMenuItems.find(
      (m) => m.available && m.id.endsWith("bruschetta"),
    );
    if (bruschetta) return bruschetta;
    return allMenuItems.find((m) => m.available && m.category === "antipasti");
  }, [allMenuItems]);

  const compLine = items.find((i) => i.menuItem.id.startsWith(PERK_LINE_PREFIX));
  const applied = !!compLine;

  if (!customer) return null;
  if (tier !== "gold" && tier !== "platinum") return null;
  if (!compCandidate || !locationSlug) return null;

  const toggle = () => {
    if (applied && compLine) {
      removeItem(compLine.menuItem.id);
      return;
    }
    // Inject a synthetic line with price 0 and a marker id so we can clean
    // it up without disturbing the customer's real items.
    const compItem: MenuItem = {
      ...compCandidate,
      id: `${PERK_LINE_PREFIX}${compCandidate.id}`,
      name: `${compCandidate.name} (Gold perk · comp'd)`,
      price: 0,
    };
    addItem(compItem, locationSlug);
  };

  return (
    <div className="px-5 mt-3">
      <div
        className={`p-3 rounded-xl border flex items-center gap-3 ${
          applied
            ? "bg-italia-green/5 border-italia-green/30"
            : "bg-italia-gold/5 border-italia-gold/40 bg-[linear-gradient(135deg,rgba(184,146,46,0.10)_0%,rgba(184,146,46,0.04)_100%)] hover:border-italia-gold cursor-pointer"
        }`}
        onClick={() => {
          if (!applied) toggle();
        }}
      >
        <span
          className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
            applied
              ? "bg-italia-green/10 text-italia-green"
              : "bg-italia-gold/18 text-italia-gold-dark"
          }`}
        >
          <Medal className="h-5 w-5" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-italia-dark">
            {applied
              ? `${compCandidate.name} added — on the house`
              : `Make it a ${tier === "platinum" ? "Platinum" : "Gold"}-tier order`}
          </p>
          <p className="text-[11px] text-italia-gray mt-0.5 leading-snug">
            {applied
              ? "Tap × to remove the comp."
              : `+ ${compCandidate.name} on the house · ${tier} perk`}
          </p>
        </div>
        {applied ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggle();
            }}
            aria-label="Remove perk"
            className="flex-shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white text-italia-dark hover:bg-italia-red hover:text-white hover:border-italia-red transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="flex-shrink-0 text-xs font-semibold text-italia-gold-dark bg-italia-gold/15 px-2.5 py-1.5 rounded-md">
            Add free
          </span>
        )}
      </div>
    </div>
  );
}
