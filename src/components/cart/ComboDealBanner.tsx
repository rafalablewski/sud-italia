"use client";

import { getActiveComboDeals } from "@/lib/upsell";
import { CartItem, MENU_CATEGORY_LABELS } from "@/data/types";
import { formatPrice } from "@/lib/utils";
import { Gift } from "lucide-react";

interface ComboDealBannerProps {
  cartItems: CartItem[];
  /** Cart fulfillment type — drives channel-aware combo filtering
   *  (audit §3 — channel economics). Optional so legacy callers still work. */
  fulfillmentType?: "takeout" | "delivery";
}

export function ComboDealBanner({ cartItems, fulfillmentType }: ComboDealBannerProps) {
  const { activeDeal, savings, missingCategories, missingItems, missingQuantity, isComplete, progress } =
    getActiveComboDeals(cartItems, null, fulfillmentType);

  if (!activeDeal) return null;

  // Item-required combos (Italian Classic Deal) name the specific missing
  // items; category-only combos fall back to the legacy category copy;
  // when categories AND items are all matched but minItems is short, we
  // surface the quantity gap so the banner stays actionable. The earlier
  // "save ~X PLN" projection was dropped on Gemini's note — for partial
  // combos it underestimated the eventual saving (it only priced what
  // was already in the cart, not what the customer would unlock by
  // adding the missing item) so it actively de-motivated the upsell.
  const missingLabels = missingItems.length > 0
    ? missingItems
    : missingCategories.map((cat) => MENU_CATEGORY_LABELS[cat].toLowerCase());
  const partialCopy =
    missingLabels.length > 0
      ? missingLabels
      : missingQuantity > 0
        ? [`${missingQuantity} more item${missingQuantity === 1 ? "" : "s"}`]
        : [];

  return (
    <div className="px-5 mt-3">
      <div
        className={`p-3 rounded-xl border transition-all duration-300 ${
          isComplete
            ? "bg-italia-green/5 border-italia-green/30"
            : "bg-italia-gold/5 border-italia-gold/25"
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
              isComplete
                ? "bg-italia-green/15 text-italia-green"
                : "bg-italia-gold/15 text-italia-gold-dark"
            }`}
          >
            <Gift className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
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
                {isComplete ? "Applied!" : `-${activeDeal.discountPercent}%`}
              </span>
            </div>
            {isComplete ? (
              <p className="text-sm text-italia-green font-semibold mt-1">
                You&apos;re saving {formatPrice(savings)}!
              </p>
            ) : partialCopy.length > 0 ? (
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
      </div>
    </div>
  );
}
