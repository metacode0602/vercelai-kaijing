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
CREATE TABLE "commerce_freight_rate_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"freight_mode" varchar(16) NOT NULL,
	"carrier_id" text,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"unit_rate" numeric(18, 4) DEFAULT '0' NOT NULL,
	"min_charge" numeric(18, 4) DEFAULT '0' NOT NULL,
	"surcharge" numeric(18, 4) DEFAULT '0' NOT NULL,
	"thc" numeric(18, 4) DEFAULT '0' NOT NULL,
	"volumetric_divisor" integer,
	"usable_cbm" numeric(12, 4),
	"unit_rate_per_ton" numeric(18, 4),
	"origin_port" varchar(16),
	"dest_port" varchar(16),
	"effective_from" varchar(10) NOT NULL,
	"effective_to" varchar(10),
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "cs_inbox_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shop_id" text NOT NULL,
	"platform" varchar(32) NOT NULL,
	"external_message_id" varchar(128) NOT NULL,
	"external_session_id" varchar(128),
	"customer" varchar(255),
	"customer_external_id" varchar(128),
	"subject" varchar(512),
	"preview" text,
	"body" text,
	"sku" varchar(64),
	"status" varchar(16) DEFAULT 'unread' NOT NULL,
	"received_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"raw" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "marketplace_app_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"platform" varchar(32) NOT NULL,
	"region" varchar(16) DEFAULT '' NOT NULL,
	"app_key" varchar(128) NOT NULL,
	"app_secret_encrypted" text NOT NULL,
	"callback_key" varchar(64),
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"last_verified_at" timestamp with time zone,
	"last_error" text,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_aftersale_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shop_id" text NOT NULL,
	"inventory_release_mode" varchar(16) DEFAULT 'manual' NOT NULL,
	"refund_mode" varchar(16) DEFAULT 'manual' NOT NULL,
	"refund_wait_days" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "commerce_brands_org_name_idx";--> statement-breakpoint
DROP INDEX "inventory_balances_wh_bin_variant_uidx";--> statement-breakpoint
ALTER TABLE "invitation" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_balances" ALTER COLUMN "bin_code" SET DEFAULT 'UNASSIGNED';--> statement-breakpoint
ALTER TABLE "web_auth"."invitation" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "commerce_brands" ADD COLUMN "cover_image" text;--> statement-breakpoint
ALTER TABLE "commerce_dictionaries" ADD COLUMN "value_titles" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "fulfillment_batches" ADD COLUMN "carrier_id" text;--> statement-breakpoint
ALTER TABLE "integration_credentials" ADD COLUMN "app_credential_id" text;--> statement-breakpoint
ALTER TABLE "integration_states" ADD COLUMN "last_reverse_sync_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ocean_shipment_boxes" ADD COLUMN "carton_spec_code" varchar(64);--> statement-breakpoint
ALTER TABLE "ocean_shipments" ADD COLUMN "carrier_id" text;--> statement-breakpoint
ALTER TABLE "ocean_shipments" ADD COLUMN "destination_warehouse_id" text;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD COLUMN "batch_no" varchar(64);--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD COLUMN "carrier" varchar(64);--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD COLUMN "tracking_no" varchar(128);--> statement-breakpoint
ALTER TABLE "reverse_orders" ADD COLUMN "inventory_release_mode" varchar(16) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "reverse_orders" ADD COLUMN "inventory_release_status" varchar(24) DEFAULT 'pending_manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "reverse_orders" ADD COLUMN "inventory_released_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reverse_orders" ADD COLUMN "refund_mode" varchar(16) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "reverse_orders" ADD COLUMN "refund_wait_days" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "reverse_orders" ADD COLUMN "refund_decision" varchar(24) DEFAULT 'pending_manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "reverse_orders" ADD COLUMN "refund_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "inventory_pool_id" text;--> statement-breakpoint
ALTER TABLE "web_auth"."invitation" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "bin_binding_history" ADD CONSTRAINT "bin_binding_history_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bin_binding_history" ADD CONSTRAINT "bin_binding_history_warehouse_id_commerce_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."commerce_warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bin_binding_history" ADD CONSTRAINT "bin_binding_history_bin_id_commerce_bins_id_fk" FOREIGN KEY ("bin_id") REFERENCES "public"."commerce_bins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bin_binding_history" ADD CONSTRAINT "bin_binding_history_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bin_binding_history" ADD CONSTRAINT "bin_binding_history_binding_id_commerce_bin_bindings_id_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."commerce_bin_bindings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_bin_bindings" ADD CONSTRAINT "commerce_bin_bindings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_bin_bindings" ADD CONSTRAINT "commerce_bin_bindings_warehouse_id_commerce_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."commerce_warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_bin_bindings" ADD CONSTRAINT "commerce_bin_bindings_bin_id_commerce_bins_id_fk" FOREIGN KEY ("bin_id") REFERENCES "public"."commerce_bins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_bin_bindings" ADD CONSTRAINT "commerce_bin_bindings_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_freight_rate_cards" ADD CONSTRAINT "commerce_freight_rate_cards_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_freight_rate_cards" ADD CONSTRAINT "commerce_freight_rate_cards_carrier_id_commerce_carriers_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."commerce_carriers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_warehouse_zones" ADD CONSTRAINT "commerce_warehouse_zones_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_warehouse_zones" ADD CONSTRAINT "commerce_warehouse_zones_warehouse_id_commerce_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."commerce_warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cs_inbox_messages" ADD CONSTRAINT "cs_inbox_messages_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cs_inbox_messages" ADD CONSTRAINT "cs_inbox_messages_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_pools" ADD CONSTRAINT "inventory_pools_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_pools" ADD CONSTRAINT "inventory_pools_warehouse_id_commerce_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."commerce_warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_app_credentials" ADD CONSTRAINT "marketplace_app_credentials_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_aftersale_policies" ADD CONSTRAINT "shop_aftersale_policies_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_aftersale_policies" ADD CONSTRAINT "shop_aftersale_policies_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bin_binding_history_org_bin_time_idx" ON "bin_binding_history" USING btree ("organization_id","bin_id","occurred_at");--> statement-breakpoint
CREATE INDEX "bin_binding_history_org_wh_time_idx" ON "bin_binding_history" USING btree ("organization_id","warehouse_id","occurred_at");--> statement-breakpoint
CREATE INDEX "bin_binding_history_org_binding_idx" ON "bin_binding_history" USING btree ("organization_id","binding_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_bin_bindings_active_bin_uidx" ON "commerce_bin_bindings" USING btree ("organization_id","bin_id") WHERE "commerce_bin_bindings"."state" = 'active';--> statement-breakpoint
CREATE INDEX "commerce_bin_bindings_org_variant_idx" ON "commerce_bin_bindings" USING btree ("organization_id","variant_id","state");--> statement-breakpoint
CREATE INDEX "commerce_bin_bindings_org_wh_idx" ON "commerce_bin_bindings" USING btree ("organization_id","warehouse_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_freight_rate_cards_org_code_uidx" ON "commerce_freight_rate_cards" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "commerce_freight_rate_cards_org_mode_idx" ON "commerce_freight_rate_cards" USING btree ("organization_id","freight_mode","status");--> statement-breakpoint
CREATE INDEX "commerce_freight_rate_cards_carrier_idx" ON "commerce_freight_rate_cards" USING btree ("carrier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_warehouse_zones_wh_code_uidx" ON "commerce_warehouse_zones" USING btree ("organization_id","warehouse_id","code");--> statement-breakpoint
CREATE INDEX "commerce_warehouse_zones_org_wh_status_idx" ON "commerce_warehouse_zones" USING btree ("organization_id","warehouse_id","status");--> statement-breakpoint
CREATE INDEX "cs_inbox_messages_org_idx" ON "cs_inbox_messages" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "cs_inbox_messages_org_received_idx" ON "cs_inbox_messages" USING btree ("organization_id","received_at");--> statement-breakpoint
CREATE INDEX "cs_inbox_messages_shop_idx" ON "cs_inbox_messages" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "cs_inbox_messages_platform_idx" ON "cs_inbox_messages" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "cs_inbox_messages_sku_idx" ON "cs_inbox_messages" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "cs_inbox_messages_status_idx" ON "cs_inbox_messages" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "cs_inbox_messages_shop_ext_uidx" ON "cs_inbox_messages" USING btree ("shop_id","external_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_pools_org_code_uidx" ON "inventory_pools" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "inventory_pools_org_wh_status_idx" ON "inventory_pools" USING btree ("organization_id","warehouse_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_app_credentials_org_platform_region_uidx" ON "marketplace_app_credentials" USING btree ("organization_id","platform","region");--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_app_credentials_callback_key_uidx" ON "marketplace_app_credentials" USING btree ("callback_key");--> statement-breakpoint
CREATE INDEX "marketplace_app_credentials_org_platform_idx" ON "marketplace_app_credentials" USING btree ("organization_id","platform");--> statement-breakpoint
CREATE INDEX "marketplace_app_credentials_platform_app_key_idx" ON "marketplace_app_credentials" USING btree ("platform","app_key");--> statement-breakpoint
CREATE INDEX "shop_aftersale_policies_org_idx" ON "shop_aftersale_policies" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_aftersale_policies_shop_uidx" ON "shop_aftersale_policies" USING btree ("shop_id");--> statement-breakpoint
ALTER TABLE "fulfillment_batches" ADD CONSTRAINT "fulfillment_batches_carrier_id_commerce_carriers_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."commerce_carriers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_app_credential_id_marketplace_app_crede" FOREIGN KEY ("app_credential_id") REFERENCES "public"."marketplace_app_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocean_shipment_lines" ADD CONSTRAINT "ocean_shipment_lines_sku_cost_id_sku_costs_id_fk" FOREIGN KEY ("sku_cost_id") REFERENCES "public"."sku_costs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocean_shipments" ADD CONSTRAINT "ocean_shipments_carrier_id_commerce_carriers_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."commerce_carriers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocean_shipments" ADD CONSTRAINT "ocean_shipments_destination_warehouse_id_commerce_warehouses_id" FOREIGN KEY ("destination_warehouse_id") REFERENCES "public"."commerce_warehouses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_inventory_pool_id_inventory_pools_id_fk" FOREIGN KEY ("inventory_pool_id") REFERENCES "public"."inventory_pools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sku_costs" ADD CONSTRAINT "sku_costs_container_lot_id_ocean_shipments_id_fk" FOREIGN KEY ("container_lot_id") REFERENCES "public"."ocean_shipments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sku_costs" ADD CONSTRAINT "sku_costs_fx_rate_id_fx_rates_id_fk" FOREIGN KEY ("fx_rate_id") REFERENCES "public"."fx_rates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitation_phone_idx" ON "invitation" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_brands_org_name_uidx" ON "commerce_brands" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "fulfillment_batches_carrier_idx" ON "fulfillment_batches" USING btree ("carrier_id");--> statement-breakpoint
CREATE INDEX "integration_credentials_app_credential_idx" ON "integration_credentials" USING btree ("app_credential_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_credentials_shop_kind_uidx" ON "integration_credentials" USING btree ("shop_id","kind");--> statement-breakpoint
CREATE INDEX "ocean_shipments_destination_warehouse_idx" ON "ocean_shipments" USING btree ("destination_warehouse_id");--> statement-breakpoint
CREATE INDEX "ocean_shipments_carrier_idx" ON "ocean_shipments" USING btree ("carrier_id");--> statement-breakpoint
CREATE INDEX "reverse_orders_refund_due_idx" ON "reverse_orders" USING btree ("refund_decision","refund_due_at");--> statement-breakpoint
CREATE INDEX "invitation_phone_idx" ON "web_auth"."invitation" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_balances_wh_bin_variant_uidx" ON "inventory_balances" USING btree ("organization_id","warehouse_code",coalesce("bin_code", 'UNASSIGNED'),"variant_id");--> statement-breakpoint
ALTER TABLE "ocean_shipments" ADD CONSTRAINT "ocean_shipments_status_check" CHECK ("ocean_shipments"."status" in ('draft', 'booked', 'departed', 'arrived', 'customs', 'received', 'cancelled'));