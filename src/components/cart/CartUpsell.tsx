"use client";

import { useMemo } from "react";
import { Plus, Sparkles } from "lucide-react";

import { useCartStore } from "@/store/cart";
import { UpsellSuggestion } from "@/lib/upsell";
import { formatPrice } from "@/lib/utils";
import type { MenuCategory } from "@/data/types";

interface CartUpsellProps {
  suggestions: UpsellSuggestion[];
}

/**
 * "Complete your meal" — fixed four-slot panel (audit §3 product
 * direction: 2026-05-bundle-ladder-revenue-rebuild §user follow-up).
 *
 * Slots in order: Coffee → Dessert → Side (Garlic Bread) → Drink.
 * Default items: Espresso, Tiramisù, Garlic Bread, Limonata. Every slot
 * is admin-configurable from /admin/crosssell → Cart pairings.
 *
 * Behaviour:
 *   - Always renders the configured chips, even after the customer has
 *     added the item. The chip is the panel's shape, not a context
 *     recommendation that can vanish.
 *   - Tap the body or the + badge → addItem (which increments the qty
 *     of an existing same-id cart line). No remove-from-chip — customers
 *     decrement via the cart line itself, where the qty stepper lives.
 *   - In-cart chips render a green "×N" badge so the customer sees the
 *     running quantity without leaving the chip.
 *   - Horizontal slider with snap-x so a fifth or sixth slot wouldn't
 *     break the layout if admin adds one later (today we cap at 4 in
 *     getCartSuggestions).
 */
export function CartUpsell({ suggestions }: CartUpsellProps) {
  const addItem = useCartStore((s) => s.addItem);
  const locationSlug = useCartStore((s) => s.locationSlug);
  const items = useCartStore((s) => s.items);

  const qtyById = useMemo(() => {
    const map = new Map<string, number>();
    for (const ci of items) map.set(ci.menuItem.id, ci.quantity);
    return map;
  }, [items]);

  if (suggestions.length === 0) return null;

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 mb-2 px-5">
        <Sparkles className="h-4 w-4 text-italia-gold" />
        <p className="text-xs font-semibold text-italia-gray uppercase tracking-wide">
          Complete your meal
        </p>
      </div>
      {/* Horizontal slider — chips snap into view on touch swipe. Negative
          margin + padding bleed lets the first/last chip kiss the drawer
          edge without clipping the focus ring. scrollbar-hide is a Tailwind
          utility defined in globals.css. */}
      <div className="overflow-x-auto scrollbar-hide -mx-5 px-5">
        <div className="flex gap-2 snap-x snap-mandatory pb-1">
          {suggestions.map((suggestion) => {
            const qty = qtyById.get(suggestion.item.id) ?? 0;
            return (
              <CompleteTheMealChip
                key={suggestion.item.id}
                suggestion={suggestion}
                qty={qty}
                onAdd={() => {
                  if (locationSlug) addItem(suggestion.item, locationSlug);
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface ChipProps {
  suggestion: UpsellSuggestion;
  qty: number;
  onAdd: () => void;
}

function CompleteTheMealChip({ suggestion, qty, onAdd }: ChipProps) {
  const inCart = qty > 0;

  return (
    <button
      type="button"
      onClick={onAdd}
      aria-label={inCart ? `Add another ${suggestion.item.name}` : `Add ${suggestion.item.name}`}
      className={`relative shrink-0 snap-start w-[140px] rounded-xl border p-3 text-center transition-all animate-fade-in select-none ${
        inCart
          ? "bg-italia-green/5 border-italia-green/40 hover:border-italia-green hover:shadow-sm"
          : "bg-italia-cream border-italia-gold/15 hover:border-italia-gold/40 hover:shadow-sm hover:-translate-y-0.5 active:translate-y-0"
      }`}
    >
      {/* In-cart quantity badge — green pill bottom-left so customers see
          the running count without it competing with the + button. */}
      {inCart && (
        <span
          className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-italia-green text-white text-[10px] font-bold leading-none"
          aria-label={`${qty} in cart`}
        >
          ×{qty}
        </span>
      )}
      {/* + badge — always shown so the affordance to add (or add another)
          is unambiguous. Tapping the chip body fires the same handler so
          the badge is decorative-but-targetable. */}
      <span
        className={`absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-md transition-colors ${
          inCart ? "bg-italia-green text-white" : "bg-italia-red text-white"
        }`}
      >
        <Plus className="h-3.5 w-3.5" />
      </span>

      <div className="text-[22px] leading-none mb-1 mt-0.5" aria-hidden="true">
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
          inCart ? "text-italia-green-dark" : "text-italia-red"
        }`}
      >
        {formatPrice(suggestion.item.price)}
      </div>
    </button>
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
