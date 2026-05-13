import { createHash } from "crypto";
import { eq, gt, and } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { getDb } from "@/db/client";
import { webhookEvents, checkoutAttempts } from "@/db/schema";
import { logger } from "@/lib/logger";

/**
 * Idempotency primitives for inbound webhooks and outbound checkout retries.
 *
 * Both back onto Postgres tables introduced in m0_7 (Drizzle bootstrap). The
 * read-modify-write race we used to have — `new Set<string>()` in process
 * memory at the top of src/app/api/webhook/route.ts:20 — is resolved by
 * INSERT ... ON CONFLICT DO NOTHING with a RETURNING check.
 *
 * Schema self-bootstraps at runtime (see ensureIdempotencyTables below),
 * matching the existing `ensureDB()` pattern in src/lib/store.ts. Running
 * `npm run db:migrate` against migrations/0000_*.sql remains an option for
 * operators who prefer an explicit step, but it's not required.
 *
 * When DATABASE_URL is absent (local dev / preview without Neon) we fall back
 * to an in-process Set. This loses idempotency across instances, but only in
 * environments that don't have a real DB anyway.
 */

let tablesEnsured = false;

/**
 * Creates webhook_events + checkout_attempts on first use. DDL is idempotent
 * (CREATE TABLE / INDEX IF NOT EXISTS), so the cost is one no-op round-trip
 * per cold start once the tables exist.
 */
export async function ensureIdempotencyTables(): Promise<void> {
  if (tablesEnsured) return;
  if (!process.env.DATABASE_URL) return;
  const sql = neon(process.env.DATABASE_URL);
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS webhook_events (
        provider TEXT NOT NULL,
        event_id TEXT NOT NULL,
        event_type TEXT,
        processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT webhook_events_provider_event_id_pk PRIMARY KEY (provider, event_id)
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS webhook_events_processed_at_idx
        ON webhook_events (processed_at)
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS checkout_attempts (
        idempotency_hash TEXT PRIMARY KEY,
        stripe_session_id TEXT NOT NULL,
        stripe_session_url TEXT NOT NULL,
        order_id TEXT NOT NULL,
        location_slug TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ NOT NULL
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS checkout_attempts_created_at_idx
        ON checkout_attempts (created_at)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS checkout_attempts_expires_at_idx
        ON checkout_attempts (expires_at)
    `;
    tablesEnsured = true;
  } catch (err) {
    logger.error(
      "ensureIdempotencyTables failed",
      { layer: "idempotency.ensure" },
      err,
    );
    throw err;
  }
}

const inProcessWebhookSeen = new Set<string>();

/**
 * Records a webhook event as processed. Returns `true` the first time we see
 * (provider, eventId), `false` on every subsequent retry from the same
 * provider. Callers should short-circuit and respond 200 + `{duplicate:true}`
 * when this returns false.
 */
export async function claimWebhookEvent(
  provider: string,
  eventId: string,
  eventType?: string,
): Promise<boolean> {
  const db = getDb();
  if (!db) {
    const key = `${provider}:${eventId}`;
    if (inProcessWebhookSeen.has(key)) return false;
    inProcessWebhookSeen.add(key);
    logger.debug("claimWebhookEvent: no DB, using in-process set", {
      provider,
      eventId,
    });
    return true;
  }
  await ensureIdempotencyTables();
  const inserted = await db
    .insert(webhookEvents)
    .values({ provider, eventId, eventType })
    .onConflictDoNothing()
    .returning({ eventId: webhookEvents.eventId });
  return inserted.length > 0;
}

// --- Checkout idempotency -------------------------------------------------

const CHECKOUT_TTL_MS = 30 * 60 * 1000; // 30 minutes — long enough to outlive a slow checkout retry

const inProcessCheckouts = new Map<
  string,
  { stripeSessionId: string; stripeSessionUrl: string; orderId: string; expiresAt: number }
>();

export interface CachedCheckout {
  stripeSessionId: string;
  stripeSessionUrl: string;
  orderId: string;
  locationSlug: string;
}

/**
 * Canonical hash of the inputs that define a "same checkout". Tying the hash
 * to (Idempotency-Key + payload) means a malicious or sloppy client that reuses
 * the same header for a genuinely different cart still gets a fresh attempt —
 * we don't return their old session URL with someone else's order id.
 */
export function computeCheckoutHash(
  idempotencyKey: string,
  ...inputs: string[]
): string {
  return createHash("sha256")
    .update([idempotencyKey, ...inputs].join("|"))
    .digest("hex");
}

/**
 * Returns the cached response for a prior /api/checkout call with the same
 * idempotency hash, when one is still fresh. Callers respond with the cached
 * session URL + order id and short-circuit before re-incrementing the slot or
 * creating a duplicate Stripe session.
 */
export async function getCachedCheckout(
  idempotencyHash: string,
): Promise<CachedCheckout | null> {
  const db = getDb();
  if (!db) {
    const hit = inProcessCheckouts.get(idempotencyHash);
    if (!hit || hit.expiresAt <= Date.now()) return null;
    return {
      stripeSessionId: hit.stripeSessionId,
      stripeSessionUrl: hit.stripeSessionUrl,
      orderId: hit.orderId,
      locationSlug: "",
    };
  }
  await ensureIdempotencyTables();
  const rows = await db
    .select()
    .from(checkoutAttempts)
    .where(
      and(
        eq(checkoutAttempts.idempotencyHash, idempotencyHash),
        gt(checkoutAttempts.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    stripeSessionId: row.stripeSessionId,
    stripeSessionUrl: row.stripeSessionUrl,
    orderId: row.orderId,
    locationSlug: row.locationSlug,
  };
}

/**
 * Persists the result of a /api/checkout call so duplicate retries with the
 * same Idempotency-Key collide on the PK and pick up the cached URL via
 * getCachedCheckout(). Conflict is treated as success — losing the race just
 * means another request won, and the winner's data is what subsequent reads
 * will return.
 */
export async function cacheCheckout(args: {
  idempotencyHash: string;
  stripeSessionId: string;
  stripeSessionUrl: string;
  orderId: string;
  locationSlug: string;
  ttlMs?: number;
}): Promise<void> {
  const ttl = args.ttlMs ?? CHECKOUT_TTL_MS;
  const expiresAt = new Date(Date.now() + ttl);
  const db = getDb();
  if (!db) {
    inProcessCheckouts.set(args.idempotencyHash, {
      stripeSessionId: args.stripeSessionId,
      stripeSessionUrl: args.stripeSessionUrl,
      orderId: args.orderId,
      expiresAt: expiresAt.getTime(),
    });
    return;
  }
  await ensureIdempotencyTables();
  await db
    .insert(checkoutAttempts)
    .values({
      idempotencyHash: args.idempotencyHash,
      stripeSessionId: args.stripeSessionId,
      stripeSessionUrl: args.stripeSessionUrl,
      orderId: args.orderId,
      locationSlug: args.locationSlug,
      expiresAt,
    })
    .onConflictDoNothing();
}
