import { Location } from "@/data/types";
import { Bi } from "../Bi";

interface V8LocationHeroProps {
  location: Location;
}

function WoodFiredOven() {
  return (
    <svg width="180" height="120" viewBox="0 0 220 140" fill="none" aria-hidden="true">
      <path d="M10 122 L210 122" stroke="#B85C38" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="48" y="92" width="124" height="22" rx="3" stroke="#7A2B2B" strokeWidth="1.8" fill="#E8D6B5" />
      <path d="M48 92 C 48 60, 80 38, 110 38 C 140 38, 172 60, 172 92 Z" stroke="#7A2B2B" strokeWidth="1.8" fill="#F2E2C2" />
      <path d="M82 92 C 82 76, 96 66, 110 66 C 124 66, 138 76, 138 92 Z" stroke="#3D2817" strokeWidth="1.6" fill="#3D2817" />
      <path d="M96 88 C 100 80, 104 84, 108 78 C 112 84, 116 80, 120 88" stroke="#CD212A" strokeWidth="1.8" fill="#CD212A" fillOpacity="0.3" strokeLinejoin="round" />
      <path d="M102 86 C 105 81, 108 84, 111 79 C 114 84, 117 81, 120 86" stroke="#C9A23E" strokeWidth="1.2" fill="none" strokeLinejoin="round" />
      <rect x="100" y="22" width="14" height="20" stroke="#7A2B2B" strokeWidth="1.6" fill="#B85C38" fillOpacity="0.2" />
      <path d="M107 18 C 110 12, 105 6, 110 0" stroke="#8C6F4F" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

const SUBTITLE: Record<string, { en: string; pl: string; it: string }> = {
  krakow: {
    en: "our first home",
    pl: "nasz pierwszy dom",
    it: "la nostra prima casa",
  },
  warszawa: {
    en: "in the heart of Śródmieście",
    pl: "w sercu Śródmieścia",
    it: "nel cuore di Śródmieście",
  },
};

export function V8LocationHero({ location }: V8LocationHeroProps) {
  const sub = SUBTITLE[location.slug] ?? {
    en: location.shortDescription,
    pl: location.shortDescription,
    it: location.city,
  };

  return (
    <section className="v8-loc-hero">
      <span className="v8-loc-hero-orn v8-orn-stain-1" aria-hidden="true">
        <svg width="180" height="180" viewBox="0 0 160 160" fill="none">
          <ellipse cx="80" cy="80" rx="72" ry="58" stroke="#7A2B2B" strokeWidth="1.2" fill="none" opacity="0.18" />
          <ellipse cx="80" cy="80" rx="54" ry="44" stroke="#7A2B2B" strokeWidth="1" fill="none" opacity="0.12" />
        </svg>
      </span>

      <div className="v8-loc-hero-inner">
        <div className="v8-loc-hero-illus" aria-hidden="true">
          <WoodFiredOven />
        </div>
        <div className="v8-eyebrow">
          <Bi en="The truck" pl="Lokal" /> ·{" "}
          <span className="v8-it">la bottega</span>
        </div>
        <h1 className="v8-loc-hero-name">
          {location.city}
          <span className="v8-loc-hero-sub v8-it">
            · <Bi en={sub.en} pl={sub.pl} /> · {sub.it}
          </span>
        </h1>
        <p className="v8-loc-hero-desc">{location.description}</p>
      </div>

      <div className="v8-tricolore" />
    </section>
  );
}
