"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getActiveLocations, getOpenLocations } from "@/data/locations";

// V8 Trattoria hero — centered parchment block with the basil-leaf +
// stain + tomato ornaments scattered behind, a pulsing "Open now"
// oxblood-pill kicker, a Cormorant Garamond display headline + its
// italian italic sublabel, a hand-drawn terracotta squiggle underline,
// a lede paragraph with italic-Cormorant Italian phrases, two terracotta
// location CTAs + a ghost oxblood "Our Story" CTA, and a tricolore
// hairline at the foot of the section.
//
// "Open now": the kicker reflects real service-hours state. If any
// active location is inside its hours window, the green dot + "Open
// now / aperto ora" prefix shows. Outside hours, the kicker degrades
// to "Closed now / chiuso ora" and the dot fades to muted. Lists every
// active location's city after the status line — chain-wide, not
// per-truck.

const HEADLINE_EN = "Pizza, the way it's made in Naples";
const HEADLINE_IT = "La pizza, fatta come a Napoli";
const STORY_HREF = "/#famiglia";

export function HeroSection() {
  // Service-hour state is time-of-day-sensitive, so we only compute it
  // after mount to avoid an SSR/client mismatch when the page is
  // requested at the wrong side of an opening boundary.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const active = getActiveLocations();
  const openCount = mounted ? getOpenLocations().length : 0;

  return (
    <section className="v8-hero relative overflow-hidden">
      {/* Background ornaments — basil sprigs, stains, a tomato. All
          absolutely positioned, pointer-events: none, behind content
          (z-index 1). Hand-tuned SVGs lifted from the V8 mockup. */}
      <span className="v8-hero-orn v8-hero-orn-basil-tl" aria-hidden>
        <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
          <path d="M60 110 C 60 80, 60 50, 60 20" stroke="#4A7C59" strokeWidth="2" strokeLinecap="round" />
          <path d="M60 80 C 45 75, 35 60, 30 45 C 45 50, 55 65, 60 75" fill="#4A7C59" fillOpacity="0.18" stroke="#4A7C59" strokeWidth="2" strokeLinejoin="round" />
          <path d="M60 65 C 75 60, 85 45, 90 30 C 75 35, 65 50, 60 60" fill="#4A7C59" fillOpacity="0.18" stroke="#4A7C59" strokeWidth="2" strokeLinejoin="round" />
          <path d="M60 48 C 50 44, 42 32, 42 22 C 52 26, 56 36, 60 45" fill="#4A7C59" fillOpacity="0.18" stroke="#4A7C59" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="v8-hero-orn v8-hero-orn-basil-br" aria-hidden>
        <svg width="100" height="100" viewBox="0 0 100 100" fill="none">
          <path d="M50 92 C 50 70, 50 40, 50 12" stroke="#4A7C59" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M50 70 C 38 66, 30 54, 26 42 C 38 46, 46 56, 50 66" fill="#4A7C59" fillOpacity="0.18" stroke="#4A7C59" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M50 55 C 62 51, 70 38, 74 26 C 62 30, 54 42, 50 52" fill="#4A7C59" fillOpacity="0.18" stroke="#4A7C59" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="v8-hero-orn v8-hero-orn-stain-1" aria-hidden>
        <svg width="160" height="160" viewBox="0 0 160 160" fill="none">
          <ellipse cx="80" cy="80" rx="60" ry="55" stroke="#7A2B2B" strokeWidth="2" fill="none" />
          <ellipse cx="80" cy="80" rx="48" ry="44" stroke="#7A2B2B" strokeWidth="1.2" fill="none" opacity="0.6" />
          <ellipse cx="80" cy="80" rx="36" ry="33" stroke="#7A2B2B" strokeWidth="0.8" fill="none" opacity="0.5" />
        </svg>
      </span>
      <span className="v8-hero-orn v8-hero-orn-stain-2" aria-hidden>
        <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
          <ellipse cx="60" cy="60" rx="48" ry="44" stroke="#C9A23E" strokeWidth="2" fill="none" />
          <ellipse cx="60" cy="60" rx="36" ry="33" stroke="#C9A23E" strokeWidth="1.2" fill="none" opacity="0.6" />
        </svg>
      </span>
      <span className="v8-hero-orn v8-hero-orn-tomato" aria-hidden>
        <svg width="70" height="70" viewBox="0 0 70 70" fill="none">
          <path d="M16 38 C 16 54, 24 60, 35 60 C 46 60, 54 54, 54 38 C 54 30, 48 24, 35 24 C 22 24, 16 30, 16 38 Z" fill="#B85C38" fillOpacity="0.22" stroke="#B85C38" strokeWidth="2" />
          <path d="M35 24 L35 16" stroke="#4A7C59" strokeWidth="2" strokeLinecap="round" />
          <path d="M35 20 C 30 16, 25 14, 22 14 C 23 19, 27 22, 35 24" stroke="#4A7C59" strokeWidth="2" fill="#4A7C59" fillOpacity="0.22" strokeLinejoin="round" />
          <path d="M35 20 C 40 16, 45 14, 48 14 C 47 19, 43 22, 35 24" stroke="#4A7C59" strokeWidth="2" fill="#4A7C59" fillOpacity="0.22" strokeLinejoin="round" />
        </svg>
      </span>

      <div className="v8-hero-inner max-w-[980px] mx-auto px-[22px] text-center relative z-[2]">
        <span className="v8-hero-kicker">
          <span className={`v8-hero-kicker-dot ${openCount > 0 ? "is-live" : "is-muted"}`} aria-hidden />
          {openCount > 0 ? (
            <>Open now · <span className="bi-sec">aperto ora</span></>
          ) : (
            <>Closed now · <span className="bi-sec">chiuso ora</span></>
          )}
          {active.map((loc) => (
            <span key={loc.slug}> · {loc.city}</span>
          ))}
        </span>

        <h1 className="v8-hero-h1">{HEADLINE_EN}</h1>
        <div className="v8-hero-en">
          <span className="it">{HEADLINE_IT}</span>
        </div>

        <svg className="v8-hero-underline" width="220" height="18" viewBox="0 0 220 18" fill="none" aria-hidden>
          <path d="M4 11 C 40 4, 80 16, 110 9 S 180 4, 216 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
          <circle cx="216" cy="12" r="1.8" fill="currentColor" />
        </svg>

        <p className="v8-hero-lede">
          San Marzano DOP from the slopes of Vesuvius. <em>Fior di latte</em> from
          Agerola. A wood-fired oven that breathes at 485&deg;C. Cooked in 60
          seconds, eaten in silence — a Neapolitan rule we like to break with a
          glass of <em>vino della casa</em>.
        </p>

        <div className="v8-hero-ctas">
          {active.map((loc) => (
            <Link key={loc.slug} href={`/locations/${loc.slug}`} className="v8-hero-cta">
              <PinIcon />
              <span>Order in {loc.city}</span>
              <span className="bi-sec it">· Ordina a {loc.city}</span>
            </Link>
          ))}
          <Link href={STORY_HREF} className="v8-hero-cta v8-hero-cta-ghost">
            <BookIcon />
            <span>Our Story</span>
            <span className="bi-sec it">· La nostra storia</span>
          </Link>
        </div>

        <div className="v8-tricolore v8-hero-tricolore" aria-hidden />
      </div>
    </section>
  );
}

// Drop-pin icon — V8's outlined "location" mark with a hollow circle
// centre. Stroke uses currentColor so the same SVG works on the
// terracotta-fill primary CTA (parchment stroke) and the ghost
// oxblood CTA (oxblood stroke).
function PinIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden className="shrink-0">
      <path d="M10 18 C 6 12, 3 9, 3 6 A 7 7 0 0 1 17 6 C 17 9, 14 12, 10 18 Z" stroke="currentColor" strokeWidth="1.6" fill="rgba(244,245,240,0.15)" />
      <circle cx="10" cy="6.5" r="2.4" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

// Small "menu / story" book icon — three short lines inside a
// rectangle. Used on the ghost "Our Story" CTA.
function BookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden className="shrink-0">
      <path d="M4 3 L16 3 L16 17 L4 17 Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M7 7 L13 7 M7 10 L13 10 M7 13 L11 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
