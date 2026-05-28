import { HeroSection } from "@/components/landing/HeroSection";
import { LocationsGrid } from "@/components/landing/LocationsGrid";
import { BundlesShowcase } from "@/components/landing/BundlesShowcase";
import { AboutSection } from "@/components/landing/AboutSection";
import { CTASection } from "@/components/landing/CTASection";
import { LoyaltySection } from "@/components/location/LoyaltySection";
import { LayoutGate } from "@/components/layout/LayoutGate";

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
      <CTASection />
    </>
  );
}
