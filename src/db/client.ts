import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "@/db/schema";

/**
 * Drizzle client over the same Neon serverless HTTP driver that `store.ts`
 * already uses. We keep one cached client per process — the Neon driver
 * handles connection pooling on the server side.
 *
 * Returns `null` when DATABASE_URL is unset (local dev without Neon). Callers
 * either skip the table-backed path or fail loudly; we never silently fall
 * back to JSON for tables managed by Drizzle.
 */

type Db = NeonHttpDatabase<typeof schema>;

let cached: Db | null | undefined;

export function getDb(): Db | null {
  if (cached !== undefined) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    cached = null;
    return null;
  }
  const sql: NeonQueryFunction<false, false> = neon(url);
  cached = drizzle({ client: sql, schema });
  return cached;
}

/** Throws when DATABASE_URL is missing — use in code paths that require Postgres. */
export function requireDb(): Db {
  const db = getDb();
  if (!db) {
    throw new Error(
      "DATABASE_URL is not set; this code path requires Postgres (see src/db/client.ts).",
    );
  }
  return db;
}

export { schema };
