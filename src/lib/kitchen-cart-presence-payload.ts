/**
 * Client-safe types + parser for kitchen cart presence API / SSE (no server store imports).
 */

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

export type KitchenCartPresencePayload = {
  enabled: boolean;
  carts: KitchenCartPresenceEntry[];
};

/** Parse API or SSE JSON; supports legacy bare array responses. */
export function parseKitchenCartPresencePayload(raw: unknown): KitchenCartPresencePayload | null {
  if (Array.isArray(raw)) {
    return { enabled: true, carts: raw as KitchenCartPresenceEntry[] };
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.enabled !== "boolean" || !Array.isArray(o.carts)) return null;
  return { enabled: o.enabled, carts: o.carts as KitchenCartPresenceEntry[] };
}
