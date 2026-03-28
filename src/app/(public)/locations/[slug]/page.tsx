import { notFound } from "next/navigation";
import { Metadata } from "next";
import { locations, getLocation } from "@/data/locations";
import { getAvailableMenu } from "@/data/menus";
import { LocationHero } from "@/components/location/LocationHero";
import { MenuSection } from "@/components/location/MenuSection";
import { LocationInfo } from "@/components/location/LocationInfo";
import { FloatingCartButton } from "@/components/cart/FloatingCartButton";
import { LoyaltySection } from "@/components/location/LoyaltySection";
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

  return (
    <>
      <LocationHero location={location} />
      <LoyaltySection />
      <MenuSection items={menuItems} locationSlug={slug} />
      <LocationInfo location={location} />
      <FloatingCartButton allMenuItems={menuItems} />
    </>
  );
}
