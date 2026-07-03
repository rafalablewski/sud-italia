import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { getActiveLocationsAsync } from "@/lib/locations-store";
import { getMenuWithOverrides } from "@/data/menus";
import { getUpsellSettings } from "@/lib/store";
import { CoreBook } from "@/core/service/CoreBook";
import type { MenuItem } from "@/data/types";
import type { UpsellConfig } from "@/lib/upsell";

/**
 * The Book view (`/core/service/book`) — slots & reservations, a Service view
 * alongside Floor / Slots / Dispatch (see `serviceTabs`). Its Floor lens opens a
 * table's check as an embedded CorePos drawer, so — like the standalone Floor —
 * we resolve the same server-set menu + cross-sell config here and hand it down
 * (the till never sees a price the server didn't set).
 */
export default async function CoreServiceBookPage() {
  if (!(await isAuthenticated())) redirect("/login");
  const [locations, upsell] = await Promise.all([getActiveLocationsAsync(), getUpsellSettings()]);
  const menusByLocation: Record<string, MenuItem[]> = {};
  const upsellByLocation: Record<string, UpsellConfig | null> = {};
  await Promise.all(
    locations.map(async (l) => {
      menusByLocation[l.slug] = await getMenuWithOverrides(l.slug);
      upsellByLocation[l.slug] = (upsell[l.slug] as UpsellConfig | undefined) ?? null;
    }),
  );
  return <CoreBook menusByLocation={menusByLocation} upsellByLocation={upsellByLocation} />;
}
