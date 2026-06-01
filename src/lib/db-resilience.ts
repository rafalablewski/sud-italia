import { logger } from "@/lib/logger";

/**
 * DB resilience: a per-operation timeout + a process-level read circuit breaker.
 *
 * Why: when Neon has a control-plane blip or saturates its connection limit
 * (`"Too many database connection attempts"`, retryable 500s), individual
 * queries don't fail fast — they hang. During a production build that statically
 * prerenders 200+ public pages, each page's menu/ingredient reads then crawl
 * toward the 60s prerender timeout and the whole build dies (even though every
 * read already has a filesystem/seed fallback). At runtime the same blip turns
 * into hanging requests.
 *
 * The fix has two parts:
 *   1. `withDbTimeout` races each DB op against a timeout, so a hang becomes a
 *      fast rejection the caller's existing try/catch turns into a fallback.
 *   2. A circuit breaker trips after a few consecutive failures and, while open,
 *      lets read paths skip Neon entirely (`dbBreakerOpen()`), serving fallbacks
 *      instantly instead of timing out once per call. One trip during a build
 *      spares the remaining pages; at runtime it re-probes after a short
 *      cooldown.
 *
 * The breaker only ever short-circuits *reads* — writes still attempt Neon (and
 * fail loudly as before), so it can never silently drop a write.
 */

const TIMEOUT_MS = numEnv("DB_OP_TIMEOUT_MS", 6_000);
const FAILURE_THRESHOLD = numEnv("DB_BREAKER_THRESHOLD", 3);
const COOLDOWN_MS = numEnv("DB_BREAKER_COOLDOWN_MS", 20_000);

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

let consecutiveFailures = 0;
let openUntil = 0;

/** True while the breaker is open — read paths should skip Neon and fall back. */
export function dbBreakerOpen(): boolean {
  return Date.now() < openUntil;
}

function recordSuccess(): void {
  consecutiveFailures = 0;
  openUntil = 0;
}

function recordFailure(): void {
  consecutiveFailures += 1;
  if (consecutiveFailures >= FAILURE_THRESHOLD && !dbBreakerOpen()) {
    openUntil = Date.now() + COOLDOWN_MS;
    logger.warn(
      "db circuit breaker opened — serving fallbacks",
      { layer: "db.resilience", cooldownMs: COOLDOWN_MS, failures: consecutiveFailures },
    );
  }
}

class DbTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`DB op timed out after ${ms}ms: ${label}`);
    this.name = "DbTimeoutError";
  }
}

/**
 * Races `op()` against the configured timeout and feeds the breaker. On timeout
 * or rejection it records a failure and rethrows so the caller's fallback runs;
 * on success it resets the breaker. The underlying fetch isn't cancelled (the
 * Neon HTTP driver has no per-call abort here) — we just stop *waiting* on it,
 * and the open breaker stops new queries from piling on.
 */
export async function withDbTimeout<T>(op: () => Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race<T>([
      op(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new DbTimeoutError(label, TIMEOUT_MS)), TIMEOUT_MS);
      }),
    ]);
    recordSuccess();
    return result;
  } catch (err) {
    recordFailure();
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Test-only: reset breaker state between cases. */
export function _resetDbBreakerForTests(): void {
  consecutiveFailures = 0;
  openUntil = 0;
}
