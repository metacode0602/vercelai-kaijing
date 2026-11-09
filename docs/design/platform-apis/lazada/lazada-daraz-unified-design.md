# Daraz + Lazada 双平台统一接入设计

> 核验日期：2026-11-05。
> Daraz 依据：`docs/design/platform-apis/daraz/`。
> Lazada 依据：同目录 `lazada-*.md`。
> 本文是目标设计，不包含代码实现或迁移。

## 1. 设计目标

1. 同一套 ERP 表与领域服务承接 Daraz、Lazada，不为平台复制业务表。
2. 平台差异收敛在 **连接器适配层**，业务层只处理统一模型。
3. 所有写操作单一路径：待审/任务 → 适配器 → 平台 → 结果回写；禁止 UI 直连平台。
4. 库存、订单、售后、财务以 **幂等事件** 驱动，不依赖当前状态快照。
5. 平台原始字段完整保留，统一字段可追溯。
6. 未确认的平台语义显式标记，不猜测、不默认。

## 2. 分层

```text
UI / tRPC
  ↓
Domain Services（orders / inventory / fulfillment / after-sales / finance / ads）
  ↓
Marketplace Port（统一接口）
  ├─ Daraz Adapter
  └─ Lazada Adapter
  ↓
Platform API
```

`Marketplace Port` 只定义业务能力，不暴露平台字段名：

```text
listOrders(cursor, window) -> OrderSnapshot[]
listOrderItems(orderIds) -> OrderItemSnapshot[]
reserveableQuantity(sku) -> ...
pack(orderItems, provider) -> PackageResult[]
rts(packages) -> PackageResult[]
reverseOrders(cursor) -> ReverseSnapshot[]
settlements(window) -> SettlementSnapshot[]
```

## 3. 统一核心表

### 3.1 平台与店铺

```text
shops
  platform: 'daraz' | 'lazada'
  external_shop_id
  seller_id
  region / marketplace_country
  currency / timezone
  fulfillment_mode
```

- `shops.platform` 是唯一平台维度；业务表通过 `shop_id` 继承。
- 不建 `daraz_orders` / `lazada_orders`。
- 平台原始响应进 `raw`，统一字段进业务列。

### 3.2 商品与映射

```text
products
product_variants
listings                 (shop_id + external_item_id)
seller_sku_mappings      (shop_id + seller_sku + platform_sku_id)
platform_categories      (shop_id + external_id)
platform_brands          (shop_id + external_id)
```

统一键：

| 统一概念 | Daraz | Lazada |
|---|---|---|
| 平台商品 | `item_id` | `item_id` |
| 卖家 SKU | `SellerSku` / `seller_sku` | `SellerSku` |
| 平台 SKU | `sku_id` | `SkuId` / `sku_id` |
| 平台店铺 SKU | `ShopSku`（若有） | `ShopSku` |
| 类目 | `category_id` | `primary_category` |

约束：

- `(shop_id, external_item_id)` 唯一。
- `(shop_id, seller_sku)` 唯一。
- `platform_sku_id` 独立保存，不并入 seller_sku。
- 类目/品牌按店铺缓存，不跨站复用。

### 3.3 订单

```text
orders
  shop_id, external_order_id
  status, platform_status, fulfillment_status
  placed_at, paid_at
  currency, total_amount, payment_method
  raw

order_lines
  order_id, external_line_id   -- order_item_id
  sku, seller_sku, platform_sku_id
  qty                          -- 单位行固定 1；聚合行 = count(order_item_id)
  unit_price, tax_amount, discount_amount, shipping_amount
  fulfillment_status, package_id, tracking_number
  raw
  unique(order_id, external_line_id)
```

统一 `orders.status`：

```text
created | paid | ready_to_ship | shipped | delivered
| cancelled | returned | lost | failed | unknown
```

`platform_status` 原样保存，不参与业务判断。

### 3.4 事件与库存

```text
order_status_events
shipments / shipment_items / tracking_events
inventory_reservations
inventory_movements
inventory_balances
listing_inventory_snapshots
```

库存动作统一：

| 动作 | 触发 | 效果 |
|---|---|---|
| `reserve` | 支付成功；COD 确认 | `reserved += qty` |
| `release` | 发货前取消/超时 | `reserved -= qty` |
| `ship` | RTS 成功/首次 `shipped` | `reserved -= qty`，`on_hand -= qty` |
| `return_hold` | 退货签收 | `qc_hold += qty` |
| `return_restock` | QC 可售 | `qc_hold -= qty`，`on_hand += qty` |
| `damage` | QC 报废 | `qc_hold -= qty`，`damaged += qty` |
| `write_off` | 丢失/损坏理赔 | 从对应余额核销 |

### 3.5 售后与财务

```text
reverse_orders / reverse_order_items / reverse_qc_records / refunds
settlements / settlement_lines
account_transactions
logistics_fee_details
```

### 3.6 广告与促销

```text
ad_campaigns / ad_adgroups / ad_keywords / ad_daily_metrics
promotions / promotion_rules / promotion_items
im_sessions / im_messages
product_reviews / review_replies
```

广告表带 `platform`/`shop_id`，Daraz 无官方广告 API 时允许手工/第三方数据，`source` 标记来源。

## 4. 状态统一映射

| 统一状态 | Daraz | Lazada |
|---|---|---|
| `created` | `unpaid` | `unpaid` |
| `paid` | `pending`（需 `payment_time` 验证） | `pending`（预付费有 `payment_time`；COD 例外） |
| `ready_to_ship` | `topack` / `toship` / `ready_to_ship` | `topack` / `toship` / `ready_to_ship` |
| `shipped` | `shipped` | `shipped` / `shipping` |
| `delivered` | `delivered` | `delivered` |
| `cancelled` | `canceled` | `canceled` |
| `returned` | `returned` | `returned` |
| `lost` | 无独立枚举，按 `lost_by_3pl`/售后判断 | `lost` / `lost_by_3pl` |
| `failed` | `failed` | `failed` |
| `unknown` | 其他 | 其他 |

订单项级状态单独存 `order_lines.fulfillment_status`，不要把订单头状态复制到每一行。

## 5. 库存节点统一

推荐节点（两平台一致）：

| 节点 | 时机 | 动作 |
|---|---|---|
| 锁库 | 支付成功；COD 订单确认 | `reserve` |
| 扣减 | RTS 成功或首次 `shipped` | `ship` |
| 释放 | 发货前取消/超时 | `release` |
| 回补 | 退货签收 + QC 可售 | `return_restock` |
| 报废 | QC 不合格 | `damage` |
| 核销 | 丢失/损坏 | `write_off` |

不推荐：

- 下单即扣 `on_hand`；
- 支付即扣 `on_hand`；
- 退款即回补；
- 用订单头状态直接驱动扣减。

### 5.1 数量口径（P0）

Daraz 与 Lazada 都按**每个商品单位返回一条订单项记录**：

- 同一 SKU 购买 N 件 → N 条记录；
- N 条记录 SKU 相同、`order_item_id` 不同；
- 单条记录 = 1 件；
- 数量 = 去重 `order_item_id` 计数；
- `items_count` 可作校验，但不能替代明细计数。

统一模型：

| 方案 | `order_lines` | 数量 | 代价 |
|---|---|---|---|
| 单位行（推荐） | 每个 `order_item_id` 一行 | `qty=1` | 行数多，但粒度完整 |
| 聚合行 | 每个 SKU 一行 | `qty=count(order_item_id)` | 必须另存 unit 映射表 |

规则：

1. 单位行是默认方案，退款/售后/包裹都按 `order_item_id` 对齐；
2. 若聚合，库存动作仍以 `order_item_id` 为幂等键；
3. `COUNT(DISTINCT order_item_id)` 是数量唯一事实来源；
4. 不得把聚合行整体重复扣减；
5. 不再使用 `quantity_source='missing'` / `needs_quantity`。

## 6. 履约统一

### 6.1 包裹模型

两平台都有 `package_id` + `tracking_number` + provider，统一落 `shipments`。

| 动作 | Daraz | Lazada |
|---|---|---|
| 查物流商 | `/order/shipment/providers/get` | `/order/shipment/providers/get` |
| 打包 | `/order/fulfill/pack` | `/order/fulfill/pack` |
| RTS | `/order/package/rts` | `/order/package/rts` |
| 面单 | `/order/package/document/get` | `/order/package/document/get` |
| 轨迹 | `/logistic/order/trace` | `/logistic/order/trace` |

适配器统一返回：

```text
PackageResult {
  packageId, trackingNumber, providerCode,
  success, errorCode, errorMessage, retryable
}
```

批量接口必须逐项检查 `item_err_code`，不能只看批次 `success`。

### 6.2 模式差异

| 模式 | Daraz | Lazada |
|---|---|---|
| 卖家自履约 | Pack/RTS | Pack/RTS，DBS/SOF |
| 平台仓 | 支持 | FBL |
| 第三方仓直连 | 有限 | EPIS / Lazada Logistics |
| 数字商品 | 少见 | `/order/digital/delivered` |

统一表不建平台专属列；EPIS/DBS 差异放 `shipments.raw` + `provider_type`。

## 7. 售后统一

两平台都应按“逆向单头 + 行”建模：

```text
reverse_orders
reverse_order_items
reverse_qc_records
refunds
return_shipments
```

统一状态：

```text
initiated | seller_approved | seller_rejected | in_return
| received | qc_passed | qc_failed | refunded | closed | disputed
```

映射：

| 统一 | Daraz | Lazada |
|---|---|---|
| initiated | 售后发起 | `REQUEST_INITIATE` |
| seller_rejected | 卖家拒绝 | `REQUEST_REJECT` |
| cancelled | 售后取消 | `REQUEST_CANCEL` / `CANCEL_SUCCESS` |
| received | 退货签收 | 退货物流/`confirmDelivery` |
| qc_passed | QC 可售 | `return_to_merchant` / `return_to_warehouse` |
| qc_failed | QC 报废/异常 | `scrap` / `not_returned` |
| refunded | 退款完成 | 退款完成 |

金额：

- Lazada 售后 `refund_amount` / `item_unit_price` 是 **cent，越南除外**。
- Daraz 售后金额单位需按实际接口验证。
- 统一存 `amount` + `currency` + `amount_unit`，禁止共用订单金额解析函数。

## 8. 财务统一

| 统一概念 | Daraz | Lazada |
|---|---|---|
| 结算单 | settlement | `statement_number` |
| 账户流水 | 提现/充值 | `QueryAccountTransactions` |
| 订单费用明细 | settlement line | `QueryTransactionDetails` |
| 物流费 | 结算行 | `QueryLogisticsFeeDetail` |

统一注意：

- 日期格式逐接口不同，解析器按接口注册。
- Lazada 物流费时间返回 Java 时间对象，不是 ISO。
- 结算单是汇总，不能与明细直接相加去重。
- `amount_unit` 必须落库。
- 对账差异进独立表，不回写平台原值。

## 9. 广告与促销

### 9.1 广告

| 平台 | 能力 | 方案 |
|---|---|---|
| Daraz | 官方 Open API 无 Advertising 分类 | 手工导入/第三方/预留，`source` 标记 |
| Lazada | Sponsored Solutions 38 接口 | 接入 campaign/adgroup/keyword/report/wallet/SMAX |

统一表只要求：

```text
ad_campaigns(shop_id, platform, external_campaign_id, name, status, budget, ...)
ad_daily_metrics(shop_id, platform, campaign_id, adgroup_id, date, spend, ...)
```

不要为 Daraz 伪造不存在的广告 API。

### 9.2 促销

统一 `promotions` + `promotion_rules`：

```text
promotions: shop_id, platform, type, name, start_at, end_at, status
promotion_rules: promotion_id, rule_type, threshold, discount, raw
promotion_items: promotion_id, item_id, sku_id, promo_price, quota
```

平台差异：

- Lazada Voucher 范围是 `ENTIRE_SHOP`，Flexicombo 是 `ENTIRE_STORE`。
- Lazada 闪购/Early Bird 有独立活动库存。
- Daraz 促销字段按 Daraz 文档落 `raw`，统一字段只覆盖通用维度。

## 10. 同步与写入

### 10.1 读

```text
订单：update_after 增量 + 时间窗兜底
商品：update_after 增量 + 全量对账
库存：options=1 / 多仓字段，落快照
售后：ModifiedTimeRange 增量
财务：按日窗口分段
广告：按日拉报表
```

- 所有列表数据库级分页。
- 游标存 `integration_states`，按店铺 + 资源。
- 回填与实时同步共用同一幂等写入。

### 10.2 写

```text
pending_actions
  action_type, payload, status
  idempotency_key
  attempt_count, next_retry_at
  platform_request_id, platform_response
```

流程：

```text
人工/规则 → pending_action(pending)
  → 审批 → executing
  → adapter 调用平台
  → success / failed(可重试) / failed(人工)
  → 回写平台 ID 与原始响应
```

禁止：

- UI 直接调用平台；
- 两套写路径（OpenAPI + MCP 各写一套）；
- 无幂等键重试 Pack/RTS/退款。

## 11. 平台差异清单

| 维度 | Daraz | Lazada | 统一处理 |
|---|---|---|---|
| Auth | OAuth token | OAuth token；`auth.lazada.com/rest` | 统一凭据表，适配器处理 |
| 站点 host | 各国 host | 各国 host + `api.lazada.com` | 店铺配置 |
| 状态 | 较少 | 更多（`shipping`/`lost`/`topack`） | 保留原值 + 统一映射 |
| 件数 | 每单位一条记录 | 每 Unit/Line Item 一条记录 | 去重 `order_item_id` 计数，单条 = 1 件 |
| 商品写入 | JSON/字段 | XML `payload` / JSON 示例 | 适配器构造 |
| 多仓库存 | 有 | `multiWarehouseInventories` | 快照表 |
| 履约 | Pack/RTS | Pack/RTS + DBS/EPIS/FBL | `shipments` 统一 |
| 售后 | 逆向单 | 逆向单 + QC | 统一逆向表 |
| 金额单位 | 需验证 | 售后 cent，VN 例外 | `amount_unit` |
| 广告 | 无官方 API | 38 接口 | `source` 区分 |
| 促销 | 有 | 多类型 | 通用表 + `raw` |

## 12. 实施阶段

### Phase 0：口径确认

- 用真实多件订单验证：同一 SKU 是否返回多条不同 `order_item_id`。
- 确认两平台 `pending` 的支付语义。
- 确认 RTS/`shipped` 的实际状态跳转。
- 确认退货 QC 与回补规则。

### Phase 1：只读同步

- 店铺授权、商品、订单、订单项、库存快照、售后列表。
- 落事件表与原始响应。
- 不自动改库存。

### Phase 2：库存闭环

- `inventory_reservations` + `inventory_movements`。
- 支付锁库、RTS 扣减、取消释放。
- `order_item_id` 缺失/重复进人工队列。

### Phase 3：履约写入

- Pack / RTS / 面单 / 轨迹。
- 幂等与重试。
- 异常包裹告警。

### Phase 4：售后与财务

- 逆向单、QC、退款、回补。
- 结算单、流水、物流费对账。

### Phase 5：广告与促销

- Lazada Sponsored Solutions。
- Daraz 广告外部数据。
- 促销活动与商品。

## 13. 验收指标

| 指标 | 目标 |
|---|---|
| 订单增量延迟 | < 5 分钟 |
| 状态事件重复率 | 0（幂等键去重） |
| 库存扣减重复 | 0 |
| 订单项单位计数准确率 | 100%，与 `items_count` 差异可解释 |
| RTS 成功率 | 按平台错误码分类 |
| 售后回补准确率 | 100% 关联 QC |
| 对账差异 | 全部有归属与处理状态 |
| 未知平台状态 | 0 丢失，全部进 `unknown` 队列 |

## 14. 参考

- `docs/design/platform-apis/daraz/`
- `docs/design/platform-apis/lazada/lazada-products-api.md`
- `docs/design/platform-apis/lazada/lazada-orders-api.md`
- `docs/design/platform-apis/lazada/lazada-logistics-api.md`
- `docs/design/platform-apis/lazada/lazada-aftersales-api.md`
- `docs/design/platform-apis/lazada/lazada-finance-api.md`
- `docs/design/platform-apis/lazada/lazada-advertising-api.md`
- `docs/design/platform-apis/lazada/lazada-order-status-erp-mapping.md`
- `docs/design/platform-apis/lazada/lazada-erp-schema-coverage.md`
