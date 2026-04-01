import { notFound, redirect } from "next/navigation";
import { getLocation } from "@/data/locations";
import { getKitchenSession } from "@/lib/kitchen-auth";
import { KitchenOrderBoard } from "@/components/kitchen/KitchenOrderBoard";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function KitchenDashboardPage({ params }: PageProps) {
  const { slug } = await params;
  const location = getLocation(slug);
  if (!location?.isActive) {
    notFound();
  }

  const session = await getKitchenSession();
  if (!session || session.slug !== slug) {
    redirect(`/kitchen/${slug}/login`);
  }

  return <KitchenOrderBoard locationName={location.name} slug={slug} />;
}
