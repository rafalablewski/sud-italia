"use client";

import { getDeliveryProgress, FREE_DELIVERY_THRESHOLD } from "@/lib/upsell";
import { formatPrice } from "@/lib/utils";
import { Truck, Check } from "lucide-react";

interface DeliveryProgressProps {
  cartTotal: number;
  fulfillmentType: string;
}

export function DeliveryProgress({ cartTotal, fulfillmentType }: DeliveryProgressProps) {
  if (fulfillmentType !== "delivery") return null;

  const { remaining, progress, qualified } = getDeliveryProgress(cartTotal);

  return (
    <div className="px-5 mt-3">
      <div className="p-3 rounded-xl border border-dashed border-gray-200 bg-gray-50">
        {qualified ? (
          <div className="flex items-center gap-2 text-italia-green">
            <Check className="h-4 w-4" />
            <p className="text-sm font-semibold">
              Free delivery unlocked!
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-sm text-italia-gray">
                <Truck className="h-4 w-4" />
                <span>
                  Add <span className="font-semibold text-italia-dark">{formatPrice(remaining)}</span> for free delivery
                </span>
              </div>
              <span className="text-xs text-italia-gray">
                {formatPrice(FREE_DELIVERY_THRESHOLD)}
              </span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-italia-red to-italia-green rounded-full transition-all duration-500 ease-out"
                style={{ width: `${Math.min(progress * 100, 100)}%` }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
