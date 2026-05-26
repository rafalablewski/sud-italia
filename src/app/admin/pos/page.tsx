import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { getActiveLocationsAsync } from "@/lib/locations-store";
import { getMenuWithOverrides } from "@/data/menus";
import { getUpsellSettings } from "@/lib/store";
import { AdminPos } from "@/components/admin/AdminPos";
import type { MenuItem } from "@/data/types";
import type { UpsellConfig } from "@/lib/upsell";

export default async function AdminPosPage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }
  // Menu + combo config are per-location and rarely change — pass each active
  // truck's snapshot to the client so the POS can switch locations without a
  // round-trip. Prices / availability / discounts are the server's, never
  // client-supplied (the till only ever sends item ids + quantities back).
  const [locations, upsell] = await Promise.all([
    getActiveLocationsAsync(),
    getUpsellSettings(),
  ]);
  const menusByLocation: Record<string, MenuItem[]> = {};
  const upsellByLocation: Record<string, UpsellConfig | null> = {};
  await Promise.all(
    locations.map(async (l) => {
      menusByLocation[l.slug] = await getMenuWithOverrides(l.slug);
      upsellByLocation[l.slug] = (upsell[l.slug] as UpsellConfig | undefined) ?? null;
    }),
  );
  return <AdminPos menusByLocation={menusByLocation} upsellByLocation={upsellByLocation} />;
}
