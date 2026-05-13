CREATE TABLE "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"location_slug" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"overall_rating" integer NOT NULL,
	"category_ratings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"comment" text NOT NULL,
	"status" text NOT NULL,
	"sentiment" text,
	"themes" text[],
	"analyzed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "feedback_location_created_idx" ON "feedback" USING btree ("location_slug","created_at");--> statement-breakpoint
CREATE INDEX "feedback_status_idx" ON "feedback" USING btree ("status");--> statement-breakpoint
CREATE INDEX "feedback_order_id_idx" ON "feedback" USING btree ("order_id");