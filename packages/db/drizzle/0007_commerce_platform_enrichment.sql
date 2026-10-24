-- Enrich commerce tables for multi-platform (Daraz / Lazada / TikTok) console + sync.
-- Prefer structured columns for list/filter UI; keep platform-specific blobs in jsonb.

ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "timezone" varchar(64);--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "seller_name" text;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "marketplace_country" varchar(16);--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "auth_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "last_sync_at" timestamp with time zone;--> statement-breakpoint

ALTER TABLE "integration_states" ADD COLUMN IF NOT EXISTS "products_cursor" text;--> statement-breakpoint
ALTER TABLE "integration_states" ADD COLUMN IF NOT EXISTS "listings_cursor" text;--> statement-breakpoint
ALTER TABLE "integration_states" ADD COLUMN IF NOT EXISTS "last_products_sync_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "integration_states" ADD COLUMN IF NOT EXISTS "last_listings_sync_at" timestamp with time zone;--> statement-breakpoint

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "brand" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "category_hint" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "images" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "weight_grams" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "length_mm" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "width_mm" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "height_mm" integer;--> statement-breakpoint

ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "external_item_id" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "brand_external_id" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "brand_name" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "category_path" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "stock_on_hand" integer;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "warehouse_code" varchar(64);--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "logistics_channel" varchar(64);--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "publish_state" varchar(32);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "listings_shop_ext_item_uidx" ON "listings" ("shop_id","external_item_id");--> statement-breakpoint

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "platform_status" varchar(64);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "fulfillment_status" varchar(32);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "buyer_region" varchar(64);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_method" varchar(64);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_provider" varchar(128);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "tracking_number" varchar(128);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "package_id" varchar(128);--> statement-breakpoint

ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "fulfillment_status" varchar(32);--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "package_id" varchar(128);--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "tracking_number" varchar(128);--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "shipping_provider" varchar(128);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "platform_brands" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shop_id" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_brands_org_idx" ON "platform_brands" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "platform_brands_shop_ext_uidx" ON "platform_brands" ("shop_id","external_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "platform_categories" (
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
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_categories_org_idx" ON "platform_categories" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "platform_categories_shop_ext_uidx" ON "platform_categories" ("shop_id","external_id");
