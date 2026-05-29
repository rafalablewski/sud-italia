"use client";

import { useEffect, useState } from "react";
import { getActiveComboDeals, type UpsellConfig } from "@/lib/upsell";
import { CartItem, MENU_CATEGORY_LABELS, MenuItem, FulfillmentType } from "@/data/types";
import { formatPrice } from "@/lib/utils";
import { useCartStore } from "@/store/cart";

interface ComboDealBannerProps {
  cartItems: CartItem[];
  fulfillmentType?: FulfillmentType;
  allMenuItems?: MenuItem[];
  locationSlug?: string | null;
  upsellConfig?: UpsellConfig | null;
}

/**
 * V8 combo-deal banner. Italian Classic / Pasta Combo / etc. percent
 * deals that auto-apply when the cart hits the required composition.
 *
 * V8 styling: `.v8-cart-combo` paper card with a hand-drawn oven SVG
 * + italic Cormorant deal name + Italian italic sublabel + ochre
 * `−12%` chip on the right. While the deal is incomplete the card
 * becomes a button — tap adds the missing items and unlocks the
 * discount in one go. Mini hairline progress rail underneath. Applied
 * state flips to basil-deep "applied · attivato — saving X zł".
 */
export function ComboDealBanner({
  cartItems,
  fulfillmentType,
  allMenuItems = [],
  locationSlug,
  upsellConfig = null,
}: ComboDealBannerProps) {
  const { activeDeal, savings, missingCategories, missingItems, missingQuantity, isComplete, progress } =
    getActiveComboDeals(cartItems, upsellConfig, fulfillmentType);

  const addItem = useCartStore((s) => s.addItem);
  const [justApplied, setJustApplied] = useState(false);

  const itemsToAdd: MenuItem[] = (() => {
    if (!activeDeal || isComplete) return [];
    if (allMenuItems.length === 0) return [];

    const isAvailable = (m: MenuItem) => m.available !== false;

    if (activeDeal.requiredItems && activeDeal.requiredItems.length > 0) {
      const toAdd: MenuItem[] = [];
      const seen = new Set<string>();
      for (const req of activeDeal.requiredItems) {
        const alreadyInCart = cartItems.some((ci) =>
          ci.menuItem.id.endsWith(req.suffix),
        );
        if (alreadyInCart) continue;
        const candidate = allMenuItems.find(
          (m) => m.id.endsWith(req.suffix) && isAvailable(m),
        );
        if (candidate && !seen.has(candidate.id)) {
          toAdd.push(candidate);
          seen.add(candidate.id);
        }
      }
      return toAdd;
    }

    if (missingCategories.length > 0) {
      const toAdd: MenuItem[] = [];
      const seen = new Set<string>();
      for (const cat of missingCategories) {
        const candidates = allMenuItems.filter(
          (m) => m.category === cat && isAvailable(m),
        );
        if (candidates.length === 0) continue;
        const cheapest = candidates.reduce((a, b) => (a.price < b.price ? a : b));
        if (!seen.has(cheapest.id)) {
          toAdd.push(cheapest);
          seen.add(cheapest.id);
        }
      }
      return toAdd;
    }

    return [];
  })();

  const canApply = !isComplete && itemsToAdd.length > 0 && !!locationSlug;

  const handleApply = () => {
    if (!canApply || !locationSlug) return;
    for (const item of itemsToAdd) addItem(item, locationSlug);
    setJustApplied(true);
  };

  useEffect(() => {
    if (!justApplied) return;
    if (!isComplete) return;
    const t = setTimeout(() => setJustApplied(false), 2400);
    return () => clearTimeout(t);
  }, [justApplied, isComplete]);

  if (!activeDeal) return null;

  const missingLabels = missingItems.length > 0
    ? missingItems
    : missingCategories.map((cat) => MENU_CATEGORY_LABELS[cat].toLowerCase());
  const partialCopy =
    missingLabels.length > 0
      ? missingLabels
      : missingQuantity > 0
        ? [`${missingQuantity} more item${missingQuantity === 1 ? "" : "s"}`]
        : [];

  const classes = [
    "v8-cart-combo",
    isComplete ? "is-complete" : "",
    justApplied && isComplete ? "is-pulse" : "",
    canApply ? "is-actionable" : "",
  ].filter(Boolean).join(" ");

  const content = (
    <>
      <span className="v8-cart-combo-illus" aria-hidden="true">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <path d="M6 30 L6 18 C 6 12, 12 8, 20 8 C 28 8, 34 12, 34 18 L34 30" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <ellipse cx="20" cy="20" rx="9" ry="7" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <path d="M14 21 C 16 19, 24 19, 26 21" stroke="#CD212A" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <path d="M16 23 C 18 22, 22 22, 24 23" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
          <path d="M3 32 L37 32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
      <div className="v8-cart-combo-body">
        <div className="v8-cart-combo-title">
          {activeDeal.name}
        </div>
        {isComplete ? (
          <div className="v8-cart-combo-sub">
            <em>applied · attivato</em> — saving{" "}
            <span className="num">{formatPrice(savings)}</span>
          </div>
        ) : partialCopy.length > 0 ? (
          <div className="v8-cart-combo-sub">
            Add{" "}
            {partialCopy.map((label, i) => (
              <span key={label}>
                {i > 0 && (i === partialCopy.length - 1 ? " & " : ", ")}
                <em>{label}</em>
              </span>
            ))}{" "}
            to unlock — saves{" "}
            <span className="num">{formatPrice(savings)}</span>
          </div>
        ) : null}
        {!isComplete && (
          <div className="v8-cart-combo-rail">
            <div className="v8-cart-combo-fill" style={{ width: `${Math.max(2, progress * 100)}%` }} />
          </div>
        )}
      </div>
      <span className="v8-cart-combo-tag">
        {isComplete ? "✓" : `−${activeDeal.discountPercent}%`}
      </span>
    </>
  );

  if (canApply) {
    return (
      <button
        type="button"
        onClick={handleApply}
        className={classes}
        aria-label={`Apply ${activeDeal.name} — add ${itemsToAdd.map((i) => i.name).join(", ")}`}
      >
        {content}
      </button>
    );
  }
  return <div className={classes}>{content}</div>;
}
