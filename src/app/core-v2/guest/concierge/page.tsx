import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { CONCIERGE_CAPABILITY_IDS, getConciergeSettings } from "@/lib/store";
import { CAPABILITY_META, CAPABILITY_ORDER, buildAllergenMatrix, buildCapabilityResponse } from "@/lib/concierge/capabilities";
import { CoreV2Concierge } from "@/core-v2/guest/CoreV2Concierge";

export default async function CoreV2ConciergePage() {
  if (!(await isAuthenticated())) redirect("/login");
  const slugs = ["krakow", "warszawa"] as const;
  const [settings, locationEntries] = await Promise.all([
    getConciergeSettings(),
    Promise.all(
      slugs.map(async (slug) => {
        const [sampleEntries, matrix] = await Promise.all([
          Promise.all(CONCIERGE_CAPABILITY_IDS.map(async (id) => [id, await buildCapabilityResponse(id, slug, { sample: true })] as const)),
          buildAllergenMatrix(slug),
        ]);
        return [slug, { samples: Object.fromEntries(sampleEntries), matrix }] as const;
      }),
    ),
  ]);
  const byLocation = Object.fromEntries(locationEntries);
  return <CoreV2Concierge meta={CAPABILITY_ORDER.map((id) => CAPABILITY_META[id])} settings={settings} byLocation={byLocation} />;
}
