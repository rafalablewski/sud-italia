"use client";

import { CartItem as CartItemType } from "@/data/types";
import { formatPrice } from "@/lib/utils";
import { useCartStore } from "@/store/cart";
import { Minus, Plus, Trash2 } from "lucide-react";

interface CartItemProps {
  item: CartItemType;
}

export function CartItemRow({ item }: CartItemProps) {
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  return (
    <div className="py-4 border-b border-gray-100 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-italia-dark text-base leading-tight">
            {item.menuItem.name}
          </h4>
          <p className="text-sm text-italia-gray mt-0.5">
            {formatPrice(item.menuItem.price)} each
          </p>
        </div>
        <span className="text-base font-semibold text-italia-dark flex-shrink-0">
          {formatPrice(item.menuItem.price * item.quantity)}
        </span>
      </div>

      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center border border-gray-200 rounded-xl">
          <button
            onClick={() =>
              updateQuantity(item.menuItem.id, item.quantity - 1)
            }
            className="p-2.5 hover:bg-gray-50 rounded-l-xl transition-colors active:bg-gray-100"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-10 text-center text-base font-medium">
            {item.quantity}
          </span>
          <button
            onClick={() =>
              updateQuantity(item.menuItem.id, item.quantity + 1)
            }
            className="p-2.5 hover:bg-gray-50 rounded-r-xl transition-colors active:bg-gray-100"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <button
          onClick={() => removeItem(item.menuItem.id)}
          className="p-2.5 text-gray-400 hover:text-italia-red transition-colors active:text-italia-red"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
