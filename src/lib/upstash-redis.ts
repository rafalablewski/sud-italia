import { Redis } from "@upstash/redis";

let cached: Redis | null | undefined;

/**
 * Upstash Redis (HTTP). Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN from the Upstash console.
 * When unset, cart presence falls back to Neon / filesystem via store.readJSON.
 */
export function getUpstashRedis(): Redis | null {
  if (cached !== undefined) return cached;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    cached = null;
    return null;
  }
  cached = Redis.fromEnv();
  return cached;
}
