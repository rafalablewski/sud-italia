import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { getActiveLocationsAsync } from "@/lib/locations-store";
import { getMenuWithOverrides } from "@/data/menus";
import { getUpsellSettings } from "@/lib/store";
import { CorePos } from "@/core/pos/CorePos";
import type { MenuItem } from "@/data/types";
import type { UpsellConfig } from "@/lib/upsell";

export default async function CorePosPage() {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }
  // Per-location menu + combo/cross-sell config, server-resolved (prices,
  // availability and discounts are the server's — the till only ever sends
  // item ids + quantities back).
  const [locations, upsell] = await Promise.all([getActiveLocationsAsync(), getUpsellSettings()]);
  const menusByLocation: Record<string, MenuItem[]> = {};
  const upsellByLocation: Record<string, UpsellConfig | null> = {};
  await Promise.all(
    locations.map(async (l) => {
      menusByLocation[l.slug] = await getMenuWithOverrides(l.slug);
      upsellByLocation[l.slug] = (upsell[l.slug] as UpsellConfig | undefined) ?? null;
    }),
  );
  return <CorePos menusByLocation={menusByLocation} upsellByLocation={upsellByLocation} />;
}
