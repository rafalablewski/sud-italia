"use client";

import { useEffect, useState } from "react";
import { getActiveComboDeals } from "@/lib/upsell";
import { CartItem, MENU_CATEGORY_LABELS, MenuItem } from "@/data/types";
import { formatPrice } from "@/lib/utils";
import { useCartStore } from "@/store/cart";
import { Gift, Check, Sparkles } from "lucide-react";

interface ComboDealBannerProps {
  cartItems: CartItem[];
  /** Cart fulfillment type — drives channel-aware combo filtering
   *  (audit §3 — channel economics). Optional so legacy callers still work. */
  fulfillmentType?: "takeout" | "delivery";
  /** Menu items available at the current location. Required for click-to-apply
   *  — the banner looks up the missing required-item suffixes / cheapest item
   *  per missing category against this list. Without it the banner stays in
   *  read-only mode. */
  allMenuItems?: MenuItem[];
  /** Cart's active location slug. Needed by `addItem` so cross-location adds
   *  reset the cart correctly. */
  locationSlug?: string | null;
}

export function ComboDealBanner({
  cartItems,
  fulfillmentType,
  allMenuItems = [],
  locationSlug,
}: ComboDealBannerProps) {
  const { activeDeal, savings, missingCategories, missingItems, missingQuantity, isComplete, progress } =
    getActiveComboDeals(cartItems, null, fulfillmentType);

  const addItem = useCartStore((s) => s.addItem);
  const [justApplied, setJustApplied] = useState(false);

  // Resolve the menu items we'd add on click. For requiredItems-based combos
  // we match every missing suffix against the current location's menu. For
  // pure category combos we pick the cheapest item in each missing category
  // so a single tap completes the combo without forcing the customer to
  // hunt through the menu. Plain computation — React Compiler memoizes.
  const itemsToAdd: MenuItem[] = (() => {
    if (!activeDeal || isComplete) return [];
    if (allMenuItems.length === 0) return [];

    // Only suggest items the kitchen can actually serve — `available: false`
    // means the operator 86'd the SKU, and offering it via the click-to-apply
    // would surface a sold-out line at checkout.
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
    for (const item of itemsToAdd) {
      addItem(item, locationSlug);
    }
    setJustApplied(true);
  };

  // Clear the "just applied" pulse a couple seconds after the cart settles
  // into the complete state so the green glow doesn't linger forever.
  useEffect(() => {
    if (!justApplied) return;
    if (!isComplete) return;
    const t = setTimeout(() => setJustApplied(false), 2400);
    return () => clearTimeout(t);
  }, [justApplied, isComplete]);

  if (!activeDeal) return null;

  // Item-required combos (Italian Classic Deal) name the specific missing
  // items; category-only combos fall back to the legacy category copy;
  // when categories AND items are all matched but minItems is short, we
  // surface the quantity gap so the banner stays actionable.
  const missingLabels = missingItems.length > 0
    ? missingItems
    : missingCategories.map((cat) => MENU_CATEGORY_LABELS[cat].toLowerCase());
  const partialCopy =
    missingLabels.length > 0
      ? missingLabels
      : missingQuantity > 0
        ? [`${missingQuantity} more item${missingQuantity === 1 ? "" : "s"}`]
        : [];

  const containerClasses = `p-3 rounded-xl border transition-all duration-300 ${
    isComplete
      ? "bg-italia-green/5 border-italia-green/30"
      : "bg-italia-gold/5 border-italia-gold/25"
  } ${justApplied && isComplete ? "ring-2 ring-italia-green/40 shadow-[0_0_0_4px_rgba(16,185,129,0.08)]" : ""} ${
    canApply
      ? "cursor-pointer hover:border-italia-gold/50 hover:bg-italia-gold/10 active:scale-[0.99]"
      : ""
  }`;

  const content = (
    <div className="flex items-start gap-3">
      <div
        className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
          isComplete
            ? "bg-italia-green/15 text-italia-green"
            : "bg-italia-gold/15 text-italia-gold-dark"
        }`}
      >
        {isComplete ? <Check className="h-5 w-5" /> : <Gift className="h-5 w-5" />}
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-sm text-italia-dark">
            {activeDeal.name}
          </p>
          <span
            className={`text-xs font-bold px-1.5 py-0.5 rounded ${
              isComplete
                ? "bg-italia-green/15 text-italia-green"
                : "bg-italia-gold/15 text-italia-gold-dark"
            }`}
          >
            {isComplete ? "Applied" : `-${activeDeal.discountPercent}%`}
          </span>
        </div>
        {isComplete ? (
          <p className="text-sm text-italia-green font-semibold mt-1 flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Deal applied — you&apos;re saving {formatPrice(savings)}
          </p>
        ) : partialCopy.length > 0 ? (
          <>
            <p className="text-xs text-italia-gray mt-1">
              Add{" "}
              {partialCopy.map((label, i) => (
                <span key={label}>
                  {i > 0 && (i === partialCopy.length - 1 ? " & " : ", ")}
                  <span className="font-semibold text-italia-dark">
                    {label}
                  </span>
                </span>
              ))}{" "}
              to unlock this deal
            </p>
            {canApply && (
              <p className="text-[11px] font-semibold text-italia-gold-dark mt-1">
                Tap to add {itemsToAdd.length === 1 ? "it" : "them"} and save {formatPrice(savings)}
              </p>
            )}
          </>
        ) : null}
        {/* Mini progress bar */}
        {!isComplete && (
          <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden mt-2">
            <div
              className="h-full bg-italia-gold rounded-full transition-all duration-500"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="px-5 mt-3">
      {canApply ? (
        <button
          type="button"
          onClick={handleApply}
          className={`${containerClasses} w-full block transition-transform`}
          aria-label={`Apply ${activeDeal.name} — add ${itemsToAdd.map((i) => i.name).join(", ")}`}
        >
          {content}
        </button>
      ) : (
        <div className={containerClasses}>{content}</div>
      )}
    </div>
  );
}
