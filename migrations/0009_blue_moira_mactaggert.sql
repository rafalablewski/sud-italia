CREATE TABLE "customer_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"body" text NOT NULL,
	"tags" text[],
	"authored_by" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_members" (
	"phone" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"last_name" text,
	"nickname" text,
	"email" text,
	"dob" text,
	"signed_up_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "point_adjustments" (
	"id" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"adjusted_by" text NOT NULL,
	"adjusted_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "customer_notes_phone_idx" ON "customer_notes" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "customer_notes_created_idx" ON "customer_notes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "point_adjustments_phone_idx" ON "point_adjustments" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "point_adjustments_adjusted_at_idx" ON "point_adjustments" USING btree ("adjusted_at");