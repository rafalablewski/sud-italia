import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { getActiveLocationsAsync } from "@/lib/locations-store";
import { getMenuWithOverrides } from "@/data/menus";
import { AdminPos } from "@/components/admin/AdminPos";
import type { MenuItem } from "@/data/types";

export default async function AdminPosPage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }
  // Menu is per-location and rarely changes — pass each active truck's menu to
  // the client so the POS can switch locations without a round-trip. Prices /
  // availability are the server's, never client-supplied.
  const locations = await getActiveLocationsAsync();
  const menusByLocation: Record<string, MenuItem[]> = {};
  await Promise.all(
    locations.map(async (l) => {
      menusByLocation[l.slug] = await getMenuWithOverrides(l.slug);
    }),
  );
  return <AdminPos menusByLocation={menusByLocation} />;
}
