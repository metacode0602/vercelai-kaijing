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
ALTER TABLE "integration_states" ADD COLUMN "reviews_cursor" text;--> statement-breakpoint
ALTER TABLE "integration_states" ADD COLUMN "last_logistics_sync_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "integration_states" ADD COLUMN "last_reviews_sync_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "marketplace_webhook_events" ADD CONSTRAINT "marketplace_webhook_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_webhook_events" ADD CONSTRAINT "marketplace_webhook_events_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_review_media" ADD CONSTRAINT "product_review_media_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_review_media" ADD CONSTRAINT "product_review_media_review_id_product_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."product_reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketplace_webhook_events_platform_received_idx" ON "marketplace_webhook_events" USING btree ("platform","received_at");--> statement-breakpoint
CREATE INDEX "marketplace_webhook_events_shop_order_idx" ON "marketplace_webhook_events" USING btree ("shop_id","external_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_review_media_review_url_uidx" ON "product_review_media" USING btree ("review_id","url");--> statement-breakpoint
CREATE INDEX "product_review_media_org_type_idx" ON "product_review_media" USING btree ("organization_id","media_type");--> statement-breakpoint
CREATE UNIQUE INDEX "product_reviews_shop_ext_uidx" ON "product_reviews" USING btree ("shop_id","external_review_id");--> statement-breakpoint
CREATE INDEX "product_reviews_shop_item_time_idx" ON "product_reviews" USING btree ("shop_id","external_item_id","review_at");--> statement-breakpoint
CREATE INDEX "product_reviews_org_rating_idx" ON "product_reviews" USING btree ("organization_id","rating");--> statement-breakpoint
CREATE INDEX "product_reviews_variant_idx" ON "product_reviews" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "product_reviews_org_source_idx" ON "product_reviews" USING btree ("organization_id","source");--> statement-breakpoint
