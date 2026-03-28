"use client";

import { ShoppingCart } from "lucide-react";
import { useCartStore } from "@/store/cart";
import { useState } from "react";
import { CartDrawer } from "./CartDrawer";

export function CartButton() {
  const [open, setOpen] = useState(false);
  const itemCount = useCartStore((s) => s.getItemCount());

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative p-2.5 rounded-lg hover:bg-gray-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label="Open cart"
      >
        <ShoppingCart className="h-5 w-5 text-italia-dark" />
        {itemCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-italia-red text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
            {itemCount > 9 ? "9+" : itemCount}
          </span>
        )}
      </button>
      <CartDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
