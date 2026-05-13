CREATE TABLE "brands" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "franchisees" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"royalty_rate_bps" integer DEFAULT 800 NOT NULL,
	"marketing_fund_bps" integer DEFAULT 200 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_assignments" (
	"location_slug" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"franchisee_id" text,
	"region_slug" text,
	"setup_complete" text DEFAULT 'true' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "franchisees_brand_idx" ON "franchisees" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "franchisees_email_idx" ON "franchisees" USING btree ("email");--> statement-breakpoint
CREATE INDEX "location_assignments_brand_idx" ON "location_assignments" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "location_assignments_franchisee_idx" ON "location_assignments" USING btree ("franchisee_id");--> statement-breakpoint
CREATE INDEX "location_assignments_region_idx" ON "location_assignments" USING btree ("region_slug");