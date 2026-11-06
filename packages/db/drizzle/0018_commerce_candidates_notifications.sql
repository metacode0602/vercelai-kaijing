-- Module 14: product_candidates review columns + console_notifications (in-app inbox)

ALTER TABLE "product_candidates" ADD COLUMN IF NOT EXISTS "source" varchar(16) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_candidates" ADD COLUMN IF NOT EXISTS "reject_reason" text;--> statement-breakpoint
ALTER TABLE "product_candidates" ADD COLUMN IF NOT EXISTS "product_id" text;--> statement-breakpoint
ALTER TABLE "product_candidates" ADD COLUMN IF NOT EXISTS "reviewed_by" text;--> statement-breakpoint
ALTER TABLE "product_candidates" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "product_candidates" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "product_candidates" ADD CONSTRAINT "product_candidates_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "product_candidates_product_idx" ON "product_candidates" USING btree ("product_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "console_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text,
	"category" varchar(32) DEFAULT 'system' NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"href" text,
	"read_at" timestamp with time zone,
	"source_type" varchar(64),
	"source_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "console_notifications" ADD CONSTRAINT "console_notifications_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "console_notifications_org_user_idx" ON "console_notifications" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "console_notifications_org_read_idx" ON "console_notifications" USING btree ("organization_id","read_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "console_notifications_org_created_idx" ON "console_notifications" USING btree ("organization_id","created_at");
