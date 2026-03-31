"use client";

import { useCartStore } from "@/store/cart";
import { UpsellSuggestion } from "@/lib/upsell";
import { formatPrice } from "@/lib/utils";
import { Plus, Sparkles } from "lucide-react";
import { useState } from "react";

interface CartUpsellProps {
  suggestions: UpsellSuggestion[];
}

export function CartUpsell({ suggestions }: CartUpsellProps) {
  const addItem = useCartStore((s) => s.addItem);
  const locationSlug = useCartStore((s) => s.locationSlug);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = suggestions.filter((s) => !dismissed.has(s.item.id));
  if (visible.length === 0) return null;

  return (
    <div className="px-5 mt-3">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-italia-gold" />
        <p className="text-xs font-semibold text-italia-gray uppercase tracking-wide">
          Complete your meal
        </p>
      </div>
      <div className="space-y-2">
        {visible.map((suggestion) => (
          <div
            key={suggestion.item.id}
            className="flex items-center gap-3 p-3 bg-italia-cream rounded-xl border border-italia-gold/15 animate-fade-in"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-italia-dark truncate">
                {suggestion.item.name}
              </p>
              <p className="text-xs text-italia-gray mt-0.5">
                {suggestion.reason}
              </p>
            </div>
            <span className="text-sm font-semibold text-italia-dark flex-shrink-0">
              {formatPrice(suggestion.item.price)}
            </span>
            <button
              onClick={() => {
                if (locationSlug) addItem(suggestion.item, locationSlug);
                setDismissed((prev) => new Set(prev).add(suggestion.item.id));
              }}
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-italia-red text-white hover:bg-italia-red-dark transition-colors active:scale-95"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
