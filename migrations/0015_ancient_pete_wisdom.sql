CREATE TABLE "allergen_incidents" (
	"id" text PRIMARY KEY NOT NULL,
	"location_slug" text NOT NULL,
	"customer_phone" text,
	"order_id" text,
	"menu_item_id" text,
	"allergen" text NOT NULL,
	"severity" text NOT NULL,
	"description" text NOT NULL,
	"resolution" text,
	"reported_by" text NOT NULL,
	"reported_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "temp_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"location_slug" text NOT NULL,
	"sensor" text NOT NULL,
	"temp_celsius" integer NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"recorded_by" text,
	"recorded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "allergen_incidents_location_reported_idx" ON "allergen_incidents" USING btree ("location_slug","reported_at");--> statement-breakpoint
CREATE INDEX "allergen_incidents_severity_idx" ON "allergen_incidents" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "temp_logs_location_recorded_idx" ON "temp_logs" USING btree ("location_slug","recorded_at");--> statement-breakpoint
CREATE INDEX "temp_logs_sensor_idx" ON "temp_logs" USING btree ("sensor");--> statement-breakpoint
CREATE INDEX "temp_logs_status_idx" ON "temp_logs" USING btree ("status");