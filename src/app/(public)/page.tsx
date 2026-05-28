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
// closer. The previous <CTASection /> ("Hungry? Order Now!" red
// gradient block with location buttons) was removed because by the
// time the visitor reaches the bottom they've seen 6+ order entry
// points (hero ×2, every location card, the bundles "Order now").
// One more red CTA reads as the 2010s SaaS pattern V8 avoids — same
// rule the chevron-scroll-indicator removal in Step 3 followed.
//
// CTASection.tsx is intentionally left in the repo (not re-imported
// here) in case a future surface needs the red-gradient closing
// block. Don't reach for it on the landing without re-discussing
// the V8 direction.
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
