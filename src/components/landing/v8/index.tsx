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
import { HomeMenuPreview } from "./HomeMenuPreview";
import { SociSection } from "./SociSection";

/**
 * V8 home composition. Mirrors the mockup's page-home structure
 * verbatim: hero → locations → bundles → famiglia quote → menu →
 * soci → footer. About / CTA sections live in this folder for any
 * future page that wants them, but the mockup home does not.
 */
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
        <HomeMenuPreview />
        <SociSection />
      </main>
      <V8Footer />
    </div>
  );
}
