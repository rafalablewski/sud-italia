"use client";

import { useCartStore } from "@/store/cart";
import { useCartUIStore } from "@/store/cart-ui";
import { useEffect, useRef, useState } from "react";

/**
 * V8 "Il tuo carrello" floating pill — bottom-right on every storefront
 * route. Parchment-cream fill that flips to terracotta on hover, with a
 * terracotta count badge inside. Hides whenever the cart drawer is open
 * (CartDrawer toggles `body.v8-cart-open`).
 *
 * Behaviour:
 *   - Renders nothing when the cart is empty (don't tease an empty cart).
 *   - Quantity-change bump animation (data-bump attribute) on every
 *     count increase — micro-feedback when an item lands while the
 *     drawer is closed.
 *   - Opens the layout-level <CartDrawer /> via
 *     useCartUIStore.setDrawerOpen(true).
 *
 * Single-mount surface: lives at (public)/layout.tsx — every storefront
 * page sees the same pill instance. No props.
 */
export function FloatingCartButton() {
  const itemCount = useCartStore((s) => s.getItemCount());
  const setDrawerOpen = useCartUIStore((s) => s.setDrawerOpen);
  const [bump, setBump] = useState(false);
  const prevCount = useRef(itemCount);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (itemCount !== prevCount.current && itemCount > prevCount.current) {
      setBump(true);
      timer = setTimeout(() => setBump(false), 360);
    }
    prevCount.current = itemCount;
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [itemCount]);

  if (itemCount === 0) return null;

  return (
    <button
      type="button"
      onClick={() => setDrawerOpen(true)}
      aria-label={`Open cart, ${itemCount} item${itemCount === 1 ? "" : "s"}`}
      className="v8-float-cart"
      data-bump={bump ? "true" : undefined}
    >
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <path d="M3 6 L19 6 L17 16 L5 16 Z" stroke="#3D2817" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M3 6 L1.5 3" stroke="#3D2817" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="8" cy="19" r="1.4" fill="#3D2817" />
        <circle cx="14" cy="19" r="1.4" fill="#3D2817" />
        <path d="M6 9 L16 9 M6 12 L16 12" stroke="#B85C38" strokeWidth="1" opacity="0.6" />
      </svg>
      <span>
        Cart <span className="v8-float-cart-label-sec">· il tuo carrello</span>
      </span>
      <span className="v8-float-cart-count">{itemCount > 99 ? "99+" : itemCount}</span>
    </button>
  );
}
