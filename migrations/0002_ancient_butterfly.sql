CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"location_slug" text NOT NULL,
	"customer_phone" text NOT NULL,
	"customer_name" text NOT NULL,
	"status" text NOT NULL,
	"fulfillment_type" text NOT NULL,
	"slot_id" text NOT NULL,
	"slot_date" text NOT NULL,
	"slot_time" text NOT NULL,
	"total_grosze" integer NOT NULL,
	"tip_grosze" integer,
	"stripe_session_id" text,
	"stripe_payment_intent_id" text,
	"delivery_address" text,
	"created_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "orders_location_created_at_idx" ON "orders" USING btree ("location_slug","created_at");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_customer_phone_idx" ON "orders" USING btree ("customer_phone");--> statement-breakpoint
CREATE INDEX "orders_stripe_payment_intent_idx" ON "orders" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "orders_slot_id_idx" ON "orders" USING btree ("slot_id");