import { getUpstashRedis } from "@/lib/upstash-redis";
import { logger } from "@/lib/logger";
import { incrCounter, recordHistogram } from "@/lib/metrics";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Opt-out for single-owner, strictly-sequential batch jobs (the simulation
 * seeder). Such a job has no concurrent writer to serialize against — its own
 * `await` chain already orders every write — so the per-write distributed lock
 * is pure overhead: two extra Upstash round-trips on top of each Neon
 * read+write. Across the ~200 writes a deep seed makes, that overhead is enough
 * to push the request past the serverless time budget. Run the job inside
 * runWithoutLocks() and withDistributedLock becomes a passthrough for its async
 * context only — other requests still lock normally.
 */
const lockBypass = new AsyncLocalStorage<boolean>();
export function runWithoutLocks<T>(fn: () => Promise<T>): Promise<T> {
  return lockBypass.run(true, fn);
}

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

/**
 * Returns:
 *   - true  → we now hold the lock
 *   - false → someone else holds it (retry)
 *   - "broken" → Upstash itself errored; caller should fall back to the
 *     in-process path rather than busy-looping into a 500.
 */
async function tryAcquireRedis(
  key: string,
  token: string,
  ttlMs: number,
): Promise<true | false | "broken"> {
  const redis = getUpstashRedis();
  if (!redis) return "broken";
  try {
    const result = await redis.set(key, token, { nx: true, px: ttlMs });
    return result === "OK";
  } catch (err) {
    logger.error(
      "tryAcquireRedis: Upstash failure — caller will fall back to in-process",
      { key, layer: "locks" },
      err,
    );
    return "broken";
  }
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
  // Seed-style batch job in this async context → skip the mutex entirely (see
  // runWithoutLocks). The job serializes its own writes, so there is nothing to
  // contend with, and the saved round-trips are what keep it under the timeout.
  if (lockBypass.getStore()) return fn();

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
    const result = await tryAcquireRedis(lockKey, token, ttlMs);
    if (result === true) {
      acquired = true;
      break;
    }
    if (result === "broken") {
      // Upstash is misconfigured, expired, or having a moment. The
      // alternative is throwing a 500 on every lock callsite — far
      // worse than dropping to in-process and accepting the cross-
      // instance race we were already living with pre-m0_1.
      metrics.inProcessFallbacks += 1;
      incrCounter("lock.fallbacks");
      // Surface to Sentry (logger.error mirrors there) so the lock-fallback
      // alert fires — a cross-instance race window is open while we run
      // unlocked. Previously this path bumped a metric but logged nothing, so
      // the degradation was invisible to alerting.
      logger.error(
        "withDistributedLock: Redis broken; falling back to in-process lock",
        { key, layer: "locks", alert: "lock.fallback" },
      );
      return withInProcessLock(key, fn);
    }
    attempts += 1;
    metrics.contentions += 1;
    if (Date.now() - acquireStart > acquireTimeoutMs) {
      metrics.timeouts += 1;
      incrCounter("lock.timeouts");
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
  // Surface to the shared metrics surface so /api/admin/health rolls it up.
  recordHistogram("lock.wait_ms", waitMs);
  incrCounter("lock.acquisitions");

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
