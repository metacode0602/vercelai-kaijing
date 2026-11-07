-- LGS/JSB 交接批次关联承运商主档（mirror ocean_shipments.carrier_id）
ALTER TABLE "fulfillment_batches" ADD COLUMN IF NOT EXISTS "carrier_id" text;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "fulfillment_batches" ADD CONSTRAINT "fulfillment_batches_carrier_id_commerce_carriers_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."commerce_carriers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fulfillment_batches_carrier_idx" ON "fulfillment_batches" USING btree ("carrier_id");
