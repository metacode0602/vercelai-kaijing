-- Module 2: purchase request → PO → receipt → QC → stock inbound + inventory ledger idempotency.
ALTER TABLE "inventory_movements" ADD COLUMN "idempotency_key" varchar(191);--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_movements_org_idem_uidx" ON "inventory_movements" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
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
);--> statement-breakpoint
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
);--> statement-breakpoint
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
);--> statement-breakpoint
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
);--> statement-breakpoint
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
);--> statement-breakpoint
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
);--> statement-breakpoint
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
);--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_request_lines" ADD CONSTRAINT "purchase_request_lines_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_request_lines" ADD CONSTRAINT "purchase_request_lines_purchase_request_id_purchase_requests_id_fk" FOREIGN KEY ("purchase_request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_request_lines" ADD CONSTRAINT "purchase_request_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_purchase_request_id_purchase_requests_id_fk" FOREIGN KEY ("purchase_request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_purchase_receipt_id_purchase_receipts_id_fk" FOREIGN KEY ("purchase_receipt_id") REFERENCES "public"."purchase_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_po_line_id_purchase_order_lines_id_fk" FOREIGN KEY ("po_line_id") REFERENCES "public"."purchase_order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_inbounds" ADD CONSTRAINT "stock_inbounds_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_inbounds" ADD CONSTRAINT "stock_inbounds_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_inbounds" ADD CONSTRAINT "stock_inbounds_purchase_receipt_id_purchase_receipts_id_fk" FOREIGN KEY ("purchase_receipt_id") REFERENCES "public"."purchase_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_inbounds" ADD CONSTRAINT "stock_inbounds_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_requests_org_no_uidx" ON "purchase_requests" USING btree ("organization_id","request_no");--> statement-breakpoint
CREATE INDEX "purchase_requests_org_status_idx" ON "purchase_requests" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "purchase_request_lines_req_idx" ON "purchase_request_lines" USING btree ("purchase_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_request_lines_req_line_uidx" ON "purchase_request_lines" USING btree ("purchase_request_id","line_no");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_org_no_uidx" ON "purchase_orders" USING btree ("organization_id","po_no");--> statement-breakpoint
CREATE INDEX "purchase_orders_org_status_idx" ON "purchase_orders" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "purchase_orders_request_idx" ON "purchase_orders" USING btree ("purchase_request_id");--> statement-breakpoint
CREATE INDEX "purchase_order_lines_po_idx" ON "purchase_order_lines" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_order_lines_po_line_uidx" ON "purchase_order_lines" USING btree ("purchase_order_id","line_no");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_receipts_org_no_uidx" ON "purchase_receipts" USING btree ("organization_id","receipt_no");--> statement-breakpoint
CREATE INDEX "purchase_receipts_po_idx" ON "purchase_receipts" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "purchase_receipts_org_status_idx" ON "purchase_receipts" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "purchase_receipt_lines_receipt_idx" ON "purchase_receipt_lines" USING btree ("purchase_receipt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_receipt_lines_receipt_line_uidx" ON "purchase_receipt_lines" USING btree ("purchase_receipt_id","line_no");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_inbounds_org_no_uidx" ON "stock_inbounds" USING btree ("organization_id","inbound_no");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_inbounds_org_idem_uidx" ON "stock_inbounds" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "stock_inbounds_org_status_idx" ON "stock_inbounds" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "stock_inbounds_receipt_idx" ON "stock_inbounds" USING btree ("purchase_receipt_id");
