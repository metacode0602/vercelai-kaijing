# Lazada API 与 ERP Schema 覆盖度评审

> 核验日期：2026-11-05。
> 对照文件：`packages/db/src/commerce-schema.ts`。
> 本文只给设计建议，**不修改 schema、不生成迁移**。
> Lazada 字段来源见同目录 `lazada-*.md`。

## 1. 结论

现有 schema 能覆盖 Lazada 的**商品主数据 + 订单主数据 + SKU 映射 + 当前库存余额 + 成本 + 结算单**，但**不能完整覆盖**：

1. 多仓库存快照与库存变动流水；
2. 订单状态事件、包裹、面单、轨迹；
3. 售后逆向单、质检、退款、退货物流；
4. 广告 campaign/adgroup/keyword/报表；
5. 促销活动与活动商品；
6. IM 会话/消息、商品评价；
7. 结算单的余额、打款状态、费用拆分、物流费明细；
8. 平台写入的幂等/待审/失败重试。

核心约束：**Lazada 订单项按商品实例返回，每条记录代表 1 件**。`order_lines` 必须保留 `order_item_id` 粒度；数量由去重 `order_item_id` 计数得出，不能假设单条记录可含多件。

## 2. 覆盖度矩阵

| 域 | 现有表 | 覆盖度 | 说明 |
|---|---|---|---|
| 店铺/授权 | `shops`、`integration_credentials` | 高 | `seller_id`、`external_shop_id`、`auth_expires_at` 已具备 |
| 同步状态 | `integration_states`、`integration_logs` | 中 | 有 cursor，但无按资源/接口的细粒度失败与退避 |
| 商品 SPU | `products` | 高 | 标题、品牌、图片、尺寸、payload 可落 |
| 变体/SKU | `product_variants` | 高 | `sku`、`skuCode`、条码、尺寸、attrs |
| 平台 Listing | `listings` | 高 | `external_item_id`、类目、属性、价格、库存、状态 |
| SKU 映射 | `seller_sku_mappings` | 高 | `seller_sku`、`platform_sku_id`、`item_id` 独立 |
| 类目/品牌 | `platform_categories`、`platform_brands` | 高 | 树、叶子、路径、原始 JSON |
| 订单头 | `orders` | 中 | 有平台状态/履约状态，但无订单头支付时间、取消/退货/丢失细分 |
| 订单行 | `order_lines` | 中 | 有 `qty`；需按每条 `order_item_id` 落一行（`qty=1`）；缺税费/优惠/退款列 |
| 库存余额 | `inventory_balances` | 中 | 只有当前余额，无快照/流水/预留明细 |
| 库存预警 | `stock_alerts` | 中 | 可复用，需补平台仓维度 |
| 采购成本 | `sku_costs` | 高 | 支持版本、柜次、税费、落地成本 |
| 结算 | `settlements`、`settlement_lines` | 低 | 缺余额、打款、费用类型细分、物流费明细 |
| 待审动作 | `pending_actions` | 中 | 可承载写操作，但需补幂等键/平台响应 |
| 广告 | 无 | 无 | 需新增 |
| 售后 | 无 | 无 | 需新增 |
| 履约/物流 | 无 | 无 | 需新增 |
| 促销 | 无 | 无 | 需新增 |
| IM/评价 | 无 | 无 | 需新增 |

## 3. 商品域

### 3.1 可直接落库

| Lazada 字段 | 现有列 |
|---|---|
| `item_id` | `listings.external_item_id` |
| `primary_category` | `listings.category_external_id` |
| `attributes` | `listings.attributes` / `products.payload` |
| `images` | `products.images` / `listings.payload` |
| `SellerSku` | `seller_sku_mappings.seller_sku` |
| `SkuId` | `seller_sku_mappings.platform_sku_id` |
| `price` / `special_price` | `listings.price_amount` + `payload` |
| `status` / `subStatus` | `listings.status` / `payload` |
| `package_*` | `product_variants` / `listings.payload` |
| `brand` | `platform_brands` / `products.brand` |

### 3.2 缺口

| 缺口 | 影响 | 建议 |
|---|---|---|
| `ShopSku` 无独立列 | 平台店铺 SKU 只能进 `meta`，查询/对账弱 | `seller_sku_mappings` 增加 `shop_sku` |
| 多仓库存无快照 | `multiWarehouseInventories` 只能进 `raw` | 新增 `listing_inventory_snapshots` |
| `channelInventories` / `fblWarehouseInventories` 无结构 | 渠道库存无法分析 | 快照表增加 `channel` / `warehouse_type` |
| 图片处理结果无表 | `GetResponse` 轮询结果无处放 | `media_jobs` 或 `payload` 内状态 |
| 商品审核拒绝原因无结构化 | 运营无法筛选 | `listings.payload.reject_reason` 或独立表 |
| 商品删除无软删审计 | 误删不可追溯 | `listings.deleted_at` + 审计事件 |

### 3.3 建议新增

```text
listing_inventory_snapshots
  id, organization_id, shop_id, listing_id, seller_sku, platform_sku_id,
  warehouse_code, warehouse_type, channel,
  quantity, total_quantity, sellable_quantity,
  occupy_quantity, withhold_quantity,
  captured_at, raw
  unique(shop_id, seller_sku, warehouse_code, channel, captured_at)
```

## 4. 订单与履约域

### 4.1 可直接落库

| Lazada 字段 | 现有列 |
|---|---|
| `order_id` | `orders.external_order_id` |
| `status` / `statuses[]` | `orders.platform_status` |
| `created_at` | `orders.placed_at` |
| `payment_time`（订单项） | `orders.paid_at`（需聚合） |
| `payment_method` | `orders.payment_method` |
| `shipping_fee` 等 | `orders.total_amount` / `raw` |
| `order_item_id` | `order_lines.external_line_id` |
| `sku` / `shop_sku` | `order_lines.seller_sku` / `sku` |
| `paid_price` / `item_price` | `order_lines.unit_price` + `raw` |
| `package_id` / `tracking_code` | `orders`/`order_lines` 对应列 |

### 4.2 缺口

| 缺口 | 影响 | 建议 |
|---|---|---|
| 无订单状态事件表 | 无法审计状态迁移、SLA、自动取消 | 新增 `order_status_events` |
| 无包裹/面单表 | 一个订单多包裹无法表达 | 新增 `shipments`、`shipment_items` |
| 无轨迹表 | 无法做异常物流、妥投证明 | 新增 `tracking_events` |
| 无履约尝试记录 | RTS/Pack 失败无法重试审计 | 新增 `fulfillment_attempts` |
| 订单项单位粒度 | 聚合后丢失退款/状态/包裹粒度 | 见 4.4，按 `order_item_id` 落行 |
| 无税费/优惠/补贴列 | 财务对账需读 raw | 增加 `tax_amount`、`discount_amount`、`shipping_amount` |
| 无取消/退货/丢失状态 | 只能落 `unknown` | 扩展 `orders.status` 枚举 |
| 无订单头支付时间 | 只能从订单项聚合 | 增加 `orders.paid_at` 聚合逻辑，不伪造字段 |

### 4.3 建议新增

```text
order_status_events
  id, organization_id, shop_id, order_id, order_line_id,
  from_status, to_status, source, event_time, raw
  index(shop_id, order_id, event_time)

shipments
  id, organization_id, shop_id, order_id,
  package_id, tracking_number, provider_code, provider_name,
  status, rts_at, shipped_at, delivered_at, raw
  unique(shop_id, package_id)

shipment_items
  shipment_id, order_line_id, qty, unique(shipment_id, order_line_id)

tracking_events
  id, shipment_id, package_id, status_code, title, description,
  location, event_time, raw
  unique(shop_id, package_id, event_time, status_code)

fulfillment_attempts
  id, shop_id, package_id, action, attempt_no, result,
  error_code, error_message, retryable, requested_at, raw
```

### 4.4 数量模型

Lazada 每个最小订单项对象 = 一个独立商品实例（Unit/Line Item）；同一 SKU 多件 = 多条不同 `order_item_id`。

推荐：

```text
order_lines:
  external_line_id = order_item_id
  qty = 1
  唯一(order_id, external_line_id)
```

展示时按 `sku` 聚合：

```sql
SELECT sku, COUNT(DISTINCT external_line_id) AS units
FROM order_lines
WHERE order_id = ...
GROUP BY sku;
```

可选聚合行方案：

```text
order_lines.qty = COUNT(DISTINCT order_item_id)
order_line_units(order_line_id, order_item_id)
```

- 推荐单位行，退款/售后/包裹天然按 `order_item_id` 对齐。
- 若聚合，必须另存 `order_line_units`；库存动作仍按 unit 幂等。
- `items_count` 可做校验，但以 `COUNT(DISTINCT order_item_id)` 为准。
- 不再需要 `quantity_source='missing'` 或 `needs_quantity` 占位，因为数量口径已确定。

## 5. 库存域

### 5.1 现有能力

`inventory_balances` 已有：

```text
on_hand, reserved, qc_hold, damaged, in_transit, pending_inbound,
customs_clearing, version
```

可直接支撑“可用 = on_hand - reserved - qc_hold - damaged”。

### 5.2 缺口

| 缺口 | 影响 | 建议 |
|---|---|---|
| 无预留明细 | 不知道谁占用了库存 | 新增 `inventory_reservations` |
| 无库存流水 | 无法追溯扣减/回补 | 新增 `inventory_movements` |
| 无平台仓映射 | Lazada `warehouseCode` 与内部仓无对应 | 新增 `warehouse_mappings` |
| 无库存快照 | 无法对账平台库存 | 复用 3.3 快照表 |
| 无批次/保质期 | 退货/报损不可追踪 | 视业务新增 `inventory_lots` |

### 5.3 建议新增

```text
inventory_reservations
  id, organization_id, shop_id, order_id, order_line_id,
  variant_id, warehouse_code, qty, status,
  reserved_at, released_at, committed_at
  unique(shop_id, order_line_id)

inventory_movements
  id, organization_id, shop_id, variant_id, warehouse_code, bin_code,
  movement_type, qty_delta, on_hand_after, reserved_after,
  source_type, source_id, operator, occurred_at, raw
  index(organization_id, variant_id, occurred_at)
```

## 6. 售后域

现有 schema **无售后表**。建议：

```text
reverse_orders
  id, organization_id, shop_id, reverse_order_id, trade_order_id,
  request_type, return_to_type, shipping_type, is_rtm,
  status, ofc_status, created_at, updated_at, raw
  unique(shop_id, reverse_order_id)

reverse_order_items
  id, reverse_order_id, reverse_order_line_id, trade_order_line_id,
  reverse_status, ofc_status, reason_code, reason_text,
  refund_amount, currency, qc_decision, tracking_number,
  sla_at, is_dispute, raw
  unique(shop_id, reverse_order_line_id)

reverse_qc_records
  id, reverse_order_line_id, qc_decision, qc_at, warehouse_code, raw

refunds
  id, organization_id, shop_id, reverse_order_id, reverse_order_line_id,
  amount, currency, status, refunded_at, raw

reverse_order_messages
  id, reverse_order_line_id, direction, content, created_at, raw
```

金额注意：售后 `refund_amount` / `item_unit_price` 是 **cent，越南除外**；落库前归一化并记录 `amount_unit`。

## 7. 财务域

### 7.1 现有能力

`settlements` + `settlement_lines` 可存结算单号、周期、总额、费用类型、订单/变体关联。

### 7.2 缺口

| 缺口 | 影响 | 建议 |
|---|---|---|
| 无余额/打款状态 | 无法对账 | `settlements` 增加 `opening_balance`、`closing_balance`、`payout_amount`、`paid_status`、`paid_at` |
| 无费用明细粒度 | 物流费/VAT/WHT 无法拆 | `settlement_lines` 增加 `fee_code`、`fee_name`、`tax_amount`、`wht_amount`、`reference` |
| 无账户流水 | 充值/提现无法对账 | 新增 `account_transactions` |
| 无物流费明细 | 履约成本无法按包裹核对 | 新增 `logistics_fee_details` |
| 无币种单位 | 售后 cent/VN 例外 | 增加 `amount_unit` / `currency` |

```text
account_transactions
  id, organization_id, shop_id, transaction_number, transaction_time,
  type, sub_type, amount, currency, status, reference, raw
  unique(shop_id, transaction_number)

logistics_fee_details
  id, organization_id, shop_id, statement_id, trade_order_id,
  trade_order_line_id, package_id, fee_code, fee_name,
  amount, tax_amount, currency, fee_created_at, raw
```

## 8. 广告、促销、IM、评价

| 域 | 建议表 |
|---|---|
| 广告 | `ad_accounts`、`ad_campaigns`、`ad_adgroups`、`ad_keywords`、`ad_audiences`、`ad_daily_metrics`、`ad_wallet_transactions`、`ad_smax_mappings` |
| 促销 | `promotions`、`promotion_rules`、`promotion_items`、`promotion_channels` |
| IM | `im_sessions`、`im_messages` |
| 评价 | `product_reviews`、`review_replies` |

广告报表统一表至少含：

```text
shop_id, campaign_id, adgroup_id, keyword_id,
report_date, report_type, placement,
spend, impressions, clicks, ctr, cpc, units_sold, revenue, roi,
currency, raw
```

## 9. 平台写入与幂等

`pending_actions` 可承载“待审后写”，但需要补：

| 字段 | 用途 |
|---|---|
| `idempotency_key` | 防止重复提交（如重试 Pack/RTS） |
| `platform_request_id` | 平台请求 ID |
| `platform_response` | 原始响应 |
| `attempt_count` | 重试次数 |
| `next_retry_at` | 退避 |
| `last_error_code` / `last_error_message` | 错误分类 |

建议唯一：`(organization_id, action_type, idempotency_key)`。

## 10. 优先级

| 优先级 | 项 | 原因 |
|---|---|---|
| P0 | 按 `order_item_id` 单位落行 + `inventory_reservations` + `inventory_movements` | 防超卖/少扣，核心正确性 |
| P0 | `shipments` / `shipment_items` / `tracking_events` | 履约与异常物流 |
| P1 | `reverse_orders` / `reverse_order_items` / `refunds` | 售后与库存回补 |
| P1 | `order_status_events` | 状态审计/SLA |
| P1 | 结算余额/费用拆分/账户流水 | 财务对账 |
| P2 | 广告、促销、IM、评价 | 运营增值 |
| P2 | `listing_inventory_snapshots` | 平台库存对账 |

## 11. 不建议的做法

- 不要把 Lazada 原始状态塞进 `orders.status`；保留在 `platform_status`。
- 不要把同一 SKU 的多条 `order_item_id` 合并后丢失 unit 粒度；`items_count` 仅作校验。
- 不要只存 `listings.stock_on_hand` 而丢弃多仓/渠道库存。
- 不要把售后金额直接当主币种金额（cent/VN 例外）。
- 不要用 `external_id_mappings` 替代订单/包裹/逆向单的专用表。
- 不要在 `pending_actions` 里存不可查询的整段 JSON 作为唯一状态。

## 12. 参考

- `packages/db/src/commerce-schema.ts`
- `docs/design/platform-apis/lazada/lazada-order-status-erp-mapping.md`
- `docs/design/platform-apis/lazada/lazada-daraz-unified-design.md`
- `docs/design/platform-apis/daraz/daraz-erp-schema-coverage.md`
