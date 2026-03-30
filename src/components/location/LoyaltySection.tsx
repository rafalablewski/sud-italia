"use client";

import { useState } from "react";
import { Container } from "@/components/ui/Container";
import { LoyaltyCard } from "@/components/loyalty/LoyaltyCard";
import { LoyaltyAccount } from "@/lib/loyalty";

export function LoyaltySection() {
  // Account is loaded when:
  // 1. Customer enters phone at checkout → auto-enrolled server-side
  // 2. Returning customer recognized from order data in DB
  // The LoyaltyCard now shows the value prop (no form), and the
  // actual enrollment happens silently at checkout via the API.
  const [account] = useState<LoyaltyAccount | null>(null);

  return (
    <section id="loyalty" className="py-10 md:py-14 bg-italia-cream">
      <Container>
        <div className="text-center mb-6">
          <p className="text-italia-gold-dark font-medium text-sm tracking-[0.15em] uppercase mb-2">
            Loyalty Program
          </p>
          <h2 className="text-2xl sm:text-3xl font-heading font-bold text-italia-dark">
            Sud Italia Rewards
          </h2>
          <p className="mt-2 text-italia-gray max-w-md mx-auto text-sm">
            No sign-up. No forms. Just order and earn points automatically.
          </p>
        </div>
        <div className="max-w-md mx-auto">
          <LoyaltyCard account={account} />
        </div>
      </Container>
    </section>
  );
}
