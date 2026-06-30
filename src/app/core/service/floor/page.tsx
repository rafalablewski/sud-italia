import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { getActiveLocationsAsync } from "@/lib/locations-store";
import { getMenuWithOverrides } from "@/data/menus";
import { getUpsellSettings } from "@/lib/store";
import { CoreFloor } from "@/core/service/CoreFloor";
import type { MenuItem } from "@/data/types";
import type { UpsellConfig } from "@/lib/upsell";

export default async function CoreFloorPage() {
  if (!(await isAuthenticated())) redirect("/login");
  // The Floor is Core's home: tapping a table opens its check as a panel over
  // the floor (the embedded CorePos). That panel needs the same server-resolved
  // menu + cross-sell config the standalone till gets, so resolve it here and
  // hand it down — the till never sees a price the server didn't set.
  const [locations, upsell] = await Promise.all([getActiveLocationsAsync(), getUpsellSettings()]);
  const menusByLocation: Record<string, MenuItem[]> = {};
  const upsellByLocation: Record<string, UpsellConfig | null> = {};
  await Promise.all(
    locations.map(async (l) => {
      menusByLocation[l.slug] = await getMenuWithOverrides(l.slug);
      upsellByLocation[l.slug] = (upsell[l.slug] as UpsellConfig | undefined) ?? null;
    }),
  );
  return <CoreFloor menusByLocation={menusByLocation} upsellByLocation={upsellByLocation} />;
}
