"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getActiveLocations, getOpenLocations } from "@/data/locations";
import { Margherita } from "./Margherita";

// V8 Trattoria hero. The original "current" layout is a centered parchment
// block with scattered ornaments. Three appetite-forward redesign variants
// (audit §11.4 — "the hero… the competitor is showing you a Margherita on a
// wood peel") are selectable via `?hero=a|b|c` for a 1:1 in-context
// comparison on the live homepage:
//   a — wood peel, dark full-bleed
//   b — split editorial (recommended)
//   c — ingredient-forward, with provenance callouts
// All variants reuse the real theme tokens + live service-hour status + the
// real per-location CTAs; the only placeholder is the SVG Margherita, which
// production swaps for owned photography. The on-page switcher is a temporary
// comparison aid — it comes out once a direction is chosen.

const HEADLINE_EN = "Pizza, the way it's made in Naples";
const HEADLINE_IT = "La pizza, fatta come a Napoli";
const STORY_HREF = "/#famiglia";

type HeroVariant = "current" | "a" | "b" | "c";

export function HeroSection() {
  // Service-hour state is time-of-day-sensitive, so we only compute it after
  // mount to avoid an SSR/client mismatch. The hero variant is read from the
  // URL here too (client-only), so SSR always renders the current hero and the
  // chosen variant swaps in after mount.
  const [mounted, setMounted] = useState(false);
  const [variant, setVariant] = useState<HeroVariant>("current");
  useEffect(() => {
    const h = new URLSearchParams(window.location.search).get("hero");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe: mount gate + URL-driven variant
    setMounted(true);
    if (h === "a" || h === "b" || h === "c") setVariant(h);
  }, []);
  const active = getActiveLocations();
  const openCount = mounted ? getOpenLocations().length : 0;

  // ---- shared pieces (live data, reused across variants) ----
  const kicker = (
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
  );

  const eta = (
    <span className="v8-hero-eta">
      <ClockIcon /> Ready in ~<b>15&nbsp;min</b> <span className="bi-sec it">· pronto in 15 min</span>
    </span>
  );

  const ctas = (
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
  );

  const switcher = (
    <nav className="v8-hero-switch" aria-label="Hero design preview">
      <span className="v8-hero-switch-label">Hero:</span>
      <a href="?hero=current" className={variant === "current" ? "is-active" : ""}>Current</a>
      <a href="?hero=a" className={variant === "a" ? "is-active" : ""}>A</a>
      <a href="?hero=b" className={variant === "b" ? "is-active" : ""}>B</a>
      <a href="?hero=c" className={variant === "c" ? "is-active" : ""}>C</a>
    </nav>
  );

  // ---- Variant B — split editorial (recommended) ----
  if (variant === "b") {
    return (
      <>
        {switcher}
        <section className="v8-hero v8-hero--split relative overflow-hidden">
          <div className="v8-hero-inner mx-auto px-[22px] relative z-[2]">
            <div className="v8-hero-copy">
              {kicker}
              <h1 className="v8-hero-h1">{HEADLINE_EN}</h1>
              <div className="v8-hero-en"><span className="it">{HEADLINE_IT}</span></div>
              <p className="v8-hero-lede">
                San Marzano DOP from the slopes of Vesuvius. <em>Fior di latte</em> from
                Agerola. A wood-fired oven at 485&deg;C — cooked in 60 seconds, eaten in
                good company.
              </p>
              {ctas}
              <div className="v8-hero-meta">{eta}<span className="v8-tricolore" aria-hidden /></div>
            </div>
            <div className="v8-hero-art">
              <div className="v8-hero-disc"><Margherita className="v8-hero-pizza" seed={91237} /></div>
            </div>
          </div>
        </section>
      </>
    );
  }

  // ---- Variant C — ingredient-forward ----
  if (variant === "c") {
    return (
      <>
        {switcher}
        <section className="v8-hero v8-hero--ingredient relative overflow-hidden">
          <div className="v8-hero-inner max-w-[980px] mx-auto px-[22px] text-center relative z-[2]">
            {kicker}
            <h1 className="v8-hero-h1">{HEADLINE_EN}</h1>
            <div className="v8-hero-en"><span className="it">{HEADLINE_IT}</span></div>
            <div className="v8-hero-stage">
              <svg className="v8-hero-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                <g stroke="var(--color-terracotta)" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.55" fill="none">
                  <path d="M50 50 L12 6" /><path d="M50 50 L88 6" /><path d="M50 50 L12 94" /><path d="M50 50 L88 94" />
                </g>
              </svg>
              <Margherita className="v8-hero-pizza" seed={55310} />
              <div className="v8-hero-callout v8-hero-cl-tl"><b>San Marzano DOP</b><span>tomatoes from the slopes of Vesuvius</span></div>
              <div className="v8-hero-callout v8-hero-cl-tr"><b>Fior di latte</b><span>fresh from Agerola, torn by hand</span></div>
              <div className="v8-hero-callout v8-hero-cl-bl"><b>485&deg;C oven</b><span>wood-fired, leopard-charred crust</span></div>
              <div className="v8-hero-callout v8-hero-cl-br"><b>Basilico</b><span>fresh basil, finished raw</span></div>
            </div>
            {ctas}
            <div className="v8-hero-meta v8-hero-meta--center">{eta}</div>
          </div>
        </section>
      </>
    );
  }

  // ---- Variant A — wood peel, dark full-bleed ----
  if (variant === "a") {
    return (
      <>
        {switcher}
        <section className="v8-hero v8-hero--peel relative overflow-hidden">
          <div className="v8-hero-inner mx-auto px-[22px] text-center relative z-[2]">
            <div className="v8-hero-peelpie"><Margherita className="v8-hero-pizza" seed={40741} /></div>
            {kicker}
            <h1 className="v8-hero-h1">{HEADLINE_EN}</h1>
            <div className="v8-hero-en"><span className="it">{HEADLINE_IT}</span></div>
            <p className="v8-hero-lede">
              San Marzano DOP, <em>fior di latte</em> from Agerola, a wood-fired oven at
              485&deg;C — cooked in 60 seconds.
            </p>
            {ctas}
            <div className="v8-hero-meta v8-hero-meta--center">{eta}</div>
          </div>
        </section>
      </>
    );
  }

  // ---- Current (default) — original centered parchment hero ----
  return (
    <>
      {switcher}
      <section className="v8-hero relative overflow-hidden">
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
          {kicker}
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

          {ctas}

          <div className="v8-tricolore v8-hero-tricolore" aria-hidden />
        </div>
      </section>
    </>
  );
}

// Drop-pin icon — used on the location CTAs.
function PinIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden className="shrink-0">
      <path d="M10 18 C 6 12, 3 9, 3 6 A 7 7 0 0 1 17 6 C 17 9, 14 12, 10 18 Z" stroke="currentColor" strokeWidth="1.6" fill="rgba(244,245,240,0.15)" />
      <circle cx="10" cy="6.5" r="2.4" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

// Small "menu / story" book icon — used on the ghost "Our Story" CTA.
function BookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden className="shrink-0">
      <path d="M4 3 L16 3 L16 17 L4 17 Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M7 7 L13 7 M7 10 L13 10 M7 13 L11 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

// Clock glyph for the speed-guarantee ETA chip.
function ClockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0">
      <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 4.6 L8 8 L10.4 9.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
