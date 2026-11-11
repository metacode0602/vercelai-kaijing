-- 品类树初始化（commerce_categories 示例树）
-- 对应表：commerce_categories（内部品类，层级靠 parent_id，code 在组织内唯一）
--
-- 执行前提：已运行 drizzle 迁移（db:migrate）
-- 执行方式：psql "$DATABASE_URL" -f packages/db/drizzle/scripts/init-category-tree.sql
--
-- 约定：
--   * 目标组织默认 org_shop_dev_demo，切换租户时全局替换该 id；
--   * 幂等：按 (organization_id, code) 跳过已存在的节点，不覆盖名称 / 排序；
--   * 父子关系通过 parent_id 关联，父节点必须先于子节点插入；
--   * 父节点 id 用子查询回填，即使节点已被 TS 种子脚本创建也能正确挂接。

-- 0) 确保目标组织存在（演示租户；正式环境应替换为真实 tenant 组织 id）
INSERT INTO organization (id, name, slug, status, org_type, entry_approved, is_current, created_at)
SELECT 'org_shop_dev_demo', 'Open Shop 演示租户', 'shop-dev-demo', 'active', 'tenant', true, false, NOW()
WHERE NOT EXISTS (SELECT 1 FROM organization WHERE id = 'org_shop_dev_demo');

-- 1) 根节点（parent_id 为 NULL，sort 决定同级展示顺序）
INSERT INTO commerce_categories (id, organization_id, code, name, parent_id, sort, status, note, screenshots)
VALUES
  ('cat_seed_apparel', 'org_shop_dev_demo', 'APPAREL', '服装', NULL, 10, 'active', '示例根节点', '[]'::jsonb),
  ('cat_seed_electronics', 'org_shop_dev_demo', 'ELECTRONICS', '数码', NULL, 20, 'active', '示例根节点', '[]'::jsonb),
  ('cat_seed_home', 'org_shop_dev_demo', 'HOME', '家居', NULL, 30, 'active', '示例根节点', '[]'::jsonb)
ON CONFLICT DO NOTHING;

-- 2) 二级节点（parent_id 按父 code 回查）
INSERT INTO commerce_categories (id, organization_id, code, name, parent_id, sort, status, note, screenshots)
VALUES
  ('cat_seed_apparel_tops', 'org_shop_dev_demo', 'APPAREL-TOPS', '上衣',
   (SELECT id FROM commerce_categories WHERE organization_id = 'org_shop_dev_demo' AND code = 'APPAREL'),
   10, 'active', '', '[]'::jsonb),
  ('cat_seed_apparel_bottoms', 'org_shop_dev_demo', 'APPAREL-BOTTOMS', '下装',
   (SELECT id FROM commerce_categories WHERE organization_id = 'org_shop_dev_demo' AND code = 'APPAREL'),
   20, 'active', '', '[]'::jsonb),
  ('cat_seed_electronics_accessories', 'org_shop_dev_demo', 'ELECTRONICS-ACCESSORIES', '电脑配件',
   (SELECT id FROM commerce_categories WHERE organization_id = 'org_shop_dev_demo' AND code = 'ELECTRONICS'),
   10, 'active', '', '[]'::jsonb),
  ('cat_seed_home_kitchen', 'org_shop_dev_demo', 'HOME-KITCHEN', '厨房用品',
   (SELECT id FROM commerce_categories WHERE organization_id = 'org_shop_dev_demo' AND code = 'HOME'),
   10, 'active', '', '[]'::jsonb)
ON CONFLICT DO NOTHING;

-- 3) 三级节点（演示多级树：服装 > 上衣 > T恤）
INSERT INTO commerce_categories (id, organization_id, code, name, parent_id, sort, status, note, screenshots)
VALUES
  ('cat_seed_apparel_tops_tee', 'org_shop_dev_demo', 'APPAREL-TOPS-TEE', 'T恤',
   (SELECT id FROM commerce_categories WHERE organization_id = 'org_shop_dev_demo' AND code = 'APPAREL-TOPS'),
   10, 'active', '三级示例', '[]'::jsonb)
ON CONFLICT DO NOTHING;

-- 4) 校验：输出整棵树（code / 层级缩进 / 排序）
WITH RECURSIVE tree AS (
  SELECT id, code, name, parent_id, sort, 1 AS level, name::text AS path
  FROM commerce_categories
  WHERE organization_id = 'org_shop_dev_demo' AND parent_id IS NULL
  UNION ALL
  SELECT c.id, c.code, c.name, c.parent_id, c.sort, t.level + 1,
         t.path || ' > ' || c.name
  FROM commerce_categories c
  JOIN tree t ON c.parent_id = t.id
  WHERE c.organization_id = 'org_shop_dev_demo'
)
SELECT repeat('  ', level - 1) || name AS tree_node, code, sort, path
FROM tree
ORDER BY path, sort;
