"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useCartStore } from "@/store/cart";
import { V8CartDrawer } from "./V8CartDrawer";
import { Bi } from "../Bi";

/**
 * Floating "Il tuo carrello" pill at the bottom-right. Only renders
 * when the cart has at least one item — once you add something, this
 * pill follows you down the page so the checkout flow stays one tap
 * away even when the header scrolls past.
 */
export function V8FloatingCart() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const itemCount = useCartStore((s) => s.getItemCount());

  useEffect(() => setMounted(true), []);
  if (!mounted || itemCount === 0) return null;

  const pill = (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="v8-float-cart"
        aria-label={`Open cart, ${itemCount} items`}
      >
        <svg width="18" height="18" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <path
            d="M3 4 L6 4 L8 16 L19 16 L21 8 L7 8"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <circle cx="10" cy="19" r="1.4" fill="currentColor" />
          <circle cx="17" cy="19" r="1.4" fill="currentColor" />
        </svg>
        <span className="v8-float-cart-label">
          <span className="v8-it">Il tuo carrello</span>
        </span>
        <span className="v8-float-cart-badge v8-num" aria-hidden="true">
          {itemCount > 99 ? "99+" : itemCount}
        </span>
      </button>
      <V8CartDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );

  return createPortal(pill, document.body);
}
