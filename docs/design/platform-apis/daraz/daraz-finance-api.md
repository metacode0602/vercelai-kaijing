# Daraz 财务（Finance）API 字段说明与使用方法

> 核验日期：2026-11-05。来源：Daraz 官方 API Reference（Finance 分类 `cid=4`）。
> 官方入口：<https://open.daraz.com/doc/api.htm>
>
> Finance 分类官方仅公开 2 个接口：结算单状态与交易明细。没有发票、税率配置、广告费、提现发起等接口。

## 1. 接口清单

| 接口 | 方法 | 路径 | 用途 |
|---|---|---|---|
| GetPayoutStatus | GET | `/finance/payout/status/get` | 查询指定日期后创建的结算单（statement） |
| QueryTransactionDetails | GET | `/finance/transaction/details/get` | 按时间范围查询交易明细 |

## 2. 结算单与交易明细的关系

```text
Statement（结算单）
  ├─ statement_number      平台结算单号
  ├─ opening_balance       期初余额
  ├─ closing_balance       期末余额
  ├─ item_revenue          商品收入
  ├─ shipment_fee          运费成本
  ├─ refunds               退款合计
  ├─ fees_total            支付手续费 + 退货给卖家费用
  ├─ fees_on_refunds_total 退款相关费用
  ├─ guarantee_deposit     保证金
  └─ payout                应打款金额
        ↑
Transaction Detail（交易明细，逐条费用/收入）
  ├─ transaction_number    平台交易号
  ├─ statement             所属结算单
  ├─ order_no / orderItem_no
  ├─ amount / VAT / WHT
  └─ transaction_type / fee_name
```

- 结算单是汇总层；交易明细是行级证据。
- `payout` 是“本结算单应打款金额”，不等于银行已到账金额。
- `paid = 1` 表示平台标记已打款；银行到账仍需以回单/流水为准。

## 3. GetPayoutStatus — `GET /finance/payout/status/get`

### 3.1 请求

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| created_after | String | 是 | 结算单创建时间下界 | 官方要求必填；只返回该日期之后创建的 statement |

> 官方未声明 `created_after` 的精确格式和最大时间跨度；建议使用 ISO 8601 日期，并按站点实测调整。

### 3.2 响应（`data[]`）

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| statement_number | String | 是 | 结算单号 | 幂等主键 |
| created_at | String | 是 | 结算单创建时间 | |
| updated_at | String | 是 | 最后更新时间 | |
| opening_balance | String | 是 | 期初余额 | 字符串金额 |
| closing_balance | String | 是 | 期末余额 | 字符串金额 |
| item_revenue | String | 是 | 商品收入 | |
| other_revenue_total | String | 是 | 其他收入合计 | |
| subtotal1 | String | 是 | 商品收入 + 其他收入 | |
| refunds | String | 是 | 退款合计 | |
| subtotal2 | String | 是 | `subtotal1 - refunds` | |
| shipment_fee | String | 是 | 运费成本 | |
| shipment_fee_credit | String | 是 | 运费抵扣/返还 | |
| fees_total | String | 是 | 支付手续费 + 退货给卖家费用 | |
| fees_on_refunds_total | String | 是 | 退款累计费用 | |
| guarantee_deposit | String | 是 | 保证金 | |
| payout | String | 是 | 应打款金额 | |
| paid | String | 是 | 打款状态 | `1` 已打款，`0` 未打款 |

### 3.3 使用方法

```text
GET /finance/payout/status/get?created_after=2026-01-01
  → 按 statement_number upsert settlements
  → 用 subtotal1 - refunds 校验 subtotal2
  → 用 payout 与银行流水对账
  → paid 变化写 settlement_events
```

- 金额全部是 String；落库前用 Decimal 解析，禁止浮点。
- 官方响应没有币种字段；币种按店铺站点确定，不能跨站混算。
- 结算单可能重发/更新；以 `updated_at` 为准做覆盖。

## 4. QueryTransactionDetails — `GET /finance/transaction/details/get`

### 4.1 请求

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| start_time | String | 是 | 开始时间 | 交易发生时间下界 |
| end_time | String | 是 | 结束时间 | 交易发生时间上界 |
| offset | String | 否 | 跳过条数 | 字符串数字 |
| limit | String | 否 | 返回条数 | 官方最大 500 |
| trans_type | String | 否 | 交易类型 ID | 官方未提供枚举表 |
| trade_order_id | String | 否 | 订单 ID | |
| trade_order_line_id | String | 否 | 订单项 ID | |

### 4.2 响应（`data[]`）

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| transaction_number | String | 官方未标 | 交易唯一号 | 格式 `Seller code-xxxxxxx`；幂等主键 |
| transaction_date | String | 官方未标 | 交易日期 | |
| transaction_type | String | 官方未标 | 交易类型/费用名 | |
| fee_type | String | 官方未标 | 交易类型 ID | |
| fee_name | String | 官方未标 | 费用名称 | |
| details | String | 官方未标 | 交易明细描述 | |
| amount | String | 官方未标 | 交易总额 | 含税/不含税以平台为准 |
| VAT_in_amount | String | 官方未标 | 金额中的 VAT | |
| WHT_amount | String | 官方未标 | 预扣税金额 | |
| WHT_included_in_amount | String | 官方未标 | WHT 是否已含在 amount | |
| statement | String | 官方未标 | 所属结算单号 | 关联 `statement_number` |
| paid_status | String | 官方未标 | 是否已结算 | `Yes` / `No` |
| order_no | String | 官方未标 | 订单 ID | |
| orderItem_no | String | 官方未标 | 订单项编号 | |
| orderItem_status | String | 官方未标 | 订单项状态 | |
| reference | String | 官方未标 | 订单项 ID | 对应 `trade_order_line_id` |
| seller_sku | String | 官方未标 | 卖家 SKU | |
| lazada_sku | String | 官方未标 | 平台 SKU | 官方字段名仍为 lazada_sku |
| shipping_provider | String | 官方未标 | 物流商 | |
| shipping_speed | String | 官方未标 | 配送速度 | |
| shipment_type | String | 官方未标 | 发货类型 | |
| comment | String | 官方未标 | 区域财务备注 | |
| payment_ref_id | String | 官方未标 | 银行/支付渠道流水号 | 对账关键 |

### 4.3 使用方法

```text
按天/周切片：
GET /finance/transaction/details/get
  ?start_time=2026-10-01&end_time=2026-10-31&limit=500&offset=0
  → 按 transaction_number upsert settlement_lines
  → 用 order_no / reference 关联订单与订单行
  → 用 statement 关联 settlements
  → 汇总 amount 与 statement 各金额字段交叉校验
```

- 官方只保证 `limit` 最大 500；没有声明单次时间跨度上限，实际仍建议按天/周切片，避免超时。
- `WHT_included_in_amount` 决定税额是否重复扣减，必须按原值保存后再计算。
- `VAT_in_amount`、`WHT_amount` 是金额还是比率，官方字段名未说明；先按金额字符串保存，不能直接当税率。
- 交易明细没有币种字段，币种按店铺站点确定。

## 5. 对账建议

| 校验 | 方法 | 处理 |
|---|---|---|
| 结算单内部勾稽 | `subtotal1 = item_revenue + other_revenue_total`；`subtotal2 = subtotal1 - refunds` | 不等则标记异常 |
| 交易明细汇总 | 按 `statement` 汇总 `amount`，与结算单对应项比较 | 差异进入人工复核 |
| 订单关联 | `order_no` → `orders`；`reference` → `order_lines` | 未匹配进入 mapping_exceptions |
| 退款关联 | `transaction_type` / `fee_name` 含退款语义时关联售后 | 不能只按金额猜 |
| 打款状态 | `settlements.paid` + `payment_ref_id` + 银行流水 | 三方一致才自动核销 |

## 6. 字段与 ERP 映射建议

| API 字段 | ERP 表/字段 | 说明 |
|---|---|---|
| statement_number | `settlements.external_statement_id`（建议新增） | 结算单主键 |
| opening_balance / closing_balance | 新增 `settlements.opening_balance` / `closing_balance` | numeric |
| item_revenue / other_revenue_total | 新增收入拆分列 | |
| refunds | 新增 `settlements.refunds` | |
| shipment_fee / shipment_fee_credit | 新增运费列 | |
| fees_total / fees_on_refunds_total | 新增费用列 | |
| guarantee_deposit | 新增保证金列 | |
| payout / paid | 新增 `settlements.payout` / `payout_status` | |
| transaction_number | 新增 `settlement_lines.external_transaction_id` | 交易行主键 |
| statement | `settlement_lines.settlement_id` | 关联结算单 |
| order_no / reference | `settlement_lines.order_id` / `order_line_id` | |
| amount / VAT_in_amount / WHT_amount | 新增金额拆分列 | 保留原始字符串到 raw |
| transaction_type / fee_type / fee_name | 新增费用类型列 | |
| payment_ref_id | 新增 `settlement_lines.payment_reference` | 银行对账 |

## 7. 官方来源

- 分类目录：<https://open.daraz.com/handler/share/apidoc/getApiCategory.json?cid=4>
- GetPayoutStatus：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Ffinance%2Fpayout%2Fstatus%2Fget&methodType=GET&categoryId=4>
- QueryTransactionDetails：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Ffinance%2Ftransaction%2Fdetails%2Fget&methodType=GET&categoryId=4>
