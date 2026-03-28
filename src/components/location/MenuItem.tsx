"use client";

import { MenuItem as MenuItemType } from "@/data/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatPrice } from "@/lib/utils";
import { useCartStore } from "@/store/cart";
import { Plus, Minus, ShoppingCart, Check } from "lucide-react";
import { useState, useEffect } from "react";

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
  const [justAdded, setJustAdded] = useState(false);

  const cartItem = cartItems.find((i) => i.menuItem.id === item.id);
  const quantity = cartItem?.quantity ?? 0;
  const inCart = quantity > 0;

  useEffect(() => {
    if (!justAdded) return;
    const timer = setTimeout(() => setJustAdded(false), 1500);
    return () => clearTimeout(timer);
  }, [justAdded]);

  const handleAdd = () => {
    addItem(item, locationSlug);
    setJustAdded(true);
  };

  const handleDecrement = () => {
    if (quantity <= 1) {
      removeItem(item.id);
    } else {
      updateQuantity(item.id, quantity - 1);
    }
  };

  return (
    <div
      className={`relative flex items-start justify-between gap-4 p-5 rounded-2xl border transition-all duration-300 ${
        inCart
          ? "bg-italia-green/[0.03] border-italia-green/30 border-l-4 border-l-italia-green"
          : "bg-white border-gray-100 hover:shadow-sm"
      }`}
    >
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
        <div className="flex items-center gap-3 mt-3">
          <p className="text-lg font-bold text-italia-dark">
            {formatPrice(item.price)}
          </p>
          {inCart && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-italia-green">
              <ShoppingCart className="h-3 w-3" />
              {quantity} in cart
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end gap-2 flex-shrink-0 mt-1">
        {quantity === 0 ? (
          <Button
            onClick={handleAdd}
            variant="primary"
            size="md"
            className="min-h-[44px] min-w-[80px]"
            disabled={!item.available}
          >
            <Plus className="h-5 w-5 mr-1.5" /> Add
          </Button>
        ) : (
          <div className="flex items-center gap-1">
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

        {/* Brief confirmation toast */}
        {justAdded && (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-italia-green text-white text-xs font-semibold rounded-lg animate-fade-in">
            <Check className="h-3 w-3" /> Added!
          </span>
        )}
      </div>
    </div>
  );
}
