import { getUpstashRedis } from "@/lib/upstash-redis";

/**
 * Live truck location pub-sub (m5_5). The truck operator's PWA POSTs
 * its geolocation every 30s while the event is live; customers in
 * the area read it from the public truck-locations endpoint.
 *
 * Storage strategy:
 *   - Upstash Redis when configured: key
 *     `truck-loc:<eventId>` with PX TTL of 90s. The 30s post cadence
 *     means a stale fix expires before customers see it.
 *   - In-process Map fallback for local dev; same TTL semantics.
 *
 * No long-term persistence — location history isn't kept on purpose.
 * Privacy: only the current fix is queryable. Drivers can stop
 * sharing by ending the truck event.
 */

const TTL_MS = 90_000;

export interface LiveLocationFix {
  eventId: string;
  lat: number;
  lng: number;
  accuracyMeters?: number;
  speedMps?: number;
  capturedAt: string;
}

const memCache = new Map<string, { fix: LiveLocationFix; expiresAt: number }>();

function nowMs(): number {
  return Date.now();
}

function pruneMem(): void {
  const now = nowMs();
  for (const [key, value] of memCache) {
    if (value.expiresAt < now) memCache.delete(key);
  }
}

export async function publishFix(fix: LiveLocationFix): Promise<void> {
  const redis = getUpstashRedis();
  if (redis) {
    await redis.set(`truck-loc:${fix.eventId}`, JSON.stringify(fix), { px: TTL_MS });
    return;
  }
  memCache.set(fix.eventId, { fix, expiresAt: nowMs() + TTL_MS });
}

export async function readFix(eventId: string): Promise<LiveLocationFix | null> {
  const redis = getUpstashRedis();
  if (redis) {
    const raw = await redis.get<string>(`truck-loc:${eventId}`);
    if (!raw) return null;
    try {
      return typeof raw === "string" ? (JSON.parse(raw) as LiveLocationFix) : (raw as LiveLocationFix);
    } catch {
      return null;
    }
  }
  pruneMem();
  return memCache.get(eventId)?.fix ?? null;
}

/**
 * Haversine distance in metres. Used by the public endpoint to tag
 * customers within the geofence radius so the menu page can show a
 * "you're nearby" CTA without making the customer share location
 * with the server — the math happens client-side too.
 */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000; // earth radius m
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(sa), Math.sqrt(1 - sa));
  return R * c;
}

export const GEOFENCE_RADIUS_METERS = 500;
