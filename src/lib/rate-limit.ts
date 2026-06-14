import { NextRequest, NextResponse } from "next/server";
import { getUpstashRedis } from "@/lib/upstash-redis";
import { logger } from "@/lib/logger";

// Fail-fast against a dead/unreachable Upstash: cap each Redis op, and once one
// fails open a short circuit so subsequent requests skip Redis entirely (the
// in-process fallback) rather than each re-paying the timeout.
const RL_REDIS_TIMEOUT_MS = 1_000;
const RL_REDIS_COOLDOWN_MS = 30_000;
let rlRedisDownUntil = 0;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * Fixed-window rate limiter backed by Upstash Redis.
 *
 * Each call increments a counter keyed by (limit-key, current window). The
 * first INCR returns 1 and we set the EXPIRE to the window length; subsequent
 * calls within the window are constant-time increments. When the counter
 * exceeds `limit`, the limiter denies and returns 429 with a Retry-After
 * header.
 *
 * Without Upstash (local dev) we fall back to an in-process Map. That's
 * obviously not safe across Vercel instances, but it's only used when no
 * UPSTASH_REDIS_REST_URL is set — and the logger warns the operator on
 * first deny so it's visible.
 *
 * We use a fixed window rather than a sliding window because the INCR-and-
 * EXPIRE path is one Redis round-trip; a true sliding window needs sorted
 * sets or a Lua script and the extra round-trip isn't worth it for
 * abuse-prevention thresholds (the bursting edge of the window is fine).
 */

export interface RateLimitOptions {
  /** Logical key namespace (e.g. "checkout", "login"). Combined with `id` to form the storage key. */
  key: string;
  /** Per-actor identifier (IP, phone, user id). */
  id: string;
  /** Maximum requests allowed in the window. */
  limit: number;
  /** Window length in seconds. */
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Remaining requests in the current window. Clamped at 0. */
  remaining: number;
  /** Seconds until the window resets. */
  resetInSec: number;
  /** When allowed=false, suitable for a 429 response. */
  retryAfterSec?: number;
}

const inProcessCounters = new Map<string, { count: number; resetAt: number }>();
let warnedNoRedis = false;

export async function rateLimit(
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  const { key, id, limit, windowSec } = opts;
  const now = Math.floor(Date.now() / 1000);
  const window = Math.floor(now / windowSec);
  const resetAt = (window + 1) * windowSec;
  const resetInSec = Math.max(1, resetAt - now);
  const storageKey = `rl:${key}:${id}:${window}`;

  // Fail-fast against a dead Upstash: treat it as "no redis" while the circuit is
  // open (set on the last failure), so we don't re-pay a multi-second timeout on
  // EVERY admin request — which both lags the UI and can push a serverless
  // function past its limit before its real work runs (the void DELETE that
  // never reached its handler). Circuit half-opens after the cooldown.
  const redis = Date.now() < rlRedisDownUntil ? null : getUpstashRedis();
  if (!redis) {
    if (!warnedNoRedis && process.env.NODE_ENV === "production") {
      logger.warn(
        "rateLimit: Upstash not configured in production; using in-process fallback",
        { key },
      );
      warnedNoRedis = true;
    }
    // Cleanup expired entries opportunistically.
    for (const [k, v] of inProcessCounters) {
      if (v.resetAt <= now) inProcessCounters.delete(k);
    }
    const existing = inProcessCounters.get(storageKey);
    if (!existing) {
      inProcessCounters.set(storageKey, { count: 1, resetAt });
      return { allowed: true, remaining: limit - 1, resetInSec };
    }
    existing.count += 1;
    if (existing.count > limit) {
      return { allowed: false, remaining: 0, resetInSec, retryAfterSec: resetInSec };
    }
    return { allowed: true, remaining: Math.max(0, limit - existing.count), resetInSec };
  }

  try {
    const count = await withTimeout(redis.incr(storageKey), RL_REDIS_TIMEOUT_MS, "redis.incr");
    if (count === 1) {
      // First hit in this window — pin the TTL.
      await withTimeout(redis.expire(storageKey, windowSec), RL_REDIS_TIMEOUT_MS, "redis.expire");
    }
    if (count > limit) {
      return { allowed: false, remaining: 0, resetInSec, retryAfterSec: resetInSec };
    }
    return { allowed: true, remaining: Math.max(0, limit - count), resetInSec };
  } catch (err) {
    // Fail-open AND open the circuit so the next 30s of requests skip Upstash
    // up-front (no repeated timeout). If Upstash is down we don't want every
    // request to 429 — or to hang.
    rlRedisDownUntil = Date.now() + RL_REDIS_COOLDOWN_MS;
    logger.error(
      "rateLimit: redis failure — failing open + opening circuit",
      { key, id, layer: "rate-limit" },
      err,
    );
    return { allowed: true, remaining: limit, resetInSec };
  }
}

/**
 * Extracts the client's IP from request headers. Vercel sets
 * `x-forwarded-for` (chain of proxies); we take the leftmost which is the
 * original client. Falls back to the connecting address from the request.
 */
export function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") || "unknown";
}

/**
 * Parsed `ADMIN_IP_ALLOWLIST` — a comma-separated list of exact client IPs
 * (IPv4 or IPv6) permitted to reach the admin surface. Empty when unset.
 */
export function getAdminIpAllowlist(): string[] {
  const raw = process.env.ADMIN_IP_ALLOWLIST;
  if (!raw || !raw.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * True when `ip` may reach the admin surface. When no allowlist is configured
 * (the default) every IP is allowed — the allowlist is opt-in. When one IS
 * configured, only exact matches pass; anything else (including the "unknown"
 * sentinel from getClientIp) is denied. Exact-match only; CIDR ranges are not
 * supported yet.
 */
export function isAdminIpAllowed(ip: string): boolean {
  const allowlist = getAdminIpAllowlist();
  if (allowlist.length === 0) return true;
  return allowlist.includes(ip);
}

/**
 * Convenience: returns null on allowed, a 429 NextResponse on denied.
 * Drop in at the top of a route handler.
 */
export async function enforceRateLimit(
  opts: RateLimitOptions,
): Promise<Response | null> {
  const result = await rateLimit(opts);
  if (result.allowed) return null;
  return NextResponse.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSec ?? result.resetInSec),
        "X-RateLimit-Limit": String(opts.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(result.resetInSec),
      },
    },
  );
}
