ALTER TABLE "orders" ADD COLUMN "delivery_fee_grosze" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "assigned_driver_id" text;--> statement-breakpoint
CREATE INDEX "orders_assigned_driver_idx" ON "orders" USING btree ("assigned_driver_id");