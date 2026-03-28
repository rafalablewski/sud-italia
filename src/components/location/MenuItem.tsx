"use client";

import { MenuItem as MenuItemType } from "@/data/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatPrice } from "@/lib/utils";
import { useCartStore } from "@/store/cart";
import { Plus, Minus } from "lucide-react";

interface MenuItemProps {
  item: MenuItemType;
  locationSlug: string;
}

const TAG_LABELS: Record<string, { label: string; variant: "green" | "red" | "gold" | "default" }> = {
  vegetarian: { label: "Vegetarian", variant: "green" },
  vegan: { label: "Vegan", variant: "green" },
  spicy: { label: "Spicy", variant: "red" },
  "gluten-free": { label: "GF", variant: "gold" },
};

export function MenuItemCard({ item, locationSlug }: MenuItemProps) {
  const addItem = useCartStore((s) => s.addItem);
  const removeItem = useCartStore((s) => s.removeItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const cartItems = useCartStore((s) => s.items);

  const cartItem = cartItems.find((i) => i.menuItem.id === item.id);
  const quantity = cartItem?.quantity ?? 0;

  const handleAdd = () => {
    addItem(item, locationSlug);
  };

  const handleDecrement = () => {
    if (quantity <= 1) {
      removeItem(item.id);
    } else {
      updateQuantity(item.id, quantity - 1);
    }
  };

  return (
    <div className="flex items-start justify-between gap-4 p-5 bg-white rounded-2xl border border-gray-100 hover:shadow-sm transition-shadow">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-heading font-semibold text-italia-dark">
            {item.name}
          </h3>
          {item.tags.map((tag) => {
            const t = TAG_LABELS[tag];
            return t ? (
              <Badge key={tag} variant={t.variant}>
                {t.label}
              </Badge>
            ) : null;
          })}
        </div>
        <p className="text-sm text-italia-gray mt-1.5 leading-relaxed">
          {item.description}
        </p>
        <p className="text-lg font-bold text-italia-dark mt-3">
          {formatPrice(item.price)}
        </p>
      </div>

      {quantity === 0 ? (
        <Button
          onClick={handleAdd}
          variant="primary"
          size="md"
          className="flex-shrink-0 mt-1 min-h-[44px] min-w-[80px]"
          disabled={!item.available}
        >
          <Plus className="h-5 w-5 mr-1.5" /> Add
        </Button>
      ) : (
        <div className="flex items-center gap-1 flex-shrink-0 mt-1">
          <button
            onClick={handleDecrement}
            className="w-9 h-9 flex items-center justify-center rounded-full border-2 border-italia-red text-italia-red hover:bg-italia-red hover:text-white transition-colors font-bold text-lg"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-8 text-center font-bold text-italia-dark tabular-nums">
            {quantity}
          </span>
          <button
            onClick={handleAdd}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-italia-red text-white hover:bg-italia-red-dark transition-colors font-bold text-lg"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
