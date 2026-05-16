"use client";

import { memo, useCallback, useMemo } from "react";
import { Plus, Sparkles } from "lucide-react";

import { useCartStore } from "@/store/cart";
import { UpsellSuggestion } from "@/lib/upsell";
import { formatPrice } from "@/lib/utils";
import type { MenuCategory, MenuItem } from "@/data/types";

interface CartUpsellProps {
  suggestions: UpsellSuggestion[];
}

/**
 * "Complete your meal" — fixed four-slot panel.
 *
 * Slots in order: Coffee → Dessert → Side (Garlic Bread) → Drink. All four
 * are admin-configurable from /admin/crosssell → Cart pairings; defaults
 * are Espresso, Tiramisù, Garlic Bread, Limonata.
 *
 * Behaviour:
 *   - Chips render even when the item is in the cart — the panel is the
 *     shape of "complete your meal," not a context-dependent recommend.
 *   - Tap the chip → addItem(); cart store's same-id handling increments
 *     the existing line. The chip shows a green ×N badge with the running
 *     quantity so the customer sees the effect without leaving the chip.
 *   - Horizontal scroll-snap so a fifth slot wouldn't break the layout.
 *
 * Performance notes:
 *   - The slider is contained within the cart drawer's px-5 padding (no
 *     negative margins). That avoids horizontal overflow on the Sheet
 *     panel, which previously made the entire drawer scroll sideways.
 *   - CompleteTheMealChip is React.memo'd and accepts a stable onAdd
 *     callback per item-id. The cart-store qty for one slot changing no
 *     longer re-renders the other three slots — only the affected chip.
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

  // Stable per-item handler keyed by id keeps React.memo on the chip honest.
  // Without this, every render produces a fresh closure and the chip re-renders.
  const handleAdd = useCallback(
    (item: MenuItem) => {
      if (locationSlug) addItem(item, locationSlug);
    },
    [addItem, locationSlug],
  );

  if (suggestions.length === 0) return null;

  return (
    <div className="px-5 mt-3">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-italia-gold" />
        <p className="text-xs font-semibold text-italia-gray uppercase tracking-wide">
          Complete your meal
        </p>
      </div>
      {/* Slider contained within the px-5 padding — no negative margins.
          touch-pan-x hints the browser to use compositor-thread panning,
          which is meaningfully smoother on iOS Safari. */}
      <div className="overflow-x-auto scrollbar-hide touch-pan-x">
        <div className="flex gap-2 snap-x snap-mandatory pb-1">
          {suggestions.map((suggestion) => (
            <CompleteTheMealChip
              key={suggestion.item.id}
              suggestion={suggestion}
              qty={qtyById.get(suggestion.item.id) ?? 0}
              onAdd={handleAdd}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface ChipProps {
  suggestion: UpsellSuggestion;
  qty: number;
  onAdd: (item: MenuItem) => void;
}

/**
 * Memoised so adding a Tiramisù doesn't re-render the Espresso, Garlic
 * Bread, and Limonata chips alongside it. Each chip only re-renders when
 * its own qty (or suggestion data) changes — meaningful on iOS where each
 * extra render costs perceptible frames during the localStorage persist.
 */
const CompleteTheMealChip = memo(function CompleteTheMealChip({
  suggestion,
  qty,
  onAdd,
}: ChipProps) {
  const inCart = qty > 0;
  const item = suggestion.item;

  // Stable click handler — the chip only re-renders when qty or suggestion
  // change, and the handler closes over those via the memoized component
  // body so it doesn't need its own useCallback.
  const handleClick = () => onAdd(item);

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={inCart ? `Add another ${item.name}` : `Add ${item.name}`}
      // No `transition-all` or `animate-fade-in` — both fire on every render
      // and cost paints. Hover effects are cheap (transform only) so they
      // stay; tactile feedback on tap is preserved by `active:translate-y-0`.
      className={`relative shrink-0 snap-start w-[140px] rounded-xl border p-3 text-center select-none ${
        inCart
          ? "bg-italia-green/5 border-italia-green/40"
          : "bg-italia-cream border-italia-gold/15 hover:border-italia-gold/40 hover:-translate-y-0.5 active:translate-y-0"
      }`}
      style={{
        // contain: layout isolates the chip's reflow so a qty badge appearing
        // doesn't trigger layout of the sibling chips.
        contain: "layout paint",
      }}
    >
      {/* Quantity badge — only mounts when in cart so the badge appearing
          is the visible "added" feedback. No animation needed; the mount
          itself is the transition. */}
      {inCart && (
        <span
          className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-italia-green text-white text-[10px] font-bold leading-none"
          aria-label={`${qty} in cart`}
        >
          ×{qty}
        </span>
      )}
      <span
        className={`absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-md ${
          inCart ? "bg-italia-green text-white" : "bg-italia-red text-white"
        }`}
      >
        <Plus className="h-3.5 w-3.5" />
      </span>

      <div className="text-[22px] leading-none mb-1 mt-0.5" aria-hidden="true">
        {categoryGlyph(item.category)}
      </div>
      <div className="text-sm font-medium text-italia-dark leading-tight truncate">
        {item.name}
      </div>
      <div className="text-[11px] text-italia-gray leading-tight truncate mt-0.5">
        {suggestion.reason}
      </div>
      <div
        className={`text-sm font-semibold mt-1.5 ${
          inCart ? "text-italia-green-dark" : "text-italia-red"
        }`}
      >
        {formatPrice(item.price)}
      </div>
    </button>
  );
});

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
