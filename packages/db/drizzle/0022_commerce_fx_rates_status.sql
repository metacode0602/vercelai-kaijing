-- fx_rates: soft-disable status + note + updated_at (settings tRPC closure)
ALTER TABLE "fx_rates" ADD COLUMN IF NOT EXISTS "status" varchar(16) DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "fx_rates" ADD COLUMN IF NOT EXISTS "note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fx_rates" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fx_rates_org_status_idx" ON "fx_rates" USING btree ("organization_id","status");
