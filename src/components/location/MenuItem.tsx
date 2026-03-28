"use client";

import { MenuItem as MenuItemType } from "@/data/types";
import { CATEGORY_ICONS, CATEGORY_COLORS } from "@/data/menu-ui";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatPrice } from "@/lib/utils";
import { getItemBadges, BADGE_CONFIG, BadgeType } from "@/lib/upsell";
import { useCartStore } from "@/store/cart";
import { Plus, Minus, Check, TrendingUp, Award, Zap, Star } from "lucide-react";
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

const BADGE_ICONS: Record<BadgeType, React.ElementType> = {
  popular: TrendingUp,
  "staff-pick": Award,
  new: Zap,
  "best-value": Star,
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

  const badges = getItemBadges(item.id, locationSlug);

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

  const Icon = CATEGORY_ICONS[item.category];
  const iconColor = CATEGORY_COLORS[item.category] || "bg-gray-50 text-gray-500";

  return (
    <div
      className={`relative flex gap-4 p-4 rounded-2xl border transition-all duration-300 ${
        inCart
          ? "bg-italia-green/[0.03] border-italia-green/30 shadow-sm shadow-italia-green/5"
          : "bg-white border-gray-100 hover:shadow-md hover:border-gray-200"
      }`}
    >
      {/* Social proof badge ribbon */}
      {badges.length > 0 && (
        <div className="absolute -top-2 right-3 flex gap-1">
          {badges.map((badge) => {
            const config = BADGE_CONFIG[badge];
            const BadgeIcon = BADGE_ICONS[badge];
            return (
              <span
                key={badge}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${config.color} shadow-sm`}
              >
                <BadgeIcon className="h-3 w-3" />
                {config.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Food category icon */}
      <div className={`flex-shrink-0 w-14 h-14 rounded-xl flex items-center justify-center ${iconColor}`}>
        {Icon && <Icon className="h-7 w-7" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
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
            <p className="text-sm text-italia-gray mt-1 leading-relaxed line-clamp-2">
              {item.description}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between mt-3">
          <p className="text-lg font-bold text-italia-dark">
            {formatPrice(item.price)}
          </p>

          <div className="flex items-center gap-2">
            {/* Quantity in cart indicator */}
            {inCart && !justAdded && (
              <span className="text-xs font-semibold text-italia-green animate-fade-in">
                {quantity} in cart
              </span>
            )}

            {/* Added confirmation */}
            {justAdded && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-italia-green text-white text-xs font-semibold rounded-lg animate-bounce-in">
                <Check className="h-3 w-3" /> Added!
              </span>
            )}

            {/* Quantity controls */}
            {quantity === 0 ? (
              <Button
                onClick={handleAdd}
                variant="primary"
                size="sm"
                className="min-h-[40px] min-w-[72px] rounded-xl"
                disabled={!item.available}
              >
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            ) : (
              <div className="flex items-center gap-0.5 bg-gray-50 rounded-xl p-0.5">
                <button
                  onClick={handleDecrement}
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-italia-red hover:bg-red-50 transition-colors shadow-sm"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-8 text-center font-bold text-italia-dark tabular-nums text-sm">
                  {quantity}
                </span>
                <button
                  onClick={handleAdd}
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-italia-red text-white hover:bg-italia-red-dark transition-colors shadow-sm"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
