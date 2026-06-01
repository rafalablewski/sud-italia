import { neon } from "@neondatabase/serverless";
import { logger } from "@/lib/logger";
import { withDbTimeout } from "@/lib/db-resilience";

/**
 * Phase 1 substrate helpers. Every Phase 1 entity migration follows the same
 * shape:
 *
 *   1. ensureTable("<name>", [...ddl statements]) on first touch.
 *   2. Read from the new table first.
 *   3. On miss, fall back to kv_store AND lazily upsert the row into the new
 *      table; bumpLazyBackfillHit("<name>") so operators can see the backlog
 *      drain via /api/admin/health.
 *   4. Writes always go to BOTH stores (dual-write) for the foreseeable
 *      future. The kv_store row is a cold backup.
 *
 * No manual `npm run db:migrate` step is required: the DDL is idempotent
 * (CREATE TABLE / INDEX IF NOT EXISTS), runs on first use, and caches success
 * in a module-level flag. Matches the existing ensureDB() pattern in
 * src/lib/store.ts:26-36 and the ensureIdempotencyTables() pattern in
 * src/lib/idempotency.ts.
 */

const ensured = new Set<string>();

/**
 * Runs each DDL statement once per process. Statements must individually be
 * idempotent — use `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`,
 * `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, etc. Returns silently when
 * DATABASE_URL is unset (filesystem-only dev mode); callers in that mode go
 * straight to the kv_store path.
 */
export async function ensureTable(
  name: string,
  ddl: string[],
): Promise<void> {
  if (ensured.has(name)) return;
  if (!process.env.DATABASE_URL) return;
  const sql = neon(process.env.DATABASE_URL);
  try {
    for (const stmt of ddl) {
      // Neon's HTTP driver doesn't accept multi-statement strings; one
      // round-trip per statement. Each is small + idempotent so the cost is
      // bounded. Timeout-guarded so a saturated/down Neon fails fast to the
      // caller's fallback instead of hanging the build's static prerender.
      await withDbTimeout(() => sql.query(stmt), `ensureTable:${name}`);
    }
    ensured.add(name);
  } catch (err) {
    logger.error(
      "ensureTable failed",
      { table: name, layer: "db.migrate" },
      err,
    );
    throw err;
  }
}

/**
 * Counts how often each entity's read path had to fall back to kv_store
 * because the row wasn't in the normalized table yet. When this trends to
 * zero for ≥30 days an operator can safely consider dropping the kv_store
 * entry. Surfaced via /api/admin/health alongside the lock metrics.
 */
const lazyBackfillCounters = new Map<string, number>();

export function bumpLazyBackfillHit(entity: string): void {
  lazyBackfillCounters.set(entity, (lazyBackfillCounters.get(entity) ?? 0) + 1);
}

export function snapshotLazyBackfillCounters(): Record<string, number> {
  return Object.fromEntries(lazyBackfillCounters);
}

/**
 * Resets the cache. Used by tests; do not call from request handlers — the
 * caching is what keeps the DDL cost bounded.
 */
export function _resetEnsureCacheForTests(): void {
  ensured.clear();
  lazyBackfillCounters.clear();
}
