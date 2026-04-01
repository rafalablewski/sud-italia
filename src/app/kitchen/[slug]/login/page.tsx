import { notFound } from "next/navigation";
import { getLocation } from "@/data/locations";
import { KitchenLoginForm } from "@/components/kitchen/KitchenLoginForm";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function KitchenLoginPage({ params }: PageProps) {
  const { slug } = await params;
  const location = getLocation(slug);
  if (!location?.isActive) {
    notFound();
  }

  return <KitchenLoginForm slug={slug} locationName={location.name} />;
}
