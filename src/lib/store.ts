import { readFile, writeFile, access, mkdir, readdir, unlink } from "fs/promises";
import { join } from "path";
import { createHash } from "crypto";
import { neon } from "@neondatabase/serverless";
import { TimeSlot, Order, Ingredient, IngredientProduct, Recipe, IngredientStock, StockMovement, Supplier, PurchaseOrder, PurchaseOrderStatus, CustomerNote, StaffMember, Shift, TimePunch, EventRunSheet, BookingEvent, ExpansionChecklist, AuditLogEntry, AdminUser, WebAuthnCredential, ComplianceItem, CashSession, CashDrop, MenuItem, BusinessCost, BusinessCostCategory, SimulationScenario, SimulationLaborLine, SimulationSeasonality, SimulationAssumptions, SimulationAttachLever, SimulationIngredientLever, SimulationWeather, SimulationKitchenCapacity, SimulationActualsSnapshot, SimulationMenuEngineeringLine, SimulationCohortSnapshot, SimulationDaypartLine, SimulationHourlyThroughputLine, SimulationSssgSnapshot, SimulationFleetModel, SimulationPremises, SimulationMenuScenarioOverride, FloorTable, Reservation, PosTab, PosTabDiscount, PosTabLine, PosTabStatus, FulfillmentType, SelectedModifier, WaitlistEntry, WaitlistStatus } from "@/data/types";
import { getActiveLocationsAsync, getLocationAsync } from "@/lib/locations-store";
import { posLineKey } from "@/lib/pos-line";
import { timeToMinutes } from "@/lib/floor";
import { resolvePolicy, buildTurnModel, summariseDecisions, summariseTurnAccuracy, dowOf, type SeatingPolicy, type StoredSeatingPolicy, type TurnModel, type TurnSample, type TurnAccuracy, type SeatingDecision, type SeatingDecisionSummary, type OverrideReason, type SeatingWeights } from "@/lib/seating";
import { getUpstashRedis } from "@/lib/upstash-redis";
import {
  getCartPresenceForLocationRedis,
  upsertCartPresenceRedis,
} from "@/lib/cart-presence-redis";
import { SITE_NAME, WALLET_MAX_PHONES } from "@/lib/constants";
import { normalizePlPhoneE164, phonesEqualPl } from "@/lib/phone";
import { cashVarianceGrosze as computeCashVariance } from "@/lib/cash-recon";
import type { Experiment } from "@/lib/experiments";
import type { MLUpsellModel } from "@/lib/ml-upsell";
import type {
  Task,
  TaskStatus,
  Announcement,
  AnnouncementState,
  RoutineTemplate,
  RoutineCompletion,
} from "@/lib/comms";
import { logger } from "@/lib/logger";
import { hashPassword, hashPin, verifyPin } from "@/lib/password";
import { staffRoleToAdminRole } from "@/lib/staff-roles";
import { userCoversLocation } from "@/lib/user-locations";
import {
  type SurveyDefinition,
  type SurveyResponse,
  mergeSurveysWithDefaults,
} from "@/lib/surveys";
import { withDistributedLock } from "@/lib/locks";
import {
  ALL_BOARDROOM_PERSONA_IDS,
  type BoardroomPersonaId,
} from "@/lib/ai/boardroom/personas";
import {
  mergeAgentConfig,
  type AgentConfig,
  type AgentConfigPatch,
} from "@/lib/ai/boardroom/agent-config";
import { getDailyBudgetGrosze } from "@/lib/ai/cost";
import { getDailyAiSpendGrosze } from "@/lib/ai/conversations";
import { isSlotFull } from "@/lib/slot-capacity";
import { resolveSkinSettings, type ThemeSkinSettings } from "@/lib/theme-skins";
import { emitOrderEvent } from "@/lib/order-events";
import { appendOutboxEvent } from "@/lib/outbox";
import { incrCounter } from "@/lib/metrics";
import { and, asc, desc, eq, gte, inArray, lt, ne, sql as drizzleSql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { allergenIncidents as allergenIncidentsTable, auditLog as auditLogTable, brands as brandsTable, customerNotes as customerNotesTable, customers as customersTable, feedback as feedbackTable, franchisees as franchiseesTable, ingredientProducts as ingredientProductsTable, ingredientStock as ingredientStockTable, ingredients as ingredientsTable, kdsTickets as kdsTicketsTable, locationAssignments as locationAssignmentsTable, loyaltyMembers as loyaltyMembersTable, menuItemStation as menuItemStationTable, orderItems as orderItemsTable, orders as ordersTable, pointAdjustments as pointAdjustmentsTable, recipes as recipesTable, royaltyStatements as royaltyStatementsTable, shifts as shiftsTable, slots as slotsTable, staff as staffTable, stations as stationsTable, stockMovements as stockMovementsTable, surveyResponses as surveyResponsesTable, tempLogs as tempLogsTable, timePunches as timePunchesTable, whatsappMessages as whatsappMessagesTable } from "@/db/schema";
import { lte } from "drizzle-orm";
import { bumpLazyBackfillHit, ensureTable } from "@/db/migrate";
import { dbBreakerOpen, withDbTimeout } from "@/lib/db-resilience";
import { getBaseSlug } from "@/lib/utils";
import { ALL_CURRENCIES } from "@/lib/currency";
import { estimateReadyAt, type PrepOpts } from "@/lib/eta";
import { DEFAULT_REFUND_CONTROLS, type RefundControls } from "@/lib/refund-guard";
import { tempVerdict } from "@/lib/haccp";

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
  await withDbTimeout(
    () => db`
    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '[]'::jsonb
    )
  `,
    "ensureDB",
  );
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

// --- Isolated data mode: Simulation --------------------------------------
// Two whole-business datasets isolated behind a key prefix, so real data is
// physically untouched (un-prefixed keys are never read or written while a mode
// is active). At most one prefix is live at a time:
//
//   ""          live / real operations
//   "sim:"      Simulation mode — seeded on first enable (seedSimulation) with a
//               REALISTIC, DEEP CORE picture (~10 months of weekend-weighted,
//               daypart-curved trading over a large mostly-one-time guest base)
//               so reports/cohorts/dayparts/menu-eng have genuine signal for a
//               pre-launch dry-run; the owner then layers their own test
//               orders/waste/costs on top. Toggling it off hides every test row
//               instantly (data is kept so you can resume; "reset" re-seeds a
//               clean run, "wipe" clears it to empty for hand-entry).
//
// Simulation suppresses real-world side-effects (payments, SMS, WhatsApp, cron)
// — see isTestModeActive(). Driven by the `simulationModeEnabled` setting;
// toggled via /api/admin/simulation-mode. Distinct from the per-record
// `simulated` flag.

const SIMULATION_PREFIX = "sim:";

/** The active namespace prefix for a given settings blob ("" = live). */
function prefixForSettings(s: {
  simulationModeEnabled?: boolean;
}): string {
  if (s.simulationModeEnabled === true) return SIMULATION_PREFIX;
  return "";
}

// Keys that STAY real/shared even in simulation: the menu (prices/86s, recipes,
// ingredients), auth, locations, and config/credentials. settings.json holds
// the toggle itself, so it must never be namespaced (also breaks recursion).
const SHARED_KEYS = new Set<string>([
  "settings.json",
  "menu-overrides.json",
  "recipes.json",
  "ingredients.json",
  "ingredient-products.json",
  "admin-users.json",
  "ai-model.json",
  "payment-settings.json",
  "integration-settings.json",
  "agent-configs.json",
  "whatsapp-settings.json",
]);

const DATA_MODE_TTL_MS = 2_500;
let dataModeCache: { prefix: string; at: number } | null = null;
let dataModeInflight: Promise<string> | null = null;

/** Sync snapshot of the active namespace prefix — drives key prefixing + sync
 *  guards. "" = live. Only trustworthy once refreshDataMode() has primed the
 *  cache for this process; namespaced reads/writes await that first (see
 *  readJSON/writeJSON and the withAdmin entry primer). */
function activePrefixSync(): string {
  return dataModeCache?.prefix ?? "";
}

/** Refresh the cached prefix from the SHARED settings blob (never prefixed, so
 *  it can't recurse). Primed early in getSettings() and before every namespaced
 *  read/write. Concurrent cold callers dedupe onto one settings round-trip so a
 *  burst of reads on a fresh instance all resolve to the SAME value instead of
 *  some racing ahead with the stale "off" default. */
async function refreshDataMode(): Promise<string> {
  if (dataModeCache && Date.now() - dataModeCache.at < DATA_MODE_TTL_MS) return dataModeCache.prefix;
  if (dataModeInflight) return dataModeInflight;
  dataModeInflight = (async () => {
    try {
      const raw = await rawReadJSON<{ simulationModeEnabled?: boolean }>("settings.json", {});
      dataModeCache = { prefix: prefixForSettings(raw), at: Date.now() };
      return dataModeCache.prefix;
    } finally {
      dataModeInflight = null;
    }
  })();
  return dataModeInflight;
}

/** Clear the cache so the next read reflects a just-toggled value. */
export function bustDataModeCache(): void {
  dataModeCache = null;
}

/** Public async guard for external side-effects (Stripe, comms, push, cron):
 *  true whenever the isolated Simulation mode is active, so no real
 *  charge/message/job ever fires against test data. */
export async function isTestModeActive(): Promise<boolean> {
  return (await refreshDataMode()) !== "";
}

/** Which isolated data mode is live right now — for banners, wipes and the
 *  toggle route. */
export async function getActiveDataMode(): Promise<"live" | "simulation"> {
  const p = await refreshDataMode();
  return p === SIMULATION_PREFIX ? "simulation" : "live";
}

/** Wipe every key under one namespace prefix. Real/shared keys are never
 *  touched — only `prefix`-prefixed keys are removed. */
async function wipeNamespace(prefix: string): Promise<void> {
  // A wipe removes blobs out from under the heavy-read cache; drop it wholesale
  // so a stale parse can't outlive the reset (cheap — the map is tiny). Bump the
  // analytics version too so the daily-stats / insights memos rebuild.
  heavyReadCache.clear();
  bumpAnalyticsVersion();
  if (useDB) {
    await ensureDB();
    const db = sql();
    await db`DELETE FROM kv_store WHERE key LIKE ${prefix + "%"}`;
    return;
  }
  await ensureDataDir();
  try {
    const files = await readdir(DATA_DIR);
    await Promise.all(
      files
        .filter((f) => f.startsWith(prefix))
        .map((f) => unlink(join(DATA_DIR, f)).catch(() => {})),
    );
  } catch {
    /* nothing to wipe */
  }
}

/** Wipe the entire Simulation dataset — clears every hand-entered test row. */
export async function wipeSimulationData(): Promise<void> {
  return wipeNamespace(SIMULATION_PREFIX);
}

function resolveKey(key: string): string {
  if (SHARED_KEYS.has(key)) return key;
  return activePrefixSync() + key;
}

/** A DB handle that disappears in any isolated mode so the normalized-table
 *  branches fall through to their kv path (which resolveKey namespaces). Used
 *  ONLY in sandboxed-domain fns; infra keeps calling getDb() directly.
 *
 *  Awaits the live mode first: the DB-mode domain branch picks its handle here
 *  BEFORE any read/write, so a cold module cache (RSC pages, the storefront
 *  checkout route, or any path not wrapped by withAdmin) must not be handed the
 *  REAL database while a test mode is on — that would both leak real data into
 *  the test view and pollute the real tables with test writes. */
async function getDomainDb() {
  await refreshDataMode();
  return activePrefixSync() === "" ? getDb() : null;
}

async function readJSON<T>(key: string, fallback: T): Promise<T> {
  // Resolve the namespace from the LIVE mode, not a possibly-cold module cache.
  // Separate Next bundles (RSC vs route handlers) and fresh serverless instances
  // each start with an unprimed cache, which would silently read the REAL dataset
  // while a test mode is on. Shared keys are never namespaced, so they skip the
  // round-trip (and avoid recursing on settings.json, which refreshDataMode reads raw).
  if (!SHARED_KEYS.has(key)) await refreshDataMode();
  const resolved = resolveKey(key);
  if (HEAVY_READ_KEYS.has(key)) {
    const hit = heavyReadCache.get(resolved);
    if (hit && Date.now() - hit.at < HEAVY_READ_TTL_MS) return (await hit.promise) as T;
    const promise = rawReadJSON(resolved, fallback);
    heavyReadCache.set(resolved, { at: Date.now(), promise });
    return (await promise) as T;
  }
  return rawReadJSON(resolved, fallback);
}

async function rawReadJSON<T>(key: string, fallback: T): Promise<T> {
  if (useDB) {
    // Breaker open → Neon is unhealthy; skip it and serve the fallback
    // immediately rather than timing out once per call (build-time prerender
    // of 200+ pages would otherwise crawl into the 60s page limit).
    if (dbBreakerOpen()) return fallback;
    try {
      await ensureDB();
      const db = sql();
      const rows = await withDbTimeout(
        () => db`SELECT value FROM kv_store WHERE key = ${key}`,
        `readJSON:${key}`,
      );
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
  // Same namespace guard as readJSON: a cold cache must not route a test-mode
  // write into the REAL dataset (which would both corrupt real data and leave
  // the test surface empty). Shared keys are never namespaced.
  if (!SHARED_KEYS.has(key)) await refreshDataMode();
  await rawWriteJSON(resolveKey(key), data);
  invalidateKvCache(key);
}

async function rawWriteJSON<T>(key: string, data: T): Promise<void> {
  if (useDB) {
    await ensureDB();
    const db = sql();
    // Reference the proposed row via EXCLUDED.value on conflict instead of
    // interpolating JSON.stringify(data) a SECOND time — the value is then
    // transmitted ONCE per request, not twice. Neon caps a single request at
    // 64MB, and the doubled value pushed the big simulation blobs (orders.json)
    // over that ceiling. Same result, half the wire size.
    const payload = JSON.stringify(data);
    await db`
      INSERT INTO kv_store (key, value) VALUES (${key}, ${payload}::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
    return;
  }
  await ensureDataDir();
  await writeFile(join(DATA_DIR, key), JSON.stringify(data, null, 2));
}

// --- Short-TTL read cache for hot, rarely-written blobs --------------------
// Every authenticated API request resolves its caller through getAdminUsers()
// (auth), so under the live-board polling load the *same* admin-users blob is
// read many times a second. A few-second process cache collapses that to one
// read per window; writeJSON invalidates it on any mutation so a role /
// permission / status change is visible within the TTL at worst. This is a
// per-instance cache — on serverless each warm instance keeps its own, which is
// exactly the right scope for a 5s freshness budget.
const ADMIN_USERS_KEY = "admin-users.json";
const ADMIN_USERS_TTL_MS = 5_000;
let adminUsersCache: { data: AdminUser[]; at: number } | null = null;

// --- Short-TTL read cache for hot, HEAVY, read-mostly blobs -----------------
// The orders blob grows into the multi-MB range once a couple of locations
// build months of history. A single admin dashboard refresh fans out into ~10
// routes (analytics ×4, insights ×3, orders, KDS fleet, labor…) that each call
// getOrders()/getSummary()/getInsights() — and every one of those would
// otherwise re-fetch and re-JSON.parse the WHOLE blob, serialized on one Node
// process: ~10 × the parse cost per refresh, which is exactly the "takes
// forever to load anything" the deep-history test surfaced. A few-second
// per-instance cache collapses that burst to ONE read+parse; writeJSON
// invalidates the key on any mutation so a new/changed order is visible within
// the TTL at worst. Scoped to an allowlist of genuinely heavy keys so small,
// write-hot config blobs (settings toggles — Rule #7) keep read-your-write
// immediacy. Keyed by the RESOLVED key so live and simulation namespaces never
// alias. The cached value is shared by reference, which is safe because every
// read path treats it as immutable (getOrders/getAnalytics build new arrays)
// and every mutate path writes (→ invalidates) right after it mutates.
const HEAVY_READ_KEYS = new Set<string>(["orders.json", "kds-tickets.json"]);
const HEAVY_READ_TTL_MS = 5_000;
// Stores the in-flight PROMISE (not just the resolved value) so a burst of
// concurrent callers — the dashboard fans out ~10 at once — share a single
// read+parse instead of each racing its own before any of them populates the
// cache. rawReadJSON never rejects (it catches and returns the fallback), so a
// cached promise is always safe to re-await.
const heavyReadCache = new Map<string, { at: number; promise: Promise<unknown> }>();

// --- Analytics data-version (drives the daily-stats / insights memos) -------
// getSummary/getAnalytics/getInsights re-aggregate the WHOLE order history on
// every call, and the dashboard fires ~7 of them per 30s refresh. Once the raw
// blob parse is cached (above), that O(orders) re-aggregation is the dominant
// remaining cost on a deep dataset. The memos below cache the aggregated output
// keyed by this counter, which bumps on ANY write to an analytics input
// (orders or slots). So while an operator browses static history, every call
// after the first is an O(days) lookup instead of an O(orders) re-scan; a
// new/changed order or slot bumps the version and the next refresh rebuilds.
// Over-bumping only forces a harmless rebuild — under-bumping would serve stale
// numbers, so the DB-mode mutation paths (which bypass writeJSON for their
// primary write) bump explicitly too.
const ANALYTICS_INPUT_KEYS = new Set<string>(["orders.json", "slots.json"]);
let analyticsDataVersion = 0;
function bumpAnalyticsVersion(): void {
  analyticsDataVersion++;
}

function invalidateKvCache(key: string): void {
  if (key === ADMIN_USERS_KEY) adminUsersCache = null;
  if (HEAVY_READ_KEYS.has(key)) heavyReadCache.delete(resolveKey(key));
  if (ANALYTICS_INPUT_KEYS.has(key)) bumpAnalyticsVersion();
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
    min_spend_grosze integer,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  // Additive migration for tables created before the Demand Exchange lever.
  `ALTER TABLE slots ADD COLUMN IF NOT EXISTS min_spend_grosze integer`,
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
    minSpendGrosze: row.minSpendGrosze ?? undefined,
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
    minSpendGrosze: slot.minSpendGrosze ?? null,
  };
}

/** Best-effort dual-write into the normalized table. Logs but never throws —
 * the kv_store path is the durable source until Phase 1 fully drains. */
async function dualWriteSlot(slot: TimeSlot): Promise<void> {
  const db = await getDomainDb();
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
  const db = await getDomainDb();
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
  const db = await getDomainDb();
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
  const db = await getDomainDb();
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
      const db = await getDomainDb();
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

// --- Dine-in reservation grid (default 30-min slots for the whole floor) ---
//
// A dine-in slot is a *seating window*, not an online-order throughput cap: it
// holds one reservation per table (capacity = table count — see booking.ts).
// Operators shouldn't have to hand-build the grid; by default every service
// day carries a slot every 30 minutes across the open window, and a specific
// window is made unavailable by flipping its status to "draft" (persisted),
// never by deleting it (ensure would just recreate it). This keeps the model
// "everything's open unless you close it".
const DINE_IN_SLOT_STEP_MIN = 30;
const WEEKDAYS_MON_FIRST = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function hhmmToMin(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function minToHhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
// Mon=0 … Sun=6 for a YYYY-MM-DD date (local midnight).
function dayIndexMonFirst(date: string): number {
  return (new Date(`${date}T00:00:00`).getDay() + 6) % 7;
}
// Resolve a location's open window for a given date from its hours table.
// hours entries are day tokens or ranges ("Mon-Thu", "Fri-Sat", "Sun",
// "Mon-Sun"); falls back to 12:00–23:00 when nothing matches.
function serviceWindowForDate(
  hours: { day: string; open: string; close: string }[] | undefined,
  date: string,
): { openMin: number; closeMin: number } {
  const wd = dayIndexMonFirst(date);
  for (const h of hours ?? []) {
    const parts = h.day.split("-").map((p) => p.trim());
    const start = WEEKDAYS_MON_FIRST.indexOf(parts[0]);
    const end = WEEKDAYS_MON_FIRST.indexOf(parts[parts.length - 1]);
    if (start === -1 || end === -1) continue;
    if (wd >= start && wd <= end) {
      const openMin = hhmmToMin(h.open);
      const closeMin = hhmmToMin(h.close);
      if (closeMin > openMin) return { openMin, closeMin };
    }
  }
  return { openMin: 12 * 60, closeMin: 23 * 60 };
}

/** Deterministic id for an auto-generated dine-in grid slot, so ensure is
 *  idempotent and a booking can attach to the same window across reloads. */
export function dineInSlotId(locationSlug: string, date: string, time: string): string {
  return `dine-${locationSlug}-${date}-${time.replace(":", "")}`;
}

/** Pure: the "HH:MM" seating windows for one day — every 30 min across the
 *  full open window, open through close inclusive (12:00–23:00 → 12:00…23:00).
 *  Falls back to 12:00–23:00 when hours are missing. */
export function dineInGridTimes(
  hours: { day: string; open: string; close: string }[] | undefined,
  date: string,
): string[] {
  const { openMin, closeMin } = serviceWindowForDate(hours, date);
  const times: string[] = [];
  for (let m = openMin; m <= closeMin; m += DINE_IN_SLOT_STEP_MIN) times.push(minToHhmm(m));
  return times;
}

/**
 * Idempotently materialise the default dine-in grid for one location/day:
 * a slot every 30 minutes across the full open window (open through close
 * inclusive), capacity = the number of tables on the floor. Only *missing*
 * created — existing slots (including ones an operator flipped to "draft" =
 * unavailable) are left as-is, so availability edits persist, while auto slots'
 * capacity is kept in sync with the live table count so the board never lies.
 * Stale auto windows left outside the hours after an opening-hours change are
 * pruned (only the empty ones — a booked slot is never removed).
 * Returns the day's full dine-in slot list (auto + any manual).
 */
export async function ensureDineInSlots(locationSlug: string, date: string): Promise<TimeSlot[]> {
  const loc = await getLocationAsync(locationSlug);
  const tables = await getTables(locationSlug);
  const capacity = Math.max(1, tables.length);
  const gridTimes = dineInGridTimes(loc?.hours, date);
  const gridTimeSet = new Set(gridTimes);
  const autoPrefix = `dine-${locationSlug}-${date}-`;
  // slotIds carrying an active reservation must never be pruned (would orphan
  // the booking) even if opening hours moved out from under them.
  const dayRes = await getReservations(locationSlug, date);
  const bookedSlotIds = new Set(dayRes.filter((r) => r.status !== "cancelled").map((r) => r.slotId));

  return withLock("slots.json", async () => {
    const slots = await readJSON<TimeSlot[]>("slots.json", []);
    const byId = new Map(slots.map((s) => [s.id, s] as const));
    // Times already covered by ANY dine-in slot on this day (manual or auto) —
    // never lay a duplicate window on top of a hand-made one.
    const coveredTimes = new Set(
      slots
        .filter((s) => s.locationSlug === locationSlug && s.date === date && s.fulfillmentTypes.includes("dine-in"))
        .map((s) => s.time),
    );
    const touched: TimeSlot[] = [];
    for (const time of gridTimes) {
      const id = dineInSlotId(locationSlug, date, time);
      const existing = byId.get(id);
      if (existing) {
        // Keep an auto slot's capacity aligned with the current floor size.
        if (existing.maxOrders !== capacity) {
          existing.maxOrders = capacity;
          touched.push(existing);
        }
        continue;
      }
      if (coveredTimes.has(time)) continue;
      const slot: TimeSlot = {
        id,
        locationSlug,
        date,
        time,
        maxOrders: capacity,
        currentOrders: 0,
        fulfillmentTypes: ["dine-in"],
        status: "active",
      };
      slots.push(slot);
      touched.push(slot);
    }
    // Prune stale auto-grid windows that fall OUTSIDE the current opening hours
    // (e.g. after the hours change) — but only the empty ones, so a booking is
    // never orphaned. Manual slots (non-`dine-` ids) are always left alone.
    const pruned: string[] = [];
    const kept = slots.filter((s) => {
      const isStaleAuto =
        s.id.startsWith(autoPrefix) &&
        !gridTimeSet.has(s.time) &&
        !bookedSlotIds.has(s.id);
      if (isStaleAuto) pruned.push(s.id);
      return !isStaleAuto;
    });
    const changed = touched.length > 0 || pruned.length > 0;
    if (changed) {
      await writeJSON("slots.json", kept);
      await Promise.all(touched.map((s) => dualWriteSlot(s)));
      if (pruned.length) {
        const db = await getDomainDb();
        if (db) {
          try {
            await ensureSlotsTable();
            await db.delete(slotsTable).where(inArray(slotsTable.id, pruned));
          } catch (err) {
            logger.warn("ensureDineInSlots prune DB delete failed", { pruned, layer: "store.slots" }, err);
          }
        }
      }
    }
    return kept.filter(
      (s) => s.locationSlug === locationSlug && s.date === date && s.fulfillmentTypes.includes("dine-in"),
    );
  });
}

export async function incrementSlotOrders(id: string): Promise<boolean> {
  // Primary path: atomic UPDATE ... WHERE current_orders < max_orders
  // RETURNING *. Two simultaneous lambdas can issue this against the same
  // slot and Postgres serializes them — no application lock required. The
  // distributed lock from m0_1 stays in the kv_store dual-write path as
  // belt-and-suspenders while the legacy data drains.
  const db = await getDomainDb();
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
    if (isSlotFull(slot)) {
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
  const db = await getDomainDb();
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
    if (isSlotFull(s)) return false;
    if (fulfillmentType && !s.fulfillmentTypes.includes(fulfillmentType as TimeSlot["fulfillmentTypes"][number])) return false;
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
export async function recomputeCustomerRollup(rawPhone: string): Promise<void> {
  const db = await getDomainDb();
  const phone = normalizePlPhoneE164(rawPhone) ?? rawPhone;
  try {
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

    if (!db) {
      // Test mode: the customers table is DB-only, so persist the rollup to the
      // `customers.json` kv blob (namespaced to sim:). Preserve any
      // consent/notes a prior test row carried (recompute never owns those).
      const all = await readJSON<CustomerRollup[]>("customers.json", []);
      const prev = all.find((c) => c.phone === phone);
      const rollup: CustomerRollup = {
        phone, name, email, birthday,
        totalSpentGrosze, orderCount,
        firstOrderAt: firstOrderAt ? firstOrderAt.toISOString() : null,
        lastOrderAt: lastOrderAt ? lastOrderAt.toISOString() : null,
        loyaltyPointsBalance, manualPointsAdjust,
        smsOptout: prev?.smsOptout ?? false,
        emailOptout: prev?.emailOptout ?? false,
        notes: prev?.notes ?? null,
      };
      await writeJSON("customers.json", [...all.filter((c) => c.phone !== phone), rollup]);
      return;
    }

    await ensureCustomersTable();
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

/**
 * Single-pass bulk variant of {@link recomputeCustomerRollup}. Reads the order
 * history, point adjustments and loyalty roster ONCE, indexes them by canonical
 * phone, then computes and persists every requested phone's rollup from those
 * in-memory sets.
 *
 * The simulation seeder rolls up dozens of phones at the end of a deep seed.
 * Calling the per-phone function in a loop re-read the entire (large) order blob
 * once per phone — with ~46k seeded orders that's ~24 full-history reads
 * back-to-back, which is what made "Reset & re-seed" blow the serverless
 * timeout. This collapses those to a single read + one customers write.
 */
export async function recomputeCustomerRollupsBulk(rawPhones: string[]): Promise<void> {
  if (rawPhones.length === 0) return;
  const db = await getDomainDb();
  // De-dupe on the canonical phone so we never compute/write the same row twice.
  const phones = Array.from(
    new Set(rawPhones.map((p) => normalizePlPhoneE164(p) ?? p)),
  );
  try {
    const [allOrders, adjustments, members] = await Promise.all([
      getOrders(),
      getPointAdjustments(),
      getLoyaltyMembers(),
    ]);

    // Index the source data by canonical phone once (O(orders + adjustments +
    // members)) so each phone's rollup is a map lookup instead of an O(orders)
    // scan — the whole point of the bulk path.
    const ordersByPhone = new Map<string, Order[]>();
    for (const o of allOrders) {
      if (!o.customerPhone || o.status === "pending") continue;
      const key = normalizePlPhoneE164(o.customerPhone) ?? o.customerPhone;
      const arr = ordersByPhone.get(key);
      if (arr) arr.push(o);
      else ordersByPhone.set(key, [o]);
    }
    const adjByPhone = new Map<string, number>();
    for (const a of adjustments) {
      const key = normalizePlPhoneE164(a.phone) ?? a.phone;
      adjByPhone.set(key, (adjByPhone.get(key) ?? 0) + a.amount);
    }
    const memberByPhone = new Map<string, LoyaltyMember>();
    for (const m of members) {
      const key = normalizePlPhoneE164(m.phone) ?? m.phone;
      memberByPhone.set(key, m);
    }

    // The per-phone aggregation — identical math to recomputeCustomerRollup,
    // just fed from the pre-built indexes.
    const compute = (phone: string) => {
      const myOrders = ordersByPhone.get(phone) ?? [];
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
      const manualPointsAdjust = adjByPhone.get(phone) ?? 0;
      const loyaltyPointsBalance = Math.floor(totalSpentGrosze / 100) + manualPointsAdjust;
      const member = memberByPhone.get(phone);
      const memberName = member
        ? [member.name, member.lastName].filter(Boolean).join(" ").trim() || member.nickname || null
        : null;
      return {
        phone,
        name: memberName || latestName || null,
        email: member?.email ?? null,
        birthday: member?.dob ?? null,
        totalSpentGrosze,
        orderCount,
        firstOrderAt,
        lastOrderAt,
        loyaltyPointsBalance,
        manualPointsAdjust,
      };
    };

    if (!db) {
      // Test mode: the customers table is DB-only, so persist to the
      // customers.json kv blob (namespaced to sim:) in ONE write. Preserve any
      // consent/notes a prior test row carried (recompute never owns those).
      const all = await readJSON<CustomerRollup[]>("customers.json", []);
      const prevByPhone = new Map(all.map((c) => [c.phone, c]));
      const updated = new Set(phones);
      const rollups: CustomerRollup[] = phones.map((phone) => {
        const c = compute(phone);
        const prev = prevByPhone.get(phone);
        return {
          ...c,
          firstOrderAt: c.firstOrderAt ? c.firstOrderAt.toISOString() : null,
          lastOrderAt: c.lastOrderAt ? c.lastOrderAt.toISOString() : null,
          smsOptout: prev?.smsOptout ?? false,
          emailOptout: prev?.emailOptout ?? false,
          notes: prev?.notes ?? null,
        };
      });
      await writeJSON("customers.json", [
        ...all.filter((c) => !updated.has(c.phone)),
        ...rollups,
      ]);
      return;
    }

    // DB mode (not hit during the sim seed, since getDomainDb() is null there,
    // but kept correct): upsert each computed row. Still a single order read.
    await ensureCustomersTable();
    for (const phone of phones) {
      const c = compute(phone);
      const values = { ...c, updatedAt: new Date() };
      await db
        .insert(customersTable)
        .values(values)
        .onConflictDoUpdate({ target: customersTable.phone, set: values });
    }
  } catch (err) {
    logger.warn(
      "recomputeCustomerRollupsBulk failed",
      { count: phones.length, layer: "store.customers" },
      err,
    );
  }
}

/** Point lookup for the customer rollup. Returns null when no row exists yet. */
export async function getCustomer(rawPhone: string): Promise<CustomerRollup | null> {
  const db = await getDomainDb();
  const phone = normalizePlPhoneE164(rawPhone) ?? rawPhone;
  if (!db) {
    const all = await readJSON<CustomerRollup[]>("customers.json", []);
    return all.find((c) => c.phone === phone) ?? null;
  }
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
  const db = await getDomainDb();
  if (!db) {
    return readJSON<CustomerRollup[]>("customers.json", []);
  }
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

/**
 * Persist a customer's marketing-consent flags (CRM consent toggles). The
 * rollup row is otherwise rebuilt by recomputeCustomerRollup, which never
 * touches the optout columns — so a direct upsert here owns consent without
 * being clobbered by the next order. Phone is canonicalized to E.164 so the
 * write lands on the same row the rollup maintains.
 */
export async function setCustomerConsent(
  rawPhone: string,
  consent: { smsOptout?: boolean; emailOptout?: boolean },
): Promise<CustomerRollup | null> {
  const db = await getDomainDb();
  const phone = normalizePlPhoneE164(rawPhone) ?? rawPhone;
  if (!db) {
    const all = await readJSON<CustomerRollup[]>("customers.json", []);
    const i = all.findIndex((c) => c.phone === phone);
    if (i < 0) return null;
    if (typeof consent.smsOptout === "boolean") all[i].smsOptout = consent.smsOptout;
    if (typeof consent.emailOptout === "boolean") all[i].emailOptout = consent.emailOptout;
    await writeJSON("customers.json", all);
    return all[i];
  }
  try {
    await ensureCustomersTable();
    const set: Partial<typeof customersTable.$inferInsert> = { updatedAt: new Date() };
    if (typeof consent.smsOptout === "boolean") set.smsOptout = consent.smsOptout;
    if (typeof consent.emailOptout === "boolean") set.emailOptout = consent.emailOptout;
    await db
      .insert(customersTable)
      .values({ phone, ...set })
      .onConflictDoUpdate({ target: customersTable.phone, set });
    return await getCustomer(phone);
  } catch (err) {
    logger.warn("setCustomerConsent failed", { phone, layer: "store.customers" }, err);
    return null;
  }
}

async function dualWriteOrderItems(order: Order): Promise<void> {
  const db = await getDomainDb();
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
  partySize?: Order["partySize"];
  specialInstructions?: Order["specialInstructions"];
  queuePosition?: Order["queuePosition"];
  estimatedReadyAt?: Order["estimatedReadyAt"];
  feedback?: Order["feedback"];
  qualityCheck?: Order["qualityCheck"];
  refund?: Order["refund"];
  dispute?: Order["dispute"];
  channel?: Order["channel"];
  simulated?: Order["simulated"];
  coursing?: Order["coursing"];
  voidedItems?: Order["voidedItems"];
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
    partySize: payload.partySize,
    specialInstructions: payload.specialInstructions,
    queuePosition: payload.queuePosition,
    estimatedReadyAt: payload.estimatedReadyAt,
    feedback: payload.feedback,
    qualityCheck: payload.qualityCheck,
    refund: payload.refund,
    dispute: payload.dispute,
    channel: payload.channel,
    simulated: payload.simulated,
    coursing: payload.coursing,
    voidedItems: payload.voidedItems,
  };
}

function orderToValues(order: Order) {
  const payload: OrderPayload = {
    items: order.items,
    partySize: order.partySize,
    specialInstructions: order.specialInstructions,
    queuePosition: order.queuePosition,
    estimatedReadyAt: order.estimatedReadyAt,
    feedback: order.feedback,
    qualityCheck: order.qualityCheck,
    refund: order.refund,
    dispute: order.dispute,
    channel: order.channel,
    simulated: order.simulated,
    coursing: order.coursing,
    voidedItems: order.voidedItems,
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
  const db = await getDomainDb();
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
  const db = await getDomainDb();
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

/** Default cap for the operational Orders board + live stream snapshot. The
 *  board shows recent activity newest-first; nobody scrolls thousands of old
 *  completed orders, and shipping them all is what made a deep-history dataset
 *  unusable. Reports/analytics read the full period via the uncapped path. */
export const ORDERS_BOARD_LIMIT = 500;

export async function getOrders(
  locationSlug?: string,
  /** Optional cutoff — only return orders with createdAt >= this ISO string.
   *  Pushes the filter to the database (uses orders_created_at_idx in PG)
   *  instead of fetching everything and slicing in memory; matters once the
   *  table grows past a few thousand rows. */
  since?: string,
  /** Simulated-record escape hatch. Simulated orders are filtered out of
   *  every read by default so they never reach the dashboard, Orders list,
   *  reports, CRM or analytics. Reserved opt-in for future simulation tooling
   *  (no current consumer — the KDS order simulator was removed).
   *
   *  `limit` caps the result to the N most-recent orders (newest first). The
   *  Orders board and live stream snapshot use it so a deep-history dataset
   *  never ships 16k rows / many MB to the browser — operationally you only
   *  ever act on recent orders, and old completed ones never change. Pushed
   *  into SQL as `LIMIT` (with the createdAt index doing the ordering) on the
   *  DB path; applied as a sort+slice on the kv path. Analytics/reports leave
   *  it unset because they genuinely need the full period. */
  opts?: { includeSimulated?: boolean; limit?: number },
): Promise<Order[]> {
  const keepSim = opts?.includeSimulated === true;
  const stripSim = (list: Order[]): Order[] => (keepSim ? list : list.filter((o) => !o.simulated));
  const limit = opts?.limit;
  const db = await getDomainDb();
  if (db) {
    try {
      await ensureOrdersTable();
      // Compose the where clause from the optional location + since
      // filters. drizzle's and() collapses to a single SQL AND that the
      // orders_created_at_idx + orders_location_slug_idx can satisfy.
      const conditions: ReturnType<typeof eq>[] = [];
      if (locationSlug) conditions.push(eq(ordersTable.locationSlug, locationSlug));
      // Postgres `createdAt` is a timestamp column — pass a Date object.
      if (since) {
        const sinceDate = new Date(since);
        if (Number.isFinite(sinceDate.valueOf())) {
          conditions.push(gte(ordersTable.createdAt, sinceDate));
        }
      }
      const whereClause = conditions.length === 0
        ? undefined
        : conditions.length === 1
          ? conditions[0]
          : and(...conditions);
      const base = whereClause
        ? db.select().from(ordersTable).where(whereClause).orderBy(desc(ordersTable.createdAt))
        : db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt));
      const rows = limit && limit > 0 ? await base.limit(limit) : await base;
      if (rows.length > 0) return stripSim(rows.map(rowToOrder));
    } catch (err) {
      logger.warn(
        "getOrders DB read failed; falling back to kv_store",
        { layer: "store.orders" },
        err,
      );
    }
  }
  const orders = await readJSON<Order[]>("orders.json", []);
  let filtered = locationSlug
    ? orders.filter((o) => o.locationSlug === locationSlug)
    : orders;
  if (since) {
    const sinceMs = Date.parse(since);
    if (Number.isFinite(sinceMs)) {
      filtered = filtered.filter((o) => {
        const t = Date.parse(o.createdAt);
        return Number.isFinite(t) && t >= sinceMs;
      });
    }
  }
  if (filtered.length > 0) {
    bumpLazyBackfillHit("orders");
    void Promise.all(filtered.map((o) => dualWriteOrder(o)));
  }
  const result = stripSim(filtered);
  if (limit && limit > 0 && result.length > limit) {
    // Newest-first, then take the head — matches the DB path's ORDER BY
    // createdAt DESC LIMIT n (the kv blob isn't guaranteed sorted on disk).
    return [...result]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
  return result;
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

  const db = await getDomainDb();
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
      // valid answer for a phone with no past orders. Simulated orders never
      // count toward a customer's history (defends the rare case where a
      // simulator phone collides with a real customer).
      return rows.map(rowToOrder).filter((o) => !o.simulated);
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
      !o.simulated &&
      phonesEqualPl(o.customerPhone, canonical) &&
      (opts?.includePending || o.status !== "pending") &&
      new Date(o.createdAt).getTime() >= sinceMs,
  );
}

export async function getOrderById(id: string): Promise<Order | undefined> {
  const db = await getDomainDb();
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
  const db = await getDomainDb();
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

export async function createOrder(
  order: Order,
  opts?: { suppressNotifications?: boolean; suppressCascades?: boolean },
): Promise<Order> {
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
  const db = await getDomainDb();
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
  // event refreshes it — non-blocking and idempotent. suppressCascades is for
  // bulk seeding: the fire-and-forget rollup + KDS writes race the next insert
  // on the shared kv blob (filesystem/sim), so the seeder runs them once,
  // awaited, after all orders land.
  if (!opts?.suppressCascades) void recomputeCustomerRollup(order.customerPhone);
  // Invalidate the analytics memos synchronously — the DB-mode primary write
  // (dualWriteOrder) bypasses writeJSON, so we can't rely on the fire-and-forget
  // kv mirror to bump in time for the next dashboard poll.
  bumpAnalyticsVersion();
  emitOrderEvent({ kind: "created", orderId: order.id, locationSlug: order.locationSlug });
  incrCounter("orders.placed");
  // Fire KDS tickets (m2_2). Idempotent on (order_id, station_id) so
  // retried createOrder calls don't double-create.
  if (!opts?.suppressCascades) void fireKdsTickets(order);
  // Outbox: queue side effects (Phase 2 SMS/email/aggregator).
  // dedupeKey is just "placed" so retried createOrder calls converge on
  // one row rather than creating multiple identical events. POS counter
  // sales pass suppressNotifications — the guest is at the window, so no
  // "order placed" SMS/email (the KDS ticket + stock decrement still fire).
  if (!opts?.suppressNotifications) {
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
  }
  // Recipe-driven stock decrement (audit §3). Fire-and-forget so a
  // stock log hiccup never blocks a paid customer, but failures hit
  // Sentry through the helper's structured logging.
  void (async () => {
    const { consumeRecipeForOrder } = await import("@/lib/inventory-decrement");
    await consumeRecipeForOrder(order);
  })();
  return saved;
}

/**
 * Bulk-append pre-built orders in ONE locked read-modify-write per location —
 * the path the seeders (seedDataset) take so a deep dataset doesn't pay
 * createOrder's per-insert O(N) blob rewrite (which, in a test-mode namespace
 * on Neon, is a network round-trip each and would blow the seed past the
 * serverless budget). No per-order cascades: the seeder fires KDS tickets and
 * rebuilds CRM rollups itself, once, after the orders land. Only ever called
 * while a test mode is active (getDomainDb() is null then, so the kv path runs);
 * the DB branch is a safety net that mirrors createOrder's primary path.
 */
export async function bulkAppendOrders(orders: Order[]): Promise<void> {
  if (orders.length === 0) return;
  const db = await getDomainDb();
  if (db) {
    for (const o of orders) await dualWriteOrder(o);
    bumpAnalyticsVersion();
    return;
  }
  // Group by location to honour the per-location lock scope, then one
  // read-modify-write per location instead of one per order.
  const byLoc = new Map<string, Order[]>();
  for (const o of orders) {
    const arr = byLoc.get(o.locationSlug);
    if (arr) arr.push(o);
    else byLoc.set(o.locationSlug, [o]);
  }
  for (const [loc, list] of byLoc) {
    await withLockScoped("orders", loc, async () => {
      const all = await readJSON<Order[]>("orders.json", []);
      all.push(...list);
      await writeJSON("orders.json", all);
    });
  }
}

/**
 * Assign (or clear) a delivery driver on an order. Mirrors updateOrderStatus'
 * DB-first + kv-fallback shape. The `assigned_driver_id` column + both row
 * mappers already exist, so this only sets the field; it emits an order event
 * so live boards (dispatch / KDS) refresh.
 */
export async function assignOrderDriver(id: string, driverId: string | null): Promise<Order | null> {
  const db = await getDomainDb();
  let updated: Order | null = null;
  if (db) {
    try {
      await ensureOrdersTable();
      const rows = await db
        .update(ordersTable)
        .set({ assignedDriverId: driverId, updatedAt: new Date() })
        .where(eq(ordersTable.id, id))
        .returning();
      if (rows.length === 1) {
        updated = rowToOrder(rows[0]);
        void mirrorOrderToKvStore(updated);
      }
    } catch (err) {
      logger.warn(
        "assignOrderDriver DB update failed; falling back to kv path",
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
      orders[index].assignedDriverId = driverId ?? undefined;
      await writeJSON("orders.json", orders);
      await dualWriteOrder(orders[index]);
      return orders[index];
    });
  }
  if (updated) {
    bumpAnalyticsVersion();
    emitOrderEvent({
      kind: "status_changed",
      orderId: updated.id,
      locationSlug: updated.locationSlug,
      status: updated.status,
    });
  }
  return updated;
}

export async function updateOrderStatus(id: string, status: Order["status"]): Promise<Order | null> {
  // DB-first path: single UPDATE on the orders table, no global lock. The
  // kv_store mirror still updates under a per-location lock so two trucks
  // never contend. Reduces lock-key cardinality from 1 → N (number of
  // active locations) for the critical hot path.
  const db = await getDomainDb();
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
    bumpAnalyticsVersion();
    emitOrderEvent({
      kind: "status_changed",
      orderId: updated.id,
      locationSlug: updated.locationSlug,
      status,
    });
    // Simulated demo tickets stop here. A sim has no real customer, comms,
    // analytics weight or stock draw, so advancing one on the KDS (cook taps
    // Start prep / Mark ready / Bump) must skip every side effect a real
    // status change runs — otherwise a demo would fire SMS/email and pollute
    // lifetime stats.
    if (!updated.simulated) {
      // Pending → confirmed flips a checkout from "doesn't count" to
      // "counts" in lifetime stats; cancelled does the opposite. Both warrant
      // a rollup refresh.
      void recomputeCustomerRollup(updated.customerPhone);
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
  const db = await getDomainDb();
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
    bumpAnalyticsVersion();
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

  const db = await getDomainDb();
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
      bumpAnalyticsVersion();
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
export async function isActiveLocationSlug(slug: string): Promise<boolean> {
  const list = await getActiveLocationsAsync();
  return list.some((l) => l.slug === slug);
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
  dineInCount: number;
  categoryBreakdown: Record<string, { revenue: number; cost: number; count: number }>;
  topItems: { name: string; quantity: number; revenue: number }[];
}

// Per-version memo of the FULL (unfiltered) daily-stats series, keyed by
// namespace prefix + location. Cleared whenever the analytics version moves.
// A short TTL backstops the version signal across serverless instances: a
// read-only instance never sees a SIBLING instance's write bump its own
// version, so without an age cap its memo could serve stale numbers until the
// instance recycles. With the cap, cross-instance writes converge within
// ANALYTICS_MEMO_TTL_MS (same-instance writes are still instant — they bump the
// version and clear the memo). The within-burst dedup — the dashboard's ~8
// parallel analytics calls collapsing to ONE build — holds regardless of TTL.
//
// 45s sits just above the 30s dashboard poll cadence so steady-state polling
// (and multiple operators / SSE reconnects) reliably reuse one build per window
// instead of re-scanning the whole order set each poll. Analytics is a recent-
// trends view, so a sub-minute cross-instance lag is invisible; a real order on
// this instance bumps the version and rebuilds immediately regardless.
const ANALYTICS_MEMO_TTL_MS = 45_000;
const dailyStatsMemo = new Map<string, { at: number; promise: Promise<DailyStats[]> }>();
let dailyStatsMemoVersion = -1;

/** Heavy work behind getAnalytics: aggregate EVERY day for a location scope,
 *  with no date filter, so the result can be cached once per data-version and
 *  re-sliced cheaply for any range. Pure function of the order set. */
async function computeDailyStats(locationSlug?: string): Promise<DailyStats[]> {
  const orders = (await getOrders(locationSlug)).filter(
    (o) => o.status !== "pending"
  );

  const byDate = new Map<string, Order[]>();
  for (const order of orders) {
    const date = order.slotDate || order.createdAt.split("T")[0];
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
    let dineInCount = 0;
    const categoryMap: Record<string, { revenue: number; cost: number; count: number }> = {};
    const itemMap = new Map<string, { name: string; quantity: number; revenue: number }>();

    for (const order of dayOrders) {
      revenue += order.totalAmount;
      if (order.fulfillmentType === "delivery") deliveryCount++;
      else if (order.fulfillmentType === "dine-in") dineInCount++;
      else takeoutCount++;

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
      dineInCount,
      categoryBreakdown: categoryMap,
      topItems,
    });
  }

  stats.sort((a, b) => a.date.localeCompare(b.date));
  return stats;
}

export async function getAnalytics(
  locationSlug?: string,
  dateFrom?: string,
  dateTo?: string
): Promise<DailyStats[]> {
  // Prime the namespace prefix so the cache key can't bucket a cold-instance
  // read under the wrong (live vs simulation) namespace.
  await refreshDataMode();
  if (dailyStatsMemoVersion !== analyticsDataVersion) {
    dailyStatsMemo.clear();
    dailyStatsMemoVersion = analyticsDataVersion;
  }
  const memoKey = `${activePrefixSync()}|${locationSlug ?? "*"}`;
  const hit = dailyStatsMemo.get(memoKey);
  // Cache the in-flight promise so a burst of concurrent callers for the same
  // scope share ONE aggregation instead of each re-scanning the whole order set.
  let promise: Promise<DailyStats[]>;
  if (hit && Date.now() - hit.at < ANALYTICS_MEMO_TTL_MS) {
    promise = hit.promise;
  } else {
    promise = computeDailyStats(locationSlug);
    // Don't let a transient failure stick in the cache for the whole TTL.
    promise.catch(() => dailyStatsMemo.delete(memoKey));
    dailyStatsMemo.set(memoKey, { at: Date.now(), promise });
  }
  const full = await promise;
  // Slice to the requested range. Always returns a NEW array so callers can
  // never mutate the memoized series.
  return full.filter(
    (s) => (!dateFrom || s.date >= dateFrom) && (!dateTo || s.date <= dateTo),
  );
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
  dineInCount: number;
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
  let dineInCount = 0;
  const categoryMap: Record<string, { revenue: number; cost: number; count: number }> = {};
  const itemMap = new Map<string, { name: string; quantity: number; revenue: number }>();

  for (const day of dailyStats) {
    totalRevenue += day.revenue;
    totalCost += day.cost;
    totalOrders += day.orderCount;
    totalItems += day.itemCount;
    takeoutCount += day.takeoutCount;
    deliveryCount += day.deliveryCount;
    dineInCount += day.dineInCount;

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
    dineInCount,
    dailyStats,
    categoryBreakdown: categoryMap,
    topItems,
  };
}

/** Live till KPIs derived from REAL orders (Rule #1) — the analytical figures the
 *  POS stat strip shows beside its live counts. Each "today" figure is measured
 *  up to the current time-of-day and its delta compares to the average of the
 *  prior 7 days *up to the same time of day*, so a mid-service reading is judged
 *  against a like-for-like window (not a full day), and never fabricated. */
export interface PosKpis {
  /** Today's average check (grosze) — revenue ÷ orders so far. */
  avgCheck: number;
  /** % vs the trailing-7-day AOV at this time of day; null when no baseline. */
  avgCheckDeltaPct: number | null;
  /** Today's sales rate (grosze/hour) since the first order. */
  salesPerHour: number;
  /** % vs the trailing-7-day revenue-by-now; null when no baseline. */
  salesDeltaPct: number | null;
  /** Covers seated today ÷ table count (turns, 1 dp). */
  tableTurns: number;
  /** % vs the trailing-7-day covers-by-now; null when no baseline. */
  tableTurnsDeltaPct: number | null;
  tableCount: number;
  generatedAt: string;
}

export async function getPosKpis(locationSlug: string): Promise<PosKpis> {
  const now = new Date();
  const since = new Date(now.getTime() - 8 * 86_400_000).toISOString();
  const [orders, tables] = await Promise.all([getOrders(locationSlug, since), getTables(locationSlug)]);
  const tableCount = tables.length;

  // UTC day boundaries, matching getAnalytics' `createdAt.split("T")[0]` grouping.
  const dayKey = (iso: string) => iso.slice(0, 10);
  const msIntoDay = (iso: string) => Date.parse(iso) - Date.parse(`${dayKey(iso)}T00:00:00.000Z`);
  const todayKey = dayKey(now.toISOString());
  const nowIntoDay = msIntoDay(now.toISOString());

  // Revenue orders mirror getAnalytics: exclude the unpaid queue + voided.
  type Agg = { rev: number; count: number; covers: number };
  const today: Agg = { rev: 0, count: 0, covers: 0 };
  const priorByDay = new Map<string, Agg>();
  let firstOrderTodayMs: number | null = null;

  for (const o of orders) {
    if (o.status === "pending" || o.status === "cancelled") continue;
    if (msIntoDay(o.createdAt) > nowIntoDay) continue; // only up to "now" time-of-day
    const covers = o.fulfillmentType === "dine-in" ? o.partySize ?? 0 : 0;
    const k = dayKey(o.createdAt);
    if (k === todayKey) {
      today.rev += o.totalAmount;
      today.count += 1;
      today.covers += covers;
      const ms = Date.parse(o.createdAt);
      if (firstOrderTodayMs === null || ms < firstOrderTodayMs) firstOrderTodayMs = ms;
    } else {
      const a = priorByDay.get(k) ?? { rev: 0, count: 0, covers: 0 };
      a.rev += o.totalAmount;
      a.count += 1;
      a.covers += covers;
      priorByDay.set(k, a);
    }
  }

  const priorDays = priorByDay.size;
  const priorTot = [...priorByDay.values()].reduce(
    (s, a) => ({ rev: s.rev + a.rev, count: s.count + a.count, covers: s.covers + a.covers }),
    { rev: 0, count: 0, covers: 0 },
  );
  const priorAvgRev = priorDays > 0 ? priorTot.rev / priorDays : null;
  const priorAvgCovers = priorDays > 0 ? priorTot.covers / priorDays : null;
  const priorAOV = priorTot.count > 0 ? priorTot.rev / priorTot.count : null;
  const pct = (cur: number, base: number | null): number | null =>
    base && base > 0 ? Math.round(((cur - base) / base) * 100) : null;

  const avgCheck = today.count > 0 ? Math.round(today.rev / today.count) : 0;
  const hoursElapsed = firstOrderTodayMs !== null ? Math.max(0.5, (now.getTime() - firstOrderTodayMs) / 3_600_000) : 0;
  const salesPerHour = hoursElapsed > 0 ? Math.round(today.rev / hoursElapsed) : 0;
  const tableTurns = tableCount > 0 ? today.covers / tableCount : 0;

  return {
    avgCheck,
    avgCheckDeltaPct: today.count > 0 ? pct(avgCheck, priorAOV) : null,
    salesPerHour,
    salesDeltaPct: today.rev > 0 ? pct(today.rev, priorAvgRev) : null,
    tableTurns: Math.round(tableTurns * 10) / 10,
    tableTurnsDeltaPct: today.covers > 0 ? pct(today.covers, priorAvgCovers) : null,
    tableCount,
    generatedAt: now.toISOString(),
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
  dineInCount: number;
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

// Per-version memo of insights output, keyed by namespace prefix + date range.
// Its inputs are orders (getOrders) and the slots blob — both covered by the
// analytics version (ANALYTICS_INPUT_KEYS includes slots.json), so a slot edit
// invalidates it just like an order does. Active-locations changes are rare
// config; a subsequent order write rebuilds within the same shift.
const insightsMemo = new Map<string, { at: number; promise: Promise<InsightsData> }>();
let insightsMemoVersion = -1;

export async function getInsights(dateFrom?: string, dateTo?: string): Promise<InsightsData> {
  await refreshDataMode();
  if (insightsMemoVersion !== analyticsDataVersion) {
    insightsMemo.clear();
    insightsMemoVersion = analyticsDataVersion;
  }
  const memoKey = `${activePrefixSync()}|${dateFrom ?? ""}|${dateTo ?? ""}`;
  const hit = insightsMemo.get(memoKey);
  if (hit && Date.now() - hit.at < ANALYTICS_MEMO_TTL_MS) return hit.promise;
  const promise = computeInsights(dateFrom, dateTo);
  // Don't let a transient failure stick in the cache for the whole TTL.
  promise.catch(() => insightsMemo.delete(memoKey));
  insightsMemo.set(memoKey, { at: Date.now(), promise });
  return promise;
}

async function computeInsights(dateFrom?: string, dateTo?: string): Promise<InsightsData> {
  const allSlots = await readJSON<TimeSlot[]>("slots.json", []);
  // Read orders through getOrders() — the SAME canonical, table-first source
  // getAnalytics/getSummary use — not the raw orders.json kv mirror. In
  // Postgres the normalized `orders` table and its best-effort kv mirror can
  // drift out of sync; reading the mirror here made the dashboard's two halves
  // disagree (the Executive rail, fed by analytics→table, showed 0 while the
  // Location-network table, fed by insights→kv, showed full history). One
  // source = the halves can never contradict each other. getOrders() already
  // strips simulated rows and honours the active data-mode namespace.
  const allOrders = await getOrders();

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
  const activeLocations = await getActiveLocationsAsync();
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
    let dineIn = 0;

    for (const order of completed) {
      revenue += order.totalAmount;
      if (order.fulfillmentType === "delivery") delivery++;
      else if (order.fulfillmentType === "dine-in") dineIn++;
      else takeout++;
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
      dineInCount: dineIn,
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

  const result: InsightsData = {
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
  return result;
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
  // Never page operators for simulation/test activity. Use the awaited guard
  // (not the sync snapshot): a real push is an external side-effect, so a cold
  // cache must not let test activity reach an operator's phone.
  if (await isTestModeActive()) return;
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

// --- Internal comms: to-do tasks + announcements ---
// Owner (or anyone with comms.manage) assigns tasks to teammates and posts
// announcements; teammates read their own from the role portals. Persisted via
// readJSON/writeJSON (Postgres KV + filesystem fallback), serialised by withLock
// — same pattern as notifications. Types live in @/lib/comms (client-safe).

export async function getTasks(): Promise<Task[]> {
  return readJSON<Task[]>("tasks.json", []);
}

export async function getTasksForAssignee(assigneeId: string): Promise<Task[]> {
  return (await getTasks()).filter((t) => t.assigneeId === assigneeId);
}

/** Upsert a task. New rows get an id + createdAt; existing rows are replaced. */
export async function saveTask(
  input: Omit<Task, "id" | "createdAt"> & { id?: string; createdAt?: string },
): Promise<Task> {
  return withLock("tasks.json", async () => {
    const list = await readJSON<Task[]>("tasks.json", []);
    const id = input.id ?? `task-${crypto.randomUUID()}`;
    const entry: Task = {
      ...input,
      id,
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
    const idx = list.findIndex((t) => t.id === id);
    if (idx >= 0) list[idx] = entry;
    else list.unshift(entry);
    if (list.length > 1000) list.length = 1000;
    await writeJSON("tasks.json", list);
    return entry;
  });
}

/**
 * Set a task's status (open / done / archived / deleted). Marking `done` stamps
 * completedAt; reopening to `open` clears it. Archiving or deleting a task that
 * was already done *keeps* completedAt, so the completion record survives being
 * filed away.
 */
export async function setTaskStatus(id: string, status: TaskStatus): Promise<Task | null> {
  return withLock("tasks.json", async () => {
    const list = await readJSON<Task[]>("tasks.json", []);
    const t = list.find((x) => x.id === id);
    if (!t) return null;
    t.status = status;
    if (status === "done") t.completedAt = new Date().toISOString();
    else if (status === "open") t.completedAt = undefined;
    // archived / deleted: leave completedAt untouched (preserve any completion).
    await writeJSON("tasks.json", list);
    return t;
  });
}

export async function deleteTask(id: string): Promise<boolean> {
  return withLock("tasks.json", async () => {
    const list = await readJSON<Task[]>("tasks.json", []);
    const idx = list.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    list.splice(idx, 1);
    await writeJSON("tasks.json", list);
    return true;
  });
}

// --- Recurring routines (the "regular daily to-do list") ---
// Two stores: the TEMPLATES (standing routine definitions — team + personal) and
// the per-day COMPLETIONS (who ticked which routine, which day). A teammate's
// daily list is derived (templates that apply to them, annotated with today's
// tick); it resets at midnight because the date key changes — no cron, no
// per-day task rows. Types live in @/lib/comms (client-safe).

/** Today's date as `yyyy-mm-dd` in the truck's timezone — the daily-reset key. */
export function warsawToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export async function getRoutineTemplates(): Promise<RoutineTemplate[]> {
  return readJSON<RoutineTemplate[]>("routine-templates.json", []);
}

/** Upsert a routine template. New rows get an id + createdAt; existing replaced. */
export async function saveRoutineTemplate(
  input: Omit<RoutineTemplate, "id" | "createdAt"> & { id?: string; createdAt?: string },
): Promise<RoutineTemplate> {
  return withLock("routine-templates.json", async () => {
    const list = await readJSON<RoutineTemplate[]>("routine-templates.json", []);
    const id = input.id ?? `routine-${crypto.randomUUID()}`;
    const entry: RoutineTemplate = {
      ...input,
      id,
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
    const idx = list.findIndex((t) => t.id === id);
    if (idx >= 0) list[idx] = entry;
    else list.unshift(entry);
    if (list.length > 1000) list.length = 1000;
    await writeJSON("routine-templates.json", list);
    return entry;
  });
}

export async function deleteRoutineTemplate(id: string): Promise<boolean> {
  return withLock("routine-templates.json", async () => {
    const list = await readJSON<RoutineTemplate[]>("routine-templates.json", []);
    const idx = list.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    list.splice(idx, 1);
    await writeJSON("routine-templates.json", list);
    // Also drop any completion rows for the removed routine so the file doesn't
    // accrete orphans.
    const comps = await readJSON<RoutineCompletion[]>("routine-completions.json", []);
    const pruned = comps.filter((c) => c.templateId !== id);
    if (pruned.length !== comps.length) await writeJSON("routine-completions.json", pruned);
    return true;
  });
}

/** Completion rows for one date (defaults to today, Warsaw). */
export async function getRoutineCompletions(date?: string): Promise<RoutineCompletion[]> {
  const day = date ?? warsawToday();
  return (await readJSON<RoutineCompletion[]>("routine-completions.json", [])).filter(
    (c) => c.date === day,
  );
}

/** Tick a routine for a user on a day (idempotent). Prunes rows >30 days old. */
export async function setRoutineDone(
  templateId: string,
  userId: string,
  date: string,
  doneByName?: string,
): Promise<void> {
  await withLock("routine-completions.json", async () => {
    const list = await readJSON<RoutineCompletion[]>("routine-completions.json", []);
    const exists = list.some(
      (c) => c.templateId === templateId && c.userId === userId && c.date === date,
    );
    if (!exists) list.push({ templateId, userId, date, doneAt: new Date().toISOString(), doneByName });
    // Keep the ledger bounded: drop completions older than 30 days.
    const cutoff = warsawToday(new Date(Date.now() - 30 * 86_400_000));
    const pruned = list.filter((c) => c.date >= cutoff);
    await writeJSON("routine-completions.json", pruned);
  });
}

/** Un-tick a routine for a user on a day. */
export async function clearRoutineDone(
  templateId: string,
  userId: string,
  date: string,
): Promise<void> {
  await withLock("routine-completions.json", async () => {
    const list = await readJSON<RoutineCompletion[]>("routine-completions.json", []);
    const next = list.filter(
      (c) => !(c.templateId === templateId && c.userId === userId && c.date === date),
    );
    if (next.length !== list.length) await writeJSON("routine-completions.json", next);
  });
}

export async function getAnnouncements(): Promise<Announcement[]> {
  return readJSON<Announcement[]>("announcements.json", []);
}

export async function saveAnnouncement(
  input: Omit<Announcement, "id" | "createdAt" | "readBy"> & {
    id?: string;
    createdAt?: string;
    readBy?: string[];
  },
): Promise<Announcement> {
  return withLock("announcements.json", async () => {
    const list = await readJSON<Announcement[]>("announcements.json", []);
    const id = input.id ?? `ann-${crypto.randomUUID()}`;
    const existing = list.find((a) => a.id === id);
    const entry: Announcement = {
      ...input,
      id,
      createdAt: input.createdAt ?? existing?.createdAt ?? new Date().toISOString(),
      readBy: input.readBy ?? existing?.readBy ?? [],
      // Editing an announcement must not wipe recipients' personal mailbox state.
      archivedBy: input.archivedBy ?? existing?.archivedBy ?? [],
      deletedBy: input.deletedBy ?? existing?.deletedBy ?? [],
    };
    const idx = list.findIndex((a) => a.id === id);
    if (idx >= 0) list[idx] = entry;
    else list.unshift(entry);
    if (list.length > 500) list.length = 500;
    await writeJSON("announcements.json", list);
    return entry;
  });
}

/** Record that `userId` has read announcement `id` (idempotent). */
export async function markAnnouncementReadBy(id: string, userId: string): Promise<boolean> {
  return withLock("announcements.json", async () => {
    const list = await readJSON<Announcement[]>("announcements.json", []);
    const a = list.find((x) => x.id === id);
    if (!a) return false;
    if (!a.readBy.includes(userId)) {
      a.readBy.push(userId);
      await writeJSON("announcements.json", list);
    }
    return true;
  });
}

/**
 * Move announcement `id` into `userId`'s `inbox` / `archived` / `deleted`
 * mailbox (Gmail-style, per-recipient). Archiving also marks it read (you can't
 * archive something you haven't seen). Restoring (→ inbox) clears both buckets.
 * Idempotent; returns false when the announcement no longer exists.
 */
export async function setAnnouncementStateFor(
  id: string,
  userId: string,
  state: AnnouncementState,
): Promise<boolean> {
  return withLock("announcements.json", async () => {
    const list = await readJSON<Announcement[]>("announcements.json", []);
    const a = list.find((x) => x.id === id);
    if (!a) return false;
    const without = (arr?: string[]) => (arr ?? []).filter((u) => u !== userId);
    a.archivedBy = without(a.archivedBy);
    a.deletedBy = without(a.deletedBy);
    if (state === "archived") {
      a.archivedBy.push(userId);
      if (!a.readBy.includes(userId)) a.readBy.push(userId);
    } else if (state === "deleted") {
      a.deletedBy.push(userId);
    }
    await writeJSON("announcements.json", list);
    return true;
  });
}

export async function deleteAnnouncement(id: string): Promise<boolean> {
  return withLock("announcements.json", async () => {
    const list = await readJSON<Announcement[]>("announcements.json", []);
    const idx = list.findIndex((a) => a.id === id);
    if (idx === -1) return false;
    list.splice(idx, 1);
    await writeJSON("announcements.json", list);
    return true;
  });
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
  // Audit §11.1 — per-item regulatory disclosures. `null` clears back
  // to the seed flag so operators can withdraw a claim cleanly.
  /** SG MUIS halal status — surfaces a green / red / grey chip on the
   *  customer card when the location's zone is "SG". */
  halalStatus?: "halal" | "non-halal" | "uncertified" | null;
  /** SG NEA Nutri-Grade (beverages mainly) — renders the A/B/C/D
   *  hexagon badge when the location's `nutriGradeRequired` flag is on. */
  nutriGrade?: "A" | "B" | "C" | "D" | null;
  /** Surface a "Contains pork" disclaimer alongside the item card —
   *  independent of halalStatus so dishes that use non-halal beef but
   *  no pork can still skip this badge. */
  containsPork?: boolean | null;
  /** Surface a "Contains alcohol" disclaimer alongside the item card. */
  containsAlcohol?: boolean | null;
  /** Per-portion kcal override (NYC §81.50, EU 1169 opt-in). When set,
   *  `applyOverride` merges this into `item.nutrition.calories` so the
   *  customer-facing kcal pill picks it up without losing the rest of
   *  the nutrition struct (protein / carbs / fat). `null` clears back
   *  to the seed value. */
  calories?: number | null;
  /** EU 1169/2011 + FDA Big-9 allergen list. Replaces the seed/kodawari
   *  allergens entirely (so an operator can _remove_ a previously-flagged
   *  allergen if a sourcing change has eliminated it). `null` clears the
   *  override and the customer surface falls back to the kodawari seed.
   *  Empty array `[]` means "explicitly no major allergens declared" and
   *  the drawer renders the "no major allergens" line. */
  allergens?: import("@/data/types").Allergen[] | null;
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

export type AppCurrency = "PLN" | "USD" | "SGD" | "EUR" | "AED";
export type AppLocale = "pl" | "en" | "de" | "en-SG";

export interface CurrencyConfig {
  /** Currency the homepage switcher defaults to before the customer
   *  picks one. PLN keeps existing users untouched. */
  defaultCurrency: AppCurrency;
  /** Currencies the customer switcher exposes. The admin can disable any
   *  except PLN (always enabled — it's the source-of-truth charge currency). */
  enabledCurrencies: AppCurrency[];
  /** Multiplier applied to a PLN-zloty amount to produce the display
   *  value in the target currency. PLN is always 1. Operators retune
   *  these from /admin/currency without a deploy. */
  rates: Record<AppCurrency, number>;
}

export interface LocaleConfig {
  defaultLocale: AppLocale;
  enabledLocales: AppLocale[];
}

export interface AppSettings {
  deliveryFee: number; // in grosze
  minOrderAmount: number; // in grosze
  businessPhone: string;
  businessEmail: string;
  /** Operator-set trading name used in every customer comm (SMS, email +
   *  thermal receipts, chat assistant). Single source of truth so a rebrand
   *  is one admin edit, not a code change across comms files. Defaults to the
   *  SITE_NAME constant on first deploy. Editable at /admin/settings → General. */
  businessName?: string;
  /** Suggested tip percentages shown in the cart (fractions, e.g.
   *  [0.1, 0.15, 0.2]). Operator-tunable so gratuity prompts match the
   *  market without a deploy. Empty array hides the preset buttons. */
  tipPresets?: number[];
  /** Card-processing fee — the SINGLE source for the card fee, read by the
   *  delivery P&L report and used as the default for the Calculator scenario.
   *  `pct` is a fraction (0.014 = 1.4%); `fixedGrosze` is the flat per-txn fee. */
  processorFee?: { pct: number; fixedGrosze: number };
  /** Operational tuning targets that used to be hardcoded constants — labor
   *  productivity benchmarks, kitchen prep SLA floors, and inventory reorder
   *  policy. All operator-editable at /admin/settings → Operations. Each field
   *  falls back to DEFAULT_OPERATIONS when unset. */
  operations?: {
    labor?: { coversPerStaffHour?: number; splhLowGrosze?: number; splhHighGrosze?: number };
    kitchen?: { minPrepMinutes?: number; expoBufferMinutes?: number };
    inventory?: { fallbackLeadDays?: number; usageWindowDays?: number };
  };
  /** Marketing audience tuning. `vip*` define who the WhatsApp/SMS broadcast
   *  "VIP" segment targets — operator-set so the cut isn't a hardcoded literal.
   *  Admin → Settings → General → Operations. */
  marketing?: { vipSpendGrosze?: number; vipMinOrders?: number };
  /** Registered legal entity for tax filings (JPK_V7M). Operator-set so the
   *  NIP / legal name / REGON aren't stuck on `process.env.JPK_*` placeholders
   *  (a filing with NIP=0000000000 is invalid). When a field is blank the
   *  filing falls back to the env var, then the placeholder. Admin →
   *  Settings → General → Legal entity. */
  legalEntity?: { nip?: string; name?: string; regon?: string; email?: string };
  /** Operator-managed social handles, rendered in the public footer.
   *  Empty string = the corresponding link is hidden. Editable from
   *  /admin/settings → General. */
  socialLinks: {
    instagram: string;
    facebook: string;
    tiktok: string;
  };
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
  /** Master toggle for /admin/simulation (the Calculator). When false the nav
   *  link is hidden and the page redirects to /admin. */
  simulationEnabled?: boolean;
  /** Whole-business simulation: seeded on first enable with a
   *  realistic, deep CORE picture (~10 months of trading) as a pre-launch dry-run,
   *  the owner then layers their own test orders/waste/costs on top — behind `sim:`.
   *  Toggling off hides every test row.
   *  Toggled owner-only via /api/admin/simulation-mode. */
  simulationModeEnabled?: boolean;
  /** True once the simulation namespace has been seeded (or deliberately wiped
   *  to empty for hand-entry). The seed-on-first-enable path checks this instead
   *  of "are there 0 orders?", so a `wipe` to an empty dry-run is NOT re-seeded
   *  on a later off→on toggle. "reset" re-seeds and keeps it true. Lives in
   *  settings (a shared key) so wipeSimulationData() never clears it. */
  simulationSeeded?: boolean;
  /** Display-currency config — customer-side switcher + admin rates.
   *  Charges always settle in PLN; this controls the rendered amount. */
  currency?: CurrencyConfig;
  /** Customer locale config — switcher options + default language. */
  locale?: LocaleConfig;
  /** Per-location regulatory disclosures (NYC §81.50 + DOH grade +
   *  FRESH Act, SG NEA Nutri-Grade + MUIS Halal + GST + PDPA consent).
   *  EU/PL operates on the defaults; operators tag specific trucks as
   *  NYC or SG and the customer-facing chrome upgrades to match. */
  compliance?: ComplianceConfig;
  /** Refund/comp authorization caps (audit §11.2 — "what stops a cashier
   *  from comping the whole shift's revenue?"). Enforced server-side in the
   *  refund route; owners always bypass. See src/lib/refund-guard.ts. */
  refundControls?: RefundControls;
  /** Storefront visibility toggles — turn whole pieces of the public
   *  UI on/off without code changes. Each flag is the saved state
   *  (CLAUDE rule 7 — toggle = saved). When a flag is false, the
   *  owning component returns null so the surface loses its DOM and
   *  its painted CSS. */
  layout?: LayoutSettings;
}

export interface LayoutSettings {
  /** Show the currency picker in the public site header. When false the
   *  CurrencySwitcher renders null and the storefront falls back to PLN
   *  everywhere. */
  showCurrencySwitcher: boolean;
  /** Show the language picker in the public site header. When false the
   *  storefront uses the saved or default locale only. */
  showLanguageSwitcher: boolean;
  /** Show the bundles showcase block on the landing page. */
  showBundlesShowcase: boolean;
  /** Show the loyalty pitch section on the landing + location pages.
   *  The dedicated /rewards page is unaffected. */
  showLoyaltySection: boolean;
  /** Show the seasonal-specials rail on location menu pages. */
  showSeasonalSpecials: boolean;
  /** Show the cross-sell / upsell rail in the cart drawer. */
  showCartUpsell: boolean;
  /** Show the free-delivery progress bar in the cart drawer. */
  showDeliveryProgress: boolean;
  /** Show the push-opt-in button on the order-confirmation page. */
  showPushOptIn: boolean;
  /** Show the post-order feedback survey on the order-confirmation +
   *  review pages. */
  showFeedbackSurvey: boolean;
  /** Master switch for the NPS-style Pulse micro-surveys that fire
   *  opportunistically across the storefront (after ordering, on
   *  prolonged browsing, on exit intent, etc). When false the global
   *  SurveyPrompt + SurveyTriggerEngine drop out entirely — no prompts,
   *  no timers, no listeners. Per-survey `active` flags live in
   *  /admin/surveys; this is the umbrella kill-switch. */
  showNpsSurvey: boolean;
  /** Show the "complete your meal" post-order cross-sell on the
   *  order-confirmation page. */
  showPostOrderUpsell: boolean;
  /** Show the floating chat widget across the public site. */
  showChatWidget: boolean;
}

export const DEFAULT_LAYOUT_SETTINGS: LayoutSettings = {
  showCurrencySwitcher: true,
  showLanguageSwitcher: true,
  showBundlesShowcase: true,
  showLoyaltySection: true,
  showSeasonalSpecials: true,
  showCartUpsell: true,
  showDeliveryProgress: true,
  showPushOptIn: true,
  showFeedbackSurvey: true,
  showNpsSurvey: true,
  showPostOrderUpsell: true,
  showChatWidget: true,
};

export const DEFAULT_CURRENCY_CONFIG: CurrencyConfig = {
  defaultCurrency: "PLN",
  enabledCurrencies: ["PLN", "USD", "SGD", "EUR"],
  // Reference rates per 1 PLN as of mid-2026 — operator overrides via
  // /admin/currency the moment FX moves.
  rates: { PLN: 1, USD: 0.25, SGD: 0.34, EUR: 0.23, AED: 0.92 },
};

export const DEFAULT_LOCALE_CONFIG: LocaleConfig = {
  defaultLocale: "pl",
  enabledLocales: ["pl", "en", "de", "en-SG"],
};

// --- Regulatory compliance (audit §11.1) -------------------------------
//
// Per-location regulatory disclosures the operator must surface to the
// customer. EU/PL is the default — the customer-facing surfaces only
// upgrade their compliance chrome when the operator explicitly tags a
// location as "NYC" or "SG" and fills the relevant fields. Nothing is
// inferred; the model is "show only what the operator confirms applies."

export type RegulatoryZone = "EU" | "NYC" | "SG";

export type DohGrade = "A" | "B" | "C" | "Pending";

export interface LocationComplianceConfig {
  /** Which regulatory pack the location operates under. EU = default
   *  Polish/EU rules (1169/2011 allergens). NYC = §81.50 calorie display,
   *  DOH letter grade, FRESH Act packaging. SG = NEA Nutri-Grade, MUIS
   *  Halal, GST invoicing, PDPA consent. */
  zone: RegulatoryZone;
  /** NYC DOH letter grade (most recent inspection). Required to be
   *  posted at the point of sale per NYC Health Code §81.51 + §23-04. */
  dohGrade?: DohGrade | null;
  /** ISO date the DOH grade was issued. */
  dohGradeIssued?: string | null;
  /** When true, the menu page shows per-item kcal next to the price for
   *  every standard menu item, per NYC §81.50 (also UK 2022 Calorie
   *  Labelling Regs). Independent of the zone so an EU operator can
   *  also opt in voluntarily. */
  calorieDisclosureRequired?: boolean;
  /** SG MUIS Halal certification number. When set, the location header
   *  shows the cert + serves the SG Halal disclosure footer note. */
  halalCertId?: string | null;
  /** ISO date the MUIS Halal cert expires. */
  halalCertExpires?: string | null;
  /** Whether the operator is GST-registered for SG. Required for any
   *  business with annual turnover >S$1M; flips the cart total to show
   *  GST as a separate line. */
  gstRegistered?: boolean;
  /** SG GST registration number (e.g. "201234567M"). Surfaces on the
   *  email receipt + tax invoice. */
  gstNumber?: string | null;
  /** GST rate in basis points. Default 900 (9 %) for SG; operator can
   *  override if rates change. */
  gstRateBps?: number;
  /** Prepared-food VAT rate in basis points (EU / PL). Default 800
   *  (8 %, ustawa o VAT, załącznik 10, poz. 3). Drives JPK_V7M exports
   *  — kept per location so a future foreign-zone EU truck can carry
   *  its own rate. Operator-editable from /admin/regulatory-compliance. */
  vatRateBps?: number;
  /** When true, the menu page surfaces NEA Nutri-Grade badges on any
   *  beverage with `nutriGrade` set. */
  nutriGradeRequired?: boolean;
  /** Customer-visible packaging composition text per NYC FRESH Act +
   *  EU 94/62/EC. Rendered in the cart and on the email receipt. */
  packagingDisclosure?: string | null;
  /** SG PDPA Section 13 / EU GDPR Art 13 consent body shown in the
   *  consent dialog before the customer's phone is collected at
   *  checkout. Operator-editable so legal copy stays current without
   *  a code deploy. */
  pdpaConsentText?: string | null;
}

export interface ComplianceConfig {
  /** Map keyed by location slug. Locations not in the map fall back to
   *  the zone-default below — keeps existing PL trucks untouched. */
  byLocation: Record<string, LocationComplianceConfig>;
  /** Default zone applied when a slug isn't in `byLocation`. */
  defaultZone: RegulatoryZone;
}

export const DEFAULT_COMPLIANCE_CONFIG: ComplianceConfig = {
  byLocation: {},
  defaultZone: "EU",
};

export function resolveLocationCompliance(
  config: ComplianceConfig | undefined,
  locationSlug: string,
): LocationComplianceConfig {
  const explicit = config?.byLocation?.[locationSlug];
  if (explicit) return explicit;
  return { zone: config?.defaultZone ?? "EU" };
}

/** Default card-processing fee (Stripe's PL card rate: 1.4% + 0.40 zł). The
 *  single source for the fee's default — referenced by DEFAULT_SETTINGS and the
 *  Calculator's default scenario so the rate isn't duplicated as a bare literal. */
export const DEFAULT_PROCESSOR_FEE = { pct: 0.014, fixedGrosze: 40 };

/** Default operational tuning — the values these levers used to hardcode, kept
 *  as the single fallback source so unedited installs behave identically.
 *  - labor: ~3 covers/staff/hr; SPLH healthy band 70–150 zł/hr (QSR norm).
 *  - kitchen: 10-min prep floor + 3-min expo buffer (the customer ETA quote).
 *  - inventory: 3-day fallback supplier lead time; 14-day usage-averaging window. */
export const DEFAULT_OPERATIONS = {
  labor: { coversPerStaffHour: 3, splhLowGrosze: 7000, splhHighGrosze: 15000 },
  kitchen: { minPrepMinutes: 10, expoBufferMinutes: 3 },
  inventory: { fallbackLeadDays: 3, usageWindowDays: 14 },
};

const DEFAULT_SETTINGS: AppSettings = {
  // Matches the pre-Phase-8 hardcoded DELIVERY_FEE_GROSZE in lib/upsell.ts
  // so first-deploy / unedited installs see no customer-visible price
  // change. Operators who explicitly set a value in /admin/settings keep
  // their saved number (which now actually drives the charge).
  deliveryFee: 700, // 7.00 PLN
  minOrderAmount: 3000, // 30.00 PLN
  businessName: SITE_NAME,
  tipPresets: [0.1, 0.15, 0.2],
  processorFee: DEFAULT_PROCESSOR_FEE,
  operations: DEFAULT_OPERATIONS,
  businessPhone: "+48 123 456 789",
  businessEmail: "hello@ottaviano.pl",
  socialLinks: {
    instagram: "https://instagram.com/ottaviano.pl",
    facebook: "https://facebook.com/ottaviano.pl",
    tiktok: "https://tiktok.com/@ottaviano.pl",
  },
  currency: DEFAULT_CURRENCY_CONFIG,
  locale: DEFAULT_LOCALE_CONFIG,
  compliance: DEFAULT_COMPLIANCE_CONFIG,
  refundControls: DEFAULT_REFUND_CONTROLS,
};

function mergeSettings(
  saved: Partial<AppSettings>,
  overrides: Partial<AppSettings> = {},
): AppSettings {
  // Deep-merge for nested currency/locale so partial PATCHes (e.g. only
  // rates) preserve the operator-set enabled list + default.
  const base = { ...DEFAULT_SETTINGS, ...saved, ...overrides };
  base.currency = {
    ...DEFAULT_CURRENCY_CONFIG,
    ...(saved.currency ?? {}),
    ...(overrides.currency ?? {}),
    rates: {
      ...DEFAULT_CURRENCY_CONFIG.rates,
      ...(saved.currency?.rates ?? {}),
      ...(overrides.currency?.rates ?? {}),
      PLN: 1,
    },
  };
  base.locale = {
    ...DEFAULT_LOCALE_CONFIG,
    ...(saved.locale ?? {}),
    ...(overrides.locale ?? {}),
  };
  base.compliance = {
    ...DEFAULT_COMPLIANCE_CONFIG,
    ...(saved.compliance ?? {}),
    ...(overrides.compliance ?? {}),
    byLocation: {
      ...(saved.compliance?.byLocation ?? {}),
      ...(overrides.compliance?.byLocation ?? {}),
    },
  };
  // Deep-merge the nested ops/fee blocks too, so a partial PUT (e.g. only
  // operations.labor) can't drop the sibling sub-keys back to undefined.
  base.processorFee = { ...DEFAULT_PROCESSOR_FEE, ...(saved.processorFee ?? {}), ...(overrides.processorFee ?? {}) };
  base.operations = {
    labor: { ...DEFAULT_OPERATIONS.labor, ...(saved.operations?.labor ?? {}), ...(overrides.operations?.labor ?? {}) },
    kitchen: { ...DEFAULT_OPERATIONS.kitchen, ...(saved.operations?.kitchen ?? {}), ...(overrides.operations?.kitchen ?? {}) },
    inventory: { ...DEFAULT_OPERATIONS.inventory, ...(saved.operations?.inventory ?? {}), ...(overrides.operations?.inventory ?? {}) },
  };
  return base;
}

export async function getSettings(): Promise<AppSettings> {
  const saved = await readJSON<Partial<AppSettings>>("settings.json", {});
  // Prime the data-mode cache off the same (shared, never-namespaced) read
  // so cold requests pick up the active mode without a second round-trip.
  dataModeCache = { prefix: prefixForSettings(saved), at: Date.now() };
  return mergeSettings(saved);
}

export async function updateSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
  return withLock("settings.json", async () => {
    const current = await readJSON<Partial<AppSettings>>("settings.json", {});
    const merged = mergeSettings(current, updates);
    await writeJSON("settings.json", merged);
    // Prime the data-mode cache to the new value so the mode takes effect
    // immediately in-process (a flipped toggle must be live for the very next
    // read/write — e.g. the seeder that runs right after enabling).
    dataModeCache = { prefix: prefixForSettings(merged), at: Date.now() };
    return merged;
  });
}

/**
 * Active AI model selection. Persists only the chosen model id (e.g.
 * "claude-opus-4-7", "gemini-2.5-pro"); the catalog + validity live in
 * src/lib/ai/models.ts so the store stays provider-agnostic. The AI gateway
 * reads this at call time to route between Claude and Gemini. Empty = the
 * caller's default (Claude).
 */
export interface AiModelSettings {
  modelId: string | null;
}

export async function getAiModelSettings(): Promise<AiModelSettings> {
  const saved = await readJSON<Partial<AiModelSettings>>("ai-model.json", {});
  return { modelId: typeof saved.modelId === "string" && saved.modelId ? saved.modelId : null };
}

export async function updateAiModelSettings(modelId: string): Promise<AiModelSettings> {
  return withLock("ai-model.json", async () => {
    const next: AiModelSettings = { modelId };
    await writeJSON("ai-model.json", next);
    return next;
  });
}

// --- Theme skins (admin/settings → Themes) ------------------------------
//
// DB-global active skin per surface (homepage / admin / core). An operator
// picks a skin in /admin/settings → Themes and it applies to EVERY visitor.
// Persisted as a tiny `{ homepage, admin, core }` record; every read + write
// is coerced through resolveSkinSettings() so a removed skin can never leave
// a surface pointing at a missing stylesheet. See src/lib/theme-skins.ts.

export async function getThemeSkinSettings(): Promise<ThemeSkinSettings> {
  const saved = await readJSON<Partial<ThemeSkinSettings>>("theme-skins.json", {});
  return resolveSkinSettings(saved);
}

export async function updateThemeSkinSettings(
  updates: Partial<ThemeSkinSettings>,
): Promise<ThemeSkinSettings> {
  return withLock("theme-skins.json", async () => {
    const current = await readJSON<Partial<ThemeSkinSettings>>("theme-skins.json", {});
    const merged = resolveSkinSettings({ ...current, ...updates });
    await writeJSON("theme-skins.json", merged);
    return merged;
  });
}

// --- Payment methods (admin/payments) ----------------------------------
//
// Which tender methods the storefront + QR ordering offer the guest, and
// how the Stripe checkout session is configured. Card / Apple Pay / Google
// Pay / BLIK / Przelewy24 all settle through Stripe (the processor); the
// enabled set drives the `payment_method_types` the checkout route asks
// Stripe for, plus the customer-facing method badges. Apple/Google Pay are
// wallet UIs that ride the `card` rail (Stripe surfaces them automatically),
// so they map onto "card" rather than their own Stripe type. Bitcoin is an
// off-Stripe method — the guest pays to a displayed wallet address and the
// order stays unpaid until the operator confirms receipt in POS. Secrets
// (Stripe keys) live in env vars, never here.

export type PaymentMethodId =
  | "card"
  | "apple_pay"
  | "google_pay"
  | "blik"
  | "p24"
  | "bitcoin";

export interface PaymentMethodConfig {
  id: PaymentMethodId;
  enabled: boolean;
}

export interface PaymentSettings {
  methods: PaymentMethodConfig[];
  /** Receiving BTC address shown to the guest when the Bitcoin method is on. */
  bitcoinAddress?: string;
}

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  // Order here is the canonical method order shown to guests.
  methods: [
    { id: "card", enabled: true },
    { id: "apple_pay", enabled: true },
    { id: "google_pay", enabled: true },
    { id: "blik", enabled: true },
    { id: "p24", enabled: false },
    { id: "bitcoin", enabled: false },
  ],
  bitcoinAddress: "",
};

const PAYMENT_SETTINGS_KEY = "payment-settings.json";

function mergePaymentSettings(saved: Partial<PaymentSettings>): PaymentSettings {
  const savedById = new Map((saved.methods ?? []).map((m) => [m.id, m]));
  // Defaults define the canonical method set + order; saved flags win so a
  // newly-added method appears (default-off) without an operator migration.
  const methods = DEFAULT_PAYMENT_SETTINGS.methods.map((d) => ({
    id: d.id,
    enabled: typeof savedById.get(d.id)?.enabled === "boolean" ? savedById.get(d.id)!.enabled : d.enabled,
  }));
  return {
    methods,
    bitcoinAddress:
      typeof saved.bitcoinAddress === "string" ? saved.bitcoinAddress : DEFAULT_PAYMENT_SETTINGS.bitcoinAddress,
  };
}

export async function getPaymentSettings(): Promise<PaymentSettings> {
  return mergePaymentSettings(await readJSON<Partial<PaymentSettings>>(PAYMENT_SETTINGS_KEY, {}));
}

export async function updatePaymentSettings(updates: Partial<PaymentSettings>): Promise<PaymentSettings> {
  return withLock(PAYMENT_SETTINGS_KEY, async () => {
    const current = mergePaymentSettings(await readJSON<Partial<PaymentSettings>>(PAYMENT_SETTINGS_KEY, {}));
    // Patch the supplied method flags over the CURRENT set (not the defaults),
    // so a partial update never silently resets the methods it omitted.
    let methods = current.methods;
    if (updates.methods) {
      const upById = new Map(updates.methods.map((m) => [m.id, m]));
      methods = current.methods.map((m) => {
        const up = upById.get(m.id);
        return up && typeof up.enabled === "boolean" ? { ...m, enabled: up.enabled } : m;
      });
    }
    const merged: PaymentSettings = {
      methods,
      bitcoinAddress:
        typeof updates.bitcoinAddress === "string" ? updates.bitcoinAddress.trim() : current.bitcoinAddress,
    };
    await writeJSON(PAYMENT_SETTINGS_KEY, merged);
    return merged;
  });
}

/** The enabled Stripe `payment_method_types` for a checkout session, in
 *  Stripe's preferred order. Apple/Google Pay fold into "card" (Stripe shows
 *  the wallet sheet automatically). Always falls back to ["card"] so checkout
 *  never breaks even if every method was toggled off. */
export async function getEnabledStripeMethods(): Promise<string[]> {
  const s = await getPaymentSettings();
  const on = (id: PaymentMethodId) => s.methods.some((m) => m.id === id && m.enabled);
  const types: string[] = [];
  if (on("card") || on("apple_pay") || on("google_pay")) types.push("card");
  if (on("blik")) types.push("blik");
  if (on("p24")) types.push("p24");
  return types.length > 0 ? types : ["card"];
}

// --- Delivery-marketplace integrations (admin/integrations) ------------
//
// Operator-managed connections to third-party ordering marketplaces. Each
// connection persists its enable flag, connection status, the operator's
// store id on that marketplace, the public deep-link guests can order
// through, the marketplace commission (feeds channel economics in the
// Calculator), and an auto-accept flag. Live order ingestion needs each
// marketplace's partner API + webhook — out of scope here; this layer owns
// the connection registry, the customer-facing "also order on …" links, and
// the per-channel economics. Marketplace API keys live in the provider's own
// dashboard / env vars, never here.

export type IntegrationProviderId =
  | "uber_eats"
  | "bolt_food"
  | "wolt"
  | "glovo"
  | "pyszne_pl"
  | "grab";

export type IntegrationStatus = "connected" | "disconnected" | "error";

export interface IntegrationConnection {
  provider: IntegrationProviderId;
  enabled: boolean;
  status: IntegrationStatus;
  /** Operator's store/merchant id on the marketplace (non-secret). */
  storeId?: string;
  /** Public deep-link where guests can order on this marketplace. */
  orderUrl?: string;
  /** Commission the marketplace charges (0–1). Feeds channel economics. */
  commissionPct?: number;
  /** Auto-accept incoming orders without manual confirmation. */
  autoAccept?: boolean;
  /** ISO timestamp of the last successful connection check. */
  lastConnectedAt?: string;
}

export interface IntegrationSettings {
  connections: IntegrationConnection[];
}

/** Typical 2026 PL marketplace commissions — the operator overrides per
 *  connection once their real contract rate is known. */
export const DEFAULT_INTEGRATION_COMMISSION: Record<IntegrationProviderId, number> = {
  uber_eats: 0.3,
  bolt_food: 0.25,
  wolt: 0.28,
  glovo: 0.27,
  pyszne_pl: 0.13,
  grab: 0.3,
};

const INTEGRATION_PROVIDER_ORDER: IntegrationProviderId[] = [
  "uber_eats",
  "wolt",
  "glovo",
  "pyszne_pl",
  "bolt_food",
  "grab",
];

export const DEFAULT_INTEGRATION_SETTINGS: IntegrationSettings = {
  connections: INTEGRATION_PROVIDER_ORDER.map((provider) => ({
    provider,
    enabled: false,
    status: "disconnected" as IntegrationStatus,
    commissionPct: DEFAULT_INTEGRATION_COMMISSION[provider],
    autoAccept: false,
  })),
};

const INTEGRATION_SETTINGS_KEY = "integration-settings.json";

const INTEGRATION_STATUSES: IntegrationStatus[] = ["connected", "disconnected", "error"];

function sanitizeConnection(
  base: IntegrationConnection,
  patch: Partial<IntegrationConnection>,
): IntegrationConnection {
  const clampPct = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : undefined;
  return {
    provider: base.provider,
    enabled: typeof patch.enabled === "boolean" ? patch.enabled : base.enabled,
    status:
      typeof patch.status === "string" && INTEGRATION_STATUSES.includes(patch.status)
        ? patch.status
        : base.status,
    storeId: typeof patch.storeId === "string" ? patch.storeId.trim() : base.storeId,
    orderUrl: typeof patch.orderUrl === "string" ? patch.orderUrl.trim() : base.orderUrl,
    commissionPct: clampPct(patch.commissionPct) ?? base.commissionPct,
    autoAccept: typeof patch.autoAccept === "boolean" ? patch.autoAccept : base.autoAccept,
    lastConnectedAt:
      typeof patch.lastConnectedAt === "string" ? patch.lastConnectedAt : base.lastConnectedAt,
  };
}

function mergeIntegrationSettings(saved: Partial<IntegrationSettings>): IntegrationSettings {
  const savedByProvider = new Map((saved.connections ?? []).map((c) => [c.provider, c]));
  // Defaults define the canonical provider set + order; saved values win.
  const connections = DEFAULT_INTEGRATION_SETTINGS.connections.map((d) => {
    const s = savedByProvider.get(d.provider);
    return s ? sanitizeConnection(d, s) : d;
  });
  return { connections };
}

export async function getIntegrationSettings(): Promise<IntegrationSettings> {
  return mergeIntegrationSettings(
    await readJSON<Partial<IntegrationSettings>>(INTEGRATION_SETTINGS_KEY, {}),
  );
}

export async function updateIntegrationSettings(
  updates: Partial<IntegrationSettings>,
): Promise<IntegrationSettings> {
  return withLock(INTEGRATION_SETTINGS_KEY, async () => {
    const current = mergeIntegrationSettings(
      await readJSON<Partial<IntegrationSettings>>(INTEGRATION_SETTINGS_KEY, {}),
    );
    // Patch each supplied connection over the current value (supports both a
    // single-connection "connect" action and a full-list save).
    const byProvider = new Map(current.connections.map((c) => [c.provider, c]));
    for (const u of updates.connections ?? []) {
      const cur = byProvider.get(u.provider);
      if (cur) byProvider.set(u.provider, sanitizeConnection(cur, u));
    }
    const merged = mergeIntegrationSettings({ connections: [...byProvider.values()] });
    await writeJSON(INTEGRATION_SETTINGS_KEY, merged);
    return merged;
  });
}

// --- QR in-restaurant ordering (admin/qr-ordering) --------------------
//
// Operator control over the /qr table-ordering surface: a master switch, a
// per-location override, whether a scanned table number is mandatory, and
// whether prices show on the QR menu. Read server-side by the /qr page so
// toggling here gates ordering immediately — no deploy.

export interface QrOrderingSettings {
  /** Master switch for QR table ordering across the chain. */
  enabled: boolean;
  /** Per-location override (slug → on/off). Absent = follows `enabled`. */
  locations: Record<string, boolean>;
  /** Require a scanned table number (?table=) before a guest can order. */
  requireTableNumber: boolean;
  /** Show prices on the QR menu (some operators run price-on-request events). */
  showPrices: boolean;
}

export const DEFAULT_QR_ORDERING_SETTINGS: QrOrderingSettings = {
  enabled: true,
  locations: {},
  requireTableNumber: false,
  showPrices: true,
};

const QR_ORDERING_KEY = "qr-ordering-settings.json";

function mergeQrOrdering(saved: Partial<QrOrderingSettings>): QrOrderingSettings {
  const d = DEFAULT_QR_ORDERING_SETTINGS;
  return {
    enabled: typeof saved.enabled === "boolean" ? saved.enabled : d.enabled,
    locations: saved.locations && typeof saved.locations === "object" ? saved.locations : {},
    requireTableNumber:
      typeof saved.requireTableNumber === "boolean" ? saved.requireTableNumber : d.requireTableNumber,
    showPrices: typeof saved.showPrices === "boolean" ? saved.showPrices : d.showPrices,
  };
}

export async function getQrOrderingSettings(): Promise<QrOrderingSettings> {
  return mergeQrOrdering(await readJSON<Partial<QrOrderingSettings>>(QR_ORDERING_KEY, {}));
}

export async function updateQrOrderingSettings(
  updates: Partial<QrOrderingSettings>,
): Promise<QrOrderingSettings> {
  return withLock(QR_ORDERING_KEY, async () => {
    const current = mergeQrOrdering(await readJSON<Partial<QrOrderingSettings>>(QR_ORDERING_KEY, {}));
    const merged = mergeQrOrdering({
      ...current,
      ...updates,
      locations: { ...current.locations, ...(updates.locations ?? {}) },
    });
    await writeJSON(QR_ORDERING_KEY, merged);
    return merged;
  });
}

/** Whether QR ordering is live for a given location (master AND per-location). */
export function isQrOrderingEnabled(settings: QrOrderingSettings, locationSlug: string): boolean {
  if (!settings.enabled) return false;
  const loc = settings.locations[locationSlug];
  return loc === undefined ? true : loc;
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

export interface LoyaltyTierConfig {
  /** Customer-facing tier label. Editable so the operator can run an
   *  Italian voice ("Famiglia Oro") without a deploy. */
  label: string;
  /** Points needed to enter the tier (cumulative lifetime). */
  threshold: number;
  /** Earn-rate multiplier applied to per-order points. */
  multiplier: number;
  /** Bullet list of perks shown on the rewards page tier card. */
  perks: string[];
}

export interface LoyaltySettings {
  tiers: {
    bronze: LoyaltyTierConfig;
    silver: LoyaltyTierConfig;
    gold: LoyaltyTierConfig;
    platinum: LoyaltyTierConfig;
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
    bronze: { label: "Bronze", threshold: 0, multiplier: 1, perks: ["1 point per 1 PLN spent"] },
    silver: { label: "Silver", threshold: 500, multiplier: 1.5, perks: ["1.5x points multiplier", "Free birthday dessert"] },
    gold: { label: "Gold", threshold: 1500, multiplier: 2, perks: ["2x points multiplier", "Priority ordering", "Free delivery"] },
    platinum: { label: "Platinum", threshold: 5000, multiplier: 3, perks: ["3x points multiplier", "Exclusive menu items", "VIP events"] },
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

// --- Ops goals: the configurable daily revenue target ---------------------
//
// The Admin v3 "Operator Terminal" dashboard fills its revenue→goal bar
// against a real, operator-set target (no hardcoded number — CLAUDE.md rule
// #1). `dailyRevenueGoalGrosze` is the chain-wide default; `byLocation`
// overrides it per truck. 0 / unset = no goal configured, and the dashboard
// falls back to a forecast-based pace read instead.
export interface OpsGoals {
  /** Chain-wide daily revenue goal in grosze. 0 = unset. */
  dailyRevenueGoalGrosze: number;
  /** Per-location daily revenue goal overrides, in grosze. */
  byLocation: Record<string, number>;
}

const DEFAULT_OPS_GOALS: OpsGoals = { dailyRevenueGoalGrosze: 0, byLocation: {} };

export async function getOpsGoals(): Promise<OpsGoals> {
  const saved = await readJSON<Partial<OpsGoals>>("ops-goals.json", DEFAULT_OPS_GOALS);
  return {
    dailyRevenueGoalGrosze: Math.max(0, Math.round(saved.dailyRevenueGoalGrosze ?? 0)),
    byLocation: saved.byLocation ?? {},
  };
}

export async function updateOpsGoals(updates: Partial<OpsGoals>): Promise<OpsGoals> {
  return withLock("ops-goals.json", async () => {
    const current = await getOpsGoals();
    const merged: OpsGoals = {
      dailyRevenueGoalGrosze:
        updates.dailyRevenueGoalGrosze !== undefined
          ? Math.max(0, Math.round(updates.dailyRevenueGoalGrosze))
          : current.dailyRevenueGoalGrosze,
      byLocation: { ...current.byLocation, ...(updates.byLocation ?? {}) },
    };
    await writeJSON("ops-goals.json", merged);
    return merged;
  });
}

/** Effective daily goal (grosze) for a scope. `""` = chain default. */
export function resolveDailyGoal(goals: OpsGoals, location: string): number {
  if (location && goals.byLocation[location] > 0) return goals.byLocation[location];
  return goals.dailyRevenueGoalGrosze || 0;
}

// --- Concierge: agent-commerce capability exposure -----------------------
//
// The Concierge surface (/core/guest/concierge) exposes one capability layer to AI
// assistants over MCP and to guests over WhatsApp. Each capability has an
// operator-controlled exposure toggle — flipping it off removes the capability
// from the public agent endpoint (/api/agent/[capability]) immediately. The
// read capabilities are backed by the same live data the customer site + the
// WhatsApp ordering bot already serve, so this is exposure config, not data.

export const CONCIERGE_CAPABILITY_IDS = [
  "get_menu",
  "check_availability",
  "get_allergens",
  "place_order",
  "create_payment",
  "locate_truck",
] as const;

export type ConciergeCapabilityId = (typeof CONCIERGE_CAPABILITY_IDS)[number];

export interface ConciergeSettings {
  /** Per-capability exposure. Absent = on (capabilities ship enabled). */
  exposure: Record<ConciergeCapabilityId, boolean>;
}

const DEFAULT_CONCIERGE_SETTINGS: ConciergeSettings = {
  exposure: {
    get_menu: true,
    check_availability: true,
    get_allergens: true,
    place_order: true,
    create_payment: true,
    locate_truck: true,
  },
};

function hydrateConcierge(saved: Partial<ConciergeSettings>): ConciergeSettings {
  const exposure = { ...DEFAULT_CONCIERGE_SETTINGS.exposure };
  if (saved.exposure) {
    for (const id of CONCIERGE_CAPABILITY_IDS) {
      if (typeof saved.exposure[id] === "boolean") exposure[id] = saved.exposure[id];
    }
  }
  return { exposure };
}

export async function getConciergeSettings(): Promise<ConciergeSettings> {
  const saved = await readJSON<Partial<ConciergeSettings>>("concierge-settings.json", {});
  return hydrateConcierge(saved);
}

export async function updateConciergeSettings(
  updates: { exposure?: Partial<Record<ConciergeCapabilityId, boolean>> },
): Promise<ConciergeSettings> {
  return withLock("concierge-settings.json", async () => {
    const current = hydrateConcierge(
      await readJSON<Partial<ConciergeSettings>>("concierge-settings.json", {}),
    );
    const merged: ConciergeSettings = {
      exposure: { ...current.exposure, ...(updates.exposure ?? {}) },
    };
    await writeJSON("concierge-settings.json", merged);
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
  // 2026-05 — kcal-per-unit added so recipe calories can be computed from
  // ingredient totals instead of an operator-typed value. Nullable so rows
  // created before this column shipped don't need a backfill before the
  // schema is honoured.
  `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS kcal_per_unit integer`,
  // 2026-05 — full macros (protein / carbs / sugar / fiber / fat) per
  // unit. Same pattern as kcal: nullable, populated lazily, computed
  // into recipe per-portion totals when every line has the value.
  `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS protein_per_unit integer`,
  `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS carbs_per_unit integer`,
  `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS sugar_per_unit integer`,
  `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS fiber_per_unit integer`,
  `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS fat_per_unit integer`,
  // 2026-05 — ingredient → multiple distributor offerings. Cost +
  // nutrition move down to ingredient_products; the active offering's
  // values drive recipe calc. Cost is dropped to NULLable so the
  // backfill helper can clear it after migrating values down.
  `ALTER TABLE ingredients ALTER COLUMN cost_per_unit DROP NOT NULL`,
  `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS active_product_id text`,
];

/** Per-distributor offerings. One ingredient can have N rows; the
 *  ingredient's `active_product_id` picks which row's values are used
 *  in recipe calc. */
const INGREDIENT_PRODUCTS_DDL = [
  `CREATE TABLE IF NOT EXISTS ingredient_products (
    id text PRIMARY KEY,
    ingredient_id text NOT NULL,
    supplier_id text NOT NULL,
    supplier_sku text,
    display_name text,
    cost_per_unit integer NOT NULL,
    kcal_per_unit integer,
    protein_per_unit integer,
    carbs_per_unit integer,
    sugar_per_unit integer,
    fiber_per_unit integer,
    fat_per_unit integer,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS ingredient_products_ingredient_id_idx
    ON ingredient_products (ingredient_id)`,
  `CREATE INDEX IF NOT EXISTS ingredient_products_supplier_id_idx
    ON ingredient_products (supplier_id)`,
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
async function ensureIngredientProductsTable(): Promise<void> {
  await ensureTable("ingredient_products", INGREDIENT_PRODUCTS_DDL);
}
async function ensureRecipesTable(): Promise<void> {
  await ensureTable("recipes", RECIPES_DDL);
}

async function dualWriteIngredient(ingredient: Ingredient): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await ensureIngredientsTable();
    // Cost + macros live on `ingredient_products` rows now. Ingredient
    // row carries identity (name / category / unit) + the active offering
    // pointer. Old columns stay nullable for the backfill phase but
    // we write null going forward.
    await db
      .insert(ingredientsTable)
      .values({
        id: ingredient.id,
        name: ingredient.name,
        category: ingredient.category,
        unit: ingredient.unit,
        costPerUnit: null,
        kcalPerUnit: null,
        proteinPerUnit: null,
        carbsPerUnit: null,
        sugarPerUnit: null,
        fiberPerUnit: null,
        fatPerUnit: null,
        activeProductId: ingredient.activeProductId ?? null,
        supplier: null,
        notes: ingredient.notes ?? null,
      })
      .onConflictDoUpdate({
        target: ingredientsTable.id,
        set: {
          name: ingredient.name,
          category: ingredient.category,
          unit: ingredient.unit,
          activeProductId: ingredient.activeProductId ?? null,
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
    // Cascading delete of all offerings — recipes that referenced this
    // ingredient already lose the line, so the per-supplier rows are
    // orphaned data.
    await ensureIngredientProductsTable();
    await db
      .delete(ingredientProductsTable)
      .where(eq(ingredientProductsTable.ingredientId, id));
  } catch (err) {
    logger.warn("dualDeleteIngredient failed", { id, layer: "store.ingredients" }, err);
  }
}

async function dualWriteIngredientProduct(product: IngredientProduct): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await ensureIngredientProductsTable();
    const values = {
      id: product.id,
      ingredientId: product.ingredientId,
      supplierId: product.supplierId,
      supplierSku: product.supplierSku ?? null,
      displayName: product.displayName ?? null,
      costPerUnit: product.costPerUnit,
      kcalPerUnit: product.kcalPerUnit ?? null,
      proteinPerUnit: product.proteinPerUnit ?? null,
      carbsPerUnit: product.carbsPerUnit ?? null,
      sugarPerUnit: product.sugarPerUnit ?? null,
      fiberPerUnit: product.fiberPerUnit ?? null,
      fatPerUnit: product.fatPerUnit ?? null,
      notes: product.notes ?? null,
      createdAt: new Date(product.createdAt),
      updatedAt: new Date(product.updatedAt),
    };
    const { id: _id, createdAt: _c, ...updateSet } = values;
    void _id; void _c;
    await db
      .insert(ingredientProductsTable)
      .values(values)
      .onConflictDoUpdate({ target: ingredientProductsTable.id, set: updateSet });
  } catch (err) {
    logger.warn(
      "dualWriteIngredientProduct failed",
      { id: product.id, layer: "store.ingredient_products" },
      err,
    );
  }
}

async function dualDeleteIngredientProduct(id: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await ensureIngredientProductsTable();
    await db.delete(ingredientProductsTable).where(eq(ingredientProductsTable.id, id));
  } catch (err) {
    logger.warn(
      "dualDeleteIngredientProduct failed",
      { id, layer: "store.ingredient_products" },
      err,
    );
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
    activeProductId: row.activeProductId ?? undefined,
    notes: row.notes ?? undefined,
  };
}

function rowToIngredientProduct(
  row: typeof ingredientProductsTable.$inferSelect,
): IngredientProduct {
  return {
    id: row.id,
    ingredientId: row.ingredientId,
    supplierId: row.supplierId,
    supplierSku: row.supplierSku ?? undefined,
    displayName: row.displayName ?? undefined,
    costPerUnit: row.costPerUnit,
    kcalPerUnit: row.kcalPerUnit ?? undefined,
    proteinPerUnit: row.proteinPerUnit ?? undefined,
    carbsPerUnit: row.carbsPerUnit ?? undefined,
    sugarPerUnit: row.sugarPerUnit ?? undefined,
    fiberPerUnit: row.fiberPerUnit ?? undefined,
    fatPerUnit: row.fatPerUnit ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: (row.createdAt as Date).toISOString(),
    updatedAt: (row.updatedAt as Date).toISOString(),
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

/**
 * Per-process backfill flag. Older ingredient rows stored cost +
 * macros directly on the ingredients table; after the migration to
 * `ingredient_products`, we lazily relocate those values into a default
 * offering on first `getIngredients()` call. Idempotent: re-running
 * skips ingredients that already have an `activeProductId`.
 */
let backfilledIngredientProducts = false;

async function backfillIngredientProductsOnce(legacyIngredients: Ingredient[]): Promise<void> {
  if (backfilledIngredientProducts) return;
  backfilledIngredientProducts = true;
  const products = await readJSON<IngredientProduct[]>("ingredient-products.json", []);
  const existing = new Set(products.map((p) => p.ingredientId));
  const created: IngredientProduct[] = [];
  for (const ing of legacyIngredients) {
    // Pull legacy fields off the row even though the new Ingredient
    // type doesn't list them — they survive on KV-stored JSON until
    // migrated.
    const legacy = ing as unknown as Record<string, unknown>;
    const legacyCost =
      typeof legacy.costPerUnit === "number" ? (legacy.costPerUnit as number) : undefined;
    if (ing.activeProductId || existing.has(ing.id) || legacyCost === undefined) continue;
    const now = new Date().toISOString();
    const product: IngredientProduct = {
      id: `ipr-${crypto.randomUUID().slice(0, 8)}`,
      ingredientId: ing.id,
      // No real Supplier FK yet — operators set the supplier text field
      // free-form before the join existed. Stash that text under a
      // synthetic supplier id so existing data renders sensibly until
      // the operator picks a real Supplier row in the new UI.
      supplierId: typeof legacy.supplier === "string" && (legacy.supplier as string).trim()
        ? `legacy:${(legacy.supplier as string).trim()}`
        : "legacy:unknown",
      supplierSku: undefined,
      displayName: "Default offering",
      costPerUnit: legacyCost,
      kcalPerUnit: typeof legacy.kcalPerUnit === "number" ? (legacy.kcalPerUnit as number) : undefined,
      proteinPerUnit: typeof legacy.proteinPerUnit === "number" ? (legacy.proteinPerUnit as number) : undefined,
      carbsPerUnit: typeof legacy.carbsPerUnit === "number" ? (legacy.carbsPerUnit as number) : undefined,
      sugarPerUnit: typeof legacy.sugarPerUnit === "number" ? (legacy.sugarPerUnit as number) : undefined,
      fiberPerUnit: typeof legacy.fiberPerUnit === "number" ? (legacy.fiberPerUnit as number) : undefined,
      fatPerUnit: typeof legacy.fatPerUnit === "number" ? (legacy.fatPerUnit as number) : undefined,
      createdAt: now,
      updatedAt: now,
    };
    created.push(product);
    ing.activeProductId = product.id;
    // Strip the legacy fields off the in-memory row so callers see the
    // new shape immediately.
    delete (ing as unknown as Record<string, unknown>).costPerUnit;
    delete (ing as unknown as Record<string, unknown>).kcalPerUnit;
    delete (ing as unknown as Record<string, unknown>).proteinPerUnit;
    delete (ing as unknown as Record<string, unknown>).carbsPerUnit;
    delete (ing as unknown as Record<string, unknown>).sugarPerUnit;
    delete (ing as unknown as Record<string, unknown>).fiberPerUnit;
    delete (ing as unknown as Record<string, unknown>).fatPerUnit;
    delete (ing as unknown as Record<string, unknown>).supplier;
  }
  if (created.length === 0) return;
  // Persist both sides — write the new products + the updated
  // activeProductId pointers so the next read sees the migration.
  await withLock("ingredient-products.json", async () => {
    const fresh = await readJSON<IngredientProduct[]>("ingredient-products.json", []);
    await writeJSON("ingredient-products.json", [...fresh, ...created]);
  });
  await withLock("ingredients.json", async () => {
    const fresh = await readJSON<Ingredient[]>("ingredients.json", []);
    const map = new Map(legacyIngredients.map((i) => [i.id, i] as const));
    for (let i = 0; i < fresh.length; i++) {
      const migrated = map.get(fresh[i].id);
      if (migrated) fresh[i] = migrated;
    }
    await writeJSON("ingredients.json", fresh);
  });
  void Promise.all(created.map((p) => dualWriteIngredientProduct(p)));
  void Promise.all(legacyIngredients.map((i) => dualWriteIngredient(i)));
}

/** Hydrate Ingredient rows with the active offering's cost + nutrition
 *  + supplier name. Source of truth lives on IngredientProduct; this
 *  helper is a convenience read so consumers (recipe cost, PO pricing,
 *  variance, search, inventory valuation) can keep doing `ing.costPerUnit`
 *  without re-running the join every time. */
async function hydrateActiveOfferings(ings: Ingredient[]): Promise<Ingredient[]> {
  if (ings.length === 0) return ings;
  const products = await getIngredientProducts();
  if (products.length === 0) return ings;
  const productById = new Map(products.map((p) => [p.id, p]));
  const suppliers = await getSuppliers();
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));
  for (const ing of ings) {
    if (!ing.activeProductId) continue;
    const product = productById.get(ing.activeProductId);
    if (!product) continue;
    ing.costPerUnit = product.costPerUnit;
    if (typeof product.kcalPerUnit === "number") ing.kcalPerUnit = product.kcalPerUnit;
    if (typeof product.proteinPerUnit === "number") ing.proteinPerUnit = product.proteinPerUnit;
    if (typeof product.carbsPerUnit === "number") ing.carbsPerUnit = product.carbsPerUnit;
    if (typeof product.sugarPerUnit === "number") ing.sugarPerUnit = product.sugarPerUnit;
    if (typeof product.fiberPerUnit === "number") ing.fiberPerUnit = product.fiberPerUnit;
    if (typeof product.fatPerUnit === "number") ing.fatPerUnit = product.fatPerUnit;
    const supplier = supplierById.get(product.supplierId);
    if (supplier) ing.supplier = supplier.name;
    else if (product.supplierId.startsWith("legacy:")) {
      ing.supplier = product.supplierId.slice("legacy:".length);
    }
  }
  return ings;
}

export async function getIngredients(): Promise<Ingredient[]> {
  const db = getDb();
  if (db && !dbBreakerOpen()) {
    try {
      await ensureIngredientsTable();
      const rows = await withDbTimeout(
        () => db.select().from(ingredientsTable),
        "getIngredients",
      );
      if (rows.length > 0) {
        const mapped = rows.map(rowToIngredient);
        // DB rows may still carry pre-migration cost/macros on the
        // ingredient row itself. Surface them to the backfill so it
        // can move them down into ingredient_products.
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const m = mapped[i] as unknown as Record<string, unknown>;
          if (r.costPerUnit !== null && r.costPerUnit !== undefined) m.costPerUnit = r.costPerUnit;
          if (r.kcalPerUnit !== null && r.kcalPerUnit !== undefined) m.kcalPerUnit = r.kcalPerUnit;
          if (r.proteinPerUnit !== null && r.proteinPerUnit !== undefined) m.proteinPerUnit = r.proteinPerUnit;
          if (r.carbsPerUnit !== null && r.carbsPerUnit !== undefined) m.carbsPerUnit = r.carbsPerUnit;
          if (r.sugarPerUnit !== null && r.sugarPerUnit !== undefined) m.sugarPerUnit = r.sugarPerUnit;
          if (r.fiberPerUnit !== null && r.fiberPerUnit !== undefined) m.fiberPerUnit = r.fiberPerUnit;
          if (r.fatPerUnit !== null && r.fatPerUnit !== undefined) m.fatPerUnit = r.fatPerUnit;
          if (r.supplier) m.supplier = r.supplier;
        }
        if (!backfilledIngredientProducts) await backfillIngredientProductsOnce(mapped);
        return hydrateActiveOfferings(mapped);
      }
    } catch (err) {
      logger.warn("getIngredients DB read failed; falling back", { layer: "store.ingredients" }, err);
    }
  }
  const fromKv = await readJSON<Ingredient[]>("ingredients.json", []);
  if (fromKv.length > 0) {
    bumpLazyBackfillHit("ingredients");
    // When Neon is unhealthy (breaker open) skip the lazy backfill + dual-write
    // mirror — they'd only pile more doomed connections onto a saturated pool
    // (the exact failure mode that breaks the build).
    if (!backfilledIngredientProducts && !dbBreakerOpen()) await backfillIngredientProductsOnce(fromKv);
    if (!dbBreakerOpen()) void Promise.all(fromKv.map((i) => dualWriteIngredient(i)));
  }
  return hydrateActiveOfferings(fromKv);
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
    // Cascade: drop every offering tied to this ingredient too.
    await withLock("ingredient-products.json", async () => {
      const products = await readJSON<IngredientProduct[]>("ingredient-products.json", []);
      const remaining = products.filter((p) => p.ingredientId !== id);
      if (remaining.length !== products.length) {
        await writeJSON("ingredient-products.json", remaining);
      }
    });
    return true;
  });
}

// --- Ingredient products (per-distributor offerings) -----------------

export async function getIngredientProducts(
  filter?: { ingredientId?: string; supplierId?: string },
): Promise<IngredientProduct[]> {
  const db = getDb();
  if (db) {
    try {
      await ensureIngredientProductsTable();
      const rows = await db.select().from(ingredientProductsTable);
      if (rows.length > 0) {
        const mapped = rows.map(rowToIngredientProduct);
        return filterProducts(mapped, filter);
      }
    } catch (err) {
      logger.warn(
        "getIngredientProducts DB read failed; falling back",
        { layer: "store.ingredient_products" },
        err,
      );
    }
  }
  const fromKv = await readJSON<IngredientProduct[]>("ingredient-products.json", []);
  if (fromKv.length > 0) {
    bumpLazyBackfillHit("ingredient_products");
    void Promise.all(fromKv.map((p) => dualWriteIngredientProduct(p)));
  }
  return filterProducts(fromKv, filter);
}

function filterProducts(
  list: IngredientProduct[],
  filter?: { ingredientId?: string; supplierId?: string },
): IngredientProduct[] {
  if (!filter) return list;
  return list.filter((p) => {
    if (filter.ingredientId && p.ingredientId !== filter.ingredientId) return false;
    if (filter.supplierId && p.supplierId !== filter.supplierId) return false;
    return true;
  });
}

export async function saveIngredientProduct(
  input: Omit<IngredientProduct, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
    createdAt?: string;
  },
): Promise<IngredientProduct> {
  return withLock("ingredient-products.json", async () => {
    const list = await readJSON<IngredientProduct[]>("ingredient-products.json", []);
    const now = new Date().toISOString();
    const id = input.id ?? `ipr-${crypto.randomUUID().slice(0, 8)}`;
    const existing = list.find((p) => p.id === id);
    const next: IngredientProduct = {
      ...existing,
      ...input,
      id,
      createdAt: existing?.createdAt ?? input.createdAt ?? now,
      updatedAt: now,
    } as IngredientProduct;
    const idx = list.findIndex((p) => p.id === id);
    if (idx >= 0) list[idx] = next;
    else list.push(next);
    await writeJSON("ingredient-products.json", list);
    await dualWriteIngredientProduct(next);
    return next;
  });
}

export async function deleteIngredientProduct(id: string): Promise<boolean> {
  return withLock("ingredient-products.json", async () => {
    const list = await readJSON<IngredientProduct[]>("ingredient-products.json", []);
    const filtered = list.filter((p) => p.id !== id);
    if (filtered.length === list.length) return false;
    await writeJSON("ingredient-products.json", filtered);
    await dualDeleteIngredientProduct(id);
    // If an ingredient was pointing at this offering, clear the pointer
    // so the next read computes correctly (no recipe values) instead of
    // resolving to a stale reference.
    await withLock("ingredients.json", async () => {
      const ings = await readJSON<Ingredient[]>("ingredients.json", []);
      let changed = false;
      for (const ing of ings) {
        if (ing.activeProductId === id) {
          ing.activeProductId = undefined;
          changed = true;
        }
      }
      if (changed) {
        await writeJSON("ingredients.json", ings);
        void Promise.all(ings.map((i) => dualWriteIngredient(i)));
      }
    });
    return true;
  });
}

// --- Recipes ---
//
// Recipes are chain-wide: one row per dish, keyed by the dish's base
// slug (the part of the menu-item id after the location prefix —
// `krk-pizza-margherita` and `waw-pizza-margherita` both resolve to
// `pizza-margherita`). Callers keep passing menu item ids; the store
// layer derives the base slug on read + write so the API doesn't have
// to change.
//
// Prior to 2026-05 recipes were stored per-(location, dish) — one row
// per menu item id. A lazy migration on first read collapses any old
// rows to the base-slug shape, deduping on collision (first wins).

let normalizedRecipeKeys = false;

async function normalizeRecipeKeysOnce(): Promise<void> {
  if (normalizedRecipeKeys) return;
  normalizedRecipeKeys = true;
  await withLock("recipes.json", async () => {
    const list = await readJSON<Recipe[]>("recipes.json", []);
    let needsRewrite = false;
    const seen = new Map<string, Recipe>();
    for (const r of list) {
      const base = getBaseSlug(r.menuItemId);
      if (base !== r.menuItemId) needsRewrite = true;
      // First occurrence wins; any later prefixed duplicate is dropped
      // so the unique-by-menu-item-id invariant holds post-migration.
      if (!seen.has(base)) {
        seen.set(base, { ...r, menuItemId: base });
      } else {
        needsRewrite = true;
      }
    }
    if (!needsRewrite) return;
    const next = Array.from(seen.values());
    await writeJSON("recipes.json", next);
    // DB side: wipe + rewrite. The recipes table is small (one row per
    // dish) so the bulk replace is cheap, and it sidesteps the unique
    // constraint conflicts that would otherwise arise when two
    // prefixed rows collapse to the same base slug.
    const db = getDb();
    if (db) {
      try {
        await ensureRecipesTable();
        await db.delete(recipesTable);
        for (const r of next) await dualWriteRecipe(r);
      } catch (err) {
        logger.warn(
          "normalizeRecipeKeysOnce DB sync failed; KV is now canonical",
          { layer: "store.recipes" },
          err,
        );
      }
    }
  });
}

export async function getRecipes(): Promise<Recipe[]> {
  await normalizeRecipeKeysOnce();
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
  await normalizeRecipeKeysOnce();
  // Always look up by base slug — `krk-pizza-margherita` and
  // `waw-pizza-margherita` share one Margherita recipe.
  const baseSlug = getBaseSlug(menuItemId);
  const db = getDb();
  if (db) {
    try {
      await ensureRecipesTable();
      const rows = await db
        .select()
        .from(recipesTable)
        .where(eq(recipesTable.menuItemId, baseSlug))
        .limit(1);
      if (rows.length > 0) return rowToRecipe(rows[0]);
    } catch (err) {
      logger.warn("getRecipe DB read failed; falling back", { menuItemId, baseSlug, layer: "store.recipes" }, err);
    }
  }
  const recipes = await readJSON<Recipe[]>("recipes.json", []);
  const hit = recipes.find((r) => r.menuItemId === baseSlug);
  if (hit) {
    bumpLazyBackfillHit("recipes");
    void dualWriteRecipe(hit);
  }
  return hit;
}

export async function saveRecipe(recipe: Recipe): Promise<Recipe> {
  await normalizeRecipeKeysOnce();
  // Store under the base slug so future reads find the same row
  // regardless of which location's menu item the operator was editing
  // from. The recipe row carries the canonical chain-wide formula.
  const normalised: Recipe = {
    ...recipe,
    menuItemId: getBaseSlug(recipe.menuItemId),
  };
  return withLock("recipes.json", async () => {
    const list = await readJSON<Recipe[]>("recipes.json", []);
    const idx = list.findIndex((r) => r.menuItemId === normalised.menuItemId);
    if (idx >= 0) {
      list[idx] = normalised;
    } else {
      list.push(normalised);
    }
    await writeJSON("recipes.json", list);
    await dualWriteRecipe(normalised);
    return normalised;
  });
}

export async function deleteRecipe(menuItemId: string): Promise<boolean> {
  await normalizeRecipeKeysOnce();
  const baseSlug = getBaseSlug(menuItemId);
  return withLock("recipes.json", async () => {
    const list = await readJSON<Recipe[]>("recipes.json", []);
    const filtered = list.filter((r) => r.menuItemId !== baseSlug);
    if (filtered.length === list.length) return false;
    await writeJSON("recipes.json", filtered);
    await dualDeleteRecipe(baseSlug);
    return true;
  });
}

/** Resolve each ingredient referenced by the recipe to the active
 *  per-distributor offering. Returns a map keyed by `ingredientId`
 *  pointing at the active `IngredientProduct` row (or undefined if the
 *  ingredient has no active offering yet — caller decides whether to
 *  treat that as zero-cost / null-macro). */
async function resolveActiveProducts(
  ingredientIds: Iterable<string>,
): Promise<Map<string, IngredientProduct | undefined>> {
  const ids = new Set(ingredientIds);
  if (ids.size === 0) return new Map();
  const [ingredients, products] = await Promise.all([
    getIngredients(),
    getIngredientProducts(),
  ]);
  const ingById = new Map(ingredients.map((i) => [i.id, i]));
  const productById = new Map(products.map((p) => [p.id, p]));
  const out = new Map<string, IngredientProduct | undefined>();
  for (const id of ids) {
    const ing = ingById.get(id);
    const pid = ing?.activeProductId;
    out.set(id, pid ? productById.get(pid) : undefined);
  }
  return out;
}

// Calculate food cost from recipe. Reads from each ingredient's active
// distributor offering (set by the operator via the Suppliers list on
// the ingredient dialog) rather than a flat cost on the ingredient
// itself. Switching distributors = point the ingredient at a different
// offering; cost flows through automatically.
export async function calculateFoodCost(menuItemId: string): Promise<number> {
  const recipe = await getRecipe(menuItemId);
  if (!recipe || recipe.ingredients.length === 0) return 0;

  const activeProducts = await resolveActiveProducts(
    recipe.ingredients.map((ri) => ri.ingredientId),
  );

  let totalCost = 0;
  for (const ri of recipe.ingredients) {
    const product = activeProducts.get(ri.ingredientId);
    if (!product) continue;
    totalCost += product.costPerUnit * ri.quantity * (ri.wasteFactor || 1);
  }

  // Cost per portion
  return Math.round(totalCost / (recipe.yieldPortions || 1));
}

/**
 * Split a dish's recipe food cost into the ingredient cost that reaches the
 * plate (`base`) and the trim/spill overhead carried by each line's
 * `wasteFactor` (`waste`). `base + waste === total === calculateFoodCost()`.
 * The Calculator derives its separate Food-cost-% and Waste-% levers from the
 * menu-wide weighting of this split, so waste isn't double-counted inside the
 * flat food-cost ratio. Returns all-zero when there's no recipe.
 */
export async function calculateFoodCostBreakdown(
  menuItemId: string,
): Promise<{ base: number; waste: number; total: number }> {
  const recipe = await getRecipe(menuItemId);
  if (!recipe || recipe.ingredients.length === 0) return { base: 0, waste: 0, total: 0 };

  const activeProducts = await resolveActiveProducts(
    recipe.ingredients.map((ri) => ri.ingredientId),
  );

  let base = 0;
  let total = 0;
  for (const ri of recipe.ingredients) {
    const product = activeProducts.get(ri.ingredientId);
    if (!product) continue;
    const lineBase = product.costPerUnit * ri.quantity;
    base += lineBase;
    total += lineBase * (ri.wasteFactor || 1);
  }

  const yieldPortions = recipe.yieldPortions || 1;
  // Round base + total independently, then derive waste as the difference so the
  // `base + waste === total` invariant holds exactly (three independent Math.round
  // calls can drift by 1) and waste can never round negative.
  const roundedBase = Math.round(base / yieldPortions);
  const roundedTotal = Math.round(total / yieldPortions);
  return {
    base: roundedBase,
    waste: Math.max(0, roundedTotal - roundedBase),
    total: roundedTotal,
  };
}

/**
 * Calculate per-portion kcal from the recipe. Reads each ingredient's
 * active distributor offering. Returns `null` when:
 *  - there's no recipe, or
 *  - any ingredient is missing an active offering, or
 *  - any active offering is missing `kcalPerUnit`.
 * Surfaces as "—" in the operator UI + skips the customer kcal pill,
 * instead of showing a misleading partial sum.
 *
 * `wasteFactor` is NOT applied — `quantity` is the amount that ends
 * up in the dish (what the customer eats); `wasteFactor` only covers
 * extra purchased to cover trim/spill loss, which is a cost concern.
 */
export async function calculateRecipeCalories(menuItemId: string): Promise<number | null> {
  const recipe = await getRecipe(menuItemId);
  if (!recipe || recipe.ingredients.length === 0) return null;

  const activeProducts = await resolveActiveProducts(
    recipe.ingredients.map((ri) => ri.ingredientId),
  );

  let totalKcal = 0;
  for (const ri of recipe.ingredients) {
    const product = activeProducts.get(ri.ingredientId);
    if (!product) return null;
    if (typeof product.kcalPerUnit !== "number") return null;
    totalKcal += product.kcalPerUnit * ri.quantity;
  }

  return Math.round(totalKcal / (recipe.yieldPortions || 1));
}

/**
 * Per-portion nutrition computed from the recipe. Each field is
 * independent: `protein` is set whenever every recipe line has
 * `proteinPerUnit`, even if (say) `fiberPerUnit` is missing on one
 * ingredient. Allows operators to roll macros out gradually without
 * blanking every figure when one ingredient is incomplete.
 *
 * Quantities below are in grams per portion except `calories` which
 * stays in kcal. Storage on each ingredient is per-unit (per kg / per
 * L / per piece) so the multiplication `perUnit × quantity × waste`
 * keeps the same units; division by `yieldPortions` turns the batch
 * total into a per-serving figure.
 */
export interface RecipeNutrition {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  sugar: number | null;
  fiber: number | null;
  fat: number | null;
}

const MACRO_FIELDS = [
  ["calories", "kcalPerUnit"],
  ["protein", "proteinPerUnit"],
  ["carbs", "carbsPerUnit"],
  ["sugar", "sugarPerUnit"],
  ["fiber", "fiberPerUnit"],
  ["fat", "fatPerUnit"],
] as const;

export async function calculateRecipeNutrition(menuItemId: string): Promise<RecipeNutrition> {
  const empty: RecipeNutrition = {
    calories: null,
    protein: null,
    carbs: null,
    sugar: null,
    fiber: null,
    fat: null,
  };
  const recipe = await getRecipe(menuItemId);
  if (!recipe || recipe.ingredients.length === 0) return empty;

  const activeProducts = await resolveActiveProducts(
    recipe.ingredients.map((ri) => ri.ingredientId),
  );

  const out: RecipeNutrition = { ...empty };
  for (const [field, key] of MACRO_FIELDS) {
    let total = 0;
    let complete = true;
    for (const ri of recipe.ingredients) {
      const product = activeProducts.get(ri.ingredientId);
      const raw = product ? (product as unknown as Record<string, unknown>)[key] : undefined;
      if (typeof raw !== "number") {
        complete = false;
        break;
      }
      // No wasteFactor on macros — see calculateRecipeCalories.
      total += raw * ri.quantity;
    }
    if (complete) out[field] = Math.round(total / (recipe.yieldPortions || 1));
  }
  return out;
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
  const db = await getDomainDb();
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
  const db = await getDomainDb();
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
  const db = await getDomainDb();
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
   * When set, productises this wallet as a "Ottaviano Corporate" account
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

// --- Ottaviano Corporate (audit §3.4) ---------------------------------
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
  const db = await getDomainDb();
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
  const db = await getDomainDb();
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

/**
 * Win-back outreach log (Phase 2 retention — see src/lib/retention.ts). One row
 * per executed win-back action: the incentive granted + the drafted message +
 * the chosen channel. Powers the cooldown (don't re-nag the same guest) and the
 * audit trail of who the system reached out to. JSON-store backed (like
 * floor/slots) — no dedicated table needed at truck volumes.
 */
export interface RetentionOutreach {
  id: string;
  phone: string;
  channel: "sms" | "email" | "none";
  bonusPoints: number;
  message: string;
  risk: string;
  valueAtRiskGrosze: number;
  actedBy: string;
  actedAt: string;
  /** Whether the message actually went out a live provider (vs noop/log-only/skipped). */
  sent?: boolean;
  /** Provider status: "queued"/"sent" (live), "noop" (no provider), "skipped" (opt-out), "none". */
  providerStatus?: string;
  /** Opaque provider message id when sent. */
  providerMessageId?: string;
}

export async function getRetentionOutreach(): Promise<RetentionOutreach[]> {
  return readJSON<RetentionOutreach[]>("retention-outreach.json", []);
}

export async function recordRetentionOutreach(entry: RetentionOutreach): Promise<void> {
  await withLock("retention-outreach.json", async () => {
    const list = await readJSON<RetentionOutreach[]>("retention-outreach.json", []);
    list.push(entry);
    await writeJSON("retention-outreach.json", list);
  });
}

/**
 * Demand signal — a logged rejection: a guest who tried to book a slot that was
 * full (real demand the static counter throws away). The proprietary dataset
 * behind the Demand Exchange (src/lib/demand-exchange.ts): fill-rate only sees
 * supply; this captures demand > supply. JSON-store backed (like slots/floor).
 */
export interface DemandSignal {
  id: string;
  locationSlug: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  fulfillmentType: string;
  slotId: string;
  outcome: "slot_full";
  createdAt: string;
}

export async function getDemandSignals(locationSlug?: string, date?: string): Promise<DemandSignal[]> {
  const all = await readJSON<DemandSignal[]>("demand-signals.json", []);
  return all.filter(
    (s) => (!locationSlug || s.locationSlug === locationSlug) && (!date || s.date === date),
  );
}

export async function recordDemandSignal(sig: DemandSignal): Promise<void> {
  await withLock("demand-signals.json", async () => {
    const list = await readJSON<DemandSignal[]>("demand-signals.json", []);
    list.push(sig);
    await writeJSON("demand-signals.json", list);
  });
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
   * productised as a Ottaviano Corporate account. Lets the cart drawer
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
  const db = await getDomainDb();
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
  const db = await getDomainDb();
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

// --- Pulse surveys (NPS-style micro-surveys) -------------------------
//
// Shape + seed catalogue + scoring live in the pure `@/lib/surveys`
// module (client-safe). The catalogue (a small, bounded list) rides the
// generic kv_store via readJSON/writeJSON. Responses, which grow without
// bound, use a dedicated indexed `survey_responses` table with a
// filesystem-JSON fallback for local dev — the same dual-write pattern as
// `feedback` above, so an indexed INSERT replaces a read-modify-write of an
// ever-growing blob (and nothing is silently evicted).

const SURVEY_DEFS_KEY = "survey-definitions.json";
const SURVEY_RESPONSES_KEY = "survey-responses.json";

/**
 * The full survey catalogue — persisted operator edits merged over the
 * seed defaults, so a deploy that ships a new idea never drops it and an
 * operator's toggles/copy stay sticky.
 */
export async function getSurveys(): Promise<SurveyDefinition[]> {
  const saved = await readJSON<SurveyDefinition[] | null>(SURVEY_DEFS_KEY, null);
  return mergeSurveysWithDefaults(saved);
}

/** Just the live surveys — what the storefront is allowed to surface. */
export async function getActiveSurveys(): Promise<SurveyDefinition[]> {
  return (await getSurveys()).filter((s) => s.active);
}

/**
 * Patch one survey definition. Writes the whole hydrated catalogue so the
 * seed defaults are materialised on first edit (and stay editable after).
 */
export async function updateSurvey(
  id: string,
  updates: Partial<Omit<SurveyDefinition, "id">>,
): Promise<SurveyDefinition | null> {
  return withLock(SURVEY_DEFS_KEY, async () => {
    const list = mergeSurveysWithDefaults(
      await readJSON<SurveyDefinition[] | null>(SURVEY_DEFS_KEY, null),
    );
    const idx = list.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    // `trigger` is intentionally never read from `updates` — it is wired to
    // concrete client signals and must not be repointed. Defence-in-depth on
    // top of the route's field whitelist: clamp/coerce so a direct caller
    // can't persist an oversized or wrong-typed definition.
    const safe: Partial<SurveyDefinition> = {};
    if (typeof updates.active === "boolean") safe.active = updates.active;
    if (typeof updates.question === "string") safe.question = updates.question.slice(0, 160);
    if (typeof updates.subtext === "string") safe.subtext = updates.subtext.slice(0, 200);
    if (typeof updates.scaleLow === "string") safe.scaleLow = updates.scaleLow.slice(0, 40);
    if (typeof updates.scaleHigh === "string") safe.scaleHigh = updates.scaleHigh.slice(0, 40);
    if (typeof updates.commentPrompt === "string")
      safe.commentPrompt = updates.commentPrompt.slice(0, 160);
    if (typeof updates.cooldownDays === "number" && Number.isFinite(updates.cooldownDays))
      safe.cooldownDays = Math.min(365, Math.max(0, Math.round(updates.cooldownDays)));
    list[idx] = { ...list[idx], ...safe };
    await writeJSON(SURVEY_DEFS_KEY, list);
    return list[idx];
  });
}

const SURVEY_RESPONSES_DDL = [
  `CREATE TABLE IF NOT EXISTS survey_responses (
    id text PRIMARY KEY,
    survey_id text NOT NULL,
    trigger text NOT NULL,
    rating integer NOT NULL,
    comment text,
    customer_phone text,
    customer_name text,
    location_slug text,
    page_path text,
    created_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS survey_responses_created_idx
    ON survey_responses (created_at)`,
  `CREATE INDEX IF NOT EXISTS survey_responses_survey_idx ON survey_responses (survey_id)`,
  `CREATE INDEX IF NOT EXISTS survey_responses_trigger_idx ON survey_responses (trigger)`,
];

async function ensureSurveyResponsesTable(): Promise<void> {
  await ensureTable("survey_responses", SURVEY_RESPONSES_DDL);
}

function rowToSurveyResponse(
  row: typeof surveyResponsesTable.$inferSelect,
): SurveyResponse {
  return {
    id: row.id,
    surveyId: row.surveyId,
    trigger: row.trigger as SurveyResponse["trigger"],
    rating: row.rating,
    comment: row.comment ?? undefined,
    customerPhone: row.customerPhone ?? undefined,
    customerName: row.customerName ?? undefined,
    locationSlug: row.locationSlug ?? undefined,
    pagePath: row.pagePath ?? undefined,
    date: row.createdAt.toISOString(),
  };
}

async function dualWriteSurveyResponse(entry: SurveyResponse): Promise<void> {
  const db = await getDomainDb();
  if (!db) return;
  try {
    await ensureSurveyResponsesTable();
    const values = {
      id: entry.id,
      surveyId: entry.surveyId,
      trigger: entry.trigger,
      rating: entry.rating,
      comment: entry.comment ?? null,
      customerPhone: entry.customerPhone ?? null,
      customerName: entry.customerName ?? null,
      locationSlug: entry.locationSlug ?? null,
      pagePath: entry.pagePath ?? null,
      createdAt: new Date(entry.date),
    };
    await db
      .insert(surveyResponsesTable)
      .values(values)
      .onConflictDoUpdate({ target: surveyResponsesTable.id, set: values });
  } catch (err) {
    logger.warn(
      "dualWriteSurveyResponse failed",
      { id: entry.id, layer: "store.surveys" },
      err,
    );
  }
}

export async function getSurveyResponses(): Promise<SurveyResponse[]> {
  const db = await getDomainDb();
  if (db) {
    try {
      await ensureSurveyResponsesTable();
      const rows = await db
        .select()
        .from(surveyResponsesTable)
        .orderBy(desc(surveyResponsesTable.createdAt));
      if (rows.length > 0) return rows.map(rowToSurveyResponse);
    } catch (err) {
      logger.warn(
        "getSurveyResponses DB read failed; falling back",
        { layer: "store.surveys" },
        err,
      );
    }
  }
  const list = await readJSON<SurveyResponse[]>(SURVEY_RESPONSES_KEY, []);
  if (list.length > 0) {
    bumpLazyBackfillHit("survey_responses");
    void Promise.all(list.map((r) => dualWriteSurveyResponse(r)));
  }
  return list;
}

export async function saveSurveyResponse(
  entry: SurveyResponse,
): Promise<SurveyResponse> {
  await withLock(SURVEY_RESPONSES_KEY, async () => {
    const list = await readJSON<SurveyResponse[]>(SURVEY_RESPONSES_KEY, []);
    list.push(entry);
    await writeJSON(SURVEY_RESPONSES_KEY, list);
  });
  await dualWriteSurveyResponse(entry);
  return entry;
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
  /**
   * Per-location bundle A/B experiment (audit elite-qsr §9). Single
   * experiment per location with weighted variants + per-bundle discount
   * overrides, lifecycle (draft/running/stopped), and a concluded result.
   * The server resolver (`experiments-server.ts`) reads it and assigns
   * variants only while `isExperimentLive`. Previously this field was
   * written by the admin PUT but missing from the type — surfaced as
   * `experiment` on the admin LocationConfig; now part of the canonical
   * persisted shape so reads + writes are type-checked end to end.
   */
  experiment?: Experiment | null;
  /**
   * ML upsell ranker rollout (audit elite-qsr §1). 0–100 = % of customers
   * (deterministically phone-bucketed) served the ML-ranked cross-sell
   * instead of the rules ranker. 0 / unset = off (rules for everyone).
   * Falls back to rules when no trained model exists for the location, so
   * turning this up before training simply changes nothing.
   */
  mlUpsellRolloutPct?: number;
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

// ─── Bundle feedback (voice-of-customer, audit elite-qsr §2) ─────────────
//
// The bundle audit log captures WHAT was sold; this captures what the
// customer thought of the value. A post-receipt thumbs-up/down per bundle
// order so a bundle that converts well but is disliked (a profit centre
// burning brand equity) becomes visible on BundleAnalyticsCard instead of
// being discovered from a one-star review. Upsert by orderId so a
// customer can change their mind without skewing the rate.

export interface BundleFeedbackEvent {
  id: string;
  orderId: string;
  bundleId: string;
  bundleName: string;
  locationSlug: string;
  rating: "up" | "down";
  createdAt: string;
}

export async function appendBundleFeedback(event: BundleFeedbackEvent): Promise<void> {
  await withLock("bundle-feedback.json", async () => {
    const list = await readJSON<BundleFeedbackEvent[]>("bundle-feedback.json", []);
    const next = list.filter((e) => e.orderId !== event.orderId);
    next.push(event);
    await writeJSON("bundle-feedback.json", next);
  });
  incrCounter(`bundles.feedback.${event.rating}`);
}

export async function getBundleFeedback(opts?: {
  locationSlug?: string;
  sinceIso?: string;
}): Promise<BundleFeedbackEvent[]> {
  const all = await readJSON<BundleFeedbackEvent[]>("bundle-feedback.json", []);
  return all.filter((e) => {
    if (opts?.locationSlug && e.locationSlug !== opts.locationSlug) return false;
    if (opts?.sinceIso && e.createdAt < opts.sinceIso) return false;
    return true;
  });
}

/** The most-recent bundle event for an order (one bundle per order), used
 *  to resolve whether an order was a bundle + which bundle, for the
 *  post-order feedback prompt. */
export async function getBundleEventByOrderId(
  orderId: string,
): Promise<BundleEvent | null> {
  const all = await readJSON<BundleEvent[]>("bundle-events.json", []);
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i].orderId === orderId) return all[i];
  }
  return null;
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

// ─── ML upsell ranker models (audit elite-qsr §1) ────────────────────────
//
// Per-location logistic-regression weights + learned attach aggregates,
// trained from real orders by /api/admin/ml-upsell/train and read by the
// inference path when a customer is bucketed into the ML variant. Keyed
// by location slug (menus differ per location, so models do too).

export type MLUpsellModels = Record<string, MLUpsellModel>;

export async function getMLUpsellModels(): Promise<MLUpsellModels> {
  return readJSON<MLUpsellModels>("ml-upsell-models.json", {});
}

export async function getMLUpsellModel(
  locationSlug: string,
): Promise<MLUpsellModel | null> {
  const all = await readJSON<MLUpsellModels>("ml-upsell-models.json", {});
  return all[locationSlug] ?? null;
}

export async function saveMLUpsellModel(model: MLUpsellModel): Promise<void> {
  if (!model.locationSlug) return;
  await withLock("ml-upsell-models.json", async () => {
    const all = await readJSON<MLUpsellModels>("ml-upsell-models.json", {});
    all[model.locationSlug as string] = model;
    await writeJSON("ml-upsell-models.json", all);
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
  const db = await getDomainDb();
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
  const db = await getDomainDb();
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
  const db = await getDomainDb();
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
  const db = await getDomainDb();
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
  const db = await getDomainDb();
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
  const db = await getDomainDb();
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

/**
 * Bulk-append pre-built stock movements in ONE locked write — the simulation
 * seeder lays down a multi-week receive/consume/waste history per ingredient,
 * and createStockMovement's per-row lock + stock recompute would be hundreds of
 * round-trips. Does NOT touch ingredient_stock — the seeder pairs this with
 * bulkUpsertIngredientStock, whose onHand it computes to match these movements.
 * Only called while a test mode is active (getDomainDb() is null then).
 */
export async function bulkAppendStockMovements(movements: StockMovement[]): Promise<void> {
  if (movements.length === 0) return;
  const db = await getDomainDb();
  if (db) {
    for (const m of movements) await dualWriteMovement(m);
    return;
  }
  await withLock("stock-movements.json", async () => {
    const list = await readJSON<StockMovement[]>("stock-movements.json", []);
    list.push(...movements);
    await writeJSON("stock-movements.json", list);
  });
}

/** Bulk-upsert pre-built stock rows in ONE locked write (keyed by
 *  ingredient+location), mirroring upsertIngredientStock per row. The seeder
 *  computes onHand to match the movement history it lands alongside. */
export async function bulkUpsertIngredientStock(rows: IngredientStock[]): Promise<void> {
  if (rows.length === 0) return;
  await withLock("ingredient-stock.json", async () => {
    const list = await readJSON<IngredientStock[]>("ingredient-stock.json", []);
    for (const row of rows) {
      const i = list.findIndex((s) => s.ingredientId === row.ingredientId && s.locationSlug === row.locationSlug);
      if (i >= 0) list[i] = row;
      else list.push(row);
    }
    await writeJSON("ingredient-stock.json", list);
  });
  const db = await getDomainDb();
  if (db) for (const row of rows) await dualWriteStock(row);
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
  const db = await getDomainDb();
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
  const db = await getDomainDb();
  if (!db) return;
  try {
    await ensureCustomerNotesTable();
    await db.delete(customerNotesTable).where(eq(customerNotesTable.id, id));
  } catch (err) {
    logger.warn("dualDeleteCustomerNote failed", { id, layer: "store.customer_notes" }, err);
  }
}

export async function getCustomerNotes(phone?: string): Promise<CustomerNote[]> {
  const db = await getDomainDb();
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
  const db = await getDomainDb();
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
  const db = await getDomainDb();
  if (!db) return;
  try {
    await ensureStaffTable();
    await db.delete(staffTable).where(eq(staffTable.id, id));
  } catch (err) {
    logger.warn("dualDeleteStaff failed", { id, layer: "store.staff" }, err);
  }
}
async function dualWriteShift(s: Shift): Promise<void> {
  const db = await getDomainDb();
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
  const db = await getDomainDb();
  if (!db) return;
  try {
    await ensureShiftsTable();
    await db.delete(shiftsTable).where(eq(shiftsTable.id, id));
  } catch (err) {
    logger.warn("dualDeleteShift failed", { id, layer: "store.shifts" }, err);
  }
}
async function dualWriteTimePunch(p: TimePunch): Promise<void> {
  const db = await getDomainDb();
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
  const db = await getDomainDb();
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
      userId: input.userId,
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
  const db = await getDomainDb();
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

/**
 * Bulk-append pre-built shifts in ONE locked write — the simulation seeder lays
 * down a recurring weekly rota across a multi-week window, so a flat saveShift
 * loop would pay the lock + O(N) blob rewrite per shift. Mirrors
 * bulkAppendOrders: only called while a test mode is active (getDomainDb() is
 * null then, so the kv path runs); the DB branch mirrors saveShift's dual-write.
 */
export async function bulkAppendShifts(shifts: Shift[]): Promise<void> {
  if (shifts.length === 0) return;
  const db = await getDomainDb();
  if (db) {
    for (const s of shifts) await dualWriteShift(s);
    return;
  }
  await withLock("shifts.json", async () => {
    const list = await readJSON<Shift[]>("shifts.json", []);
    list.push(...shifts);
    await writeJSON("shifts.json", list);
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
  const db = await getDomainDb();
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

/** Append many punches in ONE locked read-modify-write, mirroring recordTimePunch
 *  per row. The seeder lands dozens of rota punches at once; a per-punch loop was
 *  dozens of sequential round-trips that helped blow the serverless budget. */
export async function bulkAppendTimePunches(
  inputs: (Omit<TimePunch, "id" | "occurredAt"> & { occurredAt?: string })[],
): Promise<void> {
  if (inputs.length === 0) return;
  const stamp = Date.now().toString(36);
  const punches: TimePunch[] = inputs.map((input, i) => ({
    id: `pn-${stamp}-${i}-${Math.random().toString(36).slice(2, 6)}`,
    staffId: input.staffId,
    type: input.type,
    shiftId: input.shiftId,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  }));
  await withLock("time-punches.json", async () => {
    const list = await readJSON<TimePunch[]>("time-punches.json", []);
    list.push(...punches);
    await writeJSON("time-punches.json", list);
  });
  const db = await getDomainDb();
  if (db) for (const p of punches) await dualWriteTimePunch(p);
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

// --- Events & bookings (private bookings, catering, special events + run sheets) ---
// The kv keys stay "truck-events.json" / "truck-routes.json" on purpose: they
// back already-persisted operator data (and the sim namespace), so renaming the
// storage key would orphan it. The feature, types and APIs are "events" /
// "run sheets" everywhere an operator or developer reads them.

export async function getRunSheets(locationSlug?: string): Promise<EventRunSheet[]> {
  const all = await readJSON<EventRunSheet[]>("truck-routes.json", []);
  return locationSlug ? all.filter((r) => r.locationSlug === locationSlug) : all;
}

export async function saveRunSheet(input: Omit<EventRunSheet, "id" | "createdAt"> & { id?: string; createdAt?: string }): Promise<EventRunSheet> {
  return withLock("truck-routes.json", async () => {
    const list = await readJSON<EventRunSheet[]>("truck-routes.json", []);
    const route: EventRunSheet = {
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

export async function deleteRunSheet(id: string): Promise<boolean> {
  return withLock("truck-routes.json", async () => {
    const list = await readJSON<EventRunSheet[]>("truck-routes.json", []);
    const filtered = list.filter((r) => r.id !== id);
    if (filtered.length === list.length) return false;
    await writeJSON("truck-routes.json", filtered);
    return true;
  });
}

export async function getEvents(filters?: {
  locationSlug?: string;
  from?: string;
  to?: string;
}): Promise<BookingEvent[]> {
  const all = await readJSON<BookingEvent[]>("truck-events.json", []);
  let list = all;
  if (filters?.locationSlug) list = list.filter((e) => e.locationSlug === filters.locationSlug);
  if (filters?.from) list = list.filter((e) => e.date >= filters.from!);
  if (filters?.to) list = list.filter((e) => e.date <= filters.to!);
  return list.slice().sort((a, b) => b.date.localeCompare(a.date));
}

export async function saveEvent(input: Omit<BookingEvent, "id" | "createdAt"> & { id?: string; createdAt?: string }): Promise<BookingEvent> {
  return withLock("truck-events.json", async () => {
    const list = await readJSON<BookingEvent[]>("truck-events.json", []);
    const event: BookingEvent = {
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

export async function deleteEvent(id: string): Promise<boolean> {
  return withLock("truck-events.json", async () => {
    const list = await readJSON<BookingEvent[]>("truck-events.json", []);
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
  const db = await getDomainDb();
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
  const db = await getDomainDb();
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

/**
 * Delete audit-log entries — backs the owner-only purge in /admin/audit-log.
 * Either wipes the whole trail (`{ all: true }`) or removes a specific set of
 * ids (`{ ids }`), which covers the UI's "delete all / filtered / selected"
 * actions (filtered + selected both resolve to a concrete id list on the
 * client). Mirrors the dual store: when a DB is configured the normalized
 * audit_log table is authoritative for the returned count, otherwise the
 * kv_store copy is. Returns the number of entries removed.
 */
export async function deleteAuditLog(
  selector: { all: true } | { ids: string[] },
): Promise<number> {
  const ids = "ids" in selector ? Array.from(new Set(selector.ids)) : null;
  if (ids && ids.length === 0) return 0;

  let kvDeleted = 0;
  await withLock("audit-log.json", async () => {
    const list = await readJSON<AuditLogEntry[]>("audit-log.json", []);
    if (ids) {
      const idSet = new Set(ids);
      const next = list.filter((e) => !idSet.has(e.id));
      kvDeleted = list.length - next.length;
      await writeJSON("audit-log.json", next);
    } else {
      kvDeleted = list.length;
      await writeJSON("audit-log.json", []);
    }
  });

  const db = await getDomainDb();
  if (db) {
    try {
      await ensureAuditLogTable();
      if (ids) {
        const rows = await db
          .delete(auditLogTable)
          .where(inArray(auditLogTable.id, ids))
          .returning({ id: auditLogTable.id });
        return rows.length;
      }
      // Full purge: count first, then delete without .returning(). The
      // audit_log table has unlimited retention, so materializing every
      // deleted id just to count them risks a memory spike / OOM.
      const countRows = await db
        .select({ c: drizzleSql<number>`count(*)` })
        .from(auditLogTable);
      await db.delete(auditLogTable);
      return Number(countRows[0]?.c ?? 0);
    } catch (err) {
      logger.warn(
        "deleteAuditLog DB delete failed; kv_store copy was cleared",
        { layer: "store.audit_log" },
        err,
      );
    }
  }
  return kvDeleted;
}

/**
 * Start-of-today (Warsaw local midnight) as a UTC ISO string. Used to scope
 * the per-shift comp cap to "today". Correct within a DST period; the once-a-year
 * DST-change day can be off by an hour, which is immaterial for a daily reset.
 */
function startOfWarsawDayIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Warsaw",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(now);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value])) as Record<string, string>;
  const wallNow = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const offsetMs = wallNow - Math.floor(now.getTime() / 1000) * 1000;
  const wallMidnight = Date.UTC(+p.year, +p.month - 1, +p.day);
  return new Date(wallMidnight - offsetMs).toISOString();
}

const REFUND_AUDIT_ACTIONS = ["orders.refund_full", "orders.refund_partial", "pos.comp"];

/**
 * Sum of one actor's `manager_comp` refunds at a location since Warsaw midnight.
 * Backs the per-shift comp cap (src/lib/refund-guard.ts). Reads the refund audit
 * entries — which carry `{ refundAmount, reasonCode, locationSlug }` in `after` —
 * so the figure is correct even for comps applied today to older orders (which a
 * createdAt-filtered order scan would miss).
 */
export async function getActorCompTotalToday(
  actor: string,
  locationSlug: string,
): Promise<number> {
  const since = startOfWarsawDayIso();
  const sinceTime = new Date(since).getTime();
  const sumComps = (entries: AuditLogEntry[]): number => {
    let total = 0;
    for (const e of entries) {
      if (e.actor !== actor) continue;
      if (!REFUND_AUDIT_ACTIONS.includes(e.action)) continue;
      // occurredAt is an ISO string today, but compare by timestamp so this
      // stays correct if the audit mapper ever hands back a Date.
      if (new Date(e.occurredAt).getTime() < sinceTime) continue;
      const after = e.after as
        | { reasonCode?: string; locationSlug?: string; refundAmount?: number }
        | undefined;
      if (!after || after.reasonCode !== "manager_comp") continue;
      if (after.locationSlug !== locationSlug) continue;
      if (typeof after.refundAmount === "number") total += after.refundAmount;
    }
    return total;
  };
  const db = await getDomainDb();
  if (db) {
    try {
      await ensureAuditLogTable();
      const rows = await db
        .select()
        .from(auditLogTable)
        .where(
          and(
            eq(auditLogTable.actor, actor),
            inArray(auditLogTable.action, REFUND_AUDIT_ACTIONS),
            gte(auditLogTable.occurredAt, new Date(since)),
          ),
        );
      return sumComps(rows.map(rowToAuditEntry));
    } catch (err) {
      logger.warn(
        "getActorCompTotalToday DB read failed; falling back to kv_store",
        { layer: "store.audit_log" },
        err,
      );
    }
  }
  const all = await readJSON<AuditLogEntry[]>("audit-log.json", []);
  return sumComps(all);
}

// --- Admin users ---

export async function getAdminUsers(): Promise<AdminUser[]> {
  const now = Date.now();
  if (adminUsersCache && now - adminUsersCache.at < ADMIN_USERS_TTL_MS) {
    // Hand back a shallow copy so a caller that sorts/splices the list in place
    // can't poison the cached reference.
    return [...adminUsersCache.data];
  }
  const data = await readJSON<AdminUser[]>(ADMIN_USERS_KEY, []);
  adminUsersCache = { data, at: now };
  return [...data];
}

export async function saveAdminUser(
  input: Omit<AdminUser, "id" | "createdAt" | "permissions" | "locationSlugs"> & {
    id?: string;
    createdAt?: string;
    /**
     * Granular permission grant. Three cases, mirroring the totp pattern:
     *  - an array → set this exact custom grant (authoritative for the user);
     *  - `null`   → clear any custom grant so the user falls back to role
     *               defaults;
     *  - `undefined` (omitted) → leave whatever is already stored untouched.
     */
    permissions?: string[] | null;
    /**
     * Multi-location scope. Same three-case semantics as permissions: an array
     * sets the exact set (and clears the legacy single field), `null` clears it,
     * `undefined` leaves the stored value untouched (so a partial save — e.g.
     * the permission matrix — doesn't wipe a manager's locations).
     */
    locationSlugs?: string[] | null;
    /** Link to a roster row (set when an account is provisioned at hire). */
    staffId?: string;
  },
): Promise<AdminUser> {
  return withLock("admin-users.json", async () => {
    const list = await readJSON<AdminUser[]>("admin-users.json", []);
    const id = input.id || `usr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const i = list.findIndex((u) => u.id === id);
    const existing = i >= 0 ? list[i] : undefined;
    const user: AdminUser = {
      // Spread the existing row first so security fields the upsert form
      // doesn't manage (totpSecret / totpEnabled) survive an edit instead of
      // being silently wiped on every save.
      ...(existing ?? {}),
      id,
      name: input.name,
      email: input.email,
      role: input.role,
      status: input.status,
      locationSlug: input.locationSlug,
      notes: input.notes,
      createdAt: input.createdAt ?? existing?.createdAt ?? new Date().toISOString(),
    };
    if (input.staffId !== undefined) user.staffId = input.staffId;
    if (input.permissions !== undefined) {
      if (input.permissions === null) delete user.permissions;
      else user.permissions = input.permissions;
    }
    if (input.locationSlugs !== undefined) {
      if (input.locationSlugs === null || input.locationSlugs.length === 0) {
        delete user.locationSlugs;
      } else {
        user.locationSlugs = input.locationSlugs;
        // The array is canonical — drop the legacy single field so the two
        // can't disagree.
        delete user.locationSlug;
      }
    }
    if (i >= 0) list[i] = user;
    else list.push(user);
    await writeJSON("admin-users.json", list);
    return user;
  });
}

/** Reads a single admin user by id (or undefined). */
export async function getAdminUserById(id: string): Promise<AdminUser | undefined> {
  const list = await getAdminUsers();
  return list.find((u) => u.id === id);
}

/**
 * Updates only the TOTP fields on an admin user (enrollment + enable/disable).
 * Returns the updated row, or null when the id isn't found.
 */
export async function updateAdminUserTotp(
  id: string,
  fields: { totpSecret?: string | null; totpEnabled?: boolean },
): Promise<AdminUser | null> {
  return withLock("admin-users.json", async () => {
    const list = await readJSON<AdminUser[]>("admin-users.json", []);
    const i = list.findIndex((u) => u.id === id);
    if (i < 0) return null;
    const next: AdminUser = { ...list[i] };
    if ("totpSecret" in fields) {
      if (fields.totpSecret) next.totpSecret = fields.totpSecret;
      else delete next.totpSecret;
    }
    if ("totpEnabled" in fields) next.totpEnabled = fields.totpEnabled;
    list[i] = next;
    await writeJSON("admin-users.json", list);
    return next;
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

/** Case-insensitive lookup of a login account by email (any status). */
export async function getAdminUserByEmail(
  email: string,
): Promise<AdminUser | undefined> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return undefined;
  const list = await getAdminUsers();
  return list.find((u) => u.email?.toLowerCase() === normalized);
}

/**
 * Sets (or clears) the per-user password and/or PIN. `undefined` leaves a
 * credential untouched; `null` clears it; a string is hashed and stored.
 * Returns the updated row or null when the id is unknown. Hashing happens here
 * so a plaintext secret never lands in a JSON column.
 */
export async function setAdminUserCredentials(
  id: string,
  creds: { plain?: string | null; pin?: string | null },
): Promise<AdminUser | null> {
  return withLock("admin-users.json", async () => {
    const list = await readJSON<AdminUser[]>("admin-users.json", []);
    const i = list.findIndex((u) => u.id === id);
    if (i < 0) return null;
    const next: AdminUser = { ...list[i] };
    if (creds.plain !== undefined) {
      if (creds.plain === null) delete next.passwordHash;
      else next.passwordHash = hashPassword(creds.plain);
    }
    if (creds.pin !== undefined) {
      if (creds.pin === null) delete next.pinHash;
      else next.pinHash = hashPin(creds.pin);
    }
    list[i] = next;
    await writeJSON("admin-users.json", list);
    return next;
  });
}

/** Sets an account's status (active/disabled). Returns the row or null. */
export async function setAdminUserStatus(
  id: string,
  status: AdminUser["status"],
): Promise<AdminUser | null> {
  return withLock("admin-users.json", async () => {
    const list = await readJSON<AdminUser[]>("admin-users.json", []);
    const i = list.findIndex((u) => u.id === id);
    if (i < 0) return null;
    if (list[i].status === status) return list[i];
    list[i] = { ...list[i], status };
    await writeJSON("admin-users.json", list);
    return list[i];
  });
}

/** Finds the login account linked to a roster row, if any. */
export async function getAdminUserByStaffId(
  staffId: string,
): Promise<AdminUser | undefined> {
  const list = await getAdminUsers();
  return list.find((u) => u.staffId === staffId);
}

// --- WebAuthn (passkey / security key) -------------------------------------

/** Stores the transient enrollment challenge (or clears it with null). */
export async function setAdminUserWebauthnChallenge(
  id: string,
  challenge: string | null,
): Promise<void> {
  await withLock("admin-users.json", async () => {
    const list = await readJSON<AdminUser[]>("admin-users.json", []);
    const i = list.findIndex((u) => u.id === id);
    if (i < 0) return;
    const next = { ...list[i] };
    if (challenge === null) delete next.currentWebauthnChallenge;
    else next.currentWebauthnChallenge = challenge;
    list[i] = next;
    await writeJSON("admin-users.json", list);
  });
}

/** Appends a verified credential and clears the enrollment challenge. */
export async function addAdminUserWebauthnCredential(
  id: string,
  cred: WebAuthnCredential,
): Promise<AdminUser | null> {
  return withLock("admin-users.json", async () => {
    const list = await readJSON<AdminUser[]>("admin-users.json", []);
    const i = list.findIndex((u) => u.id === id);
    if (i < 0) return null;
    const next: AdminUser = { ...list[i] };
    const existing = (next.webauthnCredentials ?? []).filter((c) => c.id !== cred.id);
    next.webauthnCredentials = [...existing, cred];
    delete next.currentWebauthnChallenge;
    list[i] = next;
    await writeJSON("admin-users.json", list);
    return next;
  });
}

/** Removes a registered credential by its base64url id. */
export async function removeAdminUserWebauthnCredential(
  id: string,
  credentialId: string,
): Promise<AdminUser | null> {
  return withLock("admin-users.json", async () => {
    const list = await readJSON<AdminUser[]>("admin-users.json", []);
    const i = list.findIndex((u) => u.id === id);
    if (i < 0) return null;
    const next: AdminUser = { ...list[i] };
    next.webauthnCredentials = (next.webauthnCredentials ?? []).filter(
      (c) => c.id !== credentialId,
    );
    list[i] = next;
    await writeJSON("admin-users.json", list);
    return next;
  });
}

/** Bumps a credential's signature counter after a successful authentication. */
export async function updateWebauthnCredentialCounter(
  id: string,
  credentialId: string,
  counter: number,
): Promise<void> {
  await withLock("admin-users.json", async () => {
    const list = await readJSON<AdminUser[]>("admin-users.json", []);
    const i = list.findIndex((u) => u.id === id);
    if (i < 0) return;
    const next: AdminUser = { ...list[i] };
    next.webauthnCredentials = (next.webauthnCredentials ?? []).map((c) =>
      c.id === credentialId ? { ...c, counter } : c,
    );
    list[i] = next;
    await writeJSON("admin-users.json", list);
  });
}

/**
 * True when another active account at `locationSlug` already answers to `pin`.
 * PIN login is location-scoped, so collisions only matter within one site —
 * we reject a duplicate at set-time so the terminal never has to disambiguate.
 */
export async function pinExistsAtLocation(
  locationSlug: string,
  pin: string,
  exceptId?: string,
): Promise<boolean> {
  const list = await getAdminUsers();
  return list.some(
    (u) =>
      u.id !== exceptId &&
      u.status === "active" &&
      u.pinHash != null &&
      (u.role === "owner" || userCoversLocation(u, locationSlug)) &&
      verifyPin(pin, u.pinHash),
  );
}

/**
 * True when ANY active account answers to `pin`, regardless of location. Used
 * when setting a PIN on an unscoped account (owner / no locationSlug): such a
 * PIN matches at every terminal (see findAdminUserByPin), so it must be globally
 * unique — a per-location check would skip it entirely and let it collide.
 */
export async function pinExistsAnywhere(
  pin: string,
  exceptId?: string,
): Promise<boolean> {
  const list = await getAdminUsers();
  return list.some(
    (u) =>
      u.id !== exceptId &&
      u.status === "active" &&
      u.pinHash != null &&
      verifyPin(pin, u.pinHash),
  );
}

/**
 * Resolves a terminal PIN to its account, scoped to one location. Returns the
 * active account whose PIN matches, or null. Owners (unscoped) are included so
 * an operator can unlock any terminal with their own PIN.
 */
export async function findAdminUserByPin(
  locationSlug: string,
  pin: string,
): Promise<AdminUser | null> {
  const list = await getAdminUsers();
  for (const u of list) {
    if (u.status !== "active" || !u.pinHash) continue;
    // Owners + accounts covering this location (incl. unscoped = all) match.
    if (u.role !== "owner" && !userCoversLocation(u, locationSlug)) continue;
    if (verifyPin(pin, u.pinHash)) return u;
  }
  return null;
}

/**
 * Hires-with-login: provisions (or updates) the login account linked to a
 * roster row, and writes the link on both sides. The access tier is derived
 * from the job title (`staffRoleToAdminRole`) so a pizzaiolo lands on the KDS
 * and a waiter on the POS — the caller never picks the tier directly. Returns
 * the account; the staff route enforces who may call this and at which site.
 */
export async function provisionStaffLogin(args: {
  staff: StaffMember;
  email?: string;
  plain?: string;
  pin?: string;
}): Promise<AdminUser> {
  const { staff } = args;
  const role = staffRoleToAdminRole(staff.role);
  // Reuse the existing account when the roster row is already linked.
  const existingId = staff.userId;
  const account = await saveAdminUser({
    id: existingId,
    name: staff.name,
    email: args.email || staff.email,
    role,
    status: staff.status === "active" ? "active" : "disabled",
    locationSlug: staff.locationSlug,
    staffId: staff.id,
  });
  if (args.plain || args.pin) {
    await setAdminUserCredentials(account.id, {
      plain: args.plain,
      pin: args.pin,
    });
  }
  // Backlink the roster row to the account (best-effort; AdminUser.staffId is
  // the authoritative link since admin-users.json always round-trips it).
  if (staff.userId !== account.id) {
    await saveStaff({ ...staff, userId: account.id });
  }
  return account;
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

// --- Concierge / agent-call telemetry ---------------------------------------
//
// Every hit on the public agent endpoint (`/api/agent/[capability]`) is logged
// here so the Concierge MCP inspector can show REAL usage (requests today · avg
// latency · deflection · errors · per-capability load) instead of guessed
// numbers (Rule #1). Bounded ring buffer — the inspector only reads "today".
export interface AgentCall {
  capability: string;
  at: string;
  latencyMs: number;
  ok: boolean;
}
const AGENT_CALLS_MAX = 5000;
export async function logAgentCall(entry: { capability: string; latencyMs: number; ok: boolean; at?: string }): Promise<void> {
  await withLock("agent-calls.json", async () => {
    const list = await readJSON<AgentCall[]>("agent-calls.json", []);
    list.push({ capability: entry.capability, latencyMs: Math.max(0, Math.round(entry.latencyMs)), ok: entry.ok, at: entry.at ?? new Date().toISOString() });
    await writeJSON("agent-calls.json", list.length > AGENT_CALLS_MAX ? list.slice(list.length - AGENT_CALLS_MAX) : list);
  });
}
export interface AgentCallStats {
  requestsToday: number;
  avgLatencyMs: number;
  errors: number;
  errorRatePct: number;
  deflectionPct: number; // share of calls served OK without an error → self-serve success
  byCapability: Record<string, { count: number; avgLatencyMs: number }>;
}
export async function getAgentCallStats(): Promise<AgentCallStats> {
  const list = await readJSON<AgentCall[]>("agent-calls.json", []);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const today = list.filter((c) => Date.parse(c.at) >= startOfDay.getTime());
  const n = today.length;
  const errors = today.filter((c) => !c.ok).length;
  const avg = n ? Math.round(today.reduce((s, c) => s + c.latencyMs, 0) / n) : 0;
  const byCapability: Record<string, { count: number; avgLatencyMs: number }> = {};
  for (const c of today) {
    const b = (byCapability[c.capability] ??= { count: 0, avgLatencyMs: 0 });
    b.avgLatencyMs = Math.round((b.avgLatencyMs * b.count + c.latencyMs) / (b.count + 1));
    b.count += 1;
  }
  return {
    requestsToday: n,
    avgLatencyMs: avg,
    errors,
    errorRatePct: n ? Math.round((errors / n) * 100) : 0,
    deflectionPct: n ? Math.round(((n - errors) / n) * 100) : 0,
    byCapability,
  };
}

// --- Agent HQ: editable agent configs + timeline -----------------------------
//
// Agent HQ turns the nine hardcoded Boardroom personas into EDITABLE agents.
// The store keeps only the operator's overrides (a per-agent patch over the
// seed defaults in src/lib/ai/boardroom/agent-config.ts) so an un-edited agent
// always tracks the latest seed, and a saved override survives a seed change.
// The runtime (agent loop + meetings) reads the resolved config and runs on the
// generated LIVE SYSTEM PROMPT — edits take effect immediately (Rule #8).

type AgentConfigOverrides = Record<string, AgentConfigPatch>;

export async function getAgentConfigOverrides(): Promise<AgentConfigOverrides> {
  return readJSON<AgentConfigOverrides>("agent-configs.json", {});
}

/** One agent, defaults ⊕ saved override, fully resolved. */
export async function getResolvedAgentConfig(id: BoardroomPersonaId): Promise<AgentConfig> {
  const overrides = await getAgentConfigOverrides();
  return mergeAgentConfig(id, overrides[id]);
}

/** Every agent, resolved, in display order. */
export async function getResolvedAgentConfigs(): Promise<AgentConfig[]> {
  const overrides = await getAgentConfigOverrides();
  return ALL_BOARDROOM_PERSONA_IDS.map((id) => mergeAgentConfig(id, overrides[id]));
}

/**
 * Merge an editor patch into the agent's stored override and return the newly
 * resolved config. Persists immediately (Rule #7) under a lock.
 */
export async function saveAgentConfigOverride(
  id: BoardroomPersonaId,
  patch: AgentConfigPatch,
): Promise<AgentConfig> {
  return withLock("agent-configs.json", async () => {
    const all = await readJSON<AgentConfigOverrides>("agent-configs.json", {});
    all[id] = { ...(all[id] ?? {}), ...patch };
    await writeJSON("agent-configs.json", all);
    return mergeAgentConfig(id, all[id]);
  });
}

/** Drop an agent's override so it tracks the seed defaults again. */
export async function clearAgentConfigOverride(id: BoardroomPersonaId): Promise<AgentConfig> {
  return withLock("agent-configs.json", async () => {
    const all = await readJSON<AgentConfigOverrides>("agent-configs.json", {});
    delete all[id];
    await writeJSON("agent-configs.json", all);
    return mergeAgentConfig(id, undefined);
  });
}

export type AgentEventType = "run" | "edit" | "escalation" | "approval" | "schedule" | "note";

export interface AgentEvent {
  id: string;
  agentId: string;
  type: AgentEventType;
  /** One-line headline for the timeline. */
  summary: string;
  /** Optional longer body (a log excerpt, a diff note). */
  detail?: string;
  /** Spend attributed to this event, in grosze (run events). */
  costGrosze?: number;
  /** For run/schedule events: did the run succeed? Drives the success-rate KPI. */
  ok?: boolean;
  actor: string;
  at: string;
}

const AGENT_EVENTS_MAX = 5000;

export async function appendAgentEvent(
  input: Omit<AgentEvent, "id" | "at"> & { at?: string },
): Promise<AgentEvent> {
  const event: AgentEvent = {
    id: `ae-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    agentId: input.agentId,
    type: input.type,
    summary: input.summary,
    detail: input.detail,
    costGrosze: input.costGrosze,
    ok: input.ok,
    actor: input.actor,
    at: input.at ?? new Date().toISOString(),
  };
  await withLock("agent-events.json", async () => {
    const list = await readJSON<AgentEvent[]>("agent-events.json", []);
    list.push(event);
    const trimmed = list.length > AGENT_EVENTS_MAX ? list.slice(list.length - AGENT_EVENTS_MAX) : list;
    await writeJSON("agent-events.json", trimmed);
  });
  return event;
}

/** Append many agent events in ONE locked read-modify-write, mirroring
 *  appendAgentEvent per row. The seeder lays down ~3 weeks of AI activity; a
 *  per-event loop was ~23 sequential round-trips inside the deep seed. */
export async function bulkAppendAgentEvents(
  inputs: (Omit<AgentEvent, "id" | "at"> & { at?: string })[],
): Promise<void> {
  if (inputs.length === 0) return;
  const stamp = Date.now().toString(36);
  const events: AgentEvent[] = inputs.map((input, i) => ({
    id: `ae-${stamp}-${i}-${Math.random().toString(36).slice(2, 6)}`,
    agentId: input.agentId,
    type: input.type,
    summary: input.summary,
    detail: input.detail,
    costGrosze: input.costGrosze,
    ok: input.ok,
    actor: input.actor,
    at: input.at ?? new Date().toISOString(),
  }));
  await withLock("agent-events.json", async () => {
    const list = await readJSON<AgentEvent[]>("agent-events.json", []);
    list.push(...events);
    const trimmed = list.length > AGENT_EVENTS_MAX ? list.slice(list.length - AGENT_EVENTS_MAX) : list;
    await writeJSON("agent-events.json", trimmed);
  });
}

export async function listAgentEvents(opts?: { agentId?: string; limit?: number }): Promise<AgentEvent[]> {
  const list = await readJSON<AgentEvent[]>("agent-events.json", []);
  const filtered = opts?.agentId ? list.filter((e) => e.agentId === opts.agentId) : list;
  // Newest first.
  const sorted = filtered.slice().sort((a, b) => b.at.localeCompare(a.at));
  return typeof opts?.limit === "number" ? sorted.slice(0, opts.limit) : sorted;
}

/**
 * Start-of-today and start-of-month as UTC instants, computed in the chain's
 * timezone (Europe/Warsaw) — so "daily reset" for spend tracking + caps happens
 * at Polish midnight regardless of the server's timezone (a UTC server would
 * otherwise reset at 01:00/02:00 local). One offset read covers both.
 */
const CHAIN_TZ = "Europe/Warsaw";
function chainPeriodStarts(): { dayIso: string; monthIso: string } {
  const now = new Date();
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: CHAIN_TZ, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(now).map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  const y = +p.year, mo = +p.month, d = +p.day;
  // Offset (ms) of Warsaw vs UTC at this instant, from the wall-clock parts.
  const offset = Date.UTC(y, mo - 1, d, +p.hour, +p.minute, +p.second) - now.getTime();
  return {
    dayIso: new Date(Date.UTC(y, mo - 1, d, 0, 0, 0) - offset).toISOString(),
    monthIso: new Date(Date.UTC(y, mo - 1, 1, 0, 0, 0) - offset).toISOString(),
  };
}

/** Sum of an agent's run-event spend since Warsaw midnight — drives per-agent caps. */
export async function getAgentDailySpendGrosze(agentId: string): Promise<number> {
  const map = await getAgentDailySpendMap();
  return map[agentId] ?? 0;
}

/** Today's spend per agent in one read — for the overview/roster cards. */
export async function getAgentDailySpendMap(): Promise<Record<string, number>> {
  const sinceIso = chainPeriodStarts().dayIso;
  const list = await readJSON<AgentEvent[]>("agent-events.json", []);
  const out: Record<string, number> = {};
  for (const e of list) {
    if (e.at >= sinceIso && typeof e.costGrosze === "number") {
      out[e.agentId] = (out[e.agentId] ?? 0) + e.costGrosze;
    }
  }
  return out;
}

export interface AgentFleetStats {
  runsToday: number;
  cost7dGrosze: number;
  costMonthGrosze: number;
  spendTodayByAgent: Record<string, number>;
  /** % of runs in the last 7d that succeeded (null when there were none). */
  successRate7d: number | null;
  runs7d: number;
  /** Per-agent run counts (7d) for the activity sparkbars. */
  runsByDay7d: number[];
}

/**
 * One pass over the agent timeline for every fleet metric the Agent HQ command
 * center shows — so the page computes its KPIs from a single read and renders
 * them together (no progressive pop-in).
 */
export async function getAgentFleetStats(): Promise<AgentFleetStats> {
  const now = Date.now();
  const starts = chainPeriodStarts();
  const startToday = Date.parse(starts.dayIso);
  const startMonth = Date.parse(starts.monthIso);
  const weekAgo = now - 7 * 24 * 3600 * 1000;
  const list = await readJSON<AgentEvent[]>("agent-events.json", []);

  let runsToday = 0, cost7d = 0, costMonth = 0, runs7d = 0, ok7d = 0;
  const spendToday: Record<string, number> = {};
  const runsByDay7d = [0, 0, 0, 0, 0, 0, 0]; // index 0 = 6 calendar days ago … 6 = today
  const isRun = (e: AgentEvent) => e.type === "run" || e.type === "schedule";

  for (const e of list) {
    const t = Date.parse(e.at);
    const cost = typeof e.costGrosze === "number" ? e.costGrosze : 0;
    if (t >= startMonth) costMonth += cost;
    if (t >= weekAgo) {
      cost7d += cost;
      if (isRun(e)) {
        runs7d += 1;
        if (e.ok !== false) ok7d += 1;
        // Bucket by Warsaw calendar day (index 6 = today, anchored on startToday).
        const idx = t >= startToday ? 6 : 6 - Math.ceil((startToday - t) / (24 * 3600 * 1000));
        if (idx >= 0 && idx < 7) runsByDay7d[idx] += 1;
      }
    }
    if (t >= startToday) {
      if (isRun(e)) runsToday += 1;
      if (cost) spendToday[e.agentId] = (spendToday[e.agentId] ?? 0) + cost;
    }
  }

  return {
    runsToday,
    cost7dGrosze: cost7d,
    costMonthGrosze: costMonth,
    spendTodayByAgent: spendToday,
    successRate7d: runs7d > 0 ? Math.round((ok7d / runs7d) * 100) : null,
    runs7d,
    runsByDay7d,
  };
}

// --- Agent HQ: operator-assigned work items ---------------------------------
//
// A work item is a task (title + prompt) the operator creates and assigns to an
// agent by dragging it onto them. It flows queued → running → done/failed and
// runs on the assigned agent's live config (see runAgentWorkItem).

export type WorkStatus = "unassigned" | "queued" | "running" | "done" | "failed";

export interface AgentWorkItem {
  id: string;
  title: string;
  prompt: string;
  /** Assigned agent id, or null while it sits in the backlog. */
  agentId: string | null;
  status: WorkStatus;
  createdBy: string;
  createdAt: string;
  assignedAt?: string;
  completedAt?: string;
  costGrosze?: number;
  /** Short result line once the run completes. */
  resultSummary?: string;
}

const WORK_MAX = 300;

export async function listWorkItems(): Promise<AgentWorkItem[]> {
  const list = await readJSON<AgentWorkItem[]>("agent-work.json", []);
  return list.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createWorkItem(input: {
  title: string; prompt: string; agentId?: string | null; createdBy: string;
}): Promise<AgentWorkItem> {
  return withLock("agent-work.json", async () => {
    const list = await readJSON<AgentWorkItem[]>("agent-work.json", []);
    const now = new Date().toISOString();
    const item: AgentWorkItem = {
      id: `wk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      title: input.title,
      prompt: input.prompt,
      agentId: input.agentId ?? null,
      status: input.agentId ? "queued" : "unassigned",
      createdBy: input.createdBy,
      createdAt: now,
      assignedAt: input.agentId ? now : undefined,
    };
    list.push(item);
    const trimmed = list.length > WORK_MAX ? list.slice(list.length - WORK_MAX) : list;
    await writeJSON("agent-work.json", trimmed);
    return item;
  });
}

export async function updateWorkItem(id: string, patch: Partial<AgentWorkItem>): Promise<AgentWorkItem | null> {
  return withLock("agent-work.json", async () => {
    const list = await readJSON<AgentWorkItem[]>("agent-work.json", []);
    const i = list.findIndex((w) => w.id === id);
    if (i < 0) return null;
    const next = { ...list[i], ...patch, id: list[i].id };
    // Assigning (agentId set while unassigned) flips it to queued.
    if (patch.agentId && list[i].status === "unassigned" && !patch.status) {
      next.status = "queued";
      next.assignedAt = new Date().toISOString();
    }
    list[i] = next;
    await writeJSON("agent-work.json", list);
    return next;
  });
}

export async function deleteWorkItem(id: string): Promise<void> {
  await withLock("agent-work.json", async () => {
    const list = await readJSON<AgentWorkItem[]>("agent-work.json", []);
    await writeJSON("agent-work.json", list.filter((w) => w.id !== id));
  });
}

export async function getWorkItem(id: string): Promise<AgentWorkItem | null> {
  const list = await readJSON<AgentWorkItem[]>("agent-work.json", []);
  return list.find((w) => w.id === id) ?? null;
}

// --- Agent HQ: fleet-wide settings ------------------------------------------
//
// Global controls that apply to the whole agent fleet instead of being set per
// agent: the daily AI spend ceiling and whether the daily briefing auto-runs.
// (The active AI model is a separate platform-wide setting — ai-model.json —
// since the gateway uses it everywhere, not just Agent HQ.)

export interface AgentHqSettings {
  /** Fleet-wide daily spend ceiling in grosze; null = use the env/default. */
  dailyBudgetGrosze: number | null;
  /** Whether the daily-briefing cron convenes the board automatically. */
  autoBriefing: boolean;
  /** HH:MM the briefing is expected to fire (display + cron alignment). */
  briefingTime: string;
}

const AGENT_HQ_DEFAULTS: AgentHqSettings = { dailyBudgetGrosze: null, autoBriefing: true, briefingTime: "08:00" };

export async function getAgentHqSettings(): Promise<AgentHqSettings> {
  const saved = await readJSON<Partial<AgentHqSettings>>("agent-hq-settings.json", {});
  return {
    dailyBudgetGrosze:
      saved.dailyBudgetGrosze === null || typeof saved.dailyBudgetGrosze === "number" ? saved.dailyBudgetGrosze ?? null : null,
    autoBriefing: typeof saved.autoBriefing === "boolean" ? saved.autoBriefing : AGENT_HQ_DEFAULTS.autoBriefing,
    briefingTime: typeof saved.briefingTime === "string" && saved.briefingTime ? saved.briefingTime : AGENT_HQ_DEFAULTS.briefingTime,
  };
}

export async function updateAgentHqSettings(patch: Partial<AgentHqSettings>): Promise<AgentHqSettings> {
  return withLock("agent-hq-settings.json", async () => {
    const current = await getAgentHqSettings();
    const next: AgentHqSettings = {
      dailyBudgetGrosze:
        patch.dailyBudgetGrosze === null || typeof patch.dailyBudgetGrosze === "number" ? patch.dailyBudgetGrosze : current.dailyBudgetGrosze,
      autoBriefing: typeof patch.autoBriefing === "boolean" ? patch.autoBriefing : current.autoBriefing,
      briefingTime: typeof patch.briefingTime === "string" && patch.briefingTime ? patch.briefingTime : current.briefingTime,
    };
    await writeJSON("agent-hq-settings.json", next);
    return next;
  });
}

/** The daily budget the runtime enforces: the saved override, else env/default. */
export async function getEffectiveDailyBudgetGrosze(): Promise<number> {
  const settings = await getAgentHqSettings();
  return settings.dailyBudgetGrosze ?? getDailyBudgetGrosze();
}

/**
 * Today's TOTAL AI spend — the single source of truth for the daily-budget gate
 * and the Settings spend bar. Sums two ledgers without double-counting:
 *  - ai_messages (chat: the Ops Agent + persona chats) since Warsaw midnight, and
 *  - agent-events run/schedule rows for meetings / scheduled runs / work, which
 *    bypass ai_messages (their actors are meeting:/schedule:/work:; persona chat
 *    events use actor claude: and are already in ai_messages, so are skipped).
 */
export async function getTodayAiSpendGrosze(): Promise<number> {
  const sinceIso = chainPeriodStarts().dayIso;
  const [chatGrosze, events] = await Promise.all([
    getDailyAiSpendGrosze(sinceIso),
    readJSON<AgentEvent[]>("agent-events.json", []),
  ]);
  return chatGrosze + offLedgerAiSpend(events, sinceIso);
}

/** Warsaw-local midnight (as a UTC instant ISO) for the calendar day that the
 *  instant `at` falls in — DST-correct, mirrors chainPeriodStarts(). */
function chainMidnightIso(at: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: CHAIN_TZ, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(at).map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  const y = +p.year, mo = +p.month, d = +p.day;
  const offset = Date.UTC(y, mo - 1, d, +p.hour, +p.minute, +p.second) - at.getTime();
  return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0) - offset).toISOString();
}

/** Off-ledger AI spend (meeting/schedule/work agent-events) within [from, to).
 *  Defensive against malformed rows: a missing `at`/`actor` is skipped rather
 *  than throwing or slipping past the window guard. */
function offLedgerAiSpend(events: AgentEvent[], fromIso: string, toIso?: string): number {
  let total = 0;
  for (const e of events) {
    if (typeof e.costGrosze !== "number" || typeof e.at !== "string" || e.at < fromIso || (toIso && e.at >= toIso)) continue;
    if (typeof e.actor === "string" && (e.actor.startsWith("meeting:") || e.actor.startsWith("schedule:") || e.actor.startsWith("work:"))) {
      total += e.costGrosze;
    }
  }
  return total;
}

/**
 * AI spend for the Morning Brief — a closed-day report, so it never includes
 * the partial current day: yesterday's spend, the trailing 30 complete days,
 * and the day-over-day % change (yesterday vs the day before). Buckets the same
 * two ledgers as getTodayAiSpendGrosze (ai_messages chat + off-ledger
 * meeting/schedule/work agent-events) by Warsaw midnight (DST-correct).
 */
export async function getAiSpendBriefGrosze(): Promise<{
  yesterdayGrosze: number;
  last30Grosze: number;
  changePct: number | null;
}> {
  const now = new Date();
  const todayStartIso = chainMidnightIso(now);
  // Step back 12h from each midnight to land safely inside the prior day (DST-proof).
  const yestStartIso = chainMidnightIso(new Date(Date.parse(todayStartIso) - 12 * 3600_000));
  const prevStartIso = chainMidnightIso(new Date(Date.parse(yestStartIso) - 12 * 3600_000));
  // 30 complete days ending at yesterday's close (a one-hour DST wobble at the
  // far boundary is immaterial to a month-long sum).
  const thirtyStartIso = new Date(Date.parse(todayStartIso) - 30 * 86_400_000).toISOString();

  const [chatYest, chatPrev, chat30, events] = await Promise.all([
    getDailyAiSpendGrosze(yestStartIso, todayStartIso),
    getDailyAiSpendGrosze(prevStartIso, yestStartIso),
    getDailyAiSpendGrosze(thirtyStartIso, todayStartIso),
    readJSON<AgentEvent[]>("agent-events.json", []),
  ]);

  const yesterdayGrosze = chatYest + offLedgerAiSpend(events, yestStartIso, todayStartIso);
  const prevDayGrosze = chatPrev + offLedgerAiSpend(events, prevStartIso, yestStartIso);
  const last30Grosze = chat30 + offLedgerAiSpend(events, thirtyStartIso, todayStartIso);

  return {
    yesterdayGrosze,
    last30Grosze,
    changePct: prevDayGrosze > 0 ? Math.round(((yesterdayGrosze - prevDayGrosze) / prevDayGrosze) * 1000) / 10 : null,
  };
}

// --- Agent HQ: per-agent scorecard stats + KPI actuals ----------------------

export interface AgentScorecard {
  runs7d: number;
  cost7dGrosze: number;
  successRate7d: number | null;
  lastRunAt: string | null;
}

/** Per-agent run/cost/last-run/success over 7d, in one pass over the timeline. */
export async function getAgentScorecardStats(): Promise<Record<string, AgentScorecard>> {
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const list = await readJSON<AgentEvent[]>("agent-events.json", []);
  const acc: Record<string, { runs: number; ok: number; cost: number; last: string | null }> = {};
  const isRun = (e: AgentEvent) => e.type === "run" || e.type === "schedule";
  for (const e of list) {
    const a = (acc[e.agentId] ??= { runs: 0, ok: 0, cost: 0, last: null });
    if (isRun(e)) { if (!a.last || e.at > a.last) a.last = e.at; }
    if (Date.parse(e.at) >= weekAgo) {
      if (typeof e.costGrosze === "number") a.cost += e.costGrosze;
      if (isRun(e)) { a.runs += 1; if (e.ok !== false) a.ok += 1; }
    }
  }
  const out: Record<string, AgentScorecard> = {};
  for (const [id, a] of Object.entries(acc)) {
    out[id] = { runs7d: a.runs, cost7dGrosze: a.cost, lastRunAt: a.last, successRate7d: a.runs > 0 ? Math.round((a.ok / a.runs) * 100) : null };
  }
  return out;
}

export interface AgentKpiActual {
  id: string;
  agentId: string;
  /** The KPI/target text this actual is logged against. */
  kpi: string;
  value: string;
  at: string;
  by: string;
}

const KPI_ACTUALS_MAX = 1000;

export async function logKpiActual(input: { agentId: string; kpi: string; value: string; by: string }): Promise<AgentKpiActual> {
  const row: AgentKpiActual = {
    id: `ka-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    agentId: input.agentId, kpi: input.kpi, value: input.value, by: input.by, at: new Date().toISOString(),
  };
  await withLock("agent-kpi-actuals.json", async () => {
    const list = await readJSON<AgentKpiActual[]>("agent-kpi-actuals.json", []);
    list.push(row);
    const trimmed = list.length > KPI_ACTUALS_MAX ? list.slice(list.length - KPI_ACTUALS_MAX) : list;
    await writeJSON("agent-kpi-actuals.json", trimmed);
  });
  return row;
}

/** Latest actual per (agentId, kpi) — agentId → kpi text → {value, at, by}. */
export async function getLatestKpiActuals(): Promise<Record<string, Record<string, { value: string; at: string; by: string }>>> {
  const list = await readJSON<AgentKpiActual[]>("agent-kpi-actuals.json", []);
  const out: Record<string, Record<string, { value: string; at: string; by: string }>> = {};
  for (const r of list) {
    const byKpi = (out[r.agentId] ??= {});
    const prev = byKpi[r.kpi];
    if (!prev || r.at > prev.at) byKpi[r.kpi] = { value: r.value, at: r.at, by: r.by };
  }
  return out;
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
    session.closingCountGrosze = Math.max(0, Math.round(closingCountGrosze));
    session.closedAt = new Date().toISOString();
    session.closedBy = closedBy;
    session.varianceGrosze = computeCashVariance(session, session.closingCountGrosze);
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
function computePromisedReadyAt(order: Order, firedAt: Date, prepOpts?: PrepOpts): Date {
  if (order.slotDate && order.slotTime) {
    const slotInstant = new Date(`${order.slotDate}T${order.slotTime}:00.000+02:00`);
    // Only honour a slot-based promise when it's actually in the FUTURE at fire
    // time. A walk-in POS/coursed check carries its rung-up time as slotTime (in
    // server-local, which may not be the +02:00 the string assumes), so a fired
    // check would otherwise "promise" a time already in the past → a KDS ticket
    // that reads hours late the instant it's fired. When the slot has passed (or
    // isn't a real future reservation) we cook from now: firedAt + prep.
    if (Number.isFinite(slotInstant.getTime()) && slotInstant.getTime() > firedAt.getTime()) {
      return slotInstant;
    }
  }
  // Shared with the cart's pre-pay "Ready by" quote so the time we promise the
  // customer before they pay matches the SLA the KDS holds the line to. The
  // prep floor + expo buffer are operator-set (admin → Operations).
  return estimateReadyAt(order.items, firedAt, prepOpts);
}

/** Resolve the operator's kitchen prep SLA (admin → Operations) for the ETA math. */
async function prepOptsFromSettings(): Promise<PrepOpts> {
  const k = (await getSettings()).operations?.kitchen;
  return {
    minPrepMinutes: k?.minPrepMinutes ?? DEFAULT_OPERATIONS.kitchen.minPrepMinutes,
    expoBufferMinutes: k?.expoBufferMinutes ?? DEFAULT_OPERATIONS.kitchen.expoBufferMinutes,
  };
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
// Simulation KDS: the kds_tickets table is DB-only, so in simulation tickets
// live in a kv blob (resolveKey namespaces this to `sim:kds-tickets.json`).
// These helpers are only ever reached when getDomainDb() is null (sim active).
async function readSimKdsTickets(): Promise<KdsTicket[]> {
  return readJSON<KdsTicket[]>("kds-tickets.json", []);
}
async function writeSimKdsTickets(list: KdsTicket[]): Promise<void> {
  await writeJSON("kds-tickets.json", list);
}

export async function fireKdsTickets(order: Order): Promise<KdsTicket[]> {
  const db = await getDomainDb();
  const prepOpts = await prepOptsFromSettings();
  if (!db) {
    // Simulation: same fanout/stagger logic, persisted to the kv ticket blob.
    try {
      const fanout = await resolveOrderStationFanout(order);
      const now = new Date();
      const promisedReadyAt = computePromisedReadyAt(order, now, prepOpts);
      const orderMaxPrep = Math.max(0, ...order.items.map((i) => i.menuItem.prepTimeMinutes ?? 0));
      const tickets: KdsTicket[] = [];
      for (const [stationId, items] of fanout) {
        const stationMaxPrep = Math.max(0, ...items.map((i) => i.menuItem.prepTimeMinutes ?? 0));
        const stagger = Math.max(0, orderMaxPrep - stationMaxPrep);
        void stagger; // fireAt staggering is a DB-only refinement; sim fires immediately
        tickets.push({
          id: `tkt-${order.id}-${stationId || "default"}`,
          orderId: order.id,
          stationId: stationId || "ungrouped",
          locationSlug: order.locationSlug,
          status: "fired",
          items: items.map((i) => ({ menuItemId: i.menuItem.id, name: i.menuItem.name, quantity: i.quantity, notes: i.notes, allergens: i.menuItem.allergens })),
          firedAt: now.toISOString(),
          promisedReadyAt: promisedReadyAt.toISOString(),
        });
      }
      const all = await readSimKdsTickets();
      const ids = new Set(tickets.map((t) => t.id));
      await writeSimKdsTickets([...all.filter((t) => !ids.has(t.id)), ...tickets]);
      await updateOrder(order.id, { estimatedReadyAt: promisedReadyAt.toISOString() });
      return tickets;
    } catch (err) {
      logger.warn("fireKdsTickets (sim) failed", { orderId: order.id, layer: "store.kds" }, err);
      return [];
    }
  }
  try {
    await ensureKdsTables();
    const fanout = await resolveOrderStationFanout(order);
    const tickets: KdsTicket[] = [];
    const now = new Date();
    const promisedReadyAt = computePromisedReadyAt(order, now, prepOpts);
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

/**
 * Cancel a dish that's already been fired — record it on the order's
 * `voidedItems` so the KDS board can show it struck-through ("pulled"), instead
 * of the item silently disappearing when the POS removes it from the check.
 * Appends (never overwrites) so several cancels on one order accumulate.
 */
export async function voidKitchenItem(
  orderId: string,
  input: { name: string; quantity: number; reason?: string },
): Promise<Order | null> {
  const order = await getOrderById(orderId);
  if (!order) return null;
  const entry = {
    name: input.name,
    quantity: Math.max(1, Math.round(input.quantity || 1)),
    reason: input.reason?.slice(0, 60) || undefined,
    at: new Date().toISOString(),
  };
  const voidedItems = [...(order.voidedItems ?? []), entry].slice(-20);
  // Drop the cancelled quantity from the active make-list too, so the board
  // shows the dish struck (voided) and NOT still "to make" — matched by name.
  let remaining = entry.quantity;
  const items = order.items.map((ci) => ({ ...ci }));
  for (let i = items.length - 1; i >= 0 && remaining > 0; i--) {
    if (items[i].menuItem?.name === entry.name) {
      const dec = Math.min(remaining, items[i].quantity);
      items[i].quantity -= dec;
      remaining -= dec;
    }
  }
  const pruned = items.filter((ci) => ci.quantity > 0);
  return (await updateOrder(orderId, { voidedItems, items: pruned })) ?? null;
}

/** Mark a ticket as ready (m2_3). Sets ready_at; returns the updated ticket. */
export async function markTicketReady(ticketId: string): Promise<KdsTicket | null> {
  const db = await getDomainDb();
  if (!db) {
    const all = await readSimKdsTickets();
    const i = all.findIndex((t) => t.id === ticketId);
    if (i < 0) return null;
    all[i] = { ...all[i], status: "ready", readyAt: new Date().toISOString() };
    await writeSimKdsTickets(all);
    return all[i];
  }
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
  const db = await getDomainDb();
  if (!db) {
    const all = await readSimKdsTickets();
    const i = all.findIndex((t) => t.id === ticketId);
    if (i < 0) return null;
    all[i] = { ...all[i], status: "bumped", bumpedAt: new Date().toISOString() };
    await writeSimKdsTickets(all);
    const orderId = all[i].orderId;
    if (!all.some((t) => t.orderId === orderId && t.status === "fired")) {
      await updateOrderStatus(orderId, "ready");
    }
    return all[i];
  }
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
  const db = await getDomainDb();
  if (!db) {
    const all = await readSimKdsTickets();
    return all
      .filter((t) => t.locationSlug === locationSlug)
      .filter((t) => !opts?.stationId || t.stationId === opts.stationId)
      .filter((t) => opts?.includeBumped || ["fired", "ready", "recalled"].includes(t.status))
      .sort((a, b) => a.firedAt.localeCompare(b.firedAt));
  }
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

export interface KdsServiceHistory {
  /** Tickets that finished on or before their promised-ready time. */
  onTime: number;
  /** Total finished tickets with a promise to measure against. */
  total: number;
  /** Promise-accuracy %, rounded. Null when there's nothing to measure yet. */
  promiseAccuracy: number | null;
  /** Per-bucket finished-ticket counts, oldest → newest, for a sparkline. */
  throughputSeries: number[];
}

/**
 * Real KDS service history over a window (Atlas fleet command). Reads
 * kds_tickets once and derives:
 *   - promise-accuracy: finished (bumped/ready) tickets whose actual finish
 *     was on or before the promised-ready time,
 *   - a throughput sparkline: finished tickets bucketed evenly across the
 *     window.
 * Bumped/ready tickets only — fired-but-not-finished don't count. No
 * fabricated numbers; everything comes from the kds_tickets ledger.
 */
export async function getKdsServiceHistory(
  locationSlug: string,
  fromIso: string,
  toIso: string,
  buckets = 8,
): Promise<KdsServiceHistory> {
  const empty: KdsServiceHistory = {
    onTime: 0,
    total: 0,
    promiseAccuracy: null,
    throughputSeries: new Array(Math.max(1, buckets)).fill(0),
  };
  const db = getDb();
  if (!db) return empty;
  try {
    await ensureKdsTables();
    const from = new Date(fromIso);
    const to = new Date(toIso);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return empty;
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
    const span = Math.max(1, to.getTime() - from.getTime());
    const n = Math.max(1, buckets);
    const series = new Array(n).fill(0);
    let onTime = 0;
    let total = 0;
    for (const r of rows) {
      const finished = r.bumpedAt ?? r.readyAt;
      if (!finished) continue;
      // throughput bucket
      const idx = Math.min(n - 1, Math.max(0, Math.floor(((finished.getTime() - from.getTime()) / span) * n)));
      series[idx] += 1;
      // promise accuracy (only when there was a promise to measure)
      if (r.promisedReadyAt) {
        total += 1;
        if (finished.getTime() <= r.promisedReadyAt.getTime()) onTime += 1;
      }
    }
    return {
      onTime,
      total,
      promiseAccuracy: total > 0 ? Math.round((onTime / total) * 100) : null,
      throughputSeries: series,
    };
  } catch (err) {
    logger.warn("getKdsServiceHistory failed", { locationSlug, layer: "store.kds" }, err);
    return empty;
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
      .values({ id: "sud-italia", name: "Ottaviano", slug: "sud-italia" })
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

// HACCP bands + sensor presets live in the client-safe @/lib/haccp module so the
// log form previews the same verdict this file assigns on save. Re-exported here
// for existing import sites.
export { HACCP_SENSORS } from "@/lib/haccp";

export async function saveTempLog(input: Omit<TempLog, "id" | "status"> & { id?: string }): Promise<TempLog | null> {
  const id = input.id || `tl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const status = tempVerdict(input.sensor, input.tempCelsius);
  const record: TempLog = { id, status, ...input };
  const db = await getDomainDb();
  if (db) {
    try {
      await ensureComplianceTables();
      await db.insert(tempLogsTable).values({
        id,
        locationSlug: input.locationSlug,
        sensor: input.sensor,
        tempCelsius: input.tempCelsius,
        status,
        recordedBy: input.recordedBy ?? null,
        recordedAt: new Date(input.recordedAt),
      });
      return record;
    } catch (err) {
      logger.error("saveTempLog failed", { layer: "store.compliance" }, err);
      return null;
    }
  }
  // Filesystem / no-DATABASE_URL fallback (local dev) — keeps the HACCP log
  // usable everywhere per CLAUDE rule #2.
  return withLock("temp-logs.json", async () => {
    const list = await readJSON<TempLog[]>("temp-logs.json", []);
    list.push(record);
    await writeJSON("temp-logs.json", list);
    return record;
  });
}

export async function getTempLogs(filters: {
  locationSlug: string;
  fromIso?: string;
  toIso?: string;
  limit?: number;
}): Promise<TempLog[]> {
  const db = await getDomainDb();
  if (!db) {
    const all = await readJSON<TempLog[]>("temp-logs.json", []);
    let list = all.filter((t) => t.locationSlug === filters.locationSlug);
    if (filters.fromIso) list = list.filter((t) => t.recordedAt >= filters.fromIso!);
    if (filters.toIso) list = list.filter((t) => t.recordedAt <= filters.toIso!);
    list.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
    return list.slice(0, filters.limit ?? 500);
  }
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

/**
 * Bulk-append pre-built temperature readings in ONE write (kv) or one batch
 * insert (DB) instead of a round-trip per reading — the path the simulation
 * seeder takes to lay down a deep HACCP history without paying saveTempLog's
 * per-row lock + Neon round-trip (which would blow the seed past the
 * serverless budget). Status is derived per reading via tempVerdict, exactly
 * like saveTempLog. Only ever called while a test mode is active (getDomainDb()
 * is null then, so the kv path runs); the DB branch mirrors saveTempLog.
 */
export async function bulkAppendTempLogs(
  inputs: (Omit<TempLog, "id" | "status"> & { id?: string })[],
): Promise<void> {
  if (inputs.length === 0) return;
  const stamp = Date.now().toString(36);
  const records: TempLog[] = inputs.map((input, i) => ({
    id: input.id || `tl-${stamp}-${i}-${Math.random().toString(36).slice(2, 6)}`,
    status: tempVerdict(input.sensor, input.tempCelsius),
    ...input,
  }));
  const db = await getDomainDb();
  if (db) {
    try {
      await ensureComplianceTables();
      await db.insert(tempLogsTable).values(
        records.map((r) => ({
          id: r.id,
          locationSlug: r.locationSlug,
          sensor: r.sensor,
          tempCelsius: r.tempCelsius,
          status: r.status,
          recordedBy: r.recordedBy ?? null,
          recordedAt: new Date(r.recordedAt),
        })),
      );
    } catch (err) {
      logger.error("bulkAppendTempLogs failed", { layer: "store.compliance" }, err);
    }
    return;
  }
  await withLock("temp-logs.json", async () => {
    const list = await readJSON<TempLog[]>("temp-logs.json", []);
    list.push(...records);
    await writeJSON("temp-logs.json", list);
  });
}

// --- Waste log (audit §11.2 / §12.4 #4) ---------------------------------
//
// A line-level record of food discarded outside a sale — spoilage, prep
// errors, drops, over-production. Inventory already has a `waste` stock
// movement, but operators need a fast, reason-coded log at the line that rolls
// up to a daily cost. Stored in the kv store (no dedicated table needed yet).

export type WasteReason =
  | "spoilage"
  | "prep_error"
  | "dropped"
  | "overproduction"
  | "customer_return"
  | "expired"
  | "other";

export interface WasteLogEntry {
  id: string;
  locationSlug: string;
  item: string;
  quantity: number;
  unit: string;
  reason: WasteReason;
  /** Operator estimate of the cost written off, in grosze. */
  estimatedCostGrosze?: number;
  notes?: string;
  recordedBy?: string;
  recordedAt: string;
}

export async function getWasteLogs(
  locationSlug: string,
  opts: { fromIso?: string; toIso?: string; limit?: number } = {},
): Promise<WasteLogEntry[]> {
  const all = await readJSON<WasteLogEntry[]>("waste-logs.json", []);
  let list = all.filter((w) => w.locationSlug === locationSlug);
  if (opts.fromIso) list = list.filter((w) => w.recordedAt >= opts.fromIso!);
  if (opts.toIso) list = list.filter((w) => w.recordedAt <= opts.toIso!);
  list.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  return list.slice(0, opts.limit ?? 500);
}

export async function saveWasteLog(
  input: Omit<WasteLogEntry, "id" | "recordedAt"> & { id?: string; recordedAt?: string },
): Promise<WasteLogEntry> {
  return withLock("waste-logs.json", async () => {
    const list = await readJSON<WasteLogEntry[]>("waste-logs.json", []);
    const entry: WasteLogEntry = {
      id: input.id || `waste-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      locationSlug: input.locationSlug,
      item: input.item,
      quantity: input.quantity,
      unit: input.unit,
      reason: input.reason,
      estimatedCostGrosze: input.estimatedCostGrosze,
      notes: input.notes,
      recordedBy: input.recordedBy,
      recordedAt: input.recordedAt ?? new Date().toISOString(),
    };
    list.push(entry);
    await writeJSON("waste-logs.json", list);
    return entry;
  });
}

/**
 * Bulk-append pre-built waste entries in ONE locked read-modify-write instead
 * of one per row — the path the simulation seeder takes to lay down a deep
 * reason-coded waste history cheaply (waste-logs.json is a single cross-location
 * kv blob, so a flat loop would pay saveWasteLog's lock + O(N) rewrite each).
 */
export async function bulkAppendWasteLogs(
  inputs: (Omit<WasteLogEntry, "id" | "recordedAt"> & { id?: string; recordedAt?: string })[],
): Promise<void> {
  if (inputs.length === 0) return;
  const stamp = Date.now().toString(36);
  await withLock("waste-logs.json", async () => {
    const list = await readJSON<WasteLogEntry[]>("waste-logs.json", []);
    inputs.forEach((input, i) => {
      list.push({
        id: input.id || `waste-${stamp}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        locationSlug: input.locationSlug,
        item: input.item,
        quantity: input.quantity,
        unit: input.unit,
        reason: input.reason,
        estimatedCostGrosze: input.estimatedCostGrosze,
        notes: input.notes,
        recordedBy: input.recordedBy,
        recordedAt: input.recordedAt ?? new Date().toISOString(),
      });
    });
    await writeJSON("waste-logs.json", list);
  });
}

// --- Shift handover (audit §11.2 / §12.4 #1) ----------------------------
//
// The end-of-shift sign-off that ties cash count, waste and temperature
// checks to a named manager. The #1 control against shift-boundary theft +
// morale collapse in QSR. Stored in the kv store.

export interface ShiftHandover {
  id: string;
  locationSlug: string;
  shift: "open" | "mid" | "close";
  /** Drawer counted at handover, grosze. */
  cashCountedGrosze?: number;
  /** Cash session reconciled against, if any. */
  cashSessionId?: string;
  /** Counted − expected for that session, grosze (computed at save). */
  cashVarianceGrosze?: number;
  tempChecksOk: boolean;
  wasteNoted: boolean;
  equipmentOk: boolean;
  managerComment?: string;
  outgoingManager: string;
  incomingManager?: string;
  recordedBy?: string;
  recordedAt: string;
}

export async function getShiftHandovers(
  locationSlug: string,
  opts: { fromIso?: string; limit?: number } = {},
): Promise<ShiftHandover[]> {
  const all = await readJSON<ShiftHandover[]>("shift-handovers.json", []);
  let list = all.filter((h) => h.locationSlug === locationSlug);
  if (opts.fromIso) list = list.filter((h) => h.recordedAt >= opts.fromIso!);
  list.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  return list.slice(0, opts.limit ?? 200);
}

export async function saveShiftHandover(
  input: Omit<ShiftHandover, "id" | "recordedAt" | "cashVarianceGrosze"> & {
    id?: string;
    recordedAt?: string;
  },
): Promise<ShiftHandover> {
  // Reconcile the counted drawer against the named session's expected total so
  // the handover carries a real variance (the #1 shift-boundary theft signal),
  // not just a number the closing manager typed.
  let cashVarianceGrosze: number | undefined;
  if (input.cashSessionId && typeof input.cashCountedGrosze === "number") {
    const sessions = await getCashSessions(input.locationSlug, { includeHidden: true });
    const session = sessions.find((s) => s.id === input.cashSessionId);
    if (session) {
      cashVarianceGrosze = computeCashVariance(session, input.cashCountedGrosze);
    }
  }
  return withLock("shift-handovers.json", async () => {
    const list = await readJSON<ShiftHandover[]>("shift-handovers.json", []);
    const entry: ShiftHandover = {
      id: input.id || `ho-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      locationSlug: input.locationSlug,
      shift: input.shift,
      cashCountedGrosze: input.cashCountedGrosze,
      cashSessionId: input.cashSessionId,
      cashVarianceGrosze,
      tempChecksOk: input.tempChecksOk,
      wasteNoted: input.wasteNoted,
      equipmentOk: input.equipmentOk,
      managerComment: input.managerComment,
      outgoingManager: input.outgoingManager,
      incomingManager: input.incomingManager,
      recordedBy: input.recordedBy,
      recordedAt: input.recordedAt ?? new Date().toISOString(),
    };
    list.push(entry);
    await writeJSON("shift-handovers.json", list);
    return entry;
  });
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
  /** Active-location slug (validated against the live locations store
   *  at tool time — see whatsapp/tools.ts isActiveLocation). */
  locationSlug: string | null;
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
  /** Sandbox flag — marks a synthetic / simulated conversation; never set by
   *  the live bot. Reserved scaffolding (the WhatsApp chat simulator that set
   *  it was removed). */
  simulated?: boolean;
  /** Active scripted flow, if the customer is mid-sequence. The runner sends
   *  step `step` on the next inbound and advances; cleared when the flow ends. */
  activeFlow?: { flowId: string; step: number };
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
  /** Operator-console auto-archive: a conversation with no new message for
   *  this many minutes drops out of the active inbox into the Archived view.
   *  Console-side only — does NOT shorten the bot's 90-min session TTL, so a
   *  customer's cart survives even after the operator's view archives it.
   *  0 disables auto-archive. */
  autoArchiveMinutes: number;
  /** Master switch for the LLM concierge. When false the channel still
   *  receives + logs messages and honours auto-replies, but instead of calling
   *  the model it sends `awayMessage`. */
  aiEnabled: boolean;
  /** Extra operator instructions appended to the bot's base system prompt
   *  (persona, policies, promos). Empty string leaves the base prompt as-is. */
  aiInstructions: string;
  /** Sent when the AI concierge is disabled (aiEnabled=false). Empty string
   *  falls back to a built-in "ordering paused" message. */
  awayMessage: string;
  /** Keyword → canned reply auto-responses, evaluated BEFORE the LLM. The
   *  first whose keyword is contained (case-insensitive) in an inbound text
   *  wins: the reply is sent and the turn ends without calling the model. */
  autoReplies: { keyword: string; reply: string }[];
  /** Opening hours (Europe/Warsaw). When enabled, messages received outside
   *  the day's open→close window get the away message instead of the bot.
   *  `days` is indexed 0=Sunday … 6=Saturday. */
  businessHours: {
    enabled: boolean;
    days: { open: string; close: string; closed: boolean }[];
  };
  /** Abandoned-cart recovery: when enabled, the daily cron sends the re-open
   *  template to customers who built a cart but didn't pay, once each, after
   *  `delayHours` and before the recovery window closes. Needs reopenTemplate. */
  abandonedCart: { enabled: boolean; delayHours: number };
  /** Scripted multi-step flows. A customer message containing `trigger` starts
   *  the flow; each subsequent reply advances one step. Deterministic — runs
   *  ahead of the LLM, independent of the AI toggle. */
  flows: { id: string; name: string; trigger: string; enabled: boolean; steps: { prompt: string }[] }[];
}

const DEFAULT_BUSINESS_DAYS = Array.from({ length: 7 }, () => ({
  open: "11:00",
  close: "22:00",
  closed: false,
}));

const DEFAULT_WA_SETTINGS: WaSettings = {
  enabled: true,
  welcomeMessage:
    "Cześć! Tu Ottaviano 🍕 Napisz, co masz ochotę zjeść albo z jakiego miasta jesteś (Kraków / Warszawa).",
  optOutPhrases: ["STOP", "NIE", "UNSUBSCRIBE"],
  defaultLocation: null,
  dailyMessageCap: 60,
  reopenTemplate: "",
  autoArchiveMinutes: 5,
  aiEnabled: true,
  aiInstructions: "",
  awayMessage: "",
  autoReplies: [],
  businessHours: { enabled: false, days: DEFAULT_BUSINESS_DAYS },
  abandonedCart: { enabled: false, delayHours: 2 },
  flows: [],
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
  const db = await getDomainDb();
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
  const db = await getDomainDb();
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
  const db = await getDomainDb();
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
  const db = await getDomainDb();
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
  const db = await getDomainDb();
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

// --- WhatsApp conversation flags (operator console: archive / pin) -------
//
// Operator-side organisational state, independent of the bot session. A
// manually-archived phone drops to the Archived view even if recent; a pinned
// phone never auto-archives. A new inbound message clears the manual-archive
// flag (the webhook calls setWaArchived(phone, false)) so a reply pulls the
// chat back to the inbox. Stored as two phone registries.

const WA_ARCHIVED_KEY = "whatsapp-archived-phones.json";
const WA_PINNED_KEY = "whatsapp-pinned-phones.json";

export async function getWaConversationFlags(): Promise<{ archived: string[]; pinned: string[] }> {
  const [archived, pinned] = await Promise.all([
    readJSON<string[]>(WA_ARCHIVED_KEY, []),
    readJSON<string[]>(WA_PINNED_KEY, []),
  ]);
  return {
    archived: Array.isArray(archived) ? archived : [],
    pinned: Array.isArray(pinned) ? pinned : [],
  };
}

async function setPhoneFlag(key: string, rawPhone: string, on: boolean): Promise<void> {
  const phone = normalizePlPhoneE164(rawPhone);
  if (!phone) return;
  await withLock(key, async () => {
    const list = await readJSON<string[]>(key, []);
    const has = list.includes(phone);
    if (on && !has) {
      await writeJSON(key, [...list, phone]);
    } else if (!on && has) {
      await writeJSON(key, list.filter((p) => p !== phone));
    }
  });
}

/** Manually archive (or restore) a conversation in the operator console. */
export async function setWaArchived(rawPhone: string, archived: boolean): Promise<void> {
  await setPhoneFlag(WA_ARCHIVED_KEY, rawPhone, archived);
  // Pinning and archiving are mutually exclusive — archiving unpins.
  if (archived) await setPhoneFlag(WA_PINNED_KEY, rawPhone, false);
}

/** Pin (or unpin) a conversation so it never auto-archives. */
export async function setWaPinned(rawPhone: string, pinned: boolean): Promise<void> {
  await setPhoneFlag(WA_PINNED_KEY, rawPhone, pinned);
  // Pinning clears any manual archive so the chat returns to the inbox.
  if (pinned) await setPhoneFlag(WA_ARCHIVED_KEY, rawPhone, false);
}

// --- WhatsApp conversion funnel (event instrumentation) ------------------
//
// Lightweight append-only log of the furthest stage each conversation reaches,
// so the console can show a real drop-off funnel over a window. Events are
// emitted from the bot pipeline (turn loop diff + webhook first-touch) and the
// Stripe webhook (paid). Aggregation is cumulative per phone — reaching a later
// stage implies the earlier ones — so a missed intermediate event never breaks
// the funnel. Simulated chats bypass the live pipeline, so they never appear.

export type WaFunnelStage =
  | "started"
  | "location"
  | "cart"
  | "fulfillment"
  | "slot"
  | "payment"
  | "paid";

export interface WaFunnelEvent {
  stage: WaFunnelStage;
  phone: string;
  locationSlug: string | null;
  at: string;
}

const WA_FUNNEL_KEY = "whatsapp-funnel.json";
const WA_FUNNEL_MAX = 10_000;

export async function appendWaFunnelEvent(event: WaFunnelEvent): Promise<void> {
  await withLock(WA_FUNNEL_KEY, async () => {
    const list = await readJSON<WaFunnelEvent[]>(WA_FUNNEL_KEY, []);
    list.push(event);
    if (list.length > WA_FUNNEL_MAX) list.splice(0, list.length - WA_FUNNEL_MAX);
    await writeJSON(WA_FUNNEL_KEY, list);
  });
  incrCounter(`whatsapp.funnel.${event.stage}`);
}

export async function getWaFunnelEvents(sinceMs?: number): Promise<WaFunnelEvent[]> {
  const list = await readJSON<WaFunnelEvent[]>(WA_FUNNEL_KEY, []);
  if (!Array.isArray(list)) return [];
  if (!sinceMs) return list;
  return list.filter((e) => {
    const t = Date.parse(e.at);
    return Number.isFinite(t) && t >= sinceMs;
  });
}

// --- WhatsApp abandoned-cart recovery ------------------------------------
//
// A cart a customer built but didn't pay for, persisted beyond the 90-min bot
// session so the daily cron can re-engage them with the Meta re-open template.
// Upserted from the turn loop whenever a turn ends with items in the cart;
// cleared when the order is paid (Stripe webhook) or the chat is escalated.
// Each record is nudged at most once (notifiedAt), so customers are never
// spammed.

export interface WaAbandonedCart {
  phone: string;
  locationSlug: string | null;
  itemCount: number;
  subtotalGrosze: number;
  /** Refreshed every turn the cart is non-empty — "abandoned since". */
  lastCartAt: string;
  createdAt: string;
  notifiedAt: string | null;
}

const WA_ABANDONED_KEY = "whatsapp-abandoned-carts.json";

export async function upsertWaAbandonedCart(input: {
  phone: string;
  locationSlug: string | null;
  itemCount: number;
  subtotalGrosze: number;
}): Promise<void> {
  const phone = normalizePlPhoneE164(input.phone);
  if (!phone) return;
  await withLock(WA_ABANDONED_KEY, async () => {
    const all = await readJSON<Record<string, WaAbandonedCart>>(WA_ABANDONED_KEY, {});
    const now = new Date().toISOString();
    const existing = all[phone];
    all[phone] = {
      phone,
      locationSlug: input.locationSlug,
      itemCount: input.itemCount,
      subtotalGrosze: input.subtotalGrosze,
      lastCartAt: now,
      createdAt: existing?.createdAt ?? now,
      notifiedAt: existing?.notifiedAt ?? null,
    };
    await writeJSON(WA_ABANDONED_KEY, all);
  });
}

export async function clearWaAbandonedCart(rawPhone: string): Promise<void> {
  const phone = normalizePlPhoneE164(rawPhone);
  if (!phone) return;
  await withLock(WA_ABANDONED_KEY, async () => {
    const all = await readJSON<Record<string, WaAbandonedCart>>(WA_ABANDONED_KEY, {});
    if (all[phone]) {
      delete all[phone];
      await writeJSON(WA_ABANDONED_KEY, all);
    }
  });
}

export async function markWaAbandonedCartNotified(rawPhone: string): Promise<void> {
  const phone = normalizePlPhoneE164(rawPhone);
  if (!phone) return;
  await withLock(WA_ABANDONED_KEY, async () => {
    const all = await readJSON<Record<string, WaAbandonedCart>>(WA_ABANDONED_KEY, {});
    if (all[phone]) {
      all[phone] = { ...all[phone], notifiedAt: new Date().toISOString() };
      await writeJSON(WA_ABANDONED_KEY, all);
    }
  });
}

export async function listWaAbandonedCarts(): Promise<WaAbandonedCart[]> {
  const all = await readJSON<Record<string, WaAbandonedCart>>(WA_ABANDONED_KEY, {});
  return Object.values(all);
}

// --- WhatsApp broadcast campaigns ----------------------------------------
//
// A one-off template blast to an opted-in customer segment. The audience phone
// list is snapshotted at create time; sends run in client-driven batches (with
// a daily cron backstop), advancing `cursor` and counting sends so progress
// survives a page reload and a half-finished campaign can always be resumed.

export type WaCampaignStatus = "sending" | "done" | "cancelled";

export interface WaCampaign {
  id: string;
  template: string;
  languageCode: string;
  audienceKey: string;
  audienceLabel: string;
  phones: string[];
  cursor: number;
  sentCount: number;
  failedCount: number;
  status: WaCampaignStatus;
  createdAt: string;
  createdBy: string;
  completedAt: string | null;
}

const WA_CAMPAIGNS_KEY = "whatsapp-campaigns.json";
const WA_CAMPAIGNS_MAX = 50;

export async function createWaCampaign(input: {
  template: string;
  languageCode: string;
  audienceKey: string;
  audienceLabel: string;
  phones: string[];
  createdBy: string;
}): Promise<WaCampaign> {
  const campaign: WaCampaign = {
    id: `wac_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    template: input.template,
    languageCode: input.languageCode,
    audienceKey: input.audienceKey,
    audienceLabel: input.audienceLabel,
    phones: input.phones,
    cursor: 0,
    sentCount: 0,
    failedCount: 0,
    status: input.phones.length === 0 ? "done" : "sending",
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
    completedAt: input.phones.length === 0 ? new Date().toISOString() : null,
  };
  await withLock(WA_CAMPAIGNS_KEY, async () => {
    const list = await readJSON<WaCampaign[]>(WA_CAMPAIGNS_KEY, []);
    list.unshift(campaign);
    await writeJSON(WA_CAMPAIGNS_KEY, list.slice(0, WA_CAMPAIGNS_MAX));
  });
  return campaign;
}

export async function listWaCampaigns(): Promise<WaCampaign[]> {
  const list = await readJSON<WaCampaign[]>(WA_CAMPAIGNS_KEY, []);
  return Array.isArray(list) ? list : [];
}

export async function getWaCampaign(id: string): Promise<WaCampaign | null> {
  const list = await readJSON<WaCampaign[]>(WA_CAMPAIGNS_KEY, []);
  return list.find((c) => c.id === id) ?? null;
}

export async function updateWaCampaign(
  id: string,
  patch: Partial<Pick<WaCampaign, "cursor" | "sentCount" | "failedCount" | "status" | "completedAt">>,
): Promise<WaCampaign | null> {
  return withLock(WA_CAMPAIGNS_KEY, async () => {
    const list = await readJSON<WaCampaign[]>(WA_CAMPAIGNS_KEY, []);
    const i = list.findIndex((c) => c.id === id);
    if (i < 0) return null;
    list[i] = { ...list[i], ...patch };
    await writeJSON(WA_CAMPAIGNS_KEY, list);
    return list[i];
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
// are tuned to a Neapolitan pizza restaurant operating in central Warsaw
// 2026 — a ~90-seat dine-in pizzeria on a prime street, open 12:00–23:00
// (lunch + dinner) seven days a week. Hourly rates bake in the ~22%
// Polish employer narzut (ZUS social + Labour Fund) so a "rate × hours"
// multiplication lands at FULL employer cost — same convention the
// business-costs ledger uses.

const SIMULATION_KEY = "simulation-scenarios.json";

export function defaultSimulationScenario(): SimulationScenario {
  // Hourly rates: brutto Warsaw 2026 × 1.22 employer narzut, rounded
  // to the nearest 50 grosze. Operators who'd rather think in pure
  // brutto can divide by 1.22.
  // 7-day rota (Mon…Sun): `shift` on every day but `offDay`.
  const wk = (start: number, end: number, offDay: number): ({ start: number; end: number } | null)[] =>
    Array.from({ length: 7 }, (_, d) => (d === offDay ? null : { start, end }));
  const labor: SimulationLaborLine[] = [
    // Sized for a ~90-seat full-service restaurant doing ~110 checks/day
    // across lunch + dinner, seven days. Unlike a food truck, a dining
    // room carries floor staff (several waiters), a sous-chef and a
    // kitchen porter / dish-pit — roles a truck line never has.
    //
    // Each line is ONE worker (own rate + own weekly rota). `wk(start,end,off)`
    // builds a 7-day week (Mon…Sun) with that consistent shift on every day
    // except the one staggered day off, so the floor is covered all 7 days and
    // no two consecutive shifts fall under 12h rest. Weekly hours (and pay)
    // derive from the rota — a consistent 8h × 6-day week ≈ 48h.
    { id: "pizzaiolo-1",    role: "pizzaiolo",      headcount: 1, hourlyRateGrosze: 4500, week: wk(12, 20, 6) },
    { id: "pizzaiolo-2",    role: "pizzaiolo",      headcount: 1, hourlyRateGrosze: 4500, week: wk(15, 23, 2) },
    { id: "chef-1",         role: "chef",           headcount: 1, hourlyRateGrosze: 3900, week: wk(12, 20, 0) },
    { id: "sous-chef-1",    role: "sous-chef",      headcount: 1, hourlyRateGrosze: 4500, week: wk(15, 23, 1) },
    { id: "porter-1",       role: "kitchen-porter", headcount: 1, hourlyRateGrosze: 3200, week: wk(16, 23, 3) },
    { id: "waiter-1",       role: "waiter",         headcount: 1, hourlyRateGrosze: 3600, week: wk(12, 19, 4) },
    { id: "waiter-2",       role: "waiter",         headcount: 1, hourlyRateGrosze: 3600, week: wk(15, 22, 5) },
    { id: "waiter-3",       role: "waiter",         headcount: 1, hourlyRateGrosze: 3600, week: wk(16, 23, 6) },
    { id: "barista-1",      role: "barista",        headcount: 1, hourlyRateGrosze: 3900, week: wk(12, 20, 0) },
    { id: "manager-1",      role: "manager",        headcount: 1, hourlyRateGrosze: 6000, week: wk(12, 20, 6) },
  ];
  const fixedCosts: SimulationScenario["fixedCosts"] = {
    rent: 2_200_000,       // 22 000 zł — prime central lease (Rynek / Nowy Świat), ~150 m²
    utilities: 500_000,    //  5 000 zł — full kitchen + dining-room HVAC, water, gas
    fuel: 0,               //      0 zł — dine-in restaurant; no vehicle / generator
    vehicle: 0,            //      0 zł — no truck; add a line if you run delivery wheels
    insurance: 150_000,    //  1 500 zł — OC działalności + premises / public-liability
    licenses: 90_000,      //    900 zł — SANEPID + koncesja alkoholowa + ZAiKS, annual / 12
    marketing: 250_000,    //  2 500 zł — organic + paid social for a destination venue
    software: 60_000,      //    600 zł — POS + KDS + reservations + analytics
    professional: 80_000,  //    800 zł — biuro rachunkowe (pełna księgowość)
    tax: 280_000,          //  2 800 zł — ZUS właściciel + podatek od nieruchomości + opłaty
    maintenance: 100_000,  //  1 000 zł — kitchen-equipment service + premises upkeep
    other: 60_000,         //    600 zł — buffer + cash handling
  };
  return {
    ordersPerDay: 110,
    avgTicketGrosze: 8500,
    daysOpenPerMonth: 30,
    cogsPct: 0.30,
    labor,
    fixedCosts,
    wageInflationPct: 0.07,
    ingredientInflationPct: 0.04,
    paymentProcessorPct: DEFAULT_PROCESSOR_FEE.pct,
    // Operational leakage the previous model silently ignored. QSR norms:
    // - waste 1-3% of revenue (spoilage, recipe over-portioning)
    // - refunds/comps/theft 1-2% of revenue
    // - loyalty point burn ~50% redemption × ~5% effective value
    // CIT default to the 9% Polish small-CIT rate (Y1 profits fit the
    // 2 M EUR turnover cap); 19% applies once you scale past that.
    wastePct: 0.02,
    refundPct: 0.015,
    loyaltyBurnPct: 0.012,
    citPct: 0.09,
    // Channel mix — defaults to 100% on-site (cash + card) with the
    // marketplaces off. Dine-in skews heavily to card at the table, so
    // the cash share is lower than a takeaway truck. Turning Glovo/Wolt
    // on materially compresses margin because the marketplace fee
    // replaces (not adds to) the on-site processor rate on that share.
    cashSharePct: 0.12,
    glovoSharePct: 0.00,
    glovoFeePct: 0.27,
    woltSharePct: 0.00,
    woltFeePct: 0.28,
    // One pizzaiolo + one Ferrara oven sustains ~70 pizzas/hour. Over
    // 11 service hours that's 770 theoretical, but ~35% of orders hit
    // in the peak hour-equivalents, so the binding ceiling is
    // 70 / 0.35 ≈ 200 orders/day before the line breaks. A second
    // pizzaiolo + second oven roughly doubles it.
    kitchenCapacity: {
      pizzasPerHour: 70,
      openHoursPerDay: 11,
      peakHourSharePct: 0.35,
      // Oven physics — Stefano Ferrara 8-pizza bake × 90s cycle gives
      // 320 pizzas/hour theoretical. Realistic peak with pulls / sweeps /
      // dough rebuilds / customer-facing time / drinks lands ~22% =
      // ~70 pizzas/hour, which matches the pizzasPerHour above. Operator
      // can tune any of the three to recompute the realistic number.
      ovenPizzasPerCycle: 8,
      ovenCycleSeconds: 90,
      ovenEfficiencyPct: 0.22,
    },
    // Labor flex — at default 40% variable, doubling orders/day pulls in
    // 40% more labor cost (real-world: extra cook + extra waiter on a
    // Saturday rush does happen). At 0 the restaurant is fully
    // fixed-staffed; at 1 a 2× volume move would double the wage bill.
    // Anchor defaults to the ordersPerDay the labor mix was sized for (110).
    laborVariablePct: 0.40,
    laborAnchorOrdersPerDay: 110,
    // ~7.5-year straight-line on the 900k restaurant fit-out ⇒
    // 90,000,000 / 90 months = 10,000 PLN / mo. Leasehold improvements +
    // dining-room build amortise slower than a truck's 5-year life.
    // Kept separate from "maintenance" so EBITDA is honest; 0 disables it.
    depreciationMonthlyGrosze: 1_000_000,
    interestMonthlyGrosze: 0,
    // Every order incurs real packaging — even dine-in (napkins,
    // plates wash). Audit §6: previously buried inside delivery-share
    // only, overstating dine-in CM1 by ~1.20 zł per order.
    packagingPerOrderGrosze: 120,
    // Marketing fixed cost behaves like CAC: it acquires orders.
    // Amortising it per-order makes CM1 honest — the institutional
    // CM1 nets out everything that's not a long-lived asset cost.
    marketingAsCac: true,
    // Default 1.0 = pizza-only throughput. Bump above 1 when menu
    // skews to slow-prep items (pasta = ~1.4-1.6×). Derates the
    // kitchen capacity ceiling proportionally.
    prepComplexityMultiplier: 1.0,
    // Fleet model defaults — single-unit mode until operator activates.
    // Numbers reflect institutional QSR-rollup norms when the operator
    // bumps unitCount: 6% royalty + 2% marketing fund, 10% supply
    // discount at 5 units, 4% commissary saving at 4 units, 15% DMA
    // cannibalisation, 5% build-out learning per unit to a 55% floor.
    fleet: {
      unitCount: 1,
      hqOverheadMonthlyGrosze: 0,
      supplyDiscountAtUnits: 5,
      supplyDiscountPct: 0.10,
      commissaryEnabledAtUnits: 4,
      commissarySavingsPct: 0.04,
      royaltyPct: 0.06,
      marketingFundPct: 0.02,
      dmaOverlapPct: 0.15,
      buildoutLearningPct: 0.05,
      buildoutFloorPct: 0.55,
    },
    // Honest all-in: full restaurant fit-out — kitchen + Stefano Ferrara
    // oven + refrigeration + dining-room build + furniture + bar + bathrooms
    // + signage + deposits + 3 mo working capital lands 800-1,000k PLN for a
    // prime-street venue. An order of magnitude above a truck buildout, and
    // the number payback / IRR are computed against.
    setupCostGrosze: 90_000_000,
    // Premises — defaults to RENTING a prime-street unit, tuned so the folded
    // numbers reproduce the legacy baseline exactly: rent 22 000 zł/mo (= the
    // old fixedCosts.rent), a 3-month deposit (66 000 zł) + 834 000 zł fit-out
    // & opening capital ⇒ 900 000 zł upfront (= the old setupCost). Flip to
    // "buy" to model a mortgage: ~3.5 M zł prime unit, 30% down, 7.8% over
    // 20 years, 2.5%/yr building depreciation (≈40-yr straight line), plus
    // property tax + structural upkeep the owner carries instead of a landlord.
    premises: {
      mode: "rent",
      monthlyRentGrosze: 2_200_000,
      depositMonths: 3,
      serviceChargeMonthlyGrosze: 0,
      purchasePriceGrosze: 350_000_000,
      downPaymentPct: 0.30,
      mortgageRatePct: 0.078,
      mortgageTermYears: 20,
      propertyTaxAnnualGrosze: 600_000,
      buildingMaintenanceMonthlyGrosze: 150_000,
      buildingDepreciationPct: 0.025,
      propertyAppreciationPct: 0.04, // ≈ Polish prime-commercial long-run appreciation
      fitoutGrosze: 83_400_000,
      // Opportunity-cost benchmarks for the "run it vs invest the capital" model.
      investHorizonYears: 10,
      menuPriceInflationPct: 0.05, // menu repricing keeps pace with cost CPI

      sp500RatePct: 0.10,     // S&P 500 long-run nominal total return
      nasdaq100RatePct: 0.13, // Nasdaq-100 long-run nominal total return
      bondRatePct: 0.05,      // a 5% fixed-income coupon
    },
    seasonality: {
      // Indoor dining is far less weather-elastic than an outdoor truck.
      // Winter holds up — a warm room is a draw when it's cold out, and
      // December books up with festive dinners — so the floor sits ~0.85,
      // not the 0.30-0.50 cliff a truck faces. Summer gets a mild terrace +
      // tourist lift; spring/autumn are the steady baseline.
      winter: 0.85,
      spring: 1.00,
      summer: 1.10,
      autumn: 1.00,
    },
    menuScenario: "balanced",
    displayCurrency: "PLN",
    // Service window 12:00–23:00 (= the 11 open-hours the capacity math assumes).
    openingHours: { openHour: 12, closeHour: 23 },
    assumptions: defaultSimulationAssumptions(),
    weather: defaultSimulationWeather(),
    updatedAt: new Date().toISOString(),
  };
}

/** Behavioral levers tuned to a Neapolitan pizza restaurant in Warsaw 2026. */
export function defaultSimulationAssumptions(): SimulationAssumptions {
  // Every lever ships DISABLED by default. The operator opts in
  // explicitly per lever — including after loading a Menu Scenario
  // preset, which now only sets the lever VALUES (attachPct, ticket,
  // COGS) and leaves enabled state unchanged. Calibrated values stay
  // populated so each lever springs to life with sensible numbers the
  // moment it's toggled on — no hidden 0% trap.
  return {
    coffeeAttach:           { enabled: false, attachPct: 0.25, avgPriceGrosze: 900,  cogsPct: 0.12 },
    dessertAttach:          { enabled: false, attachPct: 0.12, avgPriceGrosze: 1600, cogsPct: 0.28 },
    antipastiAttach:        { enabled: false, attachPct: 0.08, avgPriceGrosze: 2400, cogsPct: 0.32 },
    aperitivoAttach:        { enabled: false, attachPct: 0.10, avgPriceGrosze: 2200, cogsPct: 0.22 },
    premiumToppingsAttach:  { enabled: false, attachPct: 0.15, avgPriceGrosze: 700,  cogsPct: 0.30 },
    pastaPrimoAttach:       { enabled: false, attachPct: 0.18, avgPriceGrosze: 3200, cogsPct: 0.26 },
    comboConversion: {
      enabled: false,
      pct: 0.20,
      addonGrosze: 2500,
      discountGrosze: 600,
      addonCogsPct: 0.25,
    },
    // Cheapest-pizza shift is a stress lever — also defaults off.
    // Per-1pp deltas calibrated so a 20pp shift toward Margherita drops
    // AOV by ~2 zł and COGS by ~0.80 zł (Margherita is ~10 zł cheaper
    // than the avg premium pie and ~4 zł cheaper to make).
    cheapestPizzaShift: {
      enabled: false,
      pp: 0,
      ticketDeltaGrosze: 1000,
      cogsDeltaGrosze: 400,
    },
    deliveryShare: {
      enabled: false,
      pct: 0.25,
      packagingCostGrosze: 250,
      extraProcessorPct: 0,
      avgFeeGrosze: 800,
    },
    // Ingredient stress-test levers — share of base-pizza COGS each line
    // represents (calibrated to a Neapolitan recipe; sums to ~0.92).
    // All disabled by default; flip individually to stress-test.
    ingredients: {
      mozzarella:   { enabled: false, cogsShare: 0.28, costDeltaPct: 0 },
      tomato:       { enabled: false, cogsShare: 0.10, costDeltaPct: 0 },
      flour:        { enabled: false, cogsShare: 0.06, costDeltaPct: 0 },
      doughWeight:  { enabled: false, cogsShare: 0.06, costDeltaPct: 0 },
      oliveOil:     { enabled: false, cogsShare: 0.05, costDeltaPct: 0 },
      curedMeats:   { enabled: false, cogsShare: 0.07, costDeltaPct: 0 },
      buffaloMozz:  { enabled: false, cogsShare: 0.03, costDeltaPct: 0 },
      eggs:         { enabled: false, cogsShare: 0.02, costDeltaPct: 0 },
      ovenFuel:     { enabled: false, cogsShare: 0.04, costDeltaPct: 0 },
      packaging:    { enabled: false, cogsShare: 0.03, costDeltaPct: 0 },
    },
  };
}

/** Weather + Polish calendar baseline for Warsaw 2026. */
export function defaultSimulationWeather(): SimulationWeather {
  // Ships disabled — matches the "off by default, operator opts in
  // explicitly" contract used for every Behaviour Assumption lever.
  // Indoor dining barely moves with the weather: rain is close to
  // neutral (a dry table beats a soaked queue), and an indoor/AC room
  // with a terrace gets only a mild heatwave lift — nothing like the
  // ±25-40% swings an exposed truck rides.
  return {
    enabled: false,
    rainyDayMultiplier: 0.95,
    rainyShare: 0.30,
    heatwaveMultiplier: 1.10,
    heatwaveShare: 0.10,
    holidayClosedDaysPerMonth: 1.0,
    holidayPeakDaysPerMonth: 1.0,
    holidayPeakMultiplier: 1.60,
    schoolHolidayLunchMultiplier: 0.85,
    eventDaysPerMonth: 1,
    eventDayMultiplier: 1.50,
  };
}

/** Schema migration markers for SimulationScenario.assumptions. Bump when
 *  a behavioural default flips so existing saved scenarios get realigned
 *  without operator action. */
const ASSUMPTIONS_MIGRATION_VERSION = 3;

/** Force every behavior-assumption lever to `enabled: false`. Used by the
 *  migration-v2 path to reset scenarios saved before the all-off default
 *  landed — without losing their calibrated attachPct / price / cogsPct
 *  values. */
function forceAllAssumptionsOff(a: SimulationAssumptions): SimulationAssumptions {
  const off = <T extends { enabled?: boolean }>(lever: T | undefined): T | undefined =>
    lever ? { ...lever, enabled: false } : lever;
  return {
    ...a,
    coffeeAttach: off(a.coffeeAttach),
    dessertAttach: off(a.dessertAttach),
    antipastiAttach: off(a.antipastiAttach),
    aperitivoAttach: off(a.aperitivoAttach),
    premiumToppingsAttach: off(a.premiumToppingsAttach),
    pastaPrimoAttach: off(a.pastaPrimoAttach),
    comboConversion: off(a.comboConversion),
    cheapestPizzaShift: off(a.cheapestPizzaShift),
    deliveryShare: off(a.deliveryShare),
    ingredients: a.ingredients
      ? (Object.fromEntries(
          Object.entries(a.ingredients).map(([k, v]) => [k, v ? { ...v, enabled: false } : v]),
        ) as SimulationAssumptions["ingredients"])
      : a.ingredients,
  };
}

export async function getSimulationScenario(): Promise<SimulationScenario> {
  const saved = await readJSON<Partial<SimulationScenario> | null>(SIMULATION_KEY, null);
  // The card-processing fee has one source (AppSettings.processorFee); seed a
  // fresh scenario's processor rate from it so the Calculator and the delivery
  // P&L report agree instead of carrying two different literals.
  const operatorProcessorPct = (await getSettings()).processorFee?.pct ?? DEFAULT_PROCESSOR_FEE.pct;
  if (!saved || !Array.isArray(saved.labor) || typeof saved.ordersPerDay !== "number") {
    return { ...defaultSimulationScenario(), paymentProcessorPct: operatorProcessorPct };
  }
  const defaults = { ...defaultSimulationScenario(), paymentProcessorPct: operatorProcessorPct };
  const hydratedAssumptions = hydrateAssumptions(saved.assumptions, defaults.assumptions);
  const hydratedWeather = hydrateWeather(saved.weather, defaults.weather);
  // Migration: force every behavior assumption + weather lever off on first
  // load after the migration version bumps. Existing scenarios saved before
  // each bump may have enabled: true baked in (from the prior hydrator's
  // fallback, or from auto-enabling preset code). Migration runs once per
  // scenario — when the marker catches up to current, normal operator
  // toggling resumes.
  //   v2: force the 10 assumptions levers off
  //   v3: also force weather off (matches the new "off by default" contract)
  const savedVersion = typeof saved.assumptionsMigrationVersion === "number"
    ? saved.assumptionsMigrationVersion
    : 0;
  const migrationNeeded = savedVersion < ASSUMPTIONS_MIGRATION_VERSION;
  const assumptions = migrationNeeded && hydratedAssumptions
    ? forceAllAssumptionsOff(hydratedAssumptions)
    : hydratedAssumptions;
  const weather = migrationNeeded && hydratedWeather
    ? { ...hydratedWeather, enabled: false }
    : hydratedWeather;
  return {
    ordersPerDay: saved.ordersPerDay ?? defaults.ordersPerDay,
    avgTicketGrosze: saved.avgTicketGrosze ?? defaults.avgTicketGrosze,
    daysOpenPerMonth: saved.daysOpenPerMonth ?? defaults.daysOpenPerMonth,
    cogsPct: typeof saved.cogsPct === "number" ? saved.cogsPct : defaults.cogsPct,
    labor: saved.labor.length > 0 ? expandLaborToWorkers(saved.labor) : defaults.labor,
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
    displayCurrency:
      saved.displayCurrency && (ALL_CURRENCIES as string[]).includes(saved.displayCurrency)
        ? saved.displayCurrency
        : defaults.displayCurrency,
    openingHours:
      saved.openingHours &&
      typeof saved.openingHours.openHour === "number" &&
      typeof saved.openingHours.closeHour === "number" &&
      saved.openingHours.closeHour > saved.openingHours.openHour
        ? { openHour: saved.openingHours.openHour, closeHour: saved.openingHours.closeHour }
        : defaults.openingHours,
    menuScenarioOverrides: hydrateMenuScenarioOverrides(saved.menuScenarioOverrides),
    assumptions,
    assumptionsMigrationVersion: ASSUMPTIONS_MIGRATION_VERSION,
    weather,
    wastePct: typeof saved.wastePct === "number" ? clamp01(saved.wastePct, defaults.wastePct ?? 0) : defaults.wastePct,
    refundPct: typeof saved.refundPct === "number" ? clamp01(saved.refundPct, defaults.refundPct ?? 0) : defaults.refundPct,
    loyaltyBurnPct: typeof saved.loyaltyBurnPct === "number" ? clamp01(saved.loyaltyBurnPct, defaults.loyaltyBurnPct ?? 0) : defaults.loyaltyBurnPct,
    citPct: typeof saved.citPct === "number" ? clamp01(saved.citPct, defaults.citPct ?? 0) : defaults.citPct,
    cashSharePct: typeof saved.cashSharePct === "number" ? clamp01(saved.cashSharePct, defaults.cashSharePct ?? 0) : defaults.cashSharePct,
    glovoSharePct: typeof saved.glovoSharePct === "number" ? clamp01(saved.glovoSharePct, defaults.glovoSharePct ?? 0) : defaults.glovoSharePct,
    glovoFeePct: typeof saved.glovoFeePct === "number" ? clamp01(saved.glovoFeePct, defaults.glovoFeePct ?? 0) : defaults.glovoFeePct,
    woltSharePct: typeof saved.woltSharePct === "number" ? clamp01(saved.woltSharePct, defaults.woltSharePct ?? 0) : defaults.woltSharePct,
    woltFeePct: typeof saved.woltFeePct === "number" ? clamp01(saved.woltFeePct, defaults.woltFeePct ?? 0) : defaults.woltFeePct,
    kitchenCapacity: hydrateKitchenCapacity(saved.kitchenCapacity, defaults.kitchenCapacity),
    laborVariablePct: typeof saved.laborVariablePct === "number" ? clamp01(saved.laborVariablePct, defaults.laborVariablePct ?? 0.4) : defaults.laborVariablePct,
    laborAnchorOrdersPerDay: typeof saved.laborAnchorOrdersPerDay === "number" && saved.laborAnchorOrdersPerDay > 0 ? saved.laborAnchorOrdersPerDay : defaults.laborAnchorOrdersPerDay,
    depreciationMonthlyGrosze: typeof saved.depreciationMonthlyGrosze === "number" && saved.depreciationMonthlyGrosze >= 0 ? saved.depreciationMonthlyGrosze : defaults.depreciationMonthlyGrosze,
    interestMonthlyGrosze: typeof saved.interestMonthlyGrosze === "number" && saved.interestMonthlyGrosze >= 0 ? saved.interestMonthlyGrosze : defaults.interestMonthlyGrosze,
    packagingPerOrderGrosze: typeof saved.packagingPerOrderGrosze === "number" && saved.packagingPerOrderGrosze >= 0 ? saved.packagingPerOrderGrosze : defaults.packagingPerOrderGrosze,
    marketingAsCac: typeof saved.marketingAsCac === "boolean" ? saved.marketingAsCac : defaults.marketingAsCac,
    prepComplexityMultiplier: typeof saved.prepComplexityMultiplier === "number" && saved.prepComplexityMultiplier > 0 ? Math.min(3, saved.prepComplexityMultiplier) : defaults.prepComplexityMultiplier,
    fleet: hydrateFleet(saved.fleet, defaults.fleet),
    premises: hydratePremises(
      saved.premises,
      defaults.premises!,
      saved.fixedCosts?.rent,
      saved.setupCostGrosze,
    ),
    updatedAt: saved.updatedAt ?? defaults.updatedAt,
  };
}

/** Each labour line is now ONE worker (own rate + own shift). Legacy scenarios
 *  stored a headcount per line; expand those into individual workers so the
 *  Labour card and the roster can address each person, handing each their own
 *  shift when the line carried a per-person shifts array. */
function expandLaborToWorkers(labor: SimulationLaborLine[]): SimulationLaborLine[] {
  return labor.flatMap((l) => {
    const n = Math.max(1, Math.round(l.headcount ?? 1));
    if (n === 1) return [{ ...l, headcount: 1 }];
    return Array.from({ length: n }, (_, i) => ({
      ...l,
      id: `${l.id}-${i + 1}`,
      headcount: 1,
      shifts: Array.isArray(l.shifts) && l.shifts.length > 0 ? [l.shifts[Math.min(i, l.shifts.length - 1)]] : l.shifts,
    }));
  });
}

/** Hydrate the premises decision. A saved, valid premises wins; otherwise we
 *  migrate legacy scenarios (which only had a flat rent line + setup cost) into
 *  a rent-mode premises that reproduces their numbers — rent from the old rent
 *  line, fit-out = old setup − deposit — so nothing shifts on first load. */
function hydratePremises(
  saved: Partial<SimulationPremises> | undefined,
  def: SimulationPremises,
  legacyRentGrosze?: number,
  legacySetupGrosze?: number,
): SimulationPremises {
  if (saved && typeof saved === "object" && (saved.mode === "rent" || saved.mode === "mortgage" || saved.mode === "buy")) {
    return {
      mode: saved.mode,
      monthlyRentGrosze: clampNonNeg(saved.monthlyRentGrosze, def.monthlyRentGrosze),
      depositMonths: clampNonNeg(saved.depositMonths, def.depositMonths),
      serviceChargeMonthlyGrosze: clampNonNeg(saved.serviceChargeMonthlyGrosze, def.serviceChargeMonthlyGrosze),
      purchasePriceGrosze: clampNonNeg(saved.purchasePriceGrosze, def.purchasePriceGrosze),
      downPaymentPct: clamp01(saved.downPaymentPct, def.downPaymentPct),
      mortgageRatePct: clamp01(saved.mortgageRatePct, def.mortgageRatePct),
      mortgageTermYears: clampNonNeg(saved.mortgageTermYears, def.mortgageTermYears),
      propertyTaxAnnualGrosze: clampNonNeg(saved.propertyTaxAnnualGrosze, def.propertyTaxAnnualGrosze),
      buildingMaintenanceMonthlyGrosze: clampNonNeg(saved.buildingMaintenanceMonthlyGrosze, def.buildingMaintenanceMonthlyGrosze),
      buildingDepreciationPct: clamp01(saved.buildingDepreciationPct, def.buildingDepreciationPct),
      propertyAppreciationPct: clamp01(saved.propertyAppreciationPct, def.propertyAppreciationPct),
      fitoutGrosze: clampNonNeg(saved.fitoutGrosze, def.fitoutGrosze),
      investHorizonYears: clampNonNeg(saved.investHorizonYears, def.investHorizonYears),
      menuPriceInflationPct: clamp01(saved.menuPriceInflationPct, def.menuPriceInflationPct),
      sp500RatePct: clamp01(saved.sp500RatePct, def.sp500RatePct),
      nasdaq100RatePct: clamp01(saved.nasdaq100RatePct, def.nasdaq100RatePct),
      bondRatePct: clamp01(saved.bondRatePct, def.bondRatePct),
    };
  }
  const rent = typeof legacyRentGrosze === "number" && legacyRentGrosze >= 0 ? legacyRentGrosze : def.monthlyRentGrosze;
  const deposit = rent * def.depositMonths;
  const fitout = typeof legacySetupGrosze === "number" && legacySetupGrosze >= 0
    ? Math.max(0, legacySetupGrosze - deposit)
    : def.fitoutGrosze;
  return { ...def, monthlyRentGrosze: rent, fitoutGrosze: fitout };
}

function clamp01(n: unknown, fallback: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function clampNonNeg(n: unknown, fallback: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.max(0, n);
}

function hydrateMenuScenarioOverrides(
  saved: Record<string, SimulationMenuScenarioOverride> | undefined,
): Record<string, SimulationMenuScenarioOverride> | undefined {
  if (!saved || typeof saved !== "object") return undefined;
  const out: Record<string, SimulationMenuScenarioOverride> = {};
  for (const [id, override] of Object.entries(saved)) {
    if (!override || typeof override !== "object") continue;
    const attach = (override as SimulationMenuScenarioOverride).attach ?? {
      coffee: 0,
      dessert: 0,
      antipasti: 0,
      aperitivo: 0,
      premiumToppings: 0,
      pastaPrimo: 0,
    };
    out[id] = {
      ordersPerDay: clampNonNeg(override.ordersPerDay, 0),
      daysOpenPerMonth: typeof override.daysOpenPerMonth === "number"
        ? Math.max(0, Math.min(31, Math.round(override.daysOpenPerMonth)))
        : 0,
      avgTicketGrosze: clampNonNeg(override.avgTicketGrosze, 0),
      cogsPct: clamp01(override.cogsPct, 0),
      attach: {
        coffee: clamp01(attach.coffee, 0),
        dessert: clamp01(attach.dessert, 0),
        antipasti: clamp01(attach.antipasti, 0),
        aperitivo: clamp01(attach.aperitivo, 0),
        premiumToppings: clamp01(attach.premiumToppings, 0),
        pastaPrimo: clamp01(attach.pastaPrimo, 0),
      },
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function hydrateIngredient(
  saved: Partial<SimulationIngredientLever> | undefined,
  fallback: SimulationIngredientLever | undefined,
): SimulationIngredientLever | undefined {
  if (!fallback && !saved) return undefined;
  const fb = fallback ?? { cogsShare: 0, costDeltaPct: 0 };
  if (!saved) return fb;
  // costDeltaPct can be negative (cost decrease) up to -1, positive up to +5.
  const clampDelta = (n: unknown, f: number): number => {
    if (typeof n !== "number" || !Number.isFinite(n)) return f;
    return Math.max(-1, Math.min(5, n));
  };
  return {
    enabled: typeof saved.enabled === "boolean" ? saved.enabled : (fb.enabled ?? false),
    cogsShare: clamp01(saved.cogsShare, fb.cogsShare),
    costDeltaPct: clampDelta(saved.costDeltaPct, fb.costDeltaPct),
  };
}

function hydrateIngredientsBlock(
  saved: SimulationAssumptions["ingredients"],
  fallback: SimulationAssumptions["ingredients"],
): SimulationAssumptions["ingredients"] {
  if (!saved && !fallback) return undefined;
  const keys: (keyof NonNullable<SimulationAssumptions["ingredients"]>)[] = [
    "mozzarella",
    "tomato",
    "flour",
    "doughWeight",
    "oliveOil",
    "curedMeats",
    "buffaloMozz",
    "eggs",
    "ovenFuel",
    "packaging",
  ];
  const out: NonNullable<SimulationAssumptions["ingredients"]> = {};
  for (const k of keys) {
    const hydrated = hydrateIngredient(saved?.[k], fallback?.[k]);
    if (hydrated) out[k] = hydrated;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function hydrateAttach(
  saved: Partial<SimulationAttachLever> | undefined,
  fallback: SimulationAttachLever | undefined,
): SimulationAttachLever | undefined {
  if (!fallback) return saved as SimulationAttachLever | undefined;
  if (!saved) return fallback;
  return {
    // When the saved scenario doesn't carry an explicit `enabled` flag,
    // fall through to the new default's value (false). Previously this
    // fell back to `true`, which meant old scenarios saved before the
    // all-off default landed kept their levers enabled on reload —
    // exactly the bug the user reported on the top 6 attach levers.
    enabled: typeof saved.enabled === "boolean" ? saved.enabled : (fallback.enabled ?? false),
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
          enabled: typeof saved.comboConversion.enabled === "boolean" ? saved.comboConversion.enabled : (fb.comboConversion?.enabled ?? false),
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
          enabled: typeof saved.cheapestPizzaShift.enabled === "boolean" ? saved.cheapestPizzaShift.enabled : (fb.cheapestPizzaShift?.enabled ?? false),
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
          enabled: typeof saved.deliveryShare.enabled === "boolean" ? saved.deliveryShare.enabled : (fb.deliveryShare?.enabled ?? false),
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
    // Hydrate every ingredient stress-test lever, preserving operator
    // toggles (enabled / disabled). Previously dropped on every save →
    // toggling ingredient levers off appeared to work in-memory but
    // didn't survive the next page load.
    ingredients: hydrateIngredientsBlock(saved.ingredients, fb.ingredients),
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

function hydrateFleet(
  saved: SimulationFleetModel | undefined,
  fallback: SimulationFleetModel | undefined,
): SimulationFleetModel | undefined {
  const fb = fallback ?? {
    unitCount: 1,
    hqOverheadMonthlyGrosze: 0,
    supplyDiscountAtUnits: 5,
    supplyDiscountPct: 0.10,
    commissaryEnabledAtUnits: 4,
    commissarySavingsPct: 0.04,
    royaltyPct: 0.06,
    marketingFundPct: 0.02,
    dmaOverlapPct: 0.15,
    buildoutLearningPct: 0.05,
    buildoutFloorPct: 0.55,
  };
  if (!saved) return fb;
  return {
    unitCount: typeof saved.unitCount === "number" && saved.unitCount > 0 ? Math.round(saved.unitCount) : fb.unitCount,
    hqOverheadMonthlyGrosze: clampNonNeg(saved.hqOverheadMonthlyGrosze, fb.hqOverheadMonthlyGrosze),
    supplyDiscountAtUnits: typeof saved.supplyDiscountAtUnits === "number" && saved.supplyDiscountAtUnits > 0 ? Math.round(saved.supplyDiscountAtUnits) : fb.supplyDiscountAtUnits,
    supplyDiscountPct: clamp01(saved.supplyDiscountPct, fb.supplyDiscountPct),
    commissaryEnabledAtUnits: typeof saved.commissaryEnabledAtUnits === "number" && saved.commissaryEnabledAtUnits > 0 ? Math.round(saved.commissaryEnabledAtUnits) : fb.commissaryEnabledAtUnits,
    commissarySavingsPct: clamp01(saved.commissarySavingsPct, fb.commissarySavingsPct),
    royaltyPct: clamp01(saved.royaltyPct, fb.royaltyPct),
    marketingFundPct: clamp01(saved.marketingFundPct, fb.marketingFundPct),
    dmaOverlapPct: clamp01(saved.dmaOverlapPct, fb.dmaOverlapPct),
    buildoutLearningPct: clamp01(saved.buildoutLearningPct, fb.buildoutLearningPct),
    buildoutFloorPct: clamp01(saved.buildoutFloorPct, fb.buildoutFloorPct),
  };
}

function hydrateKitchenCapacity(
  saved: SimulationKitchenCapacity | undefined,
  fallback: SimulationKitchenCapacity | undefined,
): SimulationKitchenCapacity | undefined {
  const fb = fallback ?? { pizzasPerHour: 70, openHoursPerDay: 10, peakHourSharePct: 0.35 };
  if (!saved) return fb;
  return {
    pizzasPerHour: clampNonNeg(saved.pizzasPerHour, fb.pizzasPerHour),
    openHoursPerDay: clampNonNeg(saved.openHoursPerDay, fb.openHoursPerDay),
    peakHourSharePct: clamp01(saved.peakHourSharePct, fb.peakHourSharePct),
    ovenPizzasPerCycle:
      typeof saved.ovenPizzasPerCycle === "number" && saved.ovenPizzasPerCycle > 0
        ? saved.ovenPizzasPerCycle
        : fb.ovenPizzasPerCycle,
    ovenCycleSeconds:
      typeof saved.ovenCycleSeconds === "number" && saved.ovenCycleSeconds > 0
        ? saved.ovenCycleSeconds
        : fb.ovenCycleSeconds,
    ovenEfficiencyPct:
      typeof saved.ovenEfficiencyPct === "number"
        ? clamp01(saved.ovenEfficiencyPct, fb.ovenEfficiencyPct ?? 0.22)
        : fb.ovenEfficiencyPct,
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
  const clampMaybe = (n: unknown): number | undefined => {
    if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
    return Math.max(0, Math.min(3, n));
  };
  let monthlyOverrides: (number | undefined)[] | undefined;
  if (Array.isArray(s.monthlyOverrides)) {
    monthlyOverrides = Array.from({ length: 12 }, (_, i) =>
      clampMaybe(s.monthlyOverrides?.[i]),
    );
    // Drop the array entirely if every slot is undefined — saves space
    // and keeps the saved JSON tidy for operators not using the feature.
    if (monthlyOverrides.every((v) => v === undefined)) monthlyOverrides = undefined;
  }
  return {
    winter: clamp(s.winter, fallback.winter),
    spring: clamp(s.spring, fallback.spring),
    summer: clamp(s.summer, fallback.summer),
    autumn: clamp(s.autumn, fallback.autumn),
    monthlyOverrides,
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
        hourlyRateGrosze: Math.max(0, Math.round(l.hourlyRateGrosze)),
        // `week` is the 7-day rota (source of truth). hoursPerWeek / daysPerWeek
        // / shifts are legacy and only kept if a scenario predates `week`.
        ...(Array.isArray(l.week)
          ? { week: l.week.slice(0, 7).map((sh) => (sh && typeof sh.start === "number" && typeof sh.end === "number" ? { start: Math.max(0, Math.round(sh.start)), end: Math.max(0, Math.round(sh.end)) } : null)) }
          : {}),
        ...(typeof l.hoursPerWeek === "number" ? { hoursPerWeek: Math.max(0, Math.round(l.hoursPerWeek)) } : {}),
        ...(typeof l.daysPerWeek === "number" ? { daysPerWeek: Math.max(0, Math.round(l.daysPerWeek)) } : {}),
        ...(Array.isArray(l.shifts) ? { shifts: l.shifts.map((sh) => ({ start: Math.max(0, Math.round(sh.start)), end: Math.max(0, Math.round(sh.end)) })) } : {}),
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
      menuScenarioOverrides: hydrateMenuScenarioOverrides(scenario.menuScenarioOverrides),
      assumptions: hydrateAssumptions(scenario.assumptions, defaults.assumptions),
      // Persist the migration marker so the v2 force-off only runs once
      // per scenario. Operator toggles after that survive reload normally.
      assumptionsMigrationVersion: typeof scenario.assumptionsMigrationVersion === "number" && scenario.assumptionsMigrationVersion >= ASSUMPTIONS_MIGRATION_VERSION
        ? scenario.assumptionsMigrationVersion
        : ASSUMPTIONS_MIGRATION_VERSION,
      weather: hydrateWeather(scenario.weather, defaults.weather),
      wastePct: clampSimPct(scenario.wastePct, defaults.wastePct ?? 0),
      refundPct: clampSimPct(scenario.refundPct, defaults.refundPct ?? 0),
      loyaltyBurnPct: clampSimPct(scenario.loyaltyBurnPct, defaults.loyaltyBurnPct ?? 0),
      citPct: clampSimPct(scenario.citPct, defaults.citPct ?? 0),
      cashSharePct: clampSimPct(scenario.cashSharePct, defaults.cashSharePct ?? 0),
      glovoSharePct: clampSimPct(scenario.glovoSharePct, defaults.glovoSharePct ?? 0),
      glovoFeePct: clampSimPct(scenario.glovoFeePct, defaults.glovoFeePct ?? 0),
      woltSharePct: clampSimPct(scenario.woltSharePct, defaults.woltSharePct ?? 0),
      woltFeePct: clampSimPct(scenario.woltFeePct, defaults.woltFeePct ?? 0),
      kitchenCapacity: hydrateKitchenCapacity(scenario.kitchenCapacity, defaults.kitchenCapacity),
      laborVariablePct: clampSimPct(scenario.laborVariablePct, defaults.laborVariablePct ?? 0.4),
      laborAnchorOrdersPerDay:
        typeof scenario.laborAnchorOrdersPerDay === "number" && scenario.laborAnchorOrdersPerDay > 0
          ? Math.round(scenario.laborAnchorOrdersPerDay)
          : (defaults.laborAnchorOrdersPerDay ?? 70),
      depreciationMonthlyGrosze:
        typeof scenario.depreciationMonthlyGrosze === "number" && scenario.depreciationMonthlyGrosze >= 0
          ? Math.round(scenario.depreciationMonthlyGrosze)
          : (defaults.depreciationMonthlyGrosze ?? 0),
      interestMonthlyGrosze:
        typeof scenario.interestMonthlyGrosze === "number" && scenario.interestMonthlyGrosze >= 0
          ? Math.round(scenario.interestMonthlyGrosze)
          : (defaults.interestMonthlyGrosze ?? 0),
      packagingPerOrderGrosze:
        typeof scenario.packagingPerOrderGrosze === "number" && scenario.packagingPerOrderGrosze >= 0
          ? Math.round(scenario.packagingPerOrderGrosze)
          : (defaults.packagingPerOrderGrosze ?? 0),
      marketingAsCac:
        typeof scenario.marketingAsCac === "boolean"
          ? scenario.marketingAsCac
          : (defaults.marketingAsCac ?? true),
      prepComplexityMultiplier:
        typeof scenario.prepComplexityMultiplier === "number" && scenario.prepComplexityMultiplier > 0
          ? Math.max(0.5, Math.min(3, scenario.prepComplexityMultiplier))
          : (defaults.prepComplexityMultiplier ?? 1),
      fleet: hydrateFleet(scenario.fleet, defaults.fleet),
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

  // Seed one labor line per payroll ledger entry so the operator can
  // simulate per-person changes (raises, hours cuts, hires) — aggregating
  // by role would conflate "1 manager at 9 000 zł" with "3 line cooks
  // at 3 000 zł each" into a single synthetic row.
  const payrollLines: BusinessCost[] = [];
  const fixed: Partial<Record<BusinessCostCategory, number>> = {};
  for (const c of active) {
    if (c.frequency === "one-off") continue;
    if (c.category === "payroll") {
      payrollLines.push(c);
    } else {
      const monthly = Math.round(c.amountGrosze * FREQUENCY_TO_MONTHS_INTERNAL[c.frequency]);
      fixed[c.category] = (fixed[c.category] ?? 0) + monthly;
    }
  }

  const labor: SimulationLaborLine[] =
    payrollLines.length > 0
      ? payrollLines.map((c, i) => {
          const monthlyGrosze = Math.round(
            c.amountGrosze * FREQUENCY_TO_MONTHS_INTERNAL[c.frequency],
          );
          // 40 h/week × 4.345 weeks/month = 173.8 h/month as the default
          // shape for a single full-time hire. Operator can refine
          // headcount/hours/rate per line afterwards.
          const monthlyHours = 40 * 4.345;
          const hourlyRateGrosze =
            monthlyHours > 0 ? Math.round(monthlyGrosze / monthlyHours) : 0;
          return {
            id: `seed-${c.id ?? i}`,
            role: c.payrollRole ?? "other",
            headcount: 1,
            hoursPerWeek: 40,
            hourlyRateGrosze,
          };
        })
      : base.labor;

  // Pull volume + ticket from the real orders ledger so the operator
  // doesn't start staring at hardcoded defaults. The actuals snapshot
  // also lands the channel mix (delivery share) which materially
  // changes blended COGS via packaging.
  const actuals = await computeSimulationActuals(90).catch(() => null);

  const seeded: SimulationScenario = {
    ...base,
    labor,
    fixedCosts: Object.keys(fixed).length > 0 ? fixed : base.fixedCosts,
    updatedAt: new Date().toISOString(),
  };

  if (actuals && actuals.ordersCount >= 20) {
    seeded.ordersPerDay = Math.max(1, Math.round(actuals.ordersPerDay));
    seeded.avgTicketGrosze = Math.max(0, Math.round(actuals.avgTicketGrosze));
    if (actuals.weightedCogsPct > 0) {
      // Food cost + waste split so the two Calculator levers stay honest and
      // don't double-count (base + waste === total dish cost).
      seeded.cogsPct = clamp01(actuals.weightedFoodCostPct, seeded.cogsPct);
      seeded.wastePct = clamp01(actuals.weightedWastePct, seeded.wastePct ?? 0);
    }
    // Map delivery share from actuals onto the existing deliveryShare lever
    // so downstream packaging + processor math picks it up.
    if (seeded.assumptions?.deliveryShare && actuals.deliverySharePct > 0) {
      seeded.assumptions = {
        ...seeded.assumptions,
        deliveryShare: {
          ...seeded.assumptions.deliveryShare,
          pct: clamp01(actuals.deliverySharePct, seeded.assumptions.deliveryShare.pct),
        },
      };
    }
    // Refund rate from actuals is more trustworthy than the 1.5% default.
    if (actuals.refundPct > 0) {
      seeded.refundPct = clamp01(actuals.refundPct, seeded.refundPct ?? 0.015);
    }
  }
  return seeded;
}

/** Compute a rolling-window snapshot of actual orders. The simulator uses
 *  this both as a one-click seed source and as a "stale" warning when the
 *  operator's ordersPerDay / avgTicket drifts > 15% from real history. */
/** Per-item modifier lookup index — keyed by item.id, value is a
 *  Map<groupId, Map<optionId, ModifierOption>>. Built once and shared
 *  across every line of every order in a compute pass, so a 90-day
 *  window with millions of modifier lookups is O(1) per resolve
 *  instead of O(groups × options) via find(). */
type ModifierOptionLookup = Map<string, Map<string, NonNullable<NonNullable<MenuItem["modifierGroups"]>[number]>["options"][number]>>;
type ModifierIndexCache = Map<string, ModifierOptionLookup>;

function getModifierIndex(item: MenuItem, cache: ModifierIndexCache): ModifierOptionLookup {
  let idx = cache.get(item.id);
  if (idx) return idx;
  idx = new Map();
  for (const g of item.modifierGroups ?? []) {
    const optMap = new Map<string, (typeof g.options)[number]>();
    for (const o of g.options) optMap.set(o.id, o);
    idx.set(g.id, optMap);
  }
  cache.set(item.id, idx);
  return idx;
}

export async function computeSimulationActuals(
  windowDays = 90,
): Promise<SimulationActualsSnapshot> {
  const cutoffMs = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const sinceISO = new Date(cutoffMs).toISOString();
  // Push the date filter into the DB query — uses orders_created_at_idx
  // so a 90d window over millions of rows is a fast index seek, not a
  // full-table scan + in-memory slice.
  const inWindow = await getOrders(undefined, sinceISO);
  const cancelledCount = inWindow.filter((o) => o.status === "cancelled").length;
  const fulfilled = inWindow.filter((o) => o.status !== "cancelled");
  const ordersCount = fulfilled.length;
  const totalGrosze = fulfilled.reduce((sum, o) => sum + (o.totalAmount ?? 0), 0);
  const avgTicketGrosze = ordersCount > 0 ? Math.round(totalGrosze / ordersCount) : 0;
  // Weighted COGS: sum(qty × (item.cost + Σ option.costDelta)) /
  // sum(qty × (item.price + Σ option.priceDelta)) across every line item
  // in every fulfilled order. The honest replacement for the operator's
  // flat cogsPct guess.
  //
  // The Calculator wants Food-cost-% and Waste-% as *separate* levers, so we
  // also split each line's cost into the ingredient that reaches the plate vs
  // the trim/spill overhead. The waste fraction comes from the *current*
  // recipe's wasteFactor (stable per dish); it's applied to the snapshot line
  // cost so the total (weightedCogsPct) never regresses. Items without a live
  // recipe contribute 0 waste (no data), all cost counts as food.
  //
  // Recipes + ingredients + products are read ONCE (not per dish) and keyed by
  // base slug — recipes are chain-wide (rule #10), so both locations' identical
  // dishes share one waste fraction, and this stays 3 catalog reads regardless
  // of menu size on a hot admin path.
  const baseSlugs = new Set<string>();
  for (const o of fulfilled) {
    for (const line of o.items ?? []) {
      if (line.menuItem) baseSlugs.add(getBaseSlug(line.menuItem.id));
    }
  }
  const [allRecipes, allIngredients, allProducts] = await Promise.all([
    getRecipes(),
    getIngredients(),
    getIngredientProducts(),
  ]);
  const recipeBySlug = new Map(allRecipes.map((r) => [getBaseSlug(r.menuItemId), r]));
  const ingById = new Map(allIngredients.map((i) => [i.id, i]));
  const productById = new Map(allProducts.map((p) => [p.id, p]));
  const wasteFractionBySlug = new Map<string, number>();
  for (const slug of baseSlugs) {
    const recipe = recipeBySlug.get(slug);
    if (!recipe || recipe.ingredients.length === 0) { wasteFractionBySlug.set(slug, 0); continue; }
    let base = 0;
    let total = 0;
    for (const ri of recipe.ingredients) {
      const ing = ingById.get(ri.ingredientId);
      const product = ing?.activeProductId ? productById.get(ing.activeProductId) : undefined;
      if (!product) continue;
      const lineBase = product.costPerUnit * ri.quantity;
      base += lineBase;
      total += lineBase * (ri.wasteFactor || 1);
    }
    wasteFractionBySlug.set(slug, total > 0 ? (total - base) / total : 0);
  }

  let menuCostTotal = 0;
  let menuWasteTotal = 0;
  let menuRevenueTotal = 0;
  const modIndex: ModifierIndexCache = new Map();
  for (const o of fulfilled) {
    for (const line of o.items ?? []) {
      const item = line.menuItem;
      if (!item) continue;
      const qty = Math.max(0, line.quantity ?? 1);
      let lineCost = item.cost ?? 0;
      let linePrice = item.price ?? 0;
      const lookup = getModifierIndex(item, modIndex);
      for (const sel of line.selectedModifiers ?? []) {
        const opt = lookup.get(sel.groupId)?.get(sel.optionId);
        if (opt) {
          linePrice += Math.max(0, opt.priceDelta ?? 0);
          lineCost += Math.max(0, opt.costDelta ?? 0);
        }
      }
      menuCostTotal += qty * lineCost;
      menuWasteTotal += qty * lineCost * (wasteFractionBySlug.get(getBaseSlug(item.id)) ?? 0);
      menuRevenueTotal += qty * linePrice;
    }
  }
  const weightedCogsPct = menuRevenueTotal > 0 ? menuCostTotal / menuRevenueTotal : 0;
  const weightedWastePct = menuRevenueTotal > 0 ? menuWasteTotal / menuRevenueTotal : 0;
  // Food cost ex-waste — what the Calculator's Food-cost-% lever holds so it
  // and the Waste-% lever sum back to the true dish cost.
  const weightedFoodCostPct = Math.max(0, weightedCogsPct - weightedWastePct);
  const dayKeys = new Set(
    fulfilled
      .map((o) => {
        const d = new Date(o.createdAt);
        return Number.isFinite(d.valueOf())
          ? `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
          : null;
      })
      .filter((k): k is string => k !== null),
  );
  const daysWithOrders = dayKeys.size;
  const ordersPerDay = daysWithOrders > 0 ? ordersCount / daysWithOrders : 0;
  const deliveryCount = fulfilled.filter((o) => o.fulfillmentType === "delivery").length;
  const takeoutCount = fulfilled.filter((o) => o.fulfillmentType === "takeout").length;
  const deliverySharePct = ordersCount > 0 ? deliveryCount / ordersCount : 0;
  const takeoutSharePct = ordersCount > 0 ? takeoutCount / ordersCount : 0;
  const refundPct = inWindow.length > 0 ? cancelledCount / inWindow.length : 0;
  // Ticket time: createdAt → estimatedReadyAt for orders that carry both.
  // Median is robust to the long tail of "ready Friday" pre-orders.
  const ticketTimes: number[] = [];
  for (const o of fulfilled) {
    if (!o.estimatedReadyAt) continue;
    const start = Date.parse(o.createdAt);
    const end = Date.parse(o.estimatedReadyAt);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const seconds = (end - start) / 1000;
    if (seconds <= 0 || seconds > 86400) continue;
    ticketTimes.push(seconds);
  }
  let medianTicketTimeSeconds: number | null = null;
  if (ticketTimes.length > 0) {
    ticketTimes.sort((a, b) => a - b);
    const mid = Math.floor(ticketTimes.length / 2);
    medianTicketTimeSeconds =
      ticketTimes.length % 2 === 0
        ? (ticketTimes[mid - 1] + ticketTimes[mid]) / 2
        : ticketTimes[mid];
  }
  const earliest = fulfilled
    .map((o) => Date.parse(o.createdAt))
    .filter((t) => Number.isFinite(t))
    .reduce((m, t) => Math.min(m, t), Date.now());
  return {
    windowDays,
    ordersCount,
    daysWithOrders,
    ordersPerDay,
    avgTicketGrosze,
    weightedCogsPct,
    weightedFoodCostPct,
    weightedWastePct,
    takeoutSharePct,
    deliverySharePct,
    refundPct,
    medianTicketTimeSeconds,
    fromISO: new Date(earliest).toISOString(),
    generatedAt: new Date().toISOString(),
  };
}

/** Same-store sales growth — trailing window vs prior trailing window
 *  of the same length. Decomposes the growth into volume (orders),
 *  price/mix (avg ticket), and acquisition (distinct customers) so the
 *  operator knows what drove the move. */
export async function computeSssg(
  windowDays = 30,
): Promise<SimulationSssgSnapshot> {
  const now = Date.now();
  const oneWindow = windowDays * 24 * 60 * 60 * 1000;
  const currentStart = now - oneWindow;
  const priorStart = now - 2 * oneWindow;
  // Need both windows — fetch the full 2× span once and partition in
  // memory rather than two round trips. Still DB-filtered to the prior
  // window's start, so we avoid scanning the whole orders table.
  const all = await getOrders(undefined, new Date(priorStart).toISOString());
  let currentRev = 0, priorRev = 0;
  let currentOrders = 0, priorOrders = 0;
  const currentPhones = new Set<string>();
  const priorPhones = new Set<string>();
  for (const o of all) {
    if (o.status === "cancelled") continue;
    const t = Date.parse(o.createdAt);
    if (!Number.isFinite(t)) continue;
    if (t >= currentStart && t < now) {
      currentRev += o.totalAmount ?? 0;
      currentOrders += 1;
      if (o.customerPhone) currentPhones.add(o.customerPhone.trim());
    } else if (t >= priorStart && t < currentStart) {
      priorRev += o.totalAmount ?? 0;
      priorOrders += 1;
      if (o.customerPhone) priorPhones.add(o.customerPhone.trim());
    }
  }
  const pct = (a: number, b: number): number =>
    b > 0 ? (a - b) / b : a > 0 ? 1 : 0;
  const currentTicket = currentOrders > 0 ? currentRev / currentOrders : 0;
  const priorTicket = priorOrders > 0 ? priorRev / priorOrders : 0;
  return {
    windowDays,
    currentRevenueGrosze: currentRev,
    priorRevenueGrosze: priorRev,
    revenueGrowthPct: pct(currentRev, priorRev),
    orderGrowthPct: pct(currentOrders, priorOrders),
    ticketGrowthPct: pct(currentTicket, priorTicket),
    customerGrowthPct: pct(currentPhones.size, priorPhones.size),
    currentOrders,
    priorOrders,
    currentCustomers: currentPhones.size,
    priorCustomers: priorPhones.size,
    generatedAt: new Date().toISOString(),
  };
}

/** Live activity snapshot for the customer-site `<LiveActivityBar />` — every
 *  figure is computed from REAL orders for the location (the fabricated
 *  `simulateLiveActivity` helper this replaced was deleted). Counts are over a
 *  rolling 3-hour window; the renderer hides any stat that comes back
 *  0 / null so a quiet location never shows a sad or invented number. */
export interface LiveActivitySnapshot {
  ordersInLastHour: number;
  currentlyPreparing: number;
  popularItemNow: string | null;
  avgPrepTimeMinutes: number | null;
}

export async function getLiveActivity(locationSlug: string): Promise<LiveActivitySnapshot> {
  const now = Date.now();
  // 3h window covers trending + any still-active ticket; getOrders strips
  // simulated KDS demo tickets so they never inflate the public numbers.
  const recent = (await getOrders(locationSlug, new Date(now - 3 * 60 * 60 * 1000).toISOString()))
    .filter((o) => o.status !== "cancelled");

  const hourAgo = now - 60 * 60 * 1000;
  const ordersInLastHour = recent.filter((o) => Date.parse(o.createdAt) >= hourAgo).length;
  const currentlyPreparing = recent.filter((o) => o.status === "confirmed" || o.status === "preparing").length;

  // Trending — most-ordered dish by quantity across the window.
  const counts = new Map<string, number>();
  for (const o of recent) {
    for (const line of o.items ?? []) {
      const name = line.menuItem?.name;
      if (name) counts.set(name, (counts.get(name) ?? 0) + (line.quantity ?? 1));
    }
  }
  let popularItemNow: string | null = null;
  let top = 0;
  for (const [name, n] of counts) if (n > top) { top = n; popularItemNow = name; }

  // Avg prep — the kitchen's own ready estimate vs order time, over orders
  // that carry one. Null when none do (so the widget hides rather than guess).
  let prepSum = 0, prepN = 0;
  for (const o of recent) {
    if (!o.estimatedReadyAt) continue;
    const d = Date.parse(o.estimatedReadyAt) - Date.parse(o.createdAt);
    if (Number.isFinite(d) && d > 0) { prepSum += d; prepN += 1; }
  }
  const avgPrepTimeMinutes = prepN > 0 ? Math.round(prepSum / prepN / 60000) : null;

  return { ordersInLastHour, currentlyPreparing, popularItemNow, avgPrepTimeMinutes };
}

/** Hourly throughput — per-hour orders / day from real data, optionally
 *  shown against the kitchenCapacity ceiling so rush-hour blow-out is
 *  visible. Returns 24 rows always (hour 0..23) — even unused hours so
 *  the chart x-axis stays consistent. */
export async function computeHourlyThroughput(
  windowDays = 30,
  pizzasPerHourCap = 0,
): Promise<SimulationHourlyThroughputLine[]> {
  const cutoffMs = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const all = await getOrders(undefined, new Date(cutoffMs).toISOString());
  const fulfilled = all.filter((o) => {
    if (o.status === "cancelled") return false;
    const t = Date.parse(o.createdAt);
    return Number.isFinite(t) && t >= cutoffMs;
  });
  const dayKeys = new Set<string>();
  const byHour: number[] = new Array(24).fill(0);
  for (const o of fulfilled) {
    const d = new Date(o.createdAt);
    if (!Number.isFinite(d.valueOf())) continue;
    byHour[d.getUTCHours()] += 1;
    dayKeys.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`);
  }
  const activeDays = Math.max(1, dayKeys.size);
  return byHour.map((count, hour) => {
    const avg = count / activeDays;
    return {
      hour,
      totalOrders: count,
      avgOrdersPerHour: avg,
      capacityUtilization: pizzasPerHourCap > 0 ? avg / pizzasPerHourCap : 0,
    };
  });
}

/** Daypart split — buckets fulfilled orders by createdAt local-time hour
 *  and computes per-bucket volume, avg ticket, and gross profit. Surfaces
 *  the lunch / dinner / late-night economics separately because the
 *  daily average hides menu-mix shifts (late-night = slice-heavy at 76%
 *  GM, dinner = full plates, lunch = mid-AOV panini). */
export async function computeDayparts(
  windowDays = 90,
): Promise<SimulationDaypartLine[]> {
  const cutoffMs = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const all = await getOrders(undefined, new Date(cutoffMs).toISOString());
  const fulfilled = all.filter((o) => {
    if (o.status === "cancelled") return false;
    const t = Date.parse(o.createdAt);
    return Number.isFinite(t) && t >= cutoffMs;
  });

  // Local-time hour — we use UTC because the codebase doesn't track
  // location timezones explicitly and Polish locations are UTC+1/+2.
  // Service window matches the operator's 12-22 truck schedule with
  // a 1h prep + 1h cleandown bracket. Bucket edges are wide enough
  // that a 1h DST shift doesn't move orders between rushes.
  const bucketFor = (hour: number): SimulationDaypartLine["key"] => {
    if (hour >= 12 && hour < 15) return "lunch";
    if (hour >= 15 && hour < 17) return "off-peak";
    if (hour >= 17 && hour < 22) return "dinner";
    if (hour >= 22 || hour < 4) return "late-night";
    return "off-peak";
  };

  type Agg = { orders: number; revenue: number; gp: number };
  const modIndex: ModifierIndexCache = new Map();
  const agg: Record<SimulationDaypartLine["key"], Agg> = {
    lunch: { orders: 0, revenue: 0, gp: 0 },
    dinner: { orders: 0, revenue: 0, gp: 0 },
    "late-night": { orders: 0, revenue: 0, gp: 0 },
    "off-peak": { orders: 0, revenue: 0, gp: 0 },
  };

  for (const o of fulfilled) {
    const d = new Date(o.createdAt);
    if (!Number.isFinite(d.valueOf())) continue;
    const bucket = bucketFor(d.getUTCHours());
    let orderGp = 0;
    for (const line of o.items ?? []) {
      const item = line.menuItem;
      if (!item) continue;
      const qty = Math.max(0, line.quantity ?? 1);
      let price = item.price ?? 0;
      let cost = item.cost ?? 0;
      const lookup = getModifierIndex(item, modIndex);
      for (const sel of line.selectedModifiers ?? []) {
        const opt = lookup.get(sel.groupId)?.get(sel.optionId);
        if (opt) {
          price += Math.max(0, opt.priceDelta ?? 0);
          cost += Math.max(0, opt.costDelta ?? 0);
        }
      }
      orderGp += qty * (price - cost);
    }
    const a = agg[bucket];
    a.orders += 1;
    a.revenue += o.totalAmount ?? 0;
    a.gp += orderGp;
  }

  const totalOrders = fulfilled.length;
  const meta: Record<SimulationDaypartLine["key"], { label: string; hours: string }> = {
    lunch: { label: "Lunch", hours: "12:00 – 15:00" },
    "off-peak": { label: "Mid-afternoon", hours: "15:00 – 17:00" },
    dinner: { label: "Dinner", hours: "17:00 – 22:00" },
    "late-night": { label: "Late-night (closed)", hours: "22:00 – 04:00" },
  };

  return (Object.keys(agg) as Array<SimulationDaypartLine["key"]>).map((k) => {
    const a = agg[k];
    return {
      key: k,
      label: meta[k].label,
      hours: meta[k].hours,
      ordersCount: a.orders,
      sharePct: totalOrders > 0 ? a.orders / totalOrders : 0,
      avgTicketGrosze: a.orders > 0 ? Math.round(a.revenue / a.orders) : 0,
      revenueGrosze: a.revenue,
      gpGrosze: a.gp,
      gpRatePct: a.revenue > 0 ? a.gp / a.revenue : 0,
    };
  });
}

/** Cohort retention snapshot — groups orders by phone, computes repeat
 *  rate, lifetime stats, and acquisition velocity over the window. The
 *  loyalty engine on this codebase already collects phone at checkout
 *  (CLAUDE.md rule #6 — zero-friction phone-based enrolment), so this
 *  is a direct read off the real customer base. */
export async function computeCohortSnapshot(
  windowDays = 180,
): Promise<SimulationCohortSnapshot> {
  const cutoffMs = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  // We need orders from BEFORE the window to identify "returning"
  // customers (anyone who ordered earlier and again inside the window).
  // Cap the lookback at 2× the window — anyone whose only prior order
  // was 360+ days ago for a 180-day window is "new" for practical
  // purposes; institutional cohort retention rarely looks further back.
  const lookbackMs = cutoffMs - windowDays * 24 * 60 * 60 * 1000;
  const all = await getOrders(undefined, new Date(lookbackMs).toISOString());
  // Pre-pass: which customers had ≥1 order BEFORE the window? They're
  // "returning" inside the window; everyone else is "new".
  const preWindowCustomers = new Set<string>();
  for (const o of all) {
    if (o.status === "cancelled") continue;
    if (!o.customerPhone) continue;
    const t = Date.parse(o.createdAt);
    if (!Number.isFinite(t) || t >= cutoffMs) continue;
    preWindowCustomers.add(o.customerPhone.trim());
  }
  const fulfilled = all.filter((o) => {
    if (o.status === "cancelled") return false;
    if (!o.customerPhone) return false;
    const t = Date.parse(o.createdAt);
    return Number.isFinite(t) && t >= cutoffMs;
  });

  type CustomerAgg = { orders: number; revenue: number; gp: number };
  const byPhone = new Map<string, CustomerAgg>();
  const modIndex: ModifierIndexCache = new Map();
  for (const o of fulfilled) {
    const phone = o.customerPhone.trim();
    if (!phone) continue;
    let orderGp = 0;
    for (const line of o.items ?? []) {
      const item = line.menuItem;
      if (!item) continue;
      const qty = Math.max(0, line.quantity ?? 1);
      let price = item.price ?? 0;
      let cost = item.cost ?? 0;
      const lookup = getModifierIndex(item, modIndex);
      for (const sel of line.selectedModifiers ?? []) {
        const opt = lookup.get(sel.groupId)?.get(sel.optionId);
        if (opt) {
          price += Math.max(0, opt.priceDelta ?? 0);
          cost += Math.max(0, opt.costDelta ?? 0);
        }
      }
      orderGp += qty * (price - cost);
    }
    const agg = byPhone.get(phone) ?? { orders: 0, revenue: 0, gp: 0 };
    agg.orders += 1;
    agg.revenue += o.totalAmount ?? 0;
    agg.gp += orderGp;
    byPhone.set(phone, agg);
  }

  const totalCustomers = byPhone.size;
  let repeatCustomers = 0;
  let totalOrders = 0;
  let totalRevenue = 0;
  let totalGp = 0;
  let newCustomerRevenueGrosze = 0;
  let returningCustomerRevenueGrosze = 0;
  for (const [phone, agg] of byPhone.entries()) {
    if (agg.orders >= 2) repeatCustomers += 1;
    totalOrders += agg.orders;
    totalRevenue += agg.revenue;
    totalGp += agg.gp;
    if (preWindowCustomers.has(phone)) {
      returningCustomerRevenueGrosze += agg.revenue;
    } else {
      newCustomerRevenueGrosze += agg.revenue;
    }
  }
  const repeatRatePct = totalCustomers > 0 ? repeatCustomers / totalCustomers : 0;
  const avgOrdersPerCustomer = totalCustomers > 0 ? totalOrders / totalCustomers : 0;
  const avgRevenuePerCustomerGrosze =
    totalCustomers > 0 ? Math.round(totalRevenue / totalCustomers) : 0;
  const avgGpPerCustomerGrosze =
    totalCustomers > 0 ? Math.round(totalGp / totalCustomers) : 0;
  // Annualised acquisition rate: customers / (windowDays/30.4) months.
  const monthsInWindow = windowDays / 30.4375;
  const newCustomersPerMonth = monthsInWindow > 0 ? totalCustomers / monthsInWindow : 0;

  return {
    windowDays,
    totalCustomers,
    repeatCustomers,
    repeatRatePct,
    avgOrdersPerCustomer,
    avgRevenuePerCustomerGrosze,
    avgGpPerCustomerGrosze,
    newCustomersPerMonth,
    newCustomerRevenueGrosze,
    returningCustomerRevenueGrosze,
    generatedAt: new Date().toISOString(),
  };
}

/** Kasavana-Smith menu engineering. Groups every sold item by quadrant
 *  (star / plowhorse / puzzle / dog) over a rolling-window of orders.
 *  Quadrants split at the median velocity and median per-unit gross
 *  profit across the line items that sold ≥ 1 unit. Now also enriches
 *  each row with TrueCM1 (after the scenario's blended payment fee +
 *  waste + refund + loyalty), deliveryOnly / prepHeavy / spoilageRisk
 *  flags for the margin-trap callout. */
export async function computeMenuEngineering(
  windowDays = 90,
  scenarioOverride?: { paymentProcessorPct?: number; wastePct?: number; refundPct?: number; loyaltyBurnPct?: number },
  locationSlug?: string,
): Promise<SimulationMenuEngineeringLine[]> {
  const cutoffMs = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const all = await getOrders(locationSlug, new Date(cutoffMs).toISOString());
  const fulfilled = all.filter((o) => {
    if (o.status === "cancelled") return false;
    const t = Date.parse(o.createdAt);
    return Number.isFinite(t) && t >= cutoffMs;
  });

  const scenarioForCm = scenarioOverride ?? (await getSimulationScenario());
  const feePct = scenarioForCm.paymentProcessorPct ?? 0;
  const wastePct = scenarioForCm.wastePct ?? 0;
  const refundPct = scenarioForCm.refundPct ?? 0;
  const loyaltyPct = scenarioForCm.loyaltyBurnPct ?? 0;
  const leakageRate = feePct + wastePct + refundPct + loyaltyPct;

  type Agg = { item: MenuItem; units: number; revenue: number; cost: number };
  const byItem = new Map<string, Agg>();
  const modIndex: ModifierIndexCache = new Map();
  for (const o of fulfilled) {
    for (const line of o.items ?? []) {
      const item = line.menuItem;
      if (!item) continue;
      const qty = Math.max(0, line.quantity ?? 1);
      let linePrice = item.price ?? 0;
      let lineCost = item.cost ?? 0;
      const lookup = getModifierIndex(item, modIndex);
      for (const sel of line.selectedModifiers ?? []) {
        const opt = lookup.get(sel.groupId)?.get(sel.optionId);
        if (opt) {
          linePrice += Math.max(0, opt.priceDelta ?? 0);
          lineCost += Math.max(0, opt.costDelta ?? 0);
        }
      }
      const agg = byItem.get(item.id) ?? { item, units: 0, revenue: 0, cost: 0 };
      agg.units += qty;
      agg.revenue += qty * linePrice;
      agg.cost += qty * lineCost;
      byItem.set(item.id, agg);
    }
  }

  // Spoilage-risk heuristics — short shelf life and high spoilage cost
  // per unit. Match by name fragment (case-insensitive) since the menu
  // doesn't carry a shelfLife field.
  const SPOILAGE_KEYWORDS = ["burrata", "truffle", "tartufata", "frozen", "tiramisù", "tiramisu"];

  const rows = Array.from(byItem.values())
    .filter((a) => a.units > 0)
    .map((a) => {
      const pricePerUnit = a.units > 0 ? a.revenue / a.units : 0;
      const costPerUnit = a.units > 0 ? a.cost / a.units : 0;
      const gpPerUnit = pricePerUnit - costPerUnit;
      // True CM1 = price × (1 − leakage) − cost.
      // For delivery-only items, swap the scenario's blended feePct for
      // a realistic marketplace commission (Glovo 27% / Wolt 28% avg ≈ 27%).
      const isDelivery = a.item.deliveryOnly === true;
      const effectiveLeakage = isDelivery
        ? 0.27 + wastePct + refundPct + loyaltyPct
        : leakageRate;
      const trueCm1 = pricePerUnit * (1 - effectiveLeakage) - costPerUnit;
      const nameLower = a.item.name.toLowerCase();
      const spoilageRisk = SPOILAGE_KEYWORDS.some((k) => nameLower.includes(k));
      const role = a.item.menuRole;
      return {
        menuItemId: a.item.id,
        name: a.item.name,
        category: a.item.category ?? "other",
        unitsSold: a.units,
        gpPerUnit,
        revenue: a.revenue,
        cost: a.cost,
        deliveryOnly: isDelivery,
        prepTimeMinutes: a.item.prepTimeMinutes ?? 0,
        trueCm1PerUnit: trueCm1,
        spoilageRisk,
        menuRole: role === "hero" || role === "profit-driver" || role === "anchor" ? role : undefined,
      };
    });

  if (rows.length === 0) return [];

  const median = (xs: number[]): number => {
    const sorted = [...xs].sort((x, y) => x - y);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  };
  const medianUnits = median(rows.map((r) => r.unitsSold));
  const medianGp = median(rows.map((r) => r.gpPerUnit));
  const medianPrep = median(rows.map((r) => r.prepTimeMinutes).filter((p) => p > 0));

  return rows.map((r): SimulationMenuEngineeringLine => {
    const highVol = r.unitsSold >= medianUnits;
    const highGp = r.gpPerUnit >= medianGp;
    const quadrant: SimulationMenuEngineeringLine["quadrant"] =
      highVol && highGp
        ? "star"
        : highVol && !highGp
          ? "plowhorse"
          : !highVol && highGp
            ? "puzzle"
            : "dog";
    // Margin trap: looks high-margin (GM ≥ 50%) but TrueCM1 falls below
    // half the per-item GP — usually delivery-only items chewed up by
    // marketplace commission, or items where waste/refund stacks high.
    const gmRatio = r.revenue > 0 ? r.gpPerUnit / (r.revenue / Math.max(1, r.unitsSold)) : 0;
    const marginTrap = gmRatio >= 0.50 && r.trueCm1PerUnit < r.gpPerUnit * 0.50;
    const prepHeavy = medianPrep > 0 && r.prepTimeMinutes >= medianPrep * 1.5;
    return { ...r, quadrant, marginTrap, prepHeavy };
  });
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

// --- Idempotency keys (Phase 2: durable write queue) ----------------------
// See docs/strategy/core-v2-local-first.md §3.2.
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Run `fn` at most once per idempotency `key`. A retry carrying the same key (a
 * client that didn't hear back and re-sent, or a double-tap) returns the
 * **stored result** of the first success instead of re-running the mutation —
 * so a charge can't double-fire and a re-send can't duplicate a ticket across
 * the lost-response window.
 *
 * Correctness details:
 *  - serialized per key via the distributed lock, so two concurrent retries
 *    can't both miss the cache and both run `fn`;
 *  - only *successful* results are memoized — a thrown error leaves the key
 *    unset so a genuine failure stays retryable;
 *  - each result is its own kv row / file (`idemp:<key>`) with a 24 h read TTL,
 *    which comfortably covers any retry burst;
 *  - a falsy key (caller opted out) just runs `fn` directly.
 */
export async function withIdempotency<T>(
  key: string | null | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  if (!key) return fn();
  const slot = `idemp:${key}`;
  return withLockScoped("idemp", key, async () => {
    const existing = await readJSON<{ at: number; result: T } | null>(slot, null);
    if (existing && Date.now() - existing.at < IDEMPOTENCY_TTL_MS) {
      return existing.result;
    }
    const result = await fn();
    await writeJSON(slot, { at: Date.now(), result });
    return result;
  });
}

// --- Floor: tables + reservations (per location) -------------------------
// JSON-backed list entities (mirrors the supplier / purchase-order pattern):
// withLock + readJSON/writeJSON, upsert by id. Per-location filtering happens
// on read so the API can scope to the caller's location.

// --- Per-location JSON-list store (m3 contention split) -------------------
//
// Generalises the POS-tabs split to the floor data layer. A single global
// `<base>.json` blob means every location serializes on one withLock — a Kraków
// seat/clear blocked a Warszawa one. These helpers key the data per location
// (`<base>.<loc>.json`) and lock per location, so writes at different trucks
// never contend. A draining legacy union keeps any pre-split rows visible and
// promotes them into their per-location key on the first write for that
// location; new rows never touch legacy, so it empties and is then skipped via
// a per-instance latch. For row types shaped { id, locationSlug }.

interface PerLocationBlob<T extends { id: string; locationSlug: string }> {
  /** Rows for one location (per-location key ∪ not-yet-promoted legacy rows). */
  readForLocation(loc: string): Promise<T[]>;
  /** Rows across every active location + any legacy rows (admin "all" view). */
  readAll(): Promise<T[]>;
  /** Find one row by id; pass the location to skip the active-location scan. */
  find(id: string, loc?: string): Promise<T | undefined>;
  /** Upsert a fully-built row, locked to its location. */
  upsert(row: T): Promise<T>;
  /** Per-location locked read-modify-write — for writes that need the prior
   *  rows (a status transition, an append). `fn` returns the next rows + a
   *  result; any legacy rows seeded in are promoted out of the legacy blob. */
  mutate<R>(loc: string, fn: (rows: T[]) => Promise<{ rows: T[]; result: R }>): Promise<R>;
  /** Delete by id; pass the location to skip the scan. */
  remove(id: string, loc?: string): Promise<boolean>;
}

function makePerLocationBlob<T extends { id: string; locationSlug: string }>(base: string): PerLocationBlob<T> {
  const legacyKey = `${base}.json`;
  const keyFor = (loc: string) => `${base}.${loc}.json`;
  let legacyDrained = false;

  const readLegacy = async (): Promise<T[]> => {
    if (legacyDrained) return [];
    const list = await readJSON<T[]>(legacyKey, []);
    if (list.length === 0) legacyDrained = true;
    return list;
  };
  const dropFromLegacy = async (ids: Set<string>): Promise<number> => {
    if (legacyDrained || ids.size === 0) return 0;
    return withLock(legacyKey, async () => {
      const list = await readJSON<T[]>(legacyKey, []);
      const next = list.filter((r) => !ids.has(r.id));
      const removed = list.length - next.length;
      if (removed > 0) await writeJSON(legacyKey, next);
      if (next.length === 0) legacyDrained = true;
      return removed;
    });
  };
  const readForLocation = async (loc: string): Promise<T[]> => {
    const own = await readJSON<T[]>(keyFor(loc), []);
    const legacy = (await readLegacy()).filter((r) => r.locationSlug === loc);
    if (legacy.length === 0) return own;
    const byId = new Map<string, T>();
    for (const r of legacy) byId.set(r.id, r);
    for (const r of own) byId.set(r.id, r); // per-location wins over legacy
    return [...byId.values()];
  };
  const readAll = async (): Promise<T[]> => {
    const legacy = await readLegacy();
    const active = await getActiveLocationsAsync().catch(() => []);
    const slugs = new Set<string>([...active.map((l) => l.slug), ...legacy.map((r) => r.locationSlug)]);
    const own = (await Promise.all([...slugs].map((s) => readJSON<T[]>(keyFor(s), [])))).flat();
    const byId = new Map<string, T>();
    for (const r of legacy) byId.set(r.id, r);
    for (const r of own) byId.set(r.id, r);
    return [...byId.values()];
  };
  const locationOf = async (id: string): Promise<string | undefined> => {
    const active = await getActiveLocationsAsync().catch(() => []);
    for (const l of active) {
      const own = await readJSON<T[]>(keyFor(l.slug), []);
      if (own.some((r) => r.id === id)) return l.slug;
    }
    return (await readLegacy()).find((r) => r.id === id)?.locationSlug;
  };
  const find = async (id: string, loc?: string): Promise<T | undefined> => {
    const at = loc ?? (await locationOf(id));
    if (!at) return undefined;
    return (await readForLocation(at)).find((r) => r.id === id);
  };
  const mutate = async <R>(loc: string, fn: (rows: T[]) => Promise<{ rows: T[]; result: R }>): Promise<R> => {
    return withLockScoped(base, loc, async () => {
      // Seed with this location's per-key rows plus any legacy rows for it, so a
      // read-modify-write sees pre-split rows too. Everything written lands in
      // the per-location key, so seeded legacy rows are promoted (dropped from
      // legacy) on the way out.
      const own = await readJSON<T[]>(keyFor(loc), []);
      const ownIds = new Set(own.map((r) => r.id));
      const legacyForLoc = (await readLegacy()).filter((r) => r.locationSlug === loc && !ownIds.has(r.id));
      const { rows, result } = await fn([...own, ...legacyForLoc]);
      await writeJSON(keyFor(loc), rows);
      if (legacyForLoc.length) await dropFromLegacy(new Set(legacyForLoc.map((r) => r.id)));
      return result;
    });
  };
  const upsert = (row: T): Promise<T> =>
    mutate<T>(row.locationSlug, async (rows) => {
      const i = rows.findIndex((r) => r.id === row.id);
      if (i >= 0) rows[i] = row;
      else rows.push(row);
      return { rows, result: row };
    });
  const remove = async (id: string, loc?: string): Promise<boolean> => {
    const at = loc ?? (await locationOf(id));
    if (at) {
      const removed = await withLockScoped(base, at, async () => {
        const own = await readJSON<T[]>(keyFor(at), []);
        const next = own.filter((r) => r.id !== id);
        if (next.length === own.length) return false;
        await writeJSON(keyFor(at), next);
        return true;
      });
      if (removed) return true;
    }
    // Not in any per-location key — maybe a pre-split row still in legacy.
    return (await dropFromLegacy(new Set([id]))) > 0;
  };
  return { readForLocation, readAll, find, upsert, mutate, remove };
}

const tablesBlob = makePerLocationBlob<FloorTable>("floor-tables");

export async function getTables(locationSlug?: string): Promise<FloorTable[]> {
  const list = locationSlug ? await tablesBlob.readForLocation(locationSlug) : await tablesBlob.readAll();
  const scoped = locationSlug ? list.filter((t) => t.locationSlug === locationSlug) : list;
  // Stable order: zone, then numeric-aware label.
  return scoped.sort(
    (a, b) =>
      (a.zone ?? "").localeCompare(b.zone ?? "") ||
      a.number.localeCompare(b.number, undefined, { numeric: true }),
  );
}

/**
 * Floor event — a logged table status transition (seated / cleared, with a
 * timestamp). The §4.2 instrumentation behind the Floor Twin's *measured*
 * turn-time: pairing seated→cleared events gives real seat-occupancy dwell
 * (pre-order wait + bussing), not just the order-timeline proxy. JSON-store
 * backed (like floor-tables itself).
 */
export interface FloorEvent {
  id: string;
  locationSlug: string;
  tableId: string;
  from: string;
  to: string;
  at: string;
}

const eventsBlob = makePerLocationBlob<FloorEvent>("floor-events");

export async function getFloorEvents(locationSlug?: string, sinceIso?: string): Promise<FloorEvent[]> {
  const all = locationSlug ? await eventsBlob.readForLocation(locationSlug) : await eventsBlob.readAll();
  return all.filter(
    (e) => (!locationSlug || e.locationSlug === locationSlug) && (!sinceIso || e.at >= sinceIso),
  );
}

export async function recordFloorEvent(event: FloorEvent): Promise<void> {
  // Append-only: write to the event's per-location key under its own lock.
  await eventsBlob.mutate<void>(event.locationSlug, async (rows) => {
    rows.push(event);
    return { rows, result: undefined };
  });
}

export async function saveTable(
  input: Omit<FloorTable, "id" | "createdAt"> & { id?: string; createdAt?: string },
): Promise<FloorTable> {
  const table: FloorTable = {
    id: input.id || `tbl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    locationSlug: input.locationSlug,
    number: input.number,
    seats: input.seats,
    zone: input.zone,
    status: input.status,
    notes: input.notes,
    features: input.features,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  let prevStatus: string | null = null;
  await tablesBlob.mutate<void>(table.locationSlug, async (rows) => {
    const i = rows.findIndex((t) => t.id === table.id);
    prevStatus = i >= 0 ? rows[i].status : null;
    if (i >= 0) rows[i] = table;
    else rows.push(table);
    return { rows, result: undefined };
  });
  // Instrument the status transition for the Floor Twin's measured dwell.
  // Fire-and-forget: a logging failure must never fail the table save.
  if (prevStatus && prevStatus !== table.status) {
    void recordFloorEvent({
      id: `fe_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      locationSlug: table.locationSlug,
      tableId: table.id,
      from: prevStatus,
      to: table.status,
      at: new Date().toISOString(),
    }).catch(() => {});
  }
  return table;
}

export async function deleteTable(id: string, locationSlug?: string): Promise<boolean> {
  return tablesBlob.remove(id, locationSlug);
}

/**
 * Floor **zone** — a first-class, separately-persisted entity (was derived from
 * each table's `zone` string, so an empty zone vanished the moment its last
 * table left). Tables still reference a zone by **name** (`FloorTable.zone`, read
 * in ~40 places — seating, floor-twin, Book, POS — so kept as a name, not an id);
 * this list is the authoritative set of zones + their order, so empty zones
 * persist and zones can be created / renamed / deleted independently. Rename
 * cascades the name onto member tables; delete clears it (they become unzoned).
 */
export interface FloorZone {
  id: string;
  locationSlug: string;
  name: string;
  position: number;
  createdAt: string;
}
const zonesBlob = makePerLocationBlob<FloorZone>("floor-zones");
const newZoneId = () => `zone-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export async function getZones(locationSlug?: string): Promise<FloorZone[]> {
  const list = locationSlug ? await zonesBlob.readForLocation(locationSlug) : await zonesBlob.readAll();
  const scoped = locationSlug ? list.filter((z) => z.locationSlug === locationSlug) : list;
  return scoped.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

/** Back-fill a zone entity for every distinct `table.zone` not yet listed, so
 *  existing floor plans (and any zone typed straight into the table editor) show
 *  up as managed zones. Idempotent; returns the reconciled list. */
export async function reconcileZones(locationSlug: string): Promise<FloorZone[]> {
  const [zones, tables] = await Promise.all([getZones(locationSlug), getTables(locationSlug)]);
  const known = new Set(zones.map((z) => z.name.toLowerCase()));
  const missing = [...new Set(tables.map((t) => (t.zone ?? "").trim()).filter(Boolean))].filter(
    (n) => !known.has(n.toLowerCase()),
  );
  if (missing.length === 0) return zones;
  let pos = zones.length ? Math.max(...zones.map((z) => z.position)) + 1 : 0;
  for (const name of missing) {
    await zonesBlob.upsert({ id: newZoneId(), locationSlug, name, position: pos++, createdAt: new Date().toISOString() });
  }
  return getZones(locationSlug);
}

export async function createZone(locationSlug: string, name: string): Promise<FloorZone | { error: string }> {
  const base = name.trim();
  if (!base) return { error: "Zone name is required" };
  const existing = await getZones(locationSlug);
  // Auto-uniquify so "+ Add zone" (which seeds a placeholder name) never collides.
  let unique = base;
  for (let n = 2; existing.some((z) => z.name.toLowerCase() === unique.toLowerCase()); n++) unique = `${base} ${n}`;
  const zone: FloorZone = {
    id: newZoneId(),
    locationSlug,
    name: unique,
    position: existing.length ? Math.max(...existing.map((z) => z.position)) + 1 : 0,
    createdAt: new Date().toISOString(),
  };
  return zonesBlob.upsert(zone);
}

export async function renameZone(locationSlug: string, id: string, name: string): Promise<FloorZone | { error: string }> {
  const next = name.trim();
  if (!next) return { error: "Zone name is required" };
  const zones = await getZones(locationSlug);
  const zone = zones.find((z) => z.id === id);
  if (!zone) return { error: "Zone not found" };
  if (zones.some((z) => z.id !== id && z.name.toLowerCase() === next.toLowerCase())) return { error: "That zone already exists" };
  const prevName = zone.name;
  const updated = await zonesBlob.upsert({ ...zone, name: next });
  // Cascade the new name onto the tables that referenced the old one (they link
  // by name), so the group stays intact under its new label.
  if (prevName !== next) {
    await tablesBlob.mutate<void>(locationSlug, async (rows) => {
      for (const t of rows) if ((t.zone ?? "") === prevName) t.zone = next;
      return { rows, result: undefined };
    });
  }
  return updated;
}

export async function deleteZone(locationSlug: string, id: string): Promise<boolean> {
  const zone = (await getZones(locationSlug)).find((z) => z.id === id);
  if (!zone) return false;
  // Member tables aren't deleted — they just lose the zone (drop to "unzoned").
  await tablesBlob.mutate<void>(locationSlug, async (rows) => {
    for (const t of rows) if ((t.zone ?? "") === zone.name) t.zone = undefined;
    return { rows, result: undefined };
  });
  return zonesBlob.remove(id, locationSlug);
}

const reservationsBlob = makePerLocationBlob<Reservation>("reservations");

export async function getReservations(
  locationSlug?: string,
  date?: string,
): Promise<Reservation[]> {
  const list = locationSlug ? await reservationsBlob.readForLocation(locationSlug) : await reservationsBlob.readAll();
  let scoped = locationSlug ? list.filter((r) => r.locationSlug === locationSlug) : list;
  if (date) scoped = scoped.filter((r) => r.date === date);
  return scoped.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

export async function saveReservation(
  input: Omit<Reservation, "id" | "createdAt"> & { id?: string; createdAt?: string },
): Promise<Reservation> {
  const res: Reservation = {
    id: input.id || `res-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    locationSlug: input.locationSlug,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    partySize: input.partySize,
    date: input.date,
    time: input.time,
    durationMin: input.durationMin,
    tableId: input.tableId,
    slotId: input.slotId,
    status: input.status,
    notes: input.notes,
    source: input.source,
    seatedAt: input.seatedAt,
    completedAt: input.completedAt,
    needs: input.needs,
    joinedTableIds: input.joinedTableIds,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  return reservationsBlob.upsert(res);
}

export async function deleteReservation(id: string, locationSlug?: string): Promise<boolean> {
  return reservationsBlob.remove(id, locationSlug);
}

// --- Seating Intelligence Engine: policy + learned turn-times --------------
//
// The seating policy is the manager-tunable weight/rule set the engine scores
// with (src/lib/seating.ts). Stored per location as a partial patch over the
// shipped default so re-tuning the defaults later still applies. The learned
// turn-time model is *derived* (not stored) from the day-to-day reservations
// that have both a seatedAt and a completedAt — so it needs no extra blob and
// can never drift from reality (Rule #1).

const SEATING_POLICY_FILE = "seating-policy.json";

/** Resolve the effective policy for a location (preset ⊕ overrides ⊕ default). */
export async function getSeatingPolicy(locationSlug: string): Promise<{ policy: SeatingPolicy; stored: StoredSeatingPolicy }> {
  const all = await readJSON<Record<string, StoredSeatingPolicy>>(SEATING_POLICY_FILE, {});
  const stored: StoredSeatingPolicy = all[locationSlug] ?? { preset: "balanced" };
  return { policy: resolvePolicy(stored), stored };
}

/** Persist a location's policy choice (preset + overrides). Merges over current. */
export async function saveSeatingPolicy(locationSlug: string, patch: Partial<StoredSeatingPolicy>): Promise<StoredSeatingPolicy> {
  return withLock(SEATING_POLICY_FILE, async () => {
    const all = await readJSON<Record<string, StoredSeatingPolicy>>(SEATING_POLICY_FILE, {});
    const current = all[locationSlug] ?? { preset: "balanced" };
    const next: StoredSeatingPolicy = {
      preset: patch.preset ?? current.preset,
      // distinguish "not provided" (keep) from an explicit clear/replace — the
      // key being present (even as undefined) means "set it", so picking a preset
      // can actually clear a prior override set.
      overrides: "overrides" in patch ? patch.overrides : current.overrides,
    };
    all[locationSlug] = next;
    await writeJSON(SEATING_POLICY_FILE, all);
    return next;
  });
}

/** Realised dining durations for a location — one TurnSample per completed
 *  reservation with a seatedAt → completedAt span. The raw material for both the
 *  learned model and its accuracy readout. */
async function getTurnSamples(locationSlug: string): Promise<TurnSample[]> {
  const reservations = await getReservations(locationSlug);
  const samples: TurnSample[] = [];
  for (const r of reservations) {
    if (r.status !== "completed" || !r.seatedAt || !r.completedAt) continue;
    const start = new Date(r.seatedAt).getTime();
    const end = new Date(r.completedAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const minutes = Math.round((end - start) / 60000);
    const atMin = timeToMinutes(r.time);
    if (!Number.isFinite(atMin)) continue;
    samples.push({ party: r.partySize, atMin, minutes, dow: dowOf(r.date) });
  }
  return samples;
}

/** Build the learned turn-time model for a location from realised dining
 *  durations. Empty until parties have closed — the engine falls back to defaults. */
export async function getTurnModel(locationSlug: string): Promise<TurnModel> {
  return buildTurnModel(await getTurnSamples(locationSlug));
}

/** The model plus how well it predicts reality (predicted-vs-actual turn error). */
export async function getTurnModelReport(locationSlug: string): Promise<TurnModel & { accuracy: TurnAccuracy }> {
  const samples = await getTurnSamples(locationSlug);
  const model = buildTurnModel(samples);
  return { ...model, accuracy: summariseTurnAccuracy(samples, model) };
}

// --- Seating decisions (trust loop) --------------------------------------
// Every seat records what the engine recommended vs. what the operator chose,
// so the override rate is a real, measured number (Rule #1 — never fabricated)
// and shadow-mode can prove the engine before it drives. Per-location list,
// capped to the most recent DECISION_CAP so the file can't grow unbounded.
const SEATING_DECISIONS_FILE = "seating-decisions.json";
const DECISION_CAP = 500;

export async function recordSeatingDecision(
  locationSlug: string,
  input: { party: number; atMin: number; recommendedTableId: string | null; chosenTableId: string; override: boolean; shadow: boolean; reason?: OverrideReason; topSignal?: keyof SeatingWeights },
): Promise<SeatingDecision> {
  return withLock(SEATING_DECISIONS_FILE, async () => {
    const all = await readJSON<Record<string, SeatingDecision[]>>(SEATING_DECISIONS_FILE, {});
    const decision: SeatingDecision = {
      id: `sd-${crypto.randomUUID().slice(0, 8)}`,
      locationSlug,
      at: new Date().toISOString(),
      party: input.party,
      atMin: input.atMin,
      recommendedTableId: input.recommendedTableId,
      chosenTableId: input.chosenTableId,
      override: input.override,
      shadow: input.shadow,
      reason: input.override ? input.reason : undefined,
      topSignal: input.topSignal,
    };
    const list = all[locationSlug] ?? [];
    list.push(decision);
    // keep the most recent DECISION_CAP
    all[locationSlug] = list.slice(-DECISION_CAP);
    await writeJSON(SEATING_DECISIONS_FILE, all);
    return decision;
  });
}

export async function getSeatingDecisions(locationSlug: string): Promise<SeatingDecision[]> {
  const all = await readJSON<Record<string, SeatingDecision[]>>(SEATING_DECISIONS_FILE, {});
  return all[locationSlug] ?? [];
}

/** The trust readout for a location — override rate + shadow count over recent
 *  decisions. Pure summary shared with the UI (summariseDecisions). */
export async function getSeatingDecisionSummary(locationSlug: string): Promise<SeatingDecisionSummary> {
  return summariseDecisions(await getSeatingDecisions(locationSlug));
}

// --- Guest seating profile (CRM → engine prefs) --------------------------
// Turn what we know about a returning guest into the TablePrefs the seating
// engine's `guest` signal reads: their usual table (most-sat table in history),
// preferred zone (that table's zone), and VIP standing (a regular by spend /
// visits / loyalty). Best-effort — an anonymous or unknown phone yields empty
// prefs and the engine simply falls back to neutral.
export interface GuestSeatingProfile {
  prefs: { zone?: string; vip?: boolean; usualTableId?: string };
  name: string | null;
  vip: boolean;
  visits: number;
  usualTableId: string | null;
  usualTableLabel: string | null;
}

const digits = (s: string) => s.replace(/\D/g, "");

export async function getGuestSeatingProfile(locationSlug: string, rawPhone: string): Promise<GuestSeatingProfile> {
  const empty: GuestSeatingProfile = { prefs: {}, name: null, vip: false, visits: 0, usualTableId: null, usualTableLabel: null };
  const suffix = digits(rawPhone).slice(-9);
  if (suffix.length < 6) return empty;

  const [customer, reservations, tables] = await Promise.all([
    getCustomer(rawPhone).catch(() => null),
    getReservations(locationSlug).catch(() => [] as Reservation[]),
    getTables(locationSlug).catch(() => [] as FloorTable[]),
  ]);

  // VIP = a genuine regular: healthy spend, repeat visits, or loyalty standing.
  const vip = !!customer && (customer.orderCount >= 6 || customer.totalSpentGrosze >= 80_000 || customer.loyaltyPointsBalance >= 500);

  // Usual table = the table this guest has sat at most across their history.
  const mine = reservations.filter(
    (r) => r.customerPhone && digits(r.customerPhone).slice(-9) === suffix && (r.status === "seated" || r.status === "completed") && r.tableId,
  );
  const counts = new Map<string, number>();
  for (const r of mine) counts.set(r.tableId!, (counts.get(r.tableId!) ?? 0) + 1);
  let usualTableId: string | null = null;
  let best = 0;
  for (const [id, c] of counts) if (c > best) { best = c; usualTableId = id; }
  const usualTable = usualTableId ? tables.find((t) => t.id === usualTableId) : undefined;

  return {
    prefs: { vip: vip || undefined, usualTableId: usualTableId ?? undefined, zone: usualTable?.zone },
    name: customer?.name ?? mine[0]?.customerName ?? null,
    vip,
    visits: mine.length,
    usualTableId,
    usualTableLabel: usualTable ? usualTable.number : null,
  };
}

// --- Waitlist (the host's queue) -----------------------------------------
// Walk-in parties waiting for a table, with the wait we quoted them. Per-location
// list, same JSON pattern as reservations. Concept-5's Waitlist column reads it.
const WAITLIST_FILE = "waitlist.json";

export async function getWaitlist(locationSlug: string, date?: string): Promise<WaitlistEntry[]> {
  const all = await readJSON<Record<string, WaitlistEntry[]>>(WAITLIST_FILE, {});
  const list = all[locationSlug] ?? [];
  return date ? list.filter((w) => w.date === date) : list;
}

export async function addWaitlistEntry(
  locationSlug: string,
  input: { date: string; customerName: string; partySize: number; customerPhone?: string; notes?: string; needs?: WaitlistEntry["needs"]; quotedMin: number },
): Promise<WaitlistEntry> {
  return withLock(WAITLIST_FILE, async () => {
    const all = await readJSON<Record<string, WaitlistEntry[]>>(WAITLIST_FILE, {});
    const entry: WaitlistEntry = {
      id: `wl-${crypto.randomUUID().slice(0, 8)}`,
      locationSlug,
      date: input.date,
      customerName: input.customerName,
      partySize: input.partySize,
      customerPhone: input.customerPhone,
      notes: input.notes,
      needs: input.needs,
      status: "waiting",
      quotedMin: input.quotedMin,
      addedAt: new Date().toISOString(),
    };
    const list = all[locationSlug] ?? [];
    list.push(entry);
    all[locationSlug] = list.slice(-200);
    await writeJSON(WAITLIST_FILE, all);
    return entry;
  });
}

export async function updateWaitlistEntry(
  locationSlug: string,
  id: string,
  patch: { status?: WaitlistStatus },
): Promise<WaitlistEntry | null> {
  return withLock(WAITLIST_FILE, async () => {
    const all = await readJSON<Record<string, WaitlistEntry[]>>(WAITLIST_FILE, {});
    const list = all[locationSlug] ?? [];
    const i = list.findIndex((w) => w.id === id);
    if (i < 0) return null;
    const next: WaitlistEntry = { ...list[i], ...patch };
    if (patch.status === "seated" && !next.seatedAt) next.seatedAt = new Date().toISOString();
    list[i] = next;
    all[locationSlug] = list;
    await writeJSON(WAITLIST_FILE, all);
    return next;
  });
}

export async function removeWaitlistEntry(locationSlug: string, id: string): Promise<boolean> {
  return withLock(WAITLIST_FILE, async () => {
    const all = await readJSON<Record<string, WaitlistEntry[]>>(WAITLIST_FILE, {});
    const list = all[locationSlug] ?? [];
    const next = list.filter((w) => w.id !== id);
    all[locationSlug] = next;
    await writeJSON(WAITLIST_FILE, all);
    return next.length !== list.length;
  });
}

// --- POS open checks (tabs) ----------------------------------------------
// Server-backed working state for the "Tabs" POS: several concurrent open
// checks per till. Same JSON-list pattern as tables/reservations (withLock +
// readJSON/writeJSON, upsert by id, per-location filter on read). Lines store
// menu-item ids + quantities only — prices/discounts are resolved server-side
// at send/charge time, so the till never dictates what an item costs.

const POS_TAB_STATUSES: PosTabStatus[] = ["open", "parked", "pay"];
const POS_FULFILLMENTS: FulfillmentType[] = ["takeout", "delivery", "dine-in"];

/** Validate a caller-supplied modifier-selection list. Keeps only well-formed
 *  {groupId, optionId} string pairs (capped) — the price/cost of each pick is
 *  resolved server-side off the live menu, so a bogus id simply isn't priced. */
function sanitizeSelectedModifiers(input: unknown): SelectedModifier[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const out: SelectedModifier[] = [];
  for (const raw of input) {
    const groupId = typeof raw?.groupId === "string" ? raw.groupId.slice(0, 80) : "";
    const optionId = typeof raw?.optionId === "string" ? raw.optionId.slice(0, 80) : "";
    if (groupId && optionId) out.push({ groupId, optionId });
    if (out.length >= 24) break;
  }
  return out.length ? out : undefined;
}

function sanitizePosTabLines(input: unknown): PosTabLine[] {
  if (!Array.isArray(input)) return [];
  const lines: PosTabLine[] = [];
  for (const raw of input) {
    const id = typeof raw?.menuItemId === "string" ? raw.menuItemId : "";
    const qty = Math.max(1, Math.min(99, Math.round(Number(raw?.quantity) || 0)));
    if (!id || qty < 1) continue;
    const course = POS_COURSES.has(raw?.course) ? (raw.course as PosTabLine["course"]) : undefined;
    const modifiers = sanitizeSelectedModifiers(raw?.modifiers);
    const notes = typeof raw?.notes === "string" ? raw.notes.trim().slice(0, 200) || undefined : undefined;
    const guestPending = raw?.guestPending === true ? true : undefined;
    // Identity is the item + its modifier picks + its note — so a plain item and
    // a customised one (or two with different notes) stay on separate lines, and
    // only a genuinely-identical re-add stacks. The last course wins on a merge
    // (a re-course move re-sends the same configured line).
    const key = posLineKey({ menuItemId: id, modifiers, notes });
    const existing = lines.find((l) => posLineKey(l) === key);
    if (existing) {
      existing.quantity = Math.min(99, existing.quantity + qty);
      if (course) existing.course = course;
      if (guestPending) existing.guestPending = true;
    } else {
      lines.push({
        menuItemId: id,
        quantity: qty,
        ...(course ? { course } : {}),
        ...(modifiers ? { modifiers } : {}),
        ...(notes ? { notes } : {}),
        ...(guestPending ? { guestPending: true } : {}),
      });
    }
  }
  return lines;
}

const POS_COURSES = new Set(["starter", "main", "dessert", "drink"]);

function sanitizeFiredCourses(input: unknown): PosTab["firedCourses"] {
  if (!Array.isArray(input)) return undefined;
  const seen = new Set<string>();
  for (const c of input) if (POS_COURSES.has(c)) seen.add(c as string);
  return seen.size ? (Array.from(seen) as PosTab["firedCourses"]) : undefined;
}

// --- POS open checks: per-location keys (m3 contention split) -------------
//
// Open checks used to live in a single global `pos-tabs.json` blob, so every
// till at every truck serialized on one withLock — a Kraków keystroke-save
// blocked a Warszawa one. We now key the blob per location
// (`pos-tabs.<loc>.json`) and lock per location, so each truck's till has its
// own lock and tills at different trucks never contend.
//
// Migration is lossless and self-draining: a handful of pre-split checks may
// still sit in the legacy global blob. Reads union it in (per-location wins);
// any write that touches a legacy check "promotes" it into its per-location key
// and drops it from legacy. New checks never touch legacy, so the global blob
// drains to empty within a service and is then never read or written again.

const POS_TABS_LEGACY = "pos-tabs.json";
const posTabsKey = (loc: string): string => `pos-tabs.${loc}.json`;

// Per-instance "drained" latch, keyed by the RESOLVED legacy key. The legacy
// blob can only ever shrink (no code adds to it), so once observed empty we stop
// reading it. It MUST be namespace-aware: the live legacy blob (`pos-tabs.json`)
// and the simulation one (`sim:pos-tabs.json`) are different rows, and the sim
// one is typically empty. A single boolean latch let an instance that read the
// empty sim legacy mark legacy "drained" for ALL namespaces — so the live legacy
// checks then went invisible AND undeletable on that instance (getPosTab missed
// them → the DELETE route 404'd → the check survived and the next poll, served
// by a non-latched instance, showed it again). Keying by resolved key fixes that.
const posTabsLegacyDrained = new Set<string>();

async function readLegacyPosTabs(): Promise<PosTab[]> {
  await refreshDataMode();
  const resolved = resolveKey(POS_TABS_LEGACY);
  if (posTabsLegacyDrained.has(resolved)) return [];
  const list = await readJSON<PosTab[]>(POS_TABS_LEGACY, []);
  if (list.length === 0) posTabsLegacyDrained.add(resolved);
  return list;
}

/** Remove ids from the legacy blob (on promote / pre-split delete). Best-effort
 *  under the legacy lock; a no-op once that namespace's legacy is drained.
 *  Returns how many were removed. */
async function dropFromLegacyPosTabs(ids: Set<string>): Promise<number> {
  if (ids.size === 0) return 0;
  await refreshDataMode();
  const resolved = resolveKey(POS_TABS_LEGACY);
  if (posTabsLegacyDrained.has(resolved)) return 0;
  return withLock(POS_TABS_LEGACY, async () => {
    const list = await readJSON<PosTab[]>(POS_TABS_LEGACY, []);
    const next = list.filter((t) => !ids.has(t.id));
    const removed = list.length - next.length;
    if (removed > 0) await writeJSON(POS_TABS_LEGACY, next);
    if (next.length === 0) posTabsLegacyDrained.add(resolved);
    return removed;
  });
}

/** One location's open checks: the per-location key unioned with any
 *  not-yet-promoted legacy checks for that location (per-location wins). */
async function readPosTabsForLocation(loc: string): Promise<PosTab[]> {
  const own = await readJSON<PosTab[]>(posTabsKey(loc), []);
  const legacy = (await readLegacyPosTabs()).filter((t) => t.locationSlug === loc);
  if (legacy.length === 0) return own;
  const byId = new Map<string, PosTab>();
  for (const t of legacy) byId.set(t.id, t);
  for (const t of own) byId.set(t.id, t); // per-location wins over legacy
  return [...byId.values()];
}

/** Pure merge of an upsert input over the stored record — the validation /
 *  field-precedence rules, with no I/O so they can be unit-tested. `orderId` and
 *  `firedCourses` are server-owned (preserved from `existing`, never taken from
 *  the caller); editing the lines force-clears the `sentKds` flag. */
function sanitizePosTabDiscount(input: unknown): PosTabDiscount | undefined {
  if (!input || typeof input !== "object") return undefined;
  const d = input as Partial<PosTabDiscount>;
  if (d.type !== "amount" && d.type !== "percent") return undefined;
  const raw = Number(d.value);
  if (!Number.isFinite(raw) || raw <= 0) return undefined;
  const value = d.type === "percent" ? Math.max(0, Math.min(100, Math.round(raw))) : Math.max(0, Math.round(raw));
  if (value <= 0) return undefined;
  const reason = typeof d.reason === "string" ? d.reason.trim().slice(0, 80) || undefined : undefined;
  return { type: d.type, value, ...(reason ? { reason } : {}) };
}

export function mergePosTab(
  input: Omit<Partial<PosTab>, "discount"> & { locationSlug: string; discount?: PosTabDiscount | null },
  existing: PosTab | undefined,
): PosTab {
  const id = input.id || newPosTabId();
  const now = new Date().toISOString();
  const channel = input.channel && POS_FULFILLMENTS.includes(input.channel) ? input.channel : null;
  const status =
    input.status && POS_TAB_STATUSES.includes(input.status) ? input.status : existing?.status ?? "open";
  const items = input.items !== undefined ? sanitizePosTabLines(input.items) : existing?.items ?? [];
  // Changing the lines un-sends the check server-side — so the "Sent ✓" flag
  // can never outlive the order it was sent as, even if the client claims it.
  const itemsChanged =
    input.items !== undefined &&
    (!existing ||
      existing.items.length !== items.length ||
      existing.items.some(
        (l, idx) =>
          posLineKey(l) !== posLineKey(items[idx] ?? { menuItemId: "" }) ||
          l.quantity !== items[idx]?.quantity,
      ));
  return {
    id,
    locationSlug: input.locationSlug,
    name: (input.name ?? existing?.name ?? "Tab").toString().slice(0, 40),
    channel: input.channel === undefined ? existing?.channel ?? null : channel,
    status,
    items,
    tableId: input.tableId !== undefined ? input.tableId || undefined : existing?.tableId,
    covers:
      input.covers !== undefined
        ? Math.max(1, Math.min(50, Math.round(Number(input.covers) || 2)))
        : existing?.covers,
    address:
      input.address !== undefined
        ? (input.address || "").toString().trim().slice(0, 400) || undefined
        : existing?.address,
    customerPhone:
      input.customerPhone !== undefined
        ? (input.customerPhone || "").toString().trim().slice(0, 25) || undefined
        : existing?.customerPhone,
    customerName:
      input.customerName !== undefined
        ? (input.customerName || "").toString().trim().slice(0, 60) || undefined
        : existing?.customerName,
    discount:
      input.discount === null
        ? undefined
        : input.discount !== undefined
          ? sanitizePosTabDiscount(input.discount)
          : existing?.discount,
    sentKds: itemsChanged ? false : input.sentKds !== undefined ? !!input.sentKds : existing?.sentKds ?? false,
    coursed:
      input.coursed !== undefined ? !!input.coursed : existing?.coursed ?? (channel === "dine-in" ? true : undefined),
    firedCourses: existing?.firedCourses,
    orderId: existing?.orderId,
    createdAt: existing?.createdAt ?? input.createdAt ?? now,
    updatedAt: now,
  };
}

export async function getPosTabs(locationSlug?: string): Promise<PosTab[]> {
  if (locationSlug) {
    const list = await readPosTabsForLocation(locationSlug);
    return list
      .filter((t) => t.locationSlug === locationSlug)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  // "All": every active location's key, plus any legacy checks (any location).
  const legacy = await readLegacyPosTabs();
  const active = await getActiveLocationsAsync().catch(() => []);
  const slugs = new Set<string>([...active.map((l) => l.slug), ...legacy.map((t) => t.locationSlug)]);
  const own = (await Promise.all([...slugs].map((s) => readJSON<PosTab[]>(posTabsKey(s), [])))).flat();
  const byId = new Map<string, PosTab>();
  for (const t of legacy) byId.set(t.id, t);
  for (const t of own) byId.set(t.id, t); // per-location wins
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Resolve which location's blob a bare tab id lives in. Callers that already
 *  know the location pass it (the common path); this scan is the fallback. */
async function locationForPosTab(id: string): Promise<string | undefined> {
  const active = await getActiveLocationsAsync().catch(() => []);
  for (const l of active) {
    const own = await readJSON<PosTab[]>(posTabsKey(l.slug), []);
    if (own.some((t) => t.id === id)) return l.slug;
  }
  return (await readLegacyPosTabs()).find((t) => t.id === id)?.locationSlug;
}

export async function getPosTab(id: string, locationSlug?: string): Promise<PosTab | undefined> {
  const loc = locationSlug ?? (await locationForPosTab(id));
  if (!loc) return undefined;
  return (await readPosTabsForLocation(loc)).find((t) => t.id === id);
}

// --- Atomic single-tab kv mutations (DB mode) ------------------------------
// The POS tabs blob is one JSONB array per location. A JS read-modify-write of
// the whole blob (read list → splice one tab → write list) loses concurrent
// updates whenever two requests run without a shared lock — which is exactly the
// case on serverless when Upstash isn't configured (the lock falls back to a
// PER-INSTANCE mutex, so two Vercel instances each read the pre-change list and
// the last writer wins). The classic symptom: void several checks at once and
// some come back, because each DELETE's whole-blob write clobbered the others'.
// These helpers mutate a SINGLE element in ONE SQL statement, so Postgres'
// row-level serialization of the UPDATE makes concurrent saves/deletes of
// different tabs safe with no application lock at all.

/** Atomically write one tab into a location's blob in a single statement, so it
 *  can't clobber concurrent changes to OTHER tabs in the same blob.
 *
 *  `insertIfMissing` (default true) is the create path: replace if present, else
 *  append. When false it's the EDIT path: replace if present, else DO NOTHING —
 *  so an edit (PUT) that lands after a void can't resurrect the voided check by
 *  re-inserting it. Returns whether a tab with this id was actually written
 *  (always true when inserting; false on an edit that found nothing to update —
 *  i.e. the check was voided out from under it). */
async function dbUpsertPosTab(
  loc: string,
  tab: PosTab,
  opts?: { insertIfMissing?: boolean },
): Promise<boolean> {
  const insertIfMissing = opts?.insertIfMissing !== false;
  await refreshDataMode();
  await ensureDB();
  const key = resolveKey(posTabsKey(loc));
  const db = sql();
  const idMatch = JSON.stringify([{ id: tab.id }]);
  const tabJson = JSON.stringify(tab);
  if (insertIfMissing) {
    const tabArr = JSON.stringify([tab]);
    // Ensure the row exists so the UPDATE below always has an array to operate on.
    await db`INSERT INTO kv_store (key, value) VALUES (${key}, '[]'::jsonb) ON CONFLICT (key) DO NOTHING`;
    await db`
      UPDATE kv_store SET value = CASE
        WHEN value @> ${idMatch}::jsonb
        THEN (SELECT jsonb_agg(CASE WHEN e->>'id' = ${tab.id} THEN ${tabJson}::jsonb ELSE e END)
              FROM jsonb_array_elements(value) e)
        ELSE value || ${tabArr}::jsonb
      END
      WHERE key = ${key}
    `;
    invalidateKvCache(posTabsKey(loc));
    return true;
  }
  // Edit path: update the element ONLY if it's still present. The `value @>`
  // guard makes this a no-op when the tab was voided between the caller's read
  // and this write, so a stale PUT can never bring a deleted check back. Postgres
  // serializes the row UPDATE, so this is safe with no application lock.
  const rows = await db`
    UPDATE kv_store SET value = (
      SELECT jsonb_agg(CASE WHEN e->>'id' = ${tab.id} THEN ${tabJson}::jsonb ELSE e END)
      FROM jsonb_array_elements(value) e
    )
    WHERE key = ${key} AND value @> ${idMatch}::jsonb
    RETURNING key
  `;
  if (rows.length > 0) {
    invalidateKvCache(posTabsKey(loc));
    return true;
  }
  return false;
}

/** Atomically remove one tab from a location's blob in a single statement.
 *  Returns true if a tab with that id was present and removed. */
async function dbRemovePosTab(loc: string, id: string): Promise<boolean> {
  await refreshDataMode();
  await ensureDB();
  const key = resolveKey(posTabsKey(loc));
  const db = sql();
  const idMatch = JSON.stringify([{ id }]);
  const rows = await db`
    UPDATE kv_store
    SET value = COALESCE(
      (SELECT jsonb_agg(e) FROM jsonb_array_elements(value) e WHERE e->>'id' <> ${id}),
      '[]'::jsonb
    )
    WHERE key = ${key} AND value @> ${idMatch}::jsonb
    RETURNING key
  `;
  if (rows.length > 0) {
    invalidateKvCache(posTabsKey(loc));
    return true;
  }
  return false;
}

/**
 * Upsert an open check. `orderId` is never taken from the caller — it is
 * minted server-side on send/charge and preserved from the stored record — so
 * a till can't reassign which Order a tab points at. In DB mode the write is an
 * atomic single-tab upsert (no whole-blob clobber); on the filesystem (single
 * process) the per-location lock + read-modify-write is correct.
 *
 * `mustExist` is the EDIT contract (the client PUT route): the save must NEVER
 * create a check — only the create path (POST → no id, no `mustExist`) does. An
 * edit aimed at an id that is no longer there (the check was just voided) is a
 * no-op and returns null, so a debounced/in-flight PUT that lands a beat after a
 * DELETE can't resurrect the voided check. This was the real "voided checks come
 * back a few seconds later" bug: the upsert re-inserted the row a stale PUT
 * carried, and the client tombstone only masked it until it expired (~12s).
 */
export async function savePosTab(
  input: Omit<Partial<PosTab>, "discount"> & { locationSlug: string; discount?: PosTabDiscount | null },
  opts: { mustExist: true },
): Promise<PosTab | null>;
export async function savePosTab(
  input: Omit<Partial<PosTab>, "discount"> & { locationSlug: string; discount?: PosTabDiscount | null },
  opts?: { mustExist?: false },
): Promise<PosTab>;
export async function savePosTab(
  input: Omit<Partial<PosTab>, "discount"> & { locationSlug: string; discount?: PosTabDiscount | null },
  opts?: { mustExist?: boolean },
): Promise<PosTab | null> {
  const loc = input.locationSlug;
  const mustExist = opts?.mustExist === true;
  if (useDB) {
    // Read the current record only to MERGE this one tab's fields (preserve
    // orderId/createdAt, derive sentKds); the WRITE is an atomic single-tab
    // upsert that never rewrites the whole blob, so a concurrent void/save of
    // other tabs can't be lost — no per-location lock needed.
    const own = await readJSON<PosTab[]>(posTabsKey(loc), []);
    let existing = input.id ? own.find((t) => t.id === input.id) : undefined;
    let fromLegacy = false;
    if (!existing && input.id) {
      const legacy = (await readLegacyPosTabs()).find((t) => t.id === input.id && t.locationSlug === loc);
      if (legacy) {
        existing = legacy;
        fromLegacy = true;
      }
    }
    // Edit of an already-voided check → do nothing (never resurrect it).
    if (mustExist && !existing) return null;
    const tab = mergePosTab(input, existing);
    // Edits write update-only (no insert) so a void that lands between the read
    // above and this write wins; a legacy check still needs the insert to be
    // promoted into its per-location key.
    const wrote = await dbUpsertPosTab(loc, tab, { insertIfMissing: !mustExist || fromLegacy });
    if (mustExist && !wrote) return null; // raced a concurrent delete — stay deleted
    if (fromLegacy) await dropFromLegacyPosTabs(new Set([tab.id])); // promote out of legacy
    return tab;
  }
  return withLockScoped("pos-tabs", loc, async () => {
    const own = await readJSON<PosTab[]>(posTabsKey(loc), []);
    let existing = input.id ? own.find((t) => t.id === input.id) : undefined;
    let fromLegacy = false;
    if (!existing && input.id) {
      const legacy = (await readLegacyPosTabs()).find((t) => t.id === input.id && t.locationSlug === loc);
      if (legacy) {
        existing = legacy;
        fromLegacy = true;
      }
    }
    // Edit of an already-voided check → do nothing. The lock serializes against
    // deletePosTab, so a missing record here means the void already committed.
    if (mustExist && !existing) return null;
    const tab = mergePosTab(input, existing);
    const i = own.findIndex((t) => t.id === tab.id);
    if (i >= 0) own[i] = tab;
    else own.push(tab); // create, or promote a legacy check into its own key
    await writeJSON(posTabsKey(loc), own);
    if (fromLegacy) await dropFromLegacyPosTabs(new Set([tab.id])); // promote out of legacy
    return tab;
  });
}

/** Patch server-owned fields (orderId, sentKds, status) after a send/charge.
 *  Separate from savePosTab so the order-linking path can't be spoofed by the
 *  client PUT route. Locked per location. */
export async function linkPosTabOrder(
  id: string,
  patch: {
    orderId?: string;
    sentKds?: boolean;
    status?: PosTabStatus;
    firedCourses?: PosTab["firedCourses"];
  },
  locationSlug?: string,
): Promise<PosTab | null> {
  const loc = locationSlug ?? (await locationForPosTab(id));
  if (!loc) return null;
  const applyPatch = (tab: PosTab): PosTab => {
    if (patch.orderId !== undefined) tab.orderId = patch.orderId;
    if (patch.sentKds !== undefined) tab.sentKds = patch.sentKds;
    if (patch.firedCourses !== undefined) {
      tab.firedCourses = sanitizeFiredCourses(patch.firedCourses);
    }
    if (patch.status !== undefined && POS_TAB_STATUSES.includes(patch.status)) {
      tab.status = patch.status;
    }
    tab.updatedAt = new Date().toISOString();
    return tab;
  };
  if (useDB) {
    const own = await readJSON<PosTab[]>(posTabsKey(loc), []);
    let base = own.find((t) => t.id === id);
    let fromLegacy = false;
    if (!base) {
      const legacy = (await readLegacyPosTabs()).find((t) => t.id === id && t.locationSlug === loc);
      if (!legacy) return null;
      base = legacy;
      fromLegacy = true;
    }
    const tab = applyPatch({ ...base });
    // Update-only (except to promote a legacy check) so linking an order can't
    // re-insert a tab the operator voided while the send was in flight.
    const wrote = await dbUpsertPosTab(loc, tab, { insertIfMissing: fromLegacy });
    if (!wrote) return null; // voided mid-send — leave it voided
    if (fromLegacy) await dropFromLegacyPosTabs(new Set([id])); // promote out of legacy
    return tab;
  }
  return withLockScoped("pos-tabs", loc, async () => {
    const own = await readJSON<PosTab[]>(posTabsKey(loc), []);
    const i = own.findIndex((t) => t.id === id);
    let tab: PosTab;
    let fromLegacy = false;
    if (i >= 0) {
      tab = own[i];
    } else {
      const legacy = (await readLegacyPosTabs()).find((t) => t.id === id && t.locationSlug === loc);
      if (!legacy) return null;
      tab = legacy;
      fromLegacy = true;
    }
    applyPatch(tab);
    if (i >= 0) own[i] = tab;
    else own.push(tab);
    await writeJSON(posTabsKey(loc), own);
    if (fromLegacy) await dropFromLegacyPosTabs(new Set([id])); // promote out of legacy
    return tab;
  });
}

/** Atomically remove one tab from the legacy global blob in a single statement —
 *  no `withLock`, so it works even when Upstash (the lock backend) is down. The
 *  old lock-based `dropFromLegacyPosTabs` would, with Upstash unreachable, eat a
 *  multi-second timeout per call and then fall back to a per-instance mutex that
 *  can't serialize across Vercel instances — the path that left voided checks in
 *  the legacy blob so the next poll resurrected them. */
async function dbRemoveLegacyPosTab(id: string): Promise<boolean> {
  await refreshDataMode();
  await ensureDB();
  const key = resolveKey(POS_TABS_LEGACY);
  const db = sql();
  const idMatch = JSON.stringify([{ id }]);
  const rows = await db`
    UPDATE kv_store SET value = COALESCE(
      (SELECT jsonb_agg(e) FROM jsonb_array_elements(value) e WHERE e->>'id' <> ${id}),
      '[]'::jsonb
    )
    WHERE key = ${key} AND value @> ${idMatch}::jsonb
    RETURNING key
  `;
  if (rows.length > 0) {
    invalidateKvCache(POS_TABS_LEGACY);
    return true;
  }
  return false;
}

export async function deletePosTab(id: string, locationSlug?: string): Promise<boolean> {
  const loc = locationSlug ?? (await locationForPosTab(id));
  if (useDB) {
    // Remove from BOTH the per-location key AND the legacy blob, atomically and
    // lock-free (single SQL statement each). Two reasons this must not
    // short-circuit on the per-location hit:
    //   1) a check can exist in both blobs if an earlier promote's legacy-drop
    //      failed (which is exactly what happens when the Upstash-backed lock is
    //      down) — deleting only the per-location copy lets the GET union the
    //      legacy copy straight back in, and the check "reappears";
    //   2) being lock-free, the delete no longer depends on Upstash at all, so an
    //      Upstash outage can't stop a void from persisting.
    let removed = false;
    if (loc) removed = (await dbRemovePosTab(loc, id)) || removed;
    removed = (await dbRemoveLegacyPosTab(id)) || removed;
    return removed;
  }
  // Filesystem (single process) — the per-location lock is correct and cheap.
  if (loc) {
    const removedOwn = await withLockScoped("pos-tabs", loc, async () => {
      const own = await readJSON<PosTab[]>(posTabsKey(loc), []);
      const next = own.filter((t) => t.id !== id);
      if (next.length === own.length) return false;
      await writeJSON(posTabsKey(loc), next);
      return true;
    });
    if (removedOwn) return true;
  }
  // Not in any per-location key — maybe a pre-split check still in legacy.
  return (await dropFromLegacyPosTabs(new Set([id]))) > 0;
}

const POS_TAB_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newPosTabId(): string {
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += POS_TAB_ID_CHARS[Math.floor(Math.random() * POS_TAB_ID_CHARS.length)];
  }
  return s;
}

// ───────────────────────────────────────────────────────────────────────────
// Native /api/v1 refresh tokens (Stage 2 of the native rewrite).
//
// Access tokens are stateless JWTs (src/lib/api/v1/jwt.ts). Refresh tokens are
// opaque + stored here so they can be ROTATED and REVOKED — the app holds only
// the secret half in the Keychain; we persist a SHA-256 of it. Rotation records
// a `family` + `replacedBy` so presenting an already-rotated token (theft tell)
// lets the auth layer revoke the whole family. Persisted through the same
// readJSON/writeJSON/withLock substrate as every other data type (Rule #2), so
// it works on Neon in prod and the filesystem in local dev.
// ───────────────────────────────────────────────────────────────────────────

export interface ApiRefreshToken {
  /** Public token id (the `jti`), stored in the opaque token as `<id>.<secret>`. */
  id: string;
  /** SHA-256 (hex) of the secret half — the secret itself is never persisted. */
  tokenHash: string;
  /** Owning admin user id (or "admin" for the shared-owner session). */
  userId: string;
  /** Location scope bound at issue ("*" or comma-joined slugs). */
  scope: string;
  /** Which native app the token family belongs to. */
  aud: "ottaviano" | "ottaviano-kds";
  /** Rotation lineage — all descendants share the original id as family. */
  family: string;
  issuedAt: number;
  expiresAt: number;
  /** Set when revoked (logout, rotation, or family kill). */
  revokedAt?: number;
  /** Id of the token that rotated this one (rotation audit + reuse detection). */
  replacedBy?: string;
}

const API_REFRESH_KEY = "api-refresh-tokens.json";

/** Drop tokens that expired or were revoked more than 7 days ago — keeps the
 *  list from growing without bound while preserving a short revocation history
 *  for reuse detection. */
function pruneApiRefreshTokens(tokens: ApiRefreshToken[], nowSec: number): ApiRefreshToken[] {
  const weekAgo = nowSec - 7 * 24 * 60 * 60;
  return tokens.filter((t) => t.expiresAt > nowSec && !(t.revokedAt && t.revokedAt < weekAgo));
}

/** Read one refresh-token record by id (no mutation). */
export async function getApiRefreshToken(id: string): Promise<ApiRefreshToken | undefined> {
  const tokens = await readJSON<ApiRefreshToken[]>(API_REFRESH_KEY, []);
  return tokens.find((t) => t.id === id);
}

/** Persist a freshly-issued refresh token (and opportunistically prune). */
export async function addApiRefreshToken(token: ApiRefreshToken): Promise<void> {
  await withLock(API_REFRESH_KEY, async () => {
    const now = Math.floor(Date.now() / 1000);
    const tokens = pruneApiRefreshTokens(await readJSON<ApiRefreshToken[]>(API_REFRESH_KEY, []), now);
    tokens.push(token);
    await writeJSON(API_REFRESH_KEY, tokens);
  });
}

/**
 * Atomically rotate `oldId` → `replacement`: marks the old token revoked +
 * `replacedBy`, appends the new one. Returns false if the old token is missing
 * or already revoked (the caller treats that as a reuse/theft signal).
 */
export async function rotateApiRefreshToken(
  oldId: string,
  replacement: ApiRefreshToken,
): Promise<boolean> {
  return withLock(API_REFRESH_KEY, async () => {
    const now = Math.floor(Date.now() / 1000);
    const tokens = await readJSON<ApiRefreshToken[]>(API_REFRESH_KEY, []);
    const old = tokens.find((t) => t.id === oldId);
    if (!old || old.revokedAt) return false;
    old.revokedAt = now;
    old.replacedBy = replacement.id;
    tokens.push(replacement);
    await writeJSON(API_REFRESH_KEY, pruneApiRefreshTokens(tokens, now));
    return true;
  });
}

/** Revoke a single refresh token (logout). No-op if unknown. */
export async function revokeApiRefreshToken(id: string): Promise<void> {
  await withLock(API_REFRESH_KEY, async () => {
    const tokens = await readJSON<ApiRefreshToken[]>(API_REFRESH_KEY, []);
    const hit = tokens.find((t) => t.id === id);
    if (hit && !hit.revokedAt) {
      hit.revokedAt = Math.floor(Date.now() / 1000);
      await writeJSON(API_REFRESH_KEY, tokens);
    }
  });
}

/** Revoke every token in a rotation family — fired when a rotated token is
 *  replayed (someone is holding a stolen, already-spent refresh token). */
export async function revokeApiRefreshTokenFamily(family: string): Promise<number> {
  return withLock(API_REFRESH_KEY, async () => {
    const now = Math.floor(Date.now() / 1000);
    const tokens = await readJSON<ApiRefreshToken[]>(API_REFRESH_KEY, []);
    let n = 0;
    for (const t of tokens) {
      if (t.family === family && !t.revokedAt) {
        t.revokedAt = now;
        n++;
      }
    }
    if (n > 0) await writeJSON(API_REFRESH_KEY, tokens);
    return n;
  });
}

/**
 * Kill every live refresh token for one subject (and one app audience) — used by
 * customer self-serve account deletion so erasing the account signs the guest
 * out of every device, not just the one that issued the DELETE. `userId` is the
 * phone for customer (`ottaviano`) tokens. Returns the count revoked.
 */
export async function revokeApiRefreshTokensForUser(
  userId: string,
  aud: ApiRefreshToken["aud"],
): Promise<number> {
  return withLock(API_REFRESH_KEY, async () => {
    const now = Math.floor(Date.now() / 1000);
    const tokens = await readJSON<ApiRefreshToken[]>(API_REFRESH_KEY, []);
    let n = 0;
    for (const t of tokens) {
      if (t.userId === userId && t.aud === aud && !t.revokedAt) {
        t.revokedAt = now;
        n++;
      }
    }
    if (n > 0) await writeJSON(API_REFRESH_KEY, tokens);
    return n;
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Native /api/v1 customer OTP challenges + order idempotency (Stage 2).
//
// OTP: phone-based one-time codes for the customer app login (zero-friction,
// no passwords — Rule #6). Only a SHA-256 of the code is persisted, with a
// short TTL + an attempt counter so a code can't be brute-forced. Order
// idempotency: maps an Idempotency-Key hash → the created order id so a retried
// POST /api/v1/orders returns the same order instead of double-charging.
// Both ride the standard readJSON/writeJSON/withLock substrate (Rule #2).
// ───────────────────────────────────────────────────────────────────────────

export interface OtpChallenge {
  /** E.164 phone the challenge is bound to. */
  phone: string;
  /** SHA-256 (hex) of the numeric code — the code itself is never stored. */
  codeHash: string;
  expiresAt: number;
  /** Verify attempts consumed (caps brute force). */
  attempts: number;
  createdAt: number;
}

const OTP_KEY = "api-otp-challenges.json";

function pruneOtp(list: OtpChallenge[], nowSec: number): OtpChallenge[] {
  return list.filter((c) => c.expiresAt > nowSec);
}

/** Upsert the active challenge for a phone (one live code per phone). */
export async function setOtpChallenge(challenge: OtpChallenge): Promise<void> {
  await withLock(OTP_KEY, async () => {
    const now = Math.floor(Date.now() / 1000);
    const list = pruneOtp(await readJSON<OtpChallenge[]>(OTP_KEY, []), now).filter(
      (c) => c.phone !== challenge.phone,
    );
    list.push(challenge);
    await writeJSON(OTP_KEY, list);
  });
}

export async function getOtpChallenge(phone: string): Promise<OtpChallenge | undefined> {
  const now = Math.floor(Date.now() / 1000);
  const list = pruneOtp(await readJSON<OtpChallenge[]>(OTP_KEY, []), now);
  return list.find((c) => c.phone === phone);
}

/** Record a failed verify attempt; returns the new attempt count (0 if gone). */
export async function bumpOtpAttempt(phone: string): Promise<number> {
  return withLock(OTP_KEY, async () => {
    const now = Math.floor(Date.now() / 1000);
    const list = pruneOtp(await readJSON<OtpChallenge[]>(OTP_KEY, []), now);
    const hit = list.find((c) => c.phone === phone);
    if (!hit) {
      await writeJSON(OTP_KEY, list);
      return 0;
    }
    hit.attempts += 1;
    await writeJSON(OTP_KEY, list);
    return hit.attempts;
  });
}

export async function clearOtpChallenge(phone: string): Promise<void> {
  await withLock(OTP_KEY, async () => {
    const now = Math.floor(Date.now() / 1000);
    const list = pruneOtp(await readJSON<OtpChallenge[]>(OTP_KEY, []), now).filter(
      (c) => c.phone !== phone,
    );
    await writeJSON(OTP_KEY, list);
  });
}

interface ApiOrderIdempotencyRecord {
  hash: string;
  orderId: string;
  createdAt: number;
}

const ORDER_IDEM_KEY = "api-order-idempotency.json";

/** Resolve a prior order id for an Idempotency-Key hash (24h window). */
export async function getApiOrderIdempotency(hash: string): Promise<string | undefined> {
  const cutoff = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
  const list = await readJSON<ApiOrderIdempotencyRecord[]>(ORDER_IDEM_KEY, []);
  const hit = list.find((r) => r.hash === hash && r.createdAt > cutoff);
  return hit?.orderId;
}

/** Bind an Idempotency-Key hash to a created order id (first writer wins). */
export async function saveApiOrderIdempotency(hash: string, orderId: string): Promise<void> {
  await withLock(ORDER_IDEM_KEY, async () => {
    const now = Math.floor(Date.now() / 1000);
    const cutoff = now - 24 * 60 * 60;
    const list = (await readJSON<ApiOrderIdempotencyRecord[]>(ORDER_IDEM_KEY, [])).filter(
      (r) => r.createdAt > cutoff,
    );
    if (!list.some((r) => r.hash === hash)) {
      list.push({ hash, orderId, createdAt: now });
      await writeJSON(ORDER_IDEM_KEY, list);
    }
  });
}
