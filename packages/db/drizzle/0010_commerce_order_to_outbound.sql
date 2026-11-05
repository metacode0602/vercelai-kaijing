-- Module 3: order sync → reserve/pick → outbound post + inventory ledger idempotency.
-- Extends inventory_movement_types with order_reserve / order_release / order_ship (varchar; app-enforced).

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
);--> statement-breakpoint
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
);--> statement-breakpoint
ALTER TABLE "stock_outbounds" ADD CONSTRAINT "stock_outbounds_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_outbounds" ADD CONSTRAINT "stock_outbounds_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_outbounds" ADD CONSTRAINT "stock_outbounds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_outbound_lines" ADD CONSTRAINT "stock_outbound_lines_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_outbound_lines" ADD CONSTRAINT "stock_outbound_lines_stock_outbound_id_stock_outbounds_id_fk" FOREIGN KEY ("stock_outbound_id") REFERENCES "public"."stock_outbounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_outbound_lines" ADD CONSTRAINT "stock_outbound_lines_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_outbound_lines" ADD CONSTRAINT "stock_outbound_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_outbounds_org_no_uidx" ON "stock_outbounds" USING btree ("organization_id","outbound_no");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_outbounds_org_idem_uidx" ON "stock_outbounds" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "stock_outbounds_org_status_idx" ON "stock_outbounds" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "stock_outbounds_order_idx" ON "stock_outbounds" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "stock_outbound_lines_outbound_idx" ON "stock_outbound_lines" USING btree ("stock_outbound_id");--> statement-breakpoint
CREATE INDEX "stock_outbound_lines_org_idx" ON "stock_outbound_lines" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_outbound_lines_outbound_line_uidx" ON "stock_outbound_lines" USING btree ("stock_outbound_id","line_no");
