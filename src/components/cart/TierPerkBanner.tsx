"use client";

import { useEffect, useMemo, useState } from "react";

import { useCartStore } from "@/store/cart";
import { useCustomer } from "@/store/customer";
import { calculateTier } from "@/lib/loyalty";
import { fetchPublicSettings, type PublicLoyaltySettings } from "@/lib/public-settings";
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
 * Only renders for Gold / Platinum members. Offers a comp'd antipasto
 * (pesto bruschetta when available, otherwise the first antipasto on the
 * menu). The CTA toggles a price-0 line in the cart; tapping × pulls it
 * back out. Same one-tap-add / explicit-× pattern as the V8 cross-sell rail.
 *
 * V8 styling: `.v8-cart-perk` ochre paper card with an editorial star
 * SVG + italic Cormorant tier name (Famiglia Oro / Platino) + italic
 * Lora copy "A complimentary antipasto della casa on us — added at
 * the truck." Adopted state flips to basil-deep "Added to the table"
 * with a circular × in the corner.
 */
export function TierPerkBanner({ allMenuItems }: TierPerkBannerProps) {
  const { customer } = useCustomer();
  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const removeItem = useCartStore((s) => s.removeItem);
  const locationSlug = useCartStore((s) => s.locationSlug);

  const [loyalty, setLoyalty] = useState<PublicLoyaltySettings | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchPublicSettings().then((s) => {
      if (!cancelled && s?.loyalty) setLoyalty(s.loyalty);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const tier = useMemo(() => {
    if (!customer || !loyalty) return null;
    return calculateTier(customer.points, loyalty.tiers);
  }, [customer, loyalty]);

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

  const tierLabel = tier === "platinum" ? "Famiglia Platino" : "Famiglia Oro";

  const toggle = () => {
    if (applied && compLine) {
      removeItem(compLine.menuItem.id);
      return;
    }
    const compItem: MenuItem = {
      ...compCandidate,
      id: `${PERK_LINE_PREFIX}${compCandidate.id}`,
      name: `${compCandidate.name} (${tierLabel} perk · comp'd)`,
      price: 0,
    };
    addItem(compItem, locationSlug);
  };

  return (
    <div
      className={`v8-cart-perk${applied ? " is-on" : ""}`}
      role={applied ? undefined : "button"}
      tabIndex={applied ? undefined : 0}
      onClick={() => { if (!applied) toggle(); }}
      onKeyDown={(e) => {
        if (!applied && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          toggle();
        }
      }}
    >
      <span className="v8-cart-perk-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M9 2 L10.5 6.5 L15 7 L11.5 10 L12.5 14.5 L9 12 L5.5 14.5 L6.5 10 L3 7 L7.5 6.5 Z"
                stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="currentColor" fillOpacity="0.3" />
        </svg>
      </span>
      <div className="v8-cart-perk-body">
        <div className="v8-cart-perk-title">{tierLabel}</div>
        <div className="v8-cart-perk-sub">
          {applied
            ? <>{compCandidate.name} <em>added to the table</em> — on us.</>
            : <>A complimentary <em>{compCandidate.name}</em> — on us, added at the truck.</>}
        </div>
      </div>
      {applied ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggle(); }}
          aria-label="Remove perk"
          className="v8-cart-perk-remove"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      ) : (
        <span className="v8-cart-perk-cta">Add · aggiungi</span>
      )}
    </div>
  );
}
