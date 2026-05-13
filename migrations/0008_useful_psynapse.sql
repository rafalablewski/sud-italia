CREATE TABLE "shifts" (
	"id" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"location_slug" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"role" text NOT NULL,
	"status" text NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"role" text NOT NULL,
	"location_slug" text NOT NULL,
	"hourly_rate_grosze" integer NOT NULL,
	"hire_date" text,
	"dob" text,
	"status" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_punches" (
	"id" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"type" text NOT NULL,
	"shift_id" text
);
--> statement-breakpoint
CREATE INDEX "shifts_location_start_idx" ON "shifts" USING btree ("location_slug","start_at");--> statement-breakpoint
CREATE INDEX "shifts_staff_start_idx" ON "shifts" USING btree ("staff_id","start_at");--> statement-breakpoint
CREATE INDEX "shifts_status_idx" ON "shifts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "staff_location_idx" ON "staff" USING btree ("location_slug");--> statement-breakpoint
CREATE INDEX "staff_status_idx" ON "staff" USING btree ("status");--> statement-breakpoint
CREATE INDEX "time_punches_staff_occurred_idx" ON "time_punches" USING btree ("staff_id","occurred_at");