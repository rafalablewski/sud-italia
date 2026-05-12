CREATE TABLE "checkout_attempts" (
	"idempotency_hash" text PRIMARY KEY NOT NULL,
	"stripe_session_id" text NOT NULL,
	"stripe_session_url" text NOT NULL,
	"order_id" text NOT NULL,
	"location_slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_events_provider_event_id_pk" PRIMARY KEY("provider","event_id")
);
--> statement-breakpoint
CREATE INDEX "checkout_attempts_created_at_idx" ON "checkout_attempts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "checkout_attempts_expires_at_idx" ON "checkout_attempts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "webhook_events_processed_at_idx" ON "webhook_events" USING btree ("processed_at");