"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { locations, isLocationOpenNow } from "@/data/locations";
import type { Location } from "@/data/types";
import { NotifyMeForm } from "./NotifyMeForm";

// V8 Trattoria locations grid — full-width parchment-tinted section
// (`.v8-ps.alt`) with a centred header (eyebrow / bilingual title /
// muted Lora subtitle) and a 1 → 2-column grid of paper cards.
// Each card carries a per-slug pen-sketch illustration (wood-fired
// oven for Kraków, Vespa with pizza box for Warszawa, generic
// market-stall fallback otherwise), the tricolore hairline, then a
// body with: city name + live status pill (terracotta pulse + bilingual
// "Open now / aperto ora"), an info block (pin + clock), a short
// italic description, an italic "Cooked by X and crew" attribution
// note with an ochre left border, and the terracotta CTA "View Menu
// & Order · vedi il menù & ordina →".
//
// Status comes from `isLocationOpenNow()`; on mount-gated state so SSR
// matches the client first render (same pattern as Hero).

export function LocationsGrid() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <section id="locations" className="v8-ps v8-ps-alt">
      <div className="v8-page-inner">
        <div className="v8-ps-head">
          <div className="v8-ps-eyebrow">
            <span>The trucks</span> <span className="bi-sec">· le botteghe</span>
          </div>
          <h2 className="v8-ps-title">
            Two addresses, <span className="it">one family</span>
          </h2>
          <p className="v8-ps-sub">
            Two trucks, one kitchen, one nonna who taught us the dough.
          </p>
        </div>

        <div className="v8-locs">
          {locations.map((location) => (
            <LocationCard key={location.slug} location={location} mounted={mounted} />
          ))}
        </div>
      </div>
    </section>
  );
}

function LocationCard({ location, mounted }: { location: Location; mounted: boolean }) {
  const open = mounted ? isLocationOpenNow(location) : false;
  return (
    <article className="v8-loc-card">
      <div className="v8-loc-illus" aria-hidden>
        <LocationIllustration slug={location.slug} />
      </div>
      <div className="v8-tricolore v8-loc-tricolore" aria-hidden />
      <div className="v8-loc-body">
        <div className="v8-loc-head">
          <div className="v8-loc-name">{location.city}</div>
          {location.isActive ? (
            <span className={`v8-loc-status ${open ? "is-live" : "is-muted"}`}>
              <span className="v8-loc-status-dot" aria-hidden />
              <span>{open ? "Open now" : "Closed now"}</span>
              <span className="it bi-sec">· {open ? "aperto ora" : "chiuso ora"}</span>
            </span>
          ) : (
            <span className="v8-loc-status is-soon">
              <span>Coming soon</span>
              <span className="it bi-sec">· in arrivo</span>
            </span>
          )}
        </div>
        <div className="v8-loc-info">
          <div className="v8-loc-info-row">
            <PinSvg />
            <div>{location.address}</div>
          </div>
          <div className="v8-loc-info-row">
            <ClockSvg />
            <div className="v8-hours-line">
              {location.hours.map((h, i) => (
                <span key={i}>
                  {i > 0 && " · "}
                  {h.day} {h.open}–{h.close}
                </span>
              ))}
            </div>
          </div>
        </div>
        <p className="v8-loc-desc">{location.shortDescription}</p>
        {location.teamLead && <p className="v8-loc-note">{location.teamLead}</p>}
        {location.isActive ? (
          <Link href={`/locations/${location.slug}`} className="v8-loc-cta">
            <span>View Menu &amp; Order</span>
            <span className="it bi-sec">· vedi il menù &amp; ordina</span>
            <span aria-hidden>→</span>
          </Link>
        ) : (
          <div className="v8-loc-notify">
            <p>Get notified when we open · <span className="it">avvisami all&apos;apertura</span></p>
            <NotifyMeForm city={location.city} />
          </div>
        )}
      </div>
    </article>
  );
}

function PinSvg() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M10 18 C 6 12, 3 9, 3 6 A 7 7 0 0 1 17 6 C 17 9, 14 12, 10 18 Z" stroke="#B85C38" strokeWidth="1.5" fill="rgba(184,92,56,0.12)" />
      <circle cx="10" cy="6.5" r="2.4" stroke="#B85C38" strokeWidth="1.4" fill="none" />
    </svg>
  );
}

function ClockSvg() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="7.5" stroke="#B85C38" strokeWidth="1.5" fill="none" />
      <path d="M10 5 L10 10 L13.5 12.5" stroke="#B85C38" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// Per-slug pen-sketch illustration. V8 has a wood-fired oven for the
// Kraków card and a Vespa for Warszawa; future locations fall back to
// a generic market-stall sketch so an `isActive: true` city always
// gets art without a manual asset drop.
function LocationIllustration({ slug }: { slug: string }) {
  if (slug === "krakow") return <OvenIllus />;
  if (slug === "warszawa") return <VespaIllus />;
  return <MarketStallIllus />;
}

function OvenIllus() {
  return (
    <svg width="220" height="140" viewBox="0 0 220 140" fill="none">
      <path d="M10 122 L210 122" stroke="#B85C38" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="48" y="92" width="124" height="22" rx="3" stroke="#7A2B2B" strokeWidth="1.8" fill="#E8D6B5" />
      <path d="M48 92 C 48 60, 80 38, 110 38 C 140 38, 172 60, 172 92 Z" stroke="#7A2B2B" strokeWidth="1.8" fill="#F2E2C2" />
      <path d="M82 92 C 82 76, 96 66, 110 66 C 124 66, 138 76, 138 92 Z" stroke="#3D2817" strokeWidth="1.6" fill="#3D2817" />
      <path d="M96 88 C 100 80, 104 84, 108 78 C 112 84, 116 80, 120 88" stroke="#CD212A" strokeWidth="1.8" fill="#CD212A" fillOpacity="0.3" strokeLinejoin="round" />
      <path d="M102 86 C 105 81, 108 84, 111 79 C 114 84, 117 81, 120 86" stroke="#C9A23E" strokeWidth="1.2" fill="none" strokeLinejoin="round" />
      <rect x="100" y="22" width="14" height="20" stroke="#7A2B2B" strokeWidth="1.6" fill="#B85C38" fillOpacity="0.2" />
      <path d="M107 18 C 110 12, 105 6, 110 0" stroke="#8C6F4F" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.6" />
      <path d="M48 100 L172 100" stroke="#7A2B2B" strokeWidth="0.6" opacity="0.5" />
      <path d="M60 78 C 80 60, 140 60, 160 78" stroke="#7A2B2B" strokeWidth="0.6" opacity="0.5" fill="none" />
      <path d="M68 56 C 90 44, 130 44, 152 56" stroke="#7A2B2B" strokeWidth="0.6" opacity="0.5" fill="none" />
      <path d="M178 110 L208 88" stroke="#3D2817" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="174" y="98" width="20" height="14" rx="2" transform="rotate(-30 184 105)" stroke="#3D2817" strokeWidth="1.6" fill="#E8D6B5" />
    </svg>
  );
}

function VespaIllus() {
  return (
    <svg width="220" height="140" viewBox="0 0 220 140" fill="none">
      <path d="M10 122 L210 122" stroke="#B85C38" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="32" y="48" width="46" height="26" rx="2" stroke="#7A2B2B" strokeWidth="1.6" fill="#E8D6B5" />
      <path d="M32 56 L78 56" stroke="#7A2B2B" strokeWidth="1" opacity="0.6" />
      <text x="55" y="68" textAnchor="middle" fontFamily="Georgia" fontSize="9" fontStyle="italic" fill="#7A2B2B">Ottaviano</text>
      <path d="M68 100 C 60 100, 56 92, 60 82 C 64 72, 78 70, 92 72 L120 78 C 134 80, 148 82, 156 92 L162 102 C 158 110, 76 110, 68 100 Z" stroke="#7A2B2B" strokeWidth="1.8" fill="#B85C38" fillOpacity="0.4" strokeLinejoin="round" />
      <path d="M82 78 L120 78 L122 70 L88 70 Z" stroke="#3D2817" strokeWidth="1.6" fill="#3D2817" />
      <path d="M152 86 L168 64" stroke="#3D2817" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M164 60 L176 56" stroke="#3D2817" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="158" cy="84" r="5" stroke="#C9A23E" strokeWidth="1.4" fill="#C9A23E" fillOpacity="0.6" />
      <path d="M156 88 C 168 82, 178 82, 184 92" stroke="#7A2B2B" strokeWidth="1.6" fill="none" />
      <circle cx="72" cy="112" r="11" stroke="#3D2817" strokeWidth="1.8" fill="#F8EFDE" />
      <circle cx="72" cy="112" r="4" stroke="#3D2817" strokeWidth="1.5" fill="#7A2B2B" />
      <circle cx="158" cy="112" r="11" stroke="#3D2817" strokeWidth="1.8" fill="#F8EFDE" />
      <circle cx="158" cy="112" r="4" stroke="#3D2817" strokeWidth="1.5" fill="#7A2B2B" />
      <path d="M14 86 L34 86 M10 94 L30 94 M16 102 L28 102" stroke="#C9A23E" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
      <path d="M180 30 C 184 24, 188 28, 190 22" stroke="#4A7C59" strokeWidth="1.4" fill="none" />
      <path d="M186 26 C 190 22, 194 24, 196 18" stroke="#4A7C59" strokeWidth="1.4" fill="none" />
    </svg>
  );
}

// Fallback for cities V8 didn't hand-illustrate yet — a market stall
// with the canvas roof, two crates of produce, and the same warm
// palette as the oven / Vespa sketches. Used for Wrocław and any
// future location until it gets its own illustration.
function MarketStallIllus() {
  return (
    <svg width="220" height="140" viewBox="0 0 220 140" fill="none">
      <path d="M10 122 L210 122" stroke="#B85C38" strokeWidth="1.5" strokeLinecap="round" />
      {/* canopy */}
      <path d="M30 60 L190 60 L180 38 L40 38 Z" stroke="#7A2B2B" strokeWidth="1.8" fill="#CD212A" fillOpacity="0.18" strokeLinejoin="round" />
      <path d="M50 60 L60 38 M70 60 L80 38 M90 60 L100 38 M110 60 L120 38 M130 60 L140 38 M150 60 L160 38" stroke="#7A2B2B" strokeWidth="0.8" opacity="0.5" />
      {/* counter */}
      <rect x="44" y="60" width="132" height="48" stroke="#7A2B2B" strokeWidth="1.6" fill="#E8D6B5" />
      <rect x="44" y="60" width="132" height="6" fill="#7A2B2B" fillOpacity="0.18" />
      {/* crates */}
      <rect x="56" y="78" width="38" height="22" stroke="#3D2817" strokeWidth="1.4" fill="#F2E2C2" />
      <rect x="98" y="78" width="38" height="22" stroke="#3D2817" strokeWidth="1.4" fill="#F2E2C2" />
      {/* tomatoes */}
      <circle cx="64" cy="74" r="3.5" fill="#CD212A" fillOpacity="0.6" />
      <circle cx="72" cy="73" r="3.5" fill="#CD212A" fillOpacity="0.7" />
      <circle cx="82" cy="74" r="3.5" fill="#CD212A" fillOpacity="0.6" />
      {/* basil leaves */}
      <path d="M104 72 C 110 66, 116 70, 118 64 M114 70 C 118 64, 122 68, 124 62" stroke="#4A7C59" strokeWidth="1.5" fill="#4A7C59" fillOpacity="0.22" strokeLinejoin="round" />
      {/* hanging price tag */}
      <path d="M140 38 L140 52" stroke="#3D2817" strokeWidth="1.2" />
      <path d="M134 52 L146 52 L150 58 L146 64 L134 64 L138 58 Z" stroke="#3D2817" strokeWidth="1.4" fill="#F8EFDE" strokeLinejoin="round" />
      <circle cx="140" cy="58" r="1.2" fill="#3D2817" />
    </svg>
  );
}
