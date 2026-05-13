-- Gemini review feedback (PR #17): flip text-as-boolean and text-as-date
-- columns to native types for data integrity + indexability.
--
-- Existing prod data holds 'true' / 'false' strings and YYYY-MM-DD dates,
-- so the USING casts are lossless. Defaults restored after the type change
-- because ALTER COLUMN TYPE strips them. Empty-string dobs are coerced to
-- NULL (Postgres' date::date rejects '').
--
-- Idempotency: ALTER COLUMN TYPE is a no-op when the target type already
-- matches, so the migration is safe to re-run.

ALTER TABLE "customers" ALTER COLUMN "sms_optout" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "sms_optout" SET DATA TYPE boolean USING (sms_optout::boolean);--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "sms_optout" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "email_optout" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "email_optout" SET DATA TYPE boolean USING (email_optout::boolean);--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "email_optout" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "location_assignments" ALTER COLUMN "setup_complete" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "location_assignments" ALTER COLUMN "setup_complete" SET DATA TYPE boolean USING (setup_complete::boolean);--> statement-breakpoint
ALTER TABLE "location_assignments" ALTER COLUMN "setup_complete" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "loyalty_members" ALTER COLUMN "dob" SET DATA TYPE date USING (NULLIF(dob, '')::date);--> statement-breakpoint
ALTER TABLE "staff" ALTER COLUMN "hire_date" SET DATA TYPE date USING (NULLIF(hire_date, '')::date);--> statement-breakpoint
ALTER TABLE "staff" ALTER COLUMN "dob" SET DATA TYPE date USING (NULLIF(dob, '')::date);--> statement-breakpoint
ALTER TABLE "stations" ALTER COLUMN "active" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "stations" ALTER COLUMN "active" SET DATA TYPE boolean USING (active::boolean);--> statement-breakpoint
ALTER TABLE "stations" ALTER COLUMN "active" SET DEFAULT true;
