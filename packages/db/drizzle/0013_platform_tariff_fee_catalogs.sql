CREATE TABLE "platform_fee_templates_catalog" (
	"id" text PRIMARY KEY NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"platform" varchar(32) NOT NULL,
	"country" varchar(8) NOT NULL,
	"fulfillment_pool" varchar(64),
	"fulfillment_logistics" varchar(32),
	"type" varchar(32) NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_fee_templates_catalog_status_check" CHECK ("platform_fee_templates_catalog"."status" in ('active', 'inactive')),
	CONSTRAINT "platform_fee_templates_catalog_type_check" CHECK ("platform_fee_templates_catalog"."type" in ('import_tax', 'platform_fee', 'ocean_freight'))
);
--> statement-breakpoint
CREATE TABLE "platform_fee_template_versions_catalog" (
	"id" text PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"version_no" integer NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"priority" integer DEFAULT 10 NOT NULL,
	"formula_profile" varchar(64),
	"components" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_fee_template_versions_catalog_status_check" CHECK ("platform_fee_template_versions_catalog"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE "platform_fee_template_match_rules_catalog" (
	"id" text PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"category_code" varchar(64),
	"hs_code_pattern" varchar(32),
	"priority" integer DEFAULT 10 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_fee_template_versions_catalog" ADD CONSTRAINT "platform_fee_template_versions_catalog_template_id_platform_fee_templates_catalog_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."platform_fee_templates_catalog"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "platform_fee_template_match_rules_catalog" ADD CONSTRAINT "platform_fee_template_match_rules_catalog_template_id_platform_fee_templates_catalog_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."platform_fee_templates_catalog"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "platform_fee_templates_catalog_code_uidx" ON "platform_fee_templates_catalog" USING btree ("code");
--> statement-breakpoint
CREATE INDEX "platform_fee_templates_catalog_status_idx" ON "platform_fee_templates_catalog" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "platform_fee_templates_catalog_dim_idx" ON "platform_fee_templates_catalog" USING btree ("platform","country","type");
--> statement-breakpoint
CREATE UNIQUE INDEX "platform_fee_template_versions_catalog_tpl_ver_uidx" ON "platform_fee_template_versions_catalog" USING btree ("template_id","version_no");
--> statement-breakpoint
CREATE INDEX "platform_fee_template_versions_catalog_status_idx" ON "platform_fee_template_versions_catalog" USING btree ("template_id","status");
--> statement-breakpoint
CREATE INDEX "platform_fee_template_match_rules_catalog_tpl_idx" ON "platform_fee_template_match_rules_catalog" USING btree ("template_id");
--> statement-breakpoint
ALTER TABLE "fee_templates" ADD COLUMN "source_id" text;
--> statement-breakpoint
ALTER TABLE "fee_template_versions" ADD COLUMN "source_id" text;
--> statement-breakpoint
ALTER TABLE "fee_template_match_rules" ADD COLUMN "source_id" text;
--> statement-breakpoint
ALTER TABLE "hs_codes" ADD COLUMN "source_id" text;
--> statement-breakpoint
ALTER TABLE "hs_tariff_versions" ADD COLUMN "source_id" text;
--> statement-breakpoint
ALTER TABLE "fee_templates" ADD CONSTRAINT "fee_templates_source_id_platform_fee_templates_catalog_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."platform_fee_templates_catalog"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fee_template_versions" ADD CONSTRAINT "fee_template_versions_source_id_platform_fee_template_versions_catalog_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."platform_fee_template_versions_catalog"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fee_template_match_rules" ADD CONSTRAINT "fee_template_match_rules_source_id_platform_fee_template_match_rules_catalog_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."platform_fee_template_match_rules_catalog"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hs_codes" ADD CONSTRAINT "hs_codes_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."hs_codes"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hs_tariff_versions" ADD CONSTRAINT "hs_tariff_versions_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."hs_tariff_versions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "fee_templates_source_idx" ON "fee_templates" USING btree ("source_id");
--> statement-breakpoint
CREATE INDEX "fee_template_versions_source_id_idx" ON "fee_template_versions" USING btree ("source_id");
--> statement-breakpoint
CREATE INDEX "fee_template_match_rules_source_idx" ON "fee_template_match_rules" USING btree ("source_id");
--> statement-breakpoint
CREATE INDEX "hs_codes_source_idx" ON "hs_codes" USING btree ("source_id");
--> statement-breakpoint
CREATE INDEX "hs_tariff_source_idx" ON "hs_tariff_versions" USING btree ("source_id");
--> statement-breakpoint
ALTER TABLE "fee_template_versions" DROP CONSTRAINT "fee_template_versions_source_check";
--> statement-breakpoint
ALTER TABLE "fee_template_versions" ADD CONSTRAINT "fee_template_versions_source_check" CHECK ("fee_template_versions"."source" in ('manual', 'official_sync', 'platform_catalog'));
