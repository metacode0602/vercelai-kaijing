ALTER TABLE "serverless_detail" ADD COLUMN IF NOT EXISTS "placement_mode" varchar(32) DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "serverless_detail" ADD COLUMN IF NOT EXISTS "region_allowlist" jsonb DEFAULT '[]'::jsonb NOT NULL;
