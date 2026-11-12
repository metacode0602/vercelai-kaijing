ALTER TABLE "fee_template_versions" ADD COLUMN "source" varchar(32) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_template_versions" ADD COLUMN "source_platform" varchar(32);--> statement-breakpoint
ALTER TABLE "fee_template_versions" ADD COLUMN "source_site" varchar(8);--> statement-breakpoint
ALTER TABLE "fee_template_versions" ADD COLUMN "source_shop_id" text;--> statement-breakpoint
ALTER TABLE "fee_template_versions" ADD COLUMN "synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fee_template_versions" ADD COLUMN "sync_run_id" text;--> statement-breakpoint
ALTER TABLE "fee_template_versions" ADD COLUMN "raw_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "fee_template_versions" ADD CONSTRAINT "fee_template_versions_source_check" CHECK ("fee_template_versions"."source" in ('manual', 'official_sync'));--> statement-breakpoint
CREATE INDEX "fee_template_versions_source_idx" ON "fee_template_versions" USING btree ("organization_id","source");--> statement-breakpoint
ALTER TABLE "hs_tariff_versions" ALTER COLUMN "formula_profile" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "hs_tariff_versions" ADD COLUMN "components" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
CREATE TABLE "fee_official_sync_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"platform" varchar(32) NOT NULL,
	"country" varchar(8),
	"shop_id" text,
	"status" varchar(16) NOT NULL,
	"reason" text,
	"source" varchar(32) DEFAULT 'official_api' NOT NULL,
	"draft_version_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw_snapshot" jsonb,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"requested_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_official_sync_runs_status_check" CHECK ("fee_official_sync_runs"."status" in ('success', 'partial', 'failed', 'unsupported'))
);
--> statement-breakpoint
ALTER TABLE "fee_official_sync_runs" ADD CONSTRAINT "fee_official_sync_runs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fee_official_sync_runs_org_plat_idx" ON "fee_official_sync_runs" USING btree ("organization_id","platform","country","started_at");
