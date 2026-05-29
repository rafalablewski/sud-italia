import { HeroSection } from "@/components/landing/HeroSection";
import { LocationsGrid } from "@/components/landing/LocationsGrid";
import { BundlesShowcase } from "@/components/landing/BundlesShowcase";
import { AboutSection } from "@/components/landing/AboutSection";
import { LoyaltySection } from "@/components/location/LoyaltySection";
import { LayoutGate } from "@/components/layout/LayoutGate";

// V8 Trattoria landing — section order:
//
//   Hero        → location CTAs + brand voice
//   Locations   → paper cards per truck
//   Bundles     → today's set-price combos
//   Famiglia    → italic-Cormorant quote strip (AboutSection.tsx)
//   Soci        → loyalty pitch + closing CTA (LoyaltySection.tsx)
//
// No separate closing CTA — V8 designs the Soci section as the
// closer. By the time the visitor reaches the bottom they've seen
// 6+ order entry points (hero ×2, every location card, the
// bundles "Order now"); one more red CTA reads as the 2010s SaaS
// pattern V8 avoids. The pre-V8 `<CTASection />` red-gradient
// closing block was deleted in Step H.
export default function Home() {
  return (
    <>
      <HeroSection />
      <LocationsGrid />
      <LayoutGate flag="showBundlesShowcase">
        <BundlesShowcase />
      </LayoutGate>
      <AboutSection />
      <LayoutGate flag="showLoyaltySection">
        <LoyaltySection />
      </LayoutGate>
    </>
  );
}
