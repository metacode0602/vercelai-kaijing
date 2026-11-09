# Daraz 数据域 vs ERP Schema 覆盖评估

> 核验日期：2026-11-05。
> 评估对象：`packages/db/src/commerce-schema.ts`（当前 schema）。
> 对照来源：Daraz 官方 API Reference（Product / Order / Logistics / Fulfillment / Return and Refund / Finance）。
> 官方入口：<https://open.daraz.com/doc/api.htm>
>
> **结论：现有 schema 不能覆盖 Daraz 全量业务字段。**
> 能覆盖“主键、基础状态、基础金额、SKU 映射、库存余额、结算单汇总”；
> 不能覆盖“订单行金额拆分、包裹与轨迹、售后全流程、结算明细、广告、库存台账与预留”。

## 1. 总览

| 域 | 覆盖度 | 判断 | 主要问题 |
|---|---|---|---|
| 商品 / Listing | 部分 | 可存主数据，不可存完整平台状态与库存快照 | 缺 QC/审核轨迹、图片资产、平台库存分解、类目属性版本 |
| 订单 | 部分 | 可存订单头与订单行标识，金额与地址不足 | 订单行缺实付/税/优惠/状态；地址与 PII 无独立表 |
| 物流 / 履约 | 不足 | 只有订单头上的单个 package/tracking | 缺 shipments、packages、tracking_events、面单、EPIS |
| 售后 / 退款 | 缺失 | 无逆向单、退货、退款表 | 无法存 `reverse_order_*`、`refund_amount`、QC 决策 |
| 结算 / 财务 | 部分 | 有结算单与费用行骨架 | 缺 statement 金额拆分、payout 状态、交易明细字段、对账键 |
| 广告 | 缺失 | 无广告表 | 官方也无广告 API，需要手工导入模型 |
| 库存 | 部分 | 有余额表 | 缺预留、流水、平台库存快照、退货在途 |
| 集成 / 审计 | 较好 | 有凭证、游标、日志、待审、审计 | 需补域级游标与幂等记录 |

## 2. 商品 / Listing

### 2.1 已有

| 表 | 可覆盖字段 |
|---|---|
| `shops` | 平台、店铺 ID、seller ID、区域、币种、时区、履约模式 |
| `products` | 内部 SPU、标题、品牌、图片、尺寸重量、扩展 payload |
| `productVariants` | 内部 SKU、条码、尺寸重量、属性 |
| `listings` | 平台商品 ID、类目、品牌、价格、库存、仓库、发布状态、属性、原始 payload |
| `sellerSkuMappings` | `item_id`、`platform_sku_id`、`seller_sku`、状态、同步时间 |
| `platformBrands` / `platformCategories` | 平台品牌/类目缓存 |
| `pendingActions` | 商品创建/更新的待审队列 |

### 2.2 缺口

| Daraz 字段 / 能力 | 现状 | 影响 | 建议 |
|---|---|---|---|
| 商品 `status` / `subStatus` | `listings.status` 是内部状态；无独立平台原值 | 无法区分 `Active` / `Pending QC` / `Suspended` / `Lock` / `Reject` | 新增 `platform_status`、`platform_sub_status` |
| QC 状态 `PASS/REJECT/PENDING/APPROVING/LIVE_REJECT/LOCK` + reason | 无 | 无法跟踪审核失败与原因 | 新增 `listing_qc_statuses` 或 `listing_status_events` |
| `ReservedStock` / `RtsStock` / `PendingStock` / `RealTimeStock` / `FulfillmentBySellable` | 只有 `stockOnHand` | 无法校验平台锁定量与可售量 | 新增 `listing_stock_snapshots`（按 shop/item/sku 时间序列） |
| 商品图片 `images` / SKU `Images` | `products.images`、`listings.payload` | 无独立图片资产、无 hash/顺序/审核状态 | 新增 `listing_images` |
| 类目属性 schema 版本 | `listings.attributes` 只存值 | 无法复现提交时的必填规则 | 新增 `platform_category_attributes` + 版本 |
| 变体定义 `variation1..4` | 只存 `attrs` | 无法还原平台变体结构 | 存 `listings.payload` + 新增 `listing_variations` |
| 价格 `price` / `special_price` / 特价时间 | 只有 `priceAmount` | 无法区分原价/特价/活动价 | 新增 `special_price`、`special_from`、`special_to` |
| 多仓库存 `multiWarehouseInventories` | 只有单 `warehouseCode` | 多仓卖家无法对账 | 新增 `listing_warehouse_stock` |

## 3. 订单

### 3.1 已有

| 表 | 可覆盖字段 |
|---|---|
| `orders` | 平台订单 ID、内部/平台状态、下单/支付时间、币种、总额、支付方式、物流商、追踪号、包裹 ID、原始响应 |
| `orderLines` | 平台订单项 ID、SKU、SellerSku、平台 SKU、标题、数量、单价、履约状态、包裹、追踪号、物流商 |
| `mappingExceptions` | 无法映射的订单/SKU 异常 |

### 3.2 缺口

| Daraz 字段 | 现状 | 影响 | 建议 |
|---|---|---|---|
| `order_number` | 无 | 客诉/对账只能拿内部 ID | `orders` 新增 `order_number` |
| `statuses[]` | `platformStatus` 单值 | 多订单项状态被压扁 | 保留数组原值到 `raw`；状态以 `order_lines` 为准 |
| `payment_time` | 订单头只有 `paidAt` | 订单项级支付时间丢失 | `order_lines` 新增 `payment_time` |
| 订单头金额：`shipping_fee*`、`voucher*`、`cash_payment_fee` | 只有 `totalAmount` | 无法做费用拆分与利润核算 | `orders` 新增金额拆分列 |
| 地址 `address_shipping` / `address_billing` | 无独立表，`raw` 里有 | 无法索引、无法加密分级 | 新增 `order_addresses`（加密） |
| 买家姓名/电话/ID | 只有 `buyerRegion` | 客服、复购、风控缺失 | 新增加密列或 `order_buyers` |
| `gift_option` / `gift_message` / `buyer_note` / `remarks` | `raw` | 仓库作业需要 | 新增订单备注/礼品列 |
| `order_type` / `order_flag` / `semi_managed` / `mp3_order` | `raw` | 影响履约 SLA 与流程 | 新增订单属性列 |
| `promised_shipping_time` / `sla_time_stamp` / `fulfillment_sla` | 无 | 无法做超时预警 | 新增 SLA 列 |
| 订单项单位粒度 | `orderLines.qty` 有列，但平台按单位返回多条 `order_item_id` | 聚合后丢失退款/状态/包裹粒度 | 每个 `order_item_id` 落一行、`qty=1`；数量 = `COUNT(DISTINCT order_item_id)` |
| 订单项 `item_price` vs `paid_price` | 只有 `unitPrice` | 无法区分标价与实付 | 新增 `paid_price` |
| 订单项 `tax_amount` / `voucher_*` / `wallet_credits` | 无 | 无法对账 | 新增金额拆分列 |
| 订单项 `status` / `return_status` / `reason` | 只有 `fulfillmentStatus` | 平台状态被覆盖 | 新增 `platform_status`、`return_status`、`reason_code/text` |
| 订单项 `invoice_number` | 无 | 发票管理缺失 | 新增 `invoice_number` |
| 订单项 `order_flag` / `priority_fulfillment_tag` | 无 | 优先履约缺失 | 新增履约标签 |
| 订单项 `warehouse_code` / `delivery_option_sof` / `is_fbl` / `is_reroute` | 无 | 履约模式判断缺失 | 新增订单行属性 |

## 4. 物流 / 履约

### 4.1 已有

- `orders.packageId` / `trackingNumber` / `shippingProvider`
- `orderLines.packageId` / `trackingNumber` / `shippingProvider`
- `listings.warehouseCode` / `logisticsChannel`
- `oceanShipments` / `oceanShipmentLines`（头程海运，不是平台包裹）

### 4.2 缺口

| Daraz 能力 | 现状 | 影响 | 建议 |
|---|---|---|---|
| 一个订单多个包裹 | 订单头只能存一个 package | 拆包/部分发货会覆盖 | 新增 `shipments` + `shipment_items` |
| `package_id` / `tracking_number` / `shipment_provider` | 存在订单头/行，但无包裹实体 | 无法多包裹、无法记录状态 | 新增 `shipments` |
| 物流轨迹 `logistic_detail_info_list` | 无 | 无法做时效、异常、签收证明 | 新增 `tracking_events` |
| 面单/发票文件 | 无 | 无法留档 | 新增 `shipment_documents` |
| Pack/RTS 结果 `item_err_code` / `retry` | 无 | 失败无法重试与审计 | 新增 `fulfillment_attempts` |
| EPIS `packageCode` / `trackingNumber` / `routeCode` / ETA | 无 | 无法接 EPIS | 新增 `epis_packages` 或复用 `shipments` 扩展列 |
| EPIS 仓库 `warehouseCode` / `solutionCodes` | 无 | 无法管理 EPIS 仓库 | 新增 `logistics_warehouses` |
| 物流工单 Xspace | 无 | 异常件无跟踪 | 新增 `logistics_cases` |

## 5. 售后 / 退款

### 5.1 现状

**当前 schema 没有任何逆向单、退货、退款表。** 订单的 `return_status` 也没有落列。只能依赖 `raw`，无法查询与对账。

### 5.2 缺口与建议

| Daraz 字段 | 建议表 / 列 |
|---|---|
| `reverse_order_id` | `after_sales_cases.external_case_id` |
| `trade_order_id` | `after_sales_cases.order_id` |
| `request_type` | `after_sales_cases.case_type` |
| `shipping_type` | `after_sales_cases.return_method` |
| `is_rtm` | `after_sales_cases.return_to_merchant` |
| `reverse_order_line_id` | `after_sales_lines.external_line_id` |
| `trade_order_line_id` | `after_sales_lines.order_line_id` |
| `refund_amount` | `refunds.amount` + 原始单位列 |
| `reason_code` / `reason_text` | `after_sales_lines.reason_code` / `reason_text` |
| `whqc_decision` | `after_sales_lines.qc_decision` |
| `reverse_status` / `ofc_status` | `after_sales_lines.platform_status` / `fulfillment_status` |
| `tracking_number` | `return_shipments.tracking_number` |
| `is_dispute` / `is_need_refund` | `after_sales_lines` 布尔列 |
| 沟通历史 `data.list` | `after_sales_events` |
| 取消校验原因 `reason_options` | `after_sales_reason_options` 或缓存到 `raw` |

建议最小表集：

```text
after_sales_cases      逆向单头
after_sales_lines      逆向行（关联 order_lines）
after_sales_events     状态/沟通历史
refunds                退款（金额、币种、状态、支付引用）
return_shipments       退货物流
```

所有表强制 `organization_id`、`shop_id`；金额 `numeric(18,4)`；平台原值另存 `platform_status`。

## 6. 结算 / 财务

### 6.1 已有

| 表 | 可覆盖字段 |
|---|---|
| `settlements` | 平台结算单号、周期、币种、账单金额、状态、原始响应 |
| `settlementLines` | 结算单、订单、SKU、费用类型、金额、币种、备注 |
| `skuCosts` / `feeTemplates` | 成本与费用模板（内部测算） |
| `fxRates` | 汇率 |

### 6.2 缺口

| Daraz 字段 | 现状 | 影响 | 建议 |
|---|---|---|---|
| `statement_number` | `externalSettlementId` 可存 | 可覆盖 | 明确映射 |
| `opening_balance` / `closing_balance` | 无 | 无法核对余额滚动 | 新增两列 |
| `item_revenue` / `other_revenue_total` / `subtotal1` / `subtotal2` | 只有 `billAmount` | 无法勾稽 | 新增金额拆分列 |
| `refunds` / `fees_on_refunds_total` | 无 | 退款成本不可见 | 新增列 |
| `shipment_fee` / `shipment_fee_credit` | 无 | 运费不可对账 | 新增列 |
| `fees_total` / `guarantee_deposit` | 无 | 费用/保证金缺失 | 新增列 |
| `payout` / `paid` | 只有 `status` | 打款状态不精确 | 新增 `payout_amount`、`payout_status`、`paid_at` |
| `created_at` / `updated_at` | `createdAt` 本地时间 | 平台时间丢失 | 新增 `platform_created_at`、`platform_updated_at` |
| `transaction_number` | `settlementLines` 无外部唯一号 | 无法幂等 | 新增 `external_transaction_id` + 唯一索引 |
| `statement` | 可通过 settlementId 关联 | 可覆盖 | — |
| `fee_type` / `fee_name` / `transaction_type` | 只有 `feeKind` | 费用分类粒度不足 | 新增 `fee_type`、`fee_name` |
| `amount` / `VAT_in_amount` / `WHT_amount` / `WHT_included_in_amount` | 只有 `amount` | 税/预扣税不可对账 | 新增税额列 + 布尔列 |
| `order_no` / `orderItem_no` / `reference` | 只有 `orderId` | 订单行级对账缺失 | 新增 `external_order_no`、`order_line_id` |
| `paid_status` | 无 | 行级结算状态缺失 | 新增 `paid_status` |
| `payment_ref_id` | 无 | 银行流水对账缺失 | 新增 `payment_reference` |
| `seller_sku` / `lazada_sku` | 只有 `variantId` | 平台 SKU 丢失 | 新增 `seller_sku`、`platform_sku_id` |
| `shipping_provider` / `shipping_speed` / `shipment_type` | 无 | 物流成本分析缺失 | 新增列 |

## 7. 广告

### 7.1 现状

**无广告表；Daraz 官方 Open API 也无广告分类。**

### 7.2 建议

见 `daraz-advertising-api.md`。最小表集：

```text
ad_accounts
ad_campaigns
ad_groups
ad_keywords
ad_items
ad_daily_stats
ad_import_batches
```

字段要点：`organization_id`、`shop_id`、`campaign_id`、`ad_group_id`、`external_item_id`、`seller_sku`、`stat_date`、`impressions`、`clicks`、`spend`、`currency`、`orders`、`units`、`revenue`、`raw`。

## 8. 库存

### 8.1 已有

| 表 | 可覆盖 |
|---|---|
| `inventoryBalances` | `on_hand`、`reserved`、`qc_hold`、`damaged`、`in_transit`、`pending_inbound`、`customs_clearing`、`version` |
| `stockAlerts` | 阈值告警 |

### 8.2 缺口

| 能力 | 现状 | 影响 | 建议 |
|---|---|---|---|
| 预留明细 | 只有汇总 `reserved` | 不知道谁锁的、何时释放 | 新增 `inventory_reservations` |
| 库存流水 | 无 | 无法审计扣减/回补 | 新增 `inventory_movements` |
| 平台库存快照 | 无 | 无法与 Daraz 可售量对账 | 新增 `listing_stock_snapshots` |
| 退货在途/待检 | 只有 `pendingInbound` | 无法区分采购在途与退货在途 | 新增 `return_in_transit` 或独立退货入库单 |
| 订单状态事件 | 无 | 无法复现锁/放/扣时点 | 新增 `order_status_events` |

## 9. 集成与审计

### 9.1 已有

- `integrationCredentials`：加密凭证
- `integrationStates`：订单/库存/商品/Listing 游标
- `integrationLogs`：请求日志（`request_id`、方向、状态）
- `pendingActions`：待审写操作 + 幂等键
- `auditEvents`：审计事件

### 9.2 建议补充

| 缺口 | 建议 |
|---|---|
| 售后/物流/财务独立游标 | `integrationStates` 增加 `after_sales_cursor`、`logistics_cursor`、`finance_cursor` |
| 同步批次与错误行 | 新增 `integration_batches`、`integration_errors` |
| 平台限流与重试记录 | 在 `integrationLogs` 增加 `attempt`、`next_retry_at`、`http_status` |
| 幂等结果 | 新增 `idempotency_keys`（scope、key、result、expires_at） |

## 10. 建议的最小补充表清单

按优先级：

1. `order_status_events` + `inventory_movements` + `inventory_reservations`（解决锁/放/扣可审计）
2. `shipments` + `shipment_items` + `tracking_events` + `shipment_documents`（解决多包裹与轨迹）
3. `after_sales_cases` + `after_sales_lines` + `refunds` + `return_shipments` + `after_sales_events`（解决售后）
4. `order_addresses`（加密 PII）+ 订单金额拆分列 + 订单行实付/税/优惠列
5. `settlements` / `settlement_lines` 金额与交易明细列
6. `listing_stock_snapshots` + `listing_qc_statuses` + `listing_images`
7. 广告 6 张表（手工导入）

## 11. 实施约束

- 不手改 `packages/db/drizzle/`；schema 变更走 `pnpm --filter @workspace/db db:generate`。
- 新表必须含 `organization_id`；跨租户查询默认拒绝。
- 金额统一 `numeric(18,4)`（现有订单/结算表已是 18,4；与 AGENTS 的 15,4 规范存在差异，新增表应遵循现有域内一致性并单独说明）。
- 枚举用 `varchar` + TS union；平台原值不要转成内部枚举后丢失。
- 外部平台 ID 不直接做业务外键；通过映射表关联。
- PII 单独加密列/表，访问审计，设置保留期限。
- 所有同步写操作使用幂等键；所有平台写操作进入 `pending_actions` 或审计。

## 12. 最终判断

| 问题 | 答案 |
|---|---|
| 现有官方文档能否确定订单状态→ERP 锁/放/扣节点？ | **不能唯一确定。** 只有状态枚举，没有迁移规则和库存语义；需要按本文建议设计并用真实订单验证。 |
| 现有 ERP schema 能否覆盖商品、订单、物流、售后、结算、广告字段？ | **不能。** 商品/订单/结算为部分覆盖；物流、售后、广告缺失；库存缺台账。 |
| 是否可以直接上线 Daraz 全量同步？ | **不建议。** 至少先补订单事件、包裹轨迹、售后、结算明细和库存台账，否则无法对账与审计。 |

## 13. 官方来源

- Product：<https://open.daraz.com/handler/share/apidoc/getApiCategory.json?cid=1>
- Order：<https://open.daraz.com/handler/share/apidoc/getApiCategory.json?cid=2>
- Finance：<https://open.daraz.com/handler/share/apidoc/getApiCategory.json?cid=4>
- Logistics：<https://open.daraz.com/handler/share/apidoc/getApiCategory.json?cid=18>
- Fulfillment：<https://open.daraz.com/handler/share/apidoc/getApiCategory.json?cid=22>
- Return and Refund：<https://open.daraz.com/handler/share/apidoc/getApiCategory.json?cid=23>
- 现有 schema：`packages/db/src/commerce-schema.ts`
