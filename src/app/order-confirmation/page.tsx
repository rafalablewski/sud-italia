"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { CheckCircle, MapPin, ArrowLeft } from "lucide-react";
import { getLocation } from "@/data/locations";

function OrderConfirmationContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const locationSlug = searchParams.get("location");
  const location = locationSlug ? getLocation(locationSlug) : null;

  return (
    <section className="py-20 md:py-32">
      <Container>
        <div className="max-w-lg mx-auto text-center">
          <div className="w-20 h-20 bg-italia-green/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-10 w-10 text-italia-green" />
          </div>

          <h1 className="text-3xl sm:text-4xl font-heading font-bold text-italia-dark mb-4">
            Order Confirmed!
          </h1>

          <p className="text-italia-gray text-lg mb-2">
            Thank you for your order. We&apos;re preparing your food now!
          </p>

          {orderId && (
            <p className="text-sm text-italia-gray mb-6">
              Order ID:{" "}
              <span className="font-mono font-semibold text-italia-dark">
                {orderId}
              </span>
            </p>
          )}

          {location && (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-8">
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

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
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
