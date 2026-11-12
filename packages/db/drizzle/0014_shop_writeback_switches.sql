ALTER TABLE "shops" ADD COLUMN "inventory_push_enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "price_writeback_enabled" boolean DEFAULT true NOT NULL;
