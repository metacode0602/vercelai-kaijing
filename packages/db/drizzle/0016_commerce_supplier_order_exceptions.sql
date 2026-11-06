-- Module 12: suppliers + supplier_skus + order_exception_cases; optional FKs on purchase lines.

CREATE TABLE IF NOT EXISTS "commerce_suppliers" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	"phone" varchar(64) DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"settlement" text DEFAULT '' NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "supplier_skus" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"sku_code" varchar(64) NOT NULL,
	"factory_code" varchar(128) NOT NULL,
	"unit_price" numeric(15, 4) DEFAULT '0' NOT NULL,
	"currency" varchar(3) DEFAULT 'CNY' NOT NULL,
	"moq" integer DEFAULT 1 NOT NULL,
	"lead_days" integer DEFAULT 0 NOT NULL,
	"effective_from" varchar(10) NOT NULL,
	"preferred" boolean DEFAULT false NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"remark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "order_exception_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"case_no" varchar(32) NOT NULL,
	"kind" varchar(32) NOT NULL,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"shop_id" text,
	"order_id" text,
	"order_line_id" text,
	"external_order_id" varchar(128),
	"outbound_id" text,
	"reservation_id" text,
	"source_type" varchar(32) NOT NULL,
	"source_id" text NOT NULL,
	"seller_sku" varchar(128),
	"internal_sku" varchar(128),
	"title" text DEFAULT '' NOT NULL,
	"detail" text,
	"blocks_fulfillment" boolean DEFAULT true NOT NULL,
	"assigned_to" text,
	"resolution" text,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"last_scanned_at" timestamp with time zone,
	"raw" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "purchase_requests" ADD COLUMN IF NOT EXISTS "supplier_id" text;--> statement-breakpoint
ALTER TABLE "purchase_request_lines" ADD COLUMN IF NOT EXISTS "supplier_sku_id" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "supplier_id" text;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD COLUMN IF NOT EXISTS "supplier_sku" varchar(128);--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD COLUMN IF NOT EXISTS "supplier_sku_id" text;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "commerce_suppliers" ADD CONSTRAINT "commerce_suppliers_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_skus" ADD CONSTRAINT "supplier_skus_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_skus" ADD CONSTRAINT "supplier_skus_supplier_id_commerce_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."commerce_suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_skus" ADD CONSTRAINT "supplier_skus_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "order_exception_cases" ADD CONSTRAINT "order_exception_cases_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "order_exception_cases" ADD CONSTRAINT "order_exception_cases_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "order_exception_cases" ADD CONSTRAINT "order_exception_cases_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "order_exception_cases" ADD CONSTRAINT "order_exception_cases_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "order_exception_cases" ADD CONSTRAINT "order_exception_cases_outbound_id_stock_outbounds_id_fk" FOREIGN KEY ("outbound_id") REFERENCES "public"."stock_outbounds"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "order_exception_cases" ADD CONSTRAINT "order_exception_cases_reservation_id_inventory_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."inventory_reservations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_supplier_id_commerce_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."commerce_suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "purchase_request_lines" ADD CONSTRAINT "purchase_request_lines_supplier_sku_id_supplier_skus_id_fk" FOREIGN KEY ("supplier_sku_id") REFERENCES "public"."supplier_skus"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_commerce_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."commerce_suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_supplier_sku_id_supplier_skus_id_fk" FOREIGN KEY ("supplier_sku_id") REFERENCES "public"."supplier_skus"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "commerce_suppliers_org_code_uidx" ON "commerce_suppliers" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commerce_suppliers_org_status_idx" ON "commerce_suppliers" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commerce_suppliers_org_name_idx" ON "commerce_suppliers" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_skus_org_sup_sku_factory_uidx" ON "supplier_skus" USING btree ("organization_id","supplier_id","sku_code","factory_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_skus_org_sku_idx" ON "supplier_skus" USING btree ("organization_id","sku_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_skus_org_status_idx" ON "supplier_skus" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_skus_supplier_idx" ON "supplier_skus" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_skus_variant_idx" ON "supplier_skus" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "order_exception_cases_org_no_uidx" ON "order_exception_cases" USING btree ("organization_id","case_no");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "order_exception_cases_org_source_uidx" ON "order_exception_cases" USING btree ("organization_id","kind","source_type","source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_exception_cases_org_status_idx" ON "order_exception_cases" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_exception_cases_org_kind_idx" ON "order_exception_cases" USING btree ("organization_id","kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_exception_cases_order_idx" ON "order_exception_cases" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_exception_cases_shop_idx" ON "order_exception_cases" USING btree ("shop_id");
