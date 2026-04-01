import { getMenuWithOverrides } from "@/data/menus";
import { getCartPresenceForLocation } from "@/lib/store";
import type { KitchenCartPresenceEntry } from "@/lib/kitchen-cart-presence-payload";

export type { KitchenCartPresenceEntry } from "@/lib/kitchen-cart-presence-payload";
export type {
  KitchenCartPresenceItem,
  KitchenCartPresencePayload,
} from "@/lib/kitchen-cart-presence-payload";

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
