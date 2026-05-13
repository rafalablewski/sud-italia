import { notFound, redirect } from "next/navigation";
import { getLocation } from "@/data/locations";
import { getKitchenSession } from "@/lib/kitchen-auth";
import { ExpoBoard } from "@/components/kitchen/ExpoBoard";

type PageProps = {
  params: Promise<{ slug: string }>;
};

/**
 * Expo screen (m2_6). Consolidated view of all KDS tickets at the
 * location, grouped by order so the pass-through cook sees "Order 1234:
 * pizza ticket ready, fryer ticket still firing" at a glance. Bump
 * action here flips the parent order to ready → customer SMS via the
 * outbox.
 */
export default async function KitchenExpoPage({ params }: PageProps) {
  const { slug } = await params;
  const location = getLocation(slug);
  if (!location?.isActive) {
    notFound();
  }

  const session = await getKitchenSession();
  if (!session || session.slug !== slug) {
    redirect(`/kitchen/${slug}/login`);
  }

  return <ExpoBoard locationName={location.name} slug={slug} />;
}
