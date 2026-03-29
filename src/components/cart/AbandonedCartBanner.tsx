"use client";

import { useState, useEffect } from "react";
import { useCartStore } from "@/store/cart";
import { ShoppingBag, X, Clock, ArrowRight } from "lucide-react";

interface AbandonedCartBannerProps {
  onOpenCart: () => void;
}

export function AbandonedCartBanner({ onOpenCart }: AbandonedCartBannerProps) {
  const items = useCartStore((s) => s.items);
  const getTotal = useCartStore((s) => s.getTotal);
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Show banner if user has items in cart and has been idle for 30 seconds
  useEffect(() => {
    if (items.length === 0 || dismissed) {
      setShow(false);
      return;
    }

    const timer = setTimeout(() => {
      setShow(true);
    }, 30000); // 30 seconds of "inactivity" with items in cart

    return () => clearTimeout(timer);
  }, [items.length, dismissed]);

  if (!show || items.length === 0) return null;

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-md animate-slide-up">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-italia-red/10 flex items-center justify-center flex-shrink-0">
          <ShoppingBag className="h-5 w-5 text-italia-red" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-italia-dark">
            Still hungry? 🍕
          </p>
          <p className="text-xs text-italia-gray">
            You have {itemCount} item{itemCount !== 1 ? "s" : ""} waiting in your cart
          </p>
        </div>
        <button
          onClick={() => {
            onOpenCart();
            setShow(false);
          }}
          className="flex-shrink-0 flex items-center gap-1 px-3 py-2 bg-italia-red text-white text-xs font-semibold rounded-xl hover:bg-italia-red-dark transition-colors"
        >
          Checkout
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => {
            setDismissed(true);
            setShow(false);
          }}
          className="flex-shrink-0 p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
