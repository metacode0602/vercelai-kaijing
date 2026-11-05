# Daraz 订单（Order）API 字段说明与使用方法

> 核验日期：2026-11-05。来源：Daraz 官方 API Reference（Order 分类 `cid=2`）。
> 官方入口：<https://open.daraz.com/doc/api.htm>
>
> 官方响应参数表不逐项声明 required，本文响应字段统一标为“官方未标”。
> 物流详情、轨迹、面单见 `daraz-logistics-api.md`。

## 1. 接口清单

| 接口 | 方法 | 路径 | 用途 | 集成标记 |
|---|---|---|---|---|
| GetOrders | GET | `/orders/get` | 按时间窗/状态分页查询订单 | 系统同步 |
| GetOrder | GET/POST | `/order/get` | 查询单个订单及地址、金额、状态 | 系统同步 |
| GetOrderItems | GET | `/order/items/get` | 查询订单内全部商品实例（每单位一条） | 系统同步 |
| GetMultipleOrderItems | GET | `/orders/items/get` | 批量查询多个订单的订单项 | 系统同步 |
| GetDocument | GET | `/order/document/get` | 获取发票/面单/承运商清单 | 系统动作/按需下载 |
| GetOrderLogisticDetail | GET/POST | `/order/logistic/get` | 查询物流详情（RTS 后可用） | 系统同步 |
| GetOrderTrace | GET/POST | `/logistic/order/trace` | 查询物流轨迹（RTS 后可用） | 系统同步 |
| SetInvoiceNumber | POST | `/order/invoice_number/set` | 设置订单发票号 | 系统动作/需校验 |

## 2. 订单状态

### 2.1 `GetOrders.status` 支持值

| 值 | 含义 | 中文解释 |
|---|---|---|
| unpaid | 未支付 | 订单已创建但尚未完成支付 |
| pending | 待处理 | 已支付/待卖家处理（以平台实际流转为准） |
| topack | 待打包 | 白名单卖家可见；可进入打包 |
| toship | 待发货 | 白名单卖家可见；已打包待 RTS |
| ready_to_ship | 待发货/RTS | 已打包并标记可发货 |
| shipped | 已发货 | 已交由物流商 |
| delivered | 已送达 | 买家已签收/妥投 |
| canceled | 已取消 | 订单取消（注意官方拼写为单 L） |
| returned | 已退货 | 发生退货/逆向完成 |
| failed | 失败 | 履约失败/配送失败等 |
| all | 全部 | 仅查询过滤，不是订单状态 |

> 官方原文：`Possible values are unpaid, pending, canceled, ready_to_ship, delivered, returned, shipped and failed. New Possible values are topack and toship for white list seller.`
>
> 注意：订单头 `status` / `statuses[]` 与订单项 `status` 的取值集合可能不同；不要假设所有订单项状态都等于订单头状态。

### 2.2 订单项状态相关字段

| 字段 | 含义 | 说明 |
|---|---|---|
| `status` | 订单项状态 | 以 `GetOrderItems.status` 实际值为准 |
| `return_status` | 退货状态 | 售后状态单独跟踪 |
| `cancel_return_initiator` | 取消/退货发起方 | `cancellation-internal`、`cancellation-customer`、`cancellation-failed Delivery`、`cancellation-seller`、`return-customer`、`refund-internal` |
| `reason` | 取消/退货原因 | 定义于 `sales_order_reason` |
| `stage_pay_status` | 预售支付状态 | `null`、`unpaid`、`unpaid final payment` |

## 3. GetOrders — `GET /orders/get`

### 3.1 请求参数

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| update_before | String | 否 | 更新时间上界 | ISO 8601 |
| update_after | String | 条件必填 | 更新时间下界 | 与 `created_after` 至少提供一个 |
| created_before | String | 否 | 创建时间上界 | ISO 8601 |
| created_after | String | 条件必填 | 创建时间下界 | 与 `update_after` 至少提供一个 |
| status | String | 否 | 订单状态过滤 | 见 2.1 |
| sort_by | String | 否 | 排序字段 | `created_at` / `updated_at` |
| sort_direction | String | 否 | 排序方向 | `ASC` / `DESC` |
| offset | Number | 否 | 跳过条数 | 从 0 开始 |
| limt | Number | 否 | 返回条数 | 官方拼写为 `limt`，最大 100 |
| mp3_Order | Number | 否 | MP3 订单筛选 | `1` MP3 订单，`2` 非 MP3 订单 |

### 3.2 响应字段

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| data.countTotal | Number | 官方未标 | 总记录数 | 当前过滤条件下全部订单数 |
| data.count | Number | 官方未标 | 本页数量 | 含 offset/limit 影响 |
| data.orders | Object[] | 官方未标 | 订单列表 | 字段见下 |
| data.orders.order_id | String | 官方未标 | 订单 ID | Seller Center 分配 |
| data.orders.order_number | String | 官方未标 | 人类可读订单号 | |
| data.orders.statuses | String[] | 官方未标 | 订单项唯一状态集合 | 不等于订单头状态 |
| data.orders.items_count | Number | 官方未标 | 商品实例/件数 | 应与去重 `order_item_id` 数一致 |
| data.orders.price | String | 官方未标 | 订单总金额 | 字符串金额；官方字段表未列出币种 |
| data.orders.created_at | String | 官方未标 | 下单时间 | ISO 8601 |
| data.orders.updated_at | String | 官方未标 | 更新时间 | ISO 8601 |
| data.orders.payment_method | String | 官方未标 | 支付方式 | |
| data.orders.remarks | String | 官方未标 | 备注 | |
| data.orders.buyer_note | String | 官方未标 | 买家备注 | |
| data.orders.gift_option | String | 官方未标 | 是否礼品 | 示例为 `0`/`1` 或 `false` |
| data.orders.gift_message | String | 官方未标 | 礼品留言 | |
| data.orders.voucher | String | 官方未标 | 优惠总额 | |
| data.orders.voucher_code | String | 官方未标 | 优惠券代码 | |
| data.orders.voucher_platform | String | 官方未标 | 平台优惠额 | |
| data.orders.voucher_seller | String | 官方未标 | 卖家优惠额 | |
| data.orders.shipping_fee | String | 官方未标 | 运费 | |
| data.orders.shipping_fee_original | String | 官方未标 | 原始运费 | 优惠前 |
| data.orders.shipping_fee_discount_seller | String | 官方未标 | 卖家承担运费折扣 | |
| data.orders.shipping_fee_discount_platform | String | 官方未标 | 平台承担运费折扣 | |
| data.orders.cash_payment_fee | String | 官方未标 | 现金支付手续费 | |
| data.orders.promised_shipping_times | String | 官方未标 | 承诺发货时间 | |
| data.orders.address_updated_at | String | 官方未标 | 地址更新时间 | 可为空 |
| data.orders.delivery_info | String | 官方未标 | 配送信息 | 可为空 |
| data.orders.warehouse_code | String | 官方未标 | 仓库代码 | 多仓卖家 |
| data.orders.customer_first_name | String | 官方未标 | 买家名 | PII |
| data.orders.customer_last_name | String | 官方未标 | 买家姓 | PII；官方注明目前可能为空 |
| data.orders.address_shipping | Object | 官方未标 | 收货地址 | 子字段见下 |
| data.orders.address_billing | Object | 官方未标 | 账单地址 | 子字段见下 |
| data.orders.branch_number | String | 官方未标 | 税务分支代码 | 仅泰国 |
| data.orders.tax_code | String | 官方未标 | VAT 税号 | 仅泰国/越南 |
| data.orders.national_registration_number1 | String | 官方未标 | 国家注册号 | 部分国家需要 |
| data.orders.extra_attributes | String | 官方未标 | 扩展属性 | JSON 字符串或 null |

#### 地址对象字段（`address_shipping` / `address_billing`）

| 字段名 | 类型 | 含义 | 说明 |
|---|---|---|---|
| first_name | String | 名 | PII |
| last_name | String | 姓 | PII |
| phone | String | 电话 | PII |
| phone2 | String | 备用电话 | PII |
| address1 | String | 详细地址 | PII |
| address2 | String | 地址行 2 | 官方注明当前未使用 |
| address3 | String | 州/省 | |
| address4 | String | 城市 | 官方字段树存在 `address4address4` 拼写异常 |
| address5 | String | 三级地址 | |
| city | String | 城市 | |
| post_code | String | 邮编 | 部分站点不使用 |
| country | String | 国家 | |

### 3.3 使用方法

```text
首次全量：created_after=2026-01-01&created_before=2026-01-31&limt=100&offset=0...
增量：update_after=<上次成功水位>&limt=100&sort_by=updated_at&sort_direction=ASC
```

- 官方参数名是 `limt`，不是 `limit`。
- 单页最大 100；用 `countTotal` 判断是否还有下一页。
- 按 `order_id` 幂等 upsert；不要用 `order_number` 作为唯一键。
- 订单头金额字段为 String，落库前转 `numeric(18,4)`，保留原始字符串到 `raw`。

## 4. GetOrder — `GET/POST /order/get`

### 4.1 请求参数

| 字段名 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| order_id | Number | 是 | Seller Center 订单 ID |

### 4.2 响应字段

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| data.order_id | Number | 官方未标 | 订单 ID | |
| data.order_number | Number | 官方未标 | 订单号 | |
| data.statuses | String[] | 官方未标 | 订单项状态集合 | |
| data.items_count | Number | 官方未标 | 商品实例/件数 | |
| data.price | String | 官方未标 | 订单总金额 | |
| data.created_at | String | 官方未标 | 下单时间 | |
| data.updated_at | String | 官方未标 | 更新时间 | |
| data.payment_method | String | 官方未标 | 支付方式 | |
| data.remarks | String | 官方未标 | 备注 | |
| data.buyer_note | String | 官方未标 | 买家备注 | |
| data.gift_option | Boolean | 官方未标 | 是否礼品 | 官方类型 Boolean |
| data.gift_message | String | 官方未标 | 礼品留言 | |
| data.voucher | String | 官方未标 | 优惠金额 | |
| data.voucher_code | String | 官方未标 | 优惠券代码 | |
| data.shipping_fee | String | 官方未标 | 运费 | |
| data.shipping_fee_original | String | 官方未标 | 原始运费 | |
| data.shipping_fee_discount_seller | String | 官方未标 | 卖家运费折扣 | |
| data.shipping_fee_discount_platform | String | 官方未标 | 平台运费折扣 | |
| data.cash_payment_fee | String | 官方未标 | 现金支付手续费 | |
| data.promised_shipping_times | String | 官方未标 | 承诺发货时间 | |
| data.delivery_info | String | 官方未标 | 配送信息 | |
| data.warehouse_code | String | 官方未标 | 仓库代码 | |
| data.customer_first_name | String | 官方未标 | 买家名 | PII |
| data.customer_last_name | String | 官方未标 | 买家姓 | PII |
| data.address_shipping | Object | 官方未标 | 收货地址 | 字段同 3.2 |
| data.address_billing | Object | 官方未标 | 账单地址 | 字段同 3.2 |
| data.branch_number | String | 官方未标 | 税务分支代码 | 仅泰国 |
| data.tax_code | String | 官方未标 | VAT 税号 | 仅泰国/越南 |
| data.national_registration_number | String | 官方未标 | 国家注册号 | |
| data.extra_attributes | String | 官方未标 | 扩展属性 | |

> `GetOrder` 响应中没有 `currency`、`order_type`、`order_flag` 等字段时，需从订单项接口补齐。

## 5. GetOrderItems — `GET /order/items/get`

### 5.1 请求参数

| 字段名 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| order_id | Number | 是 | 订单 ID |

### 5.2 响应字段（`data[]`）

响应 `data` 是订单项对象数组。**每个最小对象代表一个独立商品单位（Unit/Line Item）**；同一 SKU 购买多件时，会返回多条相同 SKU、不同 `order_item_id` 的记录。

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| order_item_id | Number | 官方未标 | 商品实例 ID | 平台子订单标识；同一 SKU 多件时每条不同 |
| order_id | String | 官方未标 | 订单 ID | |
| sku | String | 官方未标 | 商品 SKU | |
| sku_id | String | 官方未标 | 平台 SKU ID | |
| shop_sku | String | 官方未标 | 店铺 SKU | |
| product_id | String | 官方未标 | 商品 ID | |
| name | String | 官方未标 | 商品名称 | |
| variation | String | 官方未标 | 变体描述 | |
| product_main_image | String | 官方未标 | 主图 URL | |
| product_detail_url | String | 官方未标 | 商品详情 URL | |
| status | String | 官方未标 | 订单项状态 | |
| return_status | String | 官方未标 | 退货状态 | |
| reason | String | 官方未标 | 取消/退货原因 | |
| reason_detail | String | 官方未标 | 原因详情 | |
| cancel_return_initiator | String | 官方未标 | 取消/退货发起方 | 见 2.2 |
| item_price | String | 官方未标 | 商品价格 | |
| paid_price | String | 官方未标 | 实付价格 | |
| tax_amount | String | 官方未标 | 税额 | |
| shipping_amount | String | 官方未标 | 运费金额 | |
| shipping_service_cost | Number | 官方未标 | 配送服务成本 | |
| shipping_fee_original | String | 官方未标 | 原始运费 | |
| shipping_fee_discount_seller | String | 官方未标 | 卖家运费折扣 | |
| shipping_fee_discount_platform | String | 官方未标 | 平台运费折扣 | |
| currency | String | 官方未标 | 币种 | ISO 4217 |
| voucher_amount | String | 官方未标 | 优惠金额 | |
| voucher_code | String | 官方未标 | 优惠券代码 | 官方注明未使用 |
| voucher_code_seller | String | 官方未标 | 卖家券代码 | |
| voucher_code_platform | String | 官方未标 | 平台券代码 | |
| voucher_seller | String | 官方未标 | 卖家优惠 | |
| voucher_platform | String | 官方未标 | 平台优惠 | |
| voucher_seller_lpi | String | 官方未标 | 卖家赞助 Lazada Bonus | |
| voucher_platform_lpi | String | 官方未标 | 平台赞助 Lazada Bonus | |
| wallet_credits | String | 官方未标 | 钱包抵扣 | |
| payment_time | Number | 官方未标 | 支付时间 | 毫秒时间戳 |
| package_id | String | 官方未标 | 包裹 ID | |
| tracking_code | String | 官方未标 | 物流追踪号 | 3PL 提供 |
| tracking_code_pre | String | 官方未标 | 预置追踪号 | 官方注明未使用 |
| shipment_provider | String | 官方未标 | 物流商 | 如 LEX |
| shipping_provider_type | String | 官方未标 | 配送服务类型 | `EXPRESS`、`STANDARD`、`ECONOMY`、`INSTANT`、`SELLER_OWN_FLEET`、`PICKUP_IN_STORE`、`DIGITAL` |
| shipping_type | String | 官方未标 | 发货类型 | `Drop-shipping` / `Warehouse` |
| warehouse_code | String | 官方未标 | 仓库代码 | |
| delivery_option_sof | String | 官方未标 | 是否卖家自有车队 | `1`/`0` |
| is_fbl | String | 官方未标 | 是否平台履约 | `1`/`0` |
| is_digital | Number | 官方未标 | 是否数字商品 | |
| is_reroute | String | 官方未标 | 是否二次销售 | `1`/`0` |
| digital_delivery_info | String | 官方未标 | 数字商品交付信息 | |
| invoice_number | String | 官方未标 | 发票号 | |
| order_type | String | 官方未标 | 订单类型 | `Normal`、`PreSale`、`Coupon`、`O2O`、`InStoreO2O` |
| order_flag | String | 官方未标 | 订单标记 | `GUARANTEE`、`NORMAL`、`GLOBAL_COLLECTION` |
| stage_pay_status | String | 官方未标 | 预售支付状态 | `null`、`unpaid`、`unpaid final payment` |
| sla_time_stamp | String | 官方未标 | 发货 SLA | ISO 8601 |
| promised_shipping_time | String | 官方未标 | 承诺发货时间 | |
| fulfillment_sla | String | 官方未标 | 履约 SLA 信息 | |
| priority_fulfillment_tag | String | 官方未标 | 优先履约标签 | |
| buyer_id | String | 官方未标 | 买家 ID | |
| purchase_order_id | String | 官方未标 | 采购订单 ID | 打包接口返回 |
| purchase_order_number | String | 官方未标 | 采购订单号 | 打包接口返回 |
| extra_attributes | String | 官方未标 | 扩展属性 | JSON 字符串 |
| gift_wrapping | String | 官方未标 | 礼品包装文案 | |
| show_giftwrapping_tag | Boolean | 官方未标 | 是否显示礼品标签 | |
| personalization | String | 官方未标 | 个性化/刻字内容 | |
| show_personalization_tag | Boolean | 官方未标 | 是否显示刻字标签 | |
| supply_price | String | 官方未标 | 供货价 | MP3 订单 |
| supply_price_currency | String | 官方未标 | 供货价币种 | MP3 订单 |
| mp3_order | Boolean | 官方未标 | 是否 MP3 订单 | |
| semi_managed | Boolean | 官方未标 | 是否半托管 | |
| biz_group | Number | 官方未标 | 业务组 | `70100` 商家自发；`70020` 仓库发货 |
| pick_up_store_info | Object | 官方未标 | 门店自提信息 | 含名称、地址、ID、营业时间 |

## 6. GetMultipleOrderItems — `GET /orders/items/get`

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| order_ids | Number[] | 是 | 订单 ID 列表 | 方括号逗号分隔，如 `[42922,32793]` |

响应 `data[]` 含 `order_id`、`order_number`、`order_items[]`；`order_items` 字段与 GetOrderItems 基本一致，但官方示例个别字段集略有差异。`order_items` 内每个元素仍是一个独立商品单位。

### 6.1 数量获取规则

官方 `/order/items/get` 与 `/orders/items/get` 的字段表中没有 `qty` / `quantity`，但**每个最小订单项对象就是一个独立商品单位**：

- 同一订单购买 3 件相同 SKU → 返回 3 条记录；
- 3 条记录的 `sku` / `shop_sku` 相同，`order_item_id` 不同；
- 单条记录的物理件数恒为 **1**；
- 订单商品数量 = 按 SKU 分组后的 **去重 `order_item_id` 计数**；
- `items_count` 应与去重 `order_item_id` 数一致，可用于校验。

落地建议：

| 方案 | 做法 | 适用 |
|---|---|---|
| 单位行（推荐） | 每个 `order_item_id` 落一条 `order_lines`，`qty=1` | 保留退款、状态、包裹粒度 |
| 聚合行 | 按 SKU 聚合成一条 `order_lines`，`qty=count(order_item_id)` | 仅展示；必须另存 unit 映射表 |

- 不要把 `items_count` 直接当扣减依据；最终以 `COUNT(DISTINCT order_item_id)` 为准。
- 退款/取消按 `order_item_id` 释放或回补 1 件，不能按 SKU 行整体操作。

## 7. GetDocument — `GET /order/document/get`

| 方向 | 字段名 | 类型 | 必填 | 含义 |
|---|---|---|---:|---|
| 请求 | doc_type | String | 是 | `invoice`、`shippingLabel`、`carrierManifest` |
| 请求 | order_item_ids | String | 是 | 订单项 ID 列表，如 `[279709,279710]` |
| 响应 | data.document.file | String | 官方未标 | Base64 文件内容 |
| 响应 | data.document.mime_type | String | 官方未标 | MIME 类型 |
| 响应 | data.document.document_type | String | 官方未标 | 文档类型 |

## 8. SetInvoiceNumber — `POST /order/invoice_number/set`

| 方向 | 字段名 | 类型 | 必填 | 含义 |
|---|---|---|---:|---|
| 请求 | order_item_id | Number | 是 | 订单项 ID |
| 请求 | invoice_number | String | 是 | 发票号 |
| 响应 | data.order_item_id | String | 官方未标 | 订单项 ID |
| 响应 | data.invoice_number | String | 官方未标 | 发票号 |

## 9. 使用方法与注意事项

### 9.1 推荐同步链路

```text
GetOrders（按 update_after 增量，limt=100）
  → 按 order_id upsert orders
  → 对新增/状态变化的订单调用 GetOrderItems
  → 按 order_item_id upsert order_lines
  → 状态变化写 order_status_events
  → 物流字段（package_id / tracking_code / shipment_provider）进入 shipments/packages
```

### 9.2 幂等与对账

- 订单幂等键：`shop_id + order_id`；订单行幂等键：`shop_id + order_item_id`；`order_lines` 内部唯一约束 `(order_id, external_line_id)`。
- 金额一律保留原始字符串，再解析为 `numeric`；不要用浮点数。
- `statuses[]` 只用于展示订单整体进度，实际履约动作以订单项 `status` 为准。
- 订单取消/退货会改变订单项状态，必须同时拉取售后接口，不能只依赖订单接口。
- `GetOrders` 的 `limt` 拼写、`canceled` 单 L 拼写均为官方原样。

### 9.3 PII

地址、电话、姓名、邮箱属于个人信息；建议单独加密列或加密 JSON，访问需审计，并设置保留期限。不要写入普通日志。

## 10. 字段与 ERP 映射建议

| API 字段 | ERP 表/字段 | 说明 |
|---|---|---|
| order_id | `orders.external_order_id` | 平台订单主键 |
| order_number | `orders.order_number`（建议新增） | 人类可读订单号 |
| statuses | `orders.platform_status` | 保留平台原值 |
| created_at / updated_at | `orders.placed_at` / `orders.updated_at` | |
| price / currency | `orders.total_amount` / `orders.currency` | |
| payment_method | `orders.payment_method` | |
| address_shipping / billing | 新增 `order_addresses` | 加密存储 |
| customer_first_name / last_name | 新增 `orders.buyer_name_encrypted` | PII |
| voucher / shipping_fee* | 新增订单金额拆分列 | 对账需要 |
| order_item_id | `order_lines.external_line_id` | 平台订单项主键 |
| sku_id / shop_sku / sku | `order_lines.platform_sku_id` / `seller_sku` / `sku` | |
| item_price / paid_price / tax_amount | `order_lines.unit_price` + 新增 `paid_price`、`tax_amount` | 金额拆分 |
| status / return_status / reason | `order_lines.fulfillment_status` + 新增 `platform_status`、`return_status` | |
| package_id / tracking_code / shipment_provider | 新增 `shipments` / `packages` | 不要只存在订单行 |
| invoice_number | 新增 `order_lines.invoice_number` | |
| order_type / order_flag / promised_shipping_time | 新增订单履约属性列 | 影响 SLA |

## 11. 官方来源

- 分类目录：<https://open.daraz.com/handler/share/apidoc/getApiCategory.json?cid=2>
- GetOrders：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Forders%2Fget&methodType=GET&categoryId=2>
- GetOrder：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Forder%2Fget&methodType=GET%2FPOST&categoryId=2>
- GetOrderItems：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Forder%2Fitems%2Fget&methodType=GET&categoryId=2>
- GetMultipleOrderItems：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Forders%2Fitems%2Fget&methodType=GET&categoryId=2>
- GetDocument：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Forder%2Fdocument%2Fget&methodType=GET&categoryId=2>
- SetInvoiceNumber：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Forder%2Finvoice_number%2Fset&methodType=POST&categoryId=2>
