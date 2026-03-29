"use client";

import { use } from "react";
import { Container } from "@/components/ui/Container";
import { FeedbackSurvey } from "@/components/order/FeedbackSurvey";
import { Star } from "lucide-react";

interface PageProps {
  params: Promise<{ orderId: string }>;
}

export default function ReviewPage({ params }: PageProps) {
  const { orderId } = use(params);

  return (
    <section className="py-10 md:py-16">
      <Container>
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-italia-gold/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Star className="h-7 w-7 text-italia-gold" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-heading font-bold text-italia-dark mb-2">
              Rate Your Order
            </h1>
            <p className="text-italia-gray text-sm">
              Order <span className="font-mono font-semibold">{orderId}</span>
            </p>
            <p className="text-xs text-italia-gray mt-1">
              Takes 30 seconds — earn 10 loyalty points!
            </p>
          </div>

          <FeedbackSurvey orderId={orderId} />
        </div>
      </Container>
    </section>
  );
}
