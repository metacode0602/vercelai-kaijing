CREATE TABLE "platform_dictionaries_catalog" (
	"id" text PRIMARY KEY NOT NULL,
	"key" varchar(64) NOT NULL,
	"label" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"values" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"value_titles" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"inactive_values" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_dictionaries_catalog_status_check" CHECK ("platform_dictionaries_catalog"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE "platform_category_trees_catalog" (
	"id" text PRIMARY KEY NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"parent_id" text,
	"sort" integer DEFAULT 10 NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_category_trees_catalog_status_check" CHECK ("platform_category_trees_catalog"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE "platform_carriers_catalog" (
	"id" text PRIMARY KEY NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"type" varchar(32) DEFAULT 'platform' NOT NULL,
	"coverage" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_carriers_catalog_status_check" CHECK ("platform_carriers_catalog"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE "platform_import_templates_catalog" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" varchar(64) NOT NULL,
	"version" varchar(32) DEFAULT 'v1' NOT NULL,
	"fields" text DEFAULT '' NOT NULL,
	"duplicate_strategy" text DEFAULT '' NOT NULL,
	"rollback_strategy" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_import_templates_catalog_status_check" CHECK ("platform_import_templates_catalog"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
ALTER TABLE "platform_category_trees_catalog" ADD CONSTRAINT "platform_category_trees_catalog_parent_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."platform_category_trees_catalog"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "platform_dictionaries_catalog_key_uidx" ON "platform_dictionaries_catalog" USING btree ("key");
--> statement-breakpoint
CREATE INDEX "platform_dictionaries_catalog_status_idx" ON "platform_dictionaries_catalog" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX "platform_category_trees_catalog_code_uidx" ON "platform_category_trees_catalog" USING btree ("code");
--> statement-breakpoint
CREATE INDEX "platform_category_trees_catalog_parent_idx" ON "platform_category_trees_catalog" USING btree ("parent_id");
--> statement-breakpoint
CREATE INDEX "platform_category_trees_catalog_status_idx" ON "platform_category_trees_catalog" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX "platform_carriers_catalog_code_uidx" ON "platform_carriers_catalog" USING btree ("code");
--> statement-breakpoint
CREATE INDEX "platform_carriers_catalog_status_idx" ON "platform_carriers_catalog" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX "platform_import_templates_catalog_kind_version_uidx" ON "platform_import_templates_catalog" USING btree ("kind","version");
--> statement-breakpoint
CREATE INDEX "platform_import_templates_catalog_status_idx" ON "platform_import_templates_catalog" USING btree ("status");
--> statement-breakpoint
ALTER TABLE "commerce_dictionaries" ADD COLUMN "source_id" text;
--> statement-breakpoint
ALTER TABLE "commerce_categories" ADD COLUMN "source_id" text;
--> statement-breakpoint
ALTER TABLE "commerce_carriers" ADD COLUMN "source_id" text;
--> statement-breakpoint
ALTER TABLE "commerce_import_templates" ADD COLUMN "source_id" text;
--> statement-breakpoint
ALTER TABLE "commerce_dictionaries" ADD CONSTRAINT "commerce_dictionaries_source_id_platform_dictionaries_catalog_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."platform_dictionaries_catalog"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "commerce_categories" ADD CONSTRAINT "commerce_categories_source_id_platform_category_trees_catalog_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."platform_category_trees_catalog"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "commerce_carriers" ADD CONSTRAINT "commerce_carriers_source_id_platform_carriers_catalog_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."platform_carriers_catalog"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "commerce_import_templates" ADD CONSTRAINT "commerce_import_templates_source_id_platform_import_templates_catalog_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."platform_import_templates_catalog"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organization_settings" ALTER COLUMN "display_currency" SET DEFAULT 'CNY';
