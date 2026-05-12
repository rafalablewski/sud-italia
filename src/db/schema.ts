import {
  pgTable,
  text,
  timestamp,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

/**
 * Phase 0 — idempotency tables.
 *
 * These are the only normalized tables for now. Entity migration (orders,
 * customers, slots, …) happens in Phase 1 under the expand → backfill → flip
 * → contract pattern; until then `kv_store` continues to back the rest of the
 * data layer.
 */

/**
 * Persisted record of every inbound webhook we've processed, keyed by
 * (provider, event_id). Inserts use ON CONFLICT DO NOTHING so retries from
 * Stripe / Wolt / Glovo land idempotently across Vercel instances. Replaces
 * the in-process `new Set<string>()` in src/app/api/webhook/route.ts.
 */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type"),
    processedAt: timestamp("processed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.eventId] }),
    index("webhook_events_processed_at_idx").on(table.processedAt),
  ],
);

/**
 * Records each /api/checkout attempt by its Idempotency-Key + payload hash.
 * Repeats return the original Stripe session URL instead of creating a new
 * checkout (and a duplicate charge).
 *
 * The PK is the SHA-256 of `${key}:${cartHash}:${slotId}` so identical retries
 * collide, but distinct payloads from the same key — a malicious or sloppy
 * client — get fresh attempts.
 */
export const checkoutAttempts = pgTable(
  "checkout_attempts",
  {
    idempotencyHash: text("idempotency_hash").primaryKey(),
    stripeSessionId: text("stripe_session_id").notNull(),
    stripeSessionUrl: text("stripe_session_url").notNull(),
    orderId: text("order_id").notNull(),
    locationSlug: text("location_slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("checkout_attempts_created_at_idx").on(table.createdAt),
    index("checkout_attempts_expires_at_idx").on(table.expiresAt),
  ],
);
