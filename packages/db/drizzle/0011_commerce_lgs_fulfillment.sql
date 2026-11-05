-- Module 4: LGS / JSB fulfillment — tracking source + handover batches.
-- Existing shipments / shipment_items / tracking_events / fulfillment_attempts stay;
-- 0011 only adds missing column + batch tables (do not recreate shipments).

ALTER TABLE "tracking_events" ADD COLUMN IF NOT EXISTS "source" varchar(16) DEFAULT 'manual' NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "fulfillment_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"batch_no" varchar(64) NOT NULL,
	"channel" varchar(32) NOT NULL,
	"site" varchar(16),
	"country" varchar(8),
	"warehouse_code" varchar(64),
	"status" varchar(32) DEFAULT 'open' NOT NULL,
	"carrier" varchar(64),
	"tracking_summary" text,
	"package_count" integer DEFAULT 0 NOT NULL,
	"handed_over_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"raw" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "fulfillment_batch_packages" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"shipment_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "fulfillment_batches" ADD CONSTRAINT "fulfillment_batches_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_batch_packages" ADD CONSTRAINT "fulfillment_batch_packages_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_batch_packages" ADD CONSTRAINT "fulfillment_batch_packages_batch_id_fulfillment_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."fulfillment_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_batch_packages" ADD CONSTRAINT "fulfillment_batch_packages_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "fulfillment_batches_org_batch_no_uidx" ON "fulfillment_batches" USING btree ("organization_id","batch_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fulfillment_batches_org_channel_idx" ON "fulfillment_batches" USING btree ("organization_id","channel");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fulfillment_batches_org_status_idx" ON "fulfillment_batches" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fulfillment_batch_packages_batch_shipment_uidx" ON "fulfillment_batch_packages" USING btree ("batch_id","shipment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fulfillment_batch_packages_org_idx" ON "fulfillment_batch_packages" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fulfillment_batch_packages_shipment_idx" ON "fulfillment_batch_packages" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tracking_events_source_idx" ON "tracking_events" USING btree ("source");
