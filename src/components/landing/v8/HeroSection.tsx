import Link from "next/link";
import { Bi } from "./Bi";
import { getActiveLocations } from "@/data/locations";

export function HeroSection() {
  const locations = getActiveLocations();

  return (
    <section className="v8-hero">
      <span className="v8-orn v8-orn-basil-tl" aria-hidden="true">
        <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
          <path d="M60 110 C 60 80, 60 50, 60 20" stroke="#4A7C59" strokeWidth="2" strokeLinecap="round" />
          <path d="M60 80 C 45 75, 35 60, 30 45 C 45 50, 55 65, 60 75" fill="#4A7C59" fillOpacity="0.18" stroke="#4A7C59" strokeWidth="2" strokeLinejoin="round" />
          <path d="M60 56 C 75 50, 90 38, 96 22 C 84 30, 70 42, 62 52" fill="#4A7C59" fillOpacity="0.18" stroke="#4A7C59" strokeWidth="2" strokeLinejoin="round" />
          <path d="M60 38 C 50 34, 42 26, 40 16 C 50 22, 56 30, 60 36" fill="#4A7C59" fillOpacity="0.18" stroke="#4A7C59" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </span>

      <span className="v8-orn v8-orn-basil-br" aria-hidden="true">
        <svg width="100" height="100" viewBox="0 0 100 100" fill="none">
          <path d="M50 92 C 50 65, 50 38, 50 14" stroke="#4A7C59" strokeWidth="2" strokeLinecap="round" />
          <path d="M50 64 C 38 60, 30 48, 27 36 C 38 40, 46 50, 50 60" fill="#4A7C59" fillOpacity="0.18" stroke="#4A7C59" strokeWidth="2" strokeLinejoin="round" />
          <path d="M50 44 C 62 40, 72 30, 76 18 C 66 24, 56 32, 50 42" fill="#4A7C59" fillOpacity="0.18" stroke="#4A7C59" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </span>

      <span className="v8-orn v8-orn-stain-1" aria-hidden="true">
        <svg width="160" height="160" viewBox="0 0 160 160" fill="none">
          <ellipse cx="80" cy="80" rx="72" ry="58" stroke="#7A2B2B" strokeWidth="1.2" fill="none" opacity="0.32" />
          <ellipse cx="80" cy="80" rx="54" ry="44" stroke="#7A2B2B" strokeWidth="1" fill="none" opacity="0.22" />
          <ellipse cx="80" cy="80" rx="34" ry="28" stroke="#7A2B2B" strokeWidth="0.9" fill="none" opacity="0.15" />
        </svg>
      </span>

      <span className="v8-orn v8-orn-stain-2" aria-hidden="true">
        <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
          <ellipse cx="60" cy="60" rx="56" ry="46" stroke="#C9A23E" strokeWidth="1.2" fill="none" opacity="0.32" />
          <ellipse cx="60" cy="60" rx="40" ry="32" stroke="#C9A23E" strokeWidth="1" fill="none" opacity="0.22" />
        </svg>
      </span>

      <span className="v8-orn v8-orn-tomato" aria-hidden="true">
        <svg width="70" height="70" viewBox="0 0 70 70" fill="none">
          <path d="M20 38 C 20 28, 30 22, 36 22 C 44 22, 52 28, 52 38 C 52 50, 44 58, 36 58 C 28 58, 20 50, 20 38 Z" fill="#B85C38" fillOpacity="0.45" stroke="#9A4A2B" strokeWidth="1.4" />
          <path d="M30 22 C 28 18, 30 14, 34 14 M36 22 C 36 16, 40 12, 44 14 M42 22 C 44 18, 42 14, 38 14" stroke="#4A7C59" strokeWidth="1.4" strokeLinecap="round" fill="none" />
        </svg>
      </span>

      <div className="v8-hero-inner">
        <span className="v8-hero-kicker">
          <span className="v8-pulse-dot" aria-hidden="true" />
          <span>
            <Bi en="Open now" pl="Otwarte teraz" />{" "}
            <span className="v8-it">· aperto ora</span>
          </span>
          <span className="v8-hero-kicker-cities">
            · {locations.map((l) => l.city).join(" · ")}
          </span>
        </span>

        <h1 className="v8-hero-h1">
          <Bi
            en="Pizza, the way it's made in Naples"
            pl="Pizza, tak jak robi się w Neapolu"
          />
        </h1>

        <div className="v8-hero-en">
          <span className="v8-it">La pizza, fatta come a Napoli</span>
        </div>

        <svg className="v8-hero-underline" width="220" height="18" viewBox="0 0 220 18" fill="none" aria-hidden="true">
          <path d="M4 11 C 40 4, 80 16, 110 9 S 180 4, 216 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
          <circle cx="216" cy="12" r="1.8" fill="currentColor" />
        </svg>

        <p className="v8-hero-lede">
          <Bi
            en="San Marzano DOP from the slopes of Vesuvius."
            pl="San Marzano DOP ze stoków Wezuwiusza."
          />{" "}
          <span className="v8-it-em">Fior di latte</span>{" "}
          <Bi en="from Agerola." pl="z Agerola." />{" "}
          <Bi
            en="A wood-fired oven that breathes at 485°C."
            pl="Piec opalany drewnem, oddychający w 485°C."
          />{" "}
          <Bi
            en="Cooked in 60 seconds, eaten in silence — a Neapolitan rule we like to break with a glass of"
            pl="Pieczona w 60 sekund, jedzona w ciszy — neapolitańska zasada, którą lubimy łamać kieliszkiem"
          />{" "}
          <span className="v8-it-em">vino della casa</span>.
        </p>

        <div className="v8-hero-ctas">
          {locations.map((loc) => (
            <Link key={loc.slug} href={`/locations/${loc.slug}`} className="v8-cta">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M10 18 C 6 12, 3 9, 3 6 A 7 7 0 0 1 17 6 C 17 9, 14 12, 10 18 Z" stroke="currentColor" strokeWidth="1.6" fill="rgba(244,245,240,0.15)" />
                <circle cx="10" cy="6.5" r="2.4" stroke="currentColor" strokeWidth="1.5" fill="none" />
              </svg>
              <span>
                <Bi en={`Order in ${loc.city}`} pl={`Zamów w ${loc.city}`} />{" "}
                <span className="v8-it v8-cta-it">· Ordina a {loc.city}</span>
              </span>
            </Link>
          ))}
          <Link href="#famiglia" className="v8-cta v8-cta-ghost">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M4 3 L16 3 L16 17 L4 17 Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <path d="M7 7 L13 7 M7 10 L13 10 M7 13 L11 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <span>
              <Bi en="Our story" pl="Nasza historia" />{" "}
              <span className="v8-it v8-cta-it">· la nostra storia</span>
            </span>
          </Link>
        </div>

        <div className="v8-tricolore v8-hero-tricolore" />
      </div>
    </section>
  );
}
