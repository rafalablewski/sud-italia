"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Location } from "@/data/types";
import { getCurrentHourSlot } from "@/data/locations";

// V8 Trattoria location-page hero. Parchment canvas with a soft
// fade-to-parchment-deep at the bottom, basil ornament behind the
// content, per-slug pen-sketch illustration (oven for Kraków, Vespa
// for Warszawa, market-stall fallback), tricolore hairline, city
// name with an italic-terracotta tagline below, italic-Cormorant
// sub line, then the basil-tinted status pill rendering the REAL
// close time from `getCurrentHourSlot()`.
//
// Tagline + sub are **local marketing copy** keyed by slug. V8's
// brand voice ("our first home" for Kraków, "in the heart of
// Śródmieście" for Warszawa) doesn't belong in lib/locations.ts —
// the Location type carries operator data (address, hours,
// teamLead), not the homepage's hospitality voice. Same pattern the
// bundles took.
//
// The back chip ("← Home · la casa") is rendered inside the hero
// at its top-left corner — a single anchored chip on the same
// parchment canvas, not a separate cream strip above. A visitor
// who landed deep can still hop back to the landing without
// scrolling up to the nav; the chip targets `/` (not `#famiglia`
// etc.).

interface LocationHeroProps {
  location: Location;
}

interface LocCopy {
  tagline: string;
  taglineIt: string;
  subEn: string;
  subIt: string;
  subEm?: string; // optional italic-emphasis trailing phrase
}

// V8 mockup copy. New locations fall back to a generic, location-
// agnostic sub if they aren't listed here — operator can ship a new
// location without a code change; the hero degrades gracefully.
const LOC_COPY: Record<string, LocCopy> = {
  krakow: {
    tagline: "our first home",
    taglineIt: "la nostra prima casa",
    subEn: "With Giuseppe, in the heart of the Rynek",
    subIt: "da Giuseppe, nel cuore del Rynek",
    subEm: "where it all began",
  },
  warszawa: {
    tagline: "in the heart of Śródmieście",
    taglineIt: "nel cuore di Śródmieście",
    subEn: "With Anna, the pizzaiola of Nowy Świat",
    subIt: "da Anna, pizzaiola di via Nowy Świat",
  },
};

function defaultCopy(location: Location): LocCopy {
  return {
    tagline: location.isActive ? "now serving" : "coming soon",
    taglineIt: location.isActive ? "in servizio" : "in arrivo",
    subEn: `${location.teamLead ?? "Made by our team"}, in ${location.city}`,
    subIt: `a ${location.city}`,
  };
}

export function LocationHero({ location }: LocationHeroProps) {
  // Time-of-day dependent — mount-gate so SSR/client render the same
  // placeholder ("Closed now") and we swap in the real slot on the
  // client. Same pattern as the homepage Hero + LiveTicker.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const slot = mounted ? getCurrentHourSlot(location) : null;
  const copy = LOC_COPY[location.slug] ?? defaultCopy(location);

  return (
    <header className="v8-loc-hero">
      <Link href="/" className="v8-back-chip v8-loc-back-chip">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path d="M9 2 L4 7 L9 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
        <span>
          Home <span className="bi-sec">· la casa</span>
        </span>
      </Link>

      <span className="v8-hero-orn v8-hero-orn-basil-tl" aria-hidden>
          <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
            <path d="M60 110 C 60 80, 60 50, 60 20" stroke="#4A7C59" strokeWidth="2" strokeLinecap="round" />
            <path d="M60 80 C 45 75, 35 60, 30 45 C 45 50, 55 65, 60 75" fill="#4A7C59" fillOpacity="0.18" stroke="#4A7C59" strokeWidth="2" strokeLinejoin="round" />
            <path d="M60 65 C 75 60, 85 45, 90 30 C 75 35, 65 50, 60 60" fill="#4A7C59" fillOpacity="0.18" stroke="#4A7C59" strokeWidth="2" strokeLinejoin="round" />
          </svg>
        </span>

        <div className="v8-loc-hero-inner">
          <LocationHeroIllus slug={location.slug} />
          <div className="v8-tricolore v8-loc-hero-tricolore" aria-hidden />
          <h1 className="v8-loc-hero-name">
            {location.city}
            <span className="v8-loc-hero-tagline">
              · <span>{copy.tagline}</span> · <span className="bi-sec">{copy.taglineIt}</span>
            </span>
          </h1>
          <p className="v8-loc-hero-sub">
            <span>{copy.subEn}</span> <span className="bi-sec">· {copy.subIt}</span>
            {copy.subEm && (
              <>
                {" "}
                · <em>{copy.subEm}</em>
              </>
            )}
          </p>
          <span className={`v8-loc-hero-status ${slot ? "is-live" : "is-muted"}`}>
            <span className="v8-loc-hero-status-dot" aria-hidden />
            {slot ? (
              <>
                <span>Open until {slot.close}</span>{" "}
                <span className="bi-sec">· aperto fino alle {slot.close}</span>
              </>
            ) : (
              <>
                <span>Closed now</span> <span className="bi-sec">· chiuso ora</span>
              </>
            )}
          </span>
      </div>
    </header>
  );
}

// Per-slug detailed hero illustrations. V8 ships hand-drawn variants
// for each city — these are wider (360×180) and more detailed than
// the LocationsGrid card sketches (220×140). Adding a new city's
// illustration is a function-per-slug + a switch in
// `LocationHeroIllus` below.
function LocationHeroIllus({ slug }: { slug: string }) {
  if (slug === "krakow") return <OvenHeroIllus />;
  if (slug === "warszawa") return <VespaHeroIllus />;
  return <GenericHeroIllus />;
}

function OvenHeroIllus() {
  return (
    <svg className="v8-loc-hero-illus" viewBox="0 0 360 180" fill="none" aria-hidden>
      <path d="M20 158 L340 158" stroke="#B85C38" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M30 110 L40 96 L52 110 L62 92 L80 110 L90 98 L100 110 L110 88 L130 110" stroke="#7A2B2B" strokeWidth="1" fill="none" opacity="0.45" />
      <path d="M240 110 L260 92 L274 110 L290 96 L312 110 L330 100 L340 108" stroke="#7A2B2B" strokeWidth="1" fill="none" opacity="0.45" />
      <rect x="120" y="118" width="120" height="28" rx="3" stroke="#7A2B2B" strokeWidth="2" fill="#E8D6B5" />
      <path d="M120 118 C 120 80, 152 56, 180 56 C 208 56, 240 80, 240 118 Z" stroke="#7A2B2B" strokeWidth="2" fill="#F2E2C2" />
      <path d="M150 118 C 150 100, 162 88, 180 88 C 198 88, 210 100, 210 118 Z" stroke="#3D2817" strokeWidth="1.8" fill="#3D2817" />
      <path d="M162 114 C 166 104, 170 110, 175 100 C 180 110, 184 104, 190 114 C 196 108, 199 112, 200 114" stroke="#CD212A" strokeWidth="1.8" fill="#CD212A" fillOpacity="0.4" strokeLinejoin="round" />
      <path d="M168 110 C 172 102, 175 108, 178 100 C 182 106, 187 102, 192 110" stroke="#C9A23E" strokeWidth="1.3" fill="none" strokeLinejoin="round" />
      <rect x="170" y="38" width="18" height="22" stroke="#7A2B2B" strokeWidth="1.6" fill="#B85C38" fillOpacity="0.22" />
      <path d="M177 34 C 182 26, 174 18, 180 8" stroke="#8C6F4F" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.6" />
      <path d="M186 34 C 190 26, 184 18, 190 10" stroke="#8C6F4F" strokeWidth="1.3" fill="none" strokeLinecap="round" opacity="0.45" />
      <path d="M120 128 L240 128" stroke="#7A2B2B" strokeWidth="0.6" opacity="0.5" />
      <path d="M134 100 C 152 80, 208 80, 226 100" stroke="#7A2B2B" strokeWidth="0.6" opacity="0.5" fill="none" />
      <path d="M142 78 C 160 66, 200 66, 218 78" stroke="#7A2B2B" strokeWidth="0.6" opacity="0.5" fill="none" />
      <path d="M248 136 L322 88" stroke="#3D2817" strokeWidth="2" strokeLinecap="round" />
      <rect x="240" y="120" width="26" height="18" rx="2" transform="rotate(-32 252 128)" stroke="#3D2817" strokeWidth="1.6" fill="#E8D6B5" />
      <path d="M62 56 C 64 50, 68 52, 70 48" stroke="#4A7C59" strokeWidth="1.4" fill="none" />
      <path d="M66 52 C 70 48, 74 50, 76 44" stroke="#4A7C59" strokeWidth="1.4" fill="none" />
      <ellipse cx="84" cy="148" rx="9" ry="8" fill="#B85C38" fillOpacity="0.5" stroke="#7A2B2B" strokeWidth="1.4" />
      <path d="M84 140 L84 134" stroke="#4A7C59" strokeWidth="1.4" />
      <path d="M84 138 C 81 134, 78 134, 76 132 C 78 137, 80 139, 84 140" stroke="#4A7C59" strokeWidth="1.2" fill="#4A7C59" fillOpacity="0.3" />
      <path d="M84 138 C 87 134, 90 134, 92 132 C 90 137, 88 139, 84 140" stroke="#4A7C59" strokeWidth="1.2" fill="#4A7C59" fillOpacity="0.3" />
    </svg>
  );
}

function VespaHeroIllus() {
  return (
    <svg className="v8-loc-hero-illus" viewBox="0 0 360 180" fill="none" aria-hidden>
      <path d="M20 158 L340 158" stroke="#B85C38" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M20 120 L40 120 L40 100 L60 100 L60 120" stroke="#7A2B2B" strokeWidth="1" fill="none" opacity="0.45" />
      <path d="M70 120 L70 88 L80 88 L80 120" stroke="#7A2B2B" strokeWidth="1" fill="none" opacity="0.45" />
      <path d="M280 120 L280 90 L300 90 L300 120" stroke="#7A2B2B" strokeWidth="1" fill="none" opacity="0.45" />
      <path d="M310 120 L310 80 L324 80 L324 120 L340 120" stroke="#7A2B2B" strokeWidth="1" fill="none" opacity="0.45" />
      <rect x="58" y="64" width="68" height="38" rx="3" stroke="#7A2B2B" strokeWidth="1.8" fill="#E8D6B5" />
      <path d="M58 76 L126 76" stroke="#7A2B2B" strokeWidth="1" opacity="0.6" />
      <text x="92" y="92" textAnchor="middle" fontFamily="Cormorant Garamond, serif" fontSize="13" fontStyle="italic" fill="#7A2B2B">Ottaviano</text>
      <path d="M92 64 L92 102" stroke="#CD212A" strokeWidth="1.2" opacity="0.5" />
      <path d="M108 138 C 96 138, 90 124, 96 110 C 102 96, 122 92, 142 96 L184 104 C 204 108, 224 112, 234 126 L242 140 C 236 152, 116 152, 108 138 Z" stroke="#7A2B2B" strokeWidth="2" fill="#B85C38" fillOpacity="0.45" strokeLinejoin="round" />
      <path d="M128 104 L184 104 L186 92 L132 92 Z" stroke="#3D2817" strokeWidth="1.8" fill="#3D2817" />
      <path d="M228 118 L252 86" stroke="#3D2817" strokeWidth="2" strokeLinecap="round" />
      <path d="M246 80 L264 74" stroke="#3D2817" strokeWidth="2" strokeLinecap="round" />
      <circle cx="238" cy="116" r="7" stroke="#C9A23E" strokeWidth="1.6" fill="#C9A23E" fillOpacity="0.7" />
      <path d="M234 122 C 252 114, 264 114, 274 128" stroke="#7A2B2B" strokeWidth="1.8" fill="none" />
      <circle cx="114" cy="152" r="15" stroke="#3D2817" strokeWidth="2" fill="#F8EFDE" />
      <circle cx="114" cy="152" r="6" stroke="#3D2817" strokeWidth="1.6" fill="#7A2B2B" />
      <circle cx="238" cy="152" r="15" stroke="#3D2817" strokeWidth="2" fill="#F8EFDE" />
      <circle cx="238" cy="152" r="6" stroke="#3D2817" strokeWidth="1.6" fill="#7A2B2B" />
      <path d="M22 118 L48 118 M16 128 L42 128 M24 138 L42 138" stroke="#C9A23E" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
      <path d="M286 50 C 292 42, 298 46, 302 38" stroke="#4A7C59" strokeWidth="1.6" fill="none" />
      <path d="M296 44 C 302 38, 308 40, 312 32" stroke="#4A7C59" strokeWidth="1.6" fill="none" />
      <path d="M298 48 C 294 44, 290 44, 288 46 C 290 50, 294 50, 298 48" stroke="#4A7C59" strokeWidth="1.2" fill="#4A7C59" fillOpacity="0.4" />
    </svg>
  );
}

// Generic hero illustration — a stylised market awning + crate of
// produce. Used when a new location ships before its dedicated
// sketch lands.
function GenericHeroIllus() {
  return (
    <svg className="v8-loc-hero-illus" viewBox="0 0 360 180" fill="none" aria-hidden>
      <path d="M20 158 L340 158" stroke="#B85C38" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M70 90 L290 90 L270 50 L90 50 Z" stroke="#7A2B2B" strokeWidth="2" fill="#CD212A" fillOpacity="0.18" strokeLinejoin="round" />
      <path d="M100 90 L120 50 M140 90 L160 50 M180 90 L200 50 M220 90 L240 50 M260 90 L280 50" stroke="#7A2B2B" strokeWidth="0.8" opacity="0.5" />
      <rect x="80" y="90" width="200" height="68" stroke="#7A2B2B" strokeWidth="1.8" fill="#E8D6B5" />
      <rect x="80" y="90" width="200" height="8" fill="#7A2B2B" fillOpacity="0.18" />
      <rect x="100" y="108" width="60" height="36" stroke="#3D2817" strokeWidth="1.6" fill="#F2E2C2" />
      <rect x="170" y="108" width="60" height="36" stroke="#3D2817" strokeWidth="1.6" fill="#F2E2C2" />
      <circle cx="112" cy="102" r="5" fill="#CD212A" fillOpacity="0.6" />
      <circle cx="124" cy="100" r="5" fill="#CD212A" fillOpacity="0.7" />
      <circle cx="138" cy="102" r="5" fill="#CD212A" fillOpacity="0.6" />
      <circle cx="150" cy="100" r="5" fill="#CD212A" fillOpacity="0.7" />
      <path d="M178 100 C 188 92, 200 96, 204 88 M194 100 C 204 92, 214 96, 218 88" stroke="#4A7C59" strokeWidth="1.6" fill="#4A7C59" fillOpacity="0.22" strokeLinejoin="round" />
      <ellipse cx="320" cy="148" rx="10" ry="9" fill="#B85C38" fillOpacity="0.5" stroke="#7A2B2B" strokeWidth="1.4" />
      <path d="M320 139 L320 132" stroke="#4A7C59" strokeWidth="1.4" />
    </svg>
  );
}
