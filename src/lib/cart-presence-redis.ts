import type { Redis } from "@upstash/redis";

const CART_PRESENCE_TTL_MS = 3 * 60 * 1000;

type Line = { id: string; quantity: number };

export type CartPresenceRowRedis = {
  visitorId: string;
  items: Line[];
  totalCents: number;
  lastSeenAt: number;
};
/** Must stay ≤ debounced client post interval (see CartPresenceSync) to avoid 429 drops. */
const RATE_EX_SEC = 2;

function hashKey(slug: string): string {
  return `cart_presence:${slug}`;
}

function rateKey(visitorId: string): string {
  return `cart_presence_rate:${visitorId}`;
}

/** Upstash hgetall auto-JSON-parses string fields; values arrive as objects, not strings. */
function parsePresenceHashValue(raw: unknown): {
  items: Line[];
  totalCents: number;
  updatedAt: number;
} | null {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.items) || typeof o.totalCents !== "number" || typeof o.updatedAt !== "number") {
    return null;
  }
  return {
    items: o.items as Line[],
    totalCents: o.totalCents,
    updatedAt: o.updatedAt,
  };
}

export async function getCartPresenceForLocationRedis(
  redis: Redis,
  locationSlug: string
): Promise<CartPresenceRowRedis[]> {
  const key = hashKey(locationSlug);
  const h = await redis.hgetall<Record<string, unknown>>(key);
  if (!h || Object.keys(h).length === 0) return [];

  const now = Date.now();
  const rows: CartPresenceRowRedis[] = [];
  const toDel: string[] = [];

  for (const [visitorId, rawVal] of Object.entries(h)) {
    const v = parsePresenceHashValue(rawVal);
    if (!v) {
      toDel.push(visitorId);
      continue;
    }
    if (now - v.updatedAt > CART_PRESENCE_TTL_MS || !v.items?.length) {
      toDel.push(visitorId);
      continue;
    }
    rows.push({
      visitorId,
      items: v.items,
      totalCents: v.totalCents,
      lastSeenAt: v.updatedAt,
    });
  }

  if (toDel.length > 0) {
    await redis.hdel(key, ...toDel);
  }

  return rows.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

export async function upsertCartPresenceRedis(
  redis: Redis,
  locationSlug: string,
  visitorId: string,
  items: Line[],
  totalCents: number
): Promise<"ok" | "rate_limited"> {
  const ok = await redis.set(rateKey(visitorId), "1", { nx: true, ex: RATE_EX_SEC });
  if (ok === null) return "rate_limited";

  const key = hashKey(locationSlug);
  if (items.length === 0) {
    await redis.hdel(key, visitorId);
  } else {
    const payload = JSON.stringify({
      items,
      totalCents,
      updatedAt: Date.now(),
    });
    await redis.hset(key, { [visitorId]: payload });
  }

  return "ok";
}
