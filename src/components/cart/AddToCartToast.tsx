"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";

import { useCartStore } from "@/store/cart";
import { getCartSuggestions, type UpsellConfig } from "@/lib/upsell";
import type { MenuItem } from "@/data/types";

interface AddToCartToastProps {
  allMenuItems: MenuItem[];
  upsellConfig?: UpsellConfig | null;
}

interface ToastBody {
  id: number;
  title: string;
  seed: string | null;
}

const TOAST_DURATION_MS = 4000;

/**
 * Inline add-to-cart toast — audit §2.1 T+0 "item added":
 *
 *   "🍕 Margherita added. Customers usually add an espresso."
 *
 * Seed-only copy, no CTA, no block. Slides in from the top of the viewport,
 * auto-dismisses in 4s. Portal-mounted to document.body so it escapes the
 * admin-shell stacking context (per CLAUDE.md rule #4 — same reason cart
 * drawers and other overlays portal).
 *
 * Subscribes to useCartStore and fires whenever a new item lands or an
 * existing line's quantity increases. The "seed" copy comes from
 * getCartSuggestions() — the same upsell rules the cart drawer uses, so the
 * recommendation here is consistent with what the customer sees once they
 * open the drawer.
 */
export function AddToCartToast({
  allMenuItems,
  upsellConfig,
}: AddToCartToastProps) {
  const items = useCartStore((s) => s.items);
  const prevQtyById = useRef<Map<string, number>>(new Map());
  const [mounted, setMounted] = useState(false);
  const [toast, setToast] = useState<ToastBody | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Prime previous-quantity map on first render so we don't fire a toast
    // for items that were already in the persisted cart on page load.
    prevQtyById.current = new Map(
      items.map((i) => [i.menuItem.id, i.quantity]),
    );
    // We intentionally only seed once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mounted) return;

    // Find which line just grew (newly added or quantity incremented).
    let justAdded: MenuItem | null = null;
    for (const line of items) {
      const prev = prevQtyById.current.get(line.menuItem.id) ?? 0;
      if (line.quantity > prev) {
        justAdded = line.menuItem;
        break;
      }
    }

    // Rebuild the quantity snapshot for next diff (whether or not we toasted).
    prevQtyById.current = new Map(
      items.map((i) => [i.menuItem.id, i.quantity]),
    );

    if (!justAdded) return;

    // Compute seed copy from the existing upsell rules. We omit the just-
    // added item from the suggestion call's "current cart" to avoid the case
    // where the just-added item IS the suggestion candidate.
    const suggestions = getCartSuggestions(
      items,
      allMenuItems,
      1,
      upsellConfig ?? null,
    );
    const suggestion = suggestions[0]?.item;
    const seed = suggestion
      ? `Customers usually add ${articled(suggestion.name)}.`
      : null;

    setToast({
      id: Date.now(),
      title: `${justAdded.name} added`,
      seed,
    });
  }, [items, allMenuItems, upsellConfig, mounted]);

  // Auto-dismiss the toast 4s after it appears (id changes whenever a new
  // toast supersedes the previous one).
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
      className="fixed inset-x-0 top-3 z-[60] flex justify-center px-4 pointer-events-none sm:top-4"
    >
      <div
        className={`flex items-start gap-3 max-w-md w-full sm:w-auto bg-white border border-italia-gold/30 rounded-xl shadow-lg px-4 py-3 pointer-events-auto transition-all duration-300 ${
          visible
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-2"
        }`}
      >
        <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-italia-gold/15 text-italia-gold-dark flex items-center justify-center">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-italia-dark leading-tight">
            {toast.title}
          </p>
          {toast.seed && (
            <p className="text-xs text-italia-gray mt-0.5 leading-snug">
              {toast.seed}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** "a espresso" reads wrong; "an espresso" reads right. Picks indefinite
 *  article by first phoneme of the item name. We don't go full Webster on
 *  it — the menu is small enough that the vowel rule is sufficient. */
function articled(name: string): string {
  const first = name.trim().charAt(0).toLowerCase();
  const startsVowel = ["a", "e", "i", "o", "u"].includes(first);
  return `${startsVowel ? "an" : "a"} ${name.toLowerCase()}`;
}
