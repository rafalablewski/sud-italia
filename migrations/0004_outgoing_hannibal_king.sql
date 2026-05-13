CREATE TABLE "customers" (
	"phone" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"birthday" text,
	"total_spent_grosze" integer DEFAULT 0 NOT NULL,
	"order_count" integer DEFAULT 0 NOT NULL,
	"first_order_at" timestamp with time zone,
	"last_order_at" timestamp with time zone,
	"loyalty_points_balance" integer DEFAULT 0 NOT NULL,
	"manual_points_adjust" integer DEFAULT 0 NOT NULL,
	"sms_optout" text DEFAULT 'false' NOT NULL,
	"email_optout" text DEFAULT 'false' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "customers_last_order_at_idx" ON "customers" USING btree ("last_order_at");--> statement-breakpoint
CREATE INDEX "customers_email_idx" ON "customers" USING btree ("email");