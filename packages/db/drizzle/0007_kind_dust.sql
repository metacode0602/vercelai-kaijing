-- 历史重名品牌先重命名为「名称 (编码)」，保留最早创建的一条，避免建唯一索引失败
WITH ranked AS (
	SELECT
		"id",
		"name",
		"code",
		row_number() OVER (PARTITION BY "organization_id", "name" ORDER BY "created_at", "id") AS "rn"
	FROM "commerce_brands"
)
UPDATE "commerce_brands" AS "b"
SET "name" = "ranked"."name" || ' (' || "ranked"."code" || ')',
	"updated_at" = now()
FROM "ranked"
WHERE "b"."id" = "ranked"."id" AND "ranked"."rn" > 1;--> statement-breakpoint
DROP INDEX "commerce_brands_org_name_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_brands_org_name_uidx" ON "commerce_brands" USING btree ("organization_id","name");
