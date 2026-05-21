/**
 * V8 — Tuscany trattoria layout. Self-contained landing module.
 *
 * To use: import the default export (`<V8Landing />`) from a page
 * that lives inside the public route group, e.g.
 *
 *   // src/app/(public)/page.tsx
 *   import V8Landing from "@/components/landing/v8";
 *   export default function Home() { return <V8Landing />; }
 *
 * To swap layouts: replace that import with another landing/<vN>/
 * module. This folder and its v8.css can then be removed without
 * touching any other file.
 */
import "./v8.css";

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
      <HeroSection />
      <LocationsGrid />
      <BundlesShowcase />
      <FamigliaQuote />
      <AboutSection />
      <SociSection />
      <CTASection />
    </div>
  );
}
