import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { getActiveLocationsAsync } from "@/lib/locations-store";
import { getMenuWithOverrides } from "@/data/menus";
import { CoreV2Pos } from "@/core-v2/pos/CoreV2Pos";
import type { MenuItem } from "@/data/types";

export default async function CoreV2PosPage() {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }
  // Per-location menu snapshots, server-resolved (prices/availability are the
  // server's — the till only ever sends item ids + quantities back).
  const locations = await getActiveLocationsAsync();
  const menusByLocation: Record<string, MenuItem[]> = {};
  await Promise.all(
    locations.map(async (l) => {
      menusByLocation[l.slug] = await getMenuWithOverrides(l.slug);
    }),
  );
  return <CoreV2Pos menusByLocation={menusByLocation} />;
}
