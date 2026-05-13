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

// --- Phase 1: order items (m1_3) ----------------------------------------

/**
 * Order line-items, normalized out of `orders.payload.items`. Phase 1 keeps
 * the jsonb mirror in payload so dual-write stays simple; the order_items
 * table exists for the queries that need a real SQL group-by:
 *
 *   - Per-item revenue / margin reports.
 *   - "What was the top-selling pizza last week per location?"
 *   - Phase 2 KDS station routing — fan out by menu_item_station mapping.
 *
 * `unit_price_grosze` is captured at order time, not looked up from the
 * menu — menus shift price; the order's actual paid price is the truth.
 *
 * `modifiers` (jsonb) is forward-compatible: Phase 2 will start storing
 * `{ size: "L", extra_cheese: true, no_onions: true }` once the menu
 * supports modifier groups. For now it's just an empty object.
 */
export const orderItems = pgTable(
  "order_items",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    menuItemId: text("menu_item_id").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceGrosze: integer("unit_price_grosze").notNull(),
    notes: text("notes"),
    modifiers: jsonb("modifiers").notNull().default({}),
  },
  (table) => [
    index("order_items_order_id_idx").on(table.orderId),
    index("order_items_menu_item_id_idx").on(table.menuItemId),
  ],
);

// --- Phase 1: customers (m1_4) ------------------------------------------

/**
 * Customer rollup table. Not a source of truth — derived from orders +
 * point-adjustments + loyalty signup data. Maintained by
 * recomputeCustomerRollup() in store.ts which fires on the order lifecycle
 * (create, status change, delete) and on point adjustments. Source data
 * remains in orders / point-adjustments / loyalty-members, so a rollup
 * inconsistency can always be repaired by reprocessing those.
 *
 * Phone is the natural key — that's how every other entity references a
 * customer. E.164 format enforced upstream in normalizePlPhoneE164.
 *
 * The opt-out flags set the stage for Phase 2 comms: every SMS/email
 * provider in lib/providers/* checks these before sending.
 *
 * `loyalty_points_balance` is the spendable balance — earned (revenue/100)
 * + manual_adjustments - redemptions. We materialize it so the customer
 * detail page renders fast; the Phase 4 AI ops agent's "give 100 points to
 * Maria" tool will write a row to point_adjustments AND increment this
 * column atomically.
 */
export const customers = pgTable(
  "customers",
  {
    phone: text("phone").primaryKey(),
    name: text("name"),
    email: text("email"),
    birthday: text("birthday"), // YYYY-MM-DD; loose match by month+day
    totalSpentGrosze: integer("total_spent_grosze").notNull().default(0),
    orderCount: integer("order_count").notNull().default(0),
    firstOrderAt: timestamp("first_order_at", { withTimezone: true }),
    lastOrderAt: timestamp("last_order_at", { withTimezone: true }),
    loyaltyPointsBalance: integer("loyalty_points_balance").notNull().default(0),
    manualPointsAdjust: integer("manual_points_adjust").notNull().default(0),
    smsOptout: text("sms_optout").notNull().default("false"), // "true"|"false" so we can also use "unset"
    emailOptout: text("email_optout").notNull().default("false"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("customers_last_order_at_idx").on(table.lastOrderAt),
    index("customers_email_idx").on(table.email),
  ],
);

// --- Phase 1: inventory (m1_5) ------------------------------------------

/** Ingredients (chain-wide, not per-location). */
export const ingredients = pgTable("ingredients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  unit: text("unit").notNull(),
  costPerUnit: integer("cost_per_unit").notNull(),
  supplier: text("supplier"),
  notes: text("notes"),
});

/**
 * Recipes (chain-wide). RecipeIngredient[] stays in `ingredients_payload`
 * jsonb because it's tightly coupled to the recipe — every access path
 * loads the recipe whole, and there's no cross-recipe ingredient query
 * that benefits from a normalized recipe_ingredients table.
 */
export const recipes = pgTable(
  "recipes",
  {
    id: text("id").primaryKey(),
    menuItemId: text("menu_item_id").notNull(),
    prepTimeMinutes: integer("prep_time_minutes"),
    yieldPortions: integer("yield_portions").notNull(),
    notes: text("notes"),
    ingredientsPayload: jsonb("ingredients_payload").notNull().default([]),
  },
  (table) => [
    uniqueIndex("recipes_menu_item_id_unique").on(table.menuItemId),
  ],
);

/**
 * Per-location stock levels. Composite PK on (ingredient_id, location_slug)
 * prevents two rows for the same ingredient/location pair — the old JSON
 * code had no such guard.
 */
export const ingredientStock = pgTable(
  "ingredient_stock",
  {
    ingredientId: text("ingredient_id").notNull(),
    locationSlug: text("location_slug").notNull(),
    onHand: integer("on_hand").notNull(),
    parLevel: integer("par_level").notNull(),
    reorderPoint: integer("reorder_point").notNull(),
    lastCountedAt: timestamp("last_counted_at", { withTimezone: true }),
    lastCountedBy: text("last_counted_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.ingredientId, table.locationSlug] }),
    index("ingredient_stock_location_idx").on(table.locationSlug),
  ],
);

/**
 * Append-only stock movement log. Index on
 * (ingredient_id, occurred_at DESC) so the variance report stops doing
 * an in-memory filter and sort.
 */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: text("id").primaryKey(),
    ingredientId: text("ingredient_id").notNull(),
    locationSlug: text("location_slug").notNull(),
    type: text("type").notNull(),
    quantity: integer("quantity").notNull(),
    costImpact: integer("cost_impact"),
    reason: text("reason"),
    byUser: text("by_user"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("stock_movements_ingredient_occurred_idx").on(
      table.ingredientId,
      table.occurredAt,
    ),
    index("stock_movements_location_occurred_idx").on(
      table.locationSlug,
      table.occurredAt,
    ),
  ],
);

// --- Phase 1: audit log (m1_6) -----------------------------------------

/**
 * Persistent operator audit log. Replaces audit-log.json which trims to
 * the last 1000 entries — inspectors, GDPR DSARs, fraud investigations,
 * and Phase 4's AI agent (which writes a row per tool call) all want the
 * full history. No trim here; rows are small (~200 bytes each) and a
 * year of operator activity fits comfortably in any tier.
 *
 * Indices match the actual query shapes: chronological listings,
 * per-entity lookups, per-actor activity for fraud, per-location for
 * franchisee scoping.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    locationSlug: text("location_slug"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("audit_log_occurred_at_idx").on(table.occurredAt),
    index("audit_log_entity_idx").on(table.entityType, table.entityId),
    index("audit_log_location_occurred_idx").on(
      table.locationSlug,
      table.occurredAt,
    ),
    index("audit_log_actor_idx").on(table.actor),
    index("audit_log_action_idx").on(table.action),
  ],
);

// --- Phase 1: feedback (m1_7) ------------------------------------------

/**
 * Customer feedback table. Replaces the in-memory filter on
 * kv_store["feedback.json"] used by /admin/feedback + the sentiment
 * analyzer. `themes` is a text[] (not jsonb) so GIN-style theme queries
 * are an option later without a schema migration.
 *
 * (location_slug, created_at DESC) is the dominant access pattern;
 * (status) covers the queue UI.
 */
export const feedback = pgTable(
  "feedback",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull(),
    locationSlug: text("location_slug").notNull(),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    overallRating: integer("overall_rating").notNull(),
    categoryRatings: jsonb("category_ratings").notNull().default({}),
    comment: text("comment").notNull(),
    status: text("status").notNull(),
    sentiment: text("sentiment"),
    themes: text("themes").array(),
    analyzedAt: timestamp("analyzed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("feedback_location_created_idx").on(
      table.locationSlug,
      table.createdAt,
    ),
    index("feedback_status_idx").on(table.status),
    index("feedback_order_id_idx").on(table.orderId),
  ],
);

// --- Phase 1: staff / shifts / time-punches (m1_8a) ---------------------

export const staff = pgTable(
  "staff",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    role: text("role").notNull(),
    locationSlug: text("location_slug").notNull(),
    hourlyRateGrosze: integer("hourly_rate_grosze").notNull(),
    hireDate: text("hire_date"),
    dob: text("dob"),
    status: text("status").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("staff_location_idx").on(table.locationSlug),
    index("staff_status_idx").on(table.status),
  ],
);

export const shifts = pgTable(
  "shifts",
  {
    id: text("id").primaryKey(),
    staffId: text("staff_id").notNull(),
    locationSlug: text("location_slug").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    role: text("role").notNull(),
    status: text("status").notNull(),
    notes: text("notes"),
  },
  (table) => [
    index("shifts_location_start_idx").on(table.locationSlug, table.startAt),
    index("shifts_staff_start_idx").on(table.staffId, table.startAt),
    index("shifts_status_idx").on(table.status),
  ],
);

/**
 * Time punches — append-only. The labour-cost calculation pairs IN/OUT per
 * staff member across a window, so (staff_id, occurred_at DESC) is the
 * only access pattern that matters.
 */
export const timePunches = pgTable(
  "time_punches",
  {
    id: text("id").primaryKey(),
    staffId: text("staff_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    type: text("type").notNull(), // "clock-in" | "clock-out"
    shiftId: text("shift_id"),
  },
  (table) => [
    index("time_punches_staff_occurred_idx").on(
      table.staffId,
      table.occurredAt,
    ),
  ],
);

// --- Phase 1: CRM (m1_8b) -----------------------------------------------

/** Phone-only loyalty signups (separate from `customers`, which is derived). */
export const loyaltyMembers = pgTable("loyalty_members", {
  phone: text("phone").primaryKey(),
  name: text("name").notNull(),
  lastName: text("last_name"),
  nickname: text("nickname"),
  email: text("email"),
  dob: text("dob"),
  signedUpAt: timestamp("signed_up_at", { withTimezone: true }).notNull(),
});

/** Append-only ledger of manual ±points. Composite read pattern is per-phone. */
export const pointAdjustments = pgTable(
  "point_adjustments",
  {
    // No PK on (phone, adjustedAt) — adjustments are append-only and the
    // store doesn't expose an id. Synthesize one from the natural keys so
    // ON CONFLICT DO NOTHING gives idempotent backfill.
    id: text("id").primaryKey(),
    phone: text("phone").notNull(),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(),
    adjustedBy: text("adjusted_by").notNull(),
    adjustedAt: timestamp("adjusted_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("point_adjustments_phone_idx").on(table.phone),
    index("point_adjustments_adjusted_at_idx").on(table.adjustedAt),
  ],
);

/** Free-text customer notes — phone-scoped reads are the dominant pattern. */
export const customerNotes = pgTable(
  "customer_notes",
  {
    id: text("id").primaryKey(),
    phone: text("phone").notNull(),
    body: text("body").notNull(),
    tags: text("tags").array(),
    authoredBy: text("authored_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("customer_notes_phone_idx").on(table.phone),
    index("customer_notes_created_idx").on(table.createdAt),
  ],
);

// --- Phase 1: outbox events (m1_13) -------------------------------------

/**
 * Outbox pattern. Side effects that must fire exactly once (SMS, email,
 * aggregator-confirm, KDS-notify) are written here in the same transaction
 * as the parent change (order placement, status flip, etc.). The
 * outbox-drain cron pulls unprocessed rows and dispatches them; success
 * sets processed_at, failure increments attempt_count + last_error.
 *
 * id is deterministic — typically a content hash of (event_type, entity_id,
 * a per-event key) — so INSERT ON CONFLICT DO NOTHING gives exactly-once
 * even when the parent write is retried.
 */
export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: text("id").primaryKey(),
    eventType: text("event_type").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    payload: jsonb("payload").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true })
      .notNull()
      .defaultNow(),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastError: text("last_error"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Drain query: WHERE processed_at IS NULL AND scheduled_for <= now()
    // ORDER BY scheduled_for LIMIT N. This index covers it.
    index("outbox_processed_scheduled_idx").on(
      table.processedAt,
      table.scheduledFor,
    ),
    index("outbox_event_type_idx").on(table.eventType),
    index("outbox_entity_idx").on(table.entityType, table.entityId),
  ],
);

// --- Phase 2: KDS v2 stations + tickets (m2_1, m2_2, m2_3) --------------

/**
 * Kitchen stations per location. A station is a physical work area —
 * pizza oven, fryer, cold prep, drinks, expo. Items route to stations
 * via menu_item_station; tickets fan out from an order onto each
 * station's queue.
 */
export const stations = pgTable(
  "stations",
  {
    id: text("id").primaryKey(),
    locationSlug: text("location_slug").notNull(),
    name: text("name").notNull(),
    /** Display ordinal for the expo screen. */
    displayOrder: integer("display_order").notNull().default(0),
    /** When false, items route around this station (e.g. seasonally closed). */
    active: text("active").notNull().default("true"),
  },
  (table) => [
    index("stations_location_idx").on(table.locationSlug),
  ],
);

/**
 * menu_item_station maps menu items to one or more stations.
 * Composite PK so duplicates are impossible. menu_item_id is a free
 * string (not FK) because menu items live in code (krakow.ts/warszawa.ts)
 * — see CLAUDE.md.
 */
export const menuItemStation = pgTable(
  "menu_item_station",
  {
    menuItemId: text("menu_item_id").notNull(),
    stationId: text("station_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.menuItemId, table.stationId] }),
    index("menu_item_station_station_idx").on(table.stationId),
  ],
);

/**
 * KDS tickets — one row per (order, station). The same order can have
 * up to N tickets, one per station that needs to make something. Items
 * for that station live in `payload.items` until Phase 2.5 carves out a
 * separate ticket_items table.
 *
 * Lifecycle:
 *   fired (started_at set on bump)
 *   ready (ready_at set on bump from station to expo)
 *   bumped (bumped_at set on expo bump = order ready overall)
 *   recalled (resurfaced after accidental bump)
 */
export const kdsTickets = pgTable(
  "kds_tickets",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull(),
    stationId: text("station_id").notNull(),
    locationSlug: text("location_slug").notNull(),
    status: text("status").notNull().default("fired"),
    payload: jsonb("payload").notNull().default({}),
    promisedReadyAt: timestamp("promised_ready_at", { withTimezone: true }),
    firedAt: timestamp("fired_at", { withTimezone: true }).notNull().defaultNow(),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    bumpedAt: timestamp("bumped_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("kds_tickets_order_idx").on(table.orderId),
    index("kds_tickets_station_status_idx").on(table.stationId, table.status),
    index("kds_tickets_location_status_fired_idx").on(
      table.locationSlug,
      table.status,
      table.firedAt,
    ),
  ],
);
