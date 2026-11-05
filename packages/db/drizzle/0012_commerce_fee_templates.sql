-- Module 5: fee templates (import_tax / platform_fee) — header + versioned formulas.
-- Aligns with commerce-schema fee_templates / fee_template_versions.
-- Version audit machine (UED v1.1 C8): draft → in_review → published → disabled
--   (reject returns to draft with review_note). published boolean stays in sync with status.

CREATE TABLE IF NOT EXISTS "fee_templates" (
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
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "fee_template_versions" (
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
);--> statement-breakpoint

ALTER TABLE "fee_templates" ADD CONSTRAINT "fee_templates_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_template_versions" ADD CONSTRAINT "fee_template_versions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_template_versions" ADD CONSTRAINT "fee_template_versions_template_id_fee_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."fee_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "fee_templates_org_code_uidx" ON "fee_templates" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_templates_org_dim_idx" ON "fee_templates" USING btree ("organization_id","platform","country","type");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fee_template_versions_tpl_ver_uidx" ON "fee_template_versions" USING btree ("template_id","version_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_template_versions_org_idx" ON "fee_template_versions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_template_versions_eff_idx" ON "fee_template_versions" USING btree ("template_id","effective_from");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_template_versions_status_idx" ON "fee_template_versions" USING btree ("template_id","status");
