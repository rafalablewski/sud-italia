import Link from "next/link";
import { Users, Clock, Moon, Sparkles, type LucideIcon } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { getActiveLocations } from "@/data/locations";
import { DEFAULT_BUNDLES, isDynamicBundle, type BundleTier } from "@/lib/bundles";
import { DEFAULT_COMBO_DEALS } from "@/lib/upsell";
import { formatPrice } from "@/lib/utils";

/**
 * Homepage bundle showcase (audit §3 — answers "what's the deal?" before
 * the customer opens a location menu).
 *
 * Numbers + names come from the canonical `DEFAULT_BUNDLES` (lib/bundles)
 * and `DEFAULT_COMBO_DEALS` (lib/upsell) so the homepage stays in sync with
 * the seed config. Marketing copy stays local to this component — there's
 * no per-bundle "homepage subtitle" field in the bundle schema, and adding
 * one to the runtime schema just to feed the landing page would bloat
 * every admin save round-trip.
 *
 * Per-location admin overrides (LocationUpsellConfig.bundles) do NOT
 * reflect here — the homepage is location-agnostic. The cart drawer's
 * bundle ladder shows the actual location-specific pricing once the
 * customer picks a truck. Operators who retune a bundle dramatically
 * different from the seed should expect a homepage-vs-cart mismatch
 * during the experiment; rolling the seed forward fixes it.
 */
interface ShowcaseCard {
  icon: LucideIcon;
  tag: string;
  title: string;
  /** Pre-formatted price string ("99 zł" / "Save 10%"). Computed below. */
  price: string;
  /** Pre-formatted strikethrough ("103.60 zł") or null. */
  strike: string | null;
  copy: string;
  tone: "red" | "gold" | "dark" | "green";
}

function findBundleById(id: string): BundleTier | undefined {
  return DEFAULT_BUNDLES.find((b) => b.id === id);
}

function priceFromBundle(id: string): {
  price: string;
  strike: string | null;
} {
  const b = findBundleById(id);
  if (!b || isDynamicBundle(b)) {
    // Dynamic bundles don't have a stored price (computed against cart).
    // The showcase only references fixed bundles for now, but if that
    // changes the fallback shows a generic "From X zł" using minMains × a
    // proxy Margherita price — keeps the card legible until the cart pins
    // an actual number.
    return { price: "See cart", strike: null };
  }
  return {
    price: formatPrice(b.priceGrosze),
    strike:
      b.refPriceGrosze > b.priceGrosze ? formatPrice(b.refPriceGrosze) : null,
  };
}

function buildShowcase(): ShowcaseCard[] {
  const family = priceFromBundle("family-pizza-pack");
  const pizzaLunch = priceFromBundle("lunch-pizza-plus");
  const lateSlice = priceFromBundle("late-slice");
  const italianClassic = DEFAULT_COMBO_DEALS.find((c) => c.id === "italian-classic");
  const classicDiscount = italianClassic?.discountPercent ?? 10;

  return [
    {
      icon: Users,
      tag: "Family Pack",
      title: findBundleById("family-pizza-pack")?.name ?? "3 pizzas + 1L drink",
      price: family.price,
      strike: family.strike,
      copy: "Three Margheritas + a 1L Limonata. Set price, no maths. Couple of friends — sorted.",
      tone: "red",
    },
    {
      icon: Clock,
      tag: findBundleById("lunch-pizza-plus")?.tier ?? "Pizza Lunch+",
      title: findBundleById("lunch-pizza-plus")?.name ?? "Pizza + drink + Tiramisù",
      price: pizzaLunch.price,
      strike: pizzaLunch.strike,
      copy: "11:00–14:00 only. Pizza + drink + premium dessert at a flat lunch price.",
      tone: "gold",
    },
    {
      icon: Moon,
      tag: "Late-Night Slice",
      title: findBundleById("late-slice")?.name ?? "Slice + drink",
      price: lateSlice.price,
      strike: lateSlice.strike,
      copy: "After 21:00 only. One slice reheated to order in 60 seconds + any drink.",
      tone: "dark",
    },
    {
      icon: Sparkles,
      tag: italianClassic?.name ?? "Italian Classic",
      title: italianClassic?.description ?? "Margherita + Limonata + Tiramisù",
      price: `Save ${classicDiscount}%`,
      strike: null,
      copy: "Auto-applies at checkout when all three are in your cart. Combine pizza, drink, dessert — instant discount.",
      tone: "green",
    },
  ];
}

export function BundlesShowcase() {
  const locations = getActiveLocations();
  const primaryLocation = locations[0]?.slug ?? "krakow";
  const bundles = buildShowcase();

  const toneClasses = (
    tone: ShowcaseCard["tone"],
  ): { card: string; tag: string; price: string } => {
    if (tone === "red") {
      return {
        card: "border-italia-red/30 bg-gradient-to-br from-italia-red/5 to-italia-red/10",
        tag: "bg-italia-red text-white",
        price: "text-italia-red",
      };
    }
    if (tone === "gold") {
      return {
        card: "border-italia-gold/40 bg-gradient-to-br from-italia-gold/5 to-italia-gold/10",
        tag: "bg-italia-gold-dark text-white",
        price: "text-italia-gold-dark",
      };
    }
    if (tone === "dark") {
      return {
        card: "border-italia-dark/40 bg-italia-dark text-italia-cream",
        tag: "bg-italia-cream text-italia-dark",
        price: "text-italia-gold",
      };
    }
    return {
      card: "border-italia-green/30 bg-gradient-to-br from-italia-green/5 to-italia-green/10",
      tag: "bg-italia-green-dark text-white",
      price: "text-italia-green-dark",
    };
  };

  return (
    <section id="bundles" className="py-16 md:py-24 bg-italia-cream/40">
      <Container>
        <div className="text-center mb-12 md:mb-14">
          <p className="text-italia-red font-medium text-sm tracking-[0.15em] uppercase mb-3">
            Set-price bundles
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-bold text-italia-dark leading-tight mb-4">
            Pick a bundle. Skip the maths.
          </h2>
          <p className="text-italia-gray text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Four ways to eat for less. Family Pack for friends, Pizza Lunch+ for
            the noon rush, Slice for the late-night crew, Italian Classic if
            you&rsquo;re building dinner the right way.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {bundles.map((b) => {
            const tones = toneClasses(b.tone);
            const isDark = b.tone === "dark";
            return (
              <div
                key={b.tag}
                className={`relative rounded-2xl border-2 p-6 transition-all hover:shadow-md hover:-translate-y-0.5 ${tones.card}`}
              >
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${tones.tag} mb-4`}
                >
                  {b.tag}
                </span>
                <div className="w-10 h-10 rounded-lg bg-white/40 flex items-center justify-center mb-3">
                  <b.icon className={`h-5 w-5 ${isDark ? "text-italia-cream" : "text-italia-dark"}`} />
                </div>
                <h3
                  className={`font-heading font-bold text-lg leading-tight mb-2 ${
                    isDark ? "text-italia-cream" : "text-italia-dark"
                  }`}
                >
                  {b.title}
                </h3>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className={`text-2xl font-bold ${tones.price}`}>{b.price}</span>
                  {b.strike && (
                    <span
                      className={`text-sm line-through ${
                        isDark ? "text-italia-cream/60" : "text-italia-gray"
                      }`}
                    >
                      {b.strike}
                    </span>
                  )}
                </div>
                <p
                  className={`text-sm leading-snug ${
                    isDark ? "text-italia-cream/80" : "text-italia-gray"
                  }`}
                >
                  {b.copy}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-10 md:mt-12 text-center">
          <Link
            href={`/locations/${primaryLocation}`}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-italia-red text-white font-semibold hover:bg-italia-red-dark transition-colors"
          >
            Order now
            <span aria-hidden>→</span>
          </Link>
          <p className="text-xs text-italia-gray mt-3">
            Bundles surface automatically in your cart when eligible — lunch by
            local hour, family by quantity, late-night after 21:00.
          </p>
        </div>
      </Container>
    </section>
  );
}
