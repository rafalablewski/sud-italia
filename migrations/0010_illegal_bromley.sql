CREATE TABLE "outbox_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"payload" jsonb NOT NULL,
	"scheduled_for" timestamp with time zone DEFAULT now() NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "outbox_processed_scheduled_idx" ON "outbox_events" USING btree ("processed_at","scheduled_for");--> statement-breakpoint
CREATE INDEX "outbox_event_type_idx" ON "outbox_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "outbox_entity_idx" ON "outbox_events" USING btree ("entity_type","entity_id");