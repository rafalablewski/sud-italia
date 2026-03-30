"use client";

import { MenuItem } from "@/data/types";
import { useCartStore } from "@/store/cart";
import { Shuffle, Plus } from "lucide-react";
import { useState, useCallback } from "react";
import { formatPrice } from "@/lib/utils";
import { CATEGORY_EMOJI } from "@/data/menu-images";

interface SurpriseMeProps {
  items: MenuItem[];
  locationSlug: string;
}

export function SurpriseMe({ items, locationSlug }: SurpriseMeProps) {
  const addItem = useCartStore((s) => s.addItem);
  const [revealed, setRevealed] = useState<MenuItem | null>(null);
  const [spinning, setSpinning] = useState(false);

  const pickRandom = useCallback(() => {
    if (items.length === 0) return;
    setSpinning(true);
    setRevealed(null);

    // Animate through several items before landing
    let count = 0;
    const maxCount = 8;
    const interval = setInterval(() => {
      const random = items[Math.floor(Math.random() * items.length)];
      setRevealed(random);
      count++;
      if (count >= maxCount) {
        clearInterval(interval);
        setSpinning(false);
      }
    }, 120);
  }, [items]);

  return (
    <div className="bg-gradient-to-r from-italia-gold/5 to-italia-red/5 rounded-2xl border border-italia-gold/20 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-heading font-semibold text-italia-dark text-sm">
            Can&apos;t decide?
          </h3>
          <p className="text-xs text-italia-gray">
            Let us pick something for you!
          </p>
        </div>
        <button
          onClick={pickRandom}
          disabled={spinning}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
            spinning
              ? "bg-italia-gold/20 text-italia-gold-dark"
              : "bg-italia-gold text-white hover:bg-italia-gold-dark shadow-sm"
          }`}
        >
          <Shuffle className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`} />
          {spinning ? "Picking..." : "Surprise Me!"}
        </button>
      </div>

      {revealed && !spinning && (
        <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 animate-bounce-in">
          <span className="text-2xl">
            {CATEGORY_EMOJI[revealed.category] || "🍽️"}
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-italia-dark">
              {revealed.name}
            </p>
            <p className="text-xs text-italia-gray truncate">
              {revealed.description}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-sm font-bold text-italia-dark">
              {formatPrice(revealed.price)}
            </span>
            <button
              onClick={() => addItem(revealed, locationSlug)}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-italia-red text-white hover:bg-italia-red-dark transition-colors active:scale-95"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
