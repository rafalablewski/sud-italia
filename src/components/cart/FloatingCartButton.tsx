"use client";

import { ChevronRight } from "lucide-react";
import { useCartStore } from "@/store/cart";
import { useCartUIStore } from "@/store/cart-ui";
import { useState, useEffect, useRef } from "react";
import { formatPrice } from "@/lib/utils";

/**
 * Mobile-only persistent in-thumb-reach order surface. Still on its
 * pre-V8 chrome (Step 12 will port to `.v8-float-cart`); Step 11's
 * follow-up just stops it from mounting its own CartDrawer instance —
 * the single layout-level drawer now handles the open state via
 * `useCartUIStore`.
 *
 * `allMenuItems` is accepted for API stability (callers still pass it)
 * but ignored — the active menu flows through `<MenuItemsRegistrar />`
 * into the same UI store.
 */
export function FloatingCartButton(_props: { allMenuItems?: unknown } = {}) {
  const itemCount = useCartStore((s) => s.getItemCount());
  const getTotal = useCartStore((s) => s.getTotal);
  const setDrawerOpen = useCartUIStore((s) => s.setDrawerOpen);
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
    <div className="floating-cart-bar md:hidden">
      <div onClick={() => setDrawerOpen(true)} className="floating-cart-bar-inner">
        <div className="flex items-center gap-3">
          <div className={`cart-count-badge ${animateCount ? "animate-bounce-in" : ""}`}>
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
  );
}
