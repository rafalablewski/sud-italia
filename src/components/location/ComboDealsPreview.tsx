"use client";

import { Percent } from "lucide-react";
import { DEFAULT_COMBO_DEALS } from "@/lib/upsell";
import { useEffect, useState } from "react";
import type { UpsellConfig } from "@/lib/upsell";

interface ComboDealsPreviewProps {
  locationSlug: string;
}

export function ComboDealsPreview({ locationSlug }: ComboDealsPreviewProps) {
  const [deals, setDeals] = useState(DEFAULT_COMBO_DEALS);

  useEffect(() => {
    fetch(`/api/settings/upsell?location=${locationSlug}`)
      .then((r) => r.json())
      .then((config: UpsellConfig | null) => {
        if (config?.combos) {
          const active = config.combos.filter((c) => c.active);
          if (active.length > 0) {
            setDeals(active.map((c) => ({
              id: c.id,
              name: c.name,
              description: c.description,
              categories: c.categories as import("@/data/types").MenuCategory[],
              discountPercent: c.discountPercent,
              minItems: c.minItems,
            })));
          }
        }
      })
      .catch(() => {});
  }, [locationSlug]);

  if (deals.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Percent className="h-4 w-4 text-italia-red" />
        <h3 className="text-sm font-semibold text-italia-dark">Save with combo deals</h3>
      </div>
      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
        {deals.map((deal) => (
          <div
            key={deal.id}
            className="flex-shrink-0 px-4 py-3 rounded-xl bg-italia-red/5 border border-italia-red/10 min-w-[200px]"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold text-italia-dark">{deal.name}</span>
              <span className="text-xs font-bold text-italia-red bg-italia-red/10 px-2 py-0.5 rounded-md">
                -{deal.discountPercent}%
              </span>
            </div>
            <p className="text-xs text-italia-gray">{deal.description}</p>
            <p className="text-[10px] text-italia-gray mt-1">Discount applies automatically in cart</p>
          </div>
        ))}
      </div>
    </div>
  );
}
