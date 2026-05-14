"use client";

import { Truck, Sparkles } from "lucide-react";

import {
  FREE_DELIVERY_THRESHOLD,
  getDeliveryProgressFor,
} from "@/lib/upsell";
import { formatPrice } from "@/lib/utils";

interface DeliveryProgressProps {
  cartTotal: number;
  fulfillmentType: string;
  /** Optional per-customer threshold (audit §2.5). Falls back to the
   *  default 60 PLN if not provided. Computed upstream via
   *  getDeliveryThresholdForCustomer(customer). */
  thresholdGrosze?: number;
  /** When the threshold has been personalised (first-time / regular / VIP),
   *  surface a "tuned for you" annotation next to the target so the
   *  customer can see why the bar is lower / they're already free. */
  isPersonalised?: boolean;
}

/**
 * Free-delivery progress bar — audit §2.1 post-attach.
 *
 *  - While below threshold: gradient red→green bar with a continuous
 *    shimmer overlay so motion catches the eye. "Add 8 zł more" copy.
 *  - On unlock: premium celebratory card with a gold→green medallion,
 *    Georgia-serif headline, one-shot shimmer sweep, pop-in on the
 *    medallion. Not a status flip — a moment.
 *
 * Hidden when fulfillment is takeout (no delivery fee in play).
 */
export function DeliveryProgress({
  cartTotal,
  fulfillmentType,
  thresholdGrosze,
  isPersonalised,
}: DeliveryProgressProps) {
  if (fulfillmentType !== "delivery") return null;

  const threshold = thresholdGrosze ?? FREE_DELIVERY_THRESHOLD;
  const { remaining, progress, qualified } = getDeliveryProgressFor(
    cartTotal,
    threshold,
  );

  if (qualified) {
    return (
      <div className="px-5 mt-3">
        <div className="relative overflow-hidden rounded-xl border border-italia-gold/40 px-4 py-3 animate-delivery-unlock bg-[linear-gradient(135deg,rgba(184,146,46,0.14)_0%,rgba(0,140,69,0.10)_100%)]">
          {/* one-shot shimmer sweep when the card first appears */}
          <span
            aria-hidden="true"
            className="absolute inset-0 -translate-x-full animate-delivery-sweep bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.55)_45%,transparent_100%)] pointer-events-none"
          />
          <div className="relative flex items-center gap-3">
            <span className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white animate-delivery-medallion bg-[linear-gradient(135deg,var(--color-italia-gold)_0%,var(--color-italia-green)_100%)] shadow-[0_4px_14px_rgba(184,146,46,0.40),inset_0_1px_0_rgba(255,255,255,0.30)]">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="leading-tight">
              <div className="font-heading text-base font-semibold text-italia-dark">
                Free delivery unlocked
              </div>
              <div className="text-xs text-italia-gray mt-0.5">
                Your order ships on us today · we&apos;ll bring it warm
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 mt-3">
      <div className="p-3 rounded-xl border border-dashed border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-sm text-italia-gray">
            <Truck className="h-4 w-4" />
            <span>
              Add{" "}
              <span className="font-semibold text-italia-dark">
                {formatPrice(remaining)}
              </span>{" "}
              for free delivery
            </span>
          </div>
          <span className="text-xs text-italia-gray">
            {formatPrice(threshold)}
            {isPersonalised && (
              <span
                className="ml-1 italic text-italia-gray/80"
                title="Threshold tuned for your segment (audit §2.5)"
              >
                · tuned for you
              </span>
            )}
          </span>
        </div>
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden relative">
          <div
            className="relative h-full rounded-full transition-all duration-500 ease-out bg-gradient-to-r from-italia-red to-italia-green overflow-hidden"
            style={{ width: `${Math.min(progress * 100, 100)}%` }}
          >
            {/* shimmer overlay — gives the bar a live, breathing feel */}
            <span
              aria-hidden="true"
              className="absolute inset-0 animate-delivery-shimmer bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.45)_50%,transparent_100%)]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
