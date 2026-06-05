import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { CONCIERGE_CAPABILITY_IDS, getConciergeSettings } from "@/lib/store";
import {
  CAPABILITY_META,
  CAPABILITY_ORDER,
  buildAllergenMatrix,
  buildCapabilityResponse,
} from "@/lib/concierge/capabilities";
import { AdminConcierge } from "@/components/admin/AdminConcierge";

/**
 * Guest Engagement · Concierge — the AI capability layer + EU-14 allergen
 * matrix. One view of the unified Guest hub; see
 * docs/design-system/core/modules/guest.md.
 */
export default async function GuestConciergePage() {
  if (!(await isAuthenticated())) redirect("/login");

  const slugs = ["krakow", "warszawa"] as const;

  // Fan the per-location capability samples + allergen matrices out
  // concurrently rather than awaiting them in a nested waterfall.
  const [settings, locationEntries] = await Promise.all([
    getConciergeSettings(),
    Promise.all(
      slugs.map(async (slug) => {
        const [sampleEntries, matrix] = await Promise.all([
          Promise.all(
            CONCIERGE_CAPABILITY_IDS.map(
              async (id) =>
                [id, await buildCapabilityResponse(id, slug, { sample: true })] as const,
            ),
          ),
          buildAllergenMatrix(slug),
        ]);
        return [slug, { samples: Object.fromEntries(sampleEntries), matrix }] as const;
      }),
    ),
  ]);

  const byLocation: Record<
    string,
    { samples: Record<string, unknown>; matrix: Awaited<ReturnType<typeof buildAllergenMatrix>> }
  > = Object.fromEntries(locationEntries);

  const waConfigured = !!(
    process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() && process.env.WHATSAPP_ACCESS_TOKEN?.trim()
  );

  return (
    <AdminConcierge
      meta={CAPABILITY_ORDER.map((id) => CAPABILITY_META[id])}
      settings={settings}
      byLocation={byLocation}
      waConfigured={waConfigured}
    />
  );
}
