import Link from "next/link";
import { Bi } from "./Bi";
import { getActiveLocations } from "@/data/locations";
import { DEFAULT_BUNDLES, isDynamicBundle, type BundleTier } from "@/lib/bundles";
import { DEFAULT_COMBO_DEALS } from "@/lib/upsell";
import { formatPrice } from "@/lib/utils";

type Accent = "family" | "lunch" | "night" | "classic";

interface BundleCard {
  accent: Accent;
  tag: { en: string; pl: string; it: string };
  nameEn: { en: string; pl: string };
  nameIt: string;
  now: string | null;
  was: string | null;
  savings: string | null;
  desc: { en: string; pl: string };
  Icon: React.ComponentType;
}

function FamilyIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="9" cy="11" r="3" stroke="currentColor" strokeWidth="1.6" fill="rgba(255,255,255,0.4)" />
      <circle cx="16" cy="9" r="3.4" stroke="currentColor" strokeWidth="1.6" fill="rgba(255,255,255,0.4)" />
      <circle cx="23" cy="11" r="3" stroke="currentColor" strokeWidth="1.6" fill="rgba(255,255,255,0.4)" />
      <path d="M3 26 C 3 21, 6 18, 9 18 C 11 18, 13 19, 14 21" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path d="M8 26 C 8 20, 12 17, 16 17 C 20 17, 24 20, 24 26" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path d="M18 21 C 19 19, 21 18, 23 18 C 26 18, 29 21, 29 26" stroke="currentColor" strokeWidth="1.6" fill="none" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="1.6" fill="rgba(255,255,255,0.4)" />
      <path d="M16 5 L16 7 M16 25 L16 27 M5 16 L7 16 M25 16 L27 16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M16 16 L16 9 M16 16 L21 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="16" cy="16" r="1.4" fill="currentColor" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M21 6 A 11 11 0 1 0 21 26 A 8 8 0 0 1 21 6 Z" stroke="currentColor" strokeWidth="1.6" fill="rgba(255,255,255,0.4)" />
      <circle cx="9" cy="11" r="0.8" fill="currentColor" />
      <circle cx="13" cy="20" r="0.8" fill="currentColor" />
      <circle cx="6" cy="17" r="0.6" fill="currentColor" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M16 3 L18 13 L28 16 L18 19 L16 29 L14 19 L4 16 L14 13 Z" stroke="currentColor" strokeWidth="1.6" fill="rgba(255,255,255,0.4)" strokeLinejoin="round" />
      <path d="M25 5 L26 8 L29 9 L26 10 L25 13 L24 10 L21 9 L24 8 Z" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.3" strokeLinejoin="round" />
    </svg>
  );
}

function findBundle(id: string): BundleTier | undefined {
  return DEFAULT_BUNDLES.find((b) => b.id === id);
}

function priceFromBundle(id: string): { now: string | null; was: string | null } {
  const b = findBundle(id);
  if (!b || isDynamicBundle(b)) return { now: null, was: null };
  return {
    now: formatPrice(b.priceGrosze),
    was: b.refPriceGrosze > b.priceGrosze ? formatPrice(b.refPriceGrosze) : null,
  };
}

function buildCards(): BundleCard[] {
  const family = priceFromBundle("family-pizza-pack");
  const lunch = priceFromBundle("lunch-pizza-plus");
  const slice = priceFromBundle("late-slice");
  const classic = DEFAULT_COMBO_DEALS.find((c) => c.id === "italian-classic");

  return [
    {
      accent: "family",
      tag: { en: "for 2–3 people", pl: "dla 2–3 osób", it: "per 2–3 persone" },
      nameEn: { en: "Family Pack", pl: "Pakiet Rodzinny" },
      nameIt: "Famiglia",
      now: family.now,
      was: family.was,
      savings: null,
      desc: {
        en: "Three Margheritas + 1L of limonata. Set price, no maths. A bunch of friends — sorted.",
        pl: "Trzy Margherity + 1L limonaty. Stała cena, bez liczenia. Paczka znajomych — załatwione.",
      },
      Icon: FamilyIcon,
    },
    {
      accent: "lunch",
      tag: { en: "11:00–14:00 only", pl: "tylko 11:00–14:00", it: "soltanto" },
      nameEn: { en: "Pizza Lunch+", pl: "Pizza Lunch+" },
      nameIt: "Pranzo",
      now: lunch.now,
      was: lunch.was,
      savings: null,
      desc: {
        en: "Pizza + drink + a premium dolce at a flat price. For those who eat standing up — but eat well.",
        pl: "Pizza + napój + dolce premium w stałej cenie. Dla tych, co jedzą na stojąco — ale dobrze.",
      },
      Icon: ClockIcon,
    },
    {
      accent: "night",
      tag: { en: "after 21:00", pl: "po 21:00", it: "dopo le 21:00" },
      nameEn: { en: "Late-Night Slice", pl: "Nocna Pizza" },
      nameIt: "Spicchio Notturno",
      now: slice.now,
      was: slice.was,
      savings: null,
      desc: {
        en: "A slice reheated in 60 seconds in the wood-fired oven + a drink. For those who come home late.",
        pl: "Kawałek odgrzewany w 60 sekund w piecu opalanym drewnem + napój. Dla tych, co wracają późno.",
      },
      Icon: MoonIcon,
    },
    {
      accent: "classic",
      tag: { en: "automatic", pl: "automatyczny", it: "automatico" },
      nameEn: { en: "Italian Classic", pl: "Włoski Klasyk" },
      nameIt: "Il Classico",
      now: null,
      was: null,
      savings: classic ? `−${classic.discountPercent}%` : "−10%",
      desc: {
        en: "Activates automatically when you have a Margherita, a Limonata and a Tiramisù in your cart.",
        pl: "Aktywuje się automatycznie, gdy masz w koszyku Margheritę, Limonatę i Tiramisù.",
      },
      Icon: SparkleIcon,
    },
  ];
}

export function BundlesShowcase() {
  const cards = buildCards();
  const primaryLocation = getActiveLocations()[0]?.slug ?? "krakow";

  return (
    <section id="bundles" className="v8-section">
      <div className="v8-inner v8-inner-wide">
        <div className="v8-section-head">
          <div className="v8-eyebrow">
            <Bi en="Today's bundles" pl="Dzisiejsze zestawy" /> ·{" "}
            <span className="v8-it">menù del giorno</span>
          </div>
          <h2 className="v8-title">
            <Bi en="Pick a bundle." pl="Wybierz zestaw." />{" "}
            <Bi en="Skip the maths." pl="Bez liczenia." />
          </h2>
          <p className="v8-sub">
            <Bi en="Four ways to dine well —" pl="Cztery sposoby, by zjeść dobrze —" />{" "}
            <span className="v8-it-em">Famiglia</span>{" "}
            <Bi en="for friends," pl="dla znajomych," />{" "}
            <span className="v8-it-em">Pranzo</span>{" "}
            <Bi en="for the noon rush," pl="na lunch," />{" "}
            <span className="v8-it-em">Spicchio</span>{" "}
            <Bi en="for the late-night crew," pl="dla nocnych marków," />{" "}
            <span className="v8-it-em">Il Classico</span>{" "}
            <Bi
              en="if you're building dinner the proper way."
              pl="jeśli budujesz kolację po włosku."
            />
          </p>
        </div>

        <div className="v8-bundles">
          {cards.map((c) => (
            <article key={c.nameIt} className={`v8-bundle v8-b-${c.accent}`}>
              <div className="v8-bundle-icon">
                <c.Icon />
              </div>
              <span className="v8-bundle-tag">
                <Bi en={c.tag.en} pl={c.tag.pl} />{" "}
                <span className="v8-it">· {c.tag.it}</span>
              </span>
              <h3 className="v8-bundle-name">
                <Bi en={c.nameEn.en} pl={c.nameEn.pl} />
                <span className="v8-bundle-name-en">{c.nameIt}</span>
              </h3>
              <div className="v8-bundle-price">
                {c.savings ? (
                  <span className="v8-bundle-savings v8-num">{c.savings}</span>
                ) : c.now ? (
                  <>
                    <span className="v8-bundle-now v8-num">{c.now}</span>
                    {c.was && <span className="v8-bundle-was v8-num">{c.was}</span>}
                  </>
                ) : (
                  <span className="v8-bundle-savings">
                    <Bi en="See cart" pl="Zobacz w koszyku" />
                  </span>
                )}
              </div>
              <p className="v8-bundle-desc">
                <Bi en={c.desc.en} pl={c.desc.pl} />
              </p>
            </article>
          ))}
        </div>

        <p className="v8-bundle-foot">
          <Bi
            en="Bundles activate automatically in your cart when eligible."
            pl="Zestawy aktywują się automatycznie w koszyku, gdy są dostępne."
          />
        </p>

        <div className="v8-bundle-cta-wrap">
          <Link href={`/locations/${primaryLocation}`} className="v8-cta">
            <Bi en="Order now" pl="Zamów" />{" "}
            <span className="v8-it v8-cta-it">· inizia un ordine</span>{" "}
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
