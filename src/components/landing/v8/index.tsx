/**
 * V8 — Tuscany trattoria layout. Self-contained landing module.
 *
 * Renders its OWN header + footer (via V8RouteShell) so the home
 * page is 1:1 with the v8 mockup. The legacy global Header / Footer
 * are wired up only for the (legacy) route subgroup — locations,
 * rewards, privacy, etc.
 *
 * To swap layouts: replace this folder with another landing/<vN>/
 * module. Nothing else needs to change.
 *
 * Composition mirrors mockup page-home verbatim:
 *   hero → locations → bundles → famiglia → menu → soci → footer.
 */
import { V8RouteShell } from "./layout/V8RouteShell";
import { HeroSection } from "./HeroSection";
import { LocationsGrid } from "./LocationsGrid";
import { BundlesShowcase } from "./BundlesShowcase";
import { FamigliaQuote } from "./FamigliaQuote";
import { HomeMenuPreview } from "./HomeMenuPreview";
import { SociSection } from "./SociSection";

export default function V8Landing() {
  return (
    <V8RouteShell>
      <HeroSection />
      <LocationsGrid />
      <BundlesShowcase />
      <FamigliaQuote />
      <HomeMenuPreview />
      <SociSection />
    </V8RouteShell>
  );
}
