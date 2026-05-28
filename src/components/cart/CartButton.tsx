"use client";

import { useState } from "react";
import { useCartStore } from "@/store/cart";
import { CartDrawer } from "./CartDrawer";

// V8 Trattoria cart pill — parchment-deep bg with a Cormorant italic
// "Cart" label and a terracotta count badge. Hover state swaps the pill
// to terracotta fill with parchment text. The bag SVG matches the V8
// mockup (espresso strokes, terracotta lid detail).
export function CartButton() {
  const [open, setOpen] = useState(false);
  const itemCount = useCartStore((s) => s.getItemCount());

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Open cart${itemCount > 0 ? `, ${itemCount} items` : ""}`}
        className="v8-cart inline-flex items-center gap-[8px] bg-parchment-deep border border-line rounded-full pl-[12px] pr-[14px] py-[7px] font-heading italic text-espresso text-[14px] cursor-pointer transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden className="shrink-0">
          <path d="M3 5 L17 5 L15 14 L5 14 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M3 5 L1.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="7" cy="17" r="1.2" fill="currentColor" />
          <circle cx="13" cy="17" r="1.2" fill="currentColor" />
          <path d="M6 8 L14 8 M6 11 L14 11" stroke="#B85C38" strokeWidth="1" opacity="0.6" className="v8-cart-lines" />
        </svg>
        <span>Cart</span>
        {itemCount > 0 && (
          <span className="v8-cart-count bg-terracotta text-parchment rounded-full font-heading not-italic font-semibold text-[12px] min-w-[20px] h-[20px] px-[6px] inline-grid place-items-center transition-colors">
            {itemCount > 99 ? "99+" : itemCount}
          </span>
        )}
      </button>
      <CartDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
