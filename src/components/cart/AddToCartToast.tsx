"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useCartStore } from "@/store/cart";
import { useCartUIStore } from "@/store/cart-ui";
import { getCartSuggestions, type UpsellConfig } from "@/lib/upsell";
import type { MenuItem } from "@/data/types";

interface AddToCartToastProps {
  /** Optional override for the menu items used to compute the cross-sell
   *  seed. Defaults to the active location's menu read from
   *  useCartUIStore (seeded by <MenuItemsRegistrar />). */
  allMenuItems?: MenuItem[];
  upsellConfig?: UpsellConfig | null;
}

interface ToastBody {
  id: number;
  itemName: string;
  seed: string | null;
}

const TOAST_DURATION_MS = 4000;

/**
 * V8 add-to-cart toast — audit §2.1 T+0 "item added":
 *
 *   "Margherita added · aggiunto al carrello"
 *   "Customers usually add an espresso."
 *
 * Slides up from the bottom of the viewport (espresso paper card,
 * Cormorant italic title in parchment, Lora italic seed in muted
 * parchment). Auto-dismisses in 4s. Portalled to document.body so it
 * escapes any stacking context (CLAUDE rule 4).
 *
 * Subscribes to useCartStore and fires whenever a new line lands or an
 * existing line's quantity increases. The seed copy comes from
 * getCartSuggestions() — the same upsell rules the cart drawer uses,
 * so the recommendation is consistent between the toast and the drawer.
 *
 * Single-mount surface: lives at (public)/layout.tsx — every storefront
 * page that can mutate the cart shares one toast. Menu items used by
 * the seed flow through useCartUIStore (seeded by MenuItemsRegistrar
 * on the location page). Pages without a location see the toast title
 * without a seed line.
 */
export function AddToCartToast({
  allMenuItems,
  upsellConfig,
}: AddToCartToastProps = {}) {
  const items = useCartStore((s) => s.items);
  const storeMenuItems = useCartUIStore((s) => s.menuItems);
  const menuItems = allMenuItems ?? storeMenuItems;
  const prevQtyById = useRef<Map<string, number>>(new Map());
  const [mounted, setMounted] = useState(false);
  const [toast, setToast] = useState<ToastBody | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Prime previous-quantity map on first render so we don't fire a toast
    // for items already in the persisted cart on page load.
    prevQtyById.current = new Map(
      items.map((i) => [i.menuItem.id, i.quantity]),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mounted) return;

    let justAdded: MenuItem | null = null;
    for (const line of items) {
      const prev = prevQtyById.current.get(line.menuItem.id) ?? 0;
      if (line.quantity > prev) {
        justAdded = line.menuItem;
        break;
      }
    }

    prevQtyById.current = new Map(
      items.map((i) => [i.menuItem.id, i.quantity]),
    );

    if (!justAdded) return;

    const suggestions = getCartSuggestions(
      items,
      menuItems,
      1,
      upsellConfig ?? null,
    );
    const suggestion = suggestions[0]?.item;
    const seed = suggestion
      ? `Customers usually add ${articled(suggestion.name)}.`
      : null;

    setToast({
      id: Date.now(),
      itemName: justAdded.name,
      seed,
    });
  }, [items, menuItems, upsellConfig, mounted]);

  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const dismissTimer = setTimeout(() => setVisible(false), TOAST_DURATION_MS);
    const clearTimer = setTimeout(
      () => setToast((t) => (t?.id === toast.id ? null : t)),
      TOAST_DURATION_MS + 350,
    );
    return () => {
      clearTimeout(dismissTimer);
      clearTimeout(clearTimer);
    };
  }, [toast]);

  if (!mounted || !toast) return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className={`v8-cart-toast${visible ? " is-show" : ""}`}
    >
      <span className="v8-cart-toast-illus" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M9 1.5 L11 6.5 L16.5 7 L12.5 10.5 L13.5 16 L9 13 L4.5 16 L5.5 10.5 L1.5 7 L7 6.5 Z"
                fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      </span>
      <div className="v8-cart-toast-body">
        <div className="v8-cart-toast-title">
          <em>{toast.itemName}</em> added
          <span className="v8-cart-toast-title-it">· aggiunto al carrello</span>
        </div>
        {toast.seed && (
          <div className="v8-cart-toast-seed">{toast.seed}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** "a espresso" reads wrong; "an espresso" reads right. Picks indefinite
 *  article by first phoneme of the item name. */
function articled(name: string): string {
  const first = name.trim().charAt(0).toLowerCase();
  const startsVowel = ["a", "e", "i", "o", "u"].includes(first);
  return `${startsVowel ? "an" : "a"} ${name.toLowerCase()}`;
}
