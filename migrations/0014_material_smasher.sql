CREATE TABLE "royalty_statements" (
	"id" text PRIMARY KEY NOT NULL,
	"franchisee_id" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"revenue_grosze" integer NOT NULL,
	"royalty_grosze" integer NOT NULL,
	"marketing_fund_grosze" integer NOT NULL,
	"order_count" integer NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "royalty_statements_franchisee_period_idx" ON "royalty_statements" USING btree ("franchisee_id","period_end");