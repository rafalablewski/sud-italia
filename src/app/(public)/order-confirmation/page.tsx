"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { OrderTracker } from "@/components/order/OrderTracker";
import { FeedbackSurvey } from "@/components/order/FeedbackSurvey";
import { CustomerMilestone } from "@/components/order/CustomerMilestone";
import { LoyaltyPointsEarned } from "@/components/order/LoyaltyPointsEarned";
import { PushOptInButton } from "@/components/order/PushOptInButton";
import { LayoutGate } from "@/components/layout/LayoutGate";
import { CheckCircle, MapPin, ArrowLeft, Share2, Link2, Sparkles, Users } from "lucide-react";
import { getLocation } from "@/data/locations";
import { useCustomer } from "@/store/customer";
import { calculateTier } from "@/lib/loyalty";
import { fetchPublicSettings, type PublicLoyaltySettings } from "@/lib/public-settings";

function OrderConfirmationContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const locationSlug = searchParams.get("location");
  const location = locationSlug ? getLocation(locationSlug) : null;
  const { customer } = useCustomer();

  // Fetch real order data for points calculation
  const [orderData, setOrderData] = useState<{ totalAmount: number; itemCount: number } | null>(null);
  const [loyalty, setLoyalty] = useState<PublicLoyaltySettings | null>(null);
  useEffect(() => {
    if (!orderId) return;
    fetch(`/api/orders?orderId=${encodeURIComponent(orderId)}`)
      .then((r) => r.json())
      .then((data) => {
        const totalAmount = data?.order?.totalAmount ?? data?.totalAmount;
        const itemCount = data?.order?.items?.length ?? data?.items?.length ?? 0;
        if (typeof totalAmount === "number") {
          setOrderData({ totalAmount, itemCount });
        }
      })
      .catch(() => {});
  }, [orderId]);
  useEffect(() => {
    let cancelled = false;
    fetchPublicSettings(locationSlug).then((s) => {
      if (!cancelled && s?.loyalty) setLoyalty(s.loyalty);
    });
    return () => {
      cancelled = true;
    };
  }, [locationSlug]);

  const pointsEarned = orderData ? Math.floor(orderData.totalAmount / 100) : 0;
  const priorPoints = customer?.points ?? 0;
  const totalPoints = priorPoints + pointsEarned;
  // Tier resolves once loyalty settings arrive — bronze fallback for the
  // brief window before the public-settings fetch lands.
  const tierName = loyalty ? calculateTier(totalPoints, loyalty.tiers) : "bronze";
  // API ordersCount excludes the current order while it is still "pending"; +1 = this checkout.
  const orderCount = customer != null ? (customer.ordersCount ?? 0) + 1 : 1;
  const customerName = customer?.name || "Customer";

  return (
    <section className="v8-order-page">
      {/* Success header — basil-tinted check mark + italic Cormorant
          "Order confirmed" / italic "Grazie!" / order ID pill. */}
      <div className="v8-order-success">
        <div className="v8-order-success-mark" aria-hidden="true">
          <CheckCircle className="h-9 w-9" />
        </div>
        <h1 className="v8-order-success-h1">Order confirmed</h1>
        <p className="v8-order-success-sub">
          <em>Grazie!</em> Thank you for your order.
        </p>
        {orderId && (
          <p className="v8-order-success-id">
            <span className="v8-order-success-id-label">#</span>
            <span>{orderId}</span>
          </p>
        )}
      </div>

      {/* Live order tracker — paper card with the editorial 3-step
          stepper + estimated time + order summary. */}
      {orderId && locationSlug && (
        <div className="v8-order-tracker">
          <OrderTracker orderId={orderId} locationSlug={locationSlug} />
        </div>
      )}

      {/* Audit §3 — Web push opt-in. Only surfaces when VAPID is
          configured server-side and the browser supports push. */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 22 }}>
        <LayoutGate flag="showPushOptIn">
          <PushOptInButton phone={customer?.phone} />
        </LayoutGate>
      </div>

      {/* Pickup location card */}
      {location && (
        <div className="v8-order-card v8-order-pickup">
          <div className="v8-order-pickup-label">
            Pick up at <span className="v8-order-section-it">· ritira qui</span>
          </div>
          <div className="v8-order-pickup-name">
            <MapPin className="h-5 w-5" aria-hidden />
            <span>{location.name}</span>
          </div>
          <div className="v8-order-pickup-address">{location.address}</div>
        </div>
      )}

      {/* Loyalty points earned */}
      <LoyaltyPointsEarned
        pointsEarned={pointsEarned}
        totalPoints={totalPoints}
        tierName={tierName.charAt(0).toUpperCase() + tierName.slice(1)}
      />

      {/* Honest FOMO — come back for limited-time items + invite friends */}
      {location && (
        <div className="v8-order-comeback">
          <span className="v8-order-comeback-icon" aria-hidden="true">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="v8-order-comeback-body">
            <div className="v8-order-comeback-title">
              Seasonal specials go fast{" "}
              <span className="v8-order-section-it">· stagionali</span>
            </div>
            <div className="v8-order-comeback-sub">
              Limited-rotation dishes leave the board without warning — grab them on your next visit.
            </div>
            <div className="v8-order-comeback-links">
              <Link href={`/locations/${location.slug}#menu`} className="v8-order-comeback-link">
                Browse menu · <em>il menù</em>
              </Link>
              <Link href="/rewards" className="v8-order-comeback-link is-basil">
                <Users className="h-3.5 w-3.5" />
                Invite friends · <em>invita gli amici</em>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Customer milestone */}
      <CustomerMilestone orderCount={orderCount} customerName={customerName} />

      {/* Feedback survey (Omotenashi + Kaizen) */}
      {orderId && (
        <div style={{ marginBottom: 22 }}>
          <LayoutGate flag="showFeedbackSurvey">
            <FeedbackSurvey orderId={orderId} />
          </LayoutGate>
        </div>
      )}

      {/* Shareable review link */}
      {orderId && (
        <p className="v8-order-review-link">
          <Link2 className="h-3 w-3" style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
          Review later:{" "}
          <Link href={`/review/${orderId}`}>suditalia.pl/review/{orderId}</Link>
        </p>
      )}

      {/* Share & actions */}
      <div className="v8-order-actions">
        {location && (
          <Link href={`/locations/${location.slug}`} className="v8-order-action is-primary">
            <ArrowLeft className="h-4 w-4" />
            Order again · ordina ancora
          </Link>
        )}
        <button
          type="button"
          className="v8-order-action is-ghost"
          onClick={async () => {
            const shareData = {
              title: "My Sud Italia Order",
              text: `I just ordered from Sud Italia${location ? ` in ${location.city}` : ""}!`,
              url: window.location.href,
            };
            if (navigator.share) {
              navigator.share(shareData).catch(() => {});
            } else {
              await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
              (document.activeElement as HTMLElement)?.blur();
            }
          }}
        >
          <Share2 className="h-4 w-4" />
          Share · condividi
        </button>
        <Link href="/" className="v8-order-action is-ghost">
          Back home · alla casa
        </Link>
      </div>
    </section>
  );
}

export default function OrderConfirmationPage() {
  return (
    <Suspense
      fallback={
        <div className="v8-order-page" style={{ textAlign: "center", color: "var(--color-muted)", fontStyle: "italic" }}>
          Loading…
        </div>
      }
    >
      <OrderConfirmationContent />
    </Suspense>
  );
}
