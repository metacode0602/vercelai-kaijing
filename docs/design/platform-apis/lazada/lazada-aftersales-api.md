# Lazada 售后与逆向（Return & Refund）API

> 核验日期：2026-11-05。来源：Lazada 官方 API Reference（Return and Refund `cid=26`）。
> 官方入口：<https://open.lazada.com/doc/api.htm>
> 通用签名、host、分页约定见 `lazada-common-conventions.md`。
> 订单与履约见 `lazada-orders-api.md`、`lazada-logistics-api.md`。

## 1. 逆向单模型

| 层级 | 平台实体 | 主键 | 说明 |
|---|---|---|---|
| 逆向单头 | reverse order | `reverse_order_id` | 一次售后申请 |
| 逆向单行 | reverse order line | `reverse_order_line_id` | 对应一个 `trade_order_line_id`（订单项） |
| 正向订单 | trade order | `trade_order_id` | 原订单 |
| 正向订单行 | trade order line | `trade_order_line_id` | 原订单项 |

`request_type` 三类：

| 值 | 含义 | 是否有退货物流 |
|---|---|---|
| `CANCEL` | 取消 | 发货前取消，通常无退货物流 |
| `RETURN` | 退货退款 | 有 |
| `ONLY_REFUND` | 仅退款 | 通常无 |

`return_to_type`：

| 值 | 含义 |
|---|---|
| `RTM` | Return to Merchant，退回卖家 |
| `RTW` | Return to Lazada Warehouse，退回平台仓 |

`shipping_type`：`PICK_UP`（上门取件）/ `DROP_OFF`（自送）。

## 2. 逆向状态

### 2.1 `reverse_status`（逆向单行）

| 值 | 含义 | 卖家动作 |
|---|---|---|
| `REQUEST_INITIATE` | 买家发起，待卖家处理 | 同意/拒绝 |
| `REQUEST_REJECT` | 卖家已拒绝 | 可能进入平台仲裁 |
| `REQUEST_CANCEL` | 申请已取消 | 无 |
| `CANCEL_SUCCESS` | 取消成功 | 无 |

> 官方详情接口只列出以上 4 个值；列表接口可能返回更多状态，接入时保留原值并记录未知枚举。

### 2.2 `ofc_status`（履约状态）

官方示例值包括 `INITIAL`、`RETURN_CANCELED` 等。该状态描述退货物流/逆向履约，不等于 `reverse_status`；不要混用。

### 2.3 `QC_Decision` / `whqc_decision`（平台仓质检结论）

| 值 | 含义 | 库存处理 |
|---|---|---|
| `scrap` | 报废 | 不回补 |
| `return_to_merchant` | 退回卖家 | 到卖家仓后回补 |
| `return_to_merchant_cb` | 退回跨境卖家 | 到跨境仓后回补 |
| `return_to_customer` | 退回买家 | 不回补 |
| `return_to_warehouse` | 退回平台仓 | 按平台规则 |
| `not_returned` | 未退回 | 不回补 |

> 质检结论是库存回补的关键依据；仅退款且无退货时不得回补。

## 3. 接口清单

| 接口 | 方法 | 路径 | 用途 | 集成标记 |
|---|---|---|---|---|
| GetReverseOrdersForSeller | GET/POST | `/reverse/getreverseordersforseller` | 分页查逆向单 | 系统同步 |
| GetReverseOrderDetail | GET | `/order/reverse/return/detail/list` | 逆向单详情 | 系统同步 |
| GetReverseOrderHistoryList | GET | `/order/reverse/return/history/list` | 协商历史 | 按需 |
| GetReverseOrderReasonList | GET | `/order/reverse/reason/list` | 拒绝原因列表 | 拒绝前必查 |
| InitReverseOrderCancel | GET | `/order/reverse/cancel/create` | 卖家发起取消 | 待审后写 |
| ReverseOrderCancelDecide | GET | `/order/reverse/cancel/seller/decide` | 处理取消申请 | 待审后写 |
| ReverseOrderOnlyRefundDecide | GET | `/order/reverse/onlyrefund/seller/decide` | 处理仅退款 | 待审后写 |
| ReverseOrderReturnUpdate | GET | `/order/reverse/return/update` | 处理退货退款 | 待审后写 |

## 4. GetReverseOrdersForSeller — `/reverse/getreverseordersforseller`

### 4.1 请求参数

| 字段 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| page_size | Number | 是 | 每页数量 | 官方示例 10 |
| page_no | Number | 是 | 页码 | 从 1 开始 |
| request_type_list | String[] | 否 | 类型过滤 | `CANCEL` / `RETURN` / `ONLY_REFUND` |
| reverse_status_list | String[] | 否 | 逆向状态过滤 | 见 2.1 |
| ofc_status_list | String[] | 否 | 履约状态过滤 | 见 2.2 |
| reverse_order_id | Number | 否 | 指定逆向单 | |
| trade_order_id | Number | 否 | 指定正向订单 | |
| return_to_type | String | 否 | `RTM` / `RTW` | |
| dispute_in_progress | Boolean | 否 | 是否争议中 | |
| QC_Decision | String | 否 | 质检结论过滤 | 见 2.3 |
| TradeOrderLineCreatedTimeRangeStart / End | Number | 否 | 正向订单行创建时间 | 毫秒 |
| ReverseOrderLineTimeRangeStart / End | Number | 否 | 逆向单行创建时间 | 毫秒 |
| ReverseOrderLineModifiedTimeRangeStart / End | Number | 否 | 逆向单行修改时间 | 毫秒 |

### 4.2 响应字段

| 字段 | 类型 | 含义 | 说明 |
|---|---|---|---|
| result.total | Number | 总数 | |
| result.page_no / page_size | Number | 分页 | |
| result.items[].reverse_order_id | Number | 逆向单 ID | |
| ...trade_order_id | Number | 原订单 ID | |
| ...request_type | String | 类型 | `CANCEL` / `RETURN` / `ONLY_REFUND` |
| ...is_rtm | Boolean | 是否退回卖家 | `true=RTM`，`false=RTW` |
| ...shipping_type | String | 取件方式 | `PICK_UP` / `DROP_OFF` / `DEFAULT` |
| ...reverse_order_lines[].reverse_order_line_id | Number | 逆向单行 ID | 幂等键 |
| ...trade_order_line_id | Number | 原订单项 ID | 关联订单项 |
| ...reverse_status | String | 逆向状态 | |
| ...ofc_status | String | 履约状态 | |
| ...product.product_id / product_sku | Number/String | 商品 | |
| ...buyer.buyer_id | Number | 买家 | |
| ...seller_sku_id / platform_sku_id | String | 卖家/平台 SKU | |
| ...refund_amount | Number | 退款金额 | **单位见 4.3** |
| ...item_unit_price | Number | 商品单价 | **单位见 4.3** |
| ...reason_text / reason_code | String/Number | 原因 | |
| ...refund_payment_method | String | 退款方式 | |
| ...whqc_decision | String | 质检结论 | |
| ...return_order_line_gmt_create / modified | Number | 创建/修改时间 | 毫秒 |
| ...trade_order_gmt_create | Number | 原订单创建时间 | 毫秒 |
| ...tracking_number | String | 退货物流单号 | |
| ...receiver_address | String | 退货收货地址 | PII |
| ...sla | Number | 卖家处理 SLA | 毫秒时间戳 |
| ...is_dispute | Boolean | 是否争议中 | |
| ...is_need_refund | Boolean | 是否需退款 | |

### 4.3 金额单位（关键）

官方明确：

> 金额以 **cent** 为单位，**越南（VN）除外**。
> 例：SG `100 = SGD $1`；VN `10000 = VND 10000`（即 VN 不做 ×100）。

落库前按店铺站点做币种/单位归一化：

```text
非 VN：amount = raw / 100
VN：amount = raw
```

- 不能只凭 `currency` 判断；必须结合店铺 `country`。
- 退款金额、商品单价都适用该规则。
- 订单主接口金额多为字符串且非 cent；售后接口单独处理，禁止复用同一解析函数。

## 5. GetReverseOrderDetail — `/order/reverse/return/detail/list`

请求：`reverse_order_id`（Number，必填）。

响应 `data`：

| 字段 | 类型 | 含义 |
|---|---|---|
| reverse_order_id | Number | 逆向单 ID |
| trade_order_id | Number | 原订单 ID |
| request_type | String | `CANCEL` / `RETURN` / `ONLY_REFUND` |
| shipping_type | String | `PICK_UP` / `DROP_OFF` |
| is_rtm | Boolean | 是否退回卖家 |
| reverseOrderLineDTOList[].reverse_order_line_id | Number | 逆向行 ID |
| ...trade_order_line_id | Number | 原订单项 |
| ...reverse_status | String | 逆向状态 |
| ...ofc_status | String | 履约状态 |
| ...buyer.user_id | Number | 买家 |
| ...productDTO.product_id / sku | Number/String | 商品 |
| ...is_need_refund | Boolean | 是否退款 |
| ...refund_amount | Number | 退款金额（cent/VN 例外） |
| ...item_unit_price | Number | 单价（cent/VN 例外） |
| ...reason_text / reason_code | String/Number | 原因 |
| ...refund_payment_method | String | 退款方式 |
| ...whqc_decision | String | 质检结论 |
| ...seller_sku_id / platform_sku_id | String | SKU |
| ...tracking_number | String | 退货单号 |
| ...sla | Number | 处理 SLA（毫秒时间戳） |
| ...is_dispute | Boolean | 是否争议 |

## 6. GetReverseOrderReasonList — `/order/reverse/reason/list`

请求：`reverse_order_line_id`（Number，必填）。

响应：`reason_options[]`（`reason_id`、`reason_name`）。

- 所有拒绝/争议动作前必须调用，不能硬编码原因。
- 同一逆向单不同行的原因选项可能不同。

## 7. 处理动作

### 7.1 卖家发起取消 — `GET /order/reverse/cancel/create`

| 字段 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| order_id | Number | 是 | 订单 ID |
| order_item_id_list | String[] | 是 | 待取消订单项 |
| reason_id | String | 是 | 原因 ID；来自 `OrderCancelValidate` |

- 取消前先调 `/order/reverse/cancel/validate` 拿 `reason_id`。
- 发货后不要走此接口，应走退货/退款流程。

### 7.2 处理取消申请 — `GET /order/reverse/cancel/seller/decide`

| 字段 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| reverse_order_id | Number | 是 | 逆向单 ID |
| agree_cancel | Boolean | 是 | 是否同意 |
| reason_code | Number | 否 | 拒绝原因 |

### 7.3 仅退款处理 — `GET /order/reverse/onlyrefund/seller/decide`

| 字段 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| reverse_order_id | Number | 是 | 逆向单 ID |
| reverse_order_item_ids | Number[] | 是 | 逆向行；当前只支持 1 个 |
| action | String | 是 | `agreeRefund` / `startDispute` |
| comment | String | 条件 | `startDispute` 时必填 |
| image_info_list[] | Object[] | 否 | `file_name`、`file_url` |
| video_info_list[] | Object[] | 否 | `cover_url`、`video_url` |

### 7.4 退货退款处理 — `GET /order/reverse/return/update`

| 字段 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| reverse_order_id | Number | 是 | 逆向单 ID |
| reverse_order_item_ids | Number[] | 是 | 逆向行 |
| action | String | 是 | `instantRefund` / `agreeReturn` / `refuseReturn` / `agreeRefund` / `refuseRefund` / `confirmDelivery` |
| reason_id | Number | 否 | 拒绝原因 |
| comment | String | 否 | 备注 |
| image_info[] | Object[] | 否 | `name`、`url` |

动作顺序（典型）：

```text
买家申请 RETURN
  → 卖家 agreeReturn / refuseReturn
  → 买家寄回 / 平台取件
  → 卖家 confirmDelivery（收到退货）
  → 卖家 agreeRefund / refuseRefund
  → 平台退款
```

`instantRefund` 为立即退款，通常用于低金额/平台策略；使用前确认店铺策略。

## 8. 库存回补规则

| 场景 | 是否回补 | 节点 |
|---|---|---|
| 发货前取消 `CANCEL` | 是 | 取消成功/`CANCEL_SUCCESS` |
| 仅退款 `ONLY_REFUND` | 否 | 无实物退回 |
| 退货退款，`whqc_decision=scrap` | 否 | 质检报废 |
| 退货退款，`return_to_merchant` | 是 | 卖家确认收货 |
| 退货退款，`return_to_warehouse` | 按平台规则 | 平台入库 |
| 退货退款，`not_returned` | 否 | 未退回 |
| 退货退款，`RTW` | 通常平台仓回补 | 以平台库存为准 |

- 回补必须幂等：`reverse_order_line_id + decision` 唯一。
- 退款成功 ≠ 库存回补；两者分开记账。
- 退货物流单号可能为空（自送/无需退货），不能作为必填幂等键。

## 9. 落库建议

| 平台实体 | 建议表 | 键 |
|---|---|---|
| 逆向单头 | `reverse_orders` | `shop_id + reverse_order_id` |
| 逆向单行 | `reverse_order_items` | `shop_id + reverse_order_line_id` |
| 协商历史 | `reverse_order_messages` | `reverse_order_line_id + created_at + seq` |
| 质检 | `reverse_qc_records` | `reverse_order_line_id + qc_time` |
| 退款 | `refunds` | `shop_id + reverse_order_id + line_id` |
| 退货物流 | `return_shipments` | `reverse_order_line_id + tracking_number` |
| 库存回补 | `inventory_movements` | `source_type=return + source_id=line_id` |

## 10. 官方来源

| 资源 | URL |
|---|---|
| Return and Refund 分类 | <https://open.lazada.com/handler/share/apidoc/getApiCategory.json?cid=26&language=en> |
| GetReverseOrdersForSeller | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Freverse%2Fgetreverseordersforseller&methodType=GET%2FPOST&categoryId=26> |
| GetReverseOrderDetail | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Forder%2Freverse%2Freturn%2Fdetail%2Flist&methodType=GET&categoryId=26> |
| ReverseOrderReturnUpdate | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Forder%2Freverse%2Freturn%2Fupdate&methodType=GET&categoryId=26> |
