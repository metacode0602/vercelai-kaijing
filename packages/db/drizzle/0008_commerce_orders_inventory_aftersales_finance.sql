-- Commerce P0/P1: orders, fulfillment, inventory, aftersales and finance.
-- Removes legacy parcel columns from orders/order_lines; parcel data lives in shipments.
CREATE TABLE "account_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shop_id" text NOT NULL,
	"transaction_number" varchar(128) NOT NULL,
	"transaction_time" timestamp with time zone,
	"type" varchar(64),
	"sub_type" varchar(64),
	"amount" numeric(18, 4),
	"currency" varchar(3),
	"amount_unit" varchar(16) DEFAULT 'major' NOT NULL,
	"status" varchar(32),
	"reference" varchar(128),
	"raw" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fulfillment_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shop_id" text NOT NULL,
	"shipment_id" text,
	"order_id" text,
	"external_package_id" varchar(128),
	"action" varchar(64) NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"attempt_no" integer DEFAULT 1 NOT NULL,
	"result" varchar(32) NOT NULL,
	"error_code" varchar(64),
	"error_message" text,
	"retryable" boolean DEFAULT false NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"raw" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shop_id" text,
	"variant_id" text NOT NULL,
	"warehouse_code" varchar(64) DEFAULT 'DEFAULT' NOT NULL,
	"bin_code" varchar(64),
	"movement_type" varchar(32) NOT NULL,
	"qty_delta" integer NOT NULL,
	"on_hand_after" integer NOT NULL,
	"reserved_after" integer NOT NULL,
	"qc_hold_after" integer DEFAULT 0 NOT NULL,
	"damaged_after" integer DEFAULT 0 NOT NULL,
	"source_type" varchar(32),
	"source_id" text,
	"operator" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shop_id" text NOT NULL,
	"order_id" text NOT NULL,
	"order_line_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"warehouse_code" varchar(64) DEFAULT 'DEFAULT' NOT NULL,
	"bin_code" varchar(64),
	"qty" integer DEFAULT 1 NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	"committed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "logistics_fee_details" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shop_id" text NOT NULL,
	"settlement_id" text,
	"statement_id" varchar(128),
	"external_order_id" varchar(128),
	"order_id" text,
	"external_order_line_id" varchar(128),
	"order_line_id" text,
	"external_package_id" varchar(128),
	"shipment_id" text,
	"fee_code" varchar(64),
	"fee_name" text,
	"amount" numeric(18, 4),
	"tax_amount" numeric(18, 4),
	"currency" varchar(3),
	"amount_unit" varchar(16) DEFAULT 'major' NOT NULL,
	"fee_created_at" timestamp with time zone,
	"raw" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_status_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shop_id" text NOT NULL,
	"order_id" text NOT NULL,
	"order_line_id" text,
	"from_status" varchar(64),
	"to_status" varchar(64) NOT NULL,
	"source" varchar(16) DEFAULT 'sync' NOT NULL,
	"event_time" timestamp with time zone NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shop_id" text NOT NULL,
	"reverse_order_id" text,
	"reverse_order_line_id" text,
	"external_refund_id" varchar(128),
	"amount" numeric(18, 4) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"amount_unit" varchar(16) DEFAULT 'major' NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"refunded_at" timestamp with time zone,
	"raw" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "return_shipments" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shop_id" text NOT NULL,
	"reverse_order_id" text NOT NULL,
	"reverse_order_line_id" text,
	"tracking_number" varchar(128),
	"provider_code" varchar(64),
	"provider_name" varchar(128),
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"shipped_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"raw" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reverse_order_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"reverse_order_id" text NOT NULL,
	"reverse_order_line_id" text,
	"direction" varchar(16),
	"event_type" varchar(64) NOT NULL,
	"content" text,
	"event_time" timestamp with time zone NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reverse_order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shop_id" text NOT NULL,
	"reverse_order_id" text NOT NULL,
	"external_reverse_line_id" varchar(128) NOT NULL,
	"order_line_id" text,
	"external_order_line_id" varchar(128),
	"reverse_status" varchar(64),
	"fulfillment_status" varchar(64),
	"reason_code" varchar(64),
	"reason_text" text,
	"refund_amount" numeric(18, 4),
	"currency" varchar(3),
	"amount_unit" varchar(16) DEFAULT 'major' NOT NULL,
	"qc_decision" varchar(64),
	"tracking_number" varchar(128),
	"sla_at" timestamp with time zone,
	"is_dispute" boolean DEFAULT false NOT NULL,
	"is_need_refund" boolean DEFAULT false NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reverse_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shop_id" text NOT NULL,
	"external_reverse_order_id" varchar(128) NOT NULL,
	"order_id" text,
	"external_trade_order_id" varchar(128),
	"request_type" varchar(32),
	"return_to_type" varchar(32),
	"shipping_type" varchar(32),
	"is_rtm" boolean DEFAULT false NOT NULL,
	"platform_status" varchar(64),
	"fulfillment_status" varchar(64),
	"dispute_in_progress" boolean DEFAULT false NOT NULL,
	"platform_created_at" timestamp with time zone,
	"platform_updated_at" timestamp with time zone,
	"raw" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reverse_qc_records" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"reverse_order_line_id" text NOT NULL,
	"qc_decision" varchar(64) NOT NULL,
	"qc_at" timestamp with time zone NOT NULL,
	"warehouse_code" varchar(64),
	"raw" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipment_items" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shipment_id" text NOT NULL,
	"order_line_id" text NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shop_id" text NOT NULL,
	"order_id" text NOT NULL,
	"external_package_id" varchar(128) NOT NULL,
	"tracking_number" varchar(128),
	"provider_code" varchar(64),
	"provider_name" varchar(128),
	"provider_type" varchar(32),
	"warehouse_code" varchar(64),
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"platform_status" varchar(64),
	"rts_at" timestamp with time zone,
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"raw" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracking_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shipment_id" text NOT NULL,
	"status_code" varchar(64) NOT NULL,
	"title" text,
	"description" text,
	"location" text,
	"event_time" timestamp with time zone NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "shop_sku" varchar(128);--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "paid_price" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "tax_amount" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "discount_amount" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "shipping_amount" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "payment_time" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "platform_status" varchar(64);--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "return_status" varchar(64);--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "reason_code" varchar(64);--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "reason_text" text;--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "order_type" varchar(32);--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "order_flag" varchar(32);--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "warehouse_code" varchar(64);--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "is_fbl" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "seller_sku" varchar(128);--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "platform_sku_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "order_number" varchar(128);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "platform_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_fee" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_fee_original" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_fee_discount_seller" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_fee_discount_platform" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "voucher_amount" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "voucher_platform" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "voucher_seller" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "buyer_note" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "remarks" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "need_cancel_confirm" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "is_cancel_pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pending_actions" ADD COLUMN "platform_request_id" varchar(128);--> statement-breakpoint
ALTER TABLE "pending_actions" ADD COLUMN "platform_response" jsonb;--> statement-breakpoint
ALTER TABLE "pending_actions" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pending_actions" ADD COLUMN "next_retry_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pending_actions" ADD COLUMN "last_error_code" varchar(64);--> statement-breakpoint
ALTER TABLE "pending_actions" ADD COLUMN "last_error_message" text;--> statement-breakpoint
ALTER TABLE "settlement_lines" ADD COLUMN "order_line_id" text;--> statement-breakpoint
ALTER TABLE "settlement_lines" ADD COLUMN "fee_type" varchar(64);--> statement-breakpoint
ALTER TABLE "settlement_lines" ADD COLUMN "fee_name" text;--> statement-breakpoint
ALTER TABLE "settlement_lines" ADD COLUMN "transaction_type" varchar(64);--> statement-breakpoint
ALTER TABLE "settlement_lines" ADD COLUMN "external_transaction_id" varchar(128);--> statement-breakpoint
ALTER TABLE "settlement_lines" ADD COLUMN "external_order_no" varchar(128);--> statement-breakpoint
ALTER TABLE "settlement_lines" ADD COLUMN "tax_amount" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "settlement_lines" ADD COLUMN "wht_amount" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "settlement_lines" ADD COLUMN "wht_included_in_amount" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settlement_lines" ADD COLUMN "amount_unit" varchar(16) DEFAULT 'major' NOT NULL;--> statement-breakpoint
ALTER TABLE "settlement_lines" ADD COLUMN "paid_status" varchar(32);--> statement-breakpoint
ALTER TABLE "settlement_lines" ADD COLUMN "payment_reference" varchar(128);--> statement-breakpoint
ALTER TABLE "settlement_lines" ADD COLUMN "seller_sku" varchar(128);--> statement-breakpoint
ALTER TABLE "settlement_lines" ADD COLUMN "platform_sku_id" text;--> statement-breakpoint
ALTER TABLE "settlement_lines" ADD COLUMN "shipping_provider" varchar(128);--> statement-breakpoint
ALTER TABLE "settlement_lines" ADD COLUMN "shipping_speed" varchar(64);--> statement-breakpoint
ALTER TABLE "settlement_lines" ADD COLUMN "shipment_type" varchar(64);--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "amount_unit" varchar(16) DEFAULT 'major' NOT NULL;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "item_revenue" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "other_revenue_total" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "subtotal1" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "subtotal2" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "refunds_amount" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "fees_on_refunds_total" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "shipment_fee" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "shipment_fee_credit" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "fees_total" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "guarantee_deposit" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "opening_balance" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "closing_balance" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "payout_amount" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "payout_status" varchar(32);--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "platform_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "platform_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_transactions" ADD CONSTRAINT "account_transactions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_transactions" ADD CONSTRAINT "account_transactions_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_attempts" ADD CONSTRAINT "fulfillment_attempts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_attempts" ADD CONSTRAINT "fulfillment_attempts_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_attempts" ADD CONSTRAINT "fulfillment_attempts_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_attempts" ADD CONSTRAINT "fulfillment_attempts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_fee_details" ADD CONSTRAINT "logistics_fee_details_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_fee_details" ADD CONSTRAINT "logistics_fee_details_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_fee_details" ADD CONSTRAINT "logistics_fee_details_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_fee_details" ADD CONSTRAINT "logistics_fee_details_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_fee_details" ADD CONSTRAINT "logistics_fee_details_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_fee_details" ADD CONSTRAINT "logistics_fee_details_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_reverse_order_id_reverse_orders_id_fk" FOREIGN KEY ("reverse_order_id") REFERENCES "public"."reverse_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_reverse_order_line_id_reverse_order_items_id_fk" FOREIGN KEY ("reverse_order_line_id") REFERENCES "public"."reverse_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_shipments" ADD CONSTRAINT "return_shipments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_shipments" ADD CONSTRAINT "return_shipments_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_shipments" ADD CONSTRAINT "return_shipments_reverse_order_id_reverse_orders_id_fk" FOREIGN KEY ("reverse_order_id") REFERENCES "public"."reverse_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_shipments" ADD CONSTRAINT "return_shipments_reverse_order_line_id_reverse_order_items_id_f" FOREIGN KEY ("reverse_order_line_id") REFERENCES "public"."reverse_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reverse_order_events" ADD CONSTRAINT "reverse_order_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reverse_order_events" ADD CONSTRAINT "reverse_order_events_reverse_order_id_reverse_orders_id_fk" FOREIGN KEY ("reverse_order_id") REFERENCES "public"."reverse_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reverse_order_events" ADD CONSTRAINT "reverse_order_events_reverse_order_line_id_reverse_order_items_" FOREIGN KEY ("reverse_order_line_id") REFERENCES "public"."reverse_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reverse_order_items" ADD CONSTRAINT "reverse_order_items_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reverse_order_items" ADD CONSTRAINT "reverse_order_items_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reverse_order_items" ADD CONSTRAINT "reverse_order_items_reverse_order_id_reverse_orders_id_fk" FOREIGN KEY ("reverse_order_id") REFERENCES "public"."reverse_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reverse_order_items" ADD CONSTRAINT "reverse_order_items_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reverse_orders" ADD CONSTRAINT "reverse_orders_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reverse_orders" ADD CONSTRAINT "reverse_orders_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reverse_orders" ADD CONSTRAINT "reverse_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reverse_qc_records" ADD CONSTRAINT "reverse_qc_records_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reverse_qc_records" ADD CONSTRAINT "reverse_qc_records_reverse_order_line_id_reverse_order_items_id" FOREIGN KEY ("reverse_order_line_id") REFERENCES "public"."reverse_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_transactions_org_time_idx" ON "account_transactions" USING btree ("organization_id","transaction_time");--> statement-breakpoint
CREATE INDEX "account_transactions_shop_time_idx" ON "account_transactions" USING btree ("shop_id","transaction_time");--> statement-breakpoint
CREATE UNIQUE INDEX "account_transactions_shop_ext_uidx" ON "account_transactions" USING btree ("shop_id","transaction_number");--> statement-breakpoint
CREATE INDEX "fulfillment_attempts_org_idx" ON "fulfillment_attempts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "fulfillment_attempts_shipment_idx" ON "fulfillment_attempts" USING btree ("shipment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fulfillment_attempts_org_action_key_uidx" ON "fulfillment_attempts" USING btree ("organization_id","action","idempotency_key");--> statement-breakpoint
CREATE INDEX "inventory_movements_org_variant_time_idx" ON "inventory_movements" USING btree ("organization_id","variant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "inventory_movements_source_idx" ON "inventory_movements" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "inventory_reservations_org_idx" ON "inventory_reservations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "inventory_reservations_order_idx" ON "inventory_reservations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "inventory_reservations_variant_status_idx" ON "inventory_reservations" USING btree ("variant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_reservations_shop_line_uidx" ON "inventory_reservations" USING btree ("shop_id","order_line_id");--> statement-breakpoint
CREATE INDEX "logistics_fee_details_org_time_idx" ON "logistics_fee_details" USING btree ("organization_id","fee_created_at");--> statement-breakpoint
CREATE INDEX "logistics_fee_details_shop_time_idx" ON "logistics_fee_details" USING btree ("shop_id","fee_created_at");--> statement-breakpoint
CREATE INDEX "logistics_fee_details_settlement_idx" ON "logistics_fee_details" USING btree ("settlement_id");--> statement-breakpoint
CREATE INDEX "logistics_fee_details_order_line_idx" ON "logistics_fee_details" USING btree ("order_line_id");--> statement-breakpoint
CREATE INDEX "order_status_events_org_idx" ON "order_status_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "order_status_events_shop_order_time_idx" ON "order_status_events" USING btree ("shop_id","order_id","event_time");--> statement-breakpoint
CREATE INDEX "order_status_events_order_line_idx" ON "order_status_events" USING btree ("order_line_id");--> statement-breakpoint
CREATE INDEX "refunds_org_idx" ON "refunds" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "refunds_reverse_order_idx" ON "refunds" USING btree ("reverse_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_shop_ext_uidx" ON "refunds" USING btree ("shop_id","external_refund_id");--> statement-breakpoint
CREATE INDEX "return_shipments_org_idx" ON "return_shipments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "return_shipments_reverse_order_idx" ON "return_shipments" USING btree ("reverse_order_id");--> statement-breakpoint
CREATE INDEX "reverse_order_events_org_idx" ON "reverse_order_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "reverse_order_events_order_time_idx" ON "reverse_order_events" USING btree ("reverse_order_id","event_time");--> statement-breakpoint
CREATE INDEX "reverse_order_items_org_idx" ON "reverse_order_items" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "reverse_order_items_order_idx" ON "reverse_order_items" USING btree ("reverse_order_id");--> statement-breakpoint
CREATE INDEX "reverse_order_items_order_line_idx" ON "reverse_order_items" USING btree ("order_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reverse_order_items_shop_ext_uidx" ON "reverse_order_items" USING btree ("shop_id","external_reverse_line_id");--> statement-breakpoint
CREATE INDEX "reverse_orders_org_idx" ON "reverse_orders" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "reverse_orders_shop_order_idx" ON "reverse_orders" USING btree ("shop_id","order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reverse_orders_shop_ext_uidx" ON "reverse_orders" USING btree ("shop_id","external_reverse_order_id");--> statement-breakpoint
CREATE INDEX "reverse_qc_records_org_idx" ON "reverse_qc_records" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "reverse_qc_records_line_idx" ON "reverse_qc_records" USING btree ("reverse_order_line_id","qc_at");--> statement-breakpoint
CREATE INDEX "shipment_items_org_idx" ON "shipment_items" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "shipment_items_order_line_idx" ON "shipment_items" USING btree ("order_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_items_shipment_line_uidx" ON "shipment_items" USING btree ("shipment_id","order_line_id");--> statement-breakpoint
CREATE INDEX "shipments_org_idx" ON "shipments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "shipments_shop_order_idx" ON "shipments" USING btree ("shop_id","order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_shop_ext_pkg_uidx" ON "shipments" USING btree ("shop_id","external_package_id");--> statement-breakpoint
CREATE INDEX "tracking_events_org_idx" ON "tracking_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tracking_events_shipment_time_idx" ON "tracking_events" USING btree ("shipment_id","event_time");--> statement-breakpoint
CREATE UNIQUE INDEX "tracking_events_shipment_time_status_uidx" ON "tracking_events" USING btree ("shipment_id","event_time","status_code");--> statement-breakpoint
ALTER TABLE "settlement_lines" ADD CONSTRAINT "settlement_lines_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_lines_org_seller_sku_idx" ON "order_lines" USING btree ("organization_id","seller_sku");--> statement-breakpoint
CREATE UNIQUE INDEX "order_lines_order_ext_uidx" ON "order_lines" USING btree ("order_id","external_line_id");--> statement-breakpoint
CREATE INDEX "orders_shop_platform_updated_idx" ON "orders" USING btree ("shop_id","platform_updated_at");--> statement-breakpoint
CREATE INDEX "settlement_lines_order_line_idx" ON "settlement_lines" USING btree ("order_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_lines_settlement_ext_txn_uidx" ON "settlement_lines" USING btree ("settlement_id","external_transaction_id");--> statement-breakpoint
ALTER TABLE "order_lines" DROP COLUMN "package_id";--> statement-breakpoint
ALTER TABLE "order_lines" DROP COLUMN "tracking_number";--> statement-breakpoint
ALTER TABLE "order_lines" DROP COLUMN "shipping_provider";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "shipping_provider";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "tracking_number";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "package_id";