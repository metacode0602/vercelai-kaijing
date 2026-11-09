# Daraz 售后（Return & Refund）API 字段说明与使用方法

> 核验日期：2026-11-05。来源：Daraz 官方 API Reference（Return and Refund 分类 `cid=23`）。
> 官方入口：<https://open.daraz.com/doc/api.htm>
>
> 售后与订单是两套数据：订单接口只能看到 `return_status` / `reason` 等摘要，退款金额、退货物流、仓库 QC 决策必须走本域接口。

## 1. 接口清单

| 接口 | 方法 | 路径 | 用途 | 集成标记 |
|---|---|---|---|---|
| GetReverseOrdersForSeller | GET/POST | `/reverse/getreverseordersforseller` | 分页查询逆向单 | 系统同步 |
| GetReverseOrderDetail | GET | `/order/reverse/return/detail/list` | 查询单个逆向单明细 | 系统同步 |
| GetReverseOrderHistoryList | GET | `/order/reverse/return/history/list` | 查询售后沟通/操作历史 | 系统同步 |
| GetReverseOrderReasonList | GET | `/order/reverse/reason/list` | 查询拒绝退款原因选项 | 系统元数据 |
| OrderCancelValidate | GET | `/order/reverse/cancel/validate` | 校验订单是否可取消 | 系统前置校验 |
| InitReverseOrderCancel | GET | `/order/reverse/cancel/create` | 卖家发起取消 | 人工/运营，高风险 |

## 2. 逆向单类型与状态

### 2.1 请求类型 `request_type`

| 值 | 含义 | 说明 |
|---|---|---|
| `CANCEL` | 取消 | 发货前/后取消 |
| `RETURN` | 退货退款 | 买家退回商品 |
| `ONLY_REFUND` | 仅退款 | 不退货 |

### 2.2 退货方式 `shipping_type`

| 值 | 含义 |
|---|---|
| `PICK_UP` | 上门取件 |
| `DROP_OFF` | 买家自送 |

### 2.3 逆向行状态 `reverse_status`

官方详情接口示例列出：

| 值 | 含义 |
|---|---|
| `REQUEST_INITIATE` | 申请已发起 |
| `REQUEST_REJECT` | 申请被拒绝 |
| `REQUEST_CANCEL` | 申请被取消 |
| `CANCEL_SUCCESS` | 取消成功 |

> 官方未在公开 JSON 中给出完整状态机；`reverse_status_list` 可传多个值，但可选值集合未展开。接入时应以实际响应和新出现的状态为准，不要穷举假设。

### 2.4 仓库 QC 决策 `QC_Decision` / `whqc_decision`

| 值 | 含义 |
|---|---|
| `scrap` | 报废 |
| `return_to_merchant` | 退回商家 |
| `return_to_merchant_cb` | 退回商家（跨境） |
| `return_to_customer` | 退回买家 |
| `return_to_warehouse` | 退回仓库 |
| `not_returned` | 未退回 |

### 2.5 是否退回商家 `is_rtm`

- `true`：退回商家（Return to Merchant）
- `false`：退回 Daraz 仓库（Return to Warehouse）

## 3. GetReverseOrdersForSeller — `GET/POST /reverse/getreverseordersforseller`

### 3.1 请求参数

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| page_no | Number | 是 | 页码 | 从 1 开始 |
| page_size | Number | 是 | 每页数量 | 默认 10 |
| reverse_order_id | Number | 否 | 逆向单 ID | 精确查询 |
| trade_order_id | Number | 否 | 正向订单 ID | 精确查询 |
| reverse_status_list | String[] | 否 | 逆向状态过滤 | 见 2.3 |
| ofc_status_list | String[] | 否 | 履约状态过滤 | 官方未展开枚举 |
| return_to_type | String | 否 | 退回类型 | 目前仅 `RTW`（退回 Daraz 仓库） |
| dispute_in_progress | Boolean | 否 | 是否争议中 | |
| QC_Decision | String | 否 | 仓库 QC 决策 | 见 2.4 |
| TradeOrderLineCreatedTimeRangeStart | Number | 否 | 正向订单行创建起 | 毫秒时间戳 |
| TradeOrderLineCreatedTimeRangeEnd | Number | 否 | 正向订单行创建止 | 毫秒时间戳 |
| ReverseOrderLineTimeRangeStart | Number | 否 | 逆向行创建起 | 毫秒时间戳 |
| ReverseOrderLineTimeRangeEnd | Number | 否 | 逆向行创建止 | 毫秒时间戳 |
| ReverseOrderLineModifiedTimeRangeStart | Number | 否 | 逆向行修改起 | 毫秒时间戳 |
| ReverseOrderLineModifiedTimeRangeEnd | Number | 否 | 逆向行修改止 | 毫秒时间戳 |

### 3.2 响应

| 字段名 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| result.success | Boolean | 是 | 是否成功 |
| result.total | Number | 是 | 总记录数 |
| result.page_no | Number | 是 | 当前页码 |
| result.page_size | Number | 是 | 每页数量 |
| result.items | Object[] | 是 | 逆向单摘要 |
| result.items.reverse_order_id | Number | 官方未标 | 逆向单 ID |
| result.items.trade_order_id | Number | 官方未标 | 正向订单 ID |
| result.items.request_type | String | 官方未标 | `CANCEL` / `RETURN` / `ONLY_REFUND` |
| result.items.is_rtm | Boolean | 官方未标 | 是否退回商家 |
| result.items.shipping_type | String | 官方未标 | 退货方式 |

> 列表接口不返回金额、SKU、数量；必须再调详情接口。

## 4. GetReverseOrderDetail — `GET /order/reverse/return/detail/list`

### 4.1 请求

| 字段名 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| reverse_order_id | Number | 是 | 逆向单 ID |

### 4.2 响应

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| data.reverse_order_id | Number | 官方未标 | 逆向单 ID | |
| data.trade_order_id | Number | 官方未标 | 正向订单 ID | |
| data.request_type | String | 官方未标 | 申请类型 | 见 2.1 |
| data.shipping_type | String | 官方未标 | 退货方式 | 见 2.2 |
| data.is_rtm | Boolean | 官方未标 | 是否退回商家 | |
| data.reverseOrderLineDTOList | Object[] | 官方未标 | 逆向行明细 | |
| ...reverse_order_line_id | Number | 官方未标 | 逆向行 ID | 售后行主键 |
| ...trade_order_line_id | Number | 官方未标 | 正向订单行 ID | 关联 order_item_id |
| ...refund_amount | Number | 官方未标 | 退款金额 | **单位：分**（官方原文 currency in cent） |
| ...item_unit_price | Number | 官方未标 | 商品单价 | **单位：分** |
| ...reason_code | Number | 官方未标 | 原因码 | |
| ...reason_text | String | 官方未标 | 原因文本 | |
| ...refund_payment_method | String | 官方未标 | 退款方式 | |
| ...whqc_decision | String | 官方未标 | 仓库 QC 决策 | 见 2.4 |
| ...is_dispute | Boolean | 官方未标 | 是否争议中 | |
| ...is_need_refund | Boolean | 官方未标 | 是否需要退款 | |
| ...reverse_status | String | 官方未标 | 逆向行状态 | 见 2.3 |
| ...ofc_status | String | 官方未标 | 履约状态 | |
| ...seller_sku_id | String | 官方未标 | 卖家 SKU | |
| ...platform_sku_id | String | 官方未标 | 平台 SKU | |
| ...productDTO.product_id | Number | 官方未标 | 商品 ID | |
| ...productDTO.sku | String | 官方未标 | SKU | |
| ...tracking_number | String | 官方未标 | 退货物流追踪号 | |
| ...buyer.user_id | Number | 官方未标 | 买家 ID | |
| ...return_order_line_gmt_create | Number | 官方未标 | 逆向行创建时间 | 毫秒时间戳 |
| ...return_order_line_gmt_modified | Number | 官方未标 | 逆向行修改时间 | 毫秒时间戳 |
| ...trade_order_gmt_create | Number | 官方未标 | 正向订单创建时间 | 毫秒时间戳 |

### 4.3 金额单位陷阱

官方原文：

> `refund_amount`: refund amount, currency in cent (for example for PK, 100 equals PKR $1; for PK, 10000 equals VND 10000)

同一条说明里混用了 PK/ VND，且不同站点是否真的以“分”为单位并不完全一致。**接入 LK 站前必须用真实响应与结算报表交叉验证**，不能直接假设 `refund_amount / 100` 就是 LKR。

## 5. GetReverseOrderHistoryList — `GET /order/reverse/return/history/list`

| 方向 | 字段名 | 类型 | 必填 | 含义 |
|---|---|---|---:|---|
| 请求 | reverse_order_line_id | Number | 是 | 逆向行 ID |
| 请求 | page_size | Number | 否 | 每页数量，默认 10 |
| 请求 | page_number | Number | 否 | 页码，默认 1 |
| 响应 | data.list[].operator | String | 官方未标 | 操作方 |
| 响应 | data.list[].picture | String[] | 官方未标 | 图片 URL |
| 响应 | data.list[].time | Number | 官方未标 | 时间戳 |
| 响应 | data.page_info.page_size | Number | 官方未标 | 每页数量 |
| 响应 | data.page_info.current_page_number | Number | 官方未标 | 当前页码 |
| 响应 | data.page_info.total | Number | 官方未标 | 总数 |

## 6. 卖家取消

### 6.1 OrderCancelValidate — `GET /order/reverse/cancel/validate`

| 方向 | 字段名 | 类型 | 必填 | 含义 |
|---|---|---|---:|---|
| 请求 | order_id | String | 是 | 订单 ID |
| 请求 | order_item_id_list | String[] | 是 | 待取消订单项 |
| 响应 | data.tip_content | String | 官方未标 | 提示内容 |
| 响应 | data.tip_type | String | 官方未标 | `warn` / `error` |
| 响应 | data.reason_options | Object[] | 官方未标 | 可选取消原因 |
| 响应 | data.reason_options[].reason_name | String | 官方未标 | 原因名 |
| 响应 | data.reason_options[].reason_id | String | 官方未标 | 原因 ID |

### 6.2 InitReverseOrderCancel — `GET /order/reverse/cancel/create`

| 方向 | 字段名 | 类型 | 必填 | 含义 |
|---|---|---|---:|---|
| 请求 | order_id | Number | 是 | 订单 ID |
| 请求 | reason_id | String | 是 | 原因 ID（先调 validate 获取） |
| 请求 | order_item_id_list | String[] | 是 | 待取消订单项 |
| 响应 | data.tip_content | String | 官方未标 | 提示内容 |
| 响应 | data.tip_type | String | 官方未标 | `error` / `warn` |

### 6.3 GetReverseOrderReasonList — `GET /order/reverse/reason/list`

| 方向 | 字段名 | 类型 | 必填 | 含义 |
|---|---|---|---:|---|
| 请求 | reverse_order_line_id | Number | 是 | 逆向行 ID |
| 响应 | data[].reason_id | Number | 官方未标 | 原因 ID |
| 响应 | data[].text | String | 官方未标 | 英文原因 |
| 响应 | data[].muti_language_text | String | 官方未标 | 多语言原因（官方拼写 `muti`） |

## 7. 使用方法

### 7.1 售后同步链路

```text
GetReverseOrdersForSeller
  → 按时间窗（ReverseOrderLineModifiedTimeRange*）增量分页
  → 对每个 reverse_order_id 调 GetReverseOrderDetail
  → 按 reverse_order_line_id upsert 售后行
  → 关联 trade_order_line_id 到 order_lines
  → 状态变化写 after_sales_events
  → 退款金额进入 refunds / settlement 调整
  → 需要沟通记录时调 History
```

### 7.2 卖家取消链路

```text
OrderCancelValidate（校验 + 取 reason_options）
  → 选择 reason_id
  → InitReverseOrderCancel
  → 回查订单/逆向单状态确认
  → 审计记录操作人、原因、订单项
```

### 7.3 注意事项

- 列表接口只给摘要，不要据此计算退款金额。
- `refund_amount`、`item_unit_price` 单位必须以实测为准；先保留原始值。
- 退货物流 `tracking_number` 与正向发货 tracking 是两条链路，不要覆盖。
- 售后状态和订单状态会互相影响；ERP 中必须分开存储，不能只改订单状态。
- 取消接口是 GET，但仍会改变平台状态；必须进审批和审计，不能暴露给普通只读角色。

## 8. 字段与 ERP 映射建议

| API 字段 | ERP 表/字段 | 说明 |
|---|---|---|
| reverse_order_id | 新增 `after_sales_cases.external_case_id` | 逆向单主键 |
| trade_order_id | `after_sales_cases.order_id` | 关联正向订单 |
| request_type | `after_sales_cases.case_type` | CANCEL/RETURN/ONLY_REFUND |
| shipping_type | `after_sales_cases.return_method` | |
| is_rtm | `after_sales_cases.return_to_merchant` | |
| reverse_order_line_id | 新增 `after_sales_lines.external_line_id` | 售后行主键 |
| trade_order_line_id | `after_sales_lines.order_line_id` | 关联订单行 |
| refund_amount | 新增 `refunds.amount` + `refunds.currency` | 保留原始分/单位 |
| reason_code / reason_text | `after_sales_lines.reason_code` / `reason_text` | |
| whqc_decision | `after_sales_lines.qc_decision` | |
| reverse_status | `after_sales_lines.platform_status` | |
| tracking_number | 新增 `return_shipments.tracking_number` | 退货物流 |
| buyer.user_id | `after_sales_cases.buyer_external_id` | |
| history | 新增 `after_sales_events` | 沟通/操作时间线 |

## 9. 官方来源

- 分类目录：<https://open.daraz.com/handler/share/apidoc/getApiCategory.json?cid=23>
- GetReverseOrdersForSeller：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Freverse%2Fgetreverseordersforseller&methodType=GET%2FPOST&categoryId=23>
- GetReverseOrderDetail：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Forder%2Freverse%2Freturn%2Fdetail%2Flist&methodType=GET&categoryId=23>
- GetReverseOrderHistoryList：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Forder%2Freverse%2Freturn%2Fhistory%2Flist&methodType=GET&categoryId=23>
- GetReverseOrderReasonList：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Forder%2Freverse%2Freason%2Flist&methodType=GET&categoryId=23>
- OrderCancelValidate：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Forder%2Freverse%2Fcancel%2Fvalidate&methodType=GET&categoryId=23>
- InitReverseOrderCancel：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Forder%2Freverse%2Fcancel%2Fcreate&methodType=GET&categoryId=23>
