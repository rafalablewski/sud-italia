"use client";

import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { useCartStore } from "@/store/cart";
import { CartItemRow } from "./CartItem";
import { formatPrice } from "@/lib/utils";
import { ShoppingCart, Trash2 } from "lucide-react";
import { useState } from "react";

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function CartDrawer({ open, onClose }: CartDrawerProps) {
  const items = useCartStore((s) => s.items);
  const getTotal = useCartStore((s) => s.getTotal);
  const clearCart = useCartStore((s) => s.clearCart);
  const locationSlug = useCartStore((s) => s.locationSlug);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const total = getTotal();

  const handleCheckout = async () => {
    if (!customerName.trim() || !customerPhone.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            id: i.menuItem.id,
            name: i.menuItem.name,
            price: i.menuItem.price,
            quantity: i.quantity,
          })),
          locationSlug,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          total,
        }),
      });

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        clearCart();
        setCustomerName("");
        setCustomerPhone("");
        onClose();
        window.location.href = `/order-confirmation?orderId=${data.orderId}&location=${locationSlug}`;
      }
    } catch {
      alert("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const canCheckout = customerName.trim().length > 0 && customerPhone.trim().length > 0;

  return (
    <Sheet open={open} onClose={onClose} title="Your Order">
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-italia-gray">
          <ShoppingCart className="h-12 w-12 mb-4 opacity-30" />
          <p className="font-medium text-lg">Your cart is empty</p>
          <p className="text-sm mt-1">Add items from the menu to get started</p>
        </div>
      ) : (
        <div className="flex flex-col h-full">
          {/* Items list */}
          <div className="flex-1 px-5 overflow-y-auto">
            {items.map((item) => (
              <CartItemRow key={item.menuItem.id} item={item} />
            ))}
          </div>

          {/* Single-step checkout footer — name, phone, and pay all visible */}
          <div className="border-t border-gray-100 p-5 space-y-3 bg-gray-50">
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Your name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="flex-1 px-4 py-3 min-h-[44px] border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-italia-red focus:border-transparent"
              />
              <input
                type="tel"
                placeholder="Phone"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-[130px] px-4 py-3 min-h-[44px] border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-italia-red focus:border-transparent"
              />
            </div>

            <div className="flex justify-between items-center text-lg font-bold pt-1">
              <span>Total</span>
              <span className="text-italia-red">{formatPrice(total)}</span>
            </div>

            <Button
              onClick={handleCheckout}
              disabled={isSubmitting || !canCheckout}
              className="w-full min-h-[52px]"
              size="lg"
            >
              {isSubmitting
                ? "Processing..."
                : canCheckout
                  ? `Pay ${formatPrice(total)}`
                  : "Enter name & phone to order"}
            </Button>

            <button
              onClick={() => clearCart()}
              className="w-full flex items-center justify-center gap-2 text-sm py-2 min-h-[44px] text-italia-gray hover:text-italia-red active:text-italia-red transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Clear cart
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
