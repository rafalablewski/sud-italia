"use client";

import { useMemo } from "react";
import { Plus, Sparkles, X } from "lucide-react";

import { useCartStore } from "@/store/cart";
import { UpsellSuggestion } from "@/lib/upsell";
import { formatPrice } from "@/lib/utils";
import type { MenuCategory } from "@/data/types";

interface CartUpsellProps {
  suggestions: UpsellSuggestion[];
}

/**
 * "Complete your meal" — the cart-upsell surface from audit §2.1.
 *
 * Renders up to three one-tap chips in a 3-up grid above the subtotal.
 * Suggestions arrive already margin-ranked from getCartSuggestions
 * (§2.4: espresso first, dessert next, drink third).
 *
 * Each chip:
 *   - Tap the body or the + badge while idle → adds to cart, chip flips green
 *   - Tap the × badge while added → removes
 *   - Body of an added chip is non-interactive (cursor: default) so the only
 *     remove target is the explicit × — avoids the "tap-the-whole-thing-
 *     twice" ambiguity that the first iteration suffered from.
 *
 * No toast on add — the green flip is the feedback. The drawer-wide
 * AddToCartToast handles the menu-page seed copy; firing it again here would
 * just pull the eye up.
 */
export function CartUpsell({ suggestions }: CartUpsellProps) {
  const addItem = useCartStore((s) => s.addItem);
  const removeItem = useCartStore((s) => s.removeItem);
  const locationSlug = useCartStore((s) => s.locationSlug);
  const items = useCartStore((s) => s.items);

  const itemIdsInCart = useMemo(
    () => new Set(items.map((i) => i.menuItem.id)),
    [items],
  );

  // Cap at three so the grid always tiles cleanly.
  const visible = suggestions.slice(0, 3);
  if (visible.length === 0) return null;

  return (
    <div className="px-5 mt-3">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-italia-gold" />
        <p className="text-xs font-semibold text-italia-gray uppercase tracking-wide">
          Complete your meal
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {visible.map((suggestion) => {
          const isAdded = itemIdsInCart.has(suggestion.item.id);
          return (
            <CompleteTheMealChip
              key={suggestion.item.id}
              suggestion={suggestion}
              isAdded={isAdded}
              onAdd={() => {
                if (locationSlug) addItem(suggestion.item, locationSlug);
              }}
              onRemove={() => removeItem(suggestion.item.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

interface ChipProps {
  suggestion: UpsellSuggestion;
  isAdded: boolean;
  onAdd: () => void;
  onRemove: () => void;
}

function CompleteTheMealChip({ suggestion, isAdded, onAdd, onRemove }: ChipProps) {
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isAdded) {
      onAdd();
      return;
    }
    // Only the × badge removes. The audit-rejected pattern was making the
    // entire chip body a remove target.
    const target = e.target as HTMLElement;
    if (target.closest("[data-remove-target='1']")) onRemove();
  };

  return (
    <div
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (isAdded) onRemove();
          else onAdd();
        }
      }}
      data-added={isAdded ? "true" : undefined}
      className={`relative rounded-xl border p-3 text-center transition-all animate-fade-in select-none ${
        isAdded
          ? "bg-italia-green/5 border-italia-green/30 cursor-default"
          : "bg-italia-cream border-italia-gold/15 cursor-pointer hover:border-italia-gold/40 hover:shadow-sm hover:-translate-y-0.5 active:translate-y-0"
      }`}
    >
      <span
        data-remove-target={isAdded ? "1" : undefined}
        onClick={(e) => {
          if (!isAdded) return;
          e.stopPropagation();
          onRemove();
        }}
        aria-label={isAdded ? "Remove" : "Add"}
        className={`absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-md transition-colors ${
          isAdded
            ? "bg-white text-italia-dark border border-gray-200 hover:bg-italia-red hover:text-white hover:border-italia-red cursor-pointer"
            : "bg-italia-red text-white"
        }`}
      >
        {isAdded ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
      </span>

      <div className="text-[22px] leading-none mb-1" aria-hidden="true">
        {categoryGlyph(suggestion.item.category)}
      </div>
      <div className="text-sm font-medium text-italia-dark leading-tight truncate">
        {suggestion.item.name}
      </div>
      <div className="text-[11px] text-italia-gray leading-tight truncate mt-0.5">
        {suggestion.reason}
      </div>
      <div
        className={`text-sm font-semibold mt-1.5 ${
          isAdded ? "text-italia-green-dark" : "text-italia-red"
        }`}
      >
        {formatPrice(suggestion.item.price)}
      </div>
    </div>
  );
}

/** Cheap visual identifier per category. Real product photography is the
 *  Top-50 #2 follow-up; until that lands these emojis are at least more
 *  legible than a generic placeholder. */
function categoryGlyph(category: MenuCategory): string {
  switch (category) {
    case "drinks":
      return "☕️";
    case "desserts":
      return "🍰";
    case "antipasti":
      return "🥖";
    case "panini":
      return "🥪";
    case "pasta":
      return "🍝";
    case "pizza":
    default:
      return "🍕";
  }
}
