import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { CONCIERGE_CAPABILITY_IDS, getConciergeSettings } from "@/lib/store";
import {
  CAPABILITY_META,
  CAPABILITY_ORDER,
  buildAllergenMatrix,
  buildCapabilityResponse,
} from "@/lib/concierge/capabilities";
import { AdminWhatsApp } from "@/components/admin/AdminWhatsApp";
import { AdminCrm } from "@/components/admin/AdminCrm";
import { AdminConcierge } from "@/components/admin/AdminConcierge";
import { AdminLoyalty } from "@/components/admin/AdminLoyalty";
import type { GuestView } from "@/components/admin/guest/GuestViewNav";

/**
 * Unified Guest Engagement hub — one surface for the relationship layer.
 * `?view=` selects the module:
 *   - inbox      → WhatsApp inbox (live conversations + order context + funnel)
 *   - guests     → CRM customer book
 *   - loyalty    → loyalty roster + family wallets + redemptions
 *   - concierge  → AI capability layer + EU-14 allergen matrix
 *
 * The legacy /admin/whatsapp, /admin/crm, /admin/loyalty and /admin/concierge
 * routes redirect here so the modules read as one system (see
 * docs/design-system/core/modules/guest.md).
 */
export default async function AdminGuestPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  if (!(await isAuthenticated())) redirect("/login");

  const { view } = await searchParams;
  // searchParams values can be string | string[] (e.g. ?view=a&view=b) —
  // take the first so a duplicated param doesn't silently fall back to inbox.
  const viewStr = Array.isArray(view) ? view[0] : view;
  const v: GuestView =
    viewStr === "guests"
      ? "guests"
      : viewStr === "loyalty"
        ? "loyalty"
        : viewStr === "concierge"
          ? "concierge"
          : "inbox";

  if (v === "guests") return <AdminCrm />;

  if (v === "loyalty") return <AdminLoyalty />;

  if (v === "concierge") {
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

  return <AdminWhatsApp />;
}
