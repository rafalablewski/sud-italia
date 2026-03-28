"use client";

import { ShoppingCart } from "lucide-react";
import { useCartStore } from "@/store/cart";
import { useState } from "react";
import { CartDrawer } from "./CartDrawer";
import { formatPrice } from "@/lib/utils";

export function FloatingCartButton() {
  const [open, setOpen] = useState(false);
  const itemCount = useCartStore((s) => s.getItemCount());
  const getTotal = useCartStore((s) => s.getTotal);

  if (itemCount === 0) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-4 right-4 z-30 bg-italia-red text-white rounded-2xl shadow-lg shadow-italia-red/30 flex items-center justify-center gap-3 px-6 py-4 min-h-[56px] hover:bg-italia-red-dark transition-colors active:bg-italia-red-dark md:hidden"
      >
        <ShoppingCart className="h-5 w-5" />
        <span className="font-semibold text-base">
          {itemCount} items &middot; {formatPrice(getTotal())}
        </span>
      </button>
      <CartDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
