ALTER TABLE "products" ADD COLUMN "hs_code" varchar(32);--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "hs_code" varchar(32);--> statement-breakpoint
CREATE TABLE "compliance_hs_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"hs_code" varchar(32) NOT NULL,
	"description" text,
	"slsi_required" boolean DEFAULT false NOT NULL,
	"cert_name" text,
	"block_create" boolean DEFAULT false NOT NULL,
	"source" varchar(16) DEFAULT 'manual' NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"status" varchar(16) DEFAULT 'enabled' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compliance_hs_rules_status_check" CHECK ("compliance_hs_rules"."status" in ('enabled', 'disabled')),
	CONSTRAINT "compliance_hs_rules_source_check" CHECK ("compliance_hs_rules"."source" in ('manual', 'import'))
);
--> statement-breakpoint
CREATE TABLE "product_compliance_certs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"product_id" text NOT NULL,
	"variant_id" text,
	"cert_number" varchar(128) NOT NULL,
	"cert_name" text,
	"hs_code" varchar(32),
	"file_name" text,
	"file_url" text,
	"expires_at" timestamp with time zone,
	"status" varchar(16) DEFAULT 'enabled' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_compliance_certs_status_check" CHECK ("product_compliance_certs"."status" in ('enabled', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "attribution_reason_maps" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"match_type" varchar(16) NOT NULL,
	"pattern" text NOT NULL,
	"category" varchar(16) NOT NULL,
	"notes" text,
	"status" varchar(16) DEFAULT 'enabled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attribution_reason_maps_type_check" CHECK ("attribution_reason_maps"."match_type" in ('reason_code', 'keyword')),
	CONSTRAINT "attribution_reason_maps_category_check" CHECK ("attribution_reason_maps"."category" in ('quality', 'size', 'logistics', 'description', 'other')),
	CONSTRAINT "attribution_reason_maps_status_check" CHECK ("attribution_reason_maps"."status" in ('enabled', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "attribution_overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"subject_type" varchar(16) NOT NULL,
	"subject_id" text NOT NULL,
	"category" varchar(16) NOT NULL,
	"note" text,
	"overridden_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attribution_overrides_subject_check" CHECK ("attribution_overrides"."subject_type" in ('review', 'reverse_item')),
	CONSTRAINT "attribution_overrides_category_check" CHECK ("attribution_overrides"."category" in ('quality', 'size', 'logistics', 'description', 'other'))
);
--> statement-breakpoint
ALTER TABLE "compliance_hs_rules" ADD CONSTRAINT "compliance_hs_rules_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_compliance_certs" ADD CONSTRAINT "product_compliance_certs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_compliance_certs" ADD CONSTRAINT "product_compliance_certs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_compliance_certs" ADD CONSTRAINT "product_compliance_certs_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribution_reason_maps" ADD CONSTRAINT "attribution_reason_maps_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribution_overrides" ADD CONSTRAINT "attribution_overrides_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_org_hs_idx" ON "products" USING btree ("organization_id","hs_code");--> statement-breakpoint
CREATE UNIQUE INDEX "compliance_hs_rules_org_hs_uidx" ON "compliance_hs_rules" USING btree ("organization_id","hs_code");--> statement-breakpoint
CREATE INDEX "compliance_hs_rules_org_status_idx" ON "compliance_hs_rules" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "product_compliance_certs_org_idx" ON "product_compliance_certs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "product_compliance_certs_product_idx" ON "product_compliance_certs" USING btree ("organization_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attribution_reason_maps_org_pattern_uidx" ON "attribution_reason_maps" USING btree ("organization_id","match_type","pattern");--> statement-breakpoint
CREATE INDEX "attribution_reason_maps_org_idx" ON "attribution_reason_maps" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "attribution_overrides_org_subject_uidx" ON "attribution_overrides" USING btree ("organization_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "attribution_overrides_org_idx" ON "attribution_overrides" USING btree ("organization_id");
