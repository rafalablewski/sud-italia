import { getUpstashRedis } from "@/lib/upstash-redis";
import { logger } from "@/lib/logger";

/**
 * Distributed mutex for read-modify-write sections that must serialize across
 * Vercel instances. Primary backend is Upstash Redis (`SET key value NX PX
 * ttl`); the in-process Promise chain remains as a dev/CI fallback when Redis
 * isn't configured.
 *
 * Note we don't use Postgres advisory locks here. With Neon's serverless HTTP
 * driver each SQL call is a separate request and advisory locks are
 * connection-bound, so holding one across arbitrary async JS work is not
 * possible. Redis HTTP is the right primitive for this shape.
 *
 * Lock keys should scope as narrowly as the critical section permits — e.g.
 * `slots:${locationSlug}:${date}` rather than `slots.json` — so two locations'
 * traffic doesn't contend on the same lock.
 */

const inProcessLocks = new Map<string, Promise<void>>();

export interface LockOptions {
  /** How long the lock is held before Redis auto-expires it. */
  ttlMs?: number;
  /** How long we'll wait to acquire before giving up. */
  acquireTimeoutMs?: number;
  /** Base delay between retries; grows with backoff + jitter. */
  retryDelayMs?: number;
}

const DEFAULT_TTL_MS = 10_000;
const DEFAULT_ACQUIRE_TIMEOUT_MS = 5_000;
const DEFAULT_RETRY_DELAY_MS = 50;

const metrics = {
  acquisitions: 0,
  contentions: 0,
  timeouts: 0,
  totalWaitMs: 0,
  totalHoldMs: 0,
  inProcessFallbacks: 0,
};

export function snapshotLockMetrics() {
  const n = metrics.acquisitions || 1;
  return {
    acquisitions: metrics.acquisitions,
    contentions: metrics.contentions,
    timeouts: metrics.timeouts,
    inProcessFallbacks: metrics.inProcessFallbacks,
    meanWaitMs: metrics.totalWaitMs / n,
    meanHoldMs: metrics.totalHoldMs / n,
  };
}

function newToken(): string {
  return `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 10)}`;
}

async function tryAcquireRedis(
  key: string,
  token: string,
  ttlMs: number,
): Promise<boolean> {
  const redis = getUpstashRedis();
  if (!redis) return false;
  const result = await redis.set(key, token, { nx: true, px: ttlMs });
  return result === "OK";
}

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

async function releaseRedis(key: string, token: string): Promise<void> {
  const redis = getUpstashRedis();
  if (!redis) return;
  try {
    await redis.eval(RELEASE_SCRIPT, [key], [token]);
  } catch (err) {
    logger.warn("withDistributedLock release failed", { key }, err);
  }
}

async function withInProcessLock<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = inProcessLocks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  inProcessLocks.set(
    key,
    next.then(
      () => {},
      () => {},
    ),
  );
  return next;
}

export async function withDistributedLock<T>(
  key: string,
  fn: () => Promise<T>,
  opts: LockOptions = {},
): Promise<T> {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const acquireTimeoutMs = opts.acquireTimeoutMs ?? DEFAULT_ACQUIRE_TIMEOUT_MS;
  const retryDelayMs = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const lockKey = `lock:${key}`;
  const token = newToken();
  const redis = getUpstashRedis();

  if (!redis) {
    metrics.inProcessFallbacks += 1;
    // In dev / CI without Upstash this is correct. In production without
    // Upstash this is a bug — two Vercel instances will each acquire
    // independently and the read-modify-write race that motivated the lock
    // returns. Provision UPSTASH_REDIS_REST_URL before going live.
    if (process.env.NODE_ENV === "production") {
      logger.warn(
        "withDistributedLock: Upstash not configured in production; falling back to in-process",
        { key },
      );
    }
    return withInProcessLock(key, fn);
  }

  const acquireStart = Date.now();
  let acquired = false;
  let attempts = 0;
  while (!acquired) {
    acquired = await tryAcquireRedis(lockKey, token, ttlMs);
    if (acquired) break;
    attempts += 1;
    metrics.contentions += 1;
    if (Date.now() - acquireStart > acquireTimeoutMs) {
      metrics.timeouts += 1;
      const waitMs = Date.now() - acquireStart;
      logger.warn("withDistributedLock acquire timeout", {
        key,
        attempts,
        waitMs,
      });
      throw new Error(
        `lock acquire timeout for "${key}" after ${waitMs}ms`,
      );
    }
    // Exponential backoff with jitter so retrying clients don't synchronize.
    const base = Math.min(retryDelayMs * Math.pow(1.5, attempts - 1), 1000);
    const jitter = base * (Math.random() - 0.5);
    await new Promise((r) => setTimeout(r, base + jitter));
  }

  const waitMs = Date.now() - acquireStart;
  metrics.acquisitions += 1;
  metrics.totalWaitMs += waitMs;

  const holdStart = Date.now();
  try {
    return await fn();
  } finally {
    const holdMs = Date.now() - holdStart;
    metrics.totalHoldMs += holdMs;
    if (holdMs > ttlMs) {
      // The lock auto-expired while fn was still running; another caller may
      // have already picked it up. Surface this loudly — it means ttlMs is
      // tuned too tight or the body is doing too much.
      logger.warn("withDistributedLock held past TTL", {
        key,
        holdMs,
        ttlMs,
      });
    }
    await releaseRedis(lockKey, token);
  }
}
