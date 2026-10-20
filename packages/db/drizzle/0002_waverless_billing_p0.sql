CREATE TABLE IF NOT EXISTS "compute_usage_event" (
	"id" text PRIMARY KEY NOT NULL,
	"source" varchar(32) DEFAULT 'waverless' NOT NULL,
	"source_event_id" varchar(256) NOT NULL,
	"event_version" integer DEFAULT 1 NOT NULL,
	"tenant_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"compute_base_id" text NOT NULL,
	"worker_id" varchar(256) NOT NULL,
	"provider_id" varchar(64) DEFAULT 'gongji' NOT NULL,
	"provider_resource_id" varchar(256),
	"logical_az_id" varchar(128),
	"meter" varchar(64) DEFAULT 'gpu_runtime' NOT NULL,
	"quantity" numeric(20, 6) NOT NULL,
	"unit" varchar(32) DEFAULT 'gpu_second' NOT NULL,
	"gpu_count" integer DEFAULT 1 NOT NULL,
	"interval_start" timestamp with time zone NOT NULL,
	"interval_end" timestamp with time zone NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"slice_status" varchar(16) DEFAULT 'closed' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "compute_billing_window" (
	"id" text PRIMARY KEY NOT NULL,
	"compute_base_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"status" varchar(32) DEFAULT 'open' NOT NULL,
	"customer_quantity" numeric(20, 6) DEFAULT '0' NOT NULL,
	"customer_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"customer_unit_price_per_gpu_hour" numeric(15, 4),
	"customer_price_record_id" text,
	"supplier_quantity" numeric(20, 6) DEFAULT '0' NOT NULL,
	"supplier_estimated_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"supplier_cost_rate_per_gpu_hour" numeric(15, 4),
	"wallet_tx_id" text,
	"idempotency_key" varchar(256) NOT NULL,
	"settled_at" timestamp with time zone,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "compute_customer_ledger_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"compute_base_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"billing_window_id" text,
	"kind" varchar(32) NOT NULL,
	"meter" varchar(64) DEFAULT 'gpu_runtime' NOT NULL,
	"quantity" numeric(20, 6) NOT NULL,
	"unit" varchar(32) DEFAULT 'gpu_second' NOT NULL,
	"unit_price_per_gpu_hour" numeric(15, 4),
	"amount" numeric(15, 4) NOT NULL,
	"currency" varchar(8) DEFAULT 'CNY' NOT NULL,
	"price_record_id" text,
	"balance_tx_id" text,
	"description" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "compute_supplier_cost_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"compute_base_id" text NOT NULL,
	"tenant_id" text,
	"organization_id" text,
	"billing_window_id" text,
	"provider_id" varchar(64) DEFAULT 'gongji' NOT NULL,
	"meter" varchar(64) DEFAULT 'gpu_runtime' NOT NULL,
	"quantity" numeric(20, 6) NOT NULL,
	"unit" varchar(32) DEFAULT 'gpu_second' NOT NULL,
	"cost_rate_per_gpu_hour" numeric(15, 4),
	"estimated_amount" numeric(15, 4) NOT NULL,
	"currency" varchar(8) DEFAULT 'CNY' NOT NULL,
	"status" varchar(32) DEFAULT 'accrued' NOT NULL,
	"description" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compute_usage_event" ADD CONSTRAINT "compute_usage_event_compute_base_id_compute_base_id_fk" FOREIGN KEY ("compute_base_id") REFERENCES "public"."compute_base"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compute_billing_window" ADD CONSTRAINT "compute_billing_window_compute_base_id_compute_base_id_fk" FOREIGN KEY ("compute_base_id") REFERENCES "public"."compute_base"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compute_customer_ledger_entry" ADD CONSTRAINT "compute_customer_ledger_entry_compute_base_id_compute_base_id_fk" FOREIGN KEY ("compute_base_id") REFERENCES "public"."compute_base"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compute_customer_ledger_entry" ADD CONSTRAINT "compute_customer_ledger_entry_billing_window_id_compute_billing_window_id_fk" FOREIGN KEY ("billing_window_id") REFERENCES "public"."compute_billing_window"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compute_supplier_cost_entry" ADD CONSTRAINT "compute_supplier_cost_entry_compute_base_id_compute_base_id_fk" FOREIGN KEY ("compute_base_id") REFERENCES "public"."compute_base"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compute_supplier_cost_entry" ADD CONSTRAINT "compute_supplier_cost_entry_billing_window_id_compute_billing_window_id_fk" FOREIGN KEY ("billing_window_id") REFERENCES "public"."compute_billing_window"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "compute_usage_event_source_uk" ON "compute_usage_event" USING btree ("source","source_event_id","event_version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compute_usage_event_base_idx" ON "compute_usage_event" USING btree ("compute_base_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compute_usage_event_interval_idx" ON "compute_usage_event" USING btree ("compute_base_id","interval_start","interval_end");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compute_usage_event_worker_idx" ON "compute_usage_event" USING btree ("worker_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "compute_billing_window_uk" ON "compute_billing_window" USING btree ("compute_base_id","window_start","window_end");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "compute_billing_window_idem_uk" ON "compute_billing_window" USING btree ("idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compute_billing_window_status_idx" ON "compute_billing_window" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compute_billing_window_tenant_idx" ON "compute_billing_window" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compute_customer_ledger_base_idx" ON "compute_customer_ledger_entry" USING btree ("compute_base_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compute_customer_ledger_window_idx" ON "compute_customer_ledger_entry" USING btree ("billing_window_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compute_customer_ledger_tenant_idx" ON "compute_customer_ledger_entry" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compute_supplier_cost_base_idx" ON "compute_supplier_cost_entry" USING btree ("compute_base_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compute_supplier_cost_window_idx" ON "compute_supplier_cost_entry" USING btree ("billing_window_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compute_supplier_cost_provider_idx" ON "compute_supplier_cost_entry" USING btree ("provider_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compute_supplier_cost_status_idx" ON "compute_supplier_cost_entry" USING btree ("status");
