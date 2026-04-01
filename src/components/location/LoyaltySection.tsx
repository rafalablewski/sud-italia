"use client";

import { useState } from "react";
import { Container } from "@/components/ui/Container";
import { LoyaltyCard } from "@/components/loyalty/LoyaltyCard";
import { LoyaltyAccount } from "@/lib/loyalty";

export function LoyaltySection() {
  // Points accrue per phone number on completed orders (see identify API).
  // LoyaltyCard explains: checkout phone = rewards wallet; Rewards sign-in
  // only links this browser to a number for balance UI and prefill.
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
            One rewards balance per phone number. Use that number at checkout — no
            password. Sign in on Rewards to see points on this device.
          </p>
        </div>
        <div className="max-w-md mx-auto">
          <LoyaltyCard account={account} />
        </div>
      </Container>
    </section>
  );
}
