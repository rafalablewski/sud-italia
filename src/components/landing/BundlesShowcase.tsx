import Link from "next/link";
import { getActiveLocations } from "@/data/locations";
import { DEFAULT_BUNDLES, isDynamicBundle, type BundleTier } from "@/lib/bundles";
import { DEFAULT_COMBO_DEALS } from "@/lib/upsell";
import { formatPrice } from "@/lib/utils";

// V8 Trattoria Bundles showcase — four paper cards inside the wider
// `.v8-bundles-section` page-inner (1500px max, leaves a parchment
// gutter on huge screens). Each card has a top accent stripe (5px,
// per-bundle gradient), a circle icon in the same accent, a tag pill,
// the italian-italic bundle name + uppercase english subtitle, the
// price (now / was / savings), and a description with italic-Cormorant
// `<em>` Italian phrases. Bottom: italic Cormorant foot-note + a
// terracotta "Order now" CTA reusing `.v8-hero-cta`.
//
// Numbers + names come from the canonical DEFAULT_BUNDLES (lib/bundles)
// and DEFAULT_COMBO_DEALS (lib/upsell) so the homepage stays in sync
// with the seed config. Marketing copy + the Italian secondary name
// stay local to this component — there's no per-bundle "homepage
// subtitle" field on the bundle schema, and adding one to the runtime
// schema just to feed the landing would bloat every admin save round-
// trip. The data flow Rule #1 honours: every PRICE here comes from
// the same source the cart drawer reads from — no hardcoded zł.
//
// Per-location admin overrides (LocationUpsellConfig.bundles) do NOT
// reflect here — the homepage is location-agnostic. The cart drawer's
// bundle ladder shows the actual location-specific pricing once the
// customer picks a truck. Operators retuning a bundle dramatically
// different from the seed should expect a homepage-vs-cart mismatch
// during the experiment; rolling the seed forward fixes it.

interface BundleCard {
  /** Card accent variant — controls the top stripe gradient, icon
   *  colour, and the uppercase english subtitle colour. */
  variant: "family" | "lunch" | "night" | "classic";
  /** Italian primary name in italic Cormorant — V8's signature pattern.
   *  English subtitle below comes from `english`. */
  italian: string;
  english: string;
  /** Tag pill copy (EN) + italic Italian subtitle (after the dot). */
  tag: string;
  tagIt: string;
  /** Price treatment — "money" shows now + was, "savings" shows
   *  -X% only (for the auto-applied combo deal that has no fixed
   *  price). */
  price:
    | { kind: "money"; now: string; was: string | null }
    | { kind: "savings"; label: string };
  /** Description copy. May contain Italian phrases in <em> tags
   *  rendered as italic Cormorant via .v8-bundle-desc em. */
  desc: React.ReactNode;
  /** Pre-rendered icon SVG. */
  icon: React.ReactNode;
}

function priceFromBundle(id: string): { now: string; was: string | null } {
  const b = DEFAULT_BUNDLES.find((x) => x.id === id);
  if (!b || isDynamicBundle(b)) return { now: "See cart", was: null };
  return {
    now: formatPrice(b.priceGrosze),
    was: b.refPriceGrosze > b.priceGrosze ? formatPrice(b.refPriceGrosze) : null,
  };
}

function buildShowcase(): BundleCard[] {
  const family = priceFromBundle("family-pizza-pack");
  const pizzaLunch = priceFromBundle("lunch-pizza-plus");
  const lateSlice = priceFromBundle("late-slice");
  const italianClassic = DEFAULT_COMBO_DEALS.find((c) => c.id === "italian-classic");
  const classicDiscount = italianClassic?.discountPercent ?? 10;
  const findBundle = (id: string): BundleTier | undefined => DEFAULT_BUNDLES.find((b) => b.id === id);

  return [
    {
      variant: "family",
      italian: findBundle("family-pizza-pack")?.name ?? "Family Pack",
      english: "Famiglia",
      tag: "for 2–3 people",
      tagIt: "per 2–3 persone",
      price: { kind: "money", now: family.now, was: family.was },
      desc: (
        <>
          Three Margheritas + 1L of <em>limonata</em>. Set price, no maths.
          A bunch of friends — sorted.
        </>
      ),
      icon: <FamilyIcon />,
    },
    {
      variant: "lunch",
      italian: findBundle("lunch-pizza-plus")?.name ?? "Pizza Lunch+",
      english: "Pranzo",
      tag: "11:00–14:00 only",
      tagIt: "soltanto",
      price: { kind: "money", now: pizzaLunch.now, was: pizzaLunch.was },
      desc: (
        <>
          Pizza + drink + a premium <em>dolce</em> at a flat price. For those
          who eat standing up — but eat well.
        </>
      ),
      icon: <SundialIcon />,
    },
    {
      variant: "night",
      italian: findBundle("late-slice")?.name ?? "Late-Night Slice",
      english: "Spicchio Notturno",
      tag: "after 21:00",
      tagIt: "dopo le 21:00",
      price: { kind: "money", now: lateSlice.now, was: lateSlice.was },
      desc: (
        <>
          A slice reheated in 60 seconds in the wood-fired oven + a drink. For
          those who come home late.
        </>
      ),
      icon: <MoonIcon />,
    },
    {
      variant: "classic",
      italian: italianClassic?.name ?? "Italian Classic",
      english: "Il Classico",
      tag: "automatic",
      tagIt: "automatico",
      price: { kind: "savings", label: `−${classicDiscount}%` },
      desc: (
        <>
          Activates automatically when you have a <em>Margherita</em>, a{" "}
          <em>Limonata</em> and a <em>Tiramisù</em> in your cart.
        </>
      ),
      icon: <SparkleIcon />,
    },
  ];
}

export function BundlesShowcase() {
  const primary = getActiveLocations()[0]?.slug ?? "krakow";
  const bundles = buildShowcase();

  return (
    <section id="bundles" className="v8-ps v8-bundles-section">
      <div className="v8-page-inner v8-bundles-page-inner">
        <div className="v8-ps-head">
          <div className="v8-ps-eyebrow">
            <span>Today&apos;s bundles</span>{" "}
            <span className="bi-sec">· menù del giorno</span>
          </div>
          <h2 className="v8-ps-title">
            Pick a bundle. <span className="it">Skip the maths.</span>
          </h2>
          <p className="v8-ps-sub">
            Four ways to dine well — <em>Famiglia</em> for friends,{" "}
            <em>Pranzo</em> for the noon rush, <em>Spicchio</em> for the
            late-night crew, <em>Il Classico</em> if you&apos;re building dinner
            the proper way.
          </p>
        </div>

        <div className="v8-bundles">
          {bundles.map((b) => (
            <article key={b.english} className={`v8-bundle v8-bundle-${b.variant}`}>
              <div className="v8-bundle-icon" aria-hidden>{b.icon}</div>
              <span className="v8-bundle-tag">
                <span>{b.tag}</span> <span className="bi-sec">· {b.tagIt}</span>
              </span>
              <h3 className="v8-bundle-name">
                <span>{b.italian}</span>
                <span className="en bi-sec">{b.english}</span>
              </h3>
              <div className="v8-bundle-price">
                {b.price.kind === "money" ? (
                  <>
                    <span className="now num">{b.price.now}</span>
                    {b.price.was && <span className="was num">{b.price.was}</span>}
                  </>
                ) : (
                  <span className="savings">{b.price.label}</span>
                )}
              </div>
              <p className="v8-bundle-desc">{b.desc}</p>
            </article>
          ))}
        </div>

        <p className="v8-bundle-foot-note">
          Bundles activate automatically in your cart when eligible.
        </p>
        <div className="v8-bundle-cta-wrap">
          <Link href={`/locations/${primary}`} className="v8-hero-cta">
            <span>Order now</span>
            <span className="bi-sec it">· inizia un ordine</span>
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

// Bundle icons — inline SVGs straight from V8. Each uses
// `stroke="currentColor"` so the icon picks up the per-variant accent
// colour (CSS sets `.v8-bundle-icon { color: var(--v8-bundle-accent) }`).

function FamilyIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="9" cy="11" r="3" stroke="currentColor" strokeWidth="1.6" fill="rgba(255,255,255,0.4)" />
      <circle cx="16" cy="9" r="3.4" stroke="currentColor" strokeWidth="1.6" fill="rgba(255,255,255,0.4)" />
      <circle cx="23" cy="11" r="3" stroke="currentColor" strokeWidth="1.6" fill="rgba(255,255,255,0.4)" />
      <path d="M3 26 C 3 21, 6 18, 9 18 C 11 18, 13 19, 14 21" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path d="M8 26 C 8 20, 12 17, 16 17 C 20 17, 24 20, 24 26" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path d="M18 21 C 19 19, 21 18, 23 18 C 26 18, 29 21, 29 26" stroke="currentColor" strokeWidth="1.6" fill="none" />
    </svg>
  );
}

function SundialIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="1.6" fill="rgba(255,255,255,0.4)" />
      <path d="M16 5 L16 7 M16 25 L16 27 M5 16 L7 16 M25 16 L27 16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M16 16 L16 9 M16 16 L21 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="16" cy="16" r="1.4" fill="currentColor" />
      <path d="M9 23 C 12 25, 20 25, 23 23" stroke="currentColor" strokeWidth="1.4" fill="none" opacity="0.5" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path d="M21 6 A 11 11 0 1 0 21 26 A 8 8 0 0 1 21 6 Z" stroke="currentColor" strokeWidth="1.6" fill="rgba(255,255,255,0.4)" />
      <circle cx="9" cy="11" r="0.8" fill="currentColor" />
      <circle cx="13" cy="20" r="0.8" fill="currentColor" />
      <circle cx="6" cy="17" r="0.6" fill="currentColor" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path d="M16 3 L18 13 L28 16 L18 19 L16 29 L14 19 L4 16 L14 13 Z" stroke="currentColor" strokeWidth="1.6" fill="rgba(255,255,255,0.4)" strokeLinejoin="round" />
      <path d="M25 5 L26 8 L29 9 L26 10 L25 13 L24 10 L21 9 L24 8 Z" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.3" strokeLinejoin="round" />
    </svg>
  );
}
