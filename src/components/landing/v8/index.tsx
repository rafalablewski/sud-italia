/**
 * V8 — Tuscany trattoria layout. Self-contained landing module.
 *
 * Renders its OWN header + footer (V8Header, V8Footer) so the home
 * page is 1:1 with the v8 mockup. The legacy global Header / Footer
 * are wired up only for the (legacy) route subgroup — locations,
 * rewards, privacy, etc.
 *
 * To use: import the default export (`<V8Landing />`) from a page
 * inside the (public) route group. The page must NOT be inside
 * (public)/(legacy)/ — that subgroup adds the legacy header/footer.
 *
 * To swap layouts: replace this folder with another landing/<vN>/
 * module and update the page import. Nothing else needs to change.
 */
import "./v8.css";

import { V8Header } from "./layout/V8Header";
import { V8LiveTicker } from "./layout/V8LiveTicker";
import { V8Footer } from "./layout/V8Footer";
import { HeroSection } from "./HeroSection";
import { LocationsGrid } from "./LocationsGrid";
import { BundlesShowcase } from "./BundlesShowcase";
import { FamigliaQuote } from "./FamigliaQuote";
import { AboutSection } from "./AboutSection";
import { SociSection } from "./SociSection";
import { CTASection } from "./CTASection";

export default function V8Landing() {
  return (
    <div className="v8-frame">
      <V8Header />
      <V8LiveTicker />
      <main className="v8-main">
        <HeroSection />
        <LocationsGrid />
        <BundlesShowcase />
        <FamigliaQuote />
        <AboutSection />
        <SociSection />
        <CTASection />
      </main>
      <V8Footer />
    </div>
  );
}
