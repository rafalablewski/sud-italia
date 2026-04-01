import { getMenuWithOverrides } from "@/data/menus";
import { getCartPresenceForLocation } from "@/lib/store";

export type KitchenCartPresenceItem = {
  id: string;
  quantity: number;
  name: string;
};

export type KitchenCartPresenceEntry = {
  visitorId: string;
  items: KitchenCartPresenceItem[];
  totalCents: number;
  lastSeenAt: number;
};

export async function getKitchenCartPresenceEntries(
  locationSlug: string
): Promise<KitchenCartPresenceEntry[]> {
  const rows = await getCartPresenceForLocation(locationSlug);
  const menu = await getMenuWithOverrides(locationSlug);
  const byId = new Map(menu.map((m) => [m.id, m.name]));

  return rows.map((r) => ({
    visitorId: r.visitorId,
    totalCents: r.totalCents,
    lastSeenAt: r.lastSeenAt,
    items: r.items.map((i) => ({
      id: i.id,
      quantity: i.quantity,
      name: byId.get(i.id) ?? i.id,
    })),
  }));
}
