CREATE TABLE "slots" (
	"id" text PRIMARY KEY NOT NULL,
	"location_slug" text NOT NULL,
	"date" text NOT NULL,
	"time" text NOT NULL,
	"max_orders" integer NOT NULL,
	"current_orders" integer DEFAULT 0 NOT NULL,
	"fulfillment_types" text[] NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "slots_location_date_time_unique" ON "slots" USING btree ("location_slug","date","time");--> statement-breakpoint
CREATE INDEX "slots_location_date_idx" ON "slots" USING btree ("location_slug","date");--> statement-breakpoint
CREATE INDEX "slots_status_idx" ON "slots" USING btree ("status");