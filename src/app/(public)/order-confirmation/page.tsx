"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { OrderTracker } from "@/components/order/OrderTracker";
import { FeedbackSurvey } from "@/components/order/FeedbackSurvey";
import { CustomerMilestone } from "@/components/order/CustomerMilestone";
import { LoyaltyPointsEarned } from "@/components/order/LoyaltyPointsEarned";
import { CheckCircle, MapPin, ArrowLeft, Share2, Link2 } from "lucide-react";
import { getLocation } from "@/data/locations";

function OrderConfirmationContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const locationSlug = searchParams.get("location");
  const location = locationSlug ? getLocation(locationSlug) : null;

  return (
    <section className="py-10 md:py-16">
      <Container>
        <div className="max-w-lg mx-auto">
          {/* Animated success header */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-italia-green/10 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce-in">
              <CheckCircle className="h-10 w-10 text-italia-green" />
            </div>

            <h1 className="text-3xl sm:text-4xl font-heading font-bold text-italia-dark mb-3 animate-fade-in">
              Order Confirmed!
            </h1>

            <p className="text-italia-gray text-lg mb-2 animate-fade-in">
              Thank you for your order
            </p>

            {orderId && (
              <p className="text-sm text-italia-gray mb-2 animate-fade-in">
                Order ID:{" "}
                <span className="font-mono font-semibold text-italia-dark">
                  {orderId}
                </span>
              </p>
            )}
          </div>

          {/* Live order tracker */}
          {orderId && locationSlug && (
            <div className="mb-8 animate-slide-up">
              <OrderTracker orderId={orderId} locationSlug={locationSlug} />
            </div>
          )}

          {/* Pickup location */}
          {location && (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-8 animate-slide-up">
              <h3 className="font-heading font-semibold text-lg text-italia-dark mb-2">
                Pick up your order at
              </h3>
              <div className="flex items-center justify-center gap-2 text-italia-gray">
                <MapPin className="h-4 w-4 text-italia-red" />
                <span>{location.name}</span>
              </div>
              <p className="text-sm text-italia-gray mt-1">
                {location.address}
              </p>
            </div>
          )}

          {/* Loyalty points earned — data from DB via order API */}
          <div className="mb-6">
            <LoyaltyPointsEarned
              pointsEarned={28}
              totalPoints={28}
              tierName="Bronze"
            />
          </div>

          {/* Customer milestone (Kansha) */}
          <div className="mb-6">
            <CustomerMilestone orderCount={1} customerName="Customer" />
          </div>

          {/* Feedback survey (Omotenashi + Kaizen) */}
          {orderId && (
            <div className="mb-6">
              <FeedbackSurvey orderId={orderId} />
            </div>
          )}

          {/* Shareable review link */}
          {orderId && (
            <div className="mb-8 text-center">
              <p className="text-xs text-italia-gray flex items-center justify-center gap-1.5">
                <Link2 className="h-3 w-3" />
                Review later:{" "}
                <Link
                  href={`/review/${orderId}`}
                  className="text-italia-red font-medium hover:underline"
                >
                  suditalia.pl/review/{orderId}
                </Link>
              </p>
            </div>
          )}

          {/* Share & actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center animate-slide-up">
            {location && (
              <Link href={`/locations/${location.slug}`}>
                <Button variant="outline">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Order Again
                </Button>
              </Link>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                if (navigator.share) {
                  navigator.share({
                    title: "My Sud Italia Order",
                    text: `I just ordered from Sud Italia${location ? ` in ${location.city}` : ""}! 🍕`,
                    url: window.location.href,
                  }).catch((err) => console.error("Share failed:", err));
                }
              }}
            >
              <Share2 className="mr-2 h-4 w-4" />
              Share Order
            </Button>
            <Link href="/">
              <Button variant="ghost">Back to Home</Button>
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}

export default function OrderConfirmationPage() {
  return (
    <Suspense
      fallback={
        <div className="py-32 text-center text-italia-gray">Loading...</div>
      }
    >
      <OrderConfirmationContent />
    </Suspense>
  );
}
