"use client";

import { useState } from "react";
import { useCartStore } from "@/store/cart";
import { formatPrice } from "@/lib/utils";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { Bi } from "../Bi";

/**
 * V8-styled cart trigger. Reads the same Zustand store as the legacy
 * CartButton, opens the same CartDrawer — only the chrome is restyled
 * to fit the parchment header. Rewriting the drawer body is a
 * separate, much larger task.
 */
export function V8CartButton() {
  const [open, setOpen] = useState(false);
  const itemCount = useCartStore((s) => s.getItemCount());
  const total = useCartStore((s) => s.getTotal());

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="v8-cart-btn"
        aria-label={`Open cart${itemCount > 0 ? `, ${itemCount} items, ${formatPrice(total)}` : ""}`}
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
        {itemCount > 0 ? (
          <span className="v8-cart-btn-total v8-num">{formatPrice(total)}</span>
        ) : (
          <span className="v8-cart-btn-label">
            <Bi en="Cart" pl="Koszyk" />{" "}
            <span className="v8-it v8-cart-btn-it">· carrello</span>
          </span>
        )}
        {itemCount > 0 && (
          <span className="v8-cart-btn-badge v8-num" aria-hidden="true">
            {itemCount > 9 ? "9+" : itemCount}
          </span>
        )}
      </button>
      <CartDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
