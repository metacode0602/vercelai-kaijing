-- Module 7: ocean shipments / in-transit inventory (F22 Daraz LK).
-- Creates ocean_* tables (were schema-only historically), packing boxes,
-- ensures inventory_balances in_transit/customs_clearing buckets, and sku_costs for lot costs.

-- inventory_balances: warehouse/bin + transit buckets (idempotent ALTERs)
ALTER TABLE "inventory_balances" ADD COLUMN IF NOT EXISTS "warehouse_code" varchar(64) DEFAULT 'DEFAULT' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD COLUMN IF NOT EXISTS "bin_code" varchar(64);--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD COLUMN IF NOT EXISTS "qc_hold" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD COLUMN IF NOT EXISTS "damaged" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD COLUMN IF NOT EXISTS "in_transit" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD COLUMN IF NOT EXISTS "pending_inbound" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD COLUMN IF NOT EXISTS "customs_clearing" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_balances" ALTER COLUMN "shop_id" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_balances_wh_bin_variant_uidx" ON "inventory_balances" USING btree ("organization_id","warehouse_code","bin_code","variant_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ocean_shipments" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"lot_code" varchar(64) NOT NULL,
	"container_no" varchar(64),
	"container_type" varchar(16),
	"freight_mode" varchar(16),
	"platform" varchar(32) DEFAULT 'daraz' NOT NULL,
	"origin_port" varchar(16),
	"dest_port" varchar(16),
	"destination_warehouse_code" varchar(64),
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"etd" varchar(10),
	"eta_port" varchar(10),
	"eta_warehouse" varchar(10),
	"notes" text,
	"packing_details" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ocean_shipment_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shipment_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"sku_code" varchar(64),
	"qty_shipped" integer DEFAULT 0 NOT NULL,
	"qty_received" integer DEFAULT 0 NOT NULL,
	"qty_damaged" integer DEFAULT 0 NOT NULL,
	"sku_cost_id" text
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ocean_shipment_boxes" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shipment_id" text NOT NULL,
	"box_no" varchar(64) NOT NULL,
	"lead_ref" varchar(64),
	"cbm" numeric(12, 4),
	"weight_kg" numeric(12, 3),
	"seal_no" varchar(64),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sku_costs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"kind" varchar(32) NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"currency" varchar(3) DEFAULT 'CNY' NOT NULL,
	"note" text,
	"version_no" integer DEFAULT 1 NOT NULL,
	"container_lot_id" text,
	"tax_template_code" varchar(64),
	"fee_template_version_id" text,
	"tax_breakdown" jsonb,
	"calculator_snapshot" jsonb,
	"landed_unit_cost" numeric(18, 4),
	"fx_rate_id" text,
	"effective_from" timestamp with time zone,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- freight_mode / packing_details may be missing if ocean_shipments already existed from push
ALTER TABLE "ocean_shipments" ADD COLUMN IF NOT EXISTS "freight_mode" varchar(16);--> statement-breakpoint
ALTER TABLE "ocean_shipments" ADD COLUMN IF NOT EXISTS "packing_details" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "ocean_shipments" ADD CONSTRAINT "ocean_shipments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ocean_shipment_lines" ADD CONSTRAINT "ocean_shipment_lines_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ocean_shipment_lines" ADD CONSTRAINT "ocean_shipment_lines_shipment_id_ocean_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."ocean_shipments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ocean_shipment_lines" ADD CONSTRAINT "ocean_shipment_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ocean_shipment_boxes" ADD CONSTRAINT "ocean_shipment_boxes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ocean_shipment_boxes" ADD CONSTRAINT "ocean_shipment_boxes_shipment_id_ocean_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."ocean_shipments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sku_costs" ADD CONSTRAINT "sku_costs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sku_costs" ADD CONSTRAINT "sku_costs_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "ocean_shipments_org_lot_uidx" ON "ocean_shipments" USING btree ("organization_id","lot_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ocean_shipments_status_idx" ON "ocean_shipments" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ocean_shipments_org_idx" ON "ocean_shipments" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ocean_shipment_lines_ship_variant_uidx" ON "ocean_shipment_lines" USING btree ("shipment_id","variant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ocean_shipment_lines_shipment_idx" ON "ocean_shipment_lines" USING btree ("shipment_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ocean_shipment_boxes_ship_box_uidx" ON "ocean_shipment_boxes" USING btree ("shipment_id","box_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ocean_shipment_boxes_shipment_idx" ON "ocean_shipment_boxes" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ocean_shipment_boxes_org_idx" ON "ocean_shipment_boxes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sku_costs_org_idx" ON "sku_costs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sku_costs_variant_idx" ON "sku_costs" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sku_costs_lot_idx" ON "sku_costs" USING btree ("container_lot_id");
