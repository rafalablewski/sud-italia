import {
  pgTable,
  text,
  integer,
  jsonb,
  timestamp,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Phase 0 — idempotency tables.
 * Phase 1 — entity normalization with self-bootstrap + dual-write.
 *
 * Tables under Phase 1 ship alongside the existing kv_store; the
 * `ensureTable` helper in src/db/migrate.ts runs idempotent DDL on first
 * touch, so production deploys don't need a manual db:migrate step.
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

// --- Phase 1: slots (m1_1) ----------------------------------------------

/**
 * Normalized time-slot table. Replaces the read-modify-write loop on
 * kv_store["slots.json"]; `incrementSlotOrders` becomes a single atomic
 * UPDATE ... WHERE current_orders < max_orders RETURNING * with no need
 * for the distributed lock from m0_1.
 *
 * UNIQUE constraint on (location_slug, date, time) prevents a manager from
 * creating two slots at the same instant — the existing JSON path had no
 * such guard.
 *
 * `fulfillment_types` is text[] so the GIN-style queries in the admin
 * slots filter ("which slots support delivery?") don't require unnesting
 * JSONB. Status is "draft" | "active"; archived past-time slots set status
 * "draft" so they fall off the public list (matches existing behavior).
 */
export const slots = pgTable(
  "slots",
  {
    id: text("id").primaryKey(),
    locationSlug: text("location_slug").notNull(),
    date: text("date").notNull(), // YYYY-MM-DD; stored as text to match TimeSlot.date
    time: text("time").notNull(), // HH:MM
    maxOrders: integer("max_orders").notNull(),
    currentOrders: integer("current_orders").notNull().default(0),
    // text[] — Drizzle types it through the .array() helper. The DB stores it
    // as text[] not jsonb so the admin filter can use GIN if we add one later.
    fulfillmentTypes: text("fulfillment_types").array().notNull(),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("slots_location_date_time_unique").on(
      table.locationSlug,
      table.date,
      table.time,
    ),
    index("slots_location_date_idx").on(table.locationSlug, table.date),
    index("slots_status_idx").on(table.status),
  ],
);

// --- Phase 1: orders (m1_2) ---------------------------------------------

/**
 * Normalized orders table. Replaces the full-blob in-memory filters that
 * every admin analytics / report / labour-ratio query was doing against
 * kv_store["orders.json"]. Indices on (location_slug, created_at DESC),
 * (status), (customer_phone), (stripe_payment_intent_id) cover the four
 * access patterns those queries actually use.
 *
 * `payload` (jsonb) holds the remaining un-normalized fields: `items`
 * (line items move to their own table in m1_3), `feedback`, `refund`,
 * `dispute`, `qualityCheck`, `queuePosition`, `estimatedReadyAt`,
 * `specialInstructions`. This keeps the type-mapping simple — anything
 * Phase 1 doesn't normalize into a column stays in jsonb until a later
 * phase pulls it out.
 *
 * `total_grosze` and `tip_grosze` are explicit columns because revenue
 * reports SUM() over them; doing that against jsonb is OK but indexes +
 * a planned PARTITION BY date make integer columns the right call long
 * term.
 */
export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey(),
    locationSlug: text("location_slug").notNull(),
    customerPhone: text("customer_phone").notNull(),
    customerName: text("customer_name").notNull(),
    status: text("status").notNull(),
    fulfillmentType: text("fulfillment_type").notNull(),
    slotId: text("slot_id").notNull(),
    slotDate: text("slot_date").notNull(),
    slotTime: text("slot_time").notNull(),
    totalGrosze: integer("total_grosze").notNull(),
    tipGrosze: integer("tip_grosze"),
    stripeSessionId: text("stripe_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    deliveryAddress: text("delivery_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    payload: jsonb("payload").notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("orders_location_created_at_idx").on(
      table.locationSlug,
      table.createdAt,
    ),
    index("orders_status_idx").on(table.status),
    index("orders_customer_phone_idx").on(table.customerPhone),
    index("orders_stripe_payment_intent_idx").on(table.stripePaymentIntentId),
    index("orders_slot_id_idx").on(table.slotId),
  ],
);
