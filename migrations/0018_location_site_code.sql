-- Locations gained team_lead / code / district via the runtime ensureTable
-- ALTERs in src/lib/locations-store.ts before this migration existed, so every
-- statement is guarded with IF NOT EXISTS: harmless on DBs that already have the
-- columns, and correct on a fresh migrate-from-scratch DB.
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "team_lead" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "code" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "district" text DEFAULT '' NOT NULL;
