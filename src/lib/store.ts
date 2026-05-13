import { readFile, writeFile, access, mkdir } from "fs/promises";
import { join } from "path";
import { neon } from "@neondatabase/serverless";
import { TimeSlot, Order, Ingredient, Recipe, IngredientStock, StockMovement, Supplier, PurchaseOrder, PurchaseOrderStatus, CustomerNote, StaffMember, Shift, TimePunch, TruckRoute, TruckEvent, ExpansionChecklist, AuditLogEntry, AdminUser, ComplianceItem, CashSession, CashDrop } from "@/data/types";
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
import { and, desc, eq, inArray, lt, sql as drizzleSql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLog as auditLogTable, customerNotes as customerNotesTable, customers as customersTable, feedback as feedbackTable, ingredientStock as ingredientStockTable, ingredients as ingredientsTable, loyaltyMembers as loyaltyMembersTable, orderItems as orderItemsTable, orders as ordersTable, pointAdjustments as pointAdjustmentsTable, recipes as recipesTable, shifts as shiftsTable, slots as slotsTable, staff as staffTable, stockMovements as stockMovementsTable, timePunches as timePunchesTable } from "@/db/schema";
import { gte, lte } from "drizzle-orm";
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
 * Phase 1 will scope lock keys narrower (e.g. `slots:${locationSlug}:${date}`
 * instead of `slots.json`) as each entity is normalized off kv_store. For now
 * the keys match the legacy file names so the callsites can stay put.
 */
function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
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
    if (slot.currentOrders >= slot.maxOrders) return false;
    slot.currentOrders += 1;
    await writeJSON("slots.json", slots);
    await dualWriteSlot(slot);
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
    stripe_session_id text,
    stripe_payment_intent_id text,
    delivery_address text,
    created_at timestamptz NOT NULL,
    paid_at timestamptz,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS orders_location_created_at_idx
    ON orders (location_slug, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status)`,
  `CREATE INDEX IF NOT EXISTS orders_customer_phone_idx
    ON orders (customer_phone)`,
  `CREATE INDEX IF NOT EXISTS orders_stripe_payment_intent_idx
    ON orders (stripe_payment_intent_id)`,
  `CREATE INDEX IF NOT EXISTS orders_slot_id_idx ON orders (slot_id)`,
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
    sms_optout text NOT NULL DEFAULT 'false',
    email_optout text NOT NULL DEFAULT 'false',
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
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
    smsOptout: row.smsOptout === "true",
    emailOptout: row.emailOptout === "true",
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
  const saved = await withLock("orders.json", async () => {
    const orders = await readJSON<Order[]>("orders.json", []);
    orders.push(order);
    await writeJSON("orders.json", orders);
    await dualWriteOrder(order);
    return order;
  });
  // Fire-and-forget rollup so the checkout request doesn't wait. A failure
  // here only means the customer's row is one order behind until the next
  // event refreshes it — non-blocking and idempotent.
  void recomputeCustomerRollup(order.customerPhone);
  emitOrderEvent({ kind: "created", orderId: order.id, locationSlug: order.locationSlug });
  return saved;
}

export async function updateOrderStatus(id: string, status: Order["status"]): Promise<Order | null> {
  const updated = await withLock("orders.json", async () => {
    const orders = await readJSON<Order[]>("orders.json", []);
    const index = orders.findIndex((o) => o.id === id);
    if (index === -1) return null;
    orders[index].status = status;
    await writeJSON("orders.json", orders);
    await dualWriteOrder(orders[index]);
    return orders[index];
  });
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
  const updated = await withLock("orders.json", async () => {
    const orders = await readJSON<Order[]>("orders.json", []);
    const index = orders.findIndex((o) => o.id === id);
    if (index === -1) return null;
    orders[index] = { ...orders[index], ...patch };
    await writeJSON("orders.json", orders);
    await dualWriteOrder(orders[index]);
    return orders[index];
  });
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
  }
  return updated;
}

export async function deleteOrder(id: string): Promise<boolean> {
  let slotId: string | undefined;
  let customerPhone: string | undefined;
  let locationSlug: string | undefined;
  const removed = await withLock("orders.json", async () => {
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

export interface Notification {
  id: string;
  type: "new_order" | "slot_full" | "daily_summary" | "low_slots" | "order_status";
  title: string;
  message: string;
  locationSlug?: string;
  /** When set (e.g. new_order), removed when the order is deleted from admin. */
  orderId?: string;
  createdAt: string;
  read: boolean;
}

export async function getNotifications(): Promise<Notification[]> {
  return readJSON<Notification[]>("notifications.json", []);
}

export async function addNotification(notif: Omit<Notification, "id" | "createdAt" | "read">): Promise<Notification> {
  return withLock("notifications.json", async () => {
    const notifications = await readJSON<Notification[]>("notifications.json", []);
    const entry: Notification = {
      ...notif,
      id: `notif-${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
      read: false,
    };
    notifications.unshift(entry);
    if (notifications.length > 100) notifications.length = 100;
    await writeJSON("notifications.json", notifications);
    return entry;
  });
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

// --- Settings ---

export interface AppSettings {
  deliveryFee: number; // in grosze
  minOrderAmount: number; // in grosze
  businessPhone: string;
  businessEmail: string;
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
  liveActivity: { ordersInLastHour: boolean; currentlyPreparing: boolean; trendingItem: boolean; avgPrepTime: boolean };
}

const DEFAULT_LOYALTY_SETTINGS: LoyaltySettings = {
  tiers: {
    bronze: { threshold: 0, multiplier: 1, perks: ["1 point per 1 PLN spent"] },
    silver: { threshold: 500, multiplier: 1.5, perks: ["1.5x points multiplier", "Free birthday dessert"] },
    gold: { threshold: 1500, multiplier: 2, perks: ["2x points multiplier", "Priority ordering", "Free delivery"] },
    platinum: { threshold: 5000, multiplier: 3, perks: ["3x points multiplier", "Exclusive menu items", "VIP events"] },
  },
  rewards: [
    { id: "free-drink", name: "Free Drink", pointsCost: 50, description: "Any drink from the menu", active: true },
    { id: "10-off", name: "10 PLN Off", pointsCost: 100, description: "Discount on your next order", active: true },
    { id: "free-dessert", name: "Free Dessert", pointsCost: 120, description: "Any dessert from the menu", active: true },
    { id: "free-pizza", name: "Free Pizza", pointsCost: 250, description: "Any pizza from the menu", active: true },
    { id: "25-off", name: "25 PLN Off", pointsCost: 250, description: "Big discount on your next order", active: true },
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
  liveActivity: { ordersInLastHour: true, currentlyPreparing: true, trendingItem: true, avgPrepTime: true },
};

export async function getLoyaltySettings(): Promise<LoyaltySettings> {
  const saved = await readJSON<Partial<LoyaltySettings>>("loyalty-settings.json", {});
  return { ...DEFAULT_LOYALTY_SETTINGS, ...saved };
}

export async function updateLoyaltySettings(updates: Partial<LoyaltySettings>): Promise<LoyaltySettings> {
  return withLock("loyalty-settings.json", async () => {
    const current = await readJSON<Partial<LoyaltySettings>>("loyalty-settings.json", {});
    const merged = { ...DEFAULT_LOYALTY_SETTINGS, ...current, ...updates };
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
    dob text,
    signed_up_at timestamptz NOT NULL
  )`,
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
}

export interface LocationUpsellConfig {
  popularItems: string[];
  staffPicks: string[];
  preferredCoffee: string;
  preferredDessert: string;
  preferredDrink: string;
  combos: LocationComboDeal[];
}

export type UpsellSettings = Record<string, LocationUpsellConfig>;

export async function getUpsellSettings(): Promise<UpsellSettings> {
  return readJSON<UpsellSettings>("upsell-settings.json", {});
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
    hire_date text,
    dob text,
    status text NOT NULL,
    notes text,
    created_at timestamptz NOT NULL
  )`,
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
 */
export async function getLaborCostInRange(
  locationSlug: string | undefined,
  fromIso: string,
  toIso: string,
  now: Date = new Date(),
): Promise<{ laborGrosze: number; openShifts: number }> {
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
          laborGrosze += ((endedAt - startedAt) / 1000 / 3600) * member.hourlyRateGrosze;
        }
        inAt = null;
      }
    }
    if (inAt !== null) {
      openShifts++;
      const startedAt = Math.max(inAt, fromMs);
      const endedAt = Math.min(nowMs, toMs);
      if (endedAt > startedAt) {
        laborGrosze += ((endedAt - startedAt) / 1000 / 3600) * member.hourlyRateGrosze;
      }
    }
  }

  return { laborGrosze: Math.round(laborGrosze), openShifts };
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

export async function getCashSessions(locationSlug?: string): Promise<CashSession[]> {
  const all = await readJSON<CashSession[]>("cash-sessions.json", []);
  const list = locationSlug ? all.filter((s) => s.locationSlug === locationSlug) : all;
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

export async function deleteComplianceItem(id: string): Promise<boolean> {
  return withLock("compliance.json", async () => {
    const list = await readJSON<ComplianceItem[]>("compliance.json", []);
    const filtered = list.filter((c) => c.id !== id);
    if (filtered.length === list.length) return false;
    await writeJSON("compliance.json", filtered);
    return true;
  });
}
