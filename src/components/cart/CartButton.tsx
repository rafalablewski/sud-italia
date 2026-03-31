"use client";

import { ShoppingCart } from "lucide-react";
import { useCartStore } from "@/store/cart";
import { formatPrice } from "@/lib/utils";
import { useState } from "react";
import { CartDrawer } from "./CartDrawer";

export function CartButton() {
  const [open, setOpen] = useState(false);
  const itemCount = useCartStore((s) => s.getItemCount());
  const total = useCartStore((s) => s.getTotal());

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`relative rounded-lg hover:bg-gray-100 transition-colors min-h-[44px] flex items-center justify-center ${
          itemCount > 0 ? "gap-1.5 px-3" : "p-2.5 min-w-[44px]"
        }`}
        aria-label={`Open cart${itemCount > 0 ? `, ${itemCount} items, ${formatPrice(total)}` : ""}`}
      >
        <ShoppingCart className="h-5 w-5 text-italia-dark" />
        {itemCount > 0 && (
          <>
            <span className="text-sm font-semibold text-italia-dark hidden sm:inline">
              {formatPrice(total)}
            </span>
            <span className="absolute -top-1 -right-1 bg-italia-red text-white text-[10px] font-bold rounded-full h-4.5 w-4.5 flex items-center justify-center sm:hidden">
              {itemCount > 9 ? "9+" : itemCount}
            </span>
          </>
        )}
      </button>
      <CartDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
