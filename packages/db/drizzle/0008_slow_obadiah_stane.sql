ALTER TABLE "purchase_receipts" ADD COLUMN "batch_no" varchar(64);--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD COLUMN "carrier" varchar(64);--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD COLUMN "tracking_no" varchar(128);