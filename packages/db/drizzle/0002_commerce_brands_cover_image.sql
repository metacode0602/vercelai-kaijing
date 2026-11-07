-- commerce_brands 增加封面图 cover_image（可空，存 URL / data URL）
ALTER TABLE "commerce_brands" ADD COLUMN IF NOT EXISTS "cover_image" text;
