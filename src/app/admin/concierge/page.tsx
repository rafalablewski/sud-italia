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

export default async function AdminConciergePage() {
  if (!(await isAuthenticated())) redirect("/admin/login");

  const settings = await getConciergeSettings();
  const slugs = ["krakow", "warszawa"] as const;

  const byLocation: Record<
    string,
    { samples: Record<string, unknown>; matrix: Awaited<ReturnType<typeof buildAllergenMatrix>> }
  > = {};
  for (const slug of slugs) {
    const samples: Record<string, unknown> = {};
    for (const id of CONCIERGE_CAPABILITY_IDS) {
      samples[id] = await buildCapabilityResponse(id, slug, { sample: true });
    }
    byLocation[slug] = { samples, matrix: await buildAllergenMatrix(slug) };
  }

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
