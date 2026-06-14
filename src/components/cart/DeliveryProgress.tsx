"use client";

import { Sparkles } from "lucide-react";

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
 * Free-delivery progress — audit §2.1 post-attach, V8 reskin.
 *
 *   Below threshold: a clean "Free delivery at {threshold} / {remaining}
 *   to go" row over a thin basil→ochre (green→gold) progress bar — matches
 *   the mockup. The shimmer keyframe still rides the fill so motion catches
 *   the eye.
 *
 *   On unlock: the gold→basil medallion + one-shot shimmer sweep + the
 *   delivery-unlock pop-in (the same --animate-delivery-* keyframes
 *   that have lived in themes/homepage/index.css since Step 1).
 *
 * Hidden when fulfilment is anything other than delivery.
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
      <div className="v8-cart-delivery is-unlocked" role="status">
        <span className="v8-cart-delivery-sweep" aria-hidden="true" />
        <div className="v8-cart-delivery-unlocked-row">
          <span className="v8-cart-delivery-medallion" aria-hidden="true">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="v8-cart-delivery-unlocked-text">
            <strong>Consegna gratuita — free delivery unlocked.</strong>
            <span>Our rider Marco pedals it on the house · we&apos;ll bring it warm.</span>
          </div>
        </div>
      </div>
    );
  }

  const pct = Math.min(progress * 100, 100);

  return (
    <div className="v8-cart-delivery">
      <div className="v8-cart-delivery-head">
        <div className="v8-cart-delivery-title">
          Free delivery at {formatPrice(threshold)}
          {isPersonalised && (
            <span
              style={{ marginLeft: 4, fontStyle: "italic", fontWeight: 400, color: "var(--color-muted)" }}
              title="Threshold tuned for your segment (audit §2.5)"
            >
              · tuned for you
            </span>
          )}
        </div>
        <div className="v8-cart-delivery-amt">{formatPrice(remaining)} to go</div>
      </div>
      <div className="v8-cart-delivery-track">
        <div className="v8-cart-delivery-rail">
          <div className="v8-cart-delivery-fill" style={{ width: `${pct}%` }}>
            <span className="v8-cart-delivery-shimmer" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}
