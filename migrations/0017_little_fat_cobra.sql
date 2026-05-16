CREATE TABLE "customer_segments" (
	"phone" text PRIMARY KEY NOT NULL,
	"segment" text NOT NULL,
	"rfm_score" integer NOT NULL,
	"recency_days" integer NOT NULL,
	"frequency" integer NOT NULL,
	"monetary_grosze" integer NOT NULL,
	"lifetime_value_grosze" integer NOT NULL,
	"predicted_cltv_grosze" integer NOT NULL,
	"factors" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"address" text NOT NULL,
	"lat" integer NOT NULL,
	"lng" integer NOT NULL,
	"hero_image" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"short_description" text DEFAULT '' NOT NULL,
	"hours" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"currency" text DEFAULT 'PLN' NOT NULL,
	"serves_alcohol" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"owner_phone" text NOT NULL,
	"owner_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_redemptions" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"referee_phone" text NOT NULL,
	"order_id" text,
	"reward_given_grosze" integer DEFAULT 0 NOT NULL,
	"discount_applied_grosze" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"qualified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"direction" text NOT NULL,
	"kind" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"meta" jsonb,
	"actor" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "customer_segments_segment_idx" ON "customer_segments" USING btree ("segment");--> statement-breakpoint
CREATE INDEX "customer_segments_computed_at_idx" ON "customer_segments" USING btree ("computed_at");--> statement-breakpoint
CREATE INDEX "locations_is_active_idx" ON "locations" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "locations_display_order_idx" ON "locations" USING btree ("display_order");--> statement-breakpoint
CREATE INDEX "referral_codes_owner_phone_idx" ON "referral_codes" USING btree ("owner_phone");--> statement-breakpoint
CREATE INDEX "referral_redemptions_code_idx" ON "referral_redemptions" USING btree ("code");--> statement-breakpoint
CREATE INDEX "referral_redemptions_referee_phone_idx" ON "referral_redemptions" USING btree ("referee_phone");--> statement-breakpoint
CREATE INDEX "referral_redemptions_status_idx" ON "referral_redemptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_phone_at_idx" ON "whatsapp_messages" USING btree ("phone","at");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_at_idx" ON "whatsapp_messages" USING btree ("at");