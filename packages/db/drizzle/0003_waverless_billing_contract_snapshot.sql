CREATE TABLE IF NOT EXISTS "compute_billing_contract_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"compute_base_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"purchase_type" varchar(32) DEFAULT 'on_demand' NOT NULL,
	"currency" varchar(8) DEFAULT 'CNY' NOT NULL,
	"customer_sell_price_per_gpu_hour" numeric(15, 4) NOT NULL,
	"customer_price_record_id" text,
	"customer_gpu_card_type_id" text NOT NULL,
	"customer_product_line" varchar(64) DEFAULT 'serverless' NOT NULL,
	"customer_billing_unit" varchar(32) DEFAULT 'hour' NOT NULL,
	"supplier_provider_id" varchar(64) DEFAULT 'gongji' NOT NULL,
	"supplier_cost_rate_per_gpu_hour" numeric(15, 4) NOT NULL,
	"snapped_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compute_billing_contract_snapshot" ADD CONSTRAINT "compute_billing_contract_snapshot_compute_base_id_compute_base_id_fk" FOREIGN KEY ("compute_base_id") REFERENCES "public"."compute_base"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "compute_billing_contract_snapshot_base_uk" ON "compute_billing_contract_snapshot" USING btree ("compute_base_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compute_billing_contract_snapshot_tenant_idx" ON "compute_billing_contract_snapshot" USING btree ("tenant_id");
