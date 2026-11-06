-- Module 8: WMS warehouses/bins, stock adjustments, non-order outbound ledger support.
-- Depends on inventory_balances transit columns from 0014; reuses stock_outbounds from 0010.

CREATE TABLE IF NOT EXISTS "commerce_warehouses" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"type" varchar(32) DEFAULT 'self_operated' NOT NULL,
	"country" varchar(8) DEFAULT 'CN' NOT NULL,
	"timezone" varchar(64) DEFAULT 'Asia/Shanghai' NOT NULL,
	"operating_currency" varchar(3) DEFAULT 'CNY' NOT NULL,
	"address" text,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"note" text,
	"raw" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "commerce_bins" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"warehouse_code" varchar(64) NOT NULL,
	"zone_code" varchar(32),
	"code" varchar(64) NOT NULL,
	"name" text,
	"bound_sku" varchar(64),
	"status" varchar(16) DEFAULT 'empty' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "stock_adjustments" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"adjustment_no" varchar(32) NOT NULL,
	"kind" varchar(32) NOT NULL,
	"warehouse_code" varchar(64) NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"reason" text NOT NULL,
	"applicant" text,
	"approver" text,
	"reject_reason" text,
	"remark" text,
	"idempotency_key" varchar(191) NOT NULL,
	"approved_at" timestamp with time zone,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "stock_adjustment_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"stock_adjustment_id" text NOT NULL,
	"line_no" integer NOT NULL,
	"variant_id" text NOT NULL,
	"sku_code" varchar(64) NOT NULL,
	"bin_code" varchar(64) NOT NULL,
	"qty_system" integer DEFAULT 0 NOT NULL,
	"qty_counted" integer DEFAULT 0 NOT NULL,
	"qty_diff" integer DEFAULT 0 NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "commerce_warehouses" ADD CONSTRAINT "commerce_warehouses_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "commerce_bins" ADD CONSTRAINT "commerce_bins_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "commerce_bins" ADD CONSTRAINT "commerce_bins_warehouse_id_commerce_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."commerce_warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "stock_adjustment_lines" ADD CONSTRAINT "stock_adjustment_lines_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "stock_adjustment_lines" ADD CONSTRAINT "stock_adjustment_lines_stock_adjustment_id_stock_adjustments_id_fk" FOREIGN KEY ("stock_adjustment_id") REFERENCES "public"."stock_adjustments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "stock_adjustment_lines" ADD CONSTRAINT "stock_adjustment_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "commerce_warehouses_org_code_uidx" ON "commerce_warehouses" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commerce_warehouses_org_status_idx" ON "commerce_warehouses" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "commerce_bins_wh_code_uidx" ON "commerce_bins" USING btree ("organization_id","warehouse_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commerce_bins_org_wh_idx" ON "commerce_bins" USING btree ("organization_id","warehouse_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commerce_bins_bound_sku_idx" ON "commerce_bins" USING btree ("organization_id","bound_sku");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stock_adjustments_org_no_uidx" ON "stock_adjustments" USING btree ("organization_id","adjustment_no");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stock_adjustments_org_idem_uidx" ON "stock_adjustments" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_adjustments_org_status_idx" ON "stock_adjustments" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_adjustment_lines_adj_idx" ON "stock_adjustment_lines" USING btree ("stock_adjustment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_adjustment_lines_org_idx" ON "stock_adjustment_lines" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stock_adjustment_lines_adj_line_uidx" ON "stock_adjustment_lines" USING btree ("stock_adjustment_id","line_no");
