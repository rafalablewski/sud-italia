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
    <div className="flex items-start gap-3 py-4 border-b border-gray-100 last:border-0">
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-italia-dark text-sm truncate">
          {item.menuItem.name}
        </h4>
        <p className="text-xs text-italia-gray mt-0.5">
          {formatPrice(item.menuItem.price)} each
        </p>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center border border-gray-200 rounded-lg">
          <button
            onClick={() =>
              updateQuantity(item.menuItem.id, item.quantity - 1)
            }
            className="p-1.5 hover:bg-gray-50 rounded-l-lg transition-colors"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-8 text-center text-sm font-medium">
            {item.quantity}
          </span>
          <button
            onClick={() =>
              updateQuantity(item.menuItem.id, item.quantity + 1)
            }
            className="p-1.5 hover:bg-gray-50 rounded-r-lg transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <span className="text-sm font-semibold text-italia-dark w-20 text-right">
          {formatPrice(item.menuItem.price * item.quantity)}
        </span>

        <button
          onClick={() => removeItem(item.menuItem.id)}
          className="p-1.5 text-gray-400 hover:text-italia-red transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
