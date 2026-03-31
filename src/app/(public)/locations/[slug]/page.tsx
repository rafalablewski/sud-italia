import { notFound } from "next/navigation";
import { Metadata } from "next";
import { locations, getLocation } from "@/data/locations";
import { getAvailableMenu } from "@/data/menus";
import { LocationHero } from "@/components/location/LocationHero";
import { MenuSection } from "@/components/location/MenuSection";
import { LocationInfo } from "@/components/location/LocationInfo";
import { FloatingCartButton } from "@/components/cart/FloatingCartButton";
import { LoyaltySection } from "@/components/location/LoyaltySection";
import { LiveActivityBar } from "@/components/location/LiveActivityBar";
import { SITE_NAME } from "@/lib/constants";

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
  };
}

export default async function LocationPage({ params }: PageProps) {
  const { slug } = await params;
  const location = getLocation(slug);

  if (!location || !location.isActive) {
    notFound();
  }

  const menuItems = await getAvailableMenu(slug);

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
      <LiveActivityBar locationSlug={slug} />
      <LoyaltySection />
      <MenuSection items={menuItems} locationSlug={slug} />
      <LocationInfo location={location} />
      <FloatingCartButton allMenuItems={menuItems} />
    </>
  );
}
