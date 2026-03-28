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
        className="fixed bottom-6 right-6 z-30 bg-italia-red text-white rounded-full shadow-lg shadow-italia-red/30 flex items-center gap-3 px-5 py-3.5 hover:bg-italia-red-dark transition-colors md:hidden"
      >
        <ShoppingCart className="h-5 w-5" />
        <span className="font-semibold text-sm">
          {itemCount} items &middot; {formatPrice(getTotal())}
        </span>
      </button>
      <CartDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
