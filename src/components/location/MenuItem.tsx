"use client";

import { MenuItem as MenuItemType } from "@/data/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatPrice } from "@/lib/utils";
import { useCartStore } from "@/store/cart";
import { Plus, Check } from "lucide-react";
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
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(false), 1200);
    return () => clearTimeout(timer);
  }, [added]);

  const handleAdd = () => {
    addItem(item, locationSlug);
    setAdded(true);
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

      <Button
        onClick={handleAdd}
        variant={added ? "secondary" : "primary"}
        size="md"
        className="flex-shrink-0 mt-1 min-h-[44px] min-w-[80px]"
        disabled={!item.available}
      >
        {added ? (
          <>
            <Check className="h-5 w-5 mr-1.5" /> Added
          </>
        ) : (
          <>
            <Plus className="h-5 w-5 mr-1.5" /> Add
          </>
        )}
      </Button>
    </div>
  );
}
