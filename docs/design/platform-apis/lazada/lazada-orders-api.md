# Lazada 订单（Order）API 字段说明与使用方法

> 核验日期：2026-11-05。来源：Lazada 官方 API Reference（Order `cid=8`）。
> 官方入口：<https://open.lazada.com/doc/api.htm>
> 通用签名、host、分页约定见 `lazada-common-conventions.md`。
> 售后/逆向单见 `lazada-aftersales-api.md`；履约见 `lazada-logistics-api.md`。

## 1. 接口清单

| 接口 | 方法 | 路径 | 用途 | 集成标记 |
|---|---|---|---|---|
| GetOrders | GET | `/orders/get` | 按时间窗/状态分页查订单 | 系统同步 |
| GetOrder | GET | `/order/get` | 查单个订单头 | 系统同步 |
| GetOrderItems | GET | `/order/items/get` | 查订单内全部商品实例（每单位一条） | 系统同步 |
| GetMultipleOrderItems | GET | `/orders/items/get` | 批量查订单项（≤50 单） | 系统同步 |
| GetDocument | GET | `/order/document/get` | 发票/面单/承运商清单 | 按需/系统 |
| GetOVOOrders | GET/POST | `/orders/ovo/get` | OVO 订单 | 可选 |
| OrderCancelValidate | GET | `/order/reverse/cancel/validate` | 取消前校验 | 取消前 |
| SetInvoiceNumber | POST | `/order/invoice_number/set` | 设置订单项发票号 | 系统动作 |

## 2. 订单状态

### 2.1 `GetOrders.status` 支持值

| 值 | 含义 | 中文解释 |
|---|---|---|
| unpaid | 未支付 | 已创建未付款 |
| pending | 待处理 | 已进入卖家处理；是否已付款需看 `payment_time` |
| topack | 待打包 | 白名单/特定履约流程 |
| toship | 待发货 | 白名单/特定履约流程 |
| ready_to_ship | 待发货/RTS | 已打包并标记可发货 |
| shipped | 已发货 | 已交物流商 |
| shipping | 配送中 | 官方状态枚举包含 |
| delivered | 已送达 | 已妥投 |
| canceled | 已取消 | 官方拼写单 L |
| returned | 已退货 | 逆向完成/退货 |
| failed | 失败 | 履约/配送失败 |
| lost | 丢失 | 官方状态枚举包含 |

> 订单头 `statuses[]` 是订单项状态集合，可能包含：
> `unpaid`、`pending`、`repacked`、`packed`、`ready_to_ship_pending`、`ready_to_ship`、`shipping`、`delivered`、`lost`、`failed`、`canceled`、`returned`、`damaged_by_3pl`、`lost_by_3pl`。
> 不要假设订单头状态等于每个订单项状态。

### 2.2 状态相关字段

| 字段 | 位置 | 含义 | 说明 |
|---|---|---|---|
| `status` | 订单项 | 订单项状态 | 以 `/order/items/get` 实际值为准 |
| `return_status` | 订单项 | 退货状态 | 售后单独跟踪 |
| `stage_pay_status` | 订单项 | 预售支付状态 | `null` / `unpaid` / `unpaid final payment` |
| `payment_time` | 订单项 | 支付时间 | 毫秒时间戳；**订单头没有该字段** |
| `need_cancel_confirm` | 订单/订单项 | 买家取消待卖家确认 | 布尔 |
| `is_cancel_pending` | 订单/订单项 | 卖家同意取消，待物流 | 布尔 |
| `cancel_trigger_time` | 订单项 | 自动取消截止 | 毫秒时间戳 |
| `reverse_order_id` | 订单项 | 逆向单 ID | 取消单主 ID |
| `cancel_return_initiator` | 订单项 | 取消/退货发起方 | `cancellation-customer`、`cancellation-seller`、`return-customer`、`refund-internal` 等 |

## 3. GetOrders — `GET /orders/get`

### 3.1 请求参数

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| update_after | String | 条件必填 | 更新时间下界 | ISO 8601；与 `created_after` 至少一个 |
| update_before | String | 否 | 更新时间上界 | ISO 8601 |
| created_after | String | 条件必填 | 创建时间下界 | ISO 8601 |
| created_before | String | 否 | 创建时间上界 | ISO 8601 |
| status | String | 否 | 状态过滤 | 见 2.1 |
| sort_by | String | 否 | 排序字段 | `created_at` / `updated_at` |
| sort_direction | String | 否 | 排序方向 | `ASC` / `DESC` |
| offset | Number | 否 | 跳过条数 | 从 0 开始 |
| limit | Number | 否 | 返回条数 | 最大 100 |

### 3.2 响应字段

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| data.countTotal | Number | 否 | 总订单数 | 当前过滤条件 |
| data.count | Number | 是 | 本页数量 | 含 offset/limit |
| data.orders | Object[] | 是 | 订单列表 | |
| data.orders.order_id | String | 是 | 订单 ID | 官方示例为字符串 |
| data.orders.order_number | String | 是 | 订单号 | |
| data.orders.statuses | String[] | 是 | 订单项状态集合 | 见 2.1 |
| data.orders.items_count | Number | 是 | 商品实例/件数 | 应与去重 `order_item_id` 数一致；以记录计数为准 |
| data.orders.price | String | 是 | 订单金额 | 不含 voucher/shipping_fee |
| data.orders.created_at | String | 是 | 下单时间 | ISO 8601 |
| data.orders.updated_at | String | 是 | 更新时间 | ISO 8601 |
| data.orders.payment_method | String | 是 | 支付方式 | `COD` 等 |
| data.orders.shipping_fee | String | 是 | 运费 | |
| data.orders.shipping_fee_original | String | 否 | 原始运费 | |
| data.orders.shipping_fee_discount_seller | String | 否 | 卖家运费折扣 | |
| data.orders.shipping_fee_discount_platform | String | 否 | 平台运费折扣 | |
| data.orders.voucher | String | 是 | 优惠总额 | |
| data.orders.voucher_platform | String | 否 | 平台优惠 | |
| data.orders.voucher_seller | String | 否 | 卖家优惠 | |
| data.orders.voucher_code | String | 是 | 优惠券 ID/代码 | |
| data.orders.remarks | String | 是 | 备注 | |
| data.orders.buyer_note | String | 否 | 买家备注 | |
| data.orders.gift_option | String/Boolean | 是 | 是否礼品 | 示例不一致，按实际解析 |
| data.orders.gift_message | String | 是 | 礼品留言 | |
| data.orders.warehouse_code | String | 否 | 仓库代码 | 多仓卖家 |
| data.orders.promised_shipping_times | String | 是 | 承诺发货时间 | |
| data.orders.delivery_info | String | 是 | 配送信息 | |
| data.orders.address_shipping | Object | 是 | 收货地址 | 字段见 3.3 |
| data.orders.address_billing | Object | 是 | 账单地址 | 字段见 3.3 |
| data.orders.customer_first_name | String | 是 | 买家名 | PII |
| data.orders.customer_last_name | String | 是 | 买家姓 | PII |
| data.orders.branch_number | String | 是 | 税务分支号 | 仅泰国 |
| data.orders.tax_code | String | 是 | VAT 税号 | 仅泰国/越南 |
| data.orders.national_registration_number | String | 是 | 国家注册号 | 部分国家 |
| data.orders.extra_attributes | String | 是 | 扩展属性 | JSON 字符串 |
| data.orders.need_cancel_confirm | Boolean | 否 | 取消待确认 | |
| data.orders.is_cancel_pending | String/Boolean | 否 | 取消待物流 | 示例为字符串 |
| data.orders.recipient_info | Object | 否 | 收件人证件信息 | 含护照/身份证号；PII |

### 3.3 地址字段

`address_shipping` / `address_billing` 均含：`first_name`、`last_name`、`phone`、`phone2`、`address1`、`address2`、`address3`、`address4`、`address5`、`city`、`post_code`、`country`、`addressDsitrict`/`addressDistrict`（官方拼写不一致）。

### 3.4 使用方法

```text
首次全量：created_after=2026-01-01T00:00:00+08:00&created_before=2026-01-31T23:59:59+08:00&limit=100
增量：update_after=<上次成功水位>&limit=100&sort_by=updated_at&sort_direction=ASC
```

- 单页最大 100；用 `countTotal` 判断翻页。
- 用 `order_id` 幂等 upsert；`order_number` 只作展示。
- 金额字段为字符串，落 `numeric(18,4)` 前不要经过浮点。
- `items_count` 表示商品实例数，与订单项记录数一致；库存以去重 `order_item_id` 计数为准。

## 4. GetOrder — `GET /order/get`

| 字段名 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| order_id | Number | 是 | 订单 ID |

响应与 `GetOrders` 单个订单基本一致，但为单对象：

| 字段名 | 类型 | 含义 |
|---|---|---|
| data.order_id | Number | 订单 ID |
| data.order_number | Number/String | 订单号 |
| data.statuses | String[] | 订单项状态集合 |
| data.items_count | Number | 商品实例/件数 |
| data.price | String | 订单金额 |
| data.payment_method | String | 支付方式 |
| data.address_shipping / address_billing | Object | 地址 |
| data.created_at / updated_at | String | 时间 |
| data.need_cancel_confirm / is_cancel_pending | Boolean | 取消状态 |

- `/order/get` 不返回 `payment_time`；支付时间必须从订单项取。
- 不要因为 `order_id` 在 `GetOrder` 是 Number，就在所有写接口都传 Number；取消/校验接口使用 String。

## 5. 订单项接口

### 5.1 GetOrderItems — `GET /order/items/get`

| 字段名 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| order_id | Number | 是 | 订单 ID |

响应 `data` 是订单项对象数组；每个最小对象代表 **一个独立商品实例（Unit/Line Item）**。同一 SKU 购买多件时，会返回多条相同 SKU、不同 `order_item_id` 的记录。

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| order_id | String | 是 | 订单 ID | |
| order_item_id | Number | 是 | 商品实例 ID | 幂等键；同一 SKU 多件时每条不同 |
| shop_id | String | 是 | 店铺/卖家 | |
| sku | String | 是 | 卖家 SKU | |
| shop_sku | String | 是 | 平台店铺 SKU | |
| sku_id | String | 否 | 平台 SKU ID | 官方标 String |
| product_id | String | 否 | 商品 ID | |
| name | String | 是 | 商品名 | |
| variation | String | 是 | 变体 | |
| product_main_image | String | 是 | 主图 | |
| product_detail_url | String | 是 | 商品链接 | |
| status | String | 是 | 订单项状态 | |
| return_status | String | 是 | 退货状态 | |
| reason / reason_detail | String | 是 | 取消/退货原因 | |
| cancel_return_initiator | String | 否 | 发起方 | |
| item_price | String | 是 | 标价 | |
| paid_price | String | 是 | 实付单价 | |
| tax_amount | String | 是 | 税额 | |
| shipping_amount | String | 是 | 运费 | |
| shipping_service_cost | Number | 是 | 物流服务成本 | |
| voucher_amount | String | 是 | 优惠额 | |
| voucher_platform / voucher_seller | String | 否 | 平台/卖家优惠 | |
| wallet_credits | String | 是 | 钱包抵扣 | |
| currency | String | 是 | 币种 | ISO 4217 |
| order_type | String | 否 | 订单类型 | `Normal` / `PreSale` 等 |
| stage_pay_status | String | 否 | 预售支付状态 | |
| payment_time | Number | 否 | 支付时间 | 毫秒 |
| package_id | String | 是 | 包裹 ID | |
| tracking_code | String | 是 | 追踪号 | |
| shipment_provider | String | 是 | 物流商 | |
| shipping_provider_type | String | 是 | 物流类型 | `EXPRESS` / `STANDARD` / `ECONOMY` / `INSTANT` / `SELLER_OWN_FLEET` / `PICKUP_IN_STORE` / `DIGITAL` |
| warehouse_code | String | 否 | 仓库代码 | |
| is_fbl | String | 否 | 是否 Lazada 履约 | `0/1` |
| is_reroute | String | 否 | 是否二次销售 | `0/1` |
| delivery_option_sof | String | 否 | 是否卖家自配送 | `0/1` |
| sla_time_stamp | String | 否 | 发货 SLA | ISO 8601 |
| fulfillment_sla | String | 否 | 履约 SLA | 如 `NEXT_DAY` |
| order_flag | String | 否 | 订单标记 | `GUARANTEE` / `NORMAL` / `GLOBAL_COLLECTION` |
| reverse_order_id | Number | 否 | 逆向单 ID | |
| need_cancel_confirm / is_cancel_pending | Boolean | 否 | 取消状态 | |
| cancel_trigger_time | Number | 否 | 自动取消时间 | 毫秒 |

### 5.2 数量获取规则

官方订单项字段树没有 `quantity` / `qty`，但**每个最小订单项对象就是一个独立商品实例（Unit/Line Item）**：

- 同一订单购买 3 件相同 SKU → 返回 3 条记录；
- 3 条记录的 `sku` / `seller_sku` 相同，`order_item_id` 不同；
- 单条记录的物理件数恒为 **1**；
- 订单商品数量 = 按 `sku` / `seller_sku` 分组后的 **去重 `order_item_id` 计数**；
- 订单总件数 = 该订单全部去重 `order_item_id` 计数。

落地建议：

| 方案 | 做法 | 适用 |
|---|---|---|
| 单位行（推荐） | 每个 `order_item_id` 落一条 `order_lines`，`qty=1` | 保留退款、状态、包裹粒度 |
| 聚合行 | 按 SKU 聚合成一条 `order_lines`，`qty=count(order_item_id)` | 仅展示；必须另存 unit 映射表 |

- 推荐单位行：`order_item_id` 是退款、售后、包裹的最小粒度，聚合会丢失粒度。
- 聚合展示时再按 `sku` 汇总，不要反向用汇总数写回平台。
- `items_count` 可用于校验，但最终以 `COUNT(DISTINCT order_item_id)` 为准。
- 退货/取消时按 `order_item_id` 释放或回补 1 件，不能按 SKU 行整体操作。

> 该方法同样适用于 Daraz：Daraz 也按每个商品单位返回一条记录。

### 5.3 GetMultipleOrderItems — `GET /orders/items/get`

| 字段名 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| order_ids | Number[] | 是 | 订单 ID 列表，最多 50 |

响应 `data.order_items[]`，字段与 5.1 基本一致，另有 `order_number`、`order_id` 顶层字段。数组内每个元素仍是一个独立商品实例；同一 SKU 多件会出现多条不同 `order_item_id`。适合批量同步，减少 N+1。

## 6. GetDocument — `GET /order/document/get`

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| doc_type | String | 是 | 文档类型 | `invoice` / `shippingLabel` / `carrierManifest` |
| order_item_ids | String | 是 | 订单项 ID 列表 | 官方示例为 JSON 数组字符串 |

响应：

| 字段名 | 类型 | 含义 | 说明 |
|---|---|---|---|
| data.document.file | String | Base64 文件内容 | 按 `mime_type` 解码 |
| data.document.mime_type | String | MIME 类型 | |
| data.document.document_type | String | 文档类型 | |

- 面单/发票含 PII，按敏感文件管理。
- 面单优先用履约接口 `PrintAWB`；`GetDocument` 适合发票/承运商清单。

## 7. SetInvoiceNumber — `POST /order/invoice_number/set`

| 字段名 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| order_item_id | Number | 是 | 订单项 ID |
| invoice_number | String | 是 | 发票号 |

响应：`data.order_item_id`、`data.invoice_number`。

## 8. OrderCancelValidate — `GET /order/reverse/cancel/validate`

| 字段名 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| order_id | String | 是 | 订单 ID |
| order_item_id_list | String[] | 是 | 待取消订单项 |

响应：`tip_content`、`tip_type`（`warn` / `error`）、`reason_options[]`（`reason_id`、`reason_name`）。

- 真正取消用 `lazada-aftersales-api.md` 的 `/order/reverse/cancel/create`。
- 取消前必须先调本接口拿 `reason_id`；不同订单可用原因不同。

## 9. 官方来源

| 资源 | URL |
|---|---|
| Order 分类 | <https://open.lazada.com/handler/share/apidoc/getApiCategory.json?cid=8&language=en> |
| GetOrders | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Forders%2Fget&methodType=GET&categoryId=8> |
| GetOrderItems | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Forder%2Fitems%2Fget&methodType=GET&categoryId=8> |
| GetMultipleOrderItems | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Forders%2Fitems%2Fget&methodType=GET&categoryId=8> |
| GetDocument | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Forder%2Fdocument%2Fget&methodType=GET&categoryId=8> |
| SetInvoiceNumber | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Forder%2Finvoice_number%2Fset&methodType=POST&categoryId=8> |
