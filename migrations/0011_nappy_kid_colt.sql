CREATE TABLE "kds_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"station_id" text NOT NULL,
	"location_slug" text NOT NULL,
	"status" text DEFAULT 'fired' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"promised_ready_at" timestamp with time zone,
	"fired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	"bumped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_item_station" (
	"menu_item_id" text NOT NULL,
	"station_id" text NOT NULL,
	CONSTRAINT "menu_item_station_menu_item_id_station_id_pk" PRIMARY KEY("menu_item_id","station_id")
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"id" text PRIMARY KEY NOT NULL,
	"location_slug" text NOT NULL,
	"name" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"active" text DEFAULT 'true' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "kds_tickets_order_idx" ON "kds_tickets" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "kds_tickets_station_status_idx" ON "kds_tickets" USING btree ("station_id","status");--> statement-breakpoint
CREATE INDEX "kds_tickets_location_status_fired_idx" ON "kds_tickets" USING btree ("location_slug","status","fired_at");--> statement-breakpoint
CREATE INDEX "menu_item_station_station_idx" ON "menu_item_station" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "stations_location_idx" ON "stations" USING btree ("location_slug");