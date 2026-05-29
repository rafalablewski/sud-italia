import { notFound } from "next/navigation";
import { Metadata } from "next";
import { locations, getLocation } from "@/data/locations";
import { getMenuWithOverrides } from "@/data/menus";
import { LocationHero } from "@/components/location/LocationHero";
import { MenuSection } from "@/components/location/MenuSection";
import { LocationInfo } from "@/components/location/LocationInfo";
import { MenuItemsRegistrar } from "@/components/cart/MenuItemsRegistrar";
import { LoyaltySection } from "@/components/location/LoyaltySection";
import { LayoutGate } from "@/components/layout/LayoutGate";
import { ComplianceBanner } from "@/components/location/ComplianceBanner";
import { SITE_NAME } from "@/lib/constants";
import { getSettings, resolveLocationCompliance } from "@/lib/store";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return locations
    .filter((l) => l.isActive)
    .map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const location = getLocation(slug);
  if (!location) return {};

  return {
    title: `${location.name} | ${SITE_NAME}`,
    description: location.shortDescription,
    openGraph: {
      type: "website",
      locale: "pl_PL",
      siteName: SITE_NAME,
      title: `${location.name} — Order Neapolitan Pizza`,
      description: location.shortDescription,
    },
    twitter: {
      card: "summary_large_image",
      title: `${location.name} | ${SITE_NAME}`,
      description: location.shortDescription,
    },
  };
}

export default async function LocationPage({ params }: PageProps) {
  const { slug } = await params;
  const location = getLocation(slug);

  if (!location || !location.isActive) {
    notFound();
  }

  // We pass the full menu (incl. currently-unavailable items) so the client
  // can flip availability live when admin 86's an item without a full reload.
  // The structured-data block + cart fallbacks still respect availability.
  const fullMenu = await getMenuWithOverrides(slug);
  const menuItems = fullMenu.filter((i) => i.available);
  const initialAvailability: Record<string, boolean> = {};
  for (const item of fullMenu) initialAvailability[item.id] = item.available;

  // Audit §11.1 — per-location regulatory disclosures. Loaded server-side
  // so SSR + client hydration agree (no fetch flicker before the DOH
  // grade / halal banner appears).
  const appSettings = await getSettings();
  const compliance = resolveLocationCompliance(appSettings.compliance, slug);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FoodEstablishment",
    name: location.name,
    description: location.description,
    address: {
      "@type": "PostalAddress",
      streetAddress: location.address,
      addressLocality: location.city,
      addressCountry: "PL",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: location.coordinates.lat,
      longitude: location.coordinates.lng,
    },
    servesCuisine: "Neapolitan Pizza",
    priceRange: "$$",
    hasMenu: {
      "@type": "Menu",
      hasMenuSection: [...new Set(menuItems.map((i) => i.category))].map((cat) => ({
        "@type": "MenuSection",
        name: cat.charAt(0).toUpperCase() + cat.slice(1),
        hasMenuItem: menuItems
          .filter((i) => i.category === cat)
          .slice(0, 5)
          .map((i) => ({
            "@type": "MenuItem",
            name: i.name,
            description: i.description,
            offers: {
              "@type": "Offer",
              price: (i.price / 100).toFixed(2),
              priceCurrency: "PLN",
            },
          })),
      })),
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LocationHero location={location} />
      <ComplianceBanner compliance={compliance} />
      {/* <LiveActivityBar /> intentionally NOT rendered here right now —
       *  Step 8's V8 port introduced the global <LiveTicker /> in the
       *  storefront chrome (under the nav, chain-wide stats), and
       *  rendering the per-location LiveActivityBar directly under
       *  the hero left two stacked espresso ticker bands on the
       *  location page. V8's mockup folds the per-location strip
       *  INSIDE the menu's loc-card-soft wrapper as a `.live-act`
       *  row — Step 9 (menu chrome port) will re-mount it there.
       *  Operator config (admin Growth → Live widgets) keeps writing
       *  the location's widget list; nothing on this page just reads
       *  it until Step 9 lands. */}
      <MenuSection
        items={fullMenu}
        locationSlug={slug}
        initialAvailability={initialAvailability}
        compliance={compliance}
      />
      <LocationInfo location={location} />
      {/* Soci rail closes the location page the same way it closes
       *  the homepage — see (public)/page.tsx for the rationale.
       *  After Step 7's V8 port, LoyaltySection is a dark espresso
       *  closing block; rendering it BEFORE the menu (the old
       *  pre-V8 placement) put a dark slab mid-page above light
       *  content. The order here matches V8's location-page
       *  composition: hero → menu → info → Soci → footer.
       */}
      <LayoutGate flag="showLoyaltySection">
        <LoyaltySection />
      </LayoutGate>
      {/* Seed the live, override-aware menu into useCartUIStore so the
          layout-level <CartDrawer />'s cross-sell + bundle ladder +
          tier perk + <AddToCartToast />'s seed copy read the same data
          the menu chrome above renders. FloatingCartButton + AddToCartToast
          themselves live at the layout level (Step 12) and read from
          useCartUIStore. */}
      <MenuItemsRegistrar menuItems={menuItems} />
    </>
  );
}
