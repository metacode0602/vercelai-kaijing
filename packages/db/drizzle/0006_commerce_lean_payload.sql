ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "meta" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "payload" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "payload" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
-- Move volatile text into jsonb then drop dedicated columns (lean list schema).
UPDATE "products"
SET "payload" = COALESCE("payload", '{}'::jsonb) || jsonb_build_object('description', "description")
WHERE "description" IS NOT NULL;--> statement-breakpoint
UPDATE "listings"
SET "payload" = COALESCE("payload", '{}'::jsonb) || jsonb_build_object('description', "description")
WHERE "description" IS NOT NULL;--> statement-breakpoint
UPDATE "orders"
SET "raw" = COALESCE("raw", '{}'::jsonb)
  || CASE WHEN "buyer_name_mask" IS NOT NULL THEN jsonb_build_object('buyerNameMask', "buyer_name_mask") ELSE '{}'::jsonb END
  || CASE WHEN "shipping_amount" IS NOT NULL THEN jsonb_build_object('shippingAmount', "shipping_amount") ELSE '{}'::jsonb END;--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN IF EXISTS "description";--> statement-breakpoint
ALTER TABLE "listings" DROP COLUMN IF EXISTS "description";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN IF EXISTS "buyer_name_mask";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN IF EXISTS "shipping_amount";
