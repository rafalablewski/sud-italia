"use client";

import { useState } from "react";
import { Container } from "@/components/ui/Container";
import { LoyaltyCard } from "@/components/loyalty/LoyaltyCard";
import { LoyaltyAccount, calculateTier } from "@/lib/loyalty";

// Simulated lookup — in production this would hit an API
const MOCK_ACCOUNTS: Record<string, LoyaltyAccount> = {
  "123456789": {
    phone: "+48123456789",
    points: 680,
    totalSpent: 68000,
    ordersCount: 24,
    tier: "silver",
    joinedAt: "2025-06-15T00:00:00Z",
  },
};

export function LoyaltySection() {
  const [account, setAccount] = useState<LoyaltyAccount | null>(null);

  const handleLookup = (phone: string) => {
    const cleaned = phone.replace(/\D/g, "");
    const found = MOCK_ACCOUNTS[cleaned];
    if (found) {
      setAccount(found);
    } else {
      // Create new account for demo
      setAccount({
        phone: `+48${cleaned}`,
        points: 0,
        totalSpent: 0,
        ordersCount: 0,
        tier: "bronze",
        joinedAt: new Date().toISOString(),
      });
    }
  };

  return (
    <section className="py-8 bg-italia-cream">
      <Container>
        <div className="max-w-md mx-auto">
          <LoyaltyCard account={account} onLookup={handleLookup} />
        </div>
      </Container>
    </section>
  );
}
