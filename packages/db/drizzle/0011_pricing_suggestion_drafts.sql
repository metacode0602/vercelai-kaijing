CREATE TABLE "pricing_suggestion_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"sku" varchar(64) NOT NULL,
	"platform" varchar(32) NOT NULL,
	"site" varchar(8) NOT NULL,
	"version_no" integer NOT NULL,
	"status" varchar(16) DEFAULT 'current' NOT NULL,
	"suggested_retail" numeric(15, 4) NOT NULL,
	"suggested_free_shipping" numeric(15, 4),
	"currency" varchar(3) NOT NULL,
	"is_estimate" boolean DEFAULT false NOT NULL,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" varchar(16) NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"archived_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pricing_suggestion_drafts_status_check" CHECK ("pricing_suggestion_drafts"."status" in ('current', 'superseded', 'archived')),
	CONSTRAINT "pricing_suggestion_drafts_source_check" CHECK ("pricing_suggestion_drafts"."source" in ('calculator', 'listing_fill', 'batch'))
);
--> statement-breakpoint
ALTER TABLE "pricing_suggestion_drafts" ADD CONSTRAINT "pricing_suggestion_drafts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_suggestion_drafts" ADD CONSTRAINT "pricing_suggestion_drafts_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_suggestion_drafts_ver_uidx" ON "pricing_suggestion_drafts" USING btree ("organization_id","variant_id","platform","site","version_no");--> statement-breakpoint
CREATE INDEX "pricing_suggestion_drafts_current_idx" ON "pricing_suggestion_drafts" USING btree ("organization_id","variant_id","platform","site","status");--> statement-breakpoint
CREATE INDEX "pricing_suggestion_drafts_org_idx" ON "pricing_suggestion_drafts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "pricing_suggestion_drafts_sku_idx" ON "pricing_suggestion_drafts" USING btree ("organization_id","sku");
