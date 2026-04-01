"use client";

import { MenuItem as MenuItemType, ALLERGEN_LABELS, Allergen, NutritionInfo } from "@/data/types";
import { getItemDetails } from "@/data/kodawari";
import { getItemRating } from "@/data/ratings";
import { StarRating } from "@/components/rating/StarRating";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { formatPrice } from "@/lib/utils";
import { useCartStore } from "@/store/cart";
import { CATEGORY_EMOJI } from "@/data/menu-images";
import {
  Plus,
  Clock,
  Flame,
  Leaf,
  MapPin,
  AlertTriangle,
  Info,
} from "lucide-react";

interface ItemDetailDrawerProps {
  item: MenuItemType;
  locationSlug: string;
  open: boolean;
  onClose: () => void;
  popularThisWeek?: boolean;
}

function NutritionBar({
  label,
  value,
  unit,
  max,
  color,
}: {
  label: string;
  value: number;
  unit: string;
  max: number;
  color: string;
}) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-italia-gray">{label}</span>
        <span className="font-semibold text-italia-dark">
          {value}
          {unit}
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function ItemDetailDrawer({
  item,
  locationSlug,
  open,
  onClose,
  popularThisWeek = false,
}: ItemDetailDrawerProps) {
  const addItem = useCartStore((s) => s.addItem);
  const details = getItemDetails(item.id);
  const rating = getItemRating(item.id);
  const emoji = CATEGORY_EMOJI[item.category] || "🍽️";

  const allergens = details?.allergens || [];
  const nutrition = details?.nutrition;
  const sourcing = details?.sourcing;
  const prepTime = details?.prepTimeMinutes;

  const handleAdd = () => {
    addItem(item, locationSlug);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Item Details">
      <div className="px-5 pb-5">
        {/* Header with emoji */}
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-italia-cream to-white border border-gray-100 flex items-center justify-center text-3xl">
            {emoji}
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-heading font-bold text-italia-dark">
              {item.name}
            </h2>
            <p className="text-sm text-italia-gray mt-0.5">{item.description}</p>
            {rating && (
              <div className="mt-1">
                <StarRating rating={rating.rating} reviewCount={rating.count} />
              </div>
            )}
            {(item.isLimited || item.limitedUntil) && (
              <p className="text-xs text-italia-red font-medium mt-2 flex items-center gap-1">
                <Clock className="h-3 w-3 flex-shrink-0" />
                Limited on the menu — order before it rotates off.
              </p>
            )}
            {popularThisWeek && (
              <p className="text-xs text-amber-800 font-medium mt-2">
                Ordered often at this location this week (real sales).
              </p>
            )}
          </div>
        </div>

        {/* Quick info row */}
        <div className="flex items-center gap-4 mb-5">
          <span className="text-xl font-bold text-italia-red">
            {formatPrice(item.price)}
          </span>
          {prepTime && (
            <span className="flex items-center gap-1 text-sm text-italia-gray">
              <Clock className="h-3.5 w-3.5" />
              {prepTime} min
            </span>
          )}
          {nutrition && (
            <span className="flex items-center gap-1 text-sm text-italia-gray">
              <Flame className="h-3.5 w-3.5" />
              {nutrition.calories} kcal
            </span>
          )}
        </div>

        {/* Allergen matrix */}
        <div className="mb-5">
          <h3 className="text-xs font-semibold text-italia-gray uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Allergens
          </h3>
          {allergens.length === 0 ? (
            <p className="text-sm text-italia-green font-medium flex items-center gap-1.5">
              <Leaf className="h-4 w-4" />
              No major allergens
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allergens.map((a) => {
                const info = ALLERGEN_LABELS[a];
                return (
                  <span
                    key={a}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 text-red-700 text-xs font-medium border border-red-100"
                  >
                    <span>{info.emoji}</span>
                    {info.en}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Nutrition panel */}
        {nutrition && (
          <div className="mb-5">
            <h3 className="text-xs font-semibold text-italia-gray uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5" />
              Nutritional Information
            </h3>
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <NutritionBar
                label="Calories"
                value={nutrition.calories}
                unit=" kcal"
                max={1000}
                color="bg-amber-400"
              />
              <NutritionBar
                label="Protein"
                value={nutrition.protein}
                unit="g"
                max={50}
                color="bg-italia-red"
              />
              <NutritionBar
                label="Carbohydrates"
                value={nutrition.carbs}
                unit="g"
                max={100}
                color="bg-blue-400"
              />
              <NutritionBar
                label="Fat"
                value={nutrition.fat}
                unit="g"
                max={60}
                color="bg-italia-gold"
              />
              {nutrition.fiber !== undefined && (
                <NutritionBar
                  label="Fiber"
                  value={nutrition.fiber}
                  unit="g"
                  max={10}
                  color="bg-italia-green"
                />
              )}
              {nutrition.sodium !== undefined && (
                <NutritionBar
                  label="Sodium"
                  value={nutrition.sodium}
                  unit=" mg"
                  max={2000}
                  color="bg-purple-400"
                />
              )}
            </div>
          </div>
        )}

        {/* Sourcing / provenance */}
        {sourcing && (
          <div className="mb-5">
            <h3 className="text-xs font-semibold text-italia-gray uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              Ingredient Sourcing
            </h3>
            <p className="text-sm text-italia-dark leading-relaxed bg-italia-cream rounded-xl p-3 border border-italia-gold/10">
              {sourcing}
            </p>
          </div>
        )}

        {/* Add to cart */}
        <Button onClick={handleAdd} className="w-full min-h-[52px]" size="lg">
          <Plus className="h-5 w-5 mr-2" />
          Add to Cart — {formatPrice(item.price)}
        </Button>
      </div>
    </Sheet>
  );
}
