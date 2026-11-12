ALTER TABLE "products" ADD COLUMN "category_id" text;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "carton_spec_id" text;--> statement-breakpoint
ALTER TABLE "ocean_shipment_lines" ADD COLUMN "carton_count" integer;--> statement-breakpoint
ALTER TABLE "ocean_shipment_lines" ADD COLUMN "cbm" numeric(12, 4);--> statement-breakpoint
CREATE TABLE "fee_template_match_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"template_id" text NOT NULL,
	"category_id" text,
	"hs_code_pattern" varchar(32),
	"priority" integer DEFAULT 10 NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hs_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"scope" varchar(16) DEFAULT 'global' NOT NULL,
	"owner_key" text DEFAULT 'global' NOT NULL,
	"organization_id" text,
	"country_code" varchar(2) DEFAULT 'LK' NOT NULL,
	"code" varchar(20) NOT NULL,
	"normalized_code" varchar(20) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"description_en" text,
	"parent_code" varchar(20),
	"level" integer,
	"unit" varchar(16),
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"source_type" varchar(16) DEFAULT 'manual' NOT NULL,
	"source_ref" text,
	"source_batch_id" text,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hs_codes_scope_check" CHECK ("hs_codes"."scope" in ('global', 'tenant')),
	CONSTRAINT "hs_codes_status_check" CHECK ("hs_codes"."status" in ('draft', 'active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "hs_tariff_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"scope" varchar(16) DEFAULT 'global' NOT NULL,
	"owner_key" text DEFAULT 'global' NOT NULL,
	"organization_id" text,
	"country_code" varchar(2) DEFAULT 'LK' NOT NULL,
	"hs_code" varchar(20) NOT NULL,
	"version" integer NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"currency" varchar(3) DEFAULT 'LKR' NOT NULL,
	"formula_profile" varchar(64) DEFAULT 'lk_cascade_v1',
	"uplift_rule" jsonb,
	"gd_rate" numeric(8, 4),
	"surcharge_rate" numeric(8, 4),
	"pal_rate" numeric(8, 4),
	"cess_rate" numeric(8, 4),
	"excise_rate" numeric(8, 4),
	"vat_rate" numeric(8, 4),
	"sscl_rate" numeric(8, 4),
	"gd_specific_amount" numeric(15, 4),
	"gd_specific_unit" varchar(8),
	"gd_specific_rule" varchar(8) DEFAULT 'none',
	"cess_specific_amount" numeric(15, 4),
	"cess_specific_unit" varchar(8),
	"is_exact" boolean DEFAULT true NOT NULL,
	"confidence" numeric(5, 2),
	"compliance" jsonb DEFAULT '{}'::jsonb,
	"notes" text,
	"source_type" varchar(16) DEFAULT 'manual' NOT NULL,
	"source_ref" text,
	"source_batch_id" text,
	"created_by" text,
	"updated_by" text,
	"published_by" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hs_tariff_scope_check" CHECK ("hs_tariff_versions"."scope" in ('global', 'tenant')),
	CONSTRAINT "hs_tariff_status_check" CHECK ("hs_tariff_versions"."status" in ('draft', 'active', 'archived')),
	CONSTRAINT "hs_tariff_specific_rule_check" CHECK ("hs_tariff_versions"."gd_specific_rule" is null or "hs_tariff_versions"."gd_specific_rule" in ('none', 'max', 'sum'))
);
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_commerce_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."commerce_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_carton_spec_id_commerce_carton_specs_id_fk" FOREIGN KEY ("carton_spec_id") REFERENCES "public"."commerce_carton_specs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_template_match_rules" ADD CONSTRAINT "fee_template_match_rules_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_template_match_rules" ADD CONSTRAINT "fee_template_match_rules_template_id_fee_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."fee_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_template_match_rules" ADD CONSTRAINT "fee_template_match_rules_category_id_commerce_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."commerce_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hs_codes" ADD CONSTRAINT "hs_codes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hs_tariff_versions" ADD CONSTRAINT "hs_tariff_versions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_org_category_idx" ON "products" USING btree ("organization_id","category_id");--> statement-breakpoint
CREATE INDEX "product_variants_carton_spec_idx" ON "product_variants" USING btree ("carton_spec_id");--> statement-breakpoint
CREATE INDEX "fee_template_match_rules_tpl_idx" ON "fee_template_match_rules" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "fee_template_match_rules_org_idx" ON "fee_template_match_rules" USING btree ("organization_id","priority");--> statement-breakpoint
CREATE INDEX "fee_template_match_rules_category_idx" ON "fee_template_match_rules" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hs_codes_owner_code_uidx" ON "hs_codes" USING btree ("owner_key","country_code","normalized_code");--> statement-breakpoint
CREATE INDEX "hs_codes_code_idx" ON "hs_codes" USING btree ("owner_key","country_code","code");--> statement-breakpoint
CREATE INDEX "hs_codes_parent_idx" ON "hs_codes" USING btree ("owner_key","country_code","parent_code");--> statement-breakpoint
CREATE INDEX "hs_codes_org_idx" ON "hs_codes" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hs_tariff_owner_code_ver_uidx" ON "hs_tariff_versions" USING btree ("owner_key","country_code","hs_code","version");--> statement-breakpoint
CREATE INDEX "hs_tariff_owner_code_date_idx" ON "hs_tariff_versions" USING btree ("owner_key","country_code","hs_code","effective_from");--> statement-breakpoint
CREATE INDEX "hs_tariff_status_idx" ON "hs_tariff_versions" USING btree ("owner_key","status");--> statement-breakpoint
CREATE INDEX "hs_tariff_org_idx" ON "hs_tariff_versions" USING btree ("organization_id");
