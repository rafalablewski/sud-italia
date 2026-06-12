import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { locationsTable } from "@/db/schema";
import { ensureTable } from "@/db/migrate";
import { logger } from "@/lib/logger";
import type { Location } from "@/data/types";

/**
 * Audit §2 "Scalability (ops)" — locations were hardcoded in
 * `src/data/locations.ts`, which meant a third truck required a code
 * change + deploy. This module is the database-backed source of truth.
 * The hardcoded list now exists only as seed data for first-deploy /
 * dev mode; once the table has rows it wins.
 *
 * Read paths cache aggressively (in-process) because the active-location
 * list is hit on every public page load. Mutations bust the cache via
 * `invalidateLocationsCache()`.
 */

const LOCATIONS_DDL = [
  `CREATE TABLE IF NOT EXISTS locations (
    slug text PRIMARY KEY,
    name text NOT NULL,
    city text NOT NULL,
    address text NOT NULL,
    lat integer NOT NULL,
    lng integer NOT NULL,
    hero_image text NOT NULL DEFAULT '',
    description text NOT NULL DEFAULT '',
    short_description text NOT NULL DEFAULT '',
    hours jsonb NOT NULL DEFAULT '[]'::jsonb,
    currency text NOT NULL DEFAULT 'PLN',
    serves_alcohol boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT false,
    display_order integer NOT NULL DEFAULT 0,
    team_lead text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  // Added after the table shipped — idempotent so existing deployments gain it.
  `ALTER TABLE locations ADD COLUMN IF NOT EXISTS team_lead text NOT NULL DEFAULT ''`,
  `CREATE INDEX IF NOT EXISTS locations_is_active_idx ON locations (is_active)`,
  `CREATE INDEX IF NOT EXISTS locations_display_order_idx ON locations (display_order)`,
];

async function ensureLocationsTable(): Promise<void> {
  await ensureTable("locations", LOCATIONS_DDL);
}

type LocationRow = typeof locationsTable.$inferSelect;

/**
 * The Location interface doesn't include `displayOrder` (it's a runtime
 * presentation concern, not a domain field), but the admin manager UI
 * reads it back on edit. So we widen the return type with a non-Location
 * field rather than mutate the shared Location interface.
 */
export type LocationWithOrder = Location & { displayOrder: number };

function rowToLocation(row: LocationRow): LocationWithOrder {
  return {
    slug: row.slug,
    name: row.name,
    city: row.city,
    address: row.address,
    coordinates: { lat: row.lat / 1_000_000, lng: row.lng / 1_000_000 },
    heroImage: row.heroImage,
    description: row.description,
    shortDescription: row.shortDescription,
    hours: row.hours as Location["hours"],
    isActive: row.isActive,
    currency: row.currency as "PLN",
    servesAlcohol: row.servesAlcohol,
    teamLead: row.teamLead || undefined,
    displayOrder: row.displayOrder,
  };
}

function locationToValues(loc: Location, displayOrder: number) {
  return {
    slug: loc.slug,
    name: loc.name,
    city: loc.city,
    address: loc.address,
    lat: Math.round(loc.coordinates.lat * 1_000_000),
    lng: Math.round(loc.coordinates.lng * 1_000_000),
    heroImage: loc.heroImage,
    description: loc.description,
    shortDescription: loc.shortDescription,
    hours: loc.hours,
    currency: loc.currency,
    servesAlcohol: !!loc.servesAlcohol,
    isActive: loc.isActive,
    teamLead: loc.teamLead ?? "",
    displayOrder,
    updatedAt: new Date(),
  };
}

// In-process cache — the active-location list is hit on every public page
// render and the row count is small (≤ low hundreds even at chain scale).
// TTL is short so admin edits propagate within seconds without a manual
// cache bust on every callsite.
const CACHE_TTL_MS = 30_000;
let cache: { value: LocationWithOrder[]; expiresAt: number } | null = null;

export function invalidateLocationsCache(): void {
  cache = null;
}

async function readFromDb(): Promise<LocationWithOrder[] | null> {
  const db = getDb();
  if (!db) return null;
  try {
    await ensureLocationsTable();
    const rows = await db
      .select()
      .from(locationsTable)
      .orderBy(locationsTable.displayOrder, locationsTable.slug);
    if (rows.length === 0) return null;
    return rows.map(rowToLocation);
  } catch (err) {
    logger.warn(
      "locations-store: db read failed, falling back to seed",
      { layer: "locations-store" },
      err,
    );
    return null;
  }
}

/**
 * Returns every location in the system (active + inactive). When the DB
 * has rows it's the source of truth; otherwise we fall back to the
 * hardcoded seed in src/data/locations.ts so a fresh deploy still works.
 */
export async function getAllLocationsAsync(): Promise<LocationWithOrder[]> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;
  const fromDb = await readFromDb();
  if (fromDb) {
    cache = { value: fromDb, expiresAt: now + CACHE_TTL_MS };
    return fromDb;
  }
  const { locations: seed } = await import("@/data/locations");
  // Seed rows don't have an explicit displayOrder — use array position
  // so the seed presents in the same order it's declared.
  const withOrder = seed.map((loc, i) => ({ ...loc, displayOrder: i }));
  cache = { value: withOrder, expiresAt: now + CACHE_TTL_MS };
  return withOrder;
}

export async function getActiveLocationsAsync(): Promise<LocationWithOrder[]> {
  return (await getAllLocationsAsync()).filter((l) => l.isActive);
}

export async function getLocationAsync(
  slug: string,
): Promise<LocationWithOrder | undefined> {
  return (await getAllLocationsAsync()).find((l) => l.slug === slug);
}

/**
 * Upsert a location. Used by the admin CRUD route and by the one-time
 * seeding path that migrates the hardcoded list into the DB.
 */
export async function upsertLocation(
  loc: Location,
  displayOrder: number = 0,
): Promise<Location> {
  const db = getDb();
  if (!db) {
    throw new Error("upsertLocation requires DATABASE_URL");
  }
  await ensureLocationsTable();
  const values = locationToValues(loc, displayOrder);
  await db
    .insert(locationsTable)
    .values(values)
    .onConflictDoUpdate({
      target: locationsTable.slug,
      set: values,
    });
  invalidateLocationsCache();
  return loc;
}

export async function deleteLocation(slug: string): Promise<boolean> {
  const db = getDb();
  if (!db) {
    throw new Error("deleteLocation requires DATABASE_URL");
  }
  await ensureLocationsTable();
  const deleted = await db
    .delete(locationsTable)
    .where(eq(locationsTable.slug, slug))
    .returning({ slug: locationsTable.slug });
  invalidateLocationsCache();
  return deleted.length > 0;
}

/**
 * One-shot seed used by the admin "Sync seed" button and by the dispatch
 * cron's first run on a fresh DB. Idempotent: upserts every row from the
 * hardcoded list, preserving display order by array index.
 */
export async function seedLocationsFromCode(): Promise<{ seeded: number }> {
  const db = getDb();
  if (!db) return { seeded: 0 };
  const { locations: seed } = await import("@/data/locations");
  let seeded = 0;
  for (let i = 0; i < seed.length; i++) {
    await upsertLocation(seed[i], i);
    seeded++;
  }
  return { seeded };
}
