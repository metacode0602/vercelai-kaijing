-- Module 15: console ops cleanup — review reply columns + light master tables

ALTER TABLE "product_reviews" ADD COLUMN IF NOT EXISTS "reply_status" varchar(16) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD COLUMN IF NOT EXISTS "reply_content" text;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD COLUMN IF NOT EXISTS "replied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD COLUMN IF NOT EXISTS "reply_source" varchar(16);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "commerce_carriers" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"type" varchar(32) DEFAULT 'express' NOT NULL,
	"coverage" text DEFAULT '' NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "commerce_carriers" ADD CONSTRAINT "commerce_carriers_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "commerce_carriers_org_code_uidx" ON "commerce_carriers" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commerce_carriers_org_status_idx" ON "commerce_carriers" USING btree ("organization_id","status");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "commerce_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"parent_id" text,
	"sort" integer DEFAULT 10 NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"cover_image" text,
	"screenshots" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "commerce_categories" ADD CONSTRAINT "commerce_categories_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "commerce_categories_org_code_uidx" ON "commerce_categories" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commerce_categories_org_parent_idx" ON "commerce_categories" USING btree ("organization_id","parent_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "commerce_dictionaries" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"key" varchar(64) NOT NULL,
	"label" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"shared" boolean DEFAULT true NOT NULL,
	"values" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"inactive_values" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "commerce_dictionaries" ADD CONSTRAINT "commerce_dictionaries_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "commerce_dictionaries_org_key_uidx" ON "commerce_dictionaries" USING btree ("organization_id","key");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "commerce_import_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"kind" varchar(64) NOT NULL,
	"version" varchar(32) DEFAULT 'v1' NOT NULL,
	"fields" text DEFAULT '' NOT NULL,
	"duplicate_strategy" text DEFAULT '' NOT NULL,
	"rollback_strategy" text DEFAULT '' NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "commerce_import_templates" ADD CONSTRAINT "commerce_import_templates_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "commerce_import_templates_org_kind_idx" ON "commerce_import_templates" USING btree ("organization_id","kind");
