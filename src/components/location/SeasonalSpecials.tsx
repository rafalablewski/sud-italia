"use client";

import { useState, useEffect } from "react";
import { useCartStore } from "@/store/cart";
import { formatPrice } from "@/lib/utils";
import { Plus, Clock, Sparkles } from "lucide-react";
import { CATEGORY_EMOJI } from "@/data/menu-images";
import type { MenuCategory } from "@/data/types";

interface SeasonalItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  availableUntil: string;
  badge: string;
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

export function SeasonalSpecials({ locationSlug }: { locationSlug: string }) {
  const [items, setItems] = useState<SeasonalItem[]>([]);
  const addItem = useCartStore((s) => s.addItem);

  useEffect(() => {
    fetch(`/api/settings/public?location=${locationSlug}`)
      .then((r) => r.json())
      .then((data) => setItems(data.seasonalItems || []))
      .catch(() => {});
  }, [locationSlug]);

  if (items.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-5 w-5 text-italia-gold" />
        <h3 className="font-heading font-bold text-lg text-italia-dark">
          Seasonal Specials
        </h3>
        <span className="text-xs text-italia-gray">&mdash; Limited time only</span>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {items.map((item) => {
          const remaining = daysUntil(item.availableUntil);
          const emoji = CATEGORY_EMOJI[item.category] || "🍽️";

          return (
            <div
              key={item.id}
              className="relative bg-gradient-to-r from-italia-gold/5 to-italia-red/5 rounded-2xl border border-italia-gold/20 p-4 overflow-hidden"
            >
              <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-italia-gold/15 text-italia-gold-dark">
                <Sparkles className="h-3 w-3" />
                {item.badge}
              </span>

              <div className="flex gap-3">
                <div className="w-14 h-14 rounded-xl bg-white/80 flex items-center justify-center text-2xl flex-shrink-0 shadow-sm">
                  {emoji}
                </div>
                <div className="flex-1 min-w-0 pr-20">
                  <h4 className="font-heading font-semibold text-italia-dark">
                    {item.name}
                  </h4>
                  <p className="text-xs text-italia-gray mt-0.5 line-clamp-2 leading-relaxed">
                    {item.description}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-base font-bold text-italia-dark">
                      {formatPrice(item.price)}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-italia-red font-medium">
                      <Clock className="h-3 w-3" />
                      {remaining} days left
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() =>
                  addItem(
                    {
                      id: item.id,
                      name: item.name,
                      description: item.description,
                      price: item.price,
                      cost: Math.round(item.price * 0.3),
                      category: item.category as MenuCategory,
                      tags: [],
                      available: true,
                    },
                    locationSlug
                  )
                }
                className="absolute bottom-4 right-4 w-10 h-10 flex items-center justify-center rounded-xl bg-italia-red text-white hover:bg-italia-red-dark transition-colors shadow-sm active:scale-95"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
