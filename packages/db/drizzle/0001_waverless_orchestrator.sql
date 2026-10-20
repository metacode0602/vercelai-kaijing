ALTER TABLE "serverless_detail" ADD COLUMN IF NOT EXISTS "orchestrator_type" varchar(32) DEFAULT 'skypilot' NOT NULL;--> statement-breakpoint
ALTER TABLE "serverless_detail" ADD COLUMN IF NOT EXISTS "waverless_endpoint_id" varchar(256);--> statement-breakpoint
ALTER TABLE "serverless_detail" ADD COLUMN IF NOT EXISTS "logical_az_id" varchar(128);--> statement-breakpoint
ALTER TABLE "serverless_detail" ADD COLUMN IF NOT EXISTS "provider_id" varchar(64);--> statement-breakpoint
ALTER TABLE "serverless_detail" ADD COLUMN IF NOT EXISTS "scale_up_wait_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "serverless_detail" ADD COLUMN IF NOT EXISTS "desired_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "serverless_detail" ADD COLUMN IF NOT EXISTS "provider_status" varchar(64);--> statement-breakpoint
ALTER TABLE "serverless_detail" ADD COLUMN IF NOT EXISTS "last_synced_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "serverless_detail_orchestrator_idx" ON "serverless_detail" USING btree ("orchestrator_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "serverless_detail_waverless_ep_idx" ON "serverless_detail" USING btree ("waverless_endpoint_id");
