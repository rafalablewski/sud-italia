"use client";

import { memo, useCallback, useMemo } from "react";

import { useCartStore } from "@/store/cart";
import { UpsellSuggestion } from "@/lib/upsell";
import { formatPrice } from "@/lib/utils";
import type { MenuCategory, MenuItem } from "@/data/types";

interface CartUpsellProps {
  suggestions: UpsellSuggestion[];
}

/**
 * "Pairs beautifully with —" — sommelier-style cross-sell rail.
 *
 * V8 reskin of the audit §2.2 four-slot panel. Same wiring (admin-tunable
 * via /admin/crosssell → Cart pairings; defaults Espresso, Tiramisù,
 * Garlic Bread, Limonata), same getCartSuggestions() upstream ranking.
 * Visually it now reads as a list of paper-card rows instead of a
 * horizontal pill slider — each row carries the dish glyph, italic
 * Cormorant name, italic sourcing copy, tabular price, and a terracotta
 * italic "Add · aggiungi" text button.
 *
 * Behaviour preserved:
 *   - Tap a row's Add → addItem; same-id increments the existing line.
 *   - Once added, the button flips to basil-deep "Added · aggiunto ×N"
 *     and stays tappable for another increment.
 *   - Memoised per-item so a Tiramisù add doesn't re-render the Espresso row.
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

  const handleAdd = useCallback(
    (item: MenuItem) => {
      if (locationSlug) addItem(item, locationSlug);
    },
    [addItem, locationSlug],
  );

  if (suggestions.length === 0) return null;

  return (
    <div className="v8-cart-pairs">
      <div className="v8-cart-pairs-kicker">Tonight&apos;s pairing · l&apos;abbinamento di stasera</div>
      <h3 className="v8-cart-pairs-title">Pairs beautifully with —</h3>
      <div className="v8-cart-pairs-sub">Our pizzaiolo suggests, sommelier-style.</div>
      {suggestions.slice(0, 4).map((suggestion) => (
        <PairRow
          key={suggestion.item.id}
          suggestion={suggestion}
          qty={qtyById.get(suggestion.item.id) ?? 0}
          onAdd={handleAdd}
        />
      ))}
    </div>
  );
}

interface PairProps {
  suggestion: UpsellSuggestion;
  qty: number;
  onAdd: (item: MenuItem) => void;
}

const PairRow = memo(function PairRow({ suggestion, qty, onAdd }: PairProps) {
  const inCart = qty > 0;
  const item = suggestion.item;

  return (
    <div className="v8-cart-pair">
      <div className="v8-cart-pair-illus" aria-hidden="true">
        <PairGlyph category={item.category} />
      </div>
      <div className="v8-cart-pair-body">
        <div className="v8-cart-pair-name">{item.name}</div>
        <div className="v8-cart-pair-origin">{suggestion.reason}</div>
        <div className="v8-cart-pair-meta">
          <span className="v8-cart-pair-price">{formatPrice(item.price)}</span>
          <button
            type="button"
            onClick={() => onAdd(item)}
            className={`v8-cart-pair-add${inCart ? " is-added" : ""}`}
            aria-label={inCart ? `Add another ${item.name}` : `Add ${item.name}`}
          >
            {inCart ? <>added · aggiunto <span style={{ fontFamily: "var(--font-body)", fontStyle: "normal", marginLeft: 2 }}>×{qty}</span></> : <>+ Add · aggiungi</>}
          </button>
        </div>
      </div>
    </div>
  );
});

/** SVG glyph per category — matches the V8 mockup's hand-drawn pair illus. */
function PairGlyph({ category }: { category: MenuCategory }) {
  switch (category) {
    case "drinks":
      return (
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
          <rect x="11" y="9" width="14" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" fill="#E6C97A" fillOpacity="0.3" />
          <path d="M14 9 L14 5 L22 5 L22 9" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="18" cy="19" r="3" stroke="#C9A23E" strokeWidth="1.2" fill="#C9A23E" fillOpacity="0.4" />
          <path d="M18 16 L18 22 M15 19 L21 19" stroke="#C9A23E" strokeWidth="1" />
        </svg>
      );
    case "desserts":
      return (
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
          <rect x="7" y="14" width="22" height="14" rx="1.5" stroke="#3D2817" strokeWidth="1.5" fill="#C9A23E" fillOpacity="0.25" />
          <path d="M7 18 L29 18" stroke="#3D2817" strokeWidth="1.2" />
          <path d="M7 22 L29 22" stroke="#3D2817" strokeWidth="1.2" />
          <path d="M11 14 L11 10 L25 10 L25 14" stroke="#3D2817" strokeWidth="1.5" />
          <circle cx="13" cy="20" r="0.6" fill="#3D2817" />
          <circle cx="18" cy="20" r="0.6" fill="#3D2817" />
          <circle cx="23" cy="20" r="0.6" fill="#3D2817" />
        </svg>
      );
    case "antipasti":
      return (
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
          <ellipse cx="18" cy="20" rx="13" ry="5" stroke="#B85C38" strokeWidth="1.5" fill="#E6C97A" fillOpacity="0.4" />
          <path d="M9 18 C 12 17, 24 17, 27 18" stroke="#B85C38" strokeWidth="1" fill="none" />
          <path d="M9 22 C 12 23, 24 23, 27 22" stroke="#B85C38" strokeWidth="1" fill="none" />
          <circle cx="14" cy="20" r="0.8" fill="#4A7C59" />
          <circle cx="22" cy="20" r="0.8" fill="#4A7C59" />
        </svg>
      );
    case "panini":
      return (
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
          <path d="M6 14 C 6 11, 9 9, 18 9 C 27 9, 30 11, 30 14 L 30 22 C 30 25, 27 27, 18 27 C 9 27, 6 25, 6 22 Z" stroke="#B85C38" strokeWidth="1.5" fill="#E6C97A" fillOpacity="0.4" />
          <path d="M6 18 L30 18" stroke="#4A7C59" strokeWidth="1.2" />
        </svg>
      );
    case "pasta":
      return (
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
          <circle cx="18" cy="20" r="11" stroke="#C9A23E" strokeWidth="1.5" fill="#F2E2C2" />
          <path d="M11 19 C 13 16, 17 16, 19 19 C 21 22, 25 22, 27 19" stroke="#C9A23E" strokeWidth="1.2" fill="none" />
          <path d="M11 23 C 13 20, 17 20, 19 23 C 21 26, 25 26, 27 23" stroke="#B85C38" strokeWidth="1.2" fill="none" />
        </svg>
      );
    case "pizza":
    default:
      return (
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
          <path d="M5 28 L18 6 L31 28 Z" fill="#C9A23E" fillOpacity="0.18" stroke="#B85C38" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M5 28 L31 28" stroke="#7A2B2B" strokeWidth="1.5" />
          <circle cx="14" cy="21" r="1.6" fill="#7A2B2B" />
          <circle cx="22" cy="18" r="1.6" fill="#7A2B2B" />
          <circle cx="18" cy="24" r="1.6" fill="#7A2B2B" />
          <circle cx="17" cy="15" r="1.2" fill="#4A7C59" />
        </svg>
      );
  }
}
