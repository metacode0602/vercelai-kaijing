-- 数据字典初始化（commerce_dictionaries 基础数据）
-- 对应种子脚本：packages/db/src/scripts/seed-dictionaries.ts（pnpm --filter @workspace/db db:seed:dictionaries）
--
-- 执行前提：已运行 drizzle 迁移（db:migrate）
-- 执行方式：psql "$DATABASE_URL" -f packages/db/drizzle/scripts/init-dictionaries.sql
--
-- 约定：
--   * 目标组织默认 org_shop_dev_demo（演示租户），切换租户时全局替换该 id；
--   * 幂等：按 (organization_id, key) 跳过已存在的字典，不覆盖已有值；
--   * 品牌 / 品类是独立实体，不作为字典初始化（见 EXCLUDED_KEYS）。

-- 0) 确保目标组织存在（演示租户；正式环境应替换为真实 tenant 组织 id）
INSERT INTO organization (id, name, slug, status, org_type, entry_approved, is_current, created_at)
SELECT 'org_shop_dev_demo', 'Open Shop 演示租户', 'shop-dev-demo', 'active', 'tenant', true, false, NOW()
WHERE NOT EXISTS (SELECT 1 FROM organization WHERE id = 'org_shop_dev_demo');

-- 1) 基础字典（values 为可选值数组；value_titles 为 value -> 展示标题，可按需补）
INSERT INTO commerce_dictionaries (id, organization_id, key, label, description, shared, values, value_titles, inactive_values)
VALUES
  ('dict_seed_product_color', 'org_shop_dev_demo', 'product_color', '颜色',
   '商品规格标准色；别名可归一到标准值', true,
   '["黑色", "白色", "深灰色", "蓝色", "红色"]'::jsonb, '{}'::jsonb, '[]'::jsonb),
  ('dict_seed_product_size', 'org_shop_dev_demo', 'product_size', '尺码',
   '商品规格标准尺码', true,
   '["M", "L", "XL", "2XL", "3XL", "4XL"]'::jsonb, '{}'::jsonb, '[]'::jsonb),
  ('dict_seed_product_pack', 'org_shop_dev_demo', 'product_pack', '包装规格',
   '商品售卖单元（单件/两件装/礼盒）；箱规单独维护并引用此值', true,
   '["单件", "两件装", "礼盒"]'::jsonb, '{}'::jsonb, '[]'::jsonb),
  ('dict_seed_product_style', 'org_shop_dev_demo', 'product_style', '款式/版型',
   '商品款式与版型，可在字典页维护', true,
   '["基础款", "修身", "宽松", "运动款", "商务正装"]'::jsonb, '{}'::jsonb, '[]'::jsonb),
  ('dict_seed_product_material', 'org_shop_dev_demo', 'product_material', '材质',
   '商品材质，可在字典页维护', true,
   '["棉", "涤纶", "尼龙", "混纺", "皮革", "金属"]'::jsonb, '{}'::jsonb, '[]'::jsonb),
  ('dict_seed_fulfillment_mode', 'org_shop_dev_demo', 'fulfillment_mode', '履约模式',
   '店铺可选；决定包裹状态流程', true,
   '["LGS", "JSB 灰清"]'::jsonb, '{}'::jsonb, '[]'::jsonb),
  ('dict_seed_warehouse_type', 'org_shop_dev_demo', 'warehouse_type', '仓库类型',
   '仓库主档使用', true,
   '["自营仓", "3PL 仓", "供应商仓"]'::jsonb, '{}'::jsonb, '[]'::jsonb),
  ('dict_seed_purchase_reason', 'org_shop_dev_demo', 'purchase_reason', '采购原因',
   '采购申请和采购单共用；按单据类型限制可选值', true,
   '["常规补货", "新品首单", "活动备货", "缺货补单", "样品采购"]'::jsonb, '{}'::jsonb, '[]'::jsonb),
  ('dict_seed_purchase_priority', 'org_shop_dev_demo', 'purchase_priority', '采购优先级',
   '采购申请和采购单共用；决定审批与排期顺序', true,
   '["普通", "紧急", "低"]'::jsonb, '{}'::jsonb, '[]'::jsonb),
  ('dict_seed_stock_in_type', 'org_shop_dev_demo', 'stock_in_type', '入库类型',
   '仅入库单使用；不同入库类型对应不同来源单据', true,
   '["采购入库", "调拨入库", "退货入库", "盘盈入库", "其他入库"]'::jsonb, '{}'::jsonb, '[]'::jsonb),
  ('dict_seed_stock_out_type', 'org_shop_dev_demo', 'stock_out_type', '出库类型',
   '仅出库单使用；不同出库类型对应不同去向', true,
   '["销售出库", "调拨出库", "采购退货", "盘亏出库", "其他出库"]'::jsonb, '{}'::jsonb, '[]'::jsonb),
  ('dict_seed_stock_adjustment_type', 'org_shop_dev_demo', 'stock_adjustment_type', '库存调整类型',
   '仅盘点与调整使用；区分盘盈、盘亏和报废', true,
   '["盘盈", "盘亏", "质量报废", "库位调整"]'::jsonb, '{}'::jsonb, '[]'::jsonb),
  ('dict_seed_aftersale_type', 'org_shop_dev_demo', 'aftersale_type', '售后类型',
   '售后单使用；决定后续质检和回库流程', true,
   '["仅退款", "退货退款", "换货", "补发"]'::jsonb, '{}'::jsonb, '[]'::jsonb),
  ('dict_seed_qc_status', 'org_shop_dev_demo', 'qc_status', '质检状态',
   '退货质检使用；可售、残次、报废多级结果', true,
   '["待检", "可售", "残次", "报废"]'::jsonb, '{}'::jsonb, '[]'::jsonb),
  ('dict_seed_package_condition', 'org_shop_dev_demo', 'package_condition', '外包装状况',
   '退货质检和入库验收使用', true,
   '["完好", "轻微破损", "严重破损", "缺件"]'::jsonb, '{}'::jsonb, '[]'::jsonb),
  ('dict_seed_platform_sync_status', 'org_shop_dev_demo', 'platform_sync_status', '平台同步状态',
   '刊登、售后和订单同步共用', true,
   '["待同步", "同步中", "已同步", "同步失败"]'::jsonb, '{}'::jsonb, '[]'::jsonb),
  ('dict_seed_review_sentiment', 'org_shop_dev_demo', 'review_sentiment', '评论情感',
   '评论分析使用；支持按业务需要新增自定义标签', true,
   '["正面", "中性", "负面"]'::jsonb, '{}'::jsonb, '[]'::jsonb)
ON CONFLICT DO NOTHING;

-- 2) 品牌 / 品类已有独立实体与维护页，清理历史字典行（与 seed-dictionaries.ts 保持一致）
DELETE FROM commerce_dictionaries
WHERE organization_id = 'org_shop_dev_demo'
  AND key IN ('product_brand', 'product_category');

-- 3) 校验：应返回 17 行
SELECT key, label, jsonb_array_length(values) AS value_count
FROM commerce_dictionaries
WHERE organization_id = 'org_shop_dev_demo'
ORDER BY key;
