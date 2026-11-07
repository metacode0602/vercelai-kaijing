CREATE TABLE "bin_binding_history" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"bin_id" text NOT NULL,
	"variant_id" text,
	"binding_id" text,
	"action" varchar(16) NOT NULL,
	"reason" text,
	"operator_id" text,
	"operator_type" varchar(16) DEFAULT 'user' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"correction_of" text,
	"request_id" text,
	CONSTRAINT "bin_binding_history_action_check" CHECK ("bin_binding_history"."action" in ('bind', 'unbind', 'disable', 'correct'))
);
--> statement-breakpoint
CREATE TABLE "commerce_bin_bindings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"bin_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"state" varchar(16) DEFAULT 'active' NOT NULL,
	"bound_at" timestamp with time zone DEFAULT now() NOT NULL,
	"bound_by" text,
	"released_at" timestamp with time zone,
	"released_by" text,
	"release_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commerce_bin_bindings_state_check" CHECK ("commerce_bin_bindings"."state" in ('active', 'released', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "commerce_warehouse_zones" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"purpose" text,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commerce_warehouse_zones_status_check" CHECK ("commerce_warehouse_zones"."status" in ('active', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "inventory_pools" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_pools_status_check" CHECK ("inventory_pools"."status" in ('active', 'disabled'))
);
--> statement-breakpoint
DROP INDEX "inventory_balances_wh_bin_variant_uidx";--> statement-breakpoint
ALTER TABLE "inventory_balances" ALTER COLUMN "bin_code" SET DEFAULT 'UNASSIGNED';--> statement-breakpoint
-- 空库位回填哨兵，保证 coalesce 唯一键历史数据不冲突
UPDATE "inventory_balances" SET "bin_code" = 'UNASSIGNED' WHERE "bin_code" IS NULL;--> statement-breakpoint
ALTER TABLE "ocean_shipments" ADD COLUMN "destination_warehouse_id" text;--> statement-breakpoint
-- 目的仓 code → id 回填（不匹配的历史 code 保留，id 留空）
UPDATE "ocean_shipments" AS "os"
SET "destination_warehouse_id" = "cw"."id"
FROM "commerce_warehouses" AS "cw"
WHERE "cw"."organization_id" = "os"."organization_id"
	AND "cw"."code" = "os"."destination_warehouse_code"
	AND "os"."destination_warehouse_id" IS NULL;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "inventory_pool_id" text;--> statement-breakpoint
-- 旧海运状态归一；旧值仅保留读别名
UPDATE "ocean_shipments" SET "status" = 'departed' WHERE "status" = 'in_transit';--> statement-breakpoint
UPDATE "ocean_shipments" SET "status" = 'customs' WHERE "status" = 'customs_clearing';--> statement-breakpoint
UPDATE "ocean_shipments" SET "status" = 'received' WHERE "status" = 'received_local';--> statement-breakpoint
-- 成本关联历史脏数据置空，避免加 FK 失败
UPDATE "sku_costs" AS "sc"
SET "container_lot_id" = NULL
WHERE "sc"."container_lot_id" IS NOT NULL
	AND NOT EXISTS (
		SELECT 1 FROM "ocean_shipments" AS "os" WHERE "os"."id" = "sc"."container_lot_id"
	);--> statement-breakpoint
UPDATE "ocean_shipment_lines" AS "l"
SET "sku_cost_id" = NULL
WHERE "l"."sku_cost_id" IS NOT NULL
	AND NOT EXISTS (
		SELECT 1 FROM "sku_costs" AS "sc" WHERE "sc"."id" = "l"."sku_cost_id"
	);--> statement-breakpoint
ALTER TABLE "bin_binding_history" ADD CONSTRAINT "bin_binding_history_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bin_binding_history" ADD CONSTRAINT "bin_binding_history_warehouse_id_commerce_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."commerce_warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bin_binding_history" ADD CONSTRAINT "bin_binding_history_bin_id_commerce_bins_id_fk" FOREIGN KEY ("bin_id") REFERENCES "public"."commerce_bins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bin_binding_history" ADD CONSTRAINT "bin_binding_history_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bin_binding_history" ADD CONSTRAINT "bin_binding_history_binding_id_commerce_bin_bindings_id_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."commerce_bin_bindings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_bin_bindings" ADD CONSTRAINT "commerce_bin_bindings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_bin_bindings" ADD CONSTRAINT "commerce_bin_bindings_warehouse_id_commerce_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."commerce_warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_bin_bindings" ADD CONSTRAINT "commerce_bin_bindings_bin_id_commerce_bins_id_fk" FOREIGN KEY ("bin_id") REFERENCES "public"."commerce_bins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_bin_bindings" ADD CONSTRAINT "commerce_bin_bindings_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_warehouse_zones" ADD CONSTRAINT "commerce_warehouse_zones_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_warehouse_zones" ADD CONSTRAINT "commerce_warehouse_zones_warehouse_id_commerce_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."commerce_warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_pools" ADD CONSTRAINT "inventory_pools_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_pools" ADD CONSTRAINT "inventory_pools_warehouse_id_commerce_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."commerce_warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bin_binding_history_org_bin_time_idx" ON "bin_binding_history" USING btree ("organization_id","bin_id","occurred_at");--> statement-breakpoint
CREATE INDEX "bin_binding_history_org_wh_time_idx" ON "bin_binding_history" USING btree ("organization_id","warehouse_id","occurred_at");--> statement-breakpoint
CREATE INDEX "bin_binding_history_org_binding_idx" ON "bin_binding_history" USING btree ("organization_id","binding_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_bin_bindings_active_bin_uidx" ON "commerce_bin_bindings" USING btree ("organization_id","bin_id") WHERE "commerce_bin_bindings"."state" = 'active';--> statement-breakpoint
CREATE INDEX "commerce_bin_bindings_org_variant_idx" ON "commerce_bin_bindings" USING btree ("organization_id","variant_id","state");--> statement-breakpoint
CREATE INDEX "commerce_bin_bindings_org_wh_idx" ON "commerce_bin_bindings" USING btree ("organization_id","warehouse_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_warehouse_zones_wh_code_uidx" ON "commerce_warehouse_zones" USING btree ("organization_id","warehouse_id","code");--> statement-breakpoint
CREATE INDEX "commerce_warehouse_zones_org_wh_status_idx" ON "commerce_warehouse_zones" USING btree ("organization_id","warehouse_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_pools_org_code_uidx" ON "inventory_pools" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "inventory_pools_org_wh_status_idx" ON "inventory_pools" USING btree ("organization_id","warehouse_id","status");--> statement-breakpoint
ALTER TABLE "ocean_shipment_lines" ADD CONSTRAINT "ocean_shipment_lines_sku_cost_id_sku_costs_id_fk" FOREIGN KEY ("sku_cost_id") REFERENCES "public"."sku_costs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocean_shipments" ADD CONSTRAINT "ocean_shipments_destination_warehouse_id_commerce_warehouses_id" FOREIGN KEY ("destination_warehouse_id") REFERENCES "public"."commerce_warehouses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_inventory_pool_id_inventory_pools_id_fk" FOREIGN KEY ("inventory_pool_id") REFERENCES "public"."inventory_pools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sku_costs" ADD CONSTRAINT "sku_costs_container_lot_id_ocean_shipments_id_fk" FOREIGN KEY ("container_lot_id") REFERENCES "public"."ocean_shipments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ocean_shipments_destination_warehouse_idx" ON "ocean_shipments" USING btree ("destination_warehouse_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_balances_wh_bin_variant_uidx" ON "inventory_balances" USING btree ("organization_id","warehouse_code",coalesce("bin_code", 'UNASSIGNED'),"variant_id");--> statement-breakpoint
ALTER TABLE "ocean_shipments" ADD CONSTRAINT "ocean_shipments_status_check" CHECK ("ocean_shipments"."status" in ('draft', 'booked', 'departed', 'arrived', 'customs', 'received', 'cancelled'));