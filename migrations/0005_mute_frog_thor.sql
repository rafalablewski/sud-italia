CREATE TABLE "ingredient_stock" (
	"ingredient_id" text NOT NULL,
	"location_slug" text NOT NULL,
	"on_hand" integer NOT NULL,
	"par_level" integer NOT NULL,
	"reorder_point" integer NOT NULL,
	"last_counted_at" timestamp with time zone,
	"last_counted_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingredient_stock_ingredient_id_location_slug_pk" PRIMARY KEY("ingredient_id","location_slug")
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"unit" text NOT NULL,
	"cost_per_unit" integer NOT NULL,
	"supplier" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" text PRIMARY KEY NOT NULL,
	"menu_item_id" text NOT NULL,
	"prep_time_minutes" integer,
	"yield_portions" integer NOT NULL,
	"notes" text,
	"ingredients_payload" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"ingredient_id" text NOT NULL,
	"location_slug" text NOT NULL,
	"type" text NOT NULL,
	"quantity" integer NOT NULL,
	"cost_impact" integer,
	"reason" text,
	"by_user" text,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ingredient_stock_location_idx" ON "ingredient_stock" USING btree ("location_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "recipes_menu_item_id_unique" ON "recipes" USING btree ("menu_item_id");--> statement-breakpoint
CREATE INDEX "stock_movements_ingredient_occurred_idx" ON "stock_movements" USING btree ("ingredient_id","occurred_at");--> statement-breakpoint
CREATE INDEX "stock_movements_location_occurred_idx" ON "stock_movements" USING btree ("location_slug","occurred_at");