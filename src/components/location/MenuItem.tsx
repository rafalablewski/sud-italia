"use client";

import { MenuItem as MenuItemType } from "@/data/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { MenuItemImage } from "./MenuItemImage";
import { formatPrice } from "@/lib/utils";
import { getItemBadges, BADGE_CONFIG, BadgeType } from "@/lib/upsell";
import { StarRating } from "@/components/rating/StarRating";
import { getItemRating } from "@/data/ratings";
import { getItemDetails } from "@/data/kodawari";
import { ItemDetailDrawer } from "./ItemDetailDrawer";
import { useCartStore } from "@/store/cart";
import { Plus, Minus, Check, TrendingUp, Award, Zap, Star, Clock, Flame, Info } from "lucide-react";
import { useState, useEffect } from "react";

interface MenuItemProps {
  item: MenuItemType;
  locationSlug: string;
  /** From real 7-day order counts at this location */
  popularThisWeek?: boolean;
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

export function MenuItemCard({
  item,
  locationSlug,
  popularThisWeek = false,
}: MenuItemProps) {
  const addItem = useCartStore((s) => s.addItem);
  const removeItem = useCartStore((s) => s.removeItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const cartItems = useCartStore((s) => s.items);
  const [justAdded, setJustAdded] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const cartItem = cartItems.find((i) => i.menuItem.id === item.id);
  const quantity = cartItem?.quantity ?? 0;
  const inCart = quantity > 0;

  const badges = getItemBadges(item.id, locationSlug);
  const itemRating = getItemRating(item.id);
  const details = getItemDetails(item.id);

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

  const isPopular = badges.includes("popular");

  const hasMetaStrip = Boolean(
    itemRating ||
      details?.prepTimeMinutes ||
      details?.nutrition ||
      details
  );

  return (
    <div
      className={`relative flex flex-col gap-3 p-4 rounded-2xl border transition-all duration-300 ${
        !item.available
          ? "bg-gray-50 border-gray-100 opacity-60"
          : inCart
            ? "bg-italia-green/[0.03] border-italia-green/30 shadow-sm shadow-italia-green/5"
            : isPopular
              ? "bg-white border-italia-gold/20 shadow-sm hover:shadow-md hover:border-italia-gold/30"
              : "bg-white border-gray-100 hover:shadow-md hover:border-gray-200"
      }`}
    >
      {/* Unavailable overlay */}
      {!item.available && (
        <div className="absolute top-3 right-3">
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-gray-200 text-gray-500">
            Unavailable
          </span>
        </div>
      )}

      {/* Social proof badge ribbon */}
      {item.available && (badges.length > 0 || popularThisWeek) && (
        <div className="absolute -top-2 right-3 flex flex-wrap justify-end gap-1 max-w-[min(100%,14rem)]">
          {popularThisWeek && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-900 border border-amber-200/80 shadow-sm">
              <Flame className="h-3 w-3" />
              Hot this week
            </span>
          )}
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

      {/* Row 1: thumbnail + title, description, pairing (full text width beside image) */}
      <div className="flex gap-4 items-start">
        <div className="flex-shrink-0 self-center">
          <MenuItemImage category={item.category} name={item.name} />
        </div>
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
          <p className="text-sm text-italia-gray mt-1 leading-relaxed line-clamp-3">
            {item.description}
          </p>
          {(item.category === "pizza" || item.category === "pasta") && isPopular && (
            <p className="text-[11px] text-italia-gold mt-1 font-medium">
              Pairs perfectly with espresso & tiramisù
            </p>
          )}
        </div>
      </div>

      {/* Row 2: full-width meta strip (rating, time, kcal, Details) */}
      {hasMetaStrip && (
        <div className="flex items-center gap-3 flex-wrap border-t border-gray-100 pt-3">
          {itemRating && (
            <StarRating rating={itemRating.rating} reviewCount={itemRating.count} />
          )}
          {details?.prepTimeMinutes && (
            <span className="flex items-center gap-0.5 text-[11px] text-italia-gray">
              <Clock className="h-3 w-3" aria-hidden />
              {details.prepTimeMinutes}m
            </span>
          )}
          {details?.nutrition && (
            <span className="flex items-center gap-0.5 text-[11px] text-italia-gray">
              <Flame className="h-3 w-3" aria-hidden />
              {details.nutrition.calories} kcal
            </span>
          )}
          {details && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDetailOpen(true);
              }}
              className="flex items-center gap-0.5 text-[11px] text-italia-red font-medium hover:underline"
            >
              <Info className="h-3 w-3" aria-hidden />
              Details
            </button>
          )}
        </div>
      )}

      {/* Row 3: price + cart actions */}
      <div className="flex items-center justify-between">
        <p className="text-lg font-bold text-italia-dark">
          {formatPrice(item.price)}
        </p>

        <div className="flex items-center gap-2">
          {inCart && !justAdded && (
            <span className="text-xs font-semibold text-italia-green animate-fade-in">
              {quantity} in cart
            </span>
          )}

          {justAdded && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-italia-green text-white text-xs font-semibold rounded-lg animate-bounce-in">
              <Check className="h-3 w-3" /> Added!
            </span>
          )}

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
                className="w-10 h-10 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-italia-red hover:bg-red-50 transition-colors shadow-sm"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center font-bold text-italia-dark tabular-nums text-sm">
                {quantity}
              </span>
              <button
                onClick={handleAdd}
                className="w-10 h-10 flex items-center justify-center rounded-lg bg-italia-red text-white hover:bg-italia-red-dark transition-colors shadow-sm"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Kodawari detail drawer */}
      {details && (
        <ItemDetailDrawer
          item={item}
          locationSlug={locationSlug}
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          popularThisWeek={popularThisWeek}
        />
      )}
    </div>
  );
}
