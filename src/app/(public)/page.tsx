import { HeroSection } from "@/components/landing/HeroSection";
import { LocationsGrid } from "@/components/landing/LocationsGrid";
import { AboutSection } from "@/components/landing/AboutSection";
import { CTASection } from "@/components/landing/CTASection";
import { LoyaltySection } from "@/components/location/LoyaltySection";

export default function Home() {
  return (
    <>
      <HeroSection />
      <LocationsGrid />
      <LoyaltySection />
      <AboutSection />
      <CTASection />
    </>
  );
}
