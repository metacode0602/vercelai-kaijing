CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"inviter_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"scope_type" varchar(16),
	"scope_id" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"logo" text,
	"created_at" timestamp NOT NULL,
	"metadata" jsonb,
	"entry_approved" boolean DEFAULT false NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"org_type" varchar(16) DEFAULT 'tenant' NOT NULL,
	"parent_merchant_org_id" text,
	"supplier_type" varchar(16),
	"supplier_tier" varchar(16),
	"supplier_status" varchar(16),
	"commission_rate" integer,
	"merchant_tier" varchar(16),
	"merchant_status" varchar(16),
	"merchant_commission_rate" integer,
	"enterprise_verification_status" varchar(16) DEFAULT 'unverified' NOT NULL,
	"identity_status" varchar(32) DEFAULT 'unverified' NOT NULL,
	"capsule_namespace_ready" boolean DEFAULT false NOT NULL,
	"capsule_sync_status" varchar(20) DEFAULT 'pending',
	"capsule_synced_at" timestamp,
	"capsule_sync_error" text,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"phone_number" text,
	"phone_number_verified" boolean DEFAULT false NOT NULL,
	"role" varchar(256) DEFAULT 'user',
	"must_change_password" boolean DEFAULT false NOT NULL,
	"provisioned_by" text,
	"provisioned_at" timestamp with time zone,
	"banned" boolean,
	"ban_reason" text,
	"ban_expires" timestamp,
	"customer_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
CREATE TABLE "user_invitation_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"code" varchar(20) NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"max_usage" integer,
	CONSTRAINT "user_invitation_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "user_invitation_relations" (
	"id" text PRIMARY KEY NOT NULL,
	"inviter_id" text NOT NULL,
	"invitee_id" text NOT NULL,
	"invitation_code_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"reward_granted" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "user_site_message" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" varchar(200) NOT NULL,
	"summary" text NOT NULL,
	"content" text NOT NULL,
	"category" varchar(32),
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feishu_external_link" (
	"id" text PRIMARY KEY NOT NULL,
	"domain" varchar(64) NOT NULL,
	"ref_id" text NOT NULL,
	"external_type" varchar(64) NOT NULL,
	"external_id" varchar(128) NOT NULL,
	"external_code" varchar(128),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feishu_integration_config" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" varchar(64) NOT NULL,
	"app_secret_enc" text NOT NULL,
	"encrypt_key" varchar(255),
	"verification_token" varchar(255),
	"webhook_secret" varchar(128),
	"default_approval_codes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"webhook_policy_json" jsonb DEFAULT '{"auto_complete_on_approval":true,"auto_create_enabled":true}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feishu_integration_job_run" (
	"id" text PRIMARY KEY NOT NULL,
	"job_kind" varchar(32) NOT NULL,
	"status" varchar(16) NOT NULL,
	"supplier_id" text,
	"ref_domain" varchar(64),
	"ref_id" text,
	"request_summary" jsonb,
	"response_summary" jsonb,
	"error_message" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "feishu_webhook_event" (
	"id" text PRIMARY KEY NOT NULL,
	"idempotency_key" varchar(256) NOT NULL,
	"instance_id" varchar(128),
	"event_type" varchar(64),
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feishu_work_order_bitable_config" (
	"id" text PRIMARY KEY NOT NULL,
	"app_token" varchar(128) DEFAULT '' NOT NULL,
	"table_id" varchar(128) DEFAULT '' NOT NULL,
	"view_id" varchar(128),
	"work_order_backend" varchar(16) DEFAULT 'bitable' NOT NULL,
	"field_mapping_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"defaults_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status_mapping_json" jsonb DEFAULT '{"待审核":"pending_review","待分配":"pending_assign","处理中":"in_progress","已结束":"completed","已终止":"cancelled"}'::jsonb NOT NULL,
	"inbound_channel" varchar(32) DEFAULT 'bitable_automation' NOT NULL,
	"automation_webhook_secret" varchar(128),
	"automation_token" varchar(255),
	"inbound_policy_json" jsonb DEFAULT '{"timeline_on_every_sync":true,"timeline_on_terminal_only":false,"auto_sync_in_progress_status":true,"dedupe_window_seconds":60}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supply_chain_lead_bitable_sync_config" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"app_token" varchar(128) NOT NULL,
	"table_id" varchar(128) NOT NULL,
	"view_id" varchar(128),
	"field_mapping_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"filter_formula" text,
	"group_key_field" varchar(64) DEFAULT 'idc_name' NOT NULL,
	"merge_key_field" varchar(64) DEFAULT 'name' NOT NULL,
	"gpu_snapshot_merge_mode" varchar(32) DEFAULT 'replace_all' NOT NULL,
	"cron_expr" varchar(64) DEFAULT '30 * * * *' NOT NULL,
	"auto_commit" boolean DEFAULT false NOT NULL,
	"cursor_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"actor_user_id" text,
	"actor_label" text,
	"action" varchar(64) NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"result" varchar(32),
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_id_mappings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shop_id" text NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"internal_id" text NOT NULL,
	"external_id" text NOT NULL,
	"sync_status" varchar(32) DEFAULT 'idle' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"meta" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "fee_template_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"template_id" text NOT NULL,
	"version_no" integer NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"priority" integer DEFAULT 10 NOT NULL,
	"formula_profile" varchar(64),
	"components" jsonb NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"review_needed" boolean DEFAULT true NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"submitted_by" text,
	"submitted_at" timestamp with time zone,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"platform" varchar(32) NOT NULL,
	"country" varchar(8) NOT NULL,
	"fulfillment_pool" varchar(64),
	"fulfillment_logistics" varchar(32),
	"type" varchar(32) NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"note" text,
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
CREATE TABLE "fulfillment_batch_packages" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"shipment_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fulfillment_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"batch_no" varchar(64) NOT NULL,
	"channel" varchar(32) NOT NULL,
	"site" varchar(16),
	"country" varchar(8),
	"warehouse_code" varchar(64),
	"status" varchar(32) DEFAULT 'open' NOT NULL,
	"carrier" varchar(64),
	"tracking_summary" text,
	"package_count" integer DEFAULT 0 NOT NULL,
	"handed_over_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"raw" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"platform" varchar(32),
	"marketplace_code" varchar(32),
	"base_currency" varchar(3) NOT NULL,
	"quote_currency" varchar(3) NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"effective_date" varchar(10) NOT NULL,
	"source" varchar(32) DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shop_id" text NOT NULL,
	"kind" varchar(32) NOT NULL,
	"payload_encrypted" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"direction" varchar(8) NOT NULL,
	"action" varchar(64) NOT NULL,
	"request_id" text,
	"status" varchar(32) NOT NULL,
	"message" text,
	"payload_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_states" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"orders_cursor" text,
	"inventory_cursor" text,
	"products_cursor" text,
	"listings_cursor" text,
	"reviews_cursor" text,
	"last_orders_sync_at" timestamp with time zone,
	"last_inventory_sync_at" timestamp with time zone,
	"last_products_sync_at" timestamp with time zone,
	"last_listings_sync_at" timestamp with time zone,
	"last_logistics_sync_at" timestamp with time zone,
	"last_reviews_sync_at" timestamp with time zone,
	"health" varchar(32) DEFAULT 'idle' NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "inventory_balances" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shop_id" text,
	"warehouse_code" varchar(64) DEFAULT 'DEFAULT' NOT NULL,
	"bin_code" varchar(64),
	"variant_id" text NOT NULL,
	"on_hand" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"qc_hold" integer DEFAULT 0 NOT NULL,
	"damaged" integer DEFAULT 0 NOT NULL,
	"in_transit" integer DEFAULT 0 NOT NULL,
	"pending_inbound" integer DEFAULT 0 NOT NULL,
	"customs_clearing" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
	"idempotency_key" varchar(191),
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
CREATE TABLE "listings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shop_id" text NOT NULL,
	"product_id" text NOT NULL,
	"variant_id" text,
	"primary_variant_id" text,
	"marketplace_id" text,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"title" text,
	"listing_title" text,
	"external_item_id" text,
	"brand_external_id" text,
	"brand_name" text,
	"category_external_id" text,
	"category_path" text,
	"attributes" jsonb DEFAULT '{}'::jsonb,
	"price_amount" numeric(18, 4),
	"price_currency" varchar(3),
	"stock_on_hand" integer,
	"warehouse_code" varchar(64),
	"logistics_channel" varchar(64),
	"publish_state" varchar(32),
	"last_error" text,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"submitted_at" timestamp with time zone,
	"live_at" timestamp with time zone,
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
CREATE TABLE "mapping_exceptions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shop_id" text,
	"seller_sku" varchar(128),
	"platform_sku_id" text,
	"external_order_id" text,
	"reason" varchar(64) NOT NULL,
	"detail" text,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"shop_id" text,
	"platform" varchar(32) NOT NULL,
	"site" varchar(32),
	"seller_id" text,
	"message_type" integer,
	"event_type" varchar(64),
	"external_order_id" text,
	"external_order_line_id" text,
	"order_status" varchar(64),
	"signature_verified" boolean DEFAULT false NOT NULL,
	"status" varchar(16) DEFAULT 'received' NOT NULL,
	"error" text,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ocean_shipment_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shipment_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"sku_code" varchar(64),
	"qty_shipped" integer DEFAULT 0 NOT NULL,
	"qty_received" integer DEFAULT 0 NOT NULL,
	"qty_damaged" integer DEFAULT 0 NOT NULL,
	"sku_cost_id" text
);
--> statement-breakpoint
CREATE TABLE "ocean_shipments" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"lot_code" varchar(64) NOT NULL,
	"container_no" varchar(64),
	"container_type" varchar(16),
	"platform" varchar(32) DEFAULT 'daraz' NOT NULL,
	"origin_port" varchar(16),
	"dest_port" varchar(16),
	"destination_warehouse_code" varchar(64),
	"status" varchar(32) DEFAULT 'in_transit' NOT NULL,
	"etd" varchar(10),
	"eta_port" varchar(10),
	"eta_warehouse" varchar(10),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"external_line_id" text,
	"shop_sku" varchar(128),
	"sku" varchar(128),
	"seller_sku" varchar(128),
	"platform_sku_id" text,
	"title" text,
	"qty" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(18, 4),
	"paid_price" numeric(18, 4),
	"tax_amount" numeric(18, 4),
	"discount_amount" numeric(18, 4),
	"shipping_amount" numeric(18, 4),
	"payment_time" timestamp with time zone,
	"variant_id" text,
	"fulfillment_status" varchar(32),
	"platform_status" varchar(64),
	"return_status" varchar(64),
	"reason_code" varchar(64),
	"reason_text" text,
	"order_type" varchar(32),
	"order_flag" varchar(32),
	"warehouse_code" varchar(64),
	"is_fbl" boolean DEFAULT false NOT NULL
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
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shop_id" text NOT NULL,
	"external_order_id" text NOT NULL,
	"order_number" varchar(128),
	"status" varchar(32) DEFAULT 'unknown' NOT NULL,
	"platform_status" varchar(64),
	"fulfillment_status" varchar(32),
	"placed_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"platform_updated_at" timestamp with time zone,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"total_amount" numeric(18, 4),
	"shipping_fee" numeric(18, 4),
	"shipping_fee_original" numeric(18, 4),
	"shipping_fee_discount_seller" numeric(18, 4),
	"shipping_fee_discount_platform" numeric(18, 4),
	"voucher_amount" numeric(18, 4),
	"voucher_platform" numeric(18, 4),
	"voucher_seller" numeric(18, 4),
	"buyer_region" varchar(64),
	"payment_method" varchar(64),
	"buyer_note" text,
	"remarks" text,
	"need_cancel_confirm" boolean DEFAULT false NOT NULL,
	"is_cancel_pending" boolean DEFAULT false NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shop_id" text,
	"kind" varchar(64) NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"title" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"field_diff" jsonb,
	"idempotency_key" text NOT NULL,
	"platform_request_id" varchar(128),
	"platform_response" jsonb,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"last_error_code" varchar(64),
	"last_error_message" text,
	"created_by" text NOT NULL,
	"expires_at" timestamp with time zone,
	"confirmed_by" text,
	"confirmed_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_brands" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shop_id" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shop_id" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"parent_external_id" text,
	"path" text,
	"leaf" varchar(8),
	"raw" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"category_hint" text,
	"score" numeric(8, 4),
	"rationale" jsonb DEFAULT '{}'::jsonb,
	"status" varchar(16) DEFAULT 'new' NOT NULL,
	"pending_action_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_review_media" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"review_id" text NOT NULL,
	"media_type" varchar(8) DEFAULT 'image' NOT NULL,
	"url" text NOT NULL,
	"storage_key" text,
	"width" integer,
	"height" integer,
	"size_bytes" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shop_id" text NOT NULL,
	"marketplace_id" text,
	"listing_id" text,
	"external_item_id" text NOT NULL,
	"variant_id" text,
	"seller_sku" varchar(128),
	"sku_attrs" jsonb DEFAULT '{}'::jsonb,
	"external_review_id" text NOT NULL,
	"rating" smallint DEFAULT 0 NOT NULL,
	"title" text,
	"content" text,
	"content_zh" text,
	"content_lang" varchar(8),
	"review_at" timestamp with time zone,
	"purchased_at" timestamp with time zone,
	"buyer_display_name" text,
	"buyer_external_id" text,
	"is_anonymous" boolean DEFAULT false NOT NULL,
	"external_order_id" text,
	"useful_count" integer DEFAULT 0 NOT NULL,
	"source" varchar(16) DEFAULT 'api' NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"product_id" text NOT NULL,
	"sku" varchar(128) NOT NULL,
	"sku_code" varchar(32),
	"barcode" varchar(128),
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"weight_grams" integer,
	"length_mm" integer,
	"width_mm" integer,
	"height_mm" integer,
	"attrs" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"spu_code" varchar(32),
	"title" text NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"source" varchar(32) DEFAULT 'manual' NOT NULL,
	"brand" text,
	"category_hint" text,
	"material" text,
	"style" text,
	"owner_user_id" text,
	"images" jsonb DEFAULT '[]'::jsonb,
	"weight_grams" integer,
	"length_mm" integer,
	"width_mm" integer,
	"height_mm" integer,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"purchase_order_id" text NOT NULL,
	"line_no" integer NOT NULL,
	"variant_id" text NOT NULL,
	"sku_code" varchar(64) NOT NULL,
	"qty_ordered" integer NOT NULL,
	"qty_received" integer DEFAULT 0 NOT NULL,
	"qty_qc_passed" integer DEFAULT 0 NOT NULL,
	"qty_stocked" integer DEFAULT 0 NOT NULL,
	"unit_price" numeric(15, 4) DEFAULT '0' NOT NULL,
	"amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"po_no" varchar(32) NOT NULL,
	"purchase_request_id" text,
	"source_request_no" varchar(32),
	"supplier_name" text NOT NULL,
	"warehouse_code" varchar(64) DEFAULT 'WH-CN-XMN-001' NOT NULL,
	"status" varchar(32) DEFAULT 'sent' NOT NULL,
	"expected_arrival_at" varchar(10),
	"currency" varchar(3) DEFAULT 'CNY' NOT NULL,
	"total_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"created_by" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_receipt_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"purchase_receipt_id" text NOT NULL,
	"line_no" integer NOT NULL,
	"po_line_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"sku_code" varchar(64) NOT NULL,
	"qty_ordered" integer DEFAULT 0 NOT NULL,
	"qty_arrived" integer NOT NULL,
	"qty_pending_qc" integer DEFAULT 0 NOT NULL,
	"qty_passed" integer DEFAULT 0 NOT NULL,
	"qty_failed" integer DEFAULT 0 NOT NULL,
	"note" text,
	"suggested_bin" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"receipt_no" varchar(32) NOT NULL,
	"purchase_order_id" text NOT NULL,
	"po_no" varchar(32) NOT NULL,
	"supplier_name" text NOT NULL,
	"warehouse_code" varchar(64) NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"arrived_at" timestamp with time zone,
	"received_by" text,
	"delivery_note" text,
	"remark" text,
	"qc_no" varchar(32),
	"qc_inspector" text,
	"qc_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_request_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"purchase_request_id" text NOT NULL,
	"line_no" integer NOT NULL,
	"variant_id" text NOT NULL,
	"sku_code" varchar(64) NOT NULL,
	"supplier_sku" varchar(128),
	"qty" integer NOT NULL,
	"unit_price" numeric(15, 4) DEFAULT '0' NOT NULL,
	"amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"remark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"request_no" varchar(32) NOT NULL,
	"supplier_name" text NOT NULL,
	"warehouse_code" varchar(64) DEFAULT 'WH-CN-XMN-001' NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"expected_arrival_at" varchar(10),
	"currency" varchar(3) DEFAULT 'CNY' NOT NULL,
	"total_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"reason" text,
	"remark" text,
	"applicant_name" text DEFAULT '' NOT NULL,
	"approver_name" text DEFAULT '' NOT NULL,
	"opinion" text,
	"converted_po_id" text,
	"submitted_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "seller_sku_mappings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shop_id" text NOT NULL,
	"listing_id" text,
	"item_id" text,
	"platform_sku_id" text,
	"seller_sku" varchar(128) NOT NULL,
	"variant_id" text,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"source" varchar(16) DEFAULT 'manual' NOT NULL,
	"synced_at" timestamp with time zone,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlement_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"settlement_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"order_id" text,
	"order_line_id" text,
	"variant_id" text,
	"fee_kind" varchar(32),
	"fee_type" varchar(64),
	"fee_name" text,
	"transaction_type" varchar(64),
	"external_transaction_id" varchar(128),
	"external_order_no" varchar(128),
	"amount" numeric(18, 4),
	"tax_amount" numeric(18, 4),
	"wht_amount" numeric(18, 4),
	"wht_included_in_amount" boolean DEFAULT false NOT NULL,
	"currency" varchar(3),
	"amount_unit" varchar(16) DEFAULT 'major' NOT NULL,
	"paid_status" varchar(32),
	"payment_reference" varchar(128),
	"seller_sku" varchar(128),
	"platform_sku_id" text,
	"shipping_provider" varchar(128),
	"shipping_speed" varchar(64),
	"shipment_type" varchar(64),
	"note" text
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shop_id" text NOT NULL,
	"external_settlement_id" text NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"amount_unit" varchar(16) DEFAULT 'major' NOT NULL,
	"bill_amount" numeric(18, 4),
	"item_revenue" numeric(18, 4),
	"other_revenue_total" numeric(18, 4),
	"subtotal1" numeric(18, 4),
	"subtotal2" numeric(18, 4),
	"refunds_amount" numeric(18, 4),
	"fees_on_refunds_total" numeric(18, 4),
	"shipment_fee" numeric(18, 4),
	"shipment_fee_credit" numeric(18, 4),
	"fees_total" numeric(18, 4),
	"guarantee_deposit" numeric(18, 4),
	"opening_balance" numeric(18, 4),
	"closing_balance" numeric(18, 4),
	"payout_amount" numeric(18, 4),
	"payout_status" varchar(32),
	"paid_at" timestamp with time zone,
	"platform_created_at" timestamp with time zone,
	"platform_updated_at" timestamp with time zone,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
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
CREATE TABLE "shops" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"platform" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"external_shop_id" text,
	"seller_id" text,
	"shop_group" varchar(64),
	"fulfillment_mode" varchar(16) DEFAULT 'fbm' NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"region" varchar(16),
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"timezone" varchar(64),
	"seller_name" text,
	"marketplace_country" varchar(16),
	"auth_expires_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sku_costs" (
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
);
--> statement-breakpoint
CREATE TABLE "stock_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shop_id" text,
	"warehouse_code" varchar(64),
	"variant_id" text NOT NULL,
	"threshold" integer NOT NULL,
	"triggered_at" timestamp with time zone,
	"status" varchar(16) DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_inbounds" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"inbound_no" varchar(32) NOT NULL,
	"source_type" varchar(32) DEFAULT 'purchase' NOT NULL,
	"source_doc" varchar(64) NOT NULL,
	"purchase_order_id" text,
	"po_no" varchar(32),
	"purchase_receipt_id" text,
	"warehouse_code" varchar(64) NOT NULL,
	"variant_id" text NOT NULL,
	"sku_code" varchar(64) NOT NULL,
	"quantity" integer NOT NULL,
	"qc_result" text,
	"bin_code" varchar(64) NOT NULL,
	"operator" text,
	"status" varchar(32) DEFAULT 'pending_shelve' NOT NULL,
	"idempotency_key" varchar(191) NOT NULL,
	"remark" text,
	"shelved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_outbound_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"stock_outbound_id" text NOT NULL,
	"line_no" integer NOT NULL,
	"order_line_id" text,
	"variant_id" text NOT NULL,
	"sku_code" varchar(64) NOT NULL,
	"bin_code" varchar(64) NOT NULL,
	"qty" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_outbounds" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"outbound_no" varchar(32) NOT NULL,
	"outbound_type" varchar(32) DEFAULT 'order' NOT NULL,
	"warehouse_code" varchar(64) DEFAULT 'WH-CN-XMN-001' NOT NULL,
	"shop_id" text,
	"order_id" text,
	"external_order_id" varchar(128),
	"package_id" varchar(64),
	"picker" text,
	"status" varchar(32) DEFAULT 'pending_pick' NOT NULL,
	"idempotency_key" varchar(191) NOT NULL,
	"reason" text,
	"remark" text,
	"picked_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"posted_at" timestamp with time zone,
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
	"source" varchar(16) DEFAULT 'manual' NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_parent_merchant_org_id_organization_id_fk" FOREIGN KEY ("parent_merchant_org_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_active_organization_id_organization_id_fk" FOREIGN KEY ("active_organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invitation_codes" ADD CONSTRAINT "user_invitation_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invitation_relations" ADD CONSTRAINT "user_invitation_relations_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invitation_relations" ADD CONSTRAINT "user_invitation_relations_invitee_id_users_id_fk" FOREIGN KEY ("invitee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invitation_relations" ADD CONSTRAINT "user_invitation_relations_invitation_code_id_user_invitation_co" FOREIGN KEY ("invitation_code_id") REFERENCES "public"."user_invitation_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_site_message" ADD CONSTRAINT "user_site_message_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_transactions" ADD CONSTRAINT "account_transactions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_transactions" ADD CONSTRAINT "account_transactions_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_id_mappings" ADD CONSTRAINT "external_id_mappings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_id_mappings" ADD CONSTRAINT "external_id_mappings_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_template_versions" ADD CONSTRAINT "fee_template_versions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_template_versions" ADD CONSTRAINT "fee_template_versions_template_id_fee_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."fee_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_templates" ADD CONSTRAINT "fee_templates_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_attempts" ADD CONSTRAINT "fulfillment_attempts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_attempts" ADD CONSTRAINT "fulfillment_attempts_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_attempts" ADD CONSTRAINT "fulfillment_attempts_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_attempts" ADD CONSTRAINT "fulfillment_attempts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_batch_packages" ADD CONSTRAINT "fulfillment_batch_packages_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_batch_packages" ADD CONSTRAINT "fulfillment_batch_packages_batch_id_fulfillment_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."fulfillment_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_batch_packages" ADD CONSTRAINT "fulfillment_batch_packages_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_batches" ADD CONSTRAINT "fulfillment_batches_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fx_rates" ADD CONSTRAINT "fx_rates_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_logs" ADD CONSTRAINT "integration_logs_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_states" ADD CONSTRAINT "integration_states_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_primary_variant_id_product_variants_id_fk" FOREIGN KEY ("primary_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_fee_details" ADD CONSTRAINT "logistics_fee_details_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_fee_details" ADD CONSTRAINT "logistics_fee_details_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_fee_details" ADD CONSTRAINT "logistics_fee_details_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_fee_details" ADD CONSTRAINT "logistics_fee_details_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_fee_details" ADD CONSTRAINT "logistics_fee_details_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_fee_details" ADD CONSTRAINT "logistics_fee_details_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapping_exceptions" ADD CONSTRAINT "mapping_exceptions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapping_exceptions" ADD CONSTRAINT "mapping_exceptions_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_webhook_events" ADD CONSTRAINT "marketplace_webhook_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_webhook_events" ADD CONSTRAINT "marketplace_webhook_events_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocean_shipment_lines" ADD CONSTRAINT "ocean_shipment_lines_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocean_shipment_lines" ADD CONSTRAINT "ocean_shipment_lines_shipment_id_ocean_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."ocean_shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocean_shipment_lines" ADD CONSTRAINT "ocean_shipment_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocean_shipments" ADD CONSTRAINT "ocean_shipments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_actions" ADD CONSTRAINT "pending_actions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_actions" ADD CONSTRAINT "pending_actions_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_brands" ADD CONSTRAINT "platform_brands_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_brands" ADD CONSTRAINT "platform_brands_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_categories" ADD CONSTRAINT "platform_categories_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_categories" ADD CONSTRAINT "platform_categories_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_candidates" ADD CONSTRAINT "product_candidates_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_candidates" ADD CONSTRAINT "product_candidates_pending_action_id_pending_actions_id_fk" FOREIGN KEY ("pending_action_id") REFERENCES "public"."pending_actions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_review_media" ADD CONSTRAINT "product_review_media_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_review_media" ADD CONSTRAINT "product_review_media_review_id_product_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."product_reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_purchase_request_id_purchase_requests_id_fk" FOREIGN KEY ("purchase_request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_purchase_receipt_id_purchase_receipts_id" FOREIGN KEY ("purchase_receipt_id") REFERENCES "public"."purchase_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_po_line_id_purchase_order_lines_id_fk" FOREIGN KEY ("po_line_id") REFERENCES "public"."purchase_order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_request_lines" ADD CONSTRAINT "purchase_request_lines_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_request_lines" ADD CONSTRAINT "purchase_request_lines_purchase_request_id_purchase_requests_id" FOREIGN KEY ("purchase_request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_request_lines" ADD CONSTRAINT "purchase_request_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "seller_sku_mappings" ADD CONSTRAINT "seller_sku_mappings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_sku_mappings" ADD CONSTRAINT "seller_sku_mappings_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_sku_mappings" ADD CONSTRAINT "seller_sku_mappings_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_sku_mappings" ADD CONSTRAINT "seller_sku_mappings_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_lines" ADD CONSTRAINT "settlement_lines_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_lines" ADD CONSTRAINT "settlement_lines_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_lines" ADD CONSTRAINT "settlement_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_lines" ADD CONSTRAINT "settlement_lines_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_lines" ADD CONSTRAINT "settlement_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sku_costs" ADD CONSTRAINT "sku_costs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sku_costs" ADD CONSTRAINT "sku_costs_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_inbounds" ADD CONSTRAINT "stock_inbounds_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_inbounds" ADD CONSTRAINT "stock_inbounds_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_inbounds" ADD CONSTRAINT "stock_inbounds_purchase_receipt_id_purchase_receipts_id_fk" FOREIGN KEY ("purchase_receipt_id") REFERENCES "public"."purchase_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_inbounds" ADD CONSTRAINT "stock_inbounds_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_outbound_lines" ADD CONSTRAINT "stock_outbound_lines_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_outbound_lines" ADD CONSTRAINT "stock_outbound_lines_stock_outbound_id_stock_outbounds_id_fk" FOREIGN KEY ("stock_outbound_id") REFERENCES "public"."stock_outbounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_outbound_lines" ADD CONSTRAINT "stock_outbound_lines_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_outbound_lines" ADD CONSTRAINT "stock_outbound_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_outbounds" ADD CONSTRAINT "stock_outbounds_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_outbounds" ADD CONSTRAINT "stock_outbounds_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_outbounds" ADD CONSTRAINT "stock_outbounds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitation_organization_id_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "invitation_inviter_id_idx" ON "invitation" USING btree ("inviter_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_invitation_codes_user_id_idx" ON "user_invitation_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_invitation_codes_code_idx" ON "user_invitation_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "user_invitation_codes_active_idx" ON "user_invitation_codes" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "user_invitation_relations_inviter_idx" ON "user_invitation_relations" USING btree ("inviter_id");--> statement-breakpoint
CREATE INDEX "user_invitation_relations_invitee_idx" ON "user_invitation_relations" USING btree ("invitee_id");--> statement-breakpoint
CREATE INDEX "user_invitation_relations_code_idx" ON "user_invitation_relations" USING btree ("invitation_code_id");--> statement-breakpoint
CREATE INDEX "user_invitation_relations_unique_idx" ON "user_invitation_relations" USING btree ("inviter_id","invitee_id");--> statement-breakpoint
CREATE INDEX "user_site_message_user_created_idx" ON "user_site_message" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "user_site_message_user_read_idx" ON "user_site_message" USING btree ("user_id","read");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "feishu_external_link_domain_ref_type_uk" ON "feishu_external_link" USING btree ("domain","ref_id","external_type");--> statement-breakpoint
CREATE UNIQUE INDEX "feishu_external_link_type_id_uk" ON "feishu_external_link" USING btree ("external_type","external_id");--> statement-breakpoint
CREATE INDEX "feishu_external_link_ref_idx" ON "feishu_external_link" USING btree ("domain","ref_id");--> statement-breakpoint
CREATE INDEX "feishu_integration_job_run_kind_started_idx" ON "feishu_integration_job_run" USING btree ("job_kind","started_at");--> statement-breakpoint
CREATE INDEX "feishu_integration_job_run_ref_idx" ON "feishu_integration_job_run" USING btree ("ref_domain","ref_id");--> statement-breakpoint
CREATE UNIQUE INDEX "feishu_webhook_event_idempotency_uk" ON "feishu_webhook_event" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "supply_chain_lead_bitable_sync_config_enabled_idx" ON "supply_chain_lead_bitable_sync_config" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "account_transactions_org_time_idx" ON "account_transactions" USING btree ("organization_id","transaction_time");--> statement-breakpoint
CREATE INDEX "account_transactions_shop_time_idx" ON "account_transactions" USING btree ("shop_id","transaction_time");--> statement-breakpoint
CREATE UNIQUE INDEX "account_transactions_shop_ext_uidx" ON "account_transactions" USING btree ("shop_id","transaction_number");--> statement-breakpoint
CREATE INDEX "audit_events_org_created_idx" ON "audit_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "external_id_mappings_org_idx" ON "external_id_mappings" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_id_mappings_shop_ext_uidx" ON "external_id_mappings" USING btree ("shop_id","entity_type","external_id");--> statement-breakpoint
CREATE INDEX "external_id_mappings_shop_int_idx" ON "external_id_mappings" USING btree ("shop_id","entity_type","internal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_template_versions_tpl_ver_uidx" ON "fee_template_versions" USING btree ("template_id","version_no");--> statement-breakpoint
CREATE INDEX "fee_template_versions_org_idx" ON "fee_template_versions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "fee_template_versions_eff_idx" ON "fee_template_versions" USING btree ("template_id","effective_from");--> statement-breakpoint
CREATE INDEX "fee_template_versions_status_idx" ON "fee_template_versions" USING btree ("template_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_templates_org_code_uidx" ON "fee_templates" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "fee_templates_org_dim_idx" ON "fee_templates" USING btree ("organization_id","platform","country","type");--> statement-breakpoint
CREATE INDEX "fulfillment_attempts_org_idx" ON "fulfillment_attempts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "fulfillment_attempts_shipment_idx" ON "fulfillment_attempts" USING btree ("shipment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fulfillment_attempts_org_action_key_uidx" ON "fulfillment_attempts" USING btree ("organization_id","action","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "fulfillment_batch_packages_batch_shipment_uidx" ON "fulfillment_batch_packages" USING btree ("batch_id","shipment_id");--> statement-breakpoint
CREATE INDEX "fulfillment_batch_packages_org_idx" ON "fulfillment_batch_packages" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "fulfillment_batch_packages_shipment_idx" ON "fulfillment_batch_packages" USING btree ("shipment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fulfillment_batches_org_batch_no_uidx" ON "fulfillment_batches" USING btree ("organization_id","batch_no");--> statement-breakpoint
CREATE INDEX "fulfillment_batches_org_channel_idx" ON "fulfillment_batches" USING btree ("organization_id","channel");--> statement-breakpoint
CREATE INDEX "fulfillment_batches_org_status_idx" ON "fulfillment_batches" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "fx_rates_lookup_idx" ON "fx_rates" USING btree ("platform","base_currency","quote_currency","effective_date");--> statement-breakpoint
CREATE INDEX "integration_credentials_org_idx" ON "integration_credentials" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "integration_credentials_shop_idx" ON "integration_credentials" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "integration_logs_shop_created_idx" ON "integration_logs" USING btree ("shop_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_states_shop_uidx" ON "integration_states" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "inventory_balances_org_idx" ON "inventory_balances" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_balances_wh_bin_variant_uidx" ON "inventory_balances" USING btree ("organization_id","warehouse_code","bin_code","variant_id");--> statement-breakpoint
CREATE INDEX "inventory_movements_org_variant_time_idx" ON "inventory_movements" USING btree ("organization_id","variant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "inventory_movements_source_idx" ON "inventory_movements" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_movements_org_idem_uidx" ON "inventory_movements" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "inventory_reservations_org_idx" ON "inventory_reservations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "inventory_reservations_order_idx" ON "inventory_reservations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "inventory_reservations_variant_status_idx" ON "inventory_reservations" USING btree ("variant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_reservations_shop_line_uidx" ON "inventory_reservations" USING btree ("shop_id","order_line_id");--> statement-breakpoint
CREATE INDEX "listings_org_idx" ON "listings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "listings_shop_idx" ON "listings" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "listings_product_idx" ON "listings" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "listings_shop_ext_item_uidx" ON "listings" USING btree ("shop_id","external_item_id");--> statement-breakpoint
CREATE INDEX "logistics_fee_details_org_time_idx" ON "logistics_fee_details" USING btree ("organization_id","fee_created_at");--> statement-breakpoint
CREATE INDEX "logistics_fee_details_shop_time_idx" ON "logistics_fee_details" USING btree ("shop_id","fee_created_at");--> statement-breakpoint
CREATE INDEX "logistics_fee_details_settlement_idx" ON "logistics_fee_details" USING btree ("settlement_id");--> statement-breakpoint
CREATE INDEX "logistics_fee_details_order_line_idx" ON "logistics_fee_details" USING btree ("order_line_id");--> statement-breakpoint
CREATE INDEX "mapping_exceptions_org_status_idx" ON "mapping_exceptions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "mapping_exceptions_shop_idx" ON "mapping_exceptions" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "marketplace_webhook_events_platform_received_idx" ON "marketplace_webhook_events" USING btree ("platform","received_at");--> statement-breakpoint
CREATE INDEX "marketplace_webhook_events_shop_order_idx" ON "marketplace_webhook_events" USING btree ("shop_id","external_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ocean_shipment_lines_ship_variant_uidx" ON "ocean_shipment_lines" USING btree ("shipment_id","variant_id");--> statement-breakpoint
CREATE INDEX "ocean_shipment_lines_shipment_idx" ON "ocean_shipment_lines" USING btree ("shipment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ocean_shipments_org_lot_uidx" ON "ocean_shipments" USING btree ("organization_id","lot_code");--> statement-breakpoint
CREATE INDEX "ocean_shipments_status_idx" ON "ocean_shipments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "order_lines_order_idx" ON "order_lines" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_lines_org_idx" ON "order_lines" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "order_lines_org_seller_sku_idx" ON "order_lines" USING btree ("organization_id","seller_sku");--> statement-breakpoint
CREATE UNIQUE INDEX "order_lines_order_ext_uidx" ON "order_lines" USING btree ("order_id","external_line_id");--> statement-breakpoint
CREATE INDEX "order_status_events_org_idx" ON "order_status_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "order_status_events_shop_order_time_idx" ON "order_status_events" USING btree ("shop_id","order_id","event_time");--> statement-breakpoint
CREATE INDEX "order_status_events_order_line_idx" ON "order_status_events" USING btree ("order_line_id");--> statement-breakpoint
CREATE INDEX "orders_org_idx" ON "orders" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "orders_shop_idx" ON "orders" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "orders_shop_platform_updated_idx" ON "orders" USING btree ("shop_id","platform_updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_shop_ext_uidx" ON "orders" USING btree ("shop_id","external_order_id");--> statement-breakpoint
CREATE INDEX "pending_actions_org_idx" ON "pending_actions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "pending_actions_status_idx" ON "pending_actions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "pending_actions_org_idempotency_uidx" ON "pending_actions" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "platform_brands_org_idx" ON "platform_brands" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_brands_shop_ext_uidx" ON "platform_brands" USING btree ("shop_id","external_id");--> statement-breakpoint
CREATE INDEX "platform_categories_org_idx" ON "platform_categories" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_categories_shop_ext_uidx" ON "platform_categories" USING btree ("shop_id","external_id");--> statement-breakpoint
CREATE INDEX "product_candidates_org_idx" ON "product_candidates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "product_candidates_status_idx" ON "product_candidates" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "product_review_media_review_url_uidx" ON "product_review_media" USING btree ("review_id","url");--> statement-breakpoint
CREATE INDEX "product_review_media_org_type_idx" ON "product_review_media" USING btree ("organization_id","media_type");--> statement-breakpoint
CREATE UNIQUE INDEX "product_reviews_shop_ext_uidx" ON "product_reviews" USING btree ("shop_id","external_review_id");--> statement-breakpoint
CREATE INDEX "product_reviews_shop_item_time_idx" ON "product_reviews" USING btree ("shop_id","external_item_id","review_at");--> statement-breakpoint
CREATE INDEX "product_reviews_org_rating_idx" ON "product_reviews" USING btree ("organization_id","rating");--> statement-breakpoint
CREATE INDEX "product_reviews_variant_idx" ON "product_reviews" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "product_reviews_org_source_idx" ON "product_reviews" USING btree ("organization_id","source");--> statement-breakpoint
CREATE INDEX "product_variants_org_idx" ON "product_variants" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "product_variants_product_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_org_sku_uidx" ON "product_variants" USING btree ("organization_id","sku");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_org_sku_code_uidx" ON "product_variants" USING btree ("organization_id","sku_code");--> statement-breakpoint
CREATE INDEX "products_org_idx" ON "products" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_org_spu_uidx" ON "products" USING btree ("organization_id","spu_code");--> statement-breakpoint
CREATE INDEX "purchase_order_lines_po_idx" ON "purchase_order_lines" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_order_lines_po_line_uidx" ON "purchase_order_lines" USING btree ("purchase_order_id","line_no");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_org_no_uidx" ON "purchase_orders" USING btree ("organization_id","po_no");--> statement-breakpoint
CREATE INDEX "purchase_orders_org_status_idx" ON "purchase_orders" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "purchase_orders_request_idx" ON "purchase_orders" USING btree ("purchase_request_id");--> statement-breakpoint
CREATE INDEX "purchase_receipt_lines_receipt_idx" ON "purchase_receipt_lines" USING btree ("purchase_receipt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_receipt_lines_receipt_line_uidx" ON "purchase_receipt_lines" USING btree ("purchase_receipt_id","line_no");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_receipts_org_no_uidx" ON "purchase_receipts" USING btree ("organization_id","receipt_no");--> statement-breakpoint
CREATE INDEX "purchase_receipts_po_idx" ON "purchase_receipts" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "purchase_receipts_org_status_idx" ON "purchase_receipts" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "purchase_request_lines_req_idx" ON "purchase_request_lines" USING btree ("purchase_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_request_lines_req_line_uidx" ON "purchase_request_lines" USING btree ("purchase_request_id","line_no");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_requests_org_no_uidx" ON "purchase_requests" USING btree ("organization_id","request_no");--> statement-breakpoint
CREATE INDEX "purchase_requests_org_status_idx" ON "purchase_requests" USING btree ("organization_id","status");--> statement-breakpoint
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
CREATE INDEX "seller_sku_mappings_org_idx" ON "seller_sku_mappings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "seller_sku_mappings_variant_idx" ON "seller_sku_mappings" USING btree ("organization_id","variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_sku_mappings_shop_seller_sku_uidx" ON "seller_sku_mappings" USING btree ("organization_id","shop_id","seller_sku");--> statement-breakpoint
CREATE INDEX "settlement_lines_settlement_idx" ON "settlement_lines" USING btree ("settlement_id");--> statement-breakpoint
CREATE INDEX "settlement_lines_org_idx" ON "settlement_lines" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "settlement_lines_order_line_idx" ON "settlement_lines" USING btree ("order_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_lines_settlement_ext_txn_uidx" ON "settlement_lines" USING btree ("settlement_id","external_transaction_id");--> statement-breakpoint
CREATE INDEX "settlements_org_idx" ON "settlements" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settlements_shop_ext_uidx" ON "settlements" USING btree ("shop_id","external_settlement_id");--> statement-breakpoint
CREATE INDEX "shipment_items_org_idx" ON "shipment_items" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "shipment_items_order_line_idx" ON "shipment_items" USING btree ("order_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_items_shipment_line_uidx" ON "shipment_items" USING btree ("shipment_id","order_line_id");--> statement-breakpoint
CREATE INDEX "shipments_org_idx" ON "shipments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "shipments_shop_order_idx" ON "shipments" USING btree ("shop_id","order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_shop_ext_pkg_uidx" ON "shipments" USING btree ("shop_id","external_package_id");--> statement-breakpoint
CREATE INDEX "shops_org_idx" ON "shops" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shops_org_platform_ext_uidx" ON "shops" USING btree ("organization_id","platform","external_shop_id");--> statement-breakpoint
CREATE INDEX "sku_costs_org_idx" ON "sku_costs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "sku_costs_variant_idx" ON "sku_costs" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "sku_costs_lot_idx" ON "sku_costs" USING btree ("container_lot_id");--> statement-breakpoint
CREATE INDEX "stock_alerts_org_idx" ON "stock_alerts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "stock_alerts_variant_idx" ON "stock_alerts" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_inbounds_org_no_uidx" ON "stock_inbounds" USING btree ("organization_id","inbound_no");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_inbounds_org_idem_uidx" ON "stock_inbounds" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "stock_inbounds_org_status_idx" ON "stock_inbounds" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "stock_inbounds_receipt_idx" ON "stock_inbounds" USING btree ("purchase_receipt_id");--> statement-breakpoint
CREATE INDEX "stock_outbound_lines_outbound_idx" ON "stock_outbound_lines" USING btree ("stock_outbound_id");--> statement-breakpoint
CREATE INDEX "stock_outbound_lines_org_idx" ON "stock_outbound_lines" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_outbound_lines_outbound_line_uidx" ON "stock_outbound_lines" USING btree ("stock_outbound_id","line_no");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_outbounds_org_no_uidx" ON "stock_outbounds" USING btree ("organization_id","outbound_no");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_outbounds_org_idem_uidx" ON "stock_outbounds" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "stock_outbounds_org_status_idx" ON "stock_outbounds" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "stock_outbounds_order_idx" ON "stock_outbounds" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "tracking_events_org_idx" ON "tracking_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tracking_events_shipment_time_idx" ON "tracking_events" USING btree ("shipment_id","event_time");--> statement-breakpoint
CREATE INDEX "tracking_events_source_idx" ON "tracking_events" USING btree ("source");--> statement-breakpoint
CREATE UNIQUE INDEX "tracking_events_shipment_time_status_uidx" ON "tracking_events" USING btree ("shipment_id","event_time","status_code");