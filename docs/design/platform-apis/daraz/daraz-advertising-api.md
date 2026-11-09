# Daraz 广告（Advertising）数据接口与字段说明

> 核验日期：2026-11-05。
> 官方 API Reference：<https://open.daraz.com/doc/api.htm>
>
> 结论：**截至核验日期，Daraz Open Platform 没有公开的 Advertising / Sponsored Products API 分类。**
> 官方 API Reference 的全部分类见下表，其中与“营销”相关的是 Seller Voucher、Free Shipping、Flexicombo，但它们不是广告投放报表。

## 1. 官方分类核验

| 分类 ID | 名称 | 端点数 | 是否广告 |
|---:|---|---:|---|
| 1 | Product | 16 | 否 |
| 2 | Order | 8 | 否 |
| 3 | System | 3 | 否 |
| 4 | Finance | 2 | 否 |
| 18 | Logistics API | 14 | 否 |
| 21 | IM | 7 | 否 |
| 22 | Fulfillment | 8 | 否 |
| 23 | Return and Refund | 6 | 否 |
| 24 | Seller | 3 | 否 |
| 25 | Seller Voucher | 9 | 否（优惠券） |
| 26 | Free Shipping | 11 | 否（包邮活动） |
| 27 | Product Review | 3 | 否 |
| 29 | Flexicombo | 9 | 否（组合促销） |

官方分类接口：`https://open.daraz.com/handler/share/apidoc/getApiCategory.json?cid=<ID>`

> 因此，现有 `daraz-lazada-open-api-data-coverage.md` 中广告部分的字段不是 Daraz 官方 Open API 字段，不能作为“官方接口”引用。

## 2. 与广告容易混淆的接口

| 域 | 实际用途 | 为什么不是广告 |
|---|---|---|
| Seller Voucher | 卖家优惠券创建、查询、终止 | 是价格促销，不产生曝光/点击/花费 |
| Free Shipping | 包邮活动 | 是运费促销，不产生广告报表 |
| Flexicombo | 组合商品促销 | 是捆绑销售，不是竞价广告 |
| Product Review | 商品评价 | 不是广告效果数据 |

如果业务需要 Sponsored Products / Discovery / Display Ads 数据，只能：

1. 向 Daraz 招商经理/平台经理确认是否开放独立 Marketing API 或 Seller Center 导出；
2. 使用 Seller Center 广告后台导出 CSV/Excel；
3. 由运营手工录入或定时上传；
4. 在 ERP 中明确标记数据来源为 `manual_import`，不得冒充官方 API 实时数据。

## 3. 建议的广告数据模型

由于没有官方接口，以下是 ERP 侧建议模型，不是 Daraz 字段规范。

### 3.1 广告账户与活动

| 字段 | 类型 | 含义 |
|---|---|---|
| organization_id | text | 租户 |
| shop_id | text | 店铺 |
| platform | varchar | `daraz` |
| ad_account_id | varchar | 广告账户 ID（手工维护） |
| campaign_id | varchar | 活动 ID |
| campaign_name | varchar | 活动名 |
| campaign_type | varchar | `sponsored_product`、`display`、`other` |
| objective | varchar | 投放目标（曝光/点击/成交） |
| budget_amount | numeric(15,4) | 预算 |
| budget_currency | varchar(8) | 币种 |
| start_date / end_date | date | 投放周期 |
| status | varchar | 平台状态 |
| source | varchar | `manual_import` / `seller_center_export` |
| raw | jsonb | 原始行 |

### 3.2 广告组与关键词

| 字段 | 类型 | 含义 |
|---|---|---|
| ad_group_id | varchar | 广告组 ID |
| campaign_id | varchar | 所属活动 |
| ad_group_name | varchar | 广告组名 |
| bid_amount | numeric(15,4) | 出价 |
| bid_currency | varchar(8) | 币种 |
| match_type | varchar | 广泛/短语/精确 |
| keyword_id | varchar | 关键词 ID |
| keyword_text | varchar | 关键词 |
| keyword_status | varchar | 状态 |

### 3.3 广告商品

| 字段 | 类型 | 含义 |
|---|---|---|
| ad_item_id | varchar | 广告商品行 ID |
| campaign_id / ad_group_id | varchar | 关联 |
| external_item_id | varchar | 平台商品 ID |
| external_sku_id | varchar | 平台 SKU |
| seller_sku | varchar | 卖家 SKU |
| bid_amount | numeric(15,4) | 商品出价 |

### 3.4 每日效果

| 字段 | 类型 | 含义 |
|---|---|---|
| stat_date | date | 统计日期 |
| campaign_id / ad_group_id / ad_item_id | varchar | 维度 |
| impressions | bigint | 曝光 |
| clicks | bigint | 点击 |
| ctr | numeric(10,6) | 点击率 |
| spend | numeric(15,4) | 花费 |
| spend_currency | varchar(8) | 币种 |
| orders | bigint | 广告订单数 |
| units | bigint | 广告销量 |
| revenue | numeric(15,4) | 广告 GMV |
| roas | numeric(15,6) | 广告产出比 |
| cpc | numeric(15,4) | 平均点击成本 |
| cpm | numeric(15,4) | 千次曝光成本 |
| conversion_rate | numeric(10,6) | 转化率 |
| raw | jsonb | 原始行 |

## 4. 导入模板（CSV）

```csv
stat_date,campaign_id,campaign_name,campaign_type,ad_group_id,ad_group_name,external_item_id,seller_sku,impressions,clicks,spend,spend_currency,orders,units,revenue,revenue_currency
2026-10-01,C001,Brand Search,sponsored_product,G001,Exact,123456,SKU-A,12000,240,1520.50,LKR,18,21,9800.00,LKR
```

导入规则：

- 首行必须是表头；日期用 `YYYY-MM-DD`。
- 金额保留两位小数，币种单独列；不要在同一文件混币种。
- `campaign_id` + `ad_group_id` + `external_item_id` + `stat_date` 作为幂等键。
- 导入前校验 `spend <= budget`、`clicks <= impressions`、`orders >= 0`。
- 每次导入生成 `import_batch`，失败行进入 `import_errors`，不静默丢弃。

## 5. 与官方财务数据的关系

- 广告花费**不在** `/finance/transaction/details/get` 的保证字段中；不要把广告 CSV 的 spend 直接当平台已扣费。
- 若平台结算单出现广告扣费，应在交易明细里按 `transaction_type` / `fee_name` 识别，并与广告报表交叉核对。
- 广告归因订单（广告订单）与平台订单主数据是两套口径；必须通过 `external_item_id` / `seller_sku` 映射，不能直接改订单来源。

## 6. ERP 表建议

| 表 | 用途 |
|---|---|
| `ad_accounts` | 广告账户 |
| `ad_campaigns` | 活动 |
| `ad_groups` | 广告组 |
| `ad_keywords` | 关键词 |
| `ad_items` | 广告商品 |
| `ad_daily_stats` | 每日效果 |
| `ad_import_batches` | 导入批次与校验结果 |

所有表强制 `organization_id`、`shop_id`；金额 `numeric(15,4)`；币种单独列；原始行存 `jsonb`。

## 7. 结论

- 问题“Daraz 官方广告 API 字段”当前**无法用官方 Open API 回答**，因为官方未提供该分类。
- 现有文档中的广告字段只能作为 ERP 自建模型/手工导入模板，不能标注为 Daraz 官方 API。
- 若必须接入广告数据，下一步是向 Daraz 平台方确认独立 Marketing API 或导出能力，并取得正式字段文档后再补官方字段表。

## 8. 官方来源

- API Reference：<https://open.daraz.com/doc/api.htm>
- Product 分类：<https://open.daraz.com/handler/share/apidoc/getApiCategory.json?cid=1>
- Seller Voucher 分类：<https://open.daraz.com/handler/share/apidoc/getApiCategory.json?cid=25>
- Free Shipping 分类：<https://open.daraz.com/handler/share/apidoc/getApiCategory.json?cid=26>
- Flexicombo 分类：<https://open.daraz.com/handler/share/apidoc/getApiCategory.json?cid=29>
