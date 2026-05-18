import { readFile, writeFile, access, mkdir } from "fs/promises";
import { join } from "path";
import { createHash } from "crypto";
import { neon } from "@neondatabase/serverless";
import { TimeSlot, Order, Ingredient, Recipe, IngredientStock, StockMovement, Supplier, PurchaseOrder, PurchaseOrderStatus, CustomerNote, StaffMember, Shift, TimePunch, TruckRoute, TruckEvent, ExpansionChecklist, AuditLogEntry, AdminUser, ComplianceItem, CashSession, CashDrop, MenuItem, BusinessCost, BusinessCostCategory, BusinessCostPayrollRole, SimulationScenario, SimulationLaborLine, SimulationSeasonality, SimulationAssumptions, SimulationAttachLever, SimulationWeather } from "@/data/types";
import { getActiveLocations, locations as allLocations } from "@/data/locations";
import { getUpstashRedis } from "@/lib/upstash-redis";
import {
  getCartPresenceForLocationRedis,
  upsertCartPresenceRedis,
} from "@/lib/cart-presence-redis";
import { WALLET_MAX_PHONES } from "@/lib/constants";
import { normalizePlPhoneE164, phonesEqualPl } from "@/lib/phone";
import { logger } from "@/lib/logger";
import { withDistributedLock } from "@/lib/locks";
import { emitOrderEvent } from "@/lib/order-events";
import { appendOutboxEvent } from "@/lib/outbox";
import { incrCounter } from "@/lib/metrics";
import { and, asc, desc, eq, gte, inArray, lt, ne, sql as drizzleSql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { allergenIncidents as allergenIncidentsTable, auditLog as auditLogTable, brands as brandsTable, customerNotes as customerNotesTable, customers as customersTable, feedback as feedbackTable, franchisees as franchiseesTable, ingredientStock as ingredientStockTable, ingredients as ingredientsTable, kdsTickets as kdsTicketsTable, locationAssignments as locationAssignmentsTable, loyaltyMembers as loyaltyMembersTable, menuItemStation as menuItemStationTable, orderItems as orderItemsTable, orders as ordersTable, pointAdjustments as pointAdjustmentsTable, recipes as recipesTable, royaltyStatements as royaltyStatementsTable, shifts as shiftsTable, slots as slotsTable, staff as staffTable, stations as stationsTable, stockMovements as stockMovementsTable, tempLogs as tempLogsTable, timePunches as timePunchesTable, whatsappMessages as whatsappMessagesTable } from "@/db/schema";
import { lte } from "drizzle-orm";
import { bumpLazyBackfillHit, ensureTable } from "@/db/migrate";

// --- Storage abstraction: Neon Postgres when DATABASE_URL is set, filesystem fallback for local dev ---

const DATA_DIR = join(process.cwd(), ".data");
const useDB = !!process.env.DATABASE_URL;

function sql() {
  return neon(process.env.DATABASE_URL!);
}

let dbInitialized = false;

async function ensureDB() {
  if (dbInitialized) return;
  const db = sql();
  await db`
    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '[]'::jsonb
    )
  `;
  dbInitialized = true;
}

/**
 * Routes legacy callsites through the distributed lock (m0_1). The new
 * primitive serializes across Vercel instances via Upstash Redis SET NX PX
 * when configured, and falls back to an in-process Promise chain otherwise.
 *
 * Lock keys should scope as narrowly as the critical section permits. The
 * `withLockScoped` variant produces per-scope keys — only safe when the
 * body's reads and writes are also scoped to that key. **Never** use it
 * as a wrapper around reads/writes of a shared global kv_store blob; a
 * per-scope lock with a global resource is a race. Gemini code review
 * caught exactly that bug in the order kv mirror; see
 * `mirrorOrderToKvStore` comment.
 *
 * The user-facing scalability win from PR #38 comes from the DB-first
 * write path (`dualWriteOrder` → atomic INSERT, no application lock at
 * all), not from scoping the mirror. The mirror runs `void` from the
 * caller and takes a global lock for correctness.
 */
function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  return withDistributedLock(key, fn);
}

function withLockScoped<T>(
  base: string,
  scope: string | undefined | null,
  fn: () => Promise<T>,
): Promise<T> {
  const key = scope ? `${base}:${scope}` : base;
  return withDistributedLock(key, fn);
}

async function ensureDataDir() {
  try {
    await access(DATA_DIR);
  } catch {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

async function readJSON<T>(key: string, fallback: T): Promise<T> {
  if (useDB) {
    try {
      await ensureDB();
      const db = sql();
      const rows = await db`SELECT value FROM kv_store WHERE key = ${key}`;
      if (rows.length === 0) return fallback;
      return rows[0].value as T;
    } catch (err) {
      logger.error("DB read failed", { key, layer: "store.readJSON" }, err);
      return fallback;
    }
  }
  await ensureDataDir();
  try {
    const data = await readFile(join(DATA_DIR, key), "utf-8");
    return JSON.parse(data);
  } catch {
    return fallback;
  }
}

async function writeJSON<T>(key: string, data: T): Promise<void> {
  if (useDB) {
    await ensureDB();
    const db = sql();
    await db`
      INSERT INTO kv_store (key, value) VALUES (${key}, ${JSON.stringify(data)}::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = ${JSON.stringify(data)}::jsonb
    `;
    return;
  }
  await ensureDataDir();
  await writeFile(join(DATA_DIR, key), JSON.stringify(data, null, 2));
}

// --- Time Slots (m1_1: normalized table with dual-write) ----------------

/**
 * Self-bootstrap DDL for the `slots` table. Matches the Drizzle schema in
 * src/db/schema.ts; both must move together if either changes. Idempotent
 * — runs once per process via ensureTable's cache flag.
 */
const SLOTS_DDL = [
  `CREATE TABLE IF NOT EXISTS slots (
    id text PRIMARY KEY,
    location_slug text NOT NULL,
    date text NOT NULL,
    time text NOT NULL,
    max_orders integer NOT NULL,
    current_orders integer NOT NULL DEFAULT 0,
    fulfillment_types text[] NOT NULL,
    status text NOT NULL DEFAULT 'draft',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS slots_location_date_time_unique
    ON slots (location_slug, date, time)`,
  `CREATE INDEX IF NOT EXISTS slots_location_date_idx
    ON slots (location_slug, date)`,
  `CREATE INDEX IF NOT EXISTS slots_status_idx ON slots (status)`,
];

async function ensureSlotsTable(): Promise<void> {
  await ensureTable("slots", SLOTS_DDL);
}

type SlotRow = typeof slotsTable.$inferSelect;

function rowToSlot(row: SlotRow): TimeSlot {
  return {
    id: row.id,
    locationSlug: row.locationSlug,
    date: row.date,
    time: row.time,
    maxOrders: row.maxOrders,
    currentOrders: row.currentOrders,
    fulfillmentTypes: row.fulfillmentTypes as TimeSlot["fulfillmentTypes"],
    status: row.status as TimeSlot["status"],
  };
}

function slotToValues(slot: TimeSlot) {
  return {
    id: slot.id,
    locationSlug: slot.locationSlug,
    date: slot.date,
    time: slot.time,
    maxOrders: slot.maxOrders,
    currentOrders: slot.currentOrders,
    fulfillmentTypes: slot.fulfillmentTypes,
    status: slot.status,
  };
}

/** Best-effort dual-write into the normalized table. Logs but never throws —
 * the kv_store path is the durable source until Phase 1 fully drains. */
async function dualWriteSlot(slot: TimeSlot): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await ensureSlotsTable();
    await db
      .insert(slotsTable)
      .values({ ...slotToValues(slot), updatedAt: new Date() })
      .onConflictDoUpdate({
        target: slotsTable.id,
        set: { ...slotToValues(slot), updatedAt: new Date() },
      });
  } catch (err) {
    logger.warn(
      "dualWriteSlot failed (kv_store remains source of truth)",
      { slotId: slot.id, layer: "store.slots" },
      err,
    );
  }
}

async function dualDeleteSlot(id: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await ensureSlotsTable();
    await db.delete(slotsTable).where(eq(slotsTable.id, id));
  } catch (err) {
    logger.warn(
      "dualDeleteSlot failed",
      { slotId: id, layer: "store.slots" },
      err,
    );
  }
}

export async function getSlots(locationSlug?: string, date?: string): Promise<TimeSlot[]> {
  const db = getDb();
  if (db) {
    try {
      await ensureSlotsTable();
      const filters = [];
      if (locationSlug) filters.push(eq(slotsTable.locationSlug, locationSlug));
      if (date) filters.push(eq(slotsTable.date, date));
      const rows =
        filters.length > 0
          ? await db.select().from(slotsTable).where(and(...filters))
          : await db.select().from(slotsTable);
      if (rows.length > 0) return rows.map(rowToSlot);
      // Fall through to kv_store on empty result — this is the lazy-backfill
      // path. Once the normalized table has any rows it wins. The empty case
      // covers both "no slots exist" and "the normalized table hasn't been
      // backfilled yet for this filter" — both are fine to fall back from.
    } catch (err) {
      logger.warn(
        "getSlots DB read failed; falling back to kv_store",
        { layer: "store.slots" },
        err,
      );
    }
  }
  const fromKv = await readJSON<TimeSlot[]>("slots.json", []);
  const filtered = fromKv.filter((s) => {
    if (locationSlug && s.locationSlug !== locationSlug) return false;
    if (date && s.date !== date) return false;
    return true;
  });
  if (filtered.length > 0) {
    bumpLazyBackfillHit("slots");
    // Lazy backfill — push the kv rows into the normalized table so the next
    // read won't fall back. Fire-and-forget; failures don't affect this call.
    void Promise.all(filtered.map((s) => dualWriteSlot(s)));
  }
  return filtered;
}

export async function getSlotById(id: string): Promise<TimeSlot | undefined> {
  const db = getDb();
  if (db) {
    try {
      await ensureSlotsTable();
      const rows = await db
        .select()
        .from(slotsTable)
        .where(eq(slotsTable.id, id))
        .limit(1);
      if (rows.length > 0) return rowToSlot(rows[0]);
    } catch (err) {
      logger.warn(
        "getSlotById DB read failed; falling back to kv_store",
        { slotId: id, layer: "store.slots" },
        err,
      );
    }
  }
  const slots = await readJSON<TimeSlot[]>("slots.json", []);
  const hit = slots.find((s) => s.id === id);
  if (hit) {
    bumpLazyBackfillHit("slots");
    void dualWriteSlot(hit);
  }
  return hit;
}

export async function createSlot(slot: TimeSlot): Promise<TimeSlot> {
  return withLock("slots.json", async () => {
    const slots = await readJSON<TimeSlot[]>("slots.json", []);
    slots.push(slot);
    await writeJSON("slots.json", slots);
    await dualWriteSlot(slot);
    return slot;
  });
}

export async function createSlotsBulk(newSlots: TimeSlot[]): Promise<TimeSlot[]> {
  return withLock("slots.json", async () => {
    const slots = await readJSON<TimeSlot[]>("slots.json", []);
    slots.push(...newSlots);
    await writeJSON("slots.json", slots);
    await Promise.all(newSlots.map((s) => dualWriteSlot(s)));
    return newSlots;
  });
}

export async function updateSlot(id: string, updates: Partial<TimeSlot>): Promise<TimeSlot | null> {
  return withLock("slots.json", async () => {
    const slots = await readJSON<TimeSlot[]>("slots.json", []);
    const index = slots.findIndex((s) => s.id === id);
    if (index === -1) return null;
    slots[index] = { ...slots[index], ...updates };
    await writeJSON("slots.json", slots);
    await dualWriteSlot(slots[index]);
    return slots[index];
  });
}

export async function updateSlotsBulk(ids: string[], updates: Partial<TimeSlot>): Promise<TimeSlot[]> {
  return withLock("slots.json", async () => {
    const slots = await readJSON<TimeSlot[]>("slots.json", []);
    const idSet = new Set(ids);
    const updated: TimeSlot[] = [];
    for (const slot of slots) {
      if (idSet.has(slot.id)) {
        Object.assign(slot, updates);
        updated.push(slot);
      }
    }
    await writeJSON("slots.json", slots);
    await Promise.all(updated.map((s) => dualWriteSlot(s)));
    return updated;
  });
}

export async function deleteSlot(id: string): Promise<boolean> {
  return withLock("slots.json", async () => {
    const slots = await readJSON<TimeSlot[]>("slots.json", []);
    const filtered = slots.filter((s) => s.id !== id);
    if (filtered.length === slots.length) return false;
    await writeJSON("slots.json", filtered);
    await dualDeleteSlot(id);
    return true;
  });
}

export async function deleteSlotsBulk(ids: string[]): Promise<number> {
  return withLock("slots.json", async () => {
    const slots = await readJSON<TimeSlot[]>("slots.json", []);
    const idSet = new Set(ids);
    const filtered = slots.filter((s) => !idSet.has(s.id));
    const deletedCount = slots.length - filtered.length;
    await writeJSON("slots.json", filtered);
    if (deletedCount > 0) {
      const db = getDb();
      if (db) {
        try {
          await ensureSlotsTable();
          await db.delete(slotsTable).where(inArray(slotsTable.id, ids));
        } catch (err) {
          logger.warn(
            "deleteSlotsBulk DB delete failed",
            { ids, layer: "store.slots" },
            err,
          );
        }
      }
    }
    return deletedCount;
  });
}

export async function incrementSlotOrders(id: string): Promise<boolean> {
  // Primary path: atomic UPDATE ... WHERE current_orders < max_orders
  // RETURNING *. Two simultaneous lambdas can issue this against the same
  // slot and Postgres serializes them — no application lock required. The
  // distributed lock from m0_1 stays in the kv_store dual-write path as
  // belt-and-suspenders while the legacy data drains.
  const db = getDb();
  if (db) {
    try {
      await ensureSlotsTable();
      const updated = await db
        .update(slotsTable)
        .set({
          currentOrders: drizzleSql`${slotsTable.currentOrders} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(slotsTable.id, id),
            lt(slotsTable.currentOrders, slotsTable.maxOrders),
          ),
        )
        .returning({ currentOrders: slotsTable.currentOrders });
      if (updated.length === 1) {
        // Best-effort mirror to kv_store so the cold backup stays in sync.
        // Failure here only means the kv copy is one increment behind; the
        // normalized table is the source of truth.
        await withLock("slots.json", async () => {
          const slots = await readJSON<TimeSlot[]>("slots.json", []);
          const slot = slots.find((s) => s.id === id);
          if (slot) {
            slot.currentOrders = updated[0].currentOrders;
            await writeJSON("slots.json", slots);
          }
        });
        incrCounter("slot.booked");
        return true;
      }
      // updated.length === 0 means either the row isn't in the normalized
      // table yet (lazy backfill not done) or the slot is full. Fall through
      // to the kv_store path so the legacy check still works.
    } catch (err) {
      logger.warn(
        "incrementSlotOrders DB update failed; falling back to kv path",
        { slotId: id, layer: "store.slots" },
        err,
      );
    }
  }
  // Legacy / fallback path — kv_store + in-process atomicity via withLock.
  return withLock("slots.json", async () => {
    const slots = await readJSON<TimeSlot[]>("slots.json", []);
    const slot = slots.find((s) => s.id === id);
    if (!slot) return false;
    if (slot.currentOrders >= slot.maxOrders) {
      incrCounter("slot.full");
      return false;
    }
    slot.currentOrders += 1;
    await writeJSON("slots.json", slots);
    await dualWriteSlot(slot);
    incrCounter("slot.booked");
    return true;
  });
}

/** Release one slot booking (e.g. when an order is removed). */
export async function decrementSlotOrders(id: string): Promise<boolean> {
  const db = getDb();
  if (db) {
    try {
      await ensureSlotsTable();
      const updated = await db
        .update(slotsTable)
        .set({
          currentOrders: drizzleSql`GREATEST(0, ${slotsTable.currentOrders} - 1)`,
          updatedAt: new Date(),
        })
        .where(eq(slotsTable.id, id))
        .returning({ currentOrders: slotsTable.currentOrders });
      if (updated.length === 1) {
        await withLock("slots.json", async () => {
          const slots = await readJSON<TimeSlot[]>("slots.json", []);
          const slot = slots.find((s) => s.id === id);
          if (slot) {
            slot.currentOrders = updated[0].currentOrders;
            await writeJSON("slots.json", slots);
          }
        });
        return true;
      }
    } catch (err) {
      logger.warn(
        "decrementSlotOrders DB update failed; falling back to kv path",
        { slotId: id, layer: "store.slots" },
        err,
      );
    }
  }
  return withLock("slots.json", async () => {
    const slots = await readJSON<TimeSlot[]>("slots.json", []);
    const slot = slots.find((s) => s.id === id);
    if (!slot) return false;
    slot.currentOrders = Math.max(0, slot.currentOrders - 1);
    await writeJSON("slots.json", slots);
    await dualWriteSlot(slot);
    return true;
  });
}

// --- Available slots for clients ---

export async function getAvailableSlots(
  locationSlug: string,
  date: string,
  fulfillmentType?: string
): Promise<TimeSlot[]> {
  return (await getSlots(locationSlug, date)).filter((s) => {
    if ((s.status ?? "active") !== "active") return false;
    if (s.currentOrders >= s.maxOrders) return false;
    if (fulfillmentType && !s.fulfillmentTypes.includes(fulfillmentType as "takeout" | "delivery")) return false;
    return true;
  });
}

// --- Orders ---

// --- Orders (m1_2: normalized table with dual-write) --------------------

/** Self-bootstrap DDL for the `orders` table. Mirrors the Drizzle schema. */
const ORDERS_DDL = [
  `CREATE TABLE IF NOT EXISTS orders (
    id text PRIMARY KEY,
    location_slug text NOT NULL,
    customer_phone text NOT NULL,
    customer_name text NOT NULL,
    status text NOT NULL,
    fulfillment_type text NOT NULL,
    slot_id text NOT NULL,
    slot_date text NOT NULL,
    slot_time text NOT NULL,
    total_grosze integer NOT NULL,
    tip_grosze integer,
    delivery_fee_grosze integer,
    assigned_driver_id text,
    stripe_session_id text,
    stripe_payment_intent_id text,
    delivery_address text,
    created_at timestamptz NOT NULL,
    paid_at timestamptz,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  // m2_11/12 added two columns; existing deployments need ALTER. IF NOT
  // EXISTS makes this safe to run alongside the CREATE TABLE IF NOT EXISTS
  // above on first boot.
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee_grosze integer`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_driver_id text`,
  `CREATE INDEX IF NOT EXISTS orders_location_created_at_idx
    ON orders (location_slug, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status)`,
  `CREATE INDEX IF NOT EXISTS orders_customer_phone_idx
    ON orders (customer_phone)`,
  `CREATE INDEX IF NOT EXISTS orders_stripe_payment_intent_idx
    ON orders (stripe_payment_intent_id)`,
  `CREATE INDEX IF NOT EXISTS orders_slot_id_idx ON orders (slot_id)`,
  `CREATE INDEX IF NOT EXISTS orders_assigned_driver_idx
    ON orders (assigned_driver_id)`,
];

async function ensureOrdersTable(): Promise<void> {
  await ensureTable("orders", ORDERS_DDL);
}

/**
 * Order line-items table (m1_3). FK to orders.id with ON DELETE CASCADE so
 * deleting an order automatically clears its rows. Existence depends on the
 * orders table; ensureOrderItemsTable() runs ensureOrdersTable() first.
 */
const ORDER_ITEMS_DDL = [
  `CREATE TABLE IF NOT EXISTS order_items (
    id text PRIMARY KEY,
    order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id text NOT NULL,
    quantity integer NOT NULL,
    unit_price_grosze integer NOT NULL,
    notes text,
    modifiers jsonb NOT NULL DEFAULT '{}'::jsonb
  )`,
  `CREATE INDEX IF NOT EXISTS order_items_order_id_idx
    ON order_items (order_id)`,
  `CREATE INDEX IF NOT EXISTS order_items_menu_item_id_idx
    ON order_items (menu_item_id)`,
];

async function ensureOrderItemsTable(): Promise<void> {
  await ensureOrdersTable();
  await ensureTable("order_items", ORDER_ITEMS_DDL);
}

/**
 * Mirrors an order's `items` array into the order_items table. Replaces all
 * existing rows for the order — simpler than computing a diff, and the
 * cascade keeps things consistent if an order is deleted concurrently.
 * Best-effort; the kv_store + orders.payload.items remain the durable copy.
 */
// --- Customers rollup (m1_4) --------------------------------------------

/**
 * Customers are a derived rollup over orders + point-adjustments + loyalty
 * signups. Source-of-truth lives in those entities; the customers row is a
 * fast index into "lifetime stats for this phone". Maintained by
 * recomputeCustomerRollup which fires at the boundary of every event that
 * changes those source tables.
 */
const CUSTOMERS_DDL = [
  `CREATE TABLE IF NOT EXISTS customers (
    phone text PRIMARY KEY,
    name text,
    email text,
    birthday text,
    total_spent_grosze integer NOT NULL DEFAULT 0,
    order_count integer NOT NULL DEFAULT 0,
    first_order_at timestamptz,
    last_order_at timestamptz,
    loyalty_points_balance integer NOT NULL DEFAULT 0,
    manual_points_adjust integer NOT NULL DEFAULT 0,
    sms_optout boolean NOT NULL DEFAULT false,
    email_optout boolean NOT NULL DEFAULT false,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  // Gemini review feedback: storage migrated from text → boolean for the
  // optout flags. These ALTERs are safe to re-run; once the column is
  // already boolean PostgreSQL's "TYPE boolean USING (col::boolean)"
  // is a no-op cast.
  `ALTER TABLE customers ALTER COLUMN sms_optout DROP DEFAULT`,
  `ALTER TABLE customers ALTER COLUMN sms_optout TYPE boolean USING (sms_optout::boolean)`,
  `ALTER TABLE customers ALTER COLUMN sms_optout SET DEFAULT false`,
  `ALTER TABLE customers ALTER COLUMN email_optout DROP DEFAULT`,
  `ALTER TABLE customers ALTER COLUMN email_optout TYPE boolean USING (email_optout::boolean)`,
  `ALTER TABLE customers ALTER COLUMN email_optout SET DEFAULT false`,
  `CREATE INDEX IF NOT EXISTS customers_last_order_at_idx
    ON customers (last_order_at)`,
  `CREATE INDEX IF NOT EXISTS customers_email_idx ON customers (email)`,
];

async function ensureCustomersTable(): Promise<void> {
  await ensureTable("customers", CUSTOMERS_DDL);
}

export interface CustomerRollup {
  phone: string;
  name: string | null;
  email: string | null;
  birthday: string | null;
  totalSpentGrosze: number;
  orderCount: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  loyaltyPointsBalance: number;
  manualPointsAdjust: number;
  smsOptout: boolean;
  emailOptout: boolean;
  notes: string | null;
}

function rowToCustomer(row: typeof customersTable.$inferSelect): CustomerRollup {
  return {
    phone: row.phone,
    name: row.name,
    email: row.email,
    birthday: row.birthday,
    totalSpentGrosze: row.totalSpentGrosze,
    orderCount: row.orderCount,
    firstOrderAt: row.firstOrderAt ? row.firstOrderAt.toISOString() : null,
    lastOrderAt: row.lastOrderAt ? row.lastOrderAt.toISOString() : null,
    loyaltyPointsBalance: row.loyaltyPointsBalance,
    manualPointsAdjust: row.manualPointsAdjust,
    smsOptout: row.smsOptout,
    emailOptout: row.emailOptout,
    notes: row.notes,
  };
}

/**
 * Aggregates the source data and upserts the customer row. Best-effort —
 * never throws; legacy code paths that don't call this won't notice.
 *
 * Non-pending orders only count toward lifetime stats — a pending checkout
 * that abandons mid-payment shouldn't pollute the customer's history.
 */
async function recomputeCustomerRollup(rawPhone: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  const phone = normalizePlPhoneE164(rawPhone) ?? rawPhone;
  try {
    await ensureCustomersTable();

    // Source aggregations. getOrders already prefers the normalized table
    // (m1_2); getPointAdjustments + getLoyaltyMember stay on kv_store until
    // their own M1 entity migration ships.
    const [allOrders, adjustments, member] = await Promise.all([
      getOrders(),
      getPointAdjustments(),
      getLoyaltyMember(phone),
    ]);

    const myOrders = allOrders.filter(
      (o) => o.customerPhone && phonesEqualPl(o.customerPhone, phone) && o.status !== "pending",
    );
    const totalSpentGrosze = myOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const orderCount = myOrders.length;

    let firstOrderAt: Date | null = null;
    let lastOrderAt: Date | null = null;
    let latestName: string | undefined;
    for (const o of myOrders) {
      const t = new Date(o.paidAt || o.createdAt);
      if (!Number.isFinite(t.getTime())) continue;
      if (!firstOrderAt || t < firstOrderAt) firstOrderAt = t;
      if (!lastOrderAt || t > lastOrderAt) {
        lastOrderAt = t;
        latestName = o.customerName;
      }
    }

    const manualPointsAdjust = adjustments
      .filter((a) => phonesEqualPl(a.phone, phone))
      .reduce((sum, a) => sum + a.amount, 0);
    const earnedPoints = Math.floor(totalSpentGrosze / 100);
    // Phase 1 doesn't yet subtract redemptions here — that lands when
    // wallet-redemptions migrates to its table in m1_8. Earned + manual is
    // the right floor; the customer detail page still does the redemption
    // math live until then.
    const loyaltyPointsBalance = earnedPoints + manualPointsAdjust;

    const memberName = member
      ? [member.name, member.lastName].filter(Boolean).join(" ").trim() ||
        member.nickname ||
        null
      : null;

    const name = memberName || latestName || null;
    const email = member?.email ?? null;
    const birthday = member?.dob ?? null;

    const values = {
      phone,
      name,
      email,
      birthday,
      totalSpentGrosze,
      orderCount,
      firstOrderAt,
      lastOrderAt,
      loyaltyPointsBalance,
      manualPointsAdjust,
      updatedAt: new Date(),
    };

    await db
      .insert(customersTable)
      .values(values)
      .onConflictDoUpdate({
        target: customersTable.phone,
        set: values,
      });
  } catch (err) {
    logger.warn(
      "recomputeCustomerRollup failed",
      { phone, layer: "store.customers" },
      err,
    );
  }
}

/** Point lookup for the customer rollup. Returns null when no row exists yet. */
export async function getCustomer(rawPhone: string): Promise<CustomerRollup | null> {
  const db = getDb();
  if (!db) return null;
  const phone = normalizePlPhoneE164(rawPhone) ?? rawPhone;
  try {
    await ensureCustomersTable();
    const rows = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.phone, phone))
      .limit(1);
    if (rows.length === 0) return null;
    return rowToCustomer(rows[0]);
  } catch (err) {
    logger.warn(
      "getCustomer DB read failed",
      { phone, layer: "store.customers" },
      err,
    );
    return null;
  }
}

/** Bulk read for the admin customers list. */
export async function getCustomers(): Promise<CustomerRollup[]> {
  const db = getDb();
  if (!db) return [];
  try {
    await ensureCustomersTable();
    const rows = await db.select().from(customersTable);
    return rows.map(rowToCustomer);
  } catch (err) {
    logger.warn(
      "getCustomers DB read failed",
      { layer: "store.customers" },
      err,
    );
    return [];
  }
}

async function dualWriteOrderItems(order: Order): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await ensureOrderItemsTable();
    // Delete-then-insert keeps the upsert logic simple. Concurrency on the
    // same order is rare (typical lifecycle: create once, status updates
    // don't change items), and any rare race converges on the latest write.
    await db.delete(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
    if (order.items.length === 0) return;
    await db.insert(orderItemsTable).values(
      order.items.map((item, idx) => ({
        id: `${order.id}-li-${idx}`,
        orderId: order.id,
        menuItemId: item.menuItem.id,
        quantity: item.quantity,
        unitPriceGrosze: item.menuItem.price,
        notes: item.notes ?? null,
        modifiers: {},
      })),
    );
  } catch (err) {
    logger.warn(
      "dualWriteOrderItems failed (payload.items remains source of truth)",
      { orderId: order.id, layer: "store.order_items" },
      err,
    );
  }
}

type OrderRow = typeof ordersTable.$inferSelect;

/**
 * Anything we don't normalize into a column lives in `payload`. m1_3 will
 * pull `items` out into its own line-items table; for now items round-trip
 * through this jsonb blob.
 */
interface OrderPayload {
  items: Order["items"];
  specialInstructions?: Order["specialInstructions"];
  queuePosition?: Order["queuePosition"];
  estimatedReadyAt?: Order["estimatedReadyAt"];
  feedback?: Order["feedback"];
  qualityCheck?: Order["qualityCheck"];
  refund?: Order["refund"];
  dispute?: Order["dispute"];
  channel?: Order["channel"];
}

function rowToOrder(row: OrderRow): Order {
  const payload = (row.payload ?? {}) as OrderPayload;
  return {
    id: row.id,
    locationSlug: row.locationSlug,
    customerPhone: row.customerPhone,
    customerName: row.customerName,
    status: row.status as Order["status"],
    fulfillmentType: row.fulfillmentType as Order["fulfillmentType"],
    slotId: row.slotId,
    slotDate: row.slotDate,
    slotTime: row.slotTime,
    totalAmount: row.totalGrosze,
    tipAmount: row.tipGrosze ?? undefined,
    deliveryFee: row.deliveryFeeGrosze ?? undefined,
    assignedDriverId: row.assignedDriverId ?? undefined,
    stripeSessionId: row.stripeSessionId ?? undefined,
    stripePaymentIntentId: row.stripePaymentIntentId ?? undefined,
    deliveryAddress: row.deliveryAddress ?? undefined,
    createdAt: row.createdAt.toISOString(),
    paidAt: row.paidAt ? row.paidAt.toISOString() : undefined,
    items: payload.items ?? [],
    specialInstructions: payload.specialInstructions,
    queuePosition: payload.queuePosition,
    estimatedReadyAt: payload.estimatedReadyAt,
    feedback: payload.feedback,
    qualityCheck: payload.qualityCheck,
    refund: payload.refund,
    dispute: payload.dispute,
    channel: payload.channel,
  };
}

function orderToValues(order: Order) {
  const payload: OrderPayload = {
    items: order.items,
    specialInstructions: order.specialInstructions,
    queuePosition: order.queuePosition,
    estimatedReadyAt: order.estimatedReadyAt,
    feedback: order.feedback,
    qualityCheck: order.qualityCheck,
    refund: order.refund,
    dispute: order.dispute,
    channel: order.channel,
  };
  return {
    id: order.id,
    locationSlug: order.locationSlug,
    customerPhone: order.customerPhone,
    customerName: order.customerName,
    status: order.status,
    fulfillmentType: order.fulfillmentType,
    slotId: order.slotId,
    slotDate: order.slotDate,
    slotTime: order.slotTime,
    totalGrosze: order.totalAmount,
    tipGrosze: order.tipAmount ?? null,
    deliveryFeeGrosze: order.deliveryFee ?? null,
    assignedDriverId: order.assignedDriverId ?? null,
    stripeSessionId: order.stripeSessionId ?? null,
    stripePaymentIntentId: order.stripePaymentIntentId ?? null,
    deliveryAddress: order.deliveryAddress ?? null,
    createdAt: new Date(order.createdAt),
    paidAt: order.paidAt ? new Date(order.paidAt) : null,
    payload,
  };
}

async function dualWriteOrder(order: Order): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await ensureOrdersTable();
    const values = orderToValues(order);
    await db
      .insert(ordersTable)
      .values({ ...values, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: ordersTable.id,
        set: { ...values, updatedAt: new Date() },
      });
  } catch (err) {
    logger.warn(
      "dualWriteOrder failed (kv_store remains source of truth)",
      { orderId: order.id, layer: "store.orders" },
      err,
    );
    return;
  }
  // Line items track the parent order; only mirror them once the order row
  // is in place, otherwise the FK constraint would block the children.
  await dualWriteOrderItems(order);
}

async function dualDeleteOrder(id: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await ensureOrdersTable();
    await db.delete(ordersTable).where(eq(ordersTable.id, id));
  } catch (err) {
    logger.warn(
      "dualDeleteOrder failed",
      { orderId: id, layer: "store.orders" },
      err,
    );
  }
}

/**
 * Best-effort mirror into the legacy kv_store["orders.json"] blob. The
 * normalized `orders` table is the source of truth; this mirror only
 * matters for the dev/CI filesystem fallback and for any straggler code
 * path that still reads the legacy blob. Failures here are logged once
 * and forgotten.
 *
 * Lock is **global** on the shared key — Gemini code review (PR #38)
 * caught a race where two locations' scoped locks would each acquire
 * independently, read the same array, and overwrite each other on
 * write-back. The user-facing throughput gain still holds because the
 * primary path (`dualWriteOrder` → atomic INSERT on the normalized
 * table) is lock-free; this mirror runs as `void` from the caller and
 * never blocks the request.
 *
 * When kv_store["orders.json"] is fully drained (Phase 1 has no other
 * readers), delete the mirror entirely.
 */
async function mirrorOrderToKvStore(order: Order): Promise<void> {
  try {
    await withLock("orders.json", async () => {
      const orders = await readJSON<Order[]>("orders.json", []);
      const idx = orders.findIndex((o) => o.id === order.id);
      if (idx === -1) orders.push(order);
      else orders[idx] = order;
      await writeJSON("orders.json", orders);
    });
  } catch (err) {
    logger.warn(
      "mirrorOrderToKvStore failed (DB is source of truth, mirror skipped)",
      { orderId: order.id, locationSlug: order.locationSlug, layer: "store.orders" },
      err,
    );
  }
}

async function mirrorOrderDeleteToKvStore(id: string): Promise<void> {
  try {
    await withLock("orders.json", async () => {
      const orders = await readJSON<Order[]>("orders.json", []);
      const filtered = orders.filter((o) => o.id !== id);
      if (filtered.length !== orders.length) {
        await writeJSON("orders.json", filtered);
      }
    });
  } catch (err) {
    logger.warn(
      "mirrorOrderDeleteToKvStore failed",
      { orderId: id, layer: "store.orders" },
      err,
    );
  }
}

export async function getOrders(locationSlug?: string): Promise<Order[]> {
  const db = getDb();
  if (db) {
    try {
      await ensureOrdersTable();
      const rows = locationSlug
        ? await db
            .select()
            .from(ordersTable)
            .where(eq(ordersTable.locationSlug, locationSlug))
            .orderBy(desc(ordersTable.createdAt))
        : await db
            .select()
            .from(ordersTable)
            .orderBy(desc(ordersTable.createdAt));
      if (rows.length > 0) return rows.map(rowToOrder);
    } catch (err) {
      logger.warn(
        "getOrders DB read failed; falling back to kv_store",
        { layer: "store.orders" },
        err,
      );
    }
  }
  const orders = await readJSON<Order[]>("orders.json", []);
  const filtered = locationSlug
    ? orders.filter((o) => o.locationSlug === locationSlug)
    : orders;
  if (filtered.length > 0) {
    bumpLazyBackfillHit("orders");
    void Promise.all(filtered.map((o) => dualWriteOrder(o)));
  }
  return filtered;
}

/**
 * Phone-filtered order read. Uses the `orders_customer_phone_idx` index in
 * Postgres so a customer with N total orders out of an order table of size
 * M is O(N log M) instead of the O(M) scan that the in-memory filter does
 * on top of `getOrders()`. Falls back to the filesystem store + manual
 * filter when no DB is configured. Excludes `pending` orders by default
 * since callers (loyalty, attach-history, corporate pool) always do that.
 */
export async function getOrdersByPhone(
  phoneRaw: string,
  opts?: { sinceIso?: string; includePending?: boolean },
): Promise<Order[]> {
  const canonical = normalizePlPhoneE164(phoneRaw) || phoneRaw.trim();
  if (!canonical) return [];

  const db = getDb();
  if (db) {
    try {
      await ensureOrdersTable();
      const where = [eq(ordersTable.customerPhone, canonical)];
      if (!opts?.includePending) {
        where.push(ne(ordersTable.status, "pending"));
      }
      if (opts?.sinceIso) {
        where.push(gte(ordersTable.createdAt, new Date(opts.sinceIso)));
      }
      const rows = await db
        .select()
        .from(ordersTable)
        .where(and(...where))
        .orderBy(desc(ordersTable.createdAt));
      // Even when rows.length === 0 we trust the DB result — empty is a
      // valid answer for a phone with no past orders.
      return rows.map(rowToOrder);
    } catch (err) {
      logger.warn(
        "getOrdersByPhone DB read failed; falling back to kv_store",
        { layer: "store.orders" },
        err,
      );
    }
  }

  // Filesystem fallback — same in-memory filter the old call sites used.
  const orders = await readJSON<Order[]>("orders.json", []);
  const sinceMs = opts?.sinceIso ? new Date(opts.sinceIso).getTime() : -Infinity;
  return orders.filter(
    (o) =>
      o.customerPhone &&
      phonesEqualPl(o.customerPhone, canonical) &&
      (opts?.includePending || o.status !== "pending") &&
      new Date(o.createdAt).getTime() >= sinceMs,
  );
}

export async function getOrderById(id: string): Promise<Order | undefined> {
  const db = getDb();
  if (db) {
    try {
      await ensureOrdersTable();
      const rows = await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.id, id))
        .limit(1);
      if (rows.length > 0) return rowToOrder(rows[0]);
    } catch (err) {
      logger.warn(
        "getOrderById DB read failed; falling back to kv_store",
        { orderId: id, layer: "store.orders" },
        err,
      );
    }
  }
  const orders = await readJSON<Order[]>("orders.json", []);
  const hit = orders.find((o) => o.id === id);
  if (hit) {
    bumpLazyBackfillHit("orders");
    void dualWriteOrder(hit);
  }
  return hit;
}

/**
 * Find an order by its Stripe payment-intent id. Used by the dispute webhook
 * (the `Dispute` object references a `charge` + `payment_intent` but no
 * order-level metadata, so we lean on `stripePaymentIntentId` captured at
 * checkout-completed time).
 */
export async function getOrderByStripePaymentIntent(
  paymentIntentId: string,
): Promise<Order | undefined> {
  const db = getDb();
  if (db) {
    try {
      await ensureOrdersTable();
      const rows = await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.stripePaymentIntentId, paymentIntentId))
        .limit(1);
      if (rows.length > 0) return rowToOrder(rows[0]);
    } catch (err) {
      logger.warn(
        "getOrderByStripePaymentIntent DB read failed; falling back",
        { paymentIntentId, layer: "store.orders" },
        err,
      );
    }
  }
  const orders = await readJSON<Order[]>("orders.json", []);
  const hit = orders.find((o) => o.stripePaymentIntentId === paymentIntentId);
  if (hit) {
    bumpLazyBackfillHit("orders");
    void dualWriteOrder(hit);
  }
  return hit;
}

export async function createOrder(order: Order): Promise<Order> {
  // Audit §4 "Scalability (tech) — 300 orders/hour ceiling". Old shape
  // took a global `orders.json` lock and rewrote the entire orders array
  // on every insert — O(N) writes serialized across all locations *on
  // the request-blocking path*. The new shape:
  //   1. INSERT into the normalized `orders` table via dualWriteOrder —
  //      atomic on the PK, no application lock needed. This is the
  //      request-blocking path; the user waits for this.
  //   2. Mirror to the legacy kv_store["orders.json"] as fire-and-forget
  //      (`void`). The mirror takes a global lock on the shared blob
  //      (Gemini review on PR #38 caught the race when an earlier draft
  //      used a per-location key on the global file) but it's off the
  //      hot path so request latency is unaffected.
  //   3. When DB is unset (dev/CI), fall back to the legacy global-lock
  //      path so nothing breaks locally.
  const db = getDb();
  let saved: Order;
  if (db) {
    await dualWriteOrder(order); // primary path: normalized table is source of truth
    void mirrorOrderToKvStore(order);
    saved = order;
  } else {
    saved = await withLockScoped("orders", order.locationSlug, async () => {
      const orders = await readJSON<Order[]>("orders.json", []);
      orders.push(order);
      await writeJSON("orders.json", orders);
      return order;
    });
  }
  // Fire-and-forget rollup so the checkout request doesn't wait. A failure
  // here only means the customer's row is one order behind until the next
  // event refreshes it — non-blocking and idempotent.
  void recomputeCustomerRollup(order.customerPhone);
  emitOrderEvent({ kind: "created", orderId: order.id, locationSlug: order.locationSlug });
  incrCounter("orders.placed");
  // Fire KDS tickets (m2_2). Idempotent on (order_id, station_id) so
  // retried createOrder calls don't double-create.
  void fireKdsTickets(order);
  // Outbox: queue side effects (Phase 2 SMS/email/aggregator).
  // dedupeKey is just "placed" so retried createOrder calls converge on
  // one row rather than creating multiple identical events.
  await appendOutboxEvent({
    eventType: "order.placed",
    entityType: "order",
    entityId: order.id,
    dedupeKey: "placed",
    payload: {
      orderId: order.id,
      locationSlug: order.locationSlug,
      customerPhone: order.customerPhone,
      customerName: order.customerName,
      totalAmount: order.totalAmount,
    },
  });
  // Recipe-driven stock decrement (audit §3). Fire-and-forget so a
  // stock log hiccup never blocks a paid customer, but failures hit
  // Sentry through the helper's structured logging.
  void (async () => {
    const { consumeRecipeForOrder } = await import("@/lib/inventory-decrement");
    await consumeRecipeForOrder(order);
  })();
  return saved;
}

export async function updateOrderStatus(id: string, status: Order["status"]): Promise<Order | null> {
  // DB-first path: single UPDATE on the orders table, no global lock. The
  // kv_store mirror still updates under a per-location lock so two trucks
  // never contend. Reduces lock-key cardinality from 1 → N (number of
  // active locations) for the critical hot path.
  const db = getDb();
  let updated: Order | null = null;
  if (db) {
    try {
      await ensureOrdersTable();
      const rows = await db
        .update(ordersTable)
        .set({ status, updatedAt: new Date() })
        .where(eq(ordersTable.id, id))
        .returning();
      if (rows.length === 1) {
        updated = rowToOrder(rows[0]);
        void mirrorOrderToKvStore(updated);
      }
    } catch (err) {
      logger.warn(
        "updateOrderStatus DB update failed; falling back to kv path",
        { orderId: id, layer: "store.orders" },
        err,
      );
    }
  }
  if (!updated) {
    // Legacy fallback. The lock key here is global because we don't know
    // the locationSlug yet — but we only get here if the DB path failed
    // or DATABASE_URL is unset.
    updated = await withLock("orders.json", async () => {
      const orders = await readJSON<Order[]>("orders.json", []);
      const index = orders.findIndex((o) => o.id === id);
      if (index === -1) return null;
      orders[index].status = status;
      await writeJSON("orders.json", orders);
      await dualWriteOrder(orders[index]);
      return orders[index];
    });
  }
  if (updated) {
    // Pending → confirmed flips a checkout from "doesn't count" to
    // "counts" in lifetime stats; cancelled does the opposite. Both warrant
    // a rollup refresh.
    void recomputeCustomerRollup(updated.customerPhone);
    emitOrderEvent({
      kind: "status_changed",
      orderId: updated.id,
      locationSlug: updated.locationSlug,
      status,
    });
    // Outbox: status transitions that customers care about. dedupeKey
    // includes the status so a noop status flip can't create a duplicate
    // notification.
    incrCounter(`orders.status.${status}`);
    if (status === "ready" || status === "completed" || status === "cancelled") {
      await appendOutboxEvent({
        eventType: `order.${status}`,
        entityType: "order",
        entityId: updated.id,
        dedupeKey: status,
        payload: {
          orderId: updated.id,
          locationSlug: updated.locationSlug,
          customerPhone: updated.customerPhone,
          status,
        },
      });
    }
    // Cancellation returns the predicted ingredient draw to stock so
    // the variance report doesn't carry ghost consumption. Refund-by-
    // status (vs the refund API) uses the same path.
    if (status === "cancelled") {
      void (async () => {
        const { restoreRecipeForOrder } = await import("@/lib/inventory-decrement");
        await restoreRecipeForOrder(updated, "cancel");
      })();
    }
  }
  return updated;
}

/**
 * Patch arbitrary fields on an order. Used by the Stripe webhook (to capture
 * session / payment-intent ids) and by the refund flow (to attach the refund
 * record). Identity fields are stripped to prevent accidental rewrites.
 */
export async function updateOrder(
  id: string,
  patch: Partial<Omit<Order, "id" | "createdAt">>,
): Promise<Order | null> {
  const db = getDb();
  let updated: Order | null = null;
  if (db) {
    try {
      await ensureOrdersTable();
      // Read-update-return cycle on the row. We still need the read because
      // the payload jsonb merges with the patch fields and Drizzle doesn't
      // have a partial-jsonb-update primitive that preserves untouched keys.
      const existing = await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.id, id))
        .limit(1);
      if (existing.length === 1) {
        const merged: Order = { ...rowToOrder(existing[0]), ...patch };
        const values = orderToValues(merged);
        await db
          .update(ordersTable)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(ordersTable.id, id));
        await dualWriteOrderItems(merged);
        updated = merged;
        void mirrorOrderToKvStore(updated);
      }
    } catch (err) {
      logger.warn(
        "updateOrder DB update failed; falling back to kv path",
        { orderId: id, layer: "store.orders" },
        err,
      );
    }
  }
  if (!updated) {
    updated = await withLock("orders.json", async () => {
      const orders = await readJSON<Order[]>("orders.json", []);
      const index = orders.findIndex((o) => o.id === id);
      if (index === -1) return null;
      orders[index] = { ...orders[index], ...patch };
      await writeJSON("orders.json", orders);
      await dualWriteOrder(orders[index]);
      return orders[index];
    });
  }
  // Refresh the rollup when a patch could change lifetime stats. paidAt
  // pins the firstOrderAt/lastOrderAt timestamps; refund/dispute affect
  // future Phase 4 customer-health scoring. Status flips already trigger
  // a rollup through updateOrderStatus when called separately.
  if (
    updated &&
    (patch.paidAt !== undefined ||
      patch.refund !== undefined ||
      patch.dispute !== undefined ||
      patch.status !== undefined)
  ) {
    void recomputeCustomerRollup(updated.customerPhone);
  }
  if (updated) {
    emitOrderEvent({ kind: "updated", orderId: updated.id, locationSlug: updated.locationSlug });
    // Outbox: paidAt transition (checkout.session.completed webhook lands)
    // and refund are the customer-facing events that need durable side
    // effects. dispute is operator-facing only (no SMS/email to customer);
    // it's surfaced via Sentry from the webhook handler already.
    if (patch.paidAt !== undefined) {
      await appendOutboxEvent({
        eventType: "order.confirmed",
        entityType: "order",
        entityId: updated.id,
        dedupeKey: "confirmed",
        payload: {
          orderId: updated.id,
          locationSlug: updated.locationSlug,
          customerPhone: updated.customerPhone,
          paidAt: updated.paidAt,
        },
      });
    }
    if (patch.refund !== undefined) {
      await appendOutboxEvent({
        eventType: "order.refunded",
        entityType: "order",
        entityId: updated.id,
        // include the stripeRefundId so partial-refund-then-full-refund
        // emits two distinct events.
        dedupeKey: updated.refund?.stripeRefundId ?? `manual-${Date.now()}`,
        payload: {
          orderId: updated.id,
          locationSlug: updated.locationSlug,
          customerPhone: updated.customerPhone,
          refund: updated.refund,
        },
      });
    }
  }
  return updated;
}

export async function deleteOrder(id: string): Promise<boolean> {
  let slotId: string | undefined;
  let customerPhone: string | undefined;
  let locationSlug: string | undefined;
  let removed = false;

  const db = getDb();
  if (db) {
    try {
      await ensureOrdersTable();
      const rows = await db
        .delete(ordersTable)
        .where(eq(ordersTable.id, id))
        .returning();
      if (rows.length === 1) {
        const o = rowToOrder(rows[0]);
        slotId = o.slotId;
        customerPhone = o.customerPhone;
        locationSlug = o.locationSlug;
        removed = true;
        void mirrorOrderDeleteToKvStore(id);
      }
    } catch (err) {
      logger.warn(
        "deleteOrder DB delete failed; falling back to kv path",
        { orderId: id, layer: "store.orders" },
        err,
      );
    }
  }
  if (!removed) {
    removed = await withLock("orders.json", async () => {
      const orders = await readJSON<Order[]>("orders.json", []);
      const index = orders.findIndex((o) => o.id === id);
      if (index === -1) return false;
      slotId = orders[index].slotId;
      customerPhone = orders[index].customerPhone;
      locationSlug = orders[index].locationSlug;
      orders.splice(index, 1);
      await writeJSON("orders.json", orders);
      await dualDeleteOrder(id);
      return true;
    });
  }
  if (removed) {
    if (slotId) {
      await decrementSlotOrders(slotId);
    }
    await removeNotificationsForOrder(id);
    if (customerPhone) {
      // Lifetime stats drop one order on this delete — refresh the rollup.
      void recomputeCustomerRollup(customerPhone);
    }
    if (locationSlug) {
      emitOrderEvent({ kind: "deleted", orderId: id, locationSlug });
    }
  }
  return removed;
}

// --- Cart presence (optional live “spy” for kitchen; see cart-presence-config) ---

const CART_PRESENCE_TTL_MS = 3 * 60 * 1000;
const CART_PRESENCE_RL_MS = 2000;
const CART_PRESENCE_RL_KEY = "cart_presence_rl.json";

function cartPresenceStorageKey(locationSlug: string): string {
  return `cart_presence_${locationSlug}.json`;
}

export type CartPresenceLine = { id: string; quantity: number };

export type CartPresenceRow = {
  visitorId: string;
  items: CartPresenceLine[];
  totalCents: number;
  lastSeenAt: number;
};

type CartPresenceFile = Record<
  string,
  {
    items: CartPresenceLine[];
    totalCents: number;
    updatedAt: number;
  }
>;

function pruneStalePresence(map: CartPresenceFile, now: number): CartPresenceFile {
  const out: CartPresenceFile = {};
  for (const [visitorId, row] of Object.entries(map)) {
    if (now - row.updatedAt > CART_PRESENCE_TTL_MS) continue;
    if (!row.items?.length) continue;
    out[visitorId] = row;
  }
  return out;
}

export async function getCartPresenceForLocation(locationSlug: string): Promise<CartPresenceRow[]> {
  const redis = getUpstashRedis();
  if (redis) {
    return getCartPresenceForLocationRedis(redis, locationSlug);
  }

  const key = cartPresenceStorageKey(locationSlug);
  const raw = await readJSON<CartPresenceFile>(key, {});
  const now = Date.now();
  const pruned = pruneStalePresence(raw, now);
  if (Object.keys(pruned).length !== Object.keys(raw).length) {
    await writeJSON(key, pruned);
  }
  return Object.entries(pruned)
    .map(([visitorId, v]) => ({
      visitorId,
      items: v.items,
      totalCents: v.totalCents,
      lastSeenAt: v.updatedAt,
    }))
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

export type UpsertCartPresenceResult = "ok" | "rate_limited";

export async function upsertCartPresence(
  locationSlug: string,
  visitorId: string,
  items: CartPresenceLine[],
  totalCents: number
): Promise<UpsertCartPresenceResult> {
  const redis = getUpstashRedis();
  if (redis) {
    return upsertCartPresenceRedis(redis, locationSlug, visitorId, items, totalCents);
  }

  const allowed = await withLock(CART_PRESENCE_RL_KEY, async () => {
    const now = Date.now();
    const map = await readJSON<Record<string, number>>(CART_PRESENCE_RL_KEY, {});
    const last = map[visitorId] ?? 0;
    if (now - last < CART_PRESENCE_RL_MS) return false;
    map[visitorId] = now;
    const cutoff = now - 60 * 60 * 1000;
    for (const k of Object.keys(map)) {
      if ((map[k] ?? 0) < cutoff) delete map[k];
    }
    await writeJSON(CART_PRESENCE_RL_KEY, map);
    return true;
  });
  if (!allowed) return "rate_limited";

  const key = cartPresenceStorageKey(locationSlug);
  await withLock(key, async () => {
    const now = Date.now();
    const raw = await readJSON<CartPresenceFile>(key, {});
    const next = pruneStalePresence(raw, now);
    if (items.length === 0) {
      delete next[visitorId];
    } else {
      next[visitorId] = {
        items,
        totalCents,
        updatedAt: now,
      };
    }
    await writeJSON(key, next);
  });
  return "ok";
}

/** True if slug is an active location (cart presence only for open locations). */
export function isActiveLocationSlug(slug: string): boolean {
  return getActiveLocations().some((l) => l.slug === slug);
}

// --- Analytics ---

export interface DailyStats {
  date: string;
  revenue: number;
  cost: number;
  profit: number;
  orderCount: number;
  itemCount: number;
  avgOrderValue: number;
  takeoutCount: number;
  deliveryCount: number;
  categoryBreakdown: Record<string, { revenue: number; cost: number; count: number }>;
  topItems: { name: string; quantity: number; revenue: number }[];
}

export async function getAnalytics(
  locationSlug?: string,
  dateFrom?: string,
  dateTo?: string
): Promise<DailyStats[]> {
  const orders = (await getOrders(locationSlug)).filter(
    (o) => o.status !== "pending"
  );

  const byDate = new Map<string, Order[]>();
  for (const order of orders) {
    const date = order.slotDate || order.createdAt.split("T")[0];
    if (dateFrom && date < dateFrom) continue;
    if (dateTo && date > dateTo) continue;
    const list = byDate.get(date) || [];
    list.push(order);
    byDate.set(date, list);
  }

  const stats: DailyStats[] = [];

  for (const [date, dayOrders] of byDate) {
    let revenue = 0;
    let cost = 0;
    let itemCount = 0;
    let takeoutCount = 0;
    let deliveryCount = 0;
    const categoryMap: Record<string, { revenue: number; cost: number; count: number }> = {};
    const itemMap = new Map<string, { name: string; quantity: number; revenue: number }>();

    for (const order of dayOrders) {
      revenue += order.totalAmount;
      if (order.fulfillmentType === "takeout") takeoutCount++;
      else deliveryCount++;

      for (const ci of order.items) {
        const itemCost = (ci.menuItem.cost || 0) * ci.quantity;
        cost += itemCost;
        itemCount += ci.quantity;

        const cat = ci.menuItem.category;
        if (!categoryMap[cat]) categoryMap[cat] = { revenue: 0, cost: 0, count: 0 };
        categoryMap[cat].revenue += ci.menuItem.price * ci.quantity;
        categoryMap[cat].cost += itemCost;
        categoryMap[cat].count += ci.quantity;

        const existing = itemMap.get(ci.menuItem.id);
        if (existing) {
          existing.quantity += ci.quantity;
          existing.revenue += ci.menuItem.price * ci.quantity;
        } else {
          itemMap.set(ci.menuItem.id, {
            name: ci.menuItem.name,
            quantity: ci.quantity,
            revenue: ci.menuItem.price * ci.quantity,
          });
        }
      }
    }

    const topItems = Array.from(itemMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    stats.push({
      date,
      revenue,
      cost,
      profit: revenue - cost,
      orderCount: dayOrders.length,
      itemCount,
      avgOrderValue: dayOrders.length > 0 ? Math.round(revenue / dayOrders.length) : 0,
      takeoutCount,
      deliveryCount,
      categoryBreakdown: categoryMap,
      topItems,
    });
  }

  stats.sort((a, b) => a.date.localeCompare(b.date));
  return stats;
}

export interface SummaryStats {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  profitMargin: number;
  totalOrders: number;
  totalItems: number;
  avgOrderValue: number;
  takeoutCount: number;
  deliveryCount: number;
  dailyStats: DailyStats[];
  categoryBreakdown: Record<string, { revenue: number; cost: number; count: number }>;
  topItems: { name: string; quantity: number; revenue: number }[];
}

export async function getSummary(
  locationSlug?: string,
  dateFrom?: string,
  dateTo?: string
): Promise<SummaryStats> {
  const dailyStats = await getAnalytics(locationSlug, dateFrom, dateTo);

  let totalRevenue = 0;
  let totalCost = 0;
  let totalOrders = 0;
  let totalItems = 0;
  let takeoutCount = 0;
  let deliveryCount = 0;
  const categoryMap: Record<string, { revenue: number; cost: number; count: number }> = {};
  const itemMap = new Map<string, { name: string; quantity: number; revenue: number }>();

  for (const day of dailyStats) {
    totalRevenue += day.revenue;
    totalCost += day.cost;
    totalOrders += day.orderCount;
    totalItems += day.itemCount;
    takeoutCount += day.takeoutCount;
    deliveryCount += day.deliveryCount;

    for (const [cat, data] of Object.entries(day.categoryBreakdown)) {
      if (!categoryMap[cat]) categoryMap[cat] = { revenue: 0, cost: 0, count: 0 };
      categoryMap[cat].revenue += data.revenue;
      categoryMap[cat].cost += data.cost;
      categoryMap[cat].count += data.count;
    }

    for (const item of day.topItems) {
      const existing = itemMap.get(item.name);
      if (existing) {
        existing.quantity += item.quantity;
        existing.revenue += item.revenue;
      } else {
        itemMap.set(item.name, { ...item });
      }
    }
  }

  const topItems = Array.from(itemMap.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);

  return {
    totalRevenue,
    totalCost,
    totalProfit: totalRevenue - totalCost,
    profitMargin: totalRevenue > 0 ? Math.round(((totalRevenue - totalCost) / totalRevenue) * 100) : 0,
    totalOrders,
    totalItems,
    avgOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
    takeoutCount,
    deliveryCount,
    dailyStats,
    categoryBreakdown: categoryMap,
    topItems,
  };
}

// --- Insights ---

export interface SlotUtilization {
  time: string;
  totalCapacity: number;
  totalUsed: number;
  utilization: number; // 0-100
  slotCount: number;
}

export interface LocationComparison {
  locationSlug: string;
  city: string;
  revenue: number;
  profit: number;
  profitMargin: number;
  orderCount: number;
  avgOrderValue: number;
  totalItems: number;
  avgItemsPerOrder: number;
  takeoutCount: number;
  deliveryCount: number;
  cancelledCount: number;
  cancellationRate: number;
}

export interface CustomerMetric {
  name: string;
  phone: string;
  orderCount: number;
  totalSpent: number;
  lastOrderDate: string;
}

export interface InsightsData {
  slotUtilization: SlotUtilization[];
  locationComparison: LocationComparison[];
  repeatCustomers: CustomerMetric[];
  avgItemsPerOrder: number;
  /** Best-selling SKUs in the period (by quantity). */
  topSellers: { name: string; quantity: number; revenue: number }[];
  /** Slowest movers — only when at least 2 different menu items sold (otherwise empty). */
  worstSellers: { name: string; quantity: number; revenue: number }[];
  cancelledOrders: number;
  cancellationRate: number;
  peakHours: { hour: number; orderCount: number; revenue: number }[];
}

export async function getInsights(dateFrom?: string, dateTo?: string): Promise<InsightsData> {
  const allSlots = await readJSON<TimeSlot[]>("slots.json", []);
  const allOrders = await readJSON<Order[]>("orders.json", []);

  // Filter by date range
  const slots = allSlots.filter((s) => {
    if (dateFrom && s.date < dateFrom) return false;
    if (dateTo && s.date > dateTo) return false;
    return true;
  });

  const orders = allOrders.filter((o) => {
    const date = o.slotDate || o.createdAt.split("T")[0];
    if (dateFrom && date < dateFrom) return false;
    if (dateTo && date > dateTo) return false;
    return true;
  });

  // --- Slot utilization by time ---
  const byTime = new Map<string, { capacity: number; used: number; count: number }>();
  for (const slot of slots) {
    if ((slot.status ?? "active") !== "active") continue;
    const existing = byTime.get(slot.time) || { capacity: 0, used: 0, count: 0 };
    existing.capacity += slot.maxOrders;
    existing.used += slot.currentOrders;
    existing.count += 1;
    byTime.set(slot.time, existing);
  }
  const slotUtilization: SlotUtilization[] = Array.from(byTime.entries())
    .map(([time, d]) => ({
      time,
      totalCapacity: d.capacity,
      totalUsed: d.used,
      utilization: d.capacity > 0 ? Math.round((d.used / d.capacity) * 100) : 0,
      slotCount: d.count,
    }))
    .sort((a, b) => a.time.localeCompare(b.time));

  // --- Location comparison ---
  const activeLocations = allLocations.filter((l) => l.isActive);
  const locationComparison: LocationComparison[] = [];

  for (const loc of activeLocations) {
    const locOrders = orders.filter((o) => o.locationSlug === loc.slug);
    // Revenue / KPIs: exclude unpaid queue (pending) and voided orders (cancelled)
    const completed = locOrders.filter(
      (o) => o.status !== "pending" && o.status !== "cancelled"
    );
    const cancelled = locOrders.filter((o) => o.status === "cancelled");
    let revenue = 0;
    let cost = 0;
    let totalItems = 0;
    let takeout = 0;
    let delivery = 0;

    for (const order of completed) {
      revenue += order.totalAmount;
      if (order.fulfillmentType === "takeout") takeout++;
      else delivery++;
      for (const ci of order.items) {
        cost += (ci.menuItem.cost || 0) * ci.quantity;
        totalItems += ci.quantity;
      }
    }

    locationComparison.push({
      locationSlug: loc.slug,
      city: loc.city,
      revenue,
      profit: revenue - cost,
      profitMargin: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 100) : 0,
      orderCount: completed.length,
      avgOrderValue: completed.length > 0 ? Math.round(revenue / completed.length) : 0,
      totalItems,
      avgItemsPerOrder: completed.length > 0 ? Math.round((totalItems / completed.length) * 10) / 10 : 0,
      takeoutCount: takeout,
      deliveryCount: delivery,
      cancelledCount: cancelled.length,
      cancellationRate: locOrders.length > 0 ? Math.round((cancelled.length / locOrders.length) * 100) : 0,
    });
  }

  // --- Repeat customers ---
  const customerMap = new Map<string, CustomerMetric>();
  for (const order of orders) {
    const key = normalizePlPhoneE164(order.customerPhone) ?? order.customerPhone;
    const existing = customerMap.get(key);
    if (existing) {
      existing.orderCount += 1;
      existing.totalSpent += order.totalAmount;
      if (order.createdAt > existing.lastOrderDate) {
        existing.lastOrderDate = order.createdAt;
        existing.name = order.customerName;
      }
    } else {
      customerMap.set(key, {
        name: order.customerName,
        phone: order.customerPhone,
        orderCount: 1,
        totalSpent: order.totalAmount,
        lastOrderDate: order.createdAt,
      });
    }
  }
  const repeatCustomers = Array.from(customerMap.values())
    .filter((c) => c.orderCount > 1)
    .sort((a, b) => b.orderCount - a.orderCount)
    .slice(0, 10);

  // --- Avg items per order ---
  const completedOrders = orders.filter(
    (o) => o.status !== "pending" && o.status !== "cancelled"
  );
  let totalItemsAll = 0;
  for (const o of completedOrders) {
    for (const ci of o.items) totalItemsAll += ci.quantity;
  }
  const avgItemsPerOrder = completedOrders.length > 0
    ? Math.round((totalItemsAll / completedOrders.length) * 10) / 10
    : 0;

  // --- Worst sellers (all items, sorted ascending by quantity) ---
  const itemSales = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const order of completedOrders) {
    for (const ci of order.items) {
      const existing = itemSales.get(ci.menuItem.id);
      if (existing) {
        existing.quantity += ci.quantity;
        existing.revenue += ci.menuItem.price * ci.quantity;
      } else {
        itemSales.set(ci.menuItem.id, {
          name: ci.menuItem.name,
          quantity: ci.quantity,
          revenue: ci.menuItem.price * ci.quantity,
        });
      }
    }
  }
  const salesList = Array.from(itemSales.values());
  const topSellers = [...salesList]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);
  // "Worst" only when there is another SKU to compare against
  const worstSellers =
    itemSales.size >= 2
      ? [...salesList].sort((a, b) => a.quantity - b.quantity).slice(0, 5)
      : [];

  // --- Cancellation rate (actual cancelled status, not "pending" new orders) ---
  const cancelled = orders.filter((o) => o.status === "cancelled");
  const cancellationRate =
    orders.length > 0 ? Math.round((cancelled.length / orders.length) * 100) : 0;

  // --- Peak hours ---
  const hourMap = new Map<number, { count: number; revenue: number }>();
  for (const order of completedOrders) {
    const hour = parseInt(order.slotTime?.split(":")[0] || "0", 10);
    const existing = hourMap.get(hour) || { count: 0, revenue: 0 };
    existing.count += 1;
    existing.revenue += order.totalAmount;
    hourMap.set(hour, existing);
  }
  const peakHours = Array.from(hourMap.entries())
    .map(([hour, d]) => ({ hour, orderCount: d.count, revenue: d.revenue }))
    .sort((a, b) => a.hour - b.hour);

  return {
    slotUtilization,
    locationComparison,
    repeatCustomers,
    avgItemsPerOrder,
    topSellers,
    worstSellers,
    cancelledOrders: cancelled.length,
    cancellationRate,
    peakHours,
  };
}

// --- Notifications ---

/**
 * Structured payload attached to a notification when callers want to drive
 * push templates (and future surfaces) without re-parsing the `message`
 * string. All fields optional + backwards-compatible — legacy rows skip
 * the field and downstream consumers fall back to the message regex.
 */
export interface NotificationData {
  customerName?: string;
  totalGrosze?: number;
  slotTime?: string;
  varianceGrosze?: number;
  ingredientCount?: number;
  itemName?: string;
  actor?: string;
}

export interface Notification {
  id: string;
  type:
    | "new_order"
    | "slot_full"
    | "daily_summary"
    | "low_slots"
    | "order_status"
    | "bundle_low_margin"
    | "dispute"
    | "low_stock";
  title: string;
  message: string;
  locationSlug?: string;
  /** When set (e.g. new_order), removed when the order is deleted from admin. */
  orderId?: string;
  /** Structured payload for downstream surfaces (push, future filters). */
  data?: NotificationData;
  createdAt: string;
  read: boolean;
}

export async function getNotifications(): Promise<Notification[]> {
  return readJSON<Notification[]>("notifications.json", []);
}

export async function addNotification(notif: Omit<Notification, "id" | "createdAt" | "read">): Promise<Notification> {
  const entry = await withLock("notifications.json", async () => {
    const notifications = await readJSON<Notification[]>("notifications.json", []);
    const e: Notification = {
      ...notif,
      id: `notif-${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
      read: false,
    };
    notifications.unshift(e);
    if (notifications.length > 100) notifications.length = 100;
    await writeJSON("notifications.json", notifications);
    return e;
  });

  // Fan out to subscribed admin devices (when VAPID keys are configured).
  // Dynamic import so the push module isn't pulled into the customer-facing
  // bundle, and so a push failure can never block the notification write.
  fanOutAdminPush(entry).catch((err) => {
    logger.warn("admin.push.fanout_failed", { layer: "store", type: entry.type }, err);
  });

  return entry;
}

async function fanOutAdminPush(n: Notification): Promise<void> {
  // Only fire for types operators want to be paged on. Daily_summary is
  // intentionally excluded — it's an EOD digest, no need to wake anyone.
  if (n.type === "daily_summary") return;
  const { pushToAdmins, ADMIN_PUSH_TEMPLATES, adminPushCategoryEnabled } =
    await import("@/lib/admin-push");
  if (!adminPushCategoryEnabled(n.type)) return;
  const t = ADMIN_PUSH_TEMPLATES;
  // Prefer structured data; fall back to regex over the human message for
  // legacy rows. The regex paths stay as a defensive backstop, not the
  // primary parser.
  const data = n.data ?? {};
  const customerName =
    data.customerName ?? n.message.split(" · ")[0] ?? "Someone";
  const totalZl =
    typeof data.totalGrosze === "number"
      ? `${(data.totalGrosze / 100).toFixed(2)} zł`
      : (n.message.match(/(\d+(?:\.\d+)?\s*zł)/i)?.[1] ?? "—");
  const slotTime =
    data.slotTime ?? n.message.match(/(\d{2}:\d{2})/)?.[1] ?? n.title;
  const varianceZl =
    typeof data.varianceGrosze === "number"
      ? `${data.varianceGrosze >= 0 ? "+" : ""}${(data.varianceGrosze / 100).toFixed(2)} zł`
      : null;

  const message =
    n.type === "new_order" && n.orderId
      ? t.newOrder(n.orderId, customerName, totalZl)
      : n.type === "slot_full" && n.locationSlug
        ? t.slotFull(n.locationSlug, slotTime)
        : n.type === "low_slots" && n.locationSlug
          ? t.slotPressure(n.locationSlug, slotTime)
          : n.type === "dispute" && n.orderId
            ? t.disputeOpened(n.orderId, totalZl)
            : n.type === "low_stock" && n.locationSlug
              ? t.lowStock(n.locationSlug, data.ingredientCount ?? 1)
              : n.type === "bundle_low_margin"
                ? {
                    title: n.title,
                    body: n.message,
                    url: "/admin/upsell",
                    tag: `admin:${n.type}`,
                  }
                : {
                    title: n.title,
                    body: n.message,
                    url: "/admin",
                    tag: `admin:${n.type}`,
                  };
  await pushToAdmins(message, {
    category: n.type,
    varianceGrosze: data.varianceGrosze,
  } as { category: typeof n.type; varianceGrosze?: number });
}

export async function markNotificationRead(id: string): Promise<boolean> {
  return withLock("notifications.json", async () => {
    const notifications = await readJSON<Notification[]>("notifications.json", []);
    const notif = notifications.find((n) => n.id === id);
    if (!notif) return false;
    notif.read = true;
    await writeJSON("notifications.json", notifications);
    return true;
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  return withLock("notifications.json", async () => {
    const notifications = await readJSON<Notification[]>("notifications.json", []);
    for (const n of notifications) n.read = true;
    await writeJSON("notifications.json", notifications);
  });
}

export async function deleteNotification(id: string): Promise<boolean> {
  return withLock("notifications.json", async () => {
    const notifications = await readJSON<Notification[]>("notifications.json", []);
    const idx = notifications.findIndex((n) => n.id === id);
    if (idx === -1) return false;
    notifications.splice(idx, 1);
    await writeJSON("notifications.json", notifications);
    return true;
  });
}

/** True if this notification is for the given order (stored id and/or order id in message for legacy rows). */
function notificationMatchesOrder(n: Notification, orderId: string): boolean {
  if (!orderId) return false;
  if (n.orderId === orderId) return true;
  if (n.type === "new_order" && n.message.includes(orderId)) return true;
  return false;
}

/** Drop notifications tied to an order (by orderId field and/or message text for legacy rows). */
export async function removeNotificationsForOrder(orderId: string): Promise<number> {
  return withLock("notifications.json", async () => {
    const notifications = await readJSON<Notification[]>("notifications.json", []);
    const before = notifications.length;
    const next = notifications.filter((n) => !notificationMatchesOrder(n, orderId));
    await writeJSON("notifications.json", next);
    return before - next.length;
  });
}

const ORDER_ID_IN_MESSAGE = /SI-[A-Z0-9]+-[A-Z0-9]+/gi;

/**
 * Remove new_order notifications that don't reference any existing order
 * (missing/stale orderId, or SI-… in message not in orders list).
 */
export async function pruneOrphanNewOrderNotifications(): Promise<number> {
  const orders = await getOrders();
  const orderIds = new Set(orders.map((o) => o.id.toUpperCase()));

  return withLock("notifications.json", async () => {
    const notifications = await readJSON<Notification[]>("notifications.json", []);
    const before = notifications.length;

    const next = notifications.filter((n) => {
      if (n.type !== "new_order") return true;

      if (n.orderId?.trim() && orderIds.has(n.orderId.toUpperCase())) {
        return true;
      }

      const refs = n.message.match(ORDER_ID_IN_MESSAGE) || [];
      const unique = [...new Set(refs.map((r) => r.toUpperCase()))];
      for (const ref of unique) {
        if (orderIds.has(ref)) return true;
      }

      return false;
    });

    await writeJSON("notifications.json", next);
    return before - next.length;
  });
}

export async function getUnreadCount(): Promise<number> {
  return (await getNotifications()).filter((n) => !n.read).length;
}

// --- Menu Overrides ---
// Stores admin-made changes to menu items (price, availability, etc.)
// These get merged on top of the hardcoded menu data.

export interface MenuOverride {
  price?: number;
  cost?: number;
  available?: boolean;
  name?: string;
  description?: string;
  /** Operator-facing inventory code (audit §4.3 — every product has all
   *  fields editable). `null` clears back to the seed sku. */
  sku?: string | null;
  /** Per-location category override. Lets operators relabel a seed item
   *  (e.g. promote a drink to antipasti for a new menu organization)
   *  without a code deploy. `null` clears back to seed. */
  category?: import("@/data/types").MenuCategory | null;
  /** Per-location dietary tag override. Replaces the seed tag array
   *  entirely. `null` clears back to seed. */
  tags?: ("vegetarian" | "vegan" | "spicy" | "gluten-free")[] | null;
  /**
   * Audit §4.3 menu engineering role. Stored as a string so the override
   * file is forward-compatible with new roles. `null` means "clear the base
   * role" (e.g. demote the Margherita from hero) — `getMenuWithOverrides`
   * deletes the field instead of merging when it sees null.
   */
  menuRole?: "hero" | "profit-driver" | "anchor" | "lto" | null;
  /** Audit §4.3 LTO flag. `null` = clear (force off). */
  isLimited?: boolean | null;
  /** ISO date `YYYY-MM-DD` for the LTO countdown. `null` = clear. */
  limitedUntil?: string | null;
  /**
   * Phase 3 m3_6 menu lockdown: when true, only the brand owner can edit
   * this item. Franchisees can only override price within a configured
   * window (default ±15%). When false / unset, franchisees can manage
   * the item fully under their banner.
   */
  locked?: boolean;
  /**
   * Phase 3 m3_6: maximum franchisee price delta from the corporate
   * price, in basis points. 1500 = ±15%. Only consulted when `locked`
   * is true.
   */
  franchiseePriceMaxDeltaBps?: number;
  /** Audit §3 channel economics — when true, the item only surfaces on
   *  delivery carts. `null` = clear back to seed (force the seed flag
   *  off, e.g. demote a pantry SKU back to dine-in availability). */
  deliveryOnly?: boolean | null;
  /** Audit §3 — per-unit packaging cost in grosze for delivery. Lets
   *  operators tune box/napkin cost per SKU (a Family Feast box costs
   *  more than a slice wrap). `null` = clear back to category default
   *  in `CATEGORY_PACKAGING_COST_FALLBACK`. */
  packagingCost?: number | null;
  /** Audit §3 — modifier groups (Crust, Premium toppings, Spice level).
   *  Full structure round-trips so the override CAN replace the seed
   *  modifiers entirely. `null` = clear, falls back to whatever the
   *  static menu data ships with. Empty array = no modifiers (overrides
   *  the seed off). */
  modifierGroups?: import("@/data/types").ModifierGroup[] | null;
  /** Soft-delete flag for seed items. When `true` the row is filtered
   *  out of both the customer menu (`getMenuWithOverrides`) and the
   *  default admin list. Hard-deleting a seed row isn't possible (lives
   *  in code), so this is the closest operational primitive. `null` /
   *  unset = visible. Restoreable via the admin "Show hidden" toggle. */
  hidden?: boolean | null;
}

export async function getMenuOverrides(): Promise<Record<string, MenuOverride>> {
  return readJSON<Record<string, MenuOverride>>("menu-overrides.json", {});
}

export async function setMenuOverride(itemId: string, override: MenuOverride): Promise<void> {
  return withLock("menu-overrides.json", async () => {
    const overrides = await readJSON<Record<string, MenuOverride>>("menu-overrides.json", {});
    overrides[itemId] = { ...overrides[itemId], ...override };
    await writeJSON("menu-overrides.json", overrides);
  });
}

export async function setMenuOverridesBulk(updates: Record<string, MenuOverride>): Promise<void> {
  return withLock("menu-overrides.json", async () => {
    const overrides = await readJSON<Record<string, MenuOverride>>("menu-overrides.json", {});
    for (const [id, update] of Object.entries(updates)) {
      overrides[id] = { ...overrides[id], ...update };
    }
    await writeJSON("menu-overrides.json", overrides);
  });
}

/** Drop the override rows for the given menu-item ids, reverting them to
 *  the static seed values. Used by the AdminMenu "Reset overrides" bulk
 *  action. Returns the count of rows actually removed. */
export async function clearMenuOverrides(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  return withLock("menu-overrides.json", async () => {
    const overrides = await readJSON<Record<string, MenuOverride>>("menu-overrides.json", {});
    let removed = 0;
    for (const id of ids) {
      if (id in overrides) {
        delete overrides[id];
        removed++;
      }
    }
    if (removed > 0) await writeJSON("menu-overrides.json", overrides);
    return removed;
  });
}

// --- Custom menu items ---
//
// Admin-created menu items that live alongside the static seed menu data
// in src/data/menus/*.ts. The seed menu stays canonical for product/menu
// engineering decisions (hero, anchor, etc.); custom items let operators
// add LTOs, regional one-offs, and franchisee-only SKUs without a code
// deploy. Each row carries its locationSlug so they're scoped to a single
// truck — they never bleed across.
//
// IDs are admin-supplied (slug-style); the API rejects collisions with
// either the seed catalogue or existing custom rows so the merge in
// getMenuWithOverrides() is deterministic.

export interface CustomMenuItem extends MenuItem {
  locationSlug: string;
  /** ISO timestamp for sort + audit. */
  createdAt: string;
  /** Last edit timestamp. Same shape as createdAt. */
  updatedAt: string;
}

export async function getCustomMenuItems(locationSlug?: string): Promise<CustomMenuItem[]> {
  const all = await readJSON<CustomMenuItem[]>("custom-menu-items.json", []);
  if (!locationSlug) return all;
  return all.filter((i) => i.locationSlug === locationSlug);
}

export async function addCustomMenuItem(item: CustomMenuItem): Promise<void> {
  return withLock("custom-menu-items.json", async () => {
    const all = await readJSON<CustomMenuItem[]>("custom-menu-items.json", []);
    if (all.some((i) => i.id === item.id)) {
      throw new Error(`Custom item with id "${item.id}" already exists`);
    }
    all.push(item);
    await writeJSON("custom-menu-items.json", all);
  });
}

export async function updateCustomMenuItem(
  id: string,
  patch: Partial<Omit<CustomMenuItem, "id" | "locationSlug" | "createdAt">>,
): Promise<CustomMenuItem | null> {
  return withLock("custom-menu-items.json", async () => {
    const all = await readJSON<CustomMenuItem[]>("custom-menu-items.json", []);
    const idx = all.findIndex((i) => i.id === id);
    if (idx === -1) return null;
    const merged: CustomMenuItem = {
      ...all[idx],
      ...patch,
      id: all[idx].id,
      locationSlug: all[idx].locationSlug,
      createdAt: all[idx].createdAt,
      updatedAt: new Date().toISOString(),
    };
    all[idx] = merged;
    await writeJSON("custom-menu-items.json", all);
    return merged;
  });
}

export async function deleteCustomMenuItem(id: string): Promise<boolean> {
  return withLock("custom-menu-items.json", async () => {
    const all = await readJSON<CustomMenuItem[]>("custom-menu-items.json", []);
    const next = all.filter((i) => i.id !== id);
    if (next.length === all.length) return false;
    await writeJSON("custom-menu-items.json", next);
    return true;
  });
}

/** Rename a custom menu item by changing its `id` in place. Throws when
 *  the new id collides with another custom row; callers are responsible
 *  for checking against the seed catalogue separately. Order history
 *  retains the old id (operationally acceptable per product call). */
export async function renameCustomMenuItem(
  oldId: string,
  newId: string,
): Promise<CustomMenuItem | null> {
  return withLock("custom-menu-items.json", async () => {
    const all = await readJSON<CustomMenuItem[]>("custom-menu-items.json", []);
    const idx = all.findIndex((i) => i.id === oldId);
    if (idx === -1) return null;
    if (all.some((i, j) => j !== idx && i.id === newId)) {
      throw new Error(`Custom item with id "${newId}" already exists`);
    }
    const renamed: CustomMenuItem = {
      ...all[idx],
      id: newId,
      updatedAt: new Date().toISOString(),
    };
    all[idx] = renamed;
    await writeJSON("custom-menu-items.json", all);
    return renamed;
  });
}

// --- Settings ---

export interface AppSettings {
  deliveryFee: number; // in grosze
  minOrderAmount: number; // in grosze
  businessPhone: string;
  businessEmail: string;
  /** Audit §3 — per-segment free-delivery thresholds (grosze). Operators
   *  retune these without a code push when the LTV per cohort shifts.
   *  Falls back to the SEGMENT_FREE_DELIVERY_THRESHOLD constants in
   *  src/lib/upsell.ts when unset. */
  deliveryThresholds?: {
    firstTime?: number;
    growing?: number;
    regular?: number;
    vip?: number;
  };
  /** Master toggle for /admin/simulation. When false the nav link is
   *  hidden and the page redirects to /admin. */
  simulationEnabled?: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  deliveryFee: 1000, // 10.00 PLN
  minOrderAmount: 3000, // 30.00 PLN
  businessPhone: "",
  businessEmail: "",
};

export async function getSettings(): Promise<AppSettings> {
  const saved = await readJSON<Partial<AppSettings>>("settings.json", {});
  return { ...DEFAULT_SETTINGS, ...saved };
}

export async function updateSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
  return withLock("settings.json", async () => {
    const current = await readJSON<Partial<AppSettings>>("settings.json", {});
    const merged = { ...DEFAULT_SETTINGS, ...current, ...updates };
    await writeJSON("settings.json", merged);
    return merged;
  });
}

// --- Growth & Loyalty Settings ---

/** Built-in widget renderers the customer-site LiveActivityBar knows about. */
export type LiveWidgetType =
  | "ordersInLastHour"
  | "currentlyPreparing"
  | "trendingItem"
  | "avgPrepTime"
  | "happyHour"
  | "truckLocation"
  | "freeText";

export interface LiveWidget {
  id: string;
  type: LiveWidgetType;
  /** Optional override of the preset wording — keep null/undefined to use the renderer's default. */
  label?: string;
  active: boolean;
  /** Empty or undefined ⇒ all locations. Otherwise the widget renders only on listed slugs. */
  locationSlugs?: string[];
  /** Display order (ascending) inside the live bar. */
  order: number;
  /** Type-specific configuration (e.g. happy-hour discount, free-text body). */
  config?: {
    text?: string;
    endHour?: number;
    discountPct?: number;
    category?: string;
  };
}

export interface LoyaltySettings {
  tiers: {
    bronze: { threshold: number; multiplier: number; perks: string[] };
    silver: { threshold: number; multiplier: number; perks: string[] };
    gold: { threshold: number; multiplier: number; perks: string[] };
    platinum: { threshold: number; multiplier: number; perks: string[] };
  };
  rewards: { id: string; name: string; pointsCost: number; description: string; active: boolean }[];
  referral: { referrerPoints: number; refereeDiscountGrosze: number; active: boolean };
  speedGuarantee: { maxMinutes: number; guaranteeText: string; active: boolean };
  abandonedCart: { delaySeconds: number; message: string; active: boolean };
  challenges: { id: string; title: string; description: string; target: number; rewardPoints: number; type: string; active: boolean }[];
  seasonalItems: { id: string; name: string; description: string; category: string; price: number; availableUntil: string; badge: string; active: boolean; locationSlug?: string }[];
  liveWidgets: LiveWidget[];
}

/** Up to this many widgets may render on the customer live bar at once. */
export const LIVE_WIDGET_LIMIT = 7;

const LEGACY_LIVE_WIDGET_KEYS = ["ordersInLastHour", "currentlyPreparing", "trendingItem", "avgPrepTime"] as const;

/** Seed the dynamic widget list from the legacy 4-boolean shape so existing
 *  installs keep their preferences after the schema upgrade. */
function seedLiveWidgetsFromLegacy(legacy?: Record<string, boolean>): LiveWidget[] {
  return LEGACY_LIVE_WIDGET_KEYS.map((key, idx) => ({
    id: `lw-${key}`,
    type: key,
    active: legacy ? legacy[key] !== false : true,
    order: idx,
  }));
}

const DEFAULT_LOYALTY_SETTINGS: LoyaltySettings = {
  tiers: {
    bronze: { threshold: 0, multiplier: 1, perks: ["1 point per 1 PLN spent"] },
    silver: { threshold: 500, multiplier: 1.5, perks: ["1.5x points multiplier", "Free birthday dessert"] },
    gold: { threshold: 1500, multiplier: 2, perks: ["2x points multiplier", "Priority ordering", "Free delivery"] },
    platinum: { threshold: 5000, multiplier: 3, perks: ["3x points multiplier", "Exclusive menu items", "VIP events"] },
  },
  rewards: [
    // Audit §3 — "10 PLN Off" at 100 points (100 zł spend → 10 zł back) was
    // strictly dominated by "Free Drink" at 50 pts → 11.90 zł value AND by
    // "Free Dessert" at 120 pts → 18 zł value. Customers do the maths and
    // avoid it. Removed.
    { id: "free-drink", name: "Free Drink", pointsCost: 50, description: "Any drink — espresso, limonata, water", active: true },
    { id: "free-side", name: "Free Garlic Bread", pointsCost: 70, description: "Pulls-apart garlic bread on the house", active: true },
    { id: "free-dessert", name: "Free Dessert", pointsCost: 120, description: "Any dessert from the menu", active: true },
    { id: "free-pizza-personale", name: "Free Personal Pizza", pointsCost: 180, description: "8\" Margherita on the house", active: true },
    { id: "free-pizza", name: "Free Pizza", pointsCost: 280, description: "Any standard pizza from the menu", active: true },
    { id: "25-off", name: "25 PLN Off", pointsCost: 280, description: "Big discount on your next order", active: true },
  ],
  referral: { referrerPoints: 100, refereeDiscountGrosze: 1000, active: true },
  speedGuarantee: { maxMinutes: 15, guaranteeText: "Ready in 15 minutes or your next drink is free", active: true },
  abandonedCart: { delaySeconds: 30, message: "Still hungry? 🍕", active: true },
  challenges: [
    { id: "ch-pasta-week", title: "Pasta Week", description: "Order any pasta dish 2 times this week", target: 2, rewardPoints: 40, type: "category", active: true },
    { id: "ch-bring-friend", title: "Bring a Friend", description: "Refer 1 friend who places an order", target: 1, rewardPoints: 50, type: "referral", active: true },
    { id: "ch-triple-order", title: "Hat Trick", description: "Place 3 orders this week", target: 3, rewardPoints: 60, type: "order-count", active: true },
  ],
  seasonalItems: [
    { id: "s1", name: "Tartufo Nero", description: "Black truffle cream, fior di latte, Parmigiano, truffle oil, fresh arugula", category: "pizza", price: 4500, availableUntil: "2026-04-30", badge: "Spring Special", active: true, locationSlug: "krakow" },
    { id: "s2", name: "Panna Cotta al Limoncello", description: "Limoncello-infused panna cotta with candied lemon zest and Amalfi lemon coulis", category: "desserts", price: 2200, availableUntil: "2026-04-30", badge: "Limited Edition", active: true, locationSlug: "krakow" },
    { id: "s3", name: "Risotto Primavera", description: "Carnaroli rice with asparagus, peas, mint, and shaved Parmigiano Reggiano", category: "pasta", price: 3200, availableUntil: "2026-05-31", badge: "Chef's Creation", active: true, locationSlug: "warszawa" },
  ],
  liveWidgets: seedLiveWidgetsFromLegacy(),
};

type LegacyLoyaltyShape = Partial<LoyaltySettings> & {
  /** Pre-migration boolean map. */
  liveActivity?: Record<string, boolean>;
};

function hydrateLoyalty(saved: LegacyLoyaltyShape): LoyaltySettings {
  const liveWidgets =
    Array.isArray(saved.liveWidgets) && saved.liveWidgets.length > 0
      ? saved.liveWidgets
      : seedLiveWidgetsFromLegacy(saved.liveActivity);
  return { ...DEFAULT_LOYALTY_SETTINGS, ...saved, liveWidgets };
}

export async function getLoyaltySettings(): Promise<LoyaltySettings> {
  const saved = await readJSON<LegacyLoyaltyShape>("loyalty-settings.json", {});
  return hydrateLoyalty(saved);
}

export async function updateLoyaltySettings(updates: Partial<LoyaltySettings>): Promise<LoyaltySettings> {
  return withLock("loyalty-settings.json", async () => {
    const current = await readJSON<LegacyLoyaltyShape>("loyalty-settings.json", {});
    const hydrated = hydrateLoyalty(current);
    const merged: LoyaltySettings = { ...hydrated, ...updates };
    await writeJSON("loyalty-settings.json", merged);
    return merged;
  });
}

// --- Ingredients ---

// --- Inventory: ingredients + recipes (m1_5: dual-write) ----------------

const INGREDIENTS_DDL = [
  `CREATE TABLE IF NOT EXISTS ingredients (
    id text PRIMARY KEY,
    name text NOT NULL,
    category text NOT NULL,
    unit text NOT NULL,
    cost_per_unit integer NOT NULL,
    supplier text,
    notes text
  )`,
];
const RECIPES_DDL = [
  `CREATE TABLE IF NOT EXISTS recipes (
    id text PRIMARY KEY,
    menu_item_id text NOT NULL,
    prep_time_minutes integer,
    yield_portions integer NOT NULL,
    notes text,
    ingredients_payload jsonb NOT NULL DEFAULT '[]'::jsonb
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS recipes_menu_item_id_unique
    ON recipes (menu_item_id)`,
];

async function ensureIngredientsTable(): Promise<void> {
  await ensureTable("ingredients", INGREDIENTS_DDL);
}
async function ensureRecipesTable(): Promise<void> {
  await ensureTable("recipes", RECIPES_DDL);
}

async function dualWriteIngredient(ingredient: Ingredient): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await ensureIngredientsTable();
    await db
      .insert(ingredientsTable)
      .values({
        id: ingredient.id,
        name: ingredient.name,
        category: ingredient.category,
        unit: ingredient.unit,
        costPerUnit: ingredient.costPerUnit,
        supplier: ingredient.supplier ?? null,
        notes: ingredient.notes ?? null,
      })
      .onConflictDoUpdate({
        target: ingredientsTable.id,
        set: {
          name: ingredient.name,
          category: ingredient.category,
          unit: ingredient.unit,
          costPerUnit: ingredient.costPerUnit,
          supplier: ingredient.supplier ?? null,
          notes: ingredient.notes ?? null,
        },
      });
  } catch (err) {
    logger.warn("dualWriteIngredient failed", { id: ingredient.id, layer: "store.ingredients" }, err);
  }
}

async function dualDeleteIngredient(id: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await ensureIngredientsTable();
    await db.delete(ingredientsTable).where(eq(ingredientsTable.id, id));
  } catch (err) {
    logger.warn("dualDeleteIngredient failed", { id, layer: "store.ingredients" }, err);
  }
}

async function dualWriteRecipe(recipe: Recipe): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await ensureRecipesTable();
    const values = {
      id: recipe.id,
      menuItemId: recipe.menuItemId,
      prepTimeMinutes: recipe.prepTimeMinutes ?? null,
      yieldPortions: recipe.yieldPortions,
      notes: recipe.notes ?? null,
      ingredientsPayload: recipe.ingredients,
    };
    await db
      .insert(recipesTable)
      .values(values)
      .onConflictDoUpdate({ target: recipesTable.id, set: values });
  } catch (err) {
    logger.warn("dualWriteRecipe failed", { menuItemId: recipe.menuItemId, layer: "store.recipes" }, err);
  }
}

async function dualDeleteRecipe(menuItemId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await ensureRecipesTable();
    await db.delete(recipesTable).where(eq(recipesTable.menuItemId, menuItemId));
  } catch (err) {
    logger.warn("dualDeleteRecipe failed", { menuItemId, layer: "store.recipes" }, err);
  }
}

function rowToIngredient(row: typeof ingredientsTable.$inferSelect): Ingredient {
  return {
    id: row.id,
    name: row.name,
    category: row.category as Ingredient["category"],
    unit: row.unit as Ingredient["unit"],
    costPerUnit: row.costPerUnit,
    supplier: row.supplier ?? undefined,
    notes: row.notes ?? undefined,
  };
}

function rowToRecipe(row: typeof recipesTable.$inferSelect): Recipe {
  return {
    id: row.id,
    menuItemId: row.menuItemId,
    ingredients: (row.ingredientsPayload as Recipe["ingredients"]) ?? [],
    prepTimeMinutes: row.prepTimeMinutes ?? undefined,
    yieldPortions: row.yieldPortions,
    notes: row.notes ?? undefined,
  };
}

export async function getIngredients(): Promise<Ingredient[]> {
  const db = getDb();
  if (db) {
    try {
      await ensureIngredientsTable();
      const rows = await db.select().from(ingredientsTable);
      if (rows.length > 0) return rows.map(rowToIngredient);
    } catch (err) {
      logger.warn("getIngredients DB read failed; falling back", { layer: "store.ingredients" }, err);
    }
  }
  const fromKv = await readJSON<Ingredient[]>("ingredients.json", []);
  if (fromKv.length > 0) {
    bumpLazyBackfillHit("ingredients");
    void Promise.all(fromKv.map((i) => dualWriteIngredient(i)));
  }
  return fromKv;
}

export async function saveIngredient(ingredient: Ingredient): Promise<Ingredient> {
  return withLock("ingredients.json", async () => {
    const list = await readJSON<Ingredient[]>("ingredients.json", []);
    const idx = list.findIndex((i) => i.id === ingredient.id);
    if (idx >= 0) {
      list[idx] = ingredient;
    } else {
      list.push(ingredient);
    }
    await writeJSON("ingredients.json", list);
    await dualWriteIngredient(ingredient);
    return ingredient;
  });
}

export async function deleteIngredient(id: string): Promise<boolean> {
  return withLock("ingredients.json", async () => {
    const list = await readJSON<Ingredient[]>("ingredients.json", []);
    const filtered = list.filter((i) => i.id !== id);
    if (filtered.length === list.length) return false;
    await writeJSON("ingredients.json", filtered);
    await dualDeleteIngredient(id);
    return true;
  });
}

// --- Recipes ---

export async function getRecipes(): Promise<Recipe[]> {
  const db = getDb();
  if (db) {
    try {
      await ensureRecipesTable();
      const rows = await db.select().from(recipesTable);
      if (rows.length > 0) return rows.map(rowToRecipe);
    } catch (err) {
      logger.warn("getRecipes DB read failed; falling back", { layer: "store.recipes" }, err);
    }
  }
  const fromKv = await readJSON<Recipe[]>("recipes.json", []);
  if (fromKv.length > 0) {
    bumpLazyBackfillHit("recipes");
    void Promise.all(fromKv.map((r) => dualWriteRecipe(r)));
  }
  return fromKv;
}

export async function getRecipe(menuItemId: string): Promise<Recipe | undefined> {
  const db = getDb();
  if (db) {
    try {
      await ensureRecipesTable();
      const rows = await db
        .select()
        .from(recipesTable)
        .where(eq(recipesTable.menuItemId, menuItemId))
        .limit(1);
      if (rows.length > 0) return rowToRecipe(rows[0]);
    } catch (err) {
      logger.warn("getRecipe DB read failed; falling back", { menuItemId, layer: "store.recipes" }, err);
    }
  }
  const recipes = await readJSON<Recipe[]>("recipes.json", []);
  const hit = recipes.find((r) => r.menuItemId === menuItemId);
  if (hit) {
    bumpLazyBackfillHit("recipes");
    void dualWriteRecipe(hit);
  }
  return hit;
}

export async function saveRecipe(recipe: Recipe): Promise<Recipe> {
  return withLock("recipes.json", async () => {
    const list = await readJSON<Recipe[]>("recipes.json", []);
    const idx = list.findIndex((r) => r.menuItemId === recipe.menuItemId);
    if (idx >= 0) {
      list[idx] = recipe;
    } else {
      list.push(recipe);
    }
    await writeJSON("recipes.json", list);
    await dualWriteRecipe(recipe);
    return recipe;
  });
}

export async function deleteRecipe(menuItemId: string): Promise<boolean> {
  return withLock("recipes.json", async () => {
    const list = await readJSON<Recipe[]>("recipes.json", []);
    const filtered = list.filter((r) => r.menuItemId !== menuItemId);
    if (filtered.length === list.length) return false;
    await writeJSON("recipes.json", filtered);
    await dualDeleteRecipe(menuItemId);
    return true;
  });
}

// Calculate food cost from recipe
export async function calculateFoodCost(menuItemId: string): Promise<number> {
  const recipe = await getRecipe(menuItemId);
  if (!recipe || recipe.ingredients.length === 0) return 0;

  const ingredients = await getIngredients();
  const ingredientMap = new Map(ingredients.map((i) => [i.id, i]));

  let totalCost = 0;
  for (const ri of recipe.ingredients) {
    const ing = ingredientMap.get(ri.ingredientId);
    if (!ing) continue;
    totalCost += ing.costPerUnit * ri.quantity * (ri.wasteFactor || 1);
  }

  // Cost per portion
  return Math.round(totalCost / (recipe.yieldPortions || 1));
}

// --- Loyalty Members (phone-only signups without orders) ---

export interface LoyaltyMember {
  phone: string;
  name: string;
  lastName?: string;
  nickname?: string;
  email?: string;
  signedUpAt: string;
  /** Optional ISO date of birth (YYYY-MM-DD). Powers birthday trigger campaigns. */
  dob?: string;
}

const LOYALTY_MEMBERS_DDL = [
  `CREATE TABLE IF NOT EXISTS loyalty_members (
    phone text PRIMARY KEY,
    name text NOT NULL,
    last_name text,
    nickname text,
    email text,
    dob date,
    signed_up_at timestamptz NOT NULL
  )`,
  // Gemini review feedback: dob migrated from text → date.
  `ALTER TABLE loyalty_members ALTER COLUMN dob TYPE date USING (NULLIF(dob, '')::date)`,
];

async function ensureLoyaltyMembersTable(): Promise<void> {
  await ensureTable("loyalty_members", LOYALTY_MEMBERS_DDL);
}

function rowToLoyaltyMember(row: typeof loyaltyMembersTable.$inferSelect): LoyaltyMember {
  return {
    phone: row.phone,
    name: row.name,
    lastName: row.lastName ?? undefined,
    nickname: row.nickname ?? undefined,
    email: row.email ?? undefined,
    dob: row.dob ?? undefined,
    signedUpAt: row.signedUpAt.toISOString(),
  };
}

async function dualWriteLoyaltyMember(m: LoyaltyMember): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await ensureLoyaltyMembersTable();
    const values = {
      phone: m.phone,
      name: m.name,
      lastName: m.lastName ?? null,
      nickname: m.nickname ?? null,
      email: m.email ?? null,
      dob: m.dob ?? null,
      signedUpAt: new Date(m.signedUpAt),
    };
    await db
      .insert(loyaltyMembersTable)
      .values(values)
      .onConflictDoUpdate({ target: loyaltyMembersTable.phone, set: values });
  } catch (err) {
    logger.warn("dualWriteLoyaltyMember failed", { phone: m.phone, layer: "store.loyalty_members" }, err);
  }
}

export async function getLoyaltyMembers(): Promise<LoyaltyMember[]> {
  const db = getDb();
  if (db) {
    try {
      await ensureLoyaltyMembersTable();
      const rows = await db.select().from(loyaltyMembersTable);
      if (rows.length > 0) return rows.map(rowToLoyaltyMember);
    } catch (err) {
      logger.warn("getLoyaltyMembers DB read failed; falling back", { layer: "store.loyalty_members" }, err);
    }
  }
  const list = await readJSON<LoyaltyMember[]>("loyalty-members.json", []);
  if (list.length > 0) {
    bumpLazyBackfillHit("loyalty_members");
    void Promise.all(list.map((m) => dualWriteLoyaltyMember(m)));
  }
  return list;
}

export async function addLoyaltyMember(member: LoyaltyMember): Promise<LoyaltyMember> {
  const canonical = normalizePlPhoneE164(member.phone) || member.phone.trim();
  const toSave: LoyaltyMember = { ...member, phone: canonical };
  const saved = await withLock("loyalty-members.json", async () => {
    const list = await readJSON<LoyaltyMember[]>("loyalty-members.json", []);
    if (list.some((m) => phonesEqualPl(m.phone, canonical))) return toSave;
    list.push(toSave);
    await writeJSON("loyalty-members.json", list);
    return toSave;
  });
  await dualWriteLoyaltyMember(saved);
  // Loyalty signup carries the customer's name/email/dob — feeds the rollup.
  void recomputeCustomerRollup(canonical);
  return saved;
}

export async function getLoyaltyMember(phone: string): Promise<LoyaltyMember | undefined> {
  const db = getDb();
  const canonical = normalizePlPhoneE164(phone) ?? phone.trim();
  if (db) {
    try {
      await ensureLoyaltyMembersTable();
      const rows = await db
        .select()
        .from(loyaltyMembersTable)
        .where(eq(loyaltyMembersTable.phone, canonical))
        .limit(1);
      if (rows.length > 0) return rowToLoyaltyMember(rows[0]);
    } catch (err) {
      logger.warn("getLoyaltyMember DB read failed; falling back", { phone, layer: "store.loyalty_members" }, err);
    }
  }
  const list = await readJSON<LoyaltyMember[]>("loyalty-members.json", []);
  const normalized = normalizePlPhoneE164(phone);
  let hit: LoyaltyMember | undefined;
  if (normalized) hit = list.find((m) => phonesEqualPl(m.phone, normalized));
  if (!hit) hit = list.find((m) => m.phone === phone.trim());
  if (hit) {
    bumpLazyBackfillHit("loyalty_members");
    void dualWriteLoyaltyMember(hit);
  }
  return hit;
}

export async function updateLoyaltyMember(
  phone: string,
  updates: Partial<Pick<LoyaltyMember, "name" | "lastName" | "nickname" | "email" | "dob">>
): Promise<LoyaltyMember | null> {
  const canonical = normalizePlPhoneE164(phone) || phone.trim();
  const updated = await withLock("loyalty-members.json", async () => {
    const list = await readJSON<LoyaltyMember[]>("loyalty-members.json", []);
    const index = list.findIndex((m) => phonesEqualPl(m.phone, canonical));
    if (index === -1) return null;
    list[index] = { ...list[index], ...updates };
    await writeJSON("loyalty-members.json", list);
    return list[index];
  });
  if (updated) {
    await dualWriteLoyaltyMember(updated);
    // Profile edits affect the customer rollup's name/email/birthday.
    void recomputeCustomerRollup(canonical);
  }
  return updated;
}

// --- Family wallets (up to WALLET_MAX_PHONES phones, shared earn, invite + confirm) ---

export type WalletMemberStatus = "pending" | "active";

export interface WalletMemberEntry {
  phone: string;
  status: WalletMemberStatus;
  invitedAt?: string;
  confirmedAt?: string;
}

export interface FamilyWallet {
  id: string;
  headPhone: string;
  createdAt: string;
  members: WalletMemberEntry[];
  /**
   * When set, productises this wallet as a "Sud Italia Corporate" account
   * (audit §3.4) — adds a public corporate URL, billing email for the
   * admin's monthly invoice, and a head-bonus accrual rate so the
   * company contact earns a slice of the corporate pool. Members continue
   * to earn personal points exactly as a solo customer would.
   *
   * Corporate is intended for companies with more than 5 employees ordering
   * in bulk; the `minEmployees` threshold (default 6) enforces eligibility
   * at promotion time and is surfaced on the public landing page.
   */
  corporate?: CorporateConfig;
}

export interface CorporateConfig {
  /** URL slug used at /corporate/[slug]. Lowercase, alphanumeric + dash. */
  slug: string;
  /** Company name (e.g. "Acme", "Allegro"). */
  name: string;
  /** Email the monthly VAT-compliant invoice goes to. */
  billingEmail?: string;
  /**
   * Head bonus, expressed in basis points of the pool. 2000 = 20%.
   * Surfaces inside the loyalty engine; the company head's spendable
   * points are boosted by this multiplier of the corporate monthly pool.
   */
  headBonusBps: number;
  /**
   * Minimum employee count required for the corporate program. Default 6
   * so the brief's ">5 employees" is enforced. Surfaced on the public
   * landing page so prospects know the threshold up-front.
   */
  minEmployees: number;
  /** Optional weekly auto-pre-order schedule. Used by the cart-drawer
   *  banner copy (&ldquo;Wednesday corporate lunch — 4 of 8 have ordered, 2h to go&rdquo;). */
  autoPreorderDay?: number; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  autoPreorderTime?: string; // "HH:MM" local
  /** Pinned location for the company's standing order. */
  locationSlug?: string;
  createdAt: string;
}

type WalletInviteOtpMap = Record<
  string,
  { code: string; expiresAt: string; walletId: string }
>;

async function readWalletInviteOtps(): Promise<WalletInviteOtpMap> {
  return readJSON<WalletInviteOtpMap>("wallet-invite-otp.json", {});
}

export async function storeWalletInviteOtp(
  inviteePhone: string,
  walletId: string,
  code: string
): Promise<void> {
  const canonical = normalizePlPhoneE164(inviteePhone) || inviteePhone.trim();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  return withLock("wallet-invite-otp.json", async () => {
    const map = await readWalletInviteOtps();
    map[canonical] = { code, expiresAt, walletId };
    await writeJSON("wallet-invite-otp.json", map);
  });
}

export async function verifyAndConsumeWalletInviteOtp(
  inviteePhone: string,
  code: string
): Promise<string | null> {
  const canonical = normalizePlPhoneE164(inviteePhone) || inviteePhone.trim();
  const trimmed = code.trim();
  return withLock("wallet-invite-otp.json", async () => {
    const map = await readWalletInviteOtps();
    const entry = map[canonical];
    if (!entry || entry.code !== trimmed) return null;
    if (new Date(entry.expiresAt) < new Date()) {
      delete map[canonical];
      await writeJSON("wallet-invite-otp.json", map);
      return null;
    }
    const { walletId } = entry;
    delete map[canonical];
    await writeJSON("wallet-invite-otp.json", map);
    return walletId;
  });
}

export async function getFamilyWallets(): Promise<FamilyWallet[]> {
  return readJSON<FamilyWallet[]>("wallets.json", []);
}

export async function findWalletByPhone(phone: string): Promise<FamilyWallet | null> {
  const canonical = normalizePlPhoneE164(phone) || phone.trim();
  const wallets = await getFamilyWallets();
  for (const w of wallets) {
    for (const m of w.members) {
      if (phonesEqualPl(m.phone, canonical)) return w;
    }
  }
  return null;
}

export async function createFamilyWallet(headPhone: string): Promise<FamilyWallet | null> {
  const canonical = normalizePlPhoneE164(headPhone) || headPhone.trim();
  return withLock("wallets.json", async () => {
    const list = await readJSON<FamilyWallet[]>("wallets.json", []);
    for (const w of list) {
      for (const m of w.members) {
        if (phonesEqualPl(m.phone, canonical)) return null;
      }
    }
    const now = new Date().toISOString();
    const wallet: FamilyWallet = {
      id: `fw-${crypto.randomUUID()}`,
      headPhone: canonical,
      createdAt: now,
      members: [
        {
          phone: canonical,
          status: "active",
          confirmedAt: now,
        },
      ],
    };
    list.push(wallet);
    await writeJSON("wallets.json", list);
    return wallet;
  });
}

export type InviteWalletMemberResult =
  | { ok: true; invitee: string; resent: boolean }
  | { error: string };

export async function inviteFamilyWalletMember(
  walletId: string,
  headPhone: string,
  inviteeRaw: string
): Promise<InviteWalletMemberResult> {
  const invitee = normalizePlPhoneE164(inviteeRaw) || inviteeRaw.trim();
  const head = normalizePlPhoneE164(headPhone) || headPhone.trim();
  if (!invitee) return { error: "Invalid phone number" };
  if (phonesEqualPl(invitee, head)) return { error: "Cannot invite yourself" };

  return withLock("wallets.json", async () => {
    const list = await readJSON<FamilyWallet[]>("wallets.json", []);
    const w = list.find((x) => x.id === walletId);
    if (!w) return { error: "Wallet not found" };
    if (!phonesEqualPl(w.headPhone, head)) return { error: "Only the wallet owner can invite" };

    const existingIdx = w.members.findIndex((mem) => phonesEqualPl(mem.phone, invitee));
    if (existingIdx >= 0) {
      const mem = w.members[existingIdx];
      if (mem.status === "active") return { error: "This number is already in the wallet" };
      await writeJSON("wallets.json", list);
      return { ok: true, invitee, resent: true };
    }

    if (w.members.length >= WALLET_MAX_PHONES) {
      return { error: `Wallet is full (max ${WALLET_MAX_PHONES} numbers)` };
    }

    for (const other of list) {
      if (other.id === walletId) continue;
      if (other.members.some((mem) => phonesEqualPl(mem.phone, invitee))) {
        return { error: "This number is already in another wallet" };
      }
    }

    const now = new Date().toISOString();
    w.members.push({
      phone: invitee,
      status: "pending",
      invitedAt: now,
    });
    await writeJSON("wallets.json", list);
    return { ok: true, invitee, resent: false };
  });
}

export type ConfirmWalletMemberResult =
  | { ok: true; wallet: FamilyWallet }
  | { error: string };

export async function confirmFamilyWalletMember(
  inviteePhone: string,
  code: string
): Promise<ConfirmWalletMemberResult> {
  const canonical = normalizePlPhoneE164(inviteePhone) || inviteePhone.trim();
  const walletId = await verifyAndConsumeWalletInviteOtp(canonical, code);
  if (!walletId) return { error: "Invalid or expired code" };

  return withLock("wallets.json", async () => {
    const list = await readJSON<FamilyWallet[]>("wallets.json", []);
    const w = list.find((x) => x.id === walletId);
    if (!w) return { error: "Wallet not found" };
    const m = w.members.find((mem) => phonesEqualPl(mem.phone, canonical));
    if (!m) return { error: "No invitation for this number" };
    if (m.status === "active") return { error: "Already confirmed" };
    m.status = "active";
    m.confirmedAt = new Date().toISOString();
    await writeJSON("wallets.json", list);
    return { ok: true, wallet: w };
  });
}

export async function removeFamilyWalletMember(
  walletId: string,
  headPhone: string,
  targetRaw: string
): Promise<{ ok: true } | { error: string }> {
  const head = normalizePlPhoneE164(headPhone) || headPhone.trim();
  const target = normalizePlPhoneE164(targetRaw) || targetRaw.trim();
  if (phonesEqualPl(target, head)) return { error: "Cannot remove the wallet owner" };

  return withLock("wallets.json", async () => {
    const list = await readJSON<FamilyWallet[]>("wallets.json", []);
    const w = list.find((x) => x.id === walletId);
    if (!w) return { error: "Wallet not found" };
    if (!phonesEqualPl(w.headPhone, head)) return { error: "Only the wallet owner can remove members" };
    const idx = w.members.findIndex((mem) => phonesEqualPl(mem.phone, target));
    if (idx === -1) return { error: "Member not found" };
    w.members.splice(idx, 1);
    await writeJSON("wallets.json", list);
    return { ok: true };
  });
}

export async function leaveFamilyWallet(
  walletId: string,
  memberPhone: string
): Promise<{ ok: true } | { error: string }> {
  const phone = normalizePlPhoneE164(memberPhone) || memberPhone.trim();
  return withLock("wallets.json", async () => {
    const list = await readJSON<FamilyWallet[]>("wallets.json", []);
    const w = list.find((x) => x.id === walletId);
    if (!w) return { error: "Wallet not found" };
    if (phonesEqualPl(w.headPhone, phone)) {
      return { error: "The owner cannot leave the wallet" };
    }
    const idx = w.members.findIndex((mem) => phonesEqualPl(mem.phone, phone));
    if (idx === -1) return { error: "Not a member" };
    w.members.splice(idx, 1);
    await writeJSON("wallets.json", list);
    return { ok: true };
  });
}

// --- Sud Italia Corporate (audit §3.4) ---------------------------------
//
// Productises the existing FamilyWallet as a corporate-bulk-ordering
// primitive. A corporate account is just a wallet with a `corporate` config
// attached: public slug at /corporate/[slug], billing email for the
// company contact, an explicit head bonus rate, and a minimum employee
// threshold (default 6 — the brief's ">5 employees" rule).
//
// Members continue to earn personal points exactly as a solo customer would
// (handled by resolveCustomerLoyalty); the head additionally accrues a slice
// of the corporate pool via headBonusBps.

const CORPORATE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;
const CORPORATE_DEFAULT_MIN_EMPLOYEES = 6;

export function normaliseCorporateSlug(raw: string): string | null {
  const slug = raw.trim().toLowerCase().replace(/\s+/g, "-");
  if (!CORPORATE_SLUG_PATTERN.test(slug)) return null;
  return slug;
}

export async function findCorporateBySlug(slugRaw: string): Promise<FamilyWallet | null> {
  const slug = normaliseCorporateSlug(slugRaw);
  if (!slug) return null;
  const wallets = await getFamilyWallets();
  return wallets.find((w) => w.corporate?.slug === slug) ?? null;
}

export async function listCorporateWallets(): Promise<FamilyWallet[]> {
  const wallets = await getFamilyWallets();
  return wallets.filter((w) => w.corporate);
}

export type SetCorporateConfigResult =
  | { ok: true; wallet: FamilyWallet }
  | { error: string };

/**
 * Promote an existing wallet to a corporate account (or update an existing
 * one's config). Slug must be unique across corporates. Caller must have
 * already verified that `headPhone` matches the wallet's owner — this
 * helper trusts the input.
 *
 * `minEmployees` defaults to 6 (the brief's ">5 employees" rule). The
 * landing page surfaces the threshold so prospects know up-front.
 */
export async function setCorporateConfig(
  walletId: string,
  corporate: Omit<CorporateConfig, "createdAt" | "minEmployees"> & {
    createdAt?: string;
    minEmployees?: number;
  },
): Promise<SetCorporateConfigResult> {
  const slug = normaliseCorporateSlug(corporate.slug);
  if (!slug) {
    return { error: "Invalid corporate slug. Use lowercase letters, digits, and dashes (3–40 chars)." };
  }
  if (!corporate.name.trim()) {
    return { error: "Company name is required" };
  }
  if (!Number.isFinite(corporate.headBonusBps) || corporate.headBonusBps < 0 || corporate.headBonusBps > 5000) {
    return { error: "Head bonus must be 0–5000 bps (0–50%)" };
  }
  const minEmployeesRaw =
    typeof corporate.minEmployees === "number" && Number.isFinite(corporate.minEmployees)
      ? corporate.minEmployees
      : CORPORATE_DEFAULT_MIN_EMPLOYEES;
  // Brief: corporate is for companies with >5 employees, so the floor is 6.
  if (minEmployeesRaw < 6) {
    return { error: "Corporate accounts require at least 6 employees (>5)." };
  }
  return withLock("wallets.json", async () => {
    const list = await readJSON<FamilyWallet[]>("wallets.json", []);
    const w = list.find((x) => x.id === walletId);
    if (!w) return { error: "Wallet not found" };
    const collision = list.find((x) => x.id !== walletId && x.corporate?.slug === slug);
    if (collision) return { error: "That corporate URL is taken" };
    const now = new Date().toISOString();
    w.corporate = {
      slug,
      name: corporate.name.trim(),
      billingEmail: corporate.billingEmail?.trim() || undefined,
      headBonusBps: Math.round(corporate.headBonusBps),
      minEmployees: Math.round(minEmployeesRaw),
      autoPreorderDay: corporate.autoPreorderDay,
      autoPreorderTime: corporate.autoPreorderTime?.trim() || undefined,
      locationSlug: corporate.locationSlug?.trim() || undefined,
      createdAt: w.corporate?.createdAt ?? corporate.createdAt ?? now,
    };
    await writeJSON("wallets.json", list);
    return { ok: true, wallet: w };
  });
}

export async function clearCorporateConfig(walletId: string): Promise<{ ok: true } | { error: string }> {
  return withLock("wallets.json", async () => {
    const list = await readJSON<FamilyWallet[]>("wallets.json", []);
    const w = list.find((x) => x.id === walletId);
    if (!w) return { error: "Wallet not found" };
    if (!w.corporate) return { ok: true };
    delete w.corporate;
    await writeJSON("wallets.json", list);
    return { ok: true };
  });
}

/** Public-facing corporate rollup (no PII beyond what the head shares). */
export interface PublicCorporateRollup {
  slug: string;
  name: string;
  memberCount: number;
  minEmployees: number;
  poolEarnedThisMonth: number;
  headBonusPoints: number;
  headBonusBps: number;
  autoPreorderDay?: number;
  autoPreorderTime?: string;
  locationSlug?: string;
}

export async function getPublicCorporateRollup(slugRaw: string): Promise<PublicCorporateRollup | null> {
  const wallet = await findCorporateBySlug(slugRaw);
  if (!wallet || !wallet.corporate) return null;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const activePhones = wallet.members
    .filter((m) => m.status === "active")
    .map((m) => m.phone);

  // Phone-by-phone indexed query rather than a full table scan filtered in
  // memory. Each call is O(N_phone) on the orders_customer_phone_idx +
  // a createdAt range filter, and we run one per active member so the
  // overall cost is O(members × per-member orders) — bounded by the team
  // size (max ~12), not the total order volume.
  let poolEarnedThisMonth = 0;
  for (const p of activePhones) {
    const monthOrders = await getOrdersByPhone(p, { sinceIso: monthStart.toISOString() });
    const totalSpent = monthOrders.reduce((s, o) => s + o.totalAmount, 0);
    poolEarnedThisMonth += Math.floor(totalSpent / 100);
  }

  const headBonusPoints = Math.floor((poolEarnedThisMonth * wallet.corporate.headBonusBps) / 10_000);

  return {
    slug: wallet.corporate.slug,
    name: wallet.corporate.name,
    memberCount: wallet.members.length,
    minEmployees: wallet.corporate.minEmployees,
    poolEarnedThisMonth,
    headBonusPoints,
    headBonusBps: wallet.corporate.headBonusBps,
    autoPreorderDay: wallet.corporate.autoPreorderDay,
    autoPreorderTime: wallet.corporate.autoPreorderTime,
    locationSlug: wallet.corporate.locationSlug,
  };
}

// --- Wallet + solo redemptions (ledger) ---

export interface WalletRedemption {
  id: string;
  /** null = solo account (not in an active wallet) */
  walletId: string | null;
  phone: string;
  points: number;
  rewardId: string;
  createdAt: string;
}

export async function getWalletRedemptions(): Promise<WalletRedemption[]> {
  return readJSON<WalletRedemption[]>("wallet-redemptions.json", []);
}

function sumSoloRedemptionsForPhone(
  redemptions: WalletRedemption[],
  phone: string
): number {
  return redemptions
    .filter(
      (r) =>
        r.walletId === null &&
        phonesEqualPl(r.phone, phone)
    )
    .reduce((s, r) => s + r.points, 0);
}

function sumWalletRedemptions(redemptions: WalletRedemption[], walletId: string): number {
  return redemptions
    .filter((r) => r.walletId === walletId)
    .reduce((s, r) => s + r.points, 0);
}

function sumMemberWalletRedemptions(
  redemptions: WalletRedemption[],
  walletId: string,
  phone: string
): number {
  return redemptions
    .filter(
      (r) =>
        r.walletId === walletId && phonesEqualPl(r.phone, phone)
    )
    .reduce((s, r) => s + r.points, 0);
}

/** Order-based points (1 pt / 1 PLN) + count of non-pending orders for one phone. */
export function computeOrderPointsForPhone(
  phone: string,
  orders: Order[]
): { orderPoints: number; ordersCount: number } {
  const canonical = normalizePlPhoneE164(phone) || phone.trim();
  const customerOrders = orders.filter(
    (o) =>
      o.customerPhone &&
      phonesEqualPl(o.customerPhone, canonical) &&
      o.status !== "pending"
  );
  const totalSpent = customerOrders.reduce((sum, o) => sum + o.totalAmount, 0);
  return {
    orderPoints: Math.floor(totalSpent / 100),
    ordersCount: customerOrders.length,
  };
}

// --- Point Adjustments (manual add/remove by admin) ---

export interface PointAdjustment {
  phone: string;
  amount: number;
  reason: string;
  adjustedBy: string;
  adjustedAt: string;
}

const POINT_ADJUSTMENTS_DDL = [
  `CREATE TABLE IF NOT EXISTS point_adjustments (
    id text PRIMARY KEY,
    phone text NOT NULL,
    amount integer NOT NULL,
    reason text NOT NULL,
    adjusted_by text NOT NULL,
    adjusted_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS point_adjustments_phone_idx
    ON point_adjustments (phone)`,
  `CREATE INDEX IF NOT EXISTS point_adjustments_adjusted_at_idx
    ON point_adjustments (adjusted_at)`,
];

async function ensurePointAdjustmentsTable(): Promise<void> {
  await ensureTable("point_adjustments", POINT_ADJUSTMENTS_DDL);
}

/**
 * Adjustments don't carry an id field; synthesize one from natural keys so
 * ON CONFLICT DO NOTHING gives idempotent backfill.
 */
function pointAdjustmentSyntheticId(a: PointAdjustment): string {
  return `${a.phone}|${a.adjustedAt}|${a.amount}`;
}

function rowToPointAdjustment(row: typeof pointAdjustmentsTable.$inferSelect): PointAdjustment {
  return {
    phone: row.phone,
    amount: row.amount,
    reason: row.reason,
    adjustedBy: row.adjustedBy,
    adjustedAt: row.adjustedAt.toISOString(),
  };
}

async function dualWritePointAdjustment(a: PointAdjustment): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await ensurePointAdjustmentsTable();
    await db
      .insert(pointAdjustmentsTable)
      .values({
        id: pointAdjustmentSyntheticId(a),
        phone: a.phone,
        amount: a.amount,
        reason: a.reason,
        adjustedBy: a.adjustedBy,
        adjustedAt: new Date(a.adjustedAt),
      })
      .onConflictDoNothing();
  } catch (err) {
    logger.warn("dualWritePointAdjustment failed", { phone: a.phone, layer: "store.point_adjustments" }, err);
  }
}

export async function getPointAdjustments(): Promise<PointAdjustment[]> {
  const db = getDb();
  if (db) {
    try {
      await ensurePointAdjustmentsTable();
      const rows = await db.select().from(pointAdjustmentsTable);
      if (rows.length > 0) return rows.map(rowToPointAdjustment);
    } catch (err) {
      logger.warn("getPointAdjustments DB read failed; falling back", { layer: "store.point_adjustments" }, err);
    }
  }
  const list = await readJSON<PointAdjustment[]>("point-adjustments.json", []);
  if (list.length > 0) {
    bumpLazyBackfillHit("point_adjustments");
    void Promise.all(list.map((a) => dualWritePointAdjustment(a)));
  }
  return list;
}

export async function addPointAdjustment(adj: PointAdjustment): Promise<void> {
  await withLock("point-adjustments.json", async () => {
    const list = await readJSON<PointAdjustment[]>("point-adjustments.json", []);
    list.push(adj);
    await writeJSON("point-adjustments.json", list);
  });
  await dualWritePointAdjustment(adj);
  // Manual adjustments shift loyaltyPointsBalance + manualPointsAdjust on
  // the customer rollup — keep that in sync.
  void recomputeCustomerRollup(adj.phone);
}

export async function getManualPointsTotal(phone: string): Promise<number> {
  const all = await getPointAdjustments();
  const canonical = normalizePlPhoneE164(phone);
  return all
    .filter((a) =>
      canonical ? phonesEqualPl(a.phone, canonical) : a.phone.trim() === phone.trim()
    )
    .reduce((sum, a) => sum + a.amount, 0);
}

async function earnedPointsForPhone(phone: string, orders: Order[]): Promise<number> {
  const { orderPoints } = computeOrderPointsForPhone(phone, orders);
  const manual = await getManualPointsTotal(phone);
  return orderPoints + manual;
}

export interface CustomerWalletPayload {
  id: string;
  role: "head" | "member";
  myStatus: WalletMemberStatus;
  poolEarned: number;
  spendablePool: number;
  myContributedPoints: number;
  headRedeemCap: number;
  memberRedeemCap: number;
  members: { phone: string; status: WalletMemberStatus; isHead: boolean; contributedPoints: number }[];
  /**
   * Corporate config (audit §3.4). Populated when this wallet has been
   * productised as a Sud Italia Corporate account. Lets the cart drawer
   * surface the "Ordering with [company]" banner without an extra fetch.
   */
  corporate?: {
    slug: string;
    name: string;
  };
}

export interface ResolveCustomerLoyaltyResult {
  ordersCount: number;
  /** Lifetime earned for tier (pool for active wallet members, else solo). */
  points: number;
  /** Max points this session can redeem right now. */
  spendablePoints: number;
  wallet: CustomerWalletPayload | null;
}

export async function resolveCustomerLoyalty(
  phone: string,
  allOrders?: Order[]
): Promise<ResolveCustomerLoyaltyResult> {
  const canonical = normalizePlPhoneE164(phone) || phone.trim();
  const orders = allOrders ?? (await getOrders());
  const redemptions = await getWalletRedemptions();

  const { orderPoints, ordersCount } = computeOrderPointsForPhone(canonical, orders);
  const manualPoints = await getManualPointsTotal(canonical);
  const soloEarned = orderPoints + manualPoints;

  const wallet = await findWalletByPhone(canonical);
  if (!wallet) {
    const soloRed = sumSoloRedemptionsForPhone(redemptions, canonical);
    return {
      ordersCount,
      points: soloEarned,
      spendablePoints: Math.max(0, soloEarned - soloRed),
      wallet: null,
    };
  }

  const entry = wallet.members.find((m) => phonesEqualPl(m.phone, canonical));
  if (!entry) {
    const soloRed = sumSoloRedemptionsForPhone(redemptions, canonical);
    return {
      ordersCount,
      points: soloEarned,
      spendablePoints: Math.max(0, soloEarned - soloRed),
      wallet: null,
    };
  }

  const isHead = phonesEqualPl(wallet.headPhone, canonical);

  if (entry.status === "pending") {
    const soloRed = sumSoloRedemptionsForPhone(redemptions, canonical);
    const membersPayload: CustomerWalletPayload["members"] = await Promise.all(
      wallet.members.map(async (m) => ({
        phone: m.phone,
        status: m.status,
        isHead: phonesEqualPl(m.phone, wallet.headPhone),
        contributedPoints: await earnedPointsForPhone(m.phone, orders),
      }))
    );
    return {
      ordersCount,
      points: soloEarned,
      spendablePoints: Math.max(0, soloEarned - soloRed),
      wallet: {
        id: wallet.id,
        role: isHead ? "head" : "member",
        myStatus: "pending",
        poolEarned: 0,
        spendablePool: 0,
        myContributedPoints: soloEarned,
        headRedeemCap: 0,
        memberRedeemCap: Math.max(0, soloEarned - soloRed),
        members: membersPayload,
        corporate: wallet.corporate
          ? { slug: wallet.corporate.slug, name: wallet.corporate.name }
          : undefined,
      },
    };
  }

  // --- Corporate wallets (audit §3.4) ----------------------------------
  // Each employee behaves as a solo customer for earnings + redemptions —
  // their personal points stay with them. The HEAD additionally accrues a
  // month-to-date bonus equal to `headBonusBps` × (sum of all active
  // members' this-month order points). The bonus is recomputed on read
  // and folded into the head's spendablePoints so it's immediately usable
  // for rewards.
  if (wallet.corporate) {
    const soloRed = sumSoloRedemptionsForPhone(redemptions, canonical);
    const walletRedByMe = sumMemberWalletRedemptions(redemptions, wallet.id, canonical);
    const mySpendable = Math.max(0, soloEarned - soloRed - walletRedByMe);

    let headBonus = 0;
    let monthlyPool = 0;
    if (isHead) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const activePhones = wallet.members
        .filter((m) => m.status === "active")
        .map((m) => m.phone);
      // Indexed phone-by-phone query so we don't rescan the entire
      // orders table per member. Each call uses orders_customer_phone_idx.
      for (const p of activePhones) {
        const monthOrders = await getOrdersByPhone(p, {
          sinceIso: monthStart.toISOString(),
        });
        monthlyPool += monthOrders.reduce(
          (sum, o) => sum + Math.floor(o.totalAmount / 100),
          0,
        );
      }
      headBonus = Math.floor((monthlyPool * wallet.corporate.headBonusBps) / 10_000);
    }

    const membersPayload: CustomerWalletPayload["members"] = await Promise.all(
      wallet.members.map(async (m) => ({
        phone: m.phone,
        status: m.status,
        isHead: phonesEqualPl(m.phone, wallet.headPhone),
        contributedPoints: await earnedPointsForPhone(m.phone, orders),
      })),
    );

    return {
      ordersCount,
      points: soloEarned + headBonus,
      spendablePoints: mySpendable + headBonus,
      wallet: {
        id: wallet.id,
        role: isHead ? "head" : "member",
        myStatus: "active",
        // Surface the rolling head-bonus pool so the head's UI can show
        // "428 pts head bonus this month". Members see 0 — they have no
        // pool exposure.
        poolEarned: isHead ? monthlyPool : 0,
        spendablePool: isHead ? headBonus : 0,
        myContributedPoints: soloEarned,
        headRedeemCap: mySpendable + headBonus,
        memberRedeemCap: mySpendable,
        members: membersPayload,
        corporate: { slug: wallet.corporate.slug, name: wallet.corporate.name },
      },
    };
  }

  const activePhones = wallet.members
    .filter((m) => m.status === "active")
    .map((m) => m.phone);

  let poolEarned = 0;
  for (const p of activePhones) {
    poolEarned += await earnedPointsForPhone(p, orders);
  }

  const totalWalletRed = sumWalletRedemptions(redemptions, wallet.id);
  const spendablePool = Math.max(0, poolEarned - totalWalletRed);

  const myContributedPoints = soloEarned;
  const myWalletRed = sumMemberWalletRedemptions(redemptions, wallet.id, canonical);
  const memberRedeemCap = Math.min(
    spendablePool,
    Math.max(0, myContributedPoints - myWalletRed)
  );
  const headRedeemCap = spendablePool;
  const spendablePoints = isHead ? headRedeemCap : memberRedeemCap;

  const membersPayload: CustomerWalletPayload["members"] = await Promise.all(
    wallet.members.map(async (m) => {
      const contrib = await earnedPointsForPhone(m.phone, orders);
      return {
        phone: m.phone,
        status: m.status,
        isHead: phonesEqualPl(m.phone, wallet.headPhone),
        contributedPoints: contrib,
      };
    })
  );

  return {
    ordersCount,
    points: poolEarned,
    spendablePoints,
    wallet: {
      id: wallet.id,
      role: isHead ? "head" : "member",
      myStatus: "active",
      poolEarned,
      spendablePool,
      myContributedPoints,
      headRedeemCap,
      memberRedeemCap,
      members: membersPayload,
      // Corporate wallets returned earlier; this branch is non-corporate
      // family wallets only, so `corporate` is always undefined here.
    },
  };
}

export async function redeemLoyaltyReward(
  phone: string,
  rewardId: string,
  pointsCost: number
): Promise<{ ok: true } | { error: string }> {
  if (!Number.isFinite(pointsCost) || pointsCost <= 0) {
    return { error: "Invalid points" };
  }

  const canonical = normalizePlPhoneE164(phone) || phone.trim();
  const ctx = await resolveCustomerLoyalty(canonical);

  if (pointsCost > ctx.spendablePoints) {
    return { error: "Not enough points to redeem" };
  }

  return withLock("wallet-redemptions.json", async () => {
    const list = await readJSON<WalletRedemption[]>("wallet-redemptions.json", []);
    const ctx2 = await resolveCustomerLoyalty(canonical);
    if (pointsCost > ctx2.spendablePoints) {
      return { error: "Not enough points to redeem" };
    }
    let wid: string | null = null;
    if (ctx2.wallet && ctx2.wallet.myStatus === "active") {
      wid = ctx2.wallet.id;
    }
    list.push({
      id: `r-${crypto.randomUUID()}`,
      walletId: wid,
      phone: canonical,
      points: pointsCost,
      rewardId,
      createdAt: new Date().toISOString(),
    });
    await writeJSON("wallet-redemptions.json", list);
    return { ok: true };
  });
}

// --- Admin: family wallets + redemption ledger (support / ops) ---

export interface AdminWalletMemberSummary {
  phone: string;
  status: WalletMemberStatus;
  isHead: boolean;
  contributedPoints: number;
}

export interface AdminWalletSummary {
  id: string;
  headPhone: string;
  createdAt: string;
  memberCount: number;
  poolEarned: number;
  spendablePool: number;
  totalRedeemed: number;
  members: AdminWalletMemberSummary[];
}

export async function getAdminWalletSummaries(): Promise<AdminWalletSummary[]> {
  const wallets = await getFamilyWallets();
  const orders = await getOrders();
  const redemptions = await getWalletRedemptions();
  const summaries: AdminWalletSummary[] = [];

  for (const w of wallets) {
    const activePhones = w.members
      .filter((m) => m.status === "active")
      .map((m) => m.phone);
    let poolEarned = 0;
    const members: AdminWalletMemberSummary[] = [];
    for (const m of w.members) {
      const contrib = await earnedPointsForPhone(m.phone, orders);
      members.push({
        phone: m.phone,
        status: m.status,
        isHead: phonesEqualPl(m.phone, w.headPhone),
        contributedPoints: contrib,
      });
    }
    for (const p of activePhones) {
      poolEarned += await earnedPointsForPhone(p, orders);
    }
    const totalRedeemed = redemptions
      .filter((r) => r.walletId === w.id)
      .reduce((s, r) => s + r.points, 0);
    const spendablePool = Math.max(0, poolEarned - totalRedeemed);
    summaries.push({
      id: w.id,
      headPhone: w.headPhone,
      createdAt: w.createdAt,
      memberCount: w.members.length,
      poolEarned,
      spendablePool,
      totalRedeemed,
      members,
    });
  }
  return summaries;
}

export async function adminDeleteFamilyWallet(walletId: string): Promise<boolean> {
  return withLock("wallets.json", async () => {
    const list = await readJSON<FamilyWallet[]>("wallets.json", []);
    const next = list.filter((x) => x.id !== walletId);
    if (next.length === list.length) return false;
    await writeJSON("wallets.json", next);
    return true;
  });
}

export async function adminForceRemoveWalletMember(
  walletId: string,
  targetRaw: string
): Promise<{ ok: true } | { error: string }> {
  const target = normalizePlPhoneE164(targetRaw) || targetRaw.trim();
  return withLock("wallets.json", async () => {
    const list = await readJSON<FamilyWallet[]>("wallets.json", []);
    const w = list.find((x) => x.id === walletId);
    if (!w) return { error: "Wallet not found" };
    if (phonesEqualPl(target, w.headPhone)) {
      return {
        error: "Cannot remove wallet head — dissolve the wallet instead",
      };
    }
    const idx = w.members.findIndex((mem) => phonesEqualPl(mem.phone, target));
    if (idx === -1) return { error: "Member not found" };
    w.members.splice(idx, 1);
    await writeJSON("wallets.json", list);
    return { ok: true };
  });
}

/** Removes a ledger row; restores customer spendable balance logic on next identify. */
export async function adminVoidWalletRedemption(id: string): Promise<boolean> {
  const trimmed = id.trim();
  return withLock("wallet-redemptions.json", async () => {
    const list = await readJSON<WalletRedemption[]>("wallet-redemptions.json", []);
    const next = list.filter((r) => r.id !== trimmed);
    if (next.length === list.length) return false;
    await writeJSON("wallet-redemptions.json", next);
    return true;
  });
}

export async function getAllManualPoints(): Promise<Record<string, number>> {
  const all = await getPointAdjustments();
  const byPhone: Record<string, number> = {};
  for (const adj of all) {
    byPhone[adj.phone] = (byPhone[adj.phone] || 0) + adj.amount;
  }
  return byPhone;
}

// --- Referrals ---

export interface Referral {
  code: string;
  owner: string;
  ownerPhone: string;
  used: number;
  earned: number;
  createdAt: string;
}

export async function getReferrals(): Promise<Referral[]> {
  return readJSON<Referral[]>("referrals.json", []);
}

export async function addReferral(referral: Referral): Promise<Referral> {
  return withLock("referrals.json", async () => {
    const list = await readJSON<Referral[]>("referrals.json", []);
    if (list.some((r) => r.code === referral.code)) return referral;
    list.push(referral);
    await writeJSON("referrals.json", list);
    return referral;
  });
}

export async function deleteReferral(code: string): Promise<boolean> {
  return withLock("referrals.json", async () => {
    const list = await readJSON<Referral[]>("referrals.json", []);
    const initialLength = list.length;
    const filtered = list.filter((r) => r.code !== code);
    if (filtered.length === initialLength) {
      return false;
    }
    await writeJSON("referrals.json", filtered);
    return true;
  });
}

// --- Feedback ---

export const FEEDBACK_SENTIMENTS = ["positive", "neutral", "negative"] as const;
export type FeedbackSentiment = (typeof FEEDBACK_SENTIMENTS)[number];

export interface FeedbackEntry {
  id: string;
  orderId: string;
  customerName: string;
  customerPhone: string;
  locationSlug: string;
  date: string;
  overallRating: number;
  categoryRatings: Record<string, number>;
  comment: string;
  status: "new" | "reviewed" | "responded";
  /** Set by the sentiment analyzer. Absent until the analyze endpoint runs. */
  sentiment?: FeedbackSentiment;
  /** Short normalized topic tags: "dough quality", "speed", "staff friendliness". */
  themes?: string[];
  /** ISO timestamp of the last sentiment scan. */
  analyzedAt?: string;
}

const FEEDBACK_DDL = [
  `CREATE TABLE IF NOT EXISTS feedback (
    id text PRIMARY KEY,
    order_id text NOT NULL,
    location_slug text NOT NULL,
    customer_name text NOT NULL,
    customer_phone text NOT NULL,
    overall_rating integer NOT NULL,
    category_ratings jsonb NOT NULL DEFAULT '{}'::jsonb,
    comment text NOT NULL,
    status text NOT NULL,
    sentiment text,
    themes text[],
    analyzed_at timestamptz,
    created_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS feedback_location_created_idx
    ON feedback (location_slug, created_at)`,
  `CREATE INDEX IF NOT EXISTS feedback_status_idx ON feedback (status)`,
  `CREATE INDEX IF NOT EXISTS feedback_order_id_idx ON feedback (order_id)`,
];

async function ensureFeedbackTable(): Promise<void> {
  await ensureTable("feedback", FEEDBACK_DDL);
}

function rowToFeedback(row: typeof feedbackTable.$inferSelect): FeedbackEntry {
  return {
    id: row.id,
    orderId: row.orderId,
    locationSlug: row.locationSlug,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    overallRating: row.overallRating,
    categoryRatings: (row.categoryRatings as Record<string, number>) ?? {},
    comment: row.comment,
    status: row.status as FeedbackEntry["status"],
    sentiment: (row.sentiment as FeedbackSentiment | null) ?? undefined,
    themes: row.themes ?? undefined,
    analyzedAt: row.analyzedAt ? row.analyzedAt.toISOString() : undefined,
    date: row.createdAt.toISOString(),
  };
}

async function dualWriteFeedback(entry: FeedbackEntry): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await ensureFeedbackTable();
    const values = {
      id: entry.id,
      orderId: entry.orderId,
      locationSlug: entry.locationSlug,
      customerName: entry.customerName,
      customerPhone: entry.customerPhone,
      overallRating: entry.overallRating,
      categoryRatings: entry.categoryRatings,
      comment: entry.comment,
      status: entry.status,
      sentiment: entry.sentiment ?? null,
      themes: entry.themes ?? null,
      analyzedAt: entry.analyzedAt ? new Date(entry.analyzedAt) : null,
      createdAt: new Date(entry.date),
    };
    await db
      .insert(feedbackTable)
      .values(values)
      .onConflictDoUpdate({ target: feedbackTable.id, set: values });
  } catch (err) {
    logger.warn("dualWriteFeedback failed", { id: entry.id, layer: "store.feedback" }, err);
  }
}

export async function getFeedback(): Promise<FeedbackEntry[]> {
  const db = getDb();
  if (db) {
    try {
      await ensureFeedbackTable();
      const rows = await db
        .select()
        .from(feedbackTable)
        .orderBy(desc(feedbackTable.createdAt));
      if (rows.length > 0) return rows.map(rowToFeedback);
    } catch (err) {
      logger.warn("getFeedback DB read failed; falling back", { layer: "store.feedback" }, err);
    }
  }
  const list = await readJSON<FeedbackEntry[]>("feedback.json", []);
  if (list.length > 0) {
    bumpLazyBackfillHit("feedback");
    void Promise.all(list.map((f) => dualWriteFeedback(f)));
  }
  return list;
}

export async function saveFeedback(entry: FeedbackEntry): Promise<FeedbackEntry> {
  return withLock("feedback.json", async () => {
    const list = await readJSON<FeedbackEntry[]>("feedback.json", []);
    const idx = list.findIndex((f) => f.id === entry.id);
    if (idx >= 0) {
      list[idx] = entry;
    } else {
      list.push(entry);
    }
    await writeJSON("feedback.json", list);
    await dualWriteFeedback(entry);
    return entry;
  });
}

export async function updateFeedbackStatus(id: string, status: FeedbackEntry["status"]): Promise<FeedbackEntry | null> {
  return withLock("feedback.json", async () => {
    const list = await readJSON<FeedbackEntry[]>("feedback.json", []);
    const idx = list.findIndex((f) => f.id === id);
    if (idx === -1) return null;
    list[idx].status = status;
    await writeJSON("feedback.json", list);
    await dualWriteFeedback(list[idx]);
    return list[idx];
  });
}

/**
 * Persist sentiment-analysis results for one or more feedback entries. Used
 * by the analyze endpoint to write Claude's batch output back without
 * touching customer-controlled fields (comment, rating).
 */
export async function setFeedbackAnalysis(
  updates: { id: string; sentiment: FeedbackSentiment; themes: string[] }[],
): Promise<number> {
  const written: FeedbackEntry[] = [];
  const n = await withLock("feedback.json", async () => {
    const list = await readJSON<FeedbackEntry[]>("feedback.json", []);
    const byId = new Map(updates.map((u) => [u.id, u]));
    const now = new Date().toISOString();
    let count = 0;
    for (const entry of list) {
      const u = byId.get(entry.id);
      if (!u) continue;
      entry.sentiment = u.sentiment;
      entry.themes = u.themes;
      entry.analyzedAt = now;
      written.push(entry);
      count++;
    }
    await writeJSON("feedback.json", list);
    return count;
  });
  // Mirror outside the lock — these are independent rows.
  await Promise.all(written.map((e) => dualWriteFeedback(e)));
  return n;
}

// ── Chatbot FAQ ──────────────────────────────────────────────

export interface ChatbotFaq {
  id: string;
  keyword: string;
  response: string;
  hits: number;
}

export async function getChatbotFaqs(): Promise<ChatbotFaq[]> {
  return readJSON<ChatbotFaq[]>("chatbot-faq.json", []);
}

export async function saveChatbotFaq(faq: ChatbotFaq): Promise<ChatbotFaq> {
  return withLock("chatbot-faq.json", async () => {
    const list = await readJSON<ChatbotFaq[]>("chatbot-faq.json", []);
    const idx = list.findIndex((f) => f.id === faq.id);
    if (idx >= 0) {
      list[idx] = faq;
    } else {
      list.push(faq);
    }
    await writeJSON("chatbot-faq.json", list);
    return faq;
  });
}

export async function deleteChatbotFaq(id: string): Promise<boolean> {
  return withLock("chatbot-faq.json", async () => {
    const list = await readJSON<ChatbotFaq[]>("chatbot-faq.json", []);
    const idx = list.findIndex((f) => f.id === id);
    if (idx === -1) return false;
    list.splice(idx, 1);
    await writeJSON("chatbot-faq.json", list);
    return true;
  });
}

// --- Upsell / Cross-Sell Settings (per-location) ---

export interface LocationComboDeal {
  id: string;
  name: string;
  description: string;
  categories: string[];
  discountPercent: number;
  minItems: number;
  active: boolean;
  /** Optional item-suffix gating (Italian Classic Deal). */
  requiredItems?: { suffix: string; label: string }[];
  /** Channel restriction (audit §3). Unset = both channels. */
  channel?: "dine-in" | "delivery";
}

/**
 * Cart-drawer time-of-day banner — audit §2.3.
 * Stored next to combos in upsell-settings.json so admins can re-tune the
 * hour windows, copy, and CTAs without a code push.
 */
export interface LocationTimeWindow {
  id: string;
  /** "morning" | "lunch" | "afternoon" | "dinner" | "late" — drives the skin. */
  variant: string;
  /** Local-hour interval, [start, end). 24h clock, 0–23. */
  startHour: number;
  endHour: number;
  title: string;
  sub: string;
  badge: string;
  cta: string;
  /** Optional menu-item id suffix (e.g. "espresso") to one-tap-add when the
   *  CTA is tapped. Empty string means the CTA is informational/deep-link. */
  addItemIdSuffix?: string;
  active: boolean;
}

/**
 * Bundle ladder definition (audit §3.2). Stored next to combos so the same
 * /admin/upsell page edits both. When empty or unset, the customer cart
 * falls back to `DEFAULT_BUNDLES` from src/lib/bundles.ts.
 */
export interface LocationBundleSlot {
  /** "category" → any item of `category`; "item" → menu items whose id
   *  ends with `itemIdSuffix` (e.g. "anti-bruschetta"). */
  kind: "category" | "item";
  category?: string;
  itemIdSuffix?: string;
  quantity: number;
}

export interface LocationBundle {
  id: string;
  /** Short tier label rendered in the chip header — Solo / Lunch / Lunch+ / Hungry. */
  tier: string;
  name: string;
  description: string;
  priceGrosze: number;
  /** Strikethrough reference price — drives the "Save X" badge. */
  refPriceGrosze: number;
  composition: LocationBundleSlot[];
  /** "lunch" | "family" — drives which ladder shows in the cart. */
  mealPeriod: string;
  isAnchor?: boolean;
  isDecoy?: boolean;
  isDefault?: boolean;
  active: boolean;
}

export interface LocationUpsellConfig {
  popularItems: string[];
  staffPicks: string[];
  /** Menu-engineering badges (audit §4.3) consolidated into the cross-sell
   *  "Menu badges" tab so operators don't have to chase per-item edit
   *  dialogs. Items listed here render the matching badge in /admin/menu
   *  and on the customer card, additively to any intrinsic `menuRole` on
   *  the seed item. Optional for back-compat with pre-existing saved
   *  configs. */
  heroItems?: string[];
  pizzaioloChoiceItems?: string[];
  chefSignatureItems?: string[];
  /** Items shown with the green "New" badge. Replaces the previously
   *  hardcoded NEW_ITEMS constant so launches don't require a deploy. */
  newItems?: string[];
  preferredCoffee: string;
  preferredDessert: string;
  preferredDrink: string;
  /** Audit §3 — fourth slot in "Complete your meal". Admin-configurable
   *  so operators can swap garlic bread for bruschetta / arancini etc.
   *  Optional for back-compat with pre-existing saved configs. */
  preferredGarlicBread?: string;
  combos: LocationComboDeal[];
  /** Optional. Falls back to DEFAULT_TIME_WINDOWS in src/lib/upsell.ts when
   *  unset or empty so existing locations keep working before the admin
   *  has saved a custom schedule. */
  timeWindows?: LocationTimeWindow[];
  /** Optional. Falls back to DEFAULT_BUNDLES in src/lib/bundles.ts when
   *  unset or empty so the cart ladder still has tiers to render. */
  bundles?: LocationBundle[];
  /**
   * Per-ladder availability rules (audit §3.2 follow-up). Lunch ladder
   * is hour-gated, Family Feast ladder is quantity-gated. Falls back to
   * DEFAULT_BUNDLE_RULES from src/lib/bundles.ts when unset.
   */
  bundleRules?: {
    lunch?: { startHour: number; endHour: number };
    family?: { minMainItems: number; hintWithin: number };
  };
}

export type UpsellSettings = Record<string, LocationUpsellConfig>;

/** Replaces legacy `meal-deal` combo entries with the item-locked
 *  `italian-classic` shape (Margherita + Limonata + Tiramisù — audit §3
 *  moved the trigger off Espresso because it has 60% organic attach,
 *  meaning the combo was subsidising a behaviour customers already do
 *  for free). Also retires the dead `lunch-special` (panino + drink,
 *  8% off, ~0% activation) — admins who had it disabled keep it dropped;
 *  admins who had it active see it replaced with the new `pizza-side`
 *  combo (any pizza + garlic bread, 12%). Runs on every read of the
 *  upsell config so admin UIs and customer-side rendering see the
 *  renamed combo without a one-shot migration script. */
function migrateLegacyMealDeal(settings: UpsellSettings): UpsellSettings {
  let changed = false;
  const out: UpsellSettings = {};
  for (const [slug, raw] of Object.entries(settings)) {
    const cfg = raw as LocationUpsellConfig & {
      combos?: Array<{
        id: string;
        name: string;
        description: string;
        categories: string[];
        discountPercent: number;
        minItems: number;
        active: boolean;
        requiredItems?: { suffix: string; label: string }[];
      }>;
    };
    if (
      !cfg?.combos?.some(
        (c) => c.id === "meal-deal" || c.id === "lunch-special",
      ) &&
      !cfg?.combos?.some(
        (c) =>
          c.id === "italian-classic" &&
          c.requiredItems?.some((r) => r.suffix === "drink-espresso"),
      )
    ) {
      out[slug] = raw;
      continue;
    }
    changed = true;
    const migrated = cfg.combos!
      // De-dupe: if both meal-deal and italian-classic somehow coexist in
      // a saved config (re-import / hand edit), drop meal-deal entirely.
      .filter(
        (c) =>
          !(
            c.id === "meal-deal" &&
            cfg.combos!.some((x) => x.id === "italian-classic")
          ),
      )
      // Retire the dead Lunch Special panini combo (audit §3).
      .filter((c) => c.id !== "lunch-special")
      .map((c) => {
        if (c.id === "meal-deal") {
          return {
            id: "italian-classic",
            name: "Italian Classic Deal",
            description: "Margherita + Limonata + Tiramisù",
            categories: ["pizza", "drinks", "desserts"],
            discountPercent: c.discountPercent,
            minItems: c.minItems,
            active: c.active,
            requiredItems: [
              { suffix: "pizza-margherita", label: "Margherita" },
              { suffix: "drink-limonata", label: "Limonata" },
              { suffix: "dessert-tiramisu", label: "Tiramisù" },
            ],
          };
        }
        // Migrate any existing italian-classic still locked on Espresso
        // to the new Limonata trigger.
        if (
          c.id === "italian-classic" &&
          c.requiredItems?.some((r) => r.suffix === "drink-espresso")
        ) {
          return {
            ...c,
            description: "Margherita + Limonata + Tiramisù",
            requiredItems: c.requiredItems.map((r) =>
              r.suffix === "drink-espresso"
                ? { suffix: "drink-limonata", label: "Limonata" }
                : r,
            ),
          };
        }
        return c;
      });
    out[slug] = { ...cfg, combos: migrated } as LocationUpsellConfig;
  }
  return changed ? out : settings;
}

export async function getUpsellSettings(): Promise<UpsellSettings> {
  const raw = await readJSON<UpsellSettings>("upsell-settings.json", {});
  return migrateLegacyMealDeal(raw);
}

// ─── Bundle audit log (Sprint 3 #12) ─────────────────────────────────────
//
// Every order that applies a bundle writes one event here so the operator
// can answer the cannibalization / margin / tier-mix questions the §3.2
// red-team audit raised. Append-only JSON; readers aggregate live.

export interface BundleEvent {
  id: string;
  orderId: string;
  bundleId: string;
  bundleName: string;
  locationSlug: string;
  pricingMode: "fixed" | "dynamic";
  mainsCount: number;
  mainsSubtotalGrosze: number;
  addOnsSubtotalGrosze: number;
  refPriceGrosze: number;
  finalPriceGrosze: number;
  savingsGrosze: number;
  customerPhone: string;
  /** Experiment variant id when an A/B was running for this customer. */
  experimentVariant?: string;
  /** Slot the bundle order is fulfilled in — links to capacity / wait
   *  analytics so the operator can see whether bundles drive slots to
   *  the brink (Sprint 7 #7). */
  slotId?: string;
  /** Customer cohort at the moment the order was placed. "new" = first
   *  ever order, "repeat" = customer had ≥1 prior order. Used by the
   *  KPI dashboard to split bundle penetration by acquisition vs LTV
   *  (Sprint 7 #6). */
  customerCohort?: "new" | "repeat";
  /** Total prior order count for the customer at the moment of this
   *  event — finer-grained LTV signal than the boolean cohort. */
  customerOrderCount?: number;
  /** Estimated contribution margin at this price (0..1). Computed from
   *  MenuItem.cost at write time so a per-event margin alert can fire
   *  for operators when a bundle goes underwater (Sprint 8 #10). */
  marginRatio?: number;
  /** Per-unit add-on composition the customer picked for this bundle.
   *  Reused by the composer's "same as last time" one-tap re-apply
   *  (Sprint 8 #8) — the customer's prior choices pre-fill the new
   *  composer when they return. */
  addOnComposition?: { menuItemId: string; quantity: number }[];
  createdAt: string;
}

export async function appendBundleEvent(event: BundleEvent): Promise<void> {
  await withLock("bundle-events.json", async () => {
    const events = await readJSON<BundleEvent[]>("bundle-events.json", []);
    events.push(event);
    await writeJSON("bundle-events.json", events);
  });
  incrCounter("bundles.applied");
}

export async function getBundleEvents(opts?: {
  locationSlug?: string;
  sinceIso?: string;
}): Promise<BundleEvent[]> {
  const all = await readJSON<BundleEvent[]>("bundle-events.json", []);
  return all.filter((e) => {
    if (opts?.locationSlug && e.locationSlug !== opts.locationSlug) return false;
    if (opts?.sinceIso && e.createdAt < opts.sinceIso) return false;
    return true;
  });
}

// ─── Bundle funnel events (Sprint 7 #5) ──────────────────────────────────
//
// Client-side beacons capture the funnel before the customer commits —
// ladder impressions, composer opens, abandons. Combined with the
// BundleEvent log (applies) this gives the operator the full
// impression → consideration → conversion view that lets them tell
// "low penetration because no one sees it" from "low penetration because
// no one likes it".

export type BundleFunnelKind = "impression" | "composer_opened" | "composer_abandoned";

export interface BundleFunnelEvent {
  id: string;
  kind: BundleFunnelKind;
  bundleId: string;
  locationSlug: string;
  customerPhone?: string;
  experimentVariant?: string;
  createdAt: string;
}

export async function appendBundleFunnelEvent(event: BundleFunnelEvent): Promise<void> {
  await withLock("bundle-funnel.json", async () => {
    const list = await readJSON<BundleFunnelEvent[]>("bundle-funnel.json", []);
    list.push(event);
    await writeJSON("bundle-funnel.json", list);
  });
  incrCounter(`bundles.funnel.${event.kind}`);
}

export async function getBundleFunnelEvents(opts?: {
  locationSlug?: string;
  sinceIso?: string;
}): Promise<BundleFunnelEvent[]> {
  const all = await readJSON<BundleFunnelEvent[]>("bundle-funnel.json", []);
  return all.filter((e) => {
    if (opts?.locationSlug && e.locationSlug !== opts.locationSlug) return false;
    if (opts?.sinceIso && e.createdAt < opts.sinceIso) return false;
    return true;
  });
}

// ─── Scheduled bundle intents (Sprint 4 #17) ─────────────────────────────
//
// Pret-style "make this my weekly usual" intent capture. Phase 1 just
// persists the customer's preference + a snapshot of the bundle they
// applied; Phase 2 wires Stripe Subscriptions to actually rebill on the
// chosen weekday. Keeping the intent table separate from orders keeps
// the lifecycle stages clean — intent → review → activate → rebill.

export type Weekday =
  | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

export interface ScheduledBundleIntent {
  id: string;
  customerPhone: string;
  locationSlug: string;
  bundleId: string;
  bundleName: string;
  weekday: Weekday;
  /** Wall-clock time the customer wants the order ready (HH:MM). */
  readyAt: string;
  /** Cart snapshot — bundle composition at the time of opt-in. */
  cartSnapshot: { menuItemId: string; quantity: number }[];
  /** "pending" = captured, awaiting operator review.
   *  "active"  = operator approved + Stripe Subscription created.
   *  "paused"  = customer paused (or auto-paused on payment failure).
   *  "cancelled" = customer cancelled. */
  status: "pending" | "active" | "paused" | "cancelled";
  createdAt: string;
  updatedAt: string;
}

export async function appendScheduledBundleIntent(intent: ScheduledBundleIntent): Promise<void> {
  await withLock("scheduled-bundles.json", async () => {
    const list = await readJSON<ScheduledBundleIntent[]>("scheduled-bundles.json", []);
    list.push(intent);
    await writeJSON("scheduled-bundles.json", list);
  });
  incrCounter("scheduled_bundles.captured");
}

export async function getScheduledBundleIntents(opts?: {
  locationSlug?: string;
  customerPhone?: string;
  status?: ScheduledBundleIntent["status"];
}): Promise<ScheduledBundleIntent[]> {
  const all = await readJSON<ScheduledBundleIntent[]>("scheduled-bundles.json", []);
  return all.filter((s) => {
    if (opts?.locationSlug && s.locationSlug !== opts.locationSlug) return false;
    if (opts?.customerPhone && s.customerPhone !== opts.customerPhone) return false;
    if (opts?.status && s.status !== opts.status) return false;
    return true;
  });
}

export async function updateScheduledBundleIntent(
  id: string,
  patch: Partial<Pick<ScheduledBundleIntent, "status" | "weekday" | "readyAt">>,
): Promise<ScheduledBundleIntent | null> {
  return withLock("scheduled-bundles.json", async () => {
    const list = await readJSON<ScheduledBundleIntent[]>("scheduled-bundles.json", []);
    const idx = list.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    const updated: ScheduledBundleIntent = {
      ...list[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    list[idx] = updated;
    await writeJSON("scheduled-bundles.json", list);
    return updated;
  });
}

export async function updateUpsellSettings(settings: UpsellSettings): Promise<UpsellSettings> {
  return withLock("upsell-settings.json", async () => {
    await writeJSON("upsell-settings.json", settings);
    return settings;
  });
}

export async function updateLocationUpsell(
  locationSlug: string,
  config: LocationUpsellConfig
): Promise<UpsellSettings> {
  return withLock("upsell-settings.json", async () => {
    const settings = await readJSON<UpsellSettings>("upsell-settings.json", {});
    settings[locationSlug] = config;
    await writeJSON("upsell-settings.json", settings);
    return settings;
  });
}

// --- Inventory: stock levels + movements (m1_5: dual-write) -------------

const INGREDIENT_STOCK_DDL = [
  `CREATE TABLE IF NOT EXISTS ingredient_stock (
    ingredient_id text NOT NULL,
    location_slug text NOT NULL,
    on_hand integer NOT NULL,
    par_level integer NOT NULL,
    reorder_point integer NOT NULL,
    last_counted_at timestamptz,
    last_counted_by text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (ingredient_id, location_slug)
  )`,
  `CREATE INDEX IF NOT EXISTS ingredient_stock_location_idx
    ON ingredient_stock (location_slug)`,
];
const STOCK_MOVEMENTS_DDL = [
  `CREATE TABLE IF NOT EXISTS stock_movements (
    id text PRIMARY KEY,
    ingredient_id text NOT NULL,
    location_slug text NOT NULL,
    type text NOT NULL,
    quantity integer NOT NULL,
    cost_impact integer,
    reason text,
    by_user text,
    occurred_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS stock_movements_ingredient_occurred_idx
    ON stock_movements (ingredient_id, occurred_at)`,
  `CREATE INDEX IF NOT EXISTS stock_movements_location_occurred_idx
    ON stock_movements (location_slug, occurred_at)`,
];

async function ensureIngredientStockTable(): Promise<void> {
  await ensureTable("ingredient_stock", INGREDIENT_STOCK_DDL);
}
async function ensureStockMovementsTable(): Promise<void> {
  await ensureTable("stock_movements", STOCK_MOVEMENTS_DDL);
}

function rowToStock(row: typeof ingredientStockTable.$inferSelect): IngredientStock {
  return {
    ingredientId: row.ingredientId,
    locationSlug: row.locationSlug,
    onHand: row.onHand,
    parLevel: row.parLevel,
    reorderPoint: row.reorderPoint,
    lastCountedAt: row.lastCountedAt ? row.lastCountedAt.toISOString() : undefined,
    lastCountedBy: row.lastCountedBy ?? undefined,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function rowToMovement(row: typeof stockMovementsTable.$inferSelect): StockMovement {
  return {
    id: row.id,
    ingredientId: row.ingredientId,
    locationSlug: row.locationSlug,
    type: row.type as StockMovement["type"],
    quantity: row.quantity,
    costImpact: row.costImpact ?? undefined,
    reason: row.reason ?? undefined,
    byUser: row.byUser ?? undefined,
    occurredAt: row.occurredAt.toISOString(),
  };
}

async function dualWriteStock(stock: IngredientStock): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await ensureIngredientStockTable();
    const values = {
      ingredientId: stock.ingredientId,
      locationSlug: stock.locationSlug,
      onHand: stock.onHand,
      parLevel: stock.parLevel,
      reorderPoint: stock.reorderPoint,
      lastCountedAt: stock.lastCountedAt ? new Date(stock.lastCountedAt) : null,
      lastCountedBy: stock.lastCountedBy ?? null,
      updatedAt: new Date(stock.updatedAt),
    };
    await db
      .insert(ingredientStockTable)
      .values(values)
      .onConflictDoUpdate({
        target: [ingredientStockTable.ingredientId, ingredientStockTable.locationSlug],
        set: values,
      });
  } catch (err) {
    logger.warn("dualWriteStock failed", { ...stock, layer: "store.stock" }, err);
  }
}

async function dualDeleteStock(ingredientId: string, locationSlug: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await ensureIngredientStockTable();
    await db
      .delete(ingredientStockTable)
      .where(
        and(
          eq(ingredientStockTable.ingredientId, ingredientId),
          eq(ingredientStockTable.locationSlug, locationSlug),
        ),
      );
  } catch (err) {
    logger.warn("dualDeleteStock failed", { ingredientId, locationSlug, layer: "store.stock" }, err);
  }
}

async function dualWriteMovement(movement: StockMovement): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await ensureStockMovementsTable();
    // Movements are append-only; ON CONFLICT DO NOTHING is enough.
    await db
      .insert(stockMovementsTable)
      .values({
        id: movement.id,
        ingredientId: movement.ingredientId,
        locationSlug: movement.locationSlug,
        type: movement.type,
        quantity: movement.quantity,
        costImpact: movement.costImpact ?? null,
        reason: movement.reason ?? null,
        byUser: movement.byUser ?? null,
        occurredAt: new Date(movement.occurredAt),
      })
      .onConflictDoNothing();
  } catch (err) {
    logger.warn("dualWriteMovement failed", { id: movement.id, layer: "store.stock_movements" }, err);
  }
}

export async function getIngredientStock(
  locationSlug?: string,
): Promise<IngredientStock[]> {
  const db = getDb();
  if (db) {
    try {
      await ensureIngredientStockTable();
      const rows = locationSlug
        ? await db
            .select()
            .from(ingredientStockTable)
            .where(eq(ingredientStockTable.locationSlug, locationSlug))
        : await db.select().from(ingredientStockTable);
      if (rows.length > 0) return rows.map(rowToStock);
    } catch (err) {
      logger.warn("getIngredientStock DB read failed; falling back", { layer: "store.stock" }, err);
    }
  }
  const all = await readJSON<IngredientStock[]>("ingredient-stock.json", []);
  const filtered = locationSlug ? all.filter((s) => s.locationSlug === locationSlug) : all;
  if (filtered.length > 0) {
    bumpLazyBackfillHit("ingredient_stock");
    void Promise.all(filtered.map((s) => dualWriteStock(s)));
  }
  return filtered;
}

export async function getStockForIngredient(
  ingredientId: string,
  locationSlug: string,
): Promise<IngredientStock | null> {
  const db = getDb();
  if (db) {
    try {
      await ensureIngredientStockTable();
      const rows = await db
        .select()
        .from(ingredientStockTable)
        .where(
          and(
            eq(ingredientStockTable.ingredientId, ingredientId),
            eq(ingredientStockTable.locationSlug, locationSlug),
          ),
        )
        .limit(1);
      if (rows.length > 0) return rowToStock(rows[0]);
    } catch (err) {
      logger.warn("getStockForIngredient DB read failed; falling back", { ingredientId, locationSlug, layer: "store.stock" }, err);
    }
  }
  const all = await readJSON<IngredientStock[]>("ingredient-stock.json", []);
  const hit =
    all.find((s) => s.ingredientId === ingredientId && s.locationSlug === locationSlug) ?? null;
  if (hit) {
    bumpLazyBackfillHit("ingredient_stock");
    void dualWriteStock(hit);
  }
  return hit;
}

export async function upsertIngredientStock(
  input: Omit<IngredientStock, "updatedAt"> & { updatedAt?: string },
): Promise<IngredientStock> {
  return withLock("ingredient-stock.json", async () => {
    const list = await readJSON<IngredientStock[]>("ingredient-stock.json", []);
    const i = list.findIndex(
      (s) => s.ingredientId === input.ingredientId && s.locationSlug === input.locationSlug,
    );
    const row: IngredientStock = {
      ...input,
      updatedAt: new Date().toISOString(),
    };
    if (i >= 0) list[i] = row;
    else list.push(row);
    await writeJSON("ingredient-stock.json", list);
    await dualWriteStock(row);
    return row;
  });
}

export async function deleteIngredientStock(
  ingredientId: string,
  locationSlug: string,
): Promise<boolean> {
  return withLock("ingredient-stock.json", async () => {
    const list = await readJSON<IngredientStock[]>("ingredient-stock.json", []);
    const filtered = list.filter(
      (s) => !(s.ingredientId === ingredientId && s.locationSlug === locationSlug),
    );
    if (filtered.length === list.length) return false;
    await writeJSON("ingredient-stock.json", filtered);
    await dualDeleteStock(ingredientId, locationSlug);
    return true;
  });
}

export async function getStockMovements(filters?: {
  locationSlug?: string;
  ingredientId?: string;
  limit?: number;
}): Promise<StockMovement[]> {
  const db = getDb();
  if (db) {
    try {
      await ensureStockMovementsTable();
      const whereClauses = [];
      if (filters?.locationSlug)
        whereClauses.push(eq(stockMovementsTable.locationSlug, filters.locationSlug));
      if (filters?.ingredientId)
        whereClauses.push(eq(stockMovementsTable.ingredientId, filters.ingredientId));
      const baseQuery = db
        .select()
        .from(stockMovementsTable)
        .orderBy(desc(stockMovementsTable.occurredAt));
      const filtered = whereClauses.length > 0 ? baseQuery.where(and(...whereClauses)) : baseQuery;
      const rows = filters?.limit ? await filtered.limit(filters.limit) : await filtered;
      if (rows.length > 0) return rows.map(rowToMovement);
    } catch (err) {
      logger.warn("getStockMovements DB read failed; falling back", { layer: "store.stock_movements" }, err);
    }
  }
  const all = await readJSON<StockMovement[]>("stock-movements.json", []);
  let list = all;
  if (filters?.locationSlug) list = list.filter((m) => m.locationSlug === filters.locationSlug);
  if (filters?.ingredientId) list = list.filter((m) => m.ingredientId === filters.ingredientId);
  list = list.slice().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  if (filters?.limit) list = list.slice(0, filters.limit);
  if (list.length > 0) {
    bumpLazyBackfillHit("stock_movements");
    void Promise.all(list.map((m) => dualWriteMovement(m)));
  }
  return list;
}

/**
 * Atomically appends a movement record and applies the delta to the matching
 * stock row (creating it with defaults if it doesn't exist yet). Both stores
 * are locked to keep onHand consistent with the movement log.
 */
export async function createStockMovement(input: Omit<StockMovement, "id" | "occurredAt"> & {
  occurredAt?: string;
}): Promise<StockMovement> {
  const movement: StockMovement = {
    id: `mv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    ingredientId: input.ingredientId,
    locationSlug: input.locationSlug,
    type: input.type,
    quantity: input.quantity,
    costImpact: input.costImpact,
    reason: input.reason,
    byUser: input.byUser,
  };

  await withLock("stock-movements.json", async () => {
    const list = await readJSON<StockMovement[]>("stock-movements.json", []);
    list.push(movement);
    await writeJSON("stock-movements.json", list);
  });
  await dualWriteMovement(movement);

  let updatedStock: IngredientStock | undefined;
  await withLock("ingredient-stock.json", async () => {
    const list = await readJSON<IngredientStock[]>("ingredient-stock.json", []);
    const i = list.findIndex(
      (s) => s.ingredientId === input.ingredientId && s.locationSlug === input.locationSlug,
    );
    if (i >= 0) {
      list[i] = {
        ...list[i],
        onHand: list[i].onHand + input.quantity,
        updatedAt: movement.occurredAt,
      };
      updatedStock = list[i];
    } else {
      const row: IngredientStock = {
        ingredientId: input.ingredientId,
        locationSlug: input.locationSlug,
        onHand: Math.max(0, input.quantity),
        parLevel: 0,
        reorderPoint: 0,
        updatedAt: movement.occurredAt,
      };
      list.push(row);
      updatedStock = row;
    }
    await writeJSON("ingredient-stock.json", list);
  });
  if (updatedStock) {
    await dualWriteStock(updatedStock);
  }

  return movement;
}

// --- Suppliers ---

export async function getSuppliers(): Promise<Supplier[]> {
  return readJSON<Supplier[]>("suppliers.json", []);
}

export async function getSupplier(id: string): Promise<Supplier | null> {
  const list = await readJSON<Supplier[]>("suppliers.json", []);
  return list.find((s) => s.id === id) ?? null;
}

export async function saveSupplier(input: Omit<Supplier, "id" | "createdAt"> & { id?: string; createdAt?: string }): Promise<Supplier> {
  return withLock("suppliers.json", async () => {
    const list = await readJSON<Supplier[]>("suppliers.json", []);
    const supplier: Supplier = {
      id: input.id || `sup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: input.name,
      contactName: input.contactName,
      email: input.email,
      phone: input.phone,
      leadTimeDays: input.leadTimeDays,
      notes: input.notes,
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
    const i = list.findIndex((s) => s.id === supplier.id);
    if (i >= 0) list[i] = supplier;
    else list.push(supplier);
    await writeJSON("suppliers.json", list);
    return supplier;
  });
}

export async function deleteSupplier(id: string): Promise<boolean> {
  return withLock("suppliers.json", async () => {
    const list = await readJSON<Supplier[]>("suppliers.json", []);
    const filtered = list.filter((s) => s.id !== id);
    if (filtered.length === list.length) return false;
    await writeJSON("suppliers.json", filtered);
    return true;
  });
}

// --- Purchase Orders ---

export async function getPurchaseOrders(filters?: {
  locationSlug?: string;
  status?: PurchaseOrderStatus;
  supplierId?: string;
}): Promise<PurchaseOrder[]> {
  const all = await readJSON<PurchaseOrder[]>("purchase-orders.json", []);
  let list = all;
  if (filters?.locationSlug) list = list.filter((p) => p.locationSlug === filters.locationSlug);
  if (filters?.status) list = list.filter((p) => p.status === filters.status);
  if (filters?.supplierId) list = list.filter((p) => p.supplierId === filters.supplierId);
  return list.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrder | null> {
  const list = await readJSON<PurchaseOrder[]>("purchase-orders.json", []);
  return list.find((p) => p.id === id) ?? null;
}

export async function savePurchaseOrder(
  input: Omit<PurchaseOrder, "id" | "createdAt" | "totalCents"> & { id?: string; createdAt?: string },
): Promise<PurchaseOrder> {
  return withLock("purchase-orders.json", async () => {
    const list = await readJSON<PurchaseOrder[]>("purchase-orders.json", []);
    const totalCents = input.lines.reduce(
      (acc, l) => acc + Math.round(l.quantity * l.unitCost),
      0,
    );
    const po: PurchaseOrder = {
      id: input.id || `po-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      supplierId: input.supplierId,
      locationSlug: input.locationSlug,
      status: input.status,
      lines: input.lines,
      totalCents,
      expectedAt: input.expectedAt,
      receivedAt: input.receivedAt,
      notes: input.notes,
      createdAt: input.createdAt ?? new Date().toISOString(),
      createdBy: input.createdBy,
    };
    const i = list.findIndex((p) => p.id === po.id);
    if (i >= 0) list[i] = po;
    else list.push(po);
    await writeJSON("purchase-orders.json", list);
    return po;
  });
}

/**
 * Mark a PO as received and atomically post receive movements to the stock
 * log for every line. Idempotent: if the PO is already "received" no new
 * movements are written.
 */
export async function receivePurchaseOrder(id: string, byUser?: string): Promise<PurchaseOrder | null> {
  const po = await getPurchaseOrder(id);
  if (!po) return null;
  if (po.status === "received") return po;

  for (const line of po.lines) {
    await createStockMovement({
      ingredientId: line.ingredientId,
      locationSlug: po.locationSlug,
      type: "receive",
      quantity: line.quantity,
      costImpact: Math.round(line.quantity * line.unitCost),
      reason: `PO ${po.id}`,
      byUser,
    });
  }

  return savePurchaseOrder({
    ...po,
    status: "received",
    receivedAt: new Date().toISOString(),
  });
}

export async function updatePurchaseOrderStatus(id: string, status: PurchaseOrderStatus): Promise<PurchaseOrder | null> {
  const po = await getPurchaseOrder(id);
  if (!po) return null;
  if (status === "received") return receivePurchaseOrder(id);
  return savePurchaseOrder({ ...po, status });
}

export async function deletePurchaseOrder(id: string): Promise<boolean> {
  return withLock("purchase-orders.json", async () => {
    const list = await readJSON<PurchaseOrder[]>("purchase-orders.json", []);
    const filtered = list.filter((p) => p.id !== id);
    if (filtered.length === list.length) return false;
    await writeJSON("purchase-orders.json", filtered);
    return true;
  });
}

// --- CRM (customer notes — m1_8b dual-write) ----------------------------

const CUSTOMER_NOTES_DDL = [
  `CREATE TABLE IF NOT EXISTS customer_notes (
    id text PRIMARY KEY,
    phone text NOT NULL,
    body text NOT NULL,
    tags text[],
    authored_by text,
    created_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS customer_notes_phone_idx
    ON customer_notes (phone)`,
  `CREATE INDEX IF NOT EXISTS customer_notes_created_idx
    ON customer_notes (created_at)`,
];

async function ensureCustomerNotesTable(): Promise<void> {
  await ensureTable("customer_notes", CUSTOMER_NOTES_DDL);
}

function rowToCustomerNote(row: typeof customerNotesTable.$inferSelect): CustomerNote {
  return {
    id: row.id,
    phone: row.phone,
    body: row.body,
    tags: row.tags ?? undefined,
    authoredBy: row.authoredBy ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

async function dualWriteCustomerNote(n: CustomerNote): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await ensureCustomerNotesTable();
    await db
      .insert(customerNotesTable)
      .values({
        id: n.id,
        phone: n.phone,
        body: n.body,
        tags: n.tags ?? null,
        authoredBy: n.authoredBy ?? null,
        createdAt: new Date(n.createdAt),
      })
      .onConflictDoNothing();
  } catch (err) {
    logger.warn("dualWriteCustomerNote failed", { id: n.id, layer: "store.customer_notes" }, err);
  }
}

async function dualDeleteCustomerNote(id: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await ensureCustomerNotesTable();
    await db.delete(customerNotesTable).where(eq(customerNotesTable.id, id));
  } catch (err) {
    logger.warn("dualDeleteCustomerNote failed", { id, layer: "store.customer_notes" }, err);
  }
}

export async function getCustomerNotes(phone?: string): Promise<CustomerNote[]> {
  const db = getDb();
  if (db) {
    try {
      await ensureCustomerNotesTable();
      const baseQuery = db
        .select()
        .from(customerNotesTable)
        .orderBy(desc(customerNotesTable.createdAt));
      const rows = phone
        ? await baseQuery.where(eq(customerNotesTable.phone, phone))
        : await baseQuery;
      if (rows.length > 0) return rows.map(rowToCustomerNote);
    } catch (err) {
      logger.warn("getCustomerNotes DB read failed; falling back", { layer: "store.customer_notes" }, err);
    }
  }
  const all = await readJSON<CustomerNote[]>("customer-notes.json", []);
  const list = phone ? all.filter((n) => n.phone === phone) : all;
  const sorted = list.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (sorted.length > 0) {
    bumpLazyBackfillHit("customer_notes");
    void Promise.all(sorted.map((n) => dualWriteCustomerNote(n)));
  }
  return sorted;
}

export async function addCustomerNote(
  input: Omit<CustomerNote, "id" | "createdAt"> & { createdAt?: string },
): Promise<CustomerNote> {
  return withLock("customer-notes.json", async () => {
    const list = await readJSON<CustomerNote[]>("customer-notes.json", []);
    const note: CustomerNote = {
      id: `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      phone: input.phone,
      body: input.body,
      tags: input.tags,
      authoredBy: input.authoredBy,
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
    list.push(note);
    await writeJSON("customer-notes.json", list);
    await dualWriteCustomerNote(note);
    return note;
  });
}

export async function deleteCustomerNote(id: string): Promise<boolean> {
  return withLock("customer-notes.json", async () => {
    const list = await readJSON<CustomerNote[]>("customer-notes.json", []);
    const filtered = list.filter((n) => n.id !== id);
    if (filtered.length === list.length) return false;
    await writeJSON("customer-notes.json", filtered);
    await dualDeleteCustomerNote(id);
    return true;
  });
}

// --- Staff / HR (m1_8a: dual-write) -------------------------------------

const STAFF_DDL = [
  `CREATE TABLE IF NOT EXISTS staff (
    id text PRIMARY KEY,
    name text NOT NULL,
    phone text,
    email text,
    role text NOT NULL,
    location_slug text NOT NULL,
    hourly_rate_grosze integer NOT NULL,
    hire_date date,
    dob date,
    status text NOT NULL,
    notes text,
    created_at timestamptz NOT NULL
  )`,
  // Gemini review feedback: hire_date + dob migrated from text → date.
  // Existing rows hold ISO YYYY-MM-DD strings (and NULL), so the cast is
  // lossless. Repeat calls are no-ops once the column is already date.
  `ALTER TABLE staff ALTER COLUMN hire_date TYPE date USING (NULLIF(hire_date, '')::date)`,
  `ALTER TABLE staff ALTER COLUMN dob TYPE date USING (NULLIF(dob, '')::date)`,
  `CREATE INDEX IF NOT EXISTS staff_location_idx ON staff (location_slug)`,
  `CREATE INDEX IF NOT EXISTS staff_status_idx ON staff (status)`,
];
const SHIFTS_DDL = [
  `CREATE TABLE IF NOT EXISTS shifts (
    id text PRIMARY KEY,
    staff_id text NOT NULL,
    location_slug text NOT NULL,
    start_at timestamptz NOT NULL,
    end_at timestamptz NOT NULL,
    role text NOT NULL,
    status text NOT NULL,
    notes text
  )`,
  `CREATE INDEX IF NOT EXISTS shifts_location_start_idx
    ON shifts (location_slug, start_at)`,
  `CREATE INDEX IF NOT EXISTS shifts_staff_start_idx
    ON shifts (staff_id, start_at)`,
  `CREATE INDEX IF NOT EXISTS shifts_status_idx ON shifts (status)`,
];
const TIME_PUNCHES_DDL = [
  `CREATE TABLE IF NOT EXISTS time_punches (
    id text PRIMARY KEY,
    staff_id text NOT NULL,
    occurred_at timestamptz NOT NULL,
    type text NOT NULL,
    shift_id text
  )`,
  `CREATE INDEX IF NOT EXISTS time_punches_staff_occurred_idx
    ON time_punches (staff_id, occurred_at)`,
];

async function ensureStaffTable(): Promise<void> {
  await ensureTable("staff", STAFF_DDL);
}
async function ensureShiftsTable(): Promise<void> {
  await ensureTable("shifts", SHIFTS_DDL);
}
async function ensureTimePunchesTable(): Promise<void> {
  await ensureTable("time_punches", TIME_PUNCHES_DDL);
}

function rowToStaff(row: typeof staffTable.$inferSelect): StaffMember {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    role: row.role as StaffMember["role"],
    locationSlug: row.locationSlug,
    hourlyRateGrosze: row.hourlyRateGrosze,
    hireDate: row.hireDate ?? undefined,
    dob: row.dob ?? undefined,
    status: row.status as StaffMember["status"],
    notes: row.notes ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}
function rowToShift(row: typeof shiftsTable.$inferSelect): Shift {
  return {
    id: row.id,
    staffId: row.staffId,
    locationSlug: row.locationSlug,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    role: row.role as Shift["role"],
    status: row.status as Shift["status"],
    notes: row.notes ?? undefined,
  };
}
function rowToTimePunch(row: typeof timePunchesTable.$inferSelect): TimePunch {
  return {
    id: row.id,
    staffId: row.staffId,
    occurredAt: row.occurredAt.toISOString(),
    type: row.type as TimePunch["type"],
    shiftId: row.shiftId ?? undefined,
  };
}

async function dualWriteStaff(m: StaffMember): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await ensureStaffTable();
    const values = {
      id: m.id,
      name: m.name,
      phone: m.phone ?? null,
      email: m.email ?? null,
      role: m.role,
      locationSlug: m.locationSlug,
      hourlyRateGrosze: m.hourlyRateGrosze,
      hireDate: m.hireDate ?? null,
      dob: m.dob ?? null,
      status: m.status,
      notes: m.notes ?? null,
      createdAt: new Date(m.createdAt),
    };
    await db.insert(staffTable).values(values).onConflictDoUpdate({ target: staffTable.id, set: values });
  } catch (err) {
    logger.warn("dualWriteStaff failed", { id: m.id, layer: "store.staff" }, err);
  }
}
async function dualDeleteStaff(id: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await ensureStaffTable();
    await db.delete(staffTable).where(eq(staffTable.id, id));
  } catch (err) {
    logger.warn("dualDeleteStaff failed", { id, layer: "store.staff" }, err);
  }
}
async function dualWriteShift(s: Shift): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await ensureShiftsTable();
    const values = {
      id: s.id,
      staffId: s.staffId,
      locationSlug: s.locationSlug,
      startAt: new Date(s.startAt),
      endAt: new Date(s.endAt),
      role: s.role,
      status: s.status,
      notes: s.notes ?? null,
    };
    await db.insert(shiftsTable).values(values).onConflictDoUpdate({ target: shiftsTable.id, set: values });
  } catch (err) {
    logger.warn("dualWriteShift failed", { id: s.id, layer: "store.shifts" }, err);
  }
}
async function dualDeleteShift(id: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await ensureShiftsTable();
    await db.delete(shiftsTable).where(eq(shiftsTable.id, id));
  } catch (err) {
    logger.warn("dualDeleteShift failed", { id, layer: "store.shifts" }, err);
  }
}
async function dualWriteTimePunch(p: TimePunch): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await ensureTimePunchesTable();
    await db
      .insert(timePunchesTable)
      .values({
        id: p.id,
        staffId: p.staffId,
        occurredAt: new Date(p.occurredAt),
        type: p.type,
        shiftId: p.shiftId ?? null,
      })
      .onConflictDoNothing();
  } catch (err) {
    logger.warn("dualWriteTimePunch failed", { id: p.id, layer: "store.time_punches" }, err);
  }
}

export async function getStaff(locationSlug?: string): Promise<StaffMember[]> {
  const db = getDb();
  if (db) {
    try {
      await ensureStaffTable();
      const rows = locationSlug
        ? await db.select().from(staffTable).where(eq(staffTable.locationSlug, locationSlug))
        : await db.select().from(staffTable);
      if (rows.length > 0) return rows.map(rowToStaff);
    } catch (err) {
      logger.warn("getStaff DB read failed; falling back", { layer: "store.staff" }, err);
    }
  }
  const all = await readJSON<StaffMember[]>("staff.json", []);
  const filtered = locationSlug ? all.filter((s) => s.locationSlug === locationSlug) : all;
  if (filtered.length > 0) {
    bumpLazyBackfillHit("staff");
    void Promise.all(filtered.map((s) => dualWriteStaff(s)));
  }
  return filtered;
}

export async function saveStaff(
  input: Omit<StaffMember, "id" | "createdAt"> & { id?: string; createdAt?: string },
): Promise<StaffMember> {
  return withLock("staff.json", async () => {
    const list = await readJSON<StaffMember[]>("staff.json", []);
    const member: StaffMember = {
      id: input.id || `staff-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: input.name,
      phone: input.phone,
      email: input.email,
      role: input.role,
      locationSlug: input.locationSlug,
      hourlyRateGrosze: input.hourlyRateGrosze,
      hireDate: input.hireDate,
      dob: input.dob,
      status: input.status,
      notes: input.notes,
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
    const i = list.findIndex((s) => s.id === member.id);
    if (i >= 0) list[i] = member;
    else list.push(member);
    await writeJSON("staff.json", list);
    await dualWriteStaff(member);
    return member;
  });
}

export async function deleteStaff(id: string): Promise<boolean> {
  return withLock("staff.json", async () => {
    const list = await readJSON<StaffMember[]>("staff.json", []);
    const filtered = list.filter((s) => s.id !== id);
    if (filtered.length === list.length) return false;
    await writeJSON("staff.json", filtered);
    await dualDeleteStaff(id);
    return true;
  });
}

export async function getShifts(filters?: {
  locationSlug?: string;
  staffId?: string;
  from?: string;
  to?: string;
}): Promise<Shift[]> {
  const db = getDb();
  if (db) {
    try {
      await ensureShiftsTable();
      const where = [];
      if (filters?.locationSlug) where.push(eq(shiftsTable.locationSlug, filters.locationSlug));
      if (filters?.staffId) where.push(eq(shiftsTable.staffId, filters.staffId));
      if (filters?.from) where.push(gte(shiftsTable.endAt, new Date(filters.from)));
      if (filters?.to) where.push(lte(shiftsTable.startAt, new Date(filters.to)));
      const baseQuery = db.select().from(shiftsTable).orderBy(shiftsTable.startAt);
      const rows = where.length > 0 ? await baseQuery.where(and(...where)) : await baseQuery;
      if (rows.length > 0) return rows.map(rowToShift);
    } catch (err) {
      logger.warn("getShifts DB read failed; falling back", { layer: "store.shifts" }, err);
    }
  }
  const all = await readJSON<Shift[]>("shifts.json", []);
  let list = all;
  if (filters?.locationSlug) list = list.filter((s) => s.locationSlug === filters.locationSlug);
  if (filters?.staffId) list = list.filter((s) => s.staffId === filters.staffId);
  if (filters?.from) list = list.filter((s) => s.endAt >= filters.from!);
  if (filters?.to) list = list.filter((s) => s.startAt <= filters.to!);
  const sorted = list.slice().sort((a, b) => a.startAt.localeCompare(b.startAt));
  if (sorted.length > 0) {
    bumpLazyBackfillHit("shifts");
    void Promise.all(sorted.map((s) => dualWriteShift(s)));
  }
  return sorted;
}

export async function saveShift(input: Omit<Shift, "id"> & { id?: string }): Promise<Shift> {
  return withLock("shifts.json", async () => {
    const list = await readJSON<Shift[]>("shifts.json", []);
    const shift: Shift = {
      id: input.id || `shift-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      staffId: input.staffId,
      locationSlug: input.locationSlug,
      startAt: input.startAt,
      endAt: input.endAt,
      role: input.role,
      status: input.status,
      notes: input.notes,
    };
    const i = list.findIndex((s) => s.id === shift.id);
    if (i >= 0) list[i] = shift;
    else list.push(shift);
    await writeJSON("shifts.json", list);
    await dualWriteShift(shift);
    return shift;
  });
}

export async function deleteShift(id: string): Promise<boolean> {
  return withLock("shifts.json", async () => {
    const list = await readJSON<Shift[]>("shifts.json", []);
    const filtered = list.filter((s) => s.id !== id);
    if (filtered.length === list.length) return false;
    await writeJSON("shifts.json", filtered);
    await dualDeleteShift(id);
    return true;
  });
}

export async function getTimePunches(filters?: {
  staffId?: string;
  from?: string;
  to?: string;
}): Promise<TimePunch[]> {
  const db = getDb();
  if (db) {
    try {
      await ensureTimePunchesTable();
      const where = [];
      if (filters?.staffId) where.push(eq(timePunchesTable.staffId, filters.staffId));
      if (filters?.from) where.push(gte(timePunchesTable.occurredAt, new Date(filters.from)));
      if (filters?.to) where.push(lte(timePunchesTable.occurredAt, new Date(filters.to)));
      const baseQuery = db
        .select()
        .from(timePunchesTable)
        .orderBy(desc(timePunchesTable.occurredAt));
      const rows = where.length > 0 ? await baseQuery.where(and(...where)) : await baseQuery;
      if (rows.length > 0) return rows.map(rowToTimePunch);
    } catch (err) {
      logger.warn("getTimePunches DB read failed; falling back", { layer: "store.time_punches" }, err);
    }
  }
  const all = await readJSON<TimePunch[]>("time-punches.json", []);
  let list = all;
  if (filters?.staffId) list = list.filter((p) => p.staffId === filters.staffId);
  if (filters?.from) list = list.filter((p) => p.occurredAt >= filters.from!);
  if (filters?.to) list = list.filter((p) => p.occurredAt <= filters.to!);
  const sorted = list.slice().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  if (sorted.length > 0) {
    bumpLazyBackfillHit("time_punches");
    void Promise.all(sorted.map((p) => dualWriteTimePunch(p)));
  }
  return sorted;
}

export async function recordTimePunch(input: Omit<TimePunch, "id" | "occurredAt"> & { occurredAt?: string }): Promise<TimePunch> {
  return withLock("time-punches.json", async () => {
    const list = await readJSON<TimePunch[]>("time-punches.json", []);
    const punch: TimePunch = {
      id: `pn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      staffId: input.staffId,
      type: input.type,
      shiftId: input.shiftId,
      occurredAt: input.occurredAt ?? new Date().toISOString(),
    };
    list.push(punch);
    await writeJSON("time-punches.json", list);
    await dualWriteTimePunch(punch);
    return punch;
  });
}

/**
 * Compute realised labour cost (grosze) over an arbitrary window by pairing
 * clock-in / clock-out punches per staff member and multiplying worked hours
 * by each member's hourly rate. Open shifts (clock-in without a matching
 * clock-out) are extended to `now` so the "labour today so far" tile reflects
 * staff currently on the floor.
 *
 * Punches outside the window still affect the pairing when they straddle a
 * boundary — we slice the worked seconds down to the requested range so
 * mid-shift snapshots don't double-count.
 *
 * Returns `laborHours` alongside the cost so callers don't reconstruct
 * hours from cost / avg-rate (which loses precision when staff have
 * heterogeneous rates and uneven shift lengths — Gemini review on PR #38
 * caught the approximation in labor-efficiency.ts).
 */
export async function getLaborCostInRange(
  locationSlug: string | undefined,
  fromIso: string,
  toIso: string,
  now: Date = new Date(),
): Promise<{ laborGrosze: number; laborHours: number; openShifts: number }> {
  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();
  const nowMs = now.getTime();

  const staff = await getStaff(locationSlug);
  const staffById = new Map(staff.map((s) => [s.id, s]));
  const punches = await getTimePunches({
    // Pull a generous window so we catch a clock-in that started before
    // `from` and is still open. Cap at 7 days back to keep the read bounded.
    from: new Date(fromMs - 7 * 24 * 60 * 60 * 1000).toISOString(),
  });

  // Group oldest-first so the pair walk reads naturally.
  const byStaff = new Map<string, TimePunch[]>();
  for (const p of punches) {
    if (!staffById.has(p.staffId)) continue;
    (byStaff.get(p.staffId) ?? byStaff.set(p.staffId, []).get(p.staffId)!).push(p);
  }
  for (const arr of byStaff.values()) {
    arr.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }

  let laborGrosze = 0;
  let laborSeconds = 0;
  let openShifts = 0;

  for (const [staffId, arr] of byStaff) {
    const member = staffById.get(staffId)!;
    let inAt: number | null = null;
    for (const p of arr) {
      const t = new Date(p.occurredAt).getTime();
      if (p.type === "clock-in") {
        inAt = t;
      } else if (p.type === "clock-out" && inAt !== null) {
        const startedAt = Math.max(inAt, fromMs);
        const endedAt = Math.min(t, toMs);
        if (endedAt > startedAt) {
          const seconds = (endedAt - startedAt) / 1000;
          laborSeconds += seconds;
          laborGrosze += (seconds / 3600) * member.hourlyRateGrosze;
        }
        inAt = null;
      }
    }
    if (inAt !== null) {
      openShifts++;
      const startedAt = Math.max(inAt, fromMs);
      const endedAt = Math.min(nowMs, toMs);
      if (endedAt > startedAt) {
        const seconds = (endedAt - startedAt) / 1000;
        laborSeconds += seconds;
        laborGrosze += (seconds / 3600) * member.hourlyRateGrosze;
      }
    }
  }

  return {
    laborGrosze: Math.round(laborGrosze),
    laborHours: Math.round((laborSeconds / 3600) * 100) / 100,
    openShifts,
  };
}

// --- Truck operations ---

export async function getTruckRoutes(locationSlug?: string): Promise<TruckRoute[]> {
  const all = await readJSON<TruckRoute[]>("truck-routes.json", []);
  return locationSlug ? all.filter((r) => r.locationSlug === locationSlug) : all;
}

export async function saveTruckRoute(input: Omit<TruckRoute, "id" | "createdAt"> & { id?: string; createdAt?: string }): Promise<TruckRoute> {
  return withLock("truck-routes.json", async () => {
    const list = await readJSON<TruckRoute[]>("truck-routes.json", []);
    const route: TruckRoute = {
      id: input.id || `rt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: input.name,
      locationSlug: input.locationSlug,
      description: input.description,
      stops: input.stops,
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
    const i = list.findIndex((r) => r.id === route.id);
    if (i >= 0) list[i] = route;
    else list.push(route);
    await writeJSON("truck-routes.json", list);
    return route;
  });
}

export async function deleteTruckRoute(id: string): Promise<boolean> {
  return withLock("truck-routes.json", async () => {
    const list = await readJSON<TruckRoute[]>("truck-routes.json", []);
    const filtered = list.filter((r) => r.id !== id);
    if (filtered.length === list.length) return false;
    await writeJSON("truck-routes.json", filtered);
    return true;
  });
}

export async function getTruckEvents(filters?: {
  locationSlug?: string;
  from?: string;
  to?: string;
}): Promise<TruckEvent[]> {
  const all = await readJSON<TruckEvent[]>("truck-events.json", []);
  let list = all;
  if (filters?.locationSlug) list = list.filter((e) => e.locationSlug === filters.locationSlug);
  if (filters?.from) list = list.filter((e) => e.date >= filters.from!);
  if (filters?.to) list = list.filter((e) => e.date <= filters.to!);
  return list.slice().sort((a, b) => b.date.localeCompare(a.date));
}

export async function saveTruckEvent(input: Omit<TruckEvent, "id" | "createdAt"> & { id?: string; createdAt?: string }): Promise<TruckEvent> {
  return withLock("truck-events.json", async () => {
    const list = await readJSON<TruckEvent[]>("truck-events.json", []);
    const event: TruckEvent = {
      id: input.id || `te-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      routeId: input.routeId,
      locationSlug: input.locationSlug,
      name: input.name,
      date: input.date,
      expectedAttendance: input.expectedAttendance,
      actualRevenueGrosze: input.actualRevenueGrosze,
      actualOrders: input.actualOrders,
      notes: input.notes,
      status: input.status,
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
    const i = list.findIndex((e) => e.id === event.id);
    if (i >= 0) list[i] = event;
    else list.push(event);
    await writeJSON("truck-events.json", list);
    return event;
  });
}

export async function deleteTruckEvent(id: string): Promise<boolean> {
  return withLock("truck-events.json", async () => {
    const list = await readJSON<TruckEvent[]>("truck-events.json", []);
    const filtered = list.filter((e) => e.id !== id);
    if (filtered.length === list.length) return false;
    await writeJSON("truck-events.json", filtered);
    return true;
  });
}

// --- Expansion readiness checklist ---

export async function getExpansionChecklists(): Promise<ExpansionChecklist[]> {
  return readJSON<ExpansionChecklist[]>("expansion-checklists.json", []);
}

export async function getExpansionChecklist(locationSlug: string): Promise<ExpansionChecklist | null> {
  const list = await getExpansionChecklists();
  return list.find((c) => c.locationSlug === locationSlug) ?? null;
}

export async function saveExpansionChecklist(input: Omit<ExpansionChecklist, "updatedAt">): Promise<ExpansionChecklist> {
  return withLock("expansion-checklists.json", async () => {
    const list = await readJSON<ExpansionChecklist[]>("expansion-checklists.json", []);
    const checklist: ExpansionChecklist = { ...input, updatedAt: new Date().toISOString() };
    const i = list.findIndex((c) => c.locationSlug === input.locationSlug);
    if (i >= 0) list[i] = checklist;
    else list.push(checklist);
    await writeJSON("expansion-checklists.json", list);
    return checklist;
  });
}

// --- Audit log (m1_6: dual-write, no trim) ------------------------------

const AUDIT_LOG_DDL = [
  `CREATE TABLE IF NOT EXISTS audit_log (
    id text PRIMARY KEY,
    actor text NOT NULL,
    action text NOT NULL,
    entity_type text,
    entity_id text,
    location_slug text,
    "before" jsonb,
    "after" jsonb,
    ip text,
    user_agent text,
    occurred_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS audit_log_occurred_at_idx
    ON audit_log (occurred_at)`,
  `CREATE INDEX IF NOT EXISTS audit_log_entity_idx
    ON audit_log (entity_type, entity_id)`,
  `CREATE INDEX IF NOT EXISTS audit_log_location_occurred_idx
    ON audit_log (location_slug, occurred_at)`,
  `CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit_log (actor)`,
  `CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log (action)`,
];

async function ensureAuditLogTable(): Promise<void> {
  await ensureTable("audit_log", AUDIT_LOG_DDL);
}

function rowToAuditEntry(row: typeof auditLogTable.$inferSelect): AuditLogEntry {
  return {
    id: row.id,
    actor: row.actor,
    action: row.action,
    entityType: row.entityType ?? undefined,
    entityId: row.entityId ?? undefined,
    before: row.before ?? undefined,
    after: row.after ?? undefined,
    occurredAt: row.occurredAt.toISOString(),
  };
}

async function dualWriteAuditEntry(entry: AuditLogEntry): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await ensureAuditLogTable();
    await db
      .insert(auditLogTable)
      .values({
        id: entry.id,
        actor: entry.actor,
        action: entry.action,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        // The kv_store AuditLogEntry doesn't carry location/ip/UA; Phase 2's
        // request-context (m1_15) plumbing will start filling these in.
        locationSlug: null,
        before: entry.before ?? null,
        after: entry.after ?? null,
        ip: null,
        userAgent: null,
        occurredAt: new Date(entry.occurredAt),
      })
      .onConflictDoNothing();
  } catch (err) {
    logger.warn(
      "dualWriteAuditEntry failed (kv copy remains)",
      { id: entry.id, layer: "store.audit_log" },
      err,
    );
  }
}

export async function getAuditLog(filters?: {
  action?: string;
  entityType?: string;
  limit?: number;
}): Promise<AuditLogEntry[]> {
  const db = getDb();
  if (db) {
    try {
      await ensureAuditLogTable();
      const whereClauses = [];
      if (filters?.action) whereClauses.push(eq(auditLogTable.action, filters.action));
      if (filters?.entityType)
        whereClauses.push(eq(auditLogTable.entityType, filters.entityType));
      const baseQuery = db
        .select()
        .from(auditLogTable)
        .orderBy(desc(auditLogTable.occurredAt));
      const filteredQuery =
        whereClauses.length > 0 ? baseQuery.where(and(...whereClauses)) : baseQuery;
      const rows = filters?.limit
        ? await filteredQuery.limit(filters.limit)
        : await filteredQuery.limit(500); // Hard ceiling for the read path
      if (rows.length > 0) return rows.map(rowToAuditEntry);
    } catch (err) {
      logger.warn(
        "getAuditLog DB read failed; falling back to kv_store",
        { layer: "store.audit_log" },
        err,
      );
    }
  }
  const all = await readJSON<AuditLogEntry[]>("audit-log.json", []);
  let list = all.slice().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  if (filters?.action) list = list.filter((e) => e.action === filters.action);
  if (filters?.entityType) list = list.filter((e) => e.entityType === filters.entityType);
  if (filters?.limit) list = list.slice(0, filters.limit);
  if (list.length > 0) {
    bumpLazyBackfillHit("audit_log");
    void Promise.all(list.map((e) => dualWriteAuditEntry(e)));
  }
  return list;
}

// --- Admin users ---

export async function getAdminUsers(): Promise<AdminUser[]> {
  return readJSON<AdminUser[]>("admin-users.json", []);
}

export async function saveAdminUser(
  input: Omit<AdminUser, "id" | "createdAt"> & { id?: string; createdAt?: string },
): Promise<AdminUser> {
  return withLock("admin-users.json", async () => {
    const list = await readJSON<AdminUser[]>("admin-users.json", []);
    const user: AdminUser = {
      id: input.id || `usr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: input.name,
      email: input.email,
      role: input.role,
      status: input.status,
      locationSlug: input.locationSlug,
      notes: input.notes,
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
    const i = list.findIndex((u) => u.id === user.id);
    if (i >= 0) list[i] = user;
    else list.push(user);
    await writeJSON("admin-users.json", list);
    return user;
  });
}

export async function deleteAdminUser(id: string): Promise<boolean> {
  return withLock("admin-users.json", async () => {
    const list = await readJSON<AdminUser[]>("admin-users.json", []);
    const filtered = list.filter((u) => u.id !== id);
    if (filtered.length === list.length) return false;
    await writeJSON("admin-users.json", filtered);
    return true;
  });
}

/**
 * Keep the kv_store mirror small — old reads still work against it, but
 * the normalized audit_log table has unlimited retention via m1_6.
 */
const AUDIT_LOG_MAX_ENTRIES = 1000;

export async function appendAuditLog(input: Omit<AuditLogEntry, "id" | "occurredAt"> & { occurredAt?: string }): Promise<AuditLogEntry> {
  const entry: AuditLogEntry = {
    id: `al-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    actor: input.actor,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    before: input.before,
    after: input.after,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  };
  await withLock("audit-log.json", async () => {
    const list = await readJSON<AuditLogEntry[]>("audit-log.json", []);
    list.push(entry);
    const trimmed = list.length > AUDIT_LOG_MAX_ENTRIES
      ? list.slice(list.length - AUDIT_LOG_MAX_ENTRIES)
      : list;
    await writeJSON("audit-log.json", trimmed);
  });
  // Normalized audit_log has no trim — keep forever.
  await dualWriteAuditEntry(entry);
  return entry;
}

// --- Compliance calendar -----------------------------------------------------

export async function getComplianceItems(locationSlug?: string): Promise<ComplianceItem[]> {
  const all = await readJSON<ComplianceItem[]>("compliance.json", []);
  const filtered = locationSlug ? all.filter((c) => c.locationSlug === locationSlug) : all;
  // Renewing-soonest first so the dashboard tile pulls the most urgent items
  // without re-sorting on the client.
  return filtered.slice().sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
}

export async function saveComplianceItem(
  input: Omit<ComplianceItem, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
    createdAt?: string;
  },
): Promise<ComplianceItem> {
  return withLock("compliance.json", async () => {
    const list = await readJSON<ComplianceItem[]>("compliance.json", []);
    const now = new Date().toISOString();
    const item: ComplianceItem = {
      id: input.id || `cmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      locationSlug: input.locationSlug,
      kind: input.kind,
      title: input.title,
      expiresAt: input.expiresAt,
      lastRenewedAt: input.lastRenewedAt,
      notes: input.notes,
      createdAt: input.createdAt ?? now,
      updatedAt: now,
    };
    const i = list.findIndex((c) => c.id === item.id);
    if (i >= 0) list[i] = item;
    else list.push(item);
    await writeJSON("compliance.json", list);
    return item;
  });
}

// --- GDPR erasure -------------------------------------------------------

/**
 * Redact every order belonging to a phone number. Used by the GDPR delete
 * flow — order rows stay for accounting, but customerName / address /
 * specialInstructions are wiped and customerPhone is rewritten to a
 * deterministic tombstone so reconciliation tooling still groups them.
 */
export async function gdprRedactOrders(canonicalPhone: string, tombstone: string): Promise<number> {
  return withLock("orders.json", async () => {
    const list = await readJSON<Order[]>("orders.json", []);
    let touched = 0;
    for (const o of list) {
      if (phonesEqualPl(o.customerPhone, canonicalPhone)) {
        o.customerName = "[GDPR_REDACTED]";
        o.customerPhone = tombstone;
        o.deliveryAddress = undefined;
        o.specialInstructions = undefined;
        touched++;
      }
    }
    if (touched > 0) await writeJSON("orders.json", list);
    return touched;
  });
}

export async function gdprRemoveCustomerNotes(canonicalPhone: string): Promise<number> {
  return withLock("customer-notes.json", async () => {
    const list = await readJSON<CustomerNote[]>("customer-notes.json", []);
    const next = list.filter((n) => !phonesEqualPl(n.phone, canonicalPhone));
    const removed = list.length - next.length;
    if (removed > 0) await writeJSON("customer-notes.json", next);
    return removed;
  });
}

export async function gdprRemoveLoyaltyMember(canonicalPhone: string): Promise<boolean> {
  return withLock("loyalty-members.json", async () => {
    const list = await readJSON<{ phone: string }[]>("loyalty-members.json", []);
    const next = list.filter((m) => !phonesEqualPl(m.phone, canonicalPhone));
    if (next.length === list.length) return false;
    await writeJSON("loyalty-members.json", next);
    return true;
  });
}

export async function gdprRedactFeedback(canonicalPhone: string, tombstone: string): Promise<number> {
  return withLock("feedback.json", async () => {
    const list = await readJSON<FeedbackEntry[]>("feedback.json", []);
    let touched = 0;
    for (const f of list) {
      if (phonesEqualPl(f.customerPhone, canonicalPhone)) {
        f.customerName = "[GDPR_REDACTED]";
        f.customerPhone = tombstone;
        touched++;
      }
    }
    if (touched > 0) await writeJSON("feedback.json", list);
    return touched;
  });
}

// --- Cash sessions ------------------------------------------------------

export async function getCashSessions(
  locationSlug?: string,
  opts: { includeHidden?: boolean } = {},
): Promise<CashSession[]> {
  const all = await readJSON<CashSession[]>("cash-sessions.json", []);
  let list = locationSlug ? all.filter((s) => s.locationSlug === locationSlug) : all;
  if (!opts.includeHidden) list = list.filter((s) => !s.hidden);
  // Most recent first so the UI doesn't have to re-sort.
  return list.slice().sort((a, b) => b.openedAt.localeCompare(a.openedAt));
}

export async function getCashSessionById(id: string): Promise<CashSession | undefined> {
  const all = await readJSON<CashSession[]>("cash-sessions.json", []);
  return all.find((s) => s.id === id);
}

/** Find the open session (no closedAt) for a location, if any. Only one open
 *  session per location is supported — opening a second 409s. */
export async function getOpenCashSession(locationSlug: string): Promise<CashSession | undefined> {
  const all = await readJSON<CashSession[]>("cash-sessions.json", []);
  return all.find((s) => s.locationSlug === locationSlug && !s.closedAt);
}

export async function openCashSession(input: {
  locationSlug: string;
  openingFloat: number;
  openedBy: string;
  notes?: string;
}): Promise<CashSession | { error: "already_open"; existing: CashSession }> {
  return withLock("cash-sessions.json", async () => {
    const all = await readJSON<CashSession[]>("cash-sessions.json", []);
    const open = all.find((s) => s.locationSlug === input.locationSlug && !s.closedAt);
    if (open) return { error: "already_open" as const, existing: open };
    const session: CashSession = {
      id: `cash-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      locationSlug: input.locationSlug,
      openedAt: new Date().toISOString(),
      openingFloat: Math.max(0, Math.round(input.openingFloat)),
      openedBy: input.openedBy,
      drops: [],
      notes: input.notes,
    };
    all.push(session);
    await writeJSON("cash-sessions.json", all);
    return session;
  });
}

export async function appendCashDrop(
  sessionId: string,
  drop: Omit<CashDrop, "id" | "at"> & { at?: string },
): Promise<CashSession | null> {
  return withLock("cash-sessions.json", async () => {
    const all = await readJSON<CashSession[]>("cash-sessions.json", []);
    const idx = all.findIndex((s) => s.id === sessionId);
    if (idx === -1) return null;
    if (all[idx].closedAt) return null;
    const entry: CashDrop = {
      id: `drop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      amountGrosze: Math.round(drop.amountGrosze),
      kind: drop.kind,
      at: drop.at ?? new Date().toISOString(),
      notes: drop.notes,
      actor: drop.actor,
    };
    all[idx].drops.push(entry);
    await writeJSON("cash-sessions.json", all);
    return all[idx];
  });
}

export async function closeCashSession(
  sessionId: string,
  closingCountGrosze: number,
  closedBy: string,
  notes?: string,
): Promise<CashSession | null> {
  return withLock("cash-sessions.json", async () => {
    const all = await readJSON<CashSession[]>("cash-sessions.json", []);
    const idx = all.findIndex((s) => s.id === sessionId);
    if (idx === -1) return null;
    if (all[idx].closedAt) return null;
    const session = all[idx];
    const expected =
      session.openingFloat + session.drops.reduce((acc, d) => acc + d.amountGrosze, 0);
    session.closingCountGrosze = Math.max(0, Math.round(closingCountGrosze));
    session.closedAt = new Date().toISOString();
    session.closedBy = closedBy;
    session.varianceGrosze = session.closingCountGrosze - expected;
    if (notes) session.notes = notes;
    await writeJSON("cash-sessions.json", all);
    return session;
  });
}

export async function setCashSessionHidden(
  sessionId: string,
  hidden: boolean,
): Promise<CashSession | null> {
  return withLock("cash-sessions.json", async () => {
    const all = await readJSON<CashSession[]>("cash-sessions.json", []);
    const idx = all.findIndex((s) => s.id === sessionId);
    if (idx === -1) return null;
    all[idx].hidden = hidden;
    await writeJSON("cash-sessions.json", all);
    return all[idx];
  });
}

export async function deleteCashSession(sessionId: string): Promise<CashSession | null> {
  return withLock("cash-sessions.json", async () => {
    const all = await readJSON<CashSession[]>("cash-sessions.json", []);
    const idx = all.findIndex((s) => s.id === sessionId);
    if (idx === -1) return null;
    const [removed] = all.splice(idx, 1);
    await writeJSON("cash-sessions.json", all);
    return removed;
  });
}

export async function deleteComplianceItem(id: string): Promise<boolean> {
  return withLock("compliance.json", async () => {
    const list = await readJSON<ComplianceItem[]>("compliance.json", []);
    const filtered = list.filter((c) => c.id !== id);
    if (filtered.length === list.length) return false;
    await writeJSON("compliance.json", filtered);
    return true;
  });
}

// --- KDS v2 stations + tickets (m2_1, m2_2, m2_3) -----------------------

const STATIONS_DDL = [
  `CREATE TABLE IF NOT EXISTS stations (
    id text PRIMARY KEY,
    location_slug text NOT NULL,
    name text NOT NULL,
    display_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
  )`,
  // Gemini review feedback: active migrated from text → boolean.
  `ALTER TABLE stations ALTER COLUMN active DROP DEFAULT`,
  `ALTER TABLE stations ALTER COLUMN active TYPE boolean USING (active::boolean)`,
  `ALTER TABLE stations ALTER COLUMN active SET DEFAULT true`,
  `CREATE INDEX IF NOT EXISTS stations_location_idx ON stations (location_slug)`,
];
const MENU_ITEM_STATION_DDL = [
  `CREATE TABLE IF NOT EXISTS menu_item_station (
    menu_item_id text NOT NULL,
    station_id text NOT NULL,
    PRIMARY KEY (menu_item_id, station_id)
  )`,
  `CREATE INDEX IF NOT EXISTS menu_item_station_station_idx
    ON menu_item_station (station_id)`,
];
const KDS_TICKETS_DDL = [
  `CREATE TABLE IF NOT EXISTS kds_tickets (
    id text PRIMARY KEY,
    order_id text NOT NULL,
    station_id text NOT NULL,
    location_slug text NOT NULL,
    status text NOT NULL DEFAULT 'fired',
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    promised_ready_at timestamptz,
    fired_at timestamptz NOT NULL DEFAULT now(),
    ready_at timestamptz,
    bumped_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS kds_tickets_order_idx
    ON kds_tickets (order_id)`,
  `CREATE INDEX IF NOT EXISTS kds_tickets_station_status_idx
    ON kds_tickets (station_id, status)`,
  `CREATE INDEX IF NOT EXISTS kds_tickets_location_status_fired_idx
    ON kds_tickets (location_slug, status, fired_at)`,
];

async function ensureKdsTables(): Promise<void> {
  await ensureTable("stations", STATIONS_DDL);
  await ensureTable("menu_item_station", MENU_ITEM_STATION_DDL);
  await ensureTable("kds_tickets", KDS_TICKETS_DDL);
}

export interface Station {
  id: string;
  locationSlug: string;
  name: string;
  displayOrder: number;
  active: boolean;
}

export interface KdsTicket {
  id: string;
  orderId: string;
  stationId: string;
  locationSlug: string;
  status: "fired" | "ready" | "bumped" | "recalled";
  /**
   * `allergens` is surfaced per-line so the cook can sanity-check before
   * firing — protects against the customer-reported-allergen incidents
   * that fall out of cross-contamination at a small open kitchen.
   */
  items: {
    menuItemId: string;
    name: string;
    quantity: number;
    notes?: string;
    allergens?: string[];
  }[];
  promisedReadyAt?: string;
  firedAt: string;
  readyAt?: string;
  bumpedAt?: string;
}

export async function getStations(locationSlug?: string): Promise<Station[]> {
  const db = getDb();
  if (!db) return [];
  try {
    await ensureKdsTables();
    const rows = locationSlug
      ? await db
          .select()
          .from(stationsTable)
          .where(eq(stationsTable.locationSlug, locationSlug))
      : await db.select().from(stationsTable);
    return rows.map((row) => ({
      id: row.id,
      locationSlug: row.locationSlug,
      name: row.name,
      displayOrder: row.displayOrder,
      active: row.active,
    }));
  } catch (err) {
    logger.warn("getStations DB read failed", { layer: "store.kds" }, err);
    return [];
  }
}

export async function saveStation(input: {
  id?: string;
  locationSlug: string;
  name: string;
  displayOrder?: number;
  active?: boolean;
}): Promise<Station | null> {
  const db = getDb();
  if (!db) return null;
  try {
    await ensureKdsTables();
    const id = input.id || `stn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const values = {
      id,
      locationSlug: input.locationSlug,
      name: input.name,
      displayOrder: input.displayOrder ?? 0,
      active: input.active !== false,
    };
    await db
      .insert(stationsTable)
      .values(values)
      .onConflictDoUpdate({ target: stationsTable.id, set: values });
    return {
      id,
      locationSlug: input.locationSlug,
      name: input.name,
      displayOrder: input.displayOrder ?? 0,
      active: input.active !== false,
    };
  } catch (err) {
    logger.error("saveStation failed", { layer: "store.kds" }, err);
    return null;
  }
}

export async function deleteStation(id: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  try {
    await ensureKdsTables();
    await db.delete(stationsTable).where(eq(stationsTable.id, id));
    await db.delete(menuItemStationTable).where(eq(menuItemStationTable.stationId, id));
    return true;
  } catch (err) {
    logger.warn("deleteStation failed", { id, layer: "store.kds" }, err);
    return false;
  }
}

/**
 * Set or replace the station mapping for a menu item. Pass an empty array
 * to clear all mappings (the item then doesn't route to any station and
 * the kitchen sees it on a generic "ungrouped" ticket — m2_2 behaviour).
 */
export async function setMenuItemStations(
  menuItemId: string,
  stationIds: string[],
): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await ensureKdsTables();
    await db
      .delete(menuItemStationTable)
      .where(eq(menuItemStationTable.menuItemId, menuItemId));
    if (stationIds.length > 0) {
      await db.insert(menuItemStationTable).values(
        stationIds.map((sid) => ({ menuItemId, stationId: sid })),
      );
    }
  } catch (err) {
    logger.warn("setMenuItemStations failed", { menuItemId, layer: "store.kds" }, err);
  }
}

/**
 * Look up the stations an order should fan out to. Returns a map of
 * stationId → the order's items that station should make. Items with no
 * mapping fall into an "ungrouped" bucket keyed by the empty string —
 * kitchens see those on a default ticket so nothing falls through the
 * cracks.
 */
export async function resolveOrderStationFanout(
  order: Order,
): Promise<Map<string, Order["items"]>> {
  const db = getDb();
  const fanout = new Map<string, Order["items"]>();
  if (!db) {
    fanout.set("", order.items);
    return fanout;
  }
  try {
    await ensureKdsTables();
    const itemIds = order.items.map((i) => i.menuItem.id);
    if (itemIds.length === 0) return fanout;
    const mappings = await db
      .select()
      .from(menuItemStationTable)
      .where(inArray(menuItemStationTable.menuItemId, itemIds));
    const byItem = new Map<string, string[]>();
    for (const m of mappings) {
      const list = byItem.get(m.menuItemId) ?? [];
      list.push(m.stationId);
      byItem.set(m.menuItemId, list);
    }
    for (const item of order.items) {
      const stations = byItem.get(item.menuItem.id) ?? [];
      if (stations.length === 0) {
        const ungrouped = fanout.get("") ?? [];
        ungrouped.push(item);
        fanout.set("", ungrouped);
        continue;
      }
      for (const sid of stations) {
        const list = fanout.get(sid) ?? [];
        list.push(item);
        fanout.set(sid, list);
      }
    }
  } catch (err) {
    logger.warn("resolveOrderStationFanout failed", { orderId: order.id, layer: "store.kds" }, err);
    // Fall back to one ungrouped ticket so the kitchen at least sees the order.
    fanout.set("", order.items);
  }
  return fanout;
}

/**
 * Computes when this order is promised to be ready (m2_5). The KDS uses
 * this for the countdown and red+audible "overdue" indicator.
 *
 * Priority:
 *   1. Order has a customer-picked slot → use slot date+time. That's
 *      what the customer is expecting and what we charged them against.
 *   2. Else fire-time + max(prep_time_minutes across items) + 3 min buffer.
 *      The 3 min covers expo handoff + any plating that's not in the
 *      per-item prep_time.
 *   3. Hard floor of 10 minutes from fire time so a fast-prep order
 *      doesn't promise the customer something we can't deliver.
 */
function computePromisedReadyAt(order: Order, firedAt: Date): Date {
  if (order.slotDate && order.slotTime) {
    const slotInstant = new Date(`${order.slotDate}T${order.slotTime}:00.000+02:00`);
    if (Number.isFinite(slotInstant.getTime())) return slotInstant;
  }
  const maxPrep = Math.max(
    0,
    ...order.items.map((i) => i.menuItem.prepTimeMinutes ?? 0),
  );
  const minutes = Math.max(10, maxPrep + 3);
  return new Date(firedAt.getTime() + minutes * 60 * 1000);
}
/**
 * Fire KDS tickets for an order (m2_2 + m2_4 + m2_5). Generates one ticket
 * per station the order touches. Idempotent on (order_id, station_id) so
 * retried createOrder calls don't double-create.
 *
 * m2_4 fire-together: each ticket's payload carries `fireAt` — when the
 * cook should actually START prep. The longest-prep ticket fires
 * immediately; faster items get a stagger so they all finish at
 * promised_ready_at. The KDS UI grays out tickets until their `fireAt`
 * arrives.
 *
 * m2_5 SLA: promised_ready_at is computed once per order
 * (computePromisedReadyAt) and set on every ticket. The KDS countdown
 * + red+audible overdue indicator read this column.
 */
export async function fireKdsTickets(order: Order): Promise<KdsTicket[]> {
  const db = getDb();
  if (!db) return [];
  try {
    await ensureKdsTables();
    const fanout = await resolveOrderStationFanout(order);
    const tickets: KdsTicket[] = [];
    const now = new Date();
    const promisedReadyAt = computePromisedReadyAt(order, now);
    // m2_4: stagger each ticket's start so the longest-prep finishes
    // alongside the others. Per-ticket "fireAt" is computed from the
    // station's max item prep time vs the longest in the whole order.
    const orderMaxPrep = Math.max(
      0,
      ...order.items.map((i) => i.menuItem.prepTimeMinutes ?? 0),
    );
    for (const [stationId, items] of fanout) {
      const stationMaxPrep = Math.max(
        0,
        ...items.map((i) => i.menuItem.prepTimeMinutes ?? 0),
      );
      // Tickets with shorter prep get delayed by the difference so all
      // finish ~together. 0 for the slowest station.
      const stagger = Math.max(0, orderMaxPrep - stationMaxPrep);
      const fireAt = new Date(now.getTime() + stagger * 60 * 1000);
      const ticketId = `tkt-${order.id}-${stationId || "default"}`;
      const payload = {
        items: items.map((i) => ({
          menuItemId: i.menuItem.id,
          name: i.menuItem.name,
          quantity: i.quantity,
          notes: i.notes,
          allergens: i.menuItem.allergens,
        })),
        fireAt: fireAt.toISOString(),
      };
      await db
        .insert(kdsTicketsTable)
        .values({
          id: ticketId,
          orderId: order.id,
          stationId: stationId || "ungrouped",
          locationSlug: order.locationSlug,
          status: "fired",
          payload,
          promisedReadyAt,
          firedAt: now,
        })
        .onConflictDoNothing();
      tickets.push({
        id: ticketId,
        orderId: order.id,
        stationId: stationId || "ungrouped",
        locationSlug: order.locationSlug,
        status: "fired",
        items: payload.items,
        firedAt: now.toISOString(),
        promisedReadyAt: promisedReadyAt.toISOString(),
      });
    }
    // Mirror promised_ready_at onto the order itself for receipts +
    // post-checkout "your order at 13:15" UI.
    await updateOrder(order.id, { estimatedReadyAt: promisedReadyAt.toISOString() });
    return tickets;
  } catch (err) {
    logger.warn("fireKdsTickets failed", { orderId: order.id, layer: "store.kds" }, err);
    return [];
  }
}

/** Mark a ticket as ready (m2_3). Sets ready_at; returns the updated ticket. */
export async function markTicketReady(ticketId: string): Promise<KdsTicket | null> {
  const db = getDb();
  if (!db) return null;
  try {
    await ensureKdsTables();
    const updated = await db
      .update(kdsTicketsTable)
      .set({ status: "ready", readyAt: new Date() })
      .where(eq(kdsTicketsTable.id, ticketId))
      .returning();
    if (updated.length === 0) return null;
    const r = updated[0];
    return {
      id: r.id,
      orderId: r.orderId,
      stationId: r.stationId,
      locationSlug: r.locationSlug,
      status: r.status as KdsTicket["status"],
      items: (r.payload as { items: KdsTicket["items"] }).items ?? [],
      promisedReadyAt: r.promisedReadyAt ? r.promisedReadyAt.toISOString() : undefined,
      firedAt: r.firedAt.toISOString(),
      readyAt: r.readyAt ? r.readyAt.toISOString() : undefined,
      bumpedAt: r.bumpedAt ? r.bumpedAt.toISOString() : undefined,
    };
  } catch (err) {
    logger.warn("markTicketReady failed", { ticketId, layer: "store.kds" }, err);
    return null;
  }
}

/** Bump (complete) a ticket from the expo screen. Marks the order ready if
 *  all its tickets are bumped. */
export async function bumpTicket(ticketId: string): Promise<KdsTicket | null> {
  const db = getDb();
  if (!db) return null;
  try {
    await ensureKdsTables();
    const updated = await db
      .update(kdsTicketsTable)
      .set({ status: "bumped", bumpedAt: new Date() })
      .where(eq(kdsTicketsTable.id, ticketId))
      .returning();
    if (updated.length === 0) return null;
    const r = updated[0];
    // If every ticket for this order is bumped, mark the order ready so
    // the customer gets the "order ready" SMS.
    const remaining = await db
      .select({ id: kdsTicketsTable.id })
      .from(kdsTicketsTable)
      .where(
        and(
          eq(kdsTicketsTable.orderId, r.orderId),
          eq(kdsTicketsTable.status, "fired"),
        ),
      )
      .limit(1);
    if (remaining.length === 0) {
      await updateOrderStatus(r.orderId, "ready");
    }
    return {
      id: r.id,
      orderId: r.orderId,
      stationId: r.stationId,
      locationSlug: r.locationSlug,
      status: r.status as KdsTicket["status"],
      items: (r.payload as { items: KdsTicket["items"] }).items ?? [],
      firedAt: r.firedAt.toISOString(),
      readyAt: r.readyAt ? r.readyAt.toISOString() : undefined,
      bumpedAt: r.bumpedAt ? r.bumpedAt.toISOString() : undefined,
    };
  } catch (err) {
    logger.warn("bumpTicket failed", { ticketId, layer: "store.kds" }, err);
    return null;
  }
}

/** Fetch tickets for a location. Filters to non-bumped by default. */
export async function getKdsTickets(
  locationSlug: string,
  opts?: { includeBumped?: boolean; stationId?: string },
): Promise<KdsTicket[]> {
  const db = getDb();
  if (!db) return [];
  try {
    await ensureKdsTables();
    const where = [eq(kdsTicketsTable.locationSlug, locationSlug)];
    if (opts?.stationId) where.push(eq(kdsTicketsTable.stationId, opts.stationId));
    const rows = opts?.includeBumped
      ? await db.select().from(kdsTicketsTable).where(and(...where)).orderBy(asc(kdsTicketsTable.firedAt))
      : await db
          .select()
          .from(kdsTicketsTable)
          .where(and(...where, inArray(kdsTicketsTable.status, ["fired", "ready", "recalled"])))
          .orderBy(asc(kdsTicketsTable.firedAt));
    return rows.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      stationId: r.stationId,
      locationSlug: r.locationSlug,
      status: r.status as KdsTicket["status"],
      items: (r.payload as { items: KdsTicket["items"] }).items ?? [],
      promisedReadyAt: r.promisedReadyAt ? r.promisedReadyAt.toISOString() : undefined,
      firedAt: r.firedAt.toISOString(),
      readyAt: r.readyAt ? r.readyAt.toISOString() : undefined,
      bumpedAt: r.bumpedAt ? r.bumpedAt.toISOString() : undefined,
    }));
  } catch (err) {
    logger.warn("getKdsTickets failed", { locationSlug, layer: "store.kds" }, err);
    return [];
  }
}

// --- KDS station analytics (m2_9) ---------------------------------------

export interface StationAnalyticsRow {
  stationId: string;
  ticketCount: number;
  /** Mean bump time = bumpedAt - firedAt, ms. */
  meanBumpMs: number;
  /** P50 bump time (median) — robust to outliers. */
  p50BumpMs: number;
  /** P95 bump time — catches the long-tail issues operators care about. */
  p95BumpMs: number;
  /** Tickets / hour over the window. */
  throughputPerHour: number;
}

/**
 * Per-station bump-time analytics over a date window (m2_9). Reads the
 * kds_tickets table directly so the cost is one indexed range scan even
 * over 30 days. Bumped tickets only — fired-but-not-bumped don't count
 * toward "how fast was this station today".
 */
export async function getKdsStationAnalytics(
  locationSlug: string,
  fromIso: string,
  toIso: string,
): Promise<StationAnalyticsRow[]> {
  const db = getDb();
  if (!db) return [];
  try {
    await ensureKdsTables();
    const from = new Date(fromIso);
    const to = new Date(toIso);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return [];
    const rows = await db
      .select()
      .from(kdsTicketsTable)
      .where(
        and(
          eq(kdsTicketsTable.locationSlug, locationSlug),
          gte(kdsTicketsTable.firedAt, from),
          lte(kdsTicketsTable.firedAt, to),
        ),
      );
    const windowHours = Math.max(0.001, (to.getTime() - from.getTime()) / (1000 * 60 * 60));
    const byStation = new Map<string, number[]>();
    for (const r of rows) {
      if (!r.bumpedAt) continue;
      const ms = r.bumpedAt.getTime() - r.firedAt.getTime();
      if (!Number.isFinite(ms) || ms < 0) continue;
      const list = byStation.get(r.stationId) ?? [];
      list.push(ms);
      byStation.set(r.stationId, list);
    }
    const out: StationAnalyticsRow[] = [];
    for (const [stationId, samples] of byStation) {
      const sorted = [...samples].sort((a, b) => a - b);
      const sum = sorted.reduce((acc, x) => acc + x, 0);
      const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
      const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
      out.push({
        stationId,
        ticketCount: sorted.length,
        meanBumpMs: sorted.length > 0 ? sum / sorted.length : 0,
        p50BumpMs: p50,
        p95BumpMs: p95,
        throughputPerHour: sorted.length / windowHours,
      });
    }
    // Slowest p95 first — that's the bottleneck the operator wants to see.
    return out.sort((a, b) => b.p95BumpMs - a.p95BumpMs);
  } catch (err) {
    logger.warn("getKdsStationAnalytics failed", { locationSlug, layer: "store.kds" }, err);
    return [];
  }
}

// --- Phase 3: brands + franchisees + location assignments (m3_1, m3_2) ---

const BRANDS_DDL = [
  `CREATE TABLE IF NOT EXISTS brands (
    id text PRIMARY KEY,
    name text NOT NULL,
    slug text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
];
const FRANCHISEES_DDL = [
  `CREATE TABLE IF NOT EXISTS franchisees (
    id text PRIMARY KEY,
    brand_id text NOT NULL,
    name text NOT NULL,
    email text,
    royalty_rate_bps integer NOT NULL DEFAULT 800,
    marketing_fund_bps integer NOT NULL DEFAULT 200,
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS franchisees_brand_idx ON franchisees (brand_id)`,
  `CREATE INDEX IF NOT EXISTS franchisees_email_idx ON franchisees (email)`,
];
const LOCATION_ASSIGNMENTS_DDL = [
  `CREATE TABLE IF NOT EXISTS location_assignments (
    location_slug text PRIMARY KEY,
    brand_id text NOT NULL,
    franchisee_id text,
    region_slug text,
    setup_complete boolean NOT NULL DEFAULT true
  )`,
  // Gemini review feedback: setup_complete migrated from text → boolean.
  `ALTER TABLE location_assignments ALTER COLUMN setup_complete DROP DEFAULT`,
  `ALTER TABLE location_assignments ALTER COLUMN setup_complete TYPE boolean USING (setup_complete::boolean)`,
  `ALTER TABLE location_assignments ALTER COLUMN setup_complete SET DEFAULT true`,
  `CREATE INDEX IF NOT EXISTS location_assignments_brand_idx
    ON location_assignments (brand_id)`,
  `CREATE INDEX IF NOT EXISTS location_assignments_franchisee_idx
    ON location_assignments (franchisee_id)`,
  `CREATE INDEX IF NOT EXISTS location_assignments_region_idx
    ON location_assignments (region_slug)`,
];

async function ensureFranchiseTables(): Promise<void> {
  await ensureTable("brands", BRANDS_DDL);
  await ensureTable("franchisees", FRANCHISEES_DDL);
  await ensureTable("location_assignments", LOCATION_ASSIGNMENTS_DDL);
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface Franchisee {
  id: string;
  brandId: string;
  name: string;
  email?: string;
  royaltyRateBps: number;
  marketingFundBps: number;
  status: "active" | "disabled";
  createdAt: string;
}

export interface LocationAssignment {
  locationSlug: string;
  brandId: string;
  franchiseeId?: string;
  regionSlug?: string;
  setupComplete: boolean;
}

/** Seed the default brand if missing. Idempotent. */
async function ensureDefaultBrand(): Promise<void> {
  const db = getDb();
  if (!db) return;
  await ensureFranchiseTables();
  try {
    await db
      .insert(brandsTable)
      .values({ id: "sud-italia", name: "Sud Italia", slug: "sud-italia" })
      .onConflictDoNothing();
  } catch (err) {
    logger.warn("ensureDefaultBrand failed", { layer: "store.brands" }, err);
  }
}

export async function getBrands(): Promise<Brand[]> {
  const db = getDb();
  if (!db) return [];
  try {
    await ensureDefaultBrand();
    const rows = await db.select().from(brandsTable);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      createdAt: r.createdAt.toISOString(),
    }));
  } catch (err) {
    logger.warn("getBrands failed", { layer: "store.brands" }, err);
    return [];
  }
}

export async function saveBrand(input: Brand): Promise<Brand | null> {
  const db = getDb();
  if (!db) return null;
  try {
    await ensureFranchiseTables();
    const values = { id: input.id, name: input.name, slug: input.slug };
    await db.insert(brandsTable).values(values).onConflictDoUpdate({ target: brandsTable.id, set: values });
    return { ...input };
  } catch (err) {
    logger.error("saveBrand failed", { id: input.id, layer: "store.brands" }, err);
    return null;
  }
}

export async function getFranchisees(brandId?: string): Promise<Franchisee[]> {
  const db = getDb();
  if (!db) return [];
  try {
    await ensureFranchiseTables();
    const rows = brandId
      ? await db.select().from(franchiseesTable).where(eq(franchiseesTable.brandId, brandId))
      : await db.select().from(franchiseesTable);
    return rows.map((r) => ({
      id: r.id,
      brandId: r.brandId,
      name: r.name,
      email: r.email ?? undefined,
      royaltyRateBps: r.royaltyRateBps,
      marketingFundBps: r.marketingFundBps,
      status: r.status as Franchisee["status"],
      createdAt: r.createdAt.toISOString(),
    }));
  } catch (err) {
    logger.warn("getFranchisees failed", { layer: "store.franchisees" }, err);
    return [];
  }
}

export async function saveFranchisee(input: Omit<Franchisee, "createdAt"> & { createdAt?: string }): Promise<Franchisee | null> {
  const db = getDb();
  if (!db) return null;
  try {
    await ensureFranchiseTables();
    const values = {
      id: input.id,
      brandId: input.brandId,
      name: input.name,
      email: input.email ?? null,
      royaltyRateBps: input.royaltyRateBps,
      marketingFundBps: input.marketingFundBps,
      status: input.status,
    };
    await db
      .insert(franchiseesTable)
      .values(values)
      .onConflictDoUpdate({ target: franchiseesTable.id, set: values });
    const rows = await db
      .select()
      .from(franchiseesTable)
      .where(eq(franchiseesTable.id, input.id))
      .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      brandId: r.brandId,
      name: r.name,
      email: r.email ?? undefined,
      royaltyRateBps: r.royaltyRateBps,
      marketingFundBps: r.marketingFundBps,
      status: r.status as Franchisee["status"],
      createdAt: r.createdAt.toISOString(),
    };
  } catch (err) {
    logger.error("saveFranchisee failed", { id: input.id, layer: "store.franchisees" }, err);
    return null;
  }
}

export async function getLocationAssignment(locationSlug: string): Promise<LocationAssignment | null> {
  const db = getDb();
  if (!db) return null;
  try {
    await ensureFranchiseTables();
    const rows = await db
      .select()
      .from(locationAssignmentsTable)
      .where(eq(locationAssignmentsTable.locationSlug, locationSlug))
      .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      locationSlug: r.locationSlug,
      brandId: r.brandId,
      franchiseeId: r.franchiseeId ?? undefined,
      regionSlug: r.regionSlug ?? undefined,
      setupComplete: r.setupComplete,
    };
  } catch (err) {
    logger.warn("getLocationAssignment failed", { locationSlug, layer: "store.location_assignments" }, err);
    return null;
  }
}

export async function saveLocationAssignment(input: LocationAssignment): Promise<LocationAssignment | null> {
  const db = getDb();
  if (!db) return null;
  try {
    await ensureFranchiseTables();
    const values = {
      locationSlug: input.locationSlug,
      brandId: input.brandId,
      franchiseeId: input.franchiseeId ?? null,
      regionSlug: input.regionSlug ?? null,
      setupComplete: input.setupComplete ?? true,
    };
    await db
      .insert(locationAssignmentsTable)
      .values(values)
      .onConflictDoUpdate({ target: locationAssignmentsTable.locationSlug, set: values });
    return input;
  } catch (err) {
    logger.error("saveLocationAssignment failed", { locationSlug: input.locationSlug, layer: "store.location_assignments" }, err);
    return null;
  }
}

/** All locations for a given franchisee (m3_3 portal scope). */
export async function getLocationsForFranchisee(franchiseeId: string): Promise<string[]> {
  const db = getDb();
  if (!db) return [];
  try {
    await ensureFranchiseTables();
    const rows = await db
      .select({ locationSlug: locationAssignmentsTable.locationSlug })
      .from(locationAssignmentsTable)
      .where(eq(locationAssignmentsTable.franchiseeId, franchiseeId));
    return rows.map((r) => r.locationSlug);
  } catch (err) {
    logger.warn("getLocationsForFranchisee failed", { franchiseeId, layer: "store.location_assignments" }, err);
    return [];
  }
}

// --- Royalty statements (m3_5) ------------------------------------------

const ROYALTY_STATEMENTS_DDL = [
  `CREATE TABLE IF NOT EXISTS royalty_statements (
    id text PRIMARY KEY,
    franchisee_id text NOT NULL,
    period_start timestamptz NOT NULL,
    period_end timestamptz NOT NULL,
    revenue_grosze integer NOT NULL,
    royalty_grosze integer NOT NULL,
    marketing_fund_grosze integer NOT NULL,
    order_count integer NOT NULL,
    generated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS royalty_statements_franchisee_period_idx
    ON royalty_statements (franchisee_id, period_end)`,
];

async function ensureRoyaltyStatementsTable(): Promise<void> {
  await ensureTable("royalty_statements", ROYALTY_STATEMENTS_DDL);
}

export interface RoyaltyStatement {
  id: string;
  franchiseeId: string;
  periodStart: string;
  periodEnd: string;
  revenueGrosze: number;
  royaltyGrosze: number;
  marketingFundGrosze: number;
  orderCount: number;
  generatedAt: string;
}

export async function getRoyaltyStatements(franchiseeId: string): Promise<RoyaltyStatement[]> {
  const db = getDb();
  if (!db) return [];
  try {
    await ensureRoyaltyStatementsTable();
    const rows = await db
      .select()
      .from(royaltyStatementsTable)
      .where(eq(royaltyStatementsTable.franchiseeId, franchiseeId))
      .orderBy(desc(royaltyStatementsTable.periodEnd));
    return rows.map((r) => ({
      id: r.id,
      franchiseeId: r.franchiseeId,
      periodStart: r.periodStart.toISOString(),
      periodEnd: r.periodEnd.toISOString(),
      revenueGrosze: r.revenueGrosze,
      royaltyGrosze: r.royaltyGrosze,
      marketingFundGrosze: r.marketingFundGrosze,
      orderCount: r.orderCount,
      generatedAt: r.generatedAt.toISOString(),
    }));
  } catch (err) {
    logger.warn("getRoyaltyStatements failed", { franchiseeId, layer: "store.royalty" }, err);
    return [];
  }
}

/**
 * Idempotent-upsert royalty statement (m3_5). Re-running the weekly cron
 * for the same period replaces the row in place via ON CONFLICT on a
 * composite of (franchisee_id, period_end) — we synthesize a stable id.
 */
export async function saveRoyaltyStatement(input: Omit<RoyaltyStatement, "id" | "generatedAt">): Promise<RoyaltyStatement | null> {
  const db = getDb();
  if (!db) return null;
  try {
    await ensureRoyaltyStatementsTable();
    const id = `rs-${input.franchiseeId}-${input.periodEnd.slice(0, 10)}`;
    const values = {
      id,
      franchiseeId: input.franchiseeId,
      periodStart: new Date(input.periodStart),
      periodEnd: new Date(input.periodEnd),
      revenueGrosze: input.revenueGrosze,
      royaltyGrosze: input.royaltyGrosze,
      marketingFundGrosze: input.marketingFundGrosze,
      orderCount: input.orderCount,
    };
    await db
      .insert(royaltyStatementsTable)
      .values(values)
      .onConflictDoUpdate({ target: royaltyStatementsTable.id, set: values });
    return { id, generatedAt: new Date().toISOString(), ...input };
  } catch (err) {
    logger.error("saveRoyaltyStatement failed", { franchiseeId: input.franchiseeId, layer: "store.royalty" }, err);
    return null;
  }
}

// --- Phase 3 compliance: temp logs + allergen incidents (m3_13-15) -----

const TEMP_LOGS_DDL = [
  `CREATE TABLE IF NOT EXISTS temp_logs (
    id text PRIMARY KEY,
    location_slug text NOT NULL,
    sensor text NOT NULL,
    temp_celsius integer NOT NULL,
    status text NOT NULL DEFAULT 'ok',
    recorded_by text,
    recorded_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS temp_logs_location_recorded_idx
    ON temp_logs (location_slug, recorded_at)`,
  `CREATE INDEX IF NOT EXISTS temp_logs_sensor_idx ON temp_logs (sensor)`,
  `CREATE INDEX IF NOT EXISTS temp_logs_status_idx ON temp_logs (status)`,
];
const ALLERGEN_INCIDENTS_DDL = [
  `CREATE TABLE IF NOT EXISTS allergen_incidents (
    id text PRIMARY KEY,
    location_slug text NOT NULL,
    customer_phone text,
    order_id text,
    menu_item_id text,
    allergen text NOT NULL,
    severity text NOT NULL,
    description text NOT NULL,
    resolution text,
    reported_by text NOT NULL,
    reported_at timestamptz NOT NULL,
    resolved_at timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS allergen_incidents_location_reported_idx
    ON allergen_incidents (location_slug, reported_at)`,
  `CREATE INDEX IF NOT EXISTS allergen_incidents_severity_idx
    ON allergen_incidents (severity)`,
];

async function ensureComplianceTables(): Promise<void> {
  await ensureTable("temp_logs", TEMP_LOGS_DDL);
  await ensureTable("allergen_incidents", ALLERGEN_INCIDENTS_DDL);
}

export interface TempLog {
  id: string;
  locationSlug: string;
  sensor: string;
  /** Temperature in tenths of a degree Celsius. -50 = -5.0 °C. */
  tempCelsius: number;
  status: "ok" | "flagged";
  recordedBy?: string;
  recordedAt: string;
}

export interface AllergenIncident {
  id: string;
  locationSlug: string;
  customerPhone?: string;
  orderId?: string;
  menuItemId?: string;
  allergen: string;
  severity: "low" | "medium" | "high";
  description: string;
  resolution?: string;
  reportedBy: string;
  reportedAt: string;
  resolvedAt?: string;
}

const TEMP_RANGES: Record<string, { minTenths: number; maxTenths: number }> = {
  // Defaults from HACCP guidance. Operator can override per-sensor later;
  // for now any sensor name maps to a fridge range unless it contains
  // "freezer" or "hot".
  default: { minTenths: 0, maxTenths: 50 },
  freezer: { minTenths: -300, maxTenths: -180 },
  hot: { minTenths: 630, maxTenths: 800 },
};

function rangeForSensor(sensor: string): { minTenths: number; maxTenths: number } {
  const lower = sensor.toLowerCase();
  if (lower.includes("freezer")) return TEMP_RANGES.freezer;
  if (lower.includes("hot")) return TEMP_RANGES.hot;
  return TEMP_RANGES.default;
}

export async function saveTempLog(input: Omit<TempLog, "id" | "status"> & { id?: string }): Promise<TempLog | null> {
  const db = getDb();
  if (!db) return null;
  try {
    await ensureComplianceTables();
    const id = input.id || `tl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const range = rangeForSensor(input.sensor);
    const status: "ok" | "flagged" =
      input.tempCelsius < range.minTenths || input.tempCelsius > range.maxTenths
        ? "flagged"
        : "ok";
    await db.insert(tempLogsTable).values({
      id,
      locationSlug: input.locationSlug,
      sensor: input.sensor,
      tempCelsius: input.tempCelsius,
      status,
      recordedBy: input.recordedBy ?? null,
      recordedAt: new Date(input.recordedAt),
    });
    return { id, status, ...input };
  } catch (err) {
    logger.error("saveTempLog failed", { layer: "store.compliance" }, err);
    return null;
  }
}

export async function getTempLogs(filters: {
  locationSlug: string;
  fromIso?: string;
  toIso?: string;
  limit?: number;
}): Promise<TempLog[]> {
  const db = getDb();
  if (!db) return [];
  try {
    await ensureComplianceTables();
    const where = [eq(tempLogsTable.locationSlug, filters.locationSlug)];
    if (filters.fromIso) where.push(gte(tempLogsTable.recordedAt, new Date(filters.fromIso)));
    if (filters.toIso) where.push(lte(tempLogsTable.recordedAt, new Date(filters.toIso)));
    const baseQuery = db
      .select()
      .from(tempLogsTable)
      .where(and(...where))
      .orderBy(desc(tempLogsTable.recordedAt));
    const rows = filters.limit ? await baseQuery.limit(filters.limit) : await baseQuery.limit(500);
    return rows.map((r) => ({
      id: r.id,
      locationSlug: r.locationSlug,
      sensor: r.sensor,
      tempCelsius: r.tempCelsius,
      status: r.status as TempLog["status"],
      recordedBy: r.recordedBy ?? undefined,
      recordedAt: r.recordedAt.toISOString(),
    }));
  } catch (err) {
    logger.warn("getTempLogs failed", { layer: "store.compliance" }, err);
    return [];
  }
}

export async function saveAllergenIncident(input: Omit<AllergenIncident, "id"> & { id?: string }): Promise<AllergenIncident | null> {
  const db = getDb();
  if (!db) return null;
  try {
    await ensureComplianceTables();
    const id = input.id || `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    await db.insert(allergenIncidentsTable).values({
      id,
      locationSlug: input.locationSlug,
      customerPhone: input.customerPhone ?? null,
      orderId: input.orderId ?? null,
      menuItemId: input.menuItemId ?? null,
      allergen: input.allergen,
      severity: input.severity,
      description: input.description,
      resolution: input.resolution ?? null,
      reportedBy: input.reportedBy,
      reportedAt: new Date(input.reportedAt),
      resolvedAt: input.resolvedAt ? new Date(input.resolvedAt) : null,
    });
    return { id, ...input };
  } catch (err) {
    logger.error("saveAllergenIncident failed", { layer: "store.compliance" }, err);
    return null;
  }
}

export async function getAllergenIncidents(locationSlug?: string): Promise<AllergenIncident[]> {
  const db = getDb();
  if (!db) return [];
  try {
    await ensureComplianceTables();
    const rows = locationSlug
      ? await db
          .select()
          .from(allergenIncidentsTable)
          .where(eq(allergenIncidentsTable.locationSlug, locationSlug))
          .orderBy(desc(allergenIncidentsTable.reportedAt))
      : await db
          .select()
          .from(allergenIncidentsTable)
          .orderBy(desc(allergenIncidentsTable.reportedAt));
    return rows.map((r) => ({
      id: r.id,
      locationSlug: r.locationSlug,
      customerPhone: r.customerPhone ?? undefined,
      orderId: r.orderId ?? undefined,
      menuItemId: r.menuItemId ?? undefined,
      allergen: r.allergen,
      severity: r.severity as AllergenIncident["severity"],
      description: r.description,
      resolution: r.resolution ?? undefined,
      reportedBy: r.reportedBy,
      reportedAt: r.reportedAt.toISOString(),
      resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : undefined,
    }));
  } catch (err) {
    logger.warn("getAllergenIncidents failed", { layer: "store.compliance" }, err);
    return [];
  }
}

// --- Web Push subscriptions (m5_6) ----------------------------------
//
// One row per (phone, endpoint) pair. Phone is the customer identity
// from the cookie-based session; endpoint is the unique push service
// URL the browser issues per device. Customers can subscribe from
// multiple devices and we'll fan out to all of them.
//
// Stored in kv_store for now — push subscriptions are write-rarely,
// read-rarely, the volume stays tiny, and there's no analytics query
// over them yet.

export interface StoredPushSubscription {
  phone: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: string;
}

export async function listPushSubscriptions(phone?: string): Promise<StoredPushSubscription[]> {
  const all = await readJSON<StoredPushSubscription[]>("push-subscriptions.json", []);
  return phone ? all.filter((s) => s.phone === phone) : all;
}

export async function savePushSubscription(input: Omit<StoredPushSubscription, "createdAt">): Promise<StoredPushSubscription> {
  return withLock("push-subscriptions.json", async () => {
    const list = await readJSON<StoredPushSubscription[]>("push-subscriptions.json", []);
    const existing = list.findIndex((s) => s.endpoint === input.endpoint);
    const row: StoredPushSubscription = {
      ...input,
      createdAt: existing >= 0 ? list[existing].createdAt : new Date().toISOString(),
    };
    if (existing >= 0) list[existing] = row;
    else list.push(row);
    await writeJSON("push-subscriptions.json", list);
    return row;
  });
}

export async function deletePushSubscription(endpoint: string): Promise<boolean> {
  return withLock("push-subscriptions.json", async () => {
    const list = await readJSON<StoredPushSubscription[]>("push-subscriptions.json", []);
    const filtered = list.filter((s) => s.endpoint !== endpoint);
    if (filtered.length === list.length) return false;
    await writeJSON("push-subscriptions.json", filtered);
    return true;
  });
}

// --- WhatsApp ordering (sessions + settings) ---------------------------
//
// The WhatsApp channel keeps a tiny per-phone session that survives across
// Meta webhook turns. Cart + slot + LLM history live here so the bot can
// follow up across messages without re-asking the customer everything.
// `whatsapp-sessions.json` is the only durable state for the channel —
// once an order is paid the session is cleared, so the keyspace stays
// bounded.

export interface WaSession {
  /** Canonical E.164 PL phone (the key). */
  phone: string;
  locationSlug: "krakow" | "warszawa" | null;
  cartItems: import("@/data/types").CartItem[];
  fulfillmentType: import("@/data/types").FulfillmentType | null;
  slotId: string | null;
  deliveryAddress: {
    street: string;
    city: string;
    postalCode: string;
    notes?: string;
  } | null;
  customerName: string | null;
  /** Order id created on confirm_and_pay; cleared on order.confirmed. */
  pendingOrderId: string | null;
  /** Stripe Checkout Session URL sent to the customer as the Pay button. */
  pendingPaymentUrl: string | null;
  /** Trimmed LLM message history (last N turns) for context continuity. */
  llmMessageHistory: { role: "user" | "assistant"; content: string }[];
  /** ISO timestamp of the most recent inbound or outbound. TTL anchor. */
  lastTurnAt: string;
  /** True once the abandoned-cart reminder has fired so it doesn't repeat. */
  abandonedNotified?: boolean;
  /** Stripe Payment Intent for the pending order (set when confirm_and_pay returns). */
  pendingPaymentIntentId?: string;
}

const WA_SESSION_TTL_MS = 90 * 60 * 1000; // 90 minutes — drops dormant sessions on read.

function isExpiredWaSession(s: WaSession): boolean {
  const ts = Date.parse(s.lastTurnAt);
  if (!Number.isFinite(ts)) return true;
  return Date.now() - ts > WA_SESSION_TTL_MS;
}

export async function getWaSession(rawPhone: string): Promise<WaSession | null> {
  const phone = normalizePlPhoneE164(rawPhone);
  if (!phone) return null;
  const all = await readJSON<Record<string, WaSession>>("whatsapp-sessions.json", {});
  const hit = all[phone];
  if (!hit) return null;
  if (isExpiredWaSession(hit)) return null;
  return hit;
}

export async function mutateWaSession(
  rawPhone: string,
  fn: (current: WaSession) => WaSession,
): Promise<WaSession | null> {
  const phone = normalizePlPhoneE164(rawPhone);
  if (!phone) return null;
  return withLock("whatsapp-sessions.json", async () => {
    const all = await readJSON<Record<string, WaSession>>("whatsapp-sessions.json", {});
    // Drop any sessions that have expired since the last write. Keeps the
    // keyspace bounded without a separate cleanup cron.
    for (const k of Object.keys(all)) {
      if (isExpiredWaSession(all[k])) delete all[k];
    }
    const current: WaSession = all[phone] ?? {
      phone,
      locationSlug: null,
      cartItems: [],
      fulfillmentType: null,
      slotId: null,
      deliveryAddress: null,
      customerName: null,
      pendingOrderId: null,
      pendingPaymentUrl: null,
      llmMessageHistory: [],
      lastTurnAt: new Date().toISOString(),
    };
    const next = fn(current);
    next.phone = phone;
    next.lastTurnAt = new Date().toISOString();
    all[phone] = next;
    await writeJSON("whatsapp-sessions.json", all);
    return next;
  });
}

export async function clearWaSession(rawPhone: string): Promise<void> {
  const phone = normalizePlPhoneE164(rawPhone);
  if (!phone) return;
  await withLock("whatsapp-sessions.json", async () => {
    const all = await readJSON<Record<string, WaSession>>("whatsapp-sessions.json", {});
    if (all[phone]) {
      delete all[phone];
      await writeJSON("whatsapp-sessions.json", all);
    }
  });
}

/**
 * Load the session for a phone, returning a fresh empty one when none
 * exists or it has expired. Read-only — no write — so the per-turn
 * handler can call this once at the top of the request, mutate the
 * returned object in memory across tool calls, and persist it exactly
 * once via setWaSession at the end. Replaces N round-trips with 2.
 */
export async function loadOrCreateWaSession(rawPhone: string): Promise<WaSession | null> {
  const phone = normalizePlPhoneE164(rawPhone);
  if (!phone) return null;
  const all = await readJSON<Record<string, WaSession>>("whatsapp-sessions.json", {});
  const hit = all[phone];
  if (hit && !isExpiredWaSession(hit)) return hit;
  return {
    phone,
    locationSlug: null,
    cartItems: [],
    fulfillmentType: null,
    slotId: null,
    deliveryAddress: null,
    customerName: null,
    pendingOrderId: null,
    pendingPaymentUrl: null,
    llmMessageHistory: [],
    lastTurnAt: new Date().toISOString(),
  };
}

/**
 * Persist a session loaded via loadOrCreateWaSession. Single write per
 * turn — the lock still protects against concurrent operator actions
 * (admin reply, session reset) that may race with an inbound webhook.
 */
export async function setWaSession(session: WaSession): Promise<void> {
  const phone = normalizePlPhoneE164(session.phone);
  if (!phone) return;
  await withLock("whatsapp-sessions.json", async () => {
    const all = await readJSON<Record<string, WaSession>>("whatsapp-sessions.json", {});
    for (const k of Object.keys(all)) {
      if (isExpiredWaSession(all[k])) delete all[k];
    }
    all[phone] = { ...session, phone, lastTurnAt: new Date().toISOString() };
    await writeJSON("whatsapp-sessions.json", all);
  });
}

export async function listWaSessions(): Promise<WaSession[]> {
  const all = await readJSON<Record<string, WaSession>>("whatsapp-sessions.json", {});
  return Object.values(all).filter((s) => !isExpiredWaSession(s));
}

export interface WaSettings {
  enabled: boolean;
  welcomeMessage: string;
  optOutPhrases: string[];
  /** Falls back to this slug when the LLM hasn't pinned a location yet. */
  defaultLocation: "krakow" | "warszawa" | null;
  /** Soft daily ceiling for inbound messages from any one phone. */
  dailyMessageCap: number;
  /** Approved Meta utility template name used to re-open the 24h window
   *  for abandoned-cart nudges. Empty string disables that reminder. */
  reopenTemplate: string;
}

const DEFAULT_WA_SETTINGS: WaSettings = {
  enabled: true,
  welcomeMessage:
    "Cześć! Tu Sud Italia 🍕 Napisz, co masz ochotę zjeść albo z jakiego miasta jesteś (Kraków / Warszawa).",
  optOutPhrases: ["STOP", "NIE", "UNSUBSCRIBE"],
  defaultLocation: null,
  dailyMessageCap: 60,
  reopenTemplate: "",
};

export async function getWaSettings(): Promise<WaSettings> {
  const stored = await readJSON<Partial<WaSettings>>("whatsapp-settings.json", {});
  return { ...DEFAULT_WA_SETTINGS, ...stored };
}

export async function updateWaSettings(updates: Partial<WaSettings>): Promise<WaSettings> {
  return withLock("whatsapp-settings.json", async () => {
    const current = await getWaSettings();
    const next: WaSettings = { ...current, ...updates };
    await writeJSON("whatsapp-settings.json", next);
    return next;
  });
}

// --- WhatsApp transcripts ----------------------------------------------
//
// Every inbound + outbound WhatsApp message is logged here so the operator
// can review what was actually said, take over a conversation, or audit
// the bot's behaviour after an order is paid. Kept as a flat per-phone
// ring buffer to bound disk growth: oldest entries drop once a per-phone
// or global cap is hit.

export type WaMessageDirection = "in" | "out";
export type WaMessageKind =
  | "text"
  | "selection"
  | "location"
  | "buttons"
  | "list"
  | "cta_url"
  | "template"
  | "unsupported";
export type WaMessageActor = "customer" | "bot" | "operator" | "system";

export interface WaMessage {
  /** ISO timestamp. */
  at: string;
  direction: WaMessageDirection;
  kind: WaMessageKind;
  /** Plain-text body for text/selection/template; CTA label or list intro otherwise. */
  body: string;
  /** Free-form metadata (button labels, link url, template name, sender label). */
  meta?: Record<string, unknown>;
  /** Who produced the message — customer, the bot, an operator, or the system (welcome, opt-out ack). */
  actor: WaMessageActor;
}

const WA_TRANSCRIPT_MAX_PER_PHONE = 200;
const WA_TRANSCRIPT_MAX_PHONES = 500;

const WHATSAPP_MESSAGES_DDL = [
  `CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id text PRIMARY KEY,
    phone text NOT NULL,
    at timestamptz NOT NULL,
    direction text NOT NULL,
    kind text NOT NULL,
    body text NOT NULL DEFAULT '',
    meta jsonb,
    actor text NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS whatsapp_messages_phone_at_idx
    ON whatsapp_messages (phone, at)`,
  `CREATE INDEX IF NOT EXISTS whatsapp_messages_at_idx
    ON whatsapp_messages (at)`,
];

async function ensureWhatsappMessagesTable(): Promise<void> {
  await ensureTable("whatsapp_messages", WHATSAPP_MESSAGES_DDL);
}

/**
 * Probabilistic per-phone cap: trim a phone's oldest rows back to the
 * limit on ~1% of writes. Avoids running the trim query on every send
 * (which would defeat the point of moving off the kv_store ring buffer)
 * while still keeping each conversation bounded over time. Operators
 * who care about a tight bound can run the same query from a cron later.
 */
async function maybeTrimWaTranscript(phone: string): Promise<void> {
  if (Math.random() > 0.01) return;
  const db = getDb();
  if (!db) return;
  try {
    // Keep the newest WA_TRANSCRIPT_MAX_PER_PHONE rows for this phone, delete the rest.
    await db.execute(drizzleSql`
      DELETE FROM whatsapp_messages
      WHERE phone = ${phone}
        AND id NOT IN (
          SELECT id FROM whatsapp_messages
          WHERE phone = ${phone}
          ORDER BY at DESC
          LIMIT ${WA_TRANSCRIPT_MAX_PER_PHONE}
        )
    `);
  } catch (err) {
    logger.debug("maybeTrimWaTranscript failed (non-fatal)", {
      phone,
      layer: "store.whatsapp",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Append one inbound/outbound WhatsApp message to the transcript log.
 *
 * Storage path is Postgres-first: each call is an O(log N) indexed insert
 * — no global lock and no read-then-write of a growing JSON blob like the
 * earlier kv_store ring buffer. When DATABASE_URL is unset (local dev
 * without Neon) we fall back to the legacy kv_store implementation so
 * the dev flow keeps working unchanged.
 */
export async function appendWaMessage(rawPhone: string, msg: WaMessage): Promise<void> {
  const phone = normalizePlPhoneE164(rawPhone);
  if (!phone) return;
  const db = getDb();
  if (db) {
    try {
      await ensureWhatsappMessagesTable();
      // Deterministic id so retried sends don't double-log. We compose
      // direction + at + first 64 chars of body; collisions are
      // vanishingly unlikely for human-scale chat volume.
      const id = createHash("sha256")
        .update(`${phone}|${msg.direction}|${msg.at}|${msg.body.slice(0, 64)}|${msg.actor}`)
        .digest("hex")
        .slice(0, 32);
      await db
        .insert(whatsappMessagesTable)
        .values({
          id,
          phone,
          at: new Date(msg.at),
          direction: msg.direction,
          kind: msg.kind,
          body: msg.body,
          meta: msg.meta ?? null,
          actor: msg.actor,
        })
        .onConflictDoNothing();
      void maybeTrimWaTranscript(phone);
      return;
    } catch (err) {
      logger.warn(
        "appendWaMessage DB insert failed; falling back to kv ring buffer",
        { phone, layer: "store.whatsapp" },
        err,
      );
      // Fall through to kv fallback below — better to log somewhere than nowhere.
    }
  }

  // Filesystem / kv_store fallback for local dev without a database.
  // Same per-phone ring-buffer semantics as the original implementation.
  try {
    await withLock("whatsapp-transcripts.json", async () => {
      const all = await readJSON<Record<string, WaMessage[]>>("whatsapp-transcripts.json", {});
      const existing = all[phone] ?? [];
      existing.push(msg);
      if (existing.length > WA_TRANSCRIPT_MAX_PER_PHONE) {
        existing.splice(0, existing.length - WA_TRANSCRIPT_MAX_PER_PHONE);
      }
      all[phone] = existing;

      const phones = Object.keys(all);
      if (phones.length > WA_TRANSCRIPT_MAX_PHONES) {
        let oldestPhone = phones[0];
        let oldestAt = all[oldestPhone][all[oldestPhone].length - 1]?.at ?? "";
        for (const p of phones) {
          const tail = all[p][all[p].length - 1]?.at ?? "";
          if (tail < oldestAt) {
            oldestAt = tail;
            oldestPhone = p;
          }
        }
        if (oldestPhone !== phone) delete all[oldestPhone];
      }

      await writeJSON("whatsapp-transcripts.json", all);
    });
  } catch (err) {
    logger.warn(
      "appendWaMessage kv fallback failed",
      { phone, layer: "store.whatsapp" },
      err,
    );
  }
}

export async function getWaTranscript(rawPhone: string, limit = 100): Promise<WaMessage[]> {
  const phone = normalizePlPhoneE164(rawPhone);
  if (!phone) return [];
  const db = getDb();
  if (db) {
    try {
      await ensureWhatsappMessagesTable();
      const cap = Math.max(1, Math.min(500, limit));
      const rows = await db
        .select()
        .from(whatsappMessagesTable)
        .where(eq(whatsappMessagesTable.phone, phone))
        .orderBy(desc(whatsappMessagesTable.at))
        .limit(cap);
      // Return oldest first so the chat scrolls naturally.
      return rows
        .reverse()
        .map((r) => ({
          at: r.at.toISOString(),
          direction: r.direction as WaMessageDirection,
          kind: r.kind as WaMessageKind,
          body: r.body,
          meta: (r.meta as Record<string, unknown> | null) ?? undefined,
          actor: r.actor as WaMessageActor,
        }));
    } catch (err) {
      logger.warn(
        "getWaTranscript DB read failed; falling back to kv",
        { phone, layer: "store.whatsapp" },
        err,
      );
    }
  }
  const all = await readJSON<Record<string, WaMessage[]>>("whatsapp-transcripts.json", {});
  const list = all[phone] ?? [];
  return list.slice(-limit);
}

/**
 * Distinct phones with at least one transcript entry, newest activity first.
 * Used by the admin "Conversations" surface so operators can browse historic
 * chats — not just live sessions.
 */
export async function listWaTranscriptHeads(limit = 100): Promise<
  { phone: string; lastAt: string; lastBody: string; messageCount: number; hasInbound: boolean }[]
> {
  const db = getDb();
  if (db) {
    try {
      await ensureWhatsappMessagesTable();
      const cap = Math.max(1, Math.min(500, limit));
      // One scan returns per-phone last activity, total count and whether
      // any inbound message exists. Backed by the (phone, at) index.
      const rows = await db.execute<{
        phone: string;
        last_at: Date;
        last_body: string;
        message_count: number;
        has_inbound: boolean;
      }>(drizzleSql`
        SELECT phone,
               MAX(at) AS last_at,
               (SELECT body FROM whatsapp_messages m2
                WHERE m2.phone = m.phone
                ORDER BY m2.at DESC LIMIT 1) AS last_body,
               COUNT(*)::int AS message_count,
               BOOL_OR(direction = 'in') AS has_inbound
          FROM whatsapp_messages m
         GROUP BY phone
         ORDER BY MAX(at) DESC
         LIMIT ${cap}
      `);
      const list = (rows as unknown as { rows?: unknown[] }).rows ?? rows;
      const arr = Array.isArray(list) ? list : [];
      return arr.map((r) => {
        const row = r as {
          phone: string;
          last_at: Date | string;
          last_body: string | null;
          message_count: number;
          has_inbound: boolean;
        };
        return {
          phone: row.phone,
          lastAt:
            row.last_at instanceof Date
              ? row.last_at.toISOString()
              : new Date(row.last_at).toISOString(),
          lastBody: (row.last_body ?? "").slice(0, 100),
          messageCount: row.message_count,
          hasInbound: row.has_inbound,
        };
      });
    } catch (err) {
      logger.warn(
        "listWaTranscriptHeads DB read failed; falling back to kv",
        { layer: "store.whatsapp" },
        err,
      );
    }
  }
  const all = await readJSON<Record<string, WaMessage[]>>("whatsapp-transcripts.json", {});
  const rows = Object.entries(all).map(([phone, list]) => {
    const last = list[list.length - 1];
    return {
      phone,
      lastAt: last?.at ?? "",
      lastBody: (last?.body ?? "").slice(0, 100),
      messageCount: list.length,
      hasInbound: list.some((m) => m.direction === "in"),
    };
  });
  rows.sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
  return rows.slice(0, limit);
}

export async function deleteWaTranscript(rawPhone: string): Promise<boolean> {
  const phone = normalizePlPhoneE164(rawPhone);
  if (!phone) return false;
  const db = getDb();
  if (db) {
    try {
      await ensureWhatsappMessagesTable();
      const result = await db
        .delete(whatsappMessagesTable)
        .where(eq(whatsappMessagesTable.phone, phone))
        .returning({ id: whatsappMessagesTable.id });
      if (result.length > 0) return true;
    } catch (err) {
      logger.warn(
        "deleteWaTranscript DB delete failed; falling back to kv",
        { phone, layer: "store.whatsapp" },
        err,
      );
    }
  }
  return withLock("whatsapp-transcripts.json", async () => {
    const all = await readJSON<Record<string, WaMessage[]>>("whatsapp-transcripts.json", {});
    if (!all[phone]) return false;
    delete all[phone];
    await writeJSON("whatsapp-transcripts.json", all);
    return true;
  });
}

// --- Business costs (operating expense ledger) ---------------------------

const BUSINESS_COSTS_KEY = "business-costs.json";

export interface BusinessCostFilters {
  locationSlug?: string;
  category?: BusinessCost["category"];
  status?: BusinessCost["status"];
}

export async function getBusinessCosts(filters?: BusinessCostFilters): Promise<BusinessCost[]> {
  const all = await readJSON<BusinessCost[]>(BUSINESS_COSTS_KEY, []);
  let list = all;
  if (filters?.locationSlug) {
    list = list.filter((c) => !c.locationSlug || c.locationSlug === filters.locationSlug);
  }
  if (filters?.category) list = list.filter((c) => c.category === filters.category);
  if (filters?.status) list = list.filter((c) => c.status === filters.status);
  return list.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getBusinessCost(id: string): Promise<BusinessCost | null> {
  const list = await readJSON<BusinessCost[]>(BUSINESS_COSTS_KEY, []);
  return list.find((c) => c.id === id) ?? null;
}

export async function saveBusinessCost(
  input: Omit<BusinessCost, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
    createdAt?: string;
  },
): Promise<BusinessCost> {
  return withLock(BUSINESS_COSTS_KEY, async () => {
    const list = await readJSON<BusinessCost[]>(BUSINESS_COSTS_KEY, []);
    const now = new Date().toISOString();
    const cost: BusinessCost = {
      id: input.id || `cost-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: input.name,
      category: input.category,
      payrollRole: input.payrollRole,
      vendor: input.vendor,
      amountGrosze: Math.max(0, Math.round(input.amountGrosze)),
      frequency: input.frequency,
      locationSlug: input.locationSlug,
      status: input.status,
      startDate: input.startDate,
      endDate: input.endDate,
      nextDueDate: input.nextDueDate,
      paymentMethod: input.paymentMethod,
      taxDeductible: input.taxDeductible,
      notes: input.notes,
      createdAt: input.createdAt ?? now,
      updatedAt: now,
    };
    const i = list.findIndex((c) => c.id === cost.id);
    if (i >= 0) list[i] = cost;
    else list.push(cost);
    await writeJSON(BUSINESS_COSTS_KEY, list);
    return cost;
  });
}

export async function deleteBusinessCost(id: string): Promise<boolean> {
  return withLock(BUSINESS_COSTS_KEY, async () => {
    const list = await readJSON<BusinessCost[]>(BUSINESS_COSTS_KEY, []);
    const filtered = list.filter((c) => c.id !== id);
    if (filtered.length === list.length) return false;
    await writeJSON(BUSINESS_COSTS_KEY, filtered);
    return true;
  });
}

// --- Finance simulation (sandbox monthly P&L) ----------------------------
//
// Pure projection sandbox — never touches business-costs.json. Defaults
// are tuned to a Neapolitan pizza truck operating in Warsaw 2026, with
// labor schedules anchored to a 12:00–22:00 service window plus ~1 h
// prep and ~1 h close-down (≈ 11 h staff day, 6 days/week). Hourly
// rates bake in the ~22% Polish employer narzut (ZUS social + Labour
// Fund) so a "rate × hours" multiplication lands at FULL employer
// cost — same convention the business-costs ledger uses.

const SIMULATION_KEY = "simulation-scenarios.json";

export function defaultSimulationScenario(): SimulationScenario {
  // Hourly rates: brutto Warsaw 2026 × 1.22 employer narzut, rounded
  // to the nearest 50 grosze. Operators who'd rather think in pure
  // brutto can divide by 1.22.
  const labor: SimulationLaborLine[] = [
    { id: "pizzaiolo",     role: "pizzaiolo",     headcount: 2, hoursPerWeek: 66, hourlyRateGrosze: 4300 },
    { id: "chef",          role: "chef",          headcount: 1, hoursPerWeek: 66, hourlyRateGrosze: 3700 },
    { id: "sous-chef",     role: "sous-chef",     headcount: 1, hoursPerWeek: 48, hourlyRateGrosze: 3300 },
    { id: "barista",       role: "barista",       headcount: 1, hoursPerWeek: 60, hourlyRateGrosze: 3900 },
    { id: "waiter",        role: "waiter",        headcount: 2, hoursPerWeek: 60, hourlyRateGrosze: 4000 },
    { id: "kitchen-porter",role: "kitchen-porter",headcount: 1, hoursPerWeek: 36, hourlyRateGrosze: 3000 },
    { id: "manager",       role: "manager",       headcount: 1, hoursPerWeek: 50, hourlyRateGrosze: 5500 },
  ];
  const fixedCosts: SimulationScenario["fixedCosts"] = {
    rent: 250_000,         // 2 500 zł — Warsaw food-truck pitch (1 200–3 000 zł range)
    utilities: 120_000,    // 1 200 zł — electric + water + gas (lower than full restaurant)
    fuel: 80_000,          //   800 zł — vehicle + generator
    vehicle: 70_000,       //   700 zł — maintenance + amortyzacja
    insurance: 60_000,     //   600 zł — OC działalności + truck OC/AC blended (400–1 000)
    licenses: 25_000,      //   250 zł — SANEPID + permits, annual fees / 12
    marketing: 150_000,    // 1 500 zł — moderate organic + paid social
    software: 25_000,      //   250 zł — GoPOS Pro (~100) + KDS + analytics
    professional: 40_000,  //   400 zł — biuro rachunkowe ryczałt
    tax: 180_000,          // 1 800 zł — ZUS właściciel + lokalne opłaty (excl. CIT)
    maintenance: 40_000,   //   400 zł — equipment service
    other: 30_000,         //   300 zł — buffer
  };
  return {
    ordersPerDay: 70,
    avgTicketGrosze: 6500,
    daysOpenPerMonth: 28,
    cogsPct: 0.30,
    labor,
    fixedCosts,
    wageInflationPct: 0.07,
    ingredientInflationPct: 0.04,
    paymentProcessorPct: 0.019,
    setupCostGrosze: 25_000_000,
    seasonality: {
      winter: 0.70,
      spring: 1.00,
      summer: 1.30,
      autumn: 1.00,
    },
    menuScenario: "balanced",
    assumptions: defaultSimulationAssumptions(),
    weather: defaultSimulationWeather(),
    updatedAt: new Date().toISOString(),
  };
}

/** Behavioral levers tuned to a Neapolitan pizza truck in Warsaw 2026. */
export function defaultSimulationAssumptions(): SimulationAssumptions {
  return {
    coffeeAttach:           { attachPct: 0.25, avgPriceGrosze: 900,  cogsPct: 0.12 },
    dessertAttach:          { attachPct: 0.12, avgPriceGrosze: 1600, cogsPct: 0.28 },
    antipastiAttach:        { attachPct: 0.08, avgPriceGrosze: 2400, cogsPct: 0.32 },
    aperitivoAttach:        { attachPct: 0.10, avgPriceGrosze: 2200, cogsPct: 0.22 },
    premiumToppingsAttach:  { attachPct: 0.15, avgPriceGrosze: 700,  cogsPct: 0.30 },
    pastaPrimoAttach:       { attachPct: 0.18, avgPriceGrosze: 3200, cogsPct: 0.26 },
    comboConversion: {
      pct: 0.20,
      addonGrosze: 2500,
      discountGrosze: 600,
      addonCogsPct: 0.25,
    },
    // Cheapest-pizza shift is a stress lever — default off (0 pp).
    cheapestPizzaShift: {
      pp: 0,
      ticketDeltaGrosze: 300,
      cogsDeltaGrosze: 100,
    },
    deliveryShare: {
      pct: 0.25,
      packagingCostGrosze: 250,
      extraProcessorPct: 0,
      avgFeeGrosze: 800,
    },
  };
}

/** Weather + Polish calendar baseline for Warsaw 2026. */
export function defaultSimulationWeather(): SimulationWeather {
  return {
    rainyDayMultiplier: 0.75,
    rainyShare: 0.30,
    heatwaveMultiplier: 1.40,
    heatwaveShare: 0.10,
    holidayClosedDaysPerMonth: 1.0,
    holidayPeakDaysPerMonth: 1.0,
    holidayPeakMultiplier: 1.60,
    schoolHolidayLunchMultiplier: 0.85,
    eventDaysPerMonth: 1,
    eventDayMultiplier: 1.50,
  };
}

export async function getSimulationScenario(): Promise<SimulationScenario> {
  const saved = await readJSON<Partial<SimulationScenario> | null>(SIMULATION_KEY, null);
  if (!saved || !Array.isArray(saved.labor) || typeof saved.ordersPerDay !== "number") {
    return defaultSimulationScenario();
  }
  const defaults = defaultSimulationScenario();
  return {
    ordersPerDay: saved.ordersPerDay ?? defaults.ordersPerDay,
    avgTicketGrosze: saved.avgTicketGrosze ?? defaults.avgTicketGrosze,
    daysOpenPerMonth: saved.daysOpenPerMonth ?? defaults.daysOpenPerMonth,
    cogsPct: typeof saved.cogsPct === "number" ? saved.cogsPct : defaults.cogsPct,
    labor: saved.labor.length > 0 ? saved.labor : defaults.labor,
    fixedCosts: saved.fixedCosts ?? defaults.fixedCosts,
    wageInflationPct:
      typeof saved.wageInflationPct === "number"
        ? saved.wageInflationPct
        : defaults.wageInflationPct,
    ingredientInflationPct:
      typeof saved.ingredientInflationPct === "number"
        ? saved.ingredientInflationPct
        : defaults.ingredientInflationPct,
    paymentProcessorPct:
      typeof saved.paymentProcessorPct === "number"
        ? saved.paymentProcessorPct
        : defaults.paymentProcessorPct,
    setupCostGrosze:
      typeof saved.setupCostGrosze === "number"
        ? saved.setupCostGrosze
        : defaults.setupCostGrosze,
    seasonality: saved.seasonality ?? defaults.seasonality,
    menuScenario:
      typeof saved.menuScenario === "string" ? saved.menuScenario : defaults.menuScenario,
    assumptions: hydrateAssumptions(saved.assumptions, defaults.assumptions),
    weather: hydrateWeather(saved.weather, defaults.weather),
    updatedAt: saved.updatedAt ?? defaults.updatedAt,
  };
}

function clamp01(n: unknown, fallback: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function clampNonNeg(n: unknown, fallback: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.max(0, n);
}

function hydrateAttach(
  saved: Partial<SimulationAttachLever> | undefined,
  fallback: SimulationAttachLever | undefined,
): SimulationAttachLever | undefined {
  if (!fallback) return saved as SimulationAttachLever | undefined;
  if (!saved) return fallback;
  return {
    enabled: typeof saved.enabled === "boolean" ? saved.enabled : true,
    attachPct: clamp01(saved.attachPct, fallback.attachPct),
    avgPriceGrosze: Math.round(clampNonNeg(saved.avgPriceGrosze, fallback.avgPriceGrosze)),
    cogsPct: clamp01(saved.cogsPct, fallback.cogsPct),
  };
}

function hydrateAssumptions(
  saved: SimulationAssumptions | undefined,
  fallback: SimulationAssumptions | undefined,
): SimulationAssumptions | undefined {
  const fb = fallback ?? defaultSimulationAssumptions();
  if (!saved) return fb;
  return {
    coffeeAttach: hydrateAttach(saved.coffeeAttach, fb.coffeeAttach),
    dessertAttach: hydrateAttach(saved.dessertAttach, fb.dessertAttach),
    antipastiAttach: hydrateAttach(saved.antipastiAttach, fb.antipastiAttach),
    aperitivoAttach: hydrateAttach(saved.aperitivoAttach, fb.aperitivoAttach),
    premiumToppingsAttach: hydrateAttach(saved.premiumToppingsAttach, fb.premiumToppingsAttach),
    pastaPrimoAttach: hydrateAttach(saved.pastaPrimoAttach, fb.pastaPrimoAttach),
    comboConversion: saved.comboConversion
      ? {
          enabled: typeof saved.comboConversion.enabled === "boolean" ? saved.comboConversion.enabled : true,
          pct: clamp01(saved.comboConversion.pct, fb.comboConversion?.pct ?? 0),
          addonGrosze: Math.round(
            clampNonNeg(saved.comboConversion.addonGrosze, fb.comboConversion?.addonGrosze ?? 0),
          ),
          discountGrosze: Math.round(
            clampNonNeg(saved.comboConversion.discountGrosze, fb.comboConversion?.discountGrosze ?? 0),
          ),
          addonCogsPct: clamp01(saved.comboConversion.addonCogsPct, fb.comboConversion?.addonCogsPct ?? 0),
        }
      : fb.comboConversion,
    cheapestPizzaShift: saved.cheapestPizzaShift
      ? {
          enabled: typeof saved.cheapestPizzaShift.enabled === "boolean" ? saved.cheapestPizzaShift.enabled : true,
          pp: clamp01(saved.cheapestPizzaShift.pp, fb.cheapestPizzaShift?.pp ?? 0),
          ticketDeltaGrosze: Math.round(
            clampNonNeg(saved.cheapestPizzaShift.ticketDeltaGrosze, fb.cheapestPizzaShift?.ticketDeltaGrosze ?? 0),
          ),
          cogsDeltaGrosze: Math.round(
            clampNonNeg(saved.cheapestPizzaShift.cogsDeltaGrosze, fb.cheapestPizzaShift?.cogsDeltaGrosze ?? 0),
          ),
        }
      : fb.cheapestPizzaShift,
    deliveryShare: saved.deliveryShare
      ? {
          enabled: typeof saved.deliveryShare.enabled === "boolean" ? saved.deliveryShare.enabled : true,
          pct: clamp01(saved.deliveryShare.pct, fb.deliveryShare?.pct ?? 0),
          packagingCostGrosze: Math.round(
            clampNonNeg(saved.deliveryShare.packagingCostGrosze, fb.deliveryShare?.packagingCostGrosze ?? 0),
          ),
          extraProcessorPct: clamp01(
            saved.deliveryShare.extraProcessorPct,
            fb.deliveryShare?.extraProcessorPct ?? 0,
          ),
          avgFeeGrosze: Math.round(
            clampNonNeg(saved.deliveryShare.avgFeeGrosze, fb.deliveryShare?.avgFeeGrosze ?? 0),
          ),
        }
      : fb.deliveryShare,
  };
}

function hydrateWeather(
  saved: SimulationWeather | undefined,
  fallback: SimulationWeather | undefined,
): SimulationWeather | undefined {
  const fb = fallback ?? defaultSimulationWeather();
  if (!saved) return fb;
  const clampMult = (n: unknown, f: number): number => {
    if (typeof n !== "number" || !Number.isFinite(n)) return f;
    return Math.max(0, Math.min(5, n));
  };
  const clampDays = (n: unknown, f: number): number => {
    if (typeof n !== "number" || !Number.isFinite(n)) return f;
    return Math.max(0, Math.min(31, n));
  };
  return {
    rainyDayMultiplier: clampMult(saved.rainyDayMultiplier, fb.rainyDayMultiplier),
    rainyShare: clamp01(saved.rainyShare, fb.rainyShare),
    heatwaveMultiplier: clampMult(saved.heatwaveMultiplier, fb.heatwaveMultiplier),
    heatwaveShare: clamp01(saved.heatwaveShare, fb.heatwaveShare),
    holidayClosedDaysPerMonth: clampDays(
      saved.holidayClosedDaysPerMonth,
      fb.holidayClosedDaysPerMonth,
    ),
    holidayPeakDaysPerMonth: clampDays(saved.holidayPeakDaysPerMonth, fb.holidayPeakDaysPerMonth),
    holidayPeakMultiplier: clampMult(saved.holidayPeakMultiplier, fb.holidayPeakMultiplier),
    schoolHolidayLunchMultiplier: clampMult(
      saved.schoolHolidayLunchMultiplier,
      fb.schoolHolidayLunchMultiplier,
    ),
    eventDaysPerMonth: clampDays(saved.eventDaysPerMonth, fb.eventDaysPerMonth),
    eventDayMultiplier: clampMult(saved.eventDayMultiplier, fb.eventDayMultiplier),
  };
}

function clampSimPct(n: unknown, fallback: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function cleanSimSeasonality(
  s: SimulationSeasonality | undefined,
  fallback: SimulationSeasonality,
): SimulationSeasonality {
  if (!s) return fallback;
  const clamp = (n: unknown, f: number): number => {
    if (typeof n !== "number" || !Number.isFinite(n)) return f;
    return Math.max(0, Math.min(3, n));
  };
  return {
    winter: clamp(s.winter, fallback.winter),
    spring: clamp(s.spring, fallback.spring),
    summer: clamp(s.summer, fallback.summer),
    autumn: clamp(s.autumn, fallback.autumn),
  };
}

export async function saveSimulationScenario(
  scenario: SimulationScenario,
): Promise<SimulationScenario> {
  return withLock(SIMULATION_KEY, async () => {
    const defaults = defaultSimulationScenario();
    const clean: SimulationScenario = {
      ordersPerDay: Math.max(0, Math.round(scenario.ordersPerDay)),
      avgTicketGrosze: Math.max(0, Math.round(scenario.avgTicketGrosze)),
      daysOpenPerMonth: Math.max(0, Math.min(31, Math.round(scenario.daysOpenPerMonth))),
      cogsPct: Math.max(0, Math.min(1, scenario.cogsPct)),
      labor: scenario.labor.map((l) => ({
        id: l.id,
        role: l.role,
        headcount: Math.max(0, Math.round(l.headcount)),
        hoursPerWeek: Math.max(0, Math.round(l.hoursPerWeek)),
        hourlyRateGrosze: Math.max(0, Math.round(l.hourlyRateGrosze)),
      })),
      fixedCosts: Object.fromEntries(
        Object.entries(scenario.fixedCosts ?? {}).map(([k, v]) => [
          k,
          Math.max(0, Math.round(v ?? 0)),
        ]),
      ) as SimulationScenario["fixedCosts"],
      wageInflationPct: clampSimPct(scenario.wageInflationPct, defaults.wageInflationPct ?? 0),
      ingredientInflationPct: clampSimPct(
        scenario.ingredientInflationPct,
        defaults.ingredientInflationPct ?? 0,
      ),
      paymentProcessorPct: clampSimPct(
        scenario.paymentProcessorPct,
        defaults.paymentProcessorPct ?? 0,
      ),
      setupCostGrosze:
        typeof scenario.setupCostGrosze === "number" && Number.isFinite(scenario.setupCostGrosze)
          ? Math.max(0, Math.round(scenario.setupCostGrosze))
          : (defaults.setupCostGrosze ?? 0),
      seasonality: cleanSimSeasonality(
        scenario.seasonality,
        defaults.seasonality ?? { winter: 1, spring: 1, summer: 1, autumn: 1 },
      ),
      menuScenario:
        typeof scenario.menuScenario === "string" && scenario.menuScenario.length > 0
          ? scenario.menuScenario
          : undefined,
      assumptions: hydrateAssumptions(scenario.assumptions, defaults.assumptions),
      weather: hydrateWeather(scenario.weather, defaults.weather),
      updatedAt: new Date().toISOString(),
    };
    await writeJSON(SIMULATION_KEY, clean);
    return clean;
  });
}

/** Derive a simulation scenario from the last 30 days of the real
 *  business-costs ledger. One-way only (ledger → simulator). */
export async function seedSimulationFromHistory(): Promise<SimulationScenario> {
  const base = defaultSimulationScenario();
  const costs = await readJSON<BusinessCost[]>(BUSINESS_COSTS_KEY, []);
  const active = costs.filter((c) => c.status === "active");

  const payrollByRole = new Map<BusinessCostPayrollRole, number>();
  const fixed: Partial<Record<BusinessCostCategory, number>> = {};
  for (const c of active) {
    if (c.frequency === "one-off") continue;
    const monthly = Math.round(c.amountGrosze * FREQUENCY_TO_MONTHS_INTERNAL[c.frequency]);
    if (c.category === "payroll") {
      const role = c.payrollRole ?? "other";
      payrollByRole.set(role, (payrollByRole.get(role) ?? 0) + monthly);
    } else {
      fixed[c.category] = (fixed[c.category] ?? 0) + monthly;
    }
  }

  const labor: SimulationLaborLine[] =
    payrollByRole.size > 0
      ? Array.from(payrollByRole.entries()).map(([role, monthlyGrosze]) => {
          const monthlyHours = 40 * 4.345;
          const hourlyRateGrosze = monthlyHours > 0 ? Math.round(monthlyGrosze / monthlyHours) : 0;
          return {
            id: `seed-${role}`,
            role,
            headcount: 1,
            hoursPerWeek: 40,
            hourlyRateGrosze,
          };
        })
      : base.labor;

  return {
    ...base,
    labor,
    fixedCosts: Object.keys(fixed).length > 0 ? fixed : base.fixedCosts,
    updatedAt: new Date().toISOString(),
  };
}

const FREQUENCY_TO_MONTHS_INTERNAL: Record<BusinessCost["frequency"], number> = {
  "one-off": 0,
  daily: 30.4375,
  weekly: 4.345,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
};

// --- Generic kv cache helpers (audit §3 AI forecast cache) ----------------
//
// Thin public wrappers around the internal readJSON/writeJSON so feature
// code (e.g. the Claude-backed forecast endpoint) can persist short-lived
// derived data without each caller learning the kv_store layout.

export async function getCacheJson<T>(key: string, fallback: T): Promise<T> {
  return readJSON<T>(key, fallback);
}

export async function setCacheJson<T>(key: string, data: T): Promise<void> {
  await writeJSON<T>(key, data);
}
