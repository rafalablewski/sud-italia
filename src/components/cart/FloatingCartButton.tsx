"use client";

import { ShoppingBag, ChevronRight } from "lucide-react";
import { useCartStore } from "@/store/cart";
import { useState, useEffect, useRef } from "react";
import { CartDrawer } from "./CartDrawer";
import { formatPrice } from "@/lib/utils";

export function FloatingCartButton() {
  const [open, setOpen] = useState(false);
  const itemCount = useCartStore((s) => s.getItemCount());
  const getTotal = useCartStore((s) => s.getTotal);
  const [animateCount, setAnimateCount] = useState(false);
  const prevCount = useRef(itemCount);

  // Animate badge when count changes
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (itemCount !== prevCount.current && itemCount > 0) {
      setAnimateCount(true);
      timer = setTimeout(() => setAnimateCount(false), 300);
    }
    prevCount.current = itemCount;
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [itemCount]);

  if (itemCount === 0) return null;

  return (
    <>
      {/* Uber Eats-style floating cart bar */}
      <div className="floating-cart-bar md:hidden">
        <div
          onClick={() => setOpen(true)}
          className="floating-cart-bar-inner"
        >
          <div className="flex items-center gap-3">
            <div
              className={`cart-count-badge ${animateCount ? "animate-bounce-in" : ""}`}
            >
              {itemCount}
            </div>
            <span className="font-semibold text-base">View Cart</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-base">{formatPrice(getTotal())}</span>
            <ChevronRight className="h-4 w-4 opacity-70" />
          </div>
        </div>
      </div>
      <CartDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
