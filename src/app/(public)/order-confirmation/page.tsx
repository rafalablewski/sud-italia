"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { CheckCircle, MapPin, ArrowLeft, Clock, ChefHat, ShoppingBag } from "lucide-react";
import { getLocation } from "@/data/locations";

const ORDER_STEPS = [
  { label: "Confirmed", icon: CheckCircle },
  { label: "Preparing", icon: ChefHat },
  { label: "Ready", icon: ShoppingBag },
];

function OrderProgressTracker({ currentStep }: { currentStep: number }) {
  return (
    <div className="progress-tracker mb-10">
      {ORDER_STEPS.map((step, i) => {
        const isCompleted = i < currentStep;
        const isActive = i === currentStep;
        const Icon = step.icon;
        return (
          <div
            key={step.label}
            className={`progress-step ${isActive ? "active" : ""}`}
          >
            <div
              className={`progress-step-dot ${
                isCompleted ? "completed" : isActive ? "active" : "pending"
              }`}
            >
              <Icon className="h-4 w-4" />
            </div>
            <span className="progress-step-label">{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function OrderConfirmationContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const locationSlug = searchParams.get("location");
  const location = locationSlug ? getLocation(locationSlug) : null;

  return (
    <section className="py-16 md:py-24">
      <Container>
        <div className="max-w-lg mx-auto text-center">
          {/* Animated success icon */}
          <div className="w-20 h-20 bg-italia-green/10 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce-in">
            <CheckCircle className="h-10 w-10 text-italia-green" />
          </div>

          <h1 className="text-3xl sm:text-4xl font-heading font-bold text-italia-dark mb-3 animate-fade-in">
            Order Confirmed!
          </h1>

          <p className="text-italia-gray text-lg mb-2 animate-fade-in">
            Thank you for your order. We&apos;re preparing your food now!
          </p>

          {orderId && (
            <p className="text-sm text-italia-gray mb-8 animate-fade-in">
              Order ID:{" "}
              <span className="font-mono font-semibold text-italia-dark">
                {orderId}
              </span>
            </p>
          )}

          {/* Progress tracker (Uber-style) */}
          <OrderProgressTracker currentStep={0} />

          {/* Estimated time */}
          <div className="bg-italia-cream rounded-2xl p-5 mb-6 animate-slide-up">
            <div className="flex items-center justify-center gap-2 text-italia-dark font-semibold mb-1">
              <Clock className="h-5 w-5 text-italia-red" />
              <span>Estimated time</span>
            </div>
            <p className="text-2xl font-heading font-bold text-italia-red">
              15-25 min
            </p>
          </div>

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

          <div className="flex flex-col sm:flex-row gap-3 justify-center animate-slide-up">
            {location && (
              <Link href={`/locations/${location.slug}`}>
                <Button variant="outline">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Order Again
                </Button>
              </Link>
            )}
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
