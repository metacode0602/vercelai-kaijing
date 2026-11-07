-- commerce_brands 品牌主档 + products.brand_id；按既有 brand 文本尽力回填
CREATE TABLE IF NOT EXISTS "commerce_brands" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "code" varchar(64) NOT NULL,
  "name" text NOT NULL,
  "status" varchar(16) DEFAULT 'active' NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "commerce_brands"
    ADD CONSTRAINT "commerce_brands_organization_id_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "commerce_brands_org_code_uidx"
  ON "commerce_brands" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commerce_brands_org_status_idx"
  ON "commerce_brands" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commerce_brands_org_name_idx"
  ON "commerce_brands" USING btree ("organization_id","name");--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "brand_id" text;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "products"
    ADD CONSTRAINT "products_brand_id_commerce_brands_id_fk"
    FOREIGN KEY ("brand_id") REFERENCES "public"."commerce_brands"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_org_brand_idx"
  ON "products" USING btree ("organization_id","brand_id");--> statement-breakpoint
-- 回填：每个组织下按 trim(brand) 去重建品牌；匹配不上的留空 brand_id
WITH distinct_brands AS (
  SELECT
    p.organization_id,
    trim(p.brand) AS name,
    upper(regexp_replace(trim(p.brand), '[^A-Za-z0-9\u4e00-\u9fff]+', '-', 'g')) AS raw_code
  FROM products p
  WHERE p.brand IS NOT NULL AND trim(p.brand) <> '' AND p.brand_id IS NULL
  GROUP BY p.organization_id, trim(p.brand)
),
prepared AS (
  SELECT
    organization_id,
    name,
    CASE
      WHEN raw_code IS NULL OR raw_code = '' THEN 'BRAND'
      ELSE left(raw_code, 48)
    END AS code_base
  FROM distinct_brands
),
ranked AS (
  SELECT
    organization_id,
    name,
    code_base,
    row_number() OVER (PARTITION BY organization_id, code_base ORDER BY name) AS rn
  FROM prepared
),
to_insert AS (
  SELECT
    organization_id,
    name,
    CASE WHEN rn = 1 THEN code_base ELSE code_base || '-' || rn::text END AS code
  FROM ranked
)
INSERT INTO commerce_brands (id, organization_id, code, name, status, note, created_at, updated_at)
SELECT
  md5(organization_id || ':' || name),
  organization_id,
  code,
  name,
  'active',
  'migrated from products.brand',
  now(),
  now()
FROM to_insert
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE products AS p
SET brand_id = b.id
FROM commerce_brands AS b
WHERE p.organization_id = b.organization_id
  AND p.brand_id IS NULL
  AND p.brand IS NOT NULL
  AND trim(p.brand) = b.name;
