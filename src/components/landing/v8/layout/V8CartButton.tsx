"use client";

import { useState } from "react";
import { useCartStore } from "@/store/cart";
import { V8CartDrawer } from "./V8CartDrawer";
import { Bi } from "../Bi";

/**
 * V8-styled cart trigger for the parchment header. Reads the same
 * Zustand store as the legacy CartButton, opens V8CartDrawer.
 */
export function V8CartButton() {
  const [open, setOpen] = useState(false);
  const itemCount = useCartStore((s) => s.getItemCount());

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="v8-cart-btn"
        aria-label={`Open cart${itemCount > 0 ? `, ${itemCount} items` : ""}`}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 22 22"
          fill="none"
          aria-hidden="true"
        >
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
        <span className="v8-cart-btn-label">
          <Bi en="Cart" pl="Koszyk" />
        </span>
        {itemCount > 0 && (
          <span className="v8-cart-btn-badge v8-num" aria-hidden="true">
            {itemCount > 99 ? "99+" : itemCount}
          </span>
        )}
      </button>
      <V8CartDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
