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
 *   Below threshold: italic Cormorant headline + terracotta rail + a
 *   pencil-sketched cyclist riding the fill. The shimmer keyframe lives
 *   over the gradient fill so motion still catches the eye.
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
          Consegna a casa — {Math.round(pct)}% verso la gratuità
        </div>
        <div className="v8-cart-delivery-amt">+{formatPrice(remaining)}</div>
      </div>
      <div className="v8-cart-delivery-track">
        <div className="v8-cart-delivery-rail">
          <div className="v8-cart-delivery-fill" style={{ width: `${pct}%` }}>
            <span className="v8-cart-delivery-shimmer" aria-hidden="true" />
          </div>
        </div>
        <span className="v8-cart-cyclist" style={{ left: `${pct}%` }} aria-hidden="true">
          <svg width="34" height="22" viewBox="0 0 34 22" fill="none">
            <circle cx="7" cy="16" r="4.5" stroke="currentColor" strokeWidth="1.4" fill="#F8EFDE" />
            <circle cx="27" cy="16" r="4.5" stroke="currentColor" strokeWidth="1.4" fill="#F8EFDE" />
            <path d="M7 16 L14 8 L20 16 L27 16 L23 8 L14 8" stroke="#B85C38" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
            <circle cx="14" cy="8" r="1.4" fill="#7A2B2B" />
            <path d="M23 8 L25 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </span>
      </div>
      <div className="v8-cart-delivery-foot">
        Add a little more — and our rider Marco pedals it on the house.{" "}
        <span className="v8-cart-delivery-target">
          {formatPrice(threshold)}
          {isPersonalised && (
            <span
              style={{ marginLeft: 4, fontStyle: "italic", fontWeight: 400, color: "var(--color-muted)" }}
              title="Threshold tuned for your segment (audit §2.5)"
            >
              · tuned for you
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
