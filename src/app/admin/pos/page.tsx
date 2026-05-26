import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { getActiveLocationsAsync } from "@/lib/locations-store";
import { getMenuWithOverrides } from "@/data/menus";
import { getUpsellSettings } from "@/lib/store";
import { AdminPos } from "@/components/admin/AdminPos";
import type { UpsellConfig } from "@/lib/upsell";
import type { MenuItem } from "@/data/types";

export default async function AdminPosPage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }
  // Menu + upsell config are per-location and rarely change — pass each active
  // truck's menu and combo/cross-sell config to the client so the POS can price
  // checks (combo discounts) and surface order-aware offers without a round-trip
  // per item. Prices / availability are the server's, never client-supplied.
  const [locations, upsellSettings] = await Promise.all([
    getActiveLocationsAsync(),
    getUpsellSettings(),
  ]);
  const menusByLocation: Record<string, MenuItem[]> = {};
  const upsellByLocation: Record<string, UpsellConfig | null> = {};
  await Promise.all(
    locations.map(async (l) => {
      menusByLocation[l.slug] = await getMenuWithOverrides(l.slug);
      upsellByLocation[l.slug] = (upsellSettings[l.slug] ?? null) as UpsellConfig | null;
    }),
  );
  return <AdminPos menusByLocation={menusByLocation} upsellByLocation={upsellByLocation} />;
}
