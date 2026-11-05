# Lazada 财务（Finance）API

> 核验日期：2026-11-05。来源：Lazada 官方 API Reference（Finance `cid=9`，4 个接口）。
> 官方入口：<https://open.lazada.com/doc/api.htm>
> 通用签名、host、分页约定见 `lazada-common-conventions.md`。
> 售后退款金额单位不同，见 `lazada-aftersales-api.md` §4.3。

## 1. 接口清单

| 接口 | 方法 | 路径 | 用途 | 集成标记 |
|---|---|---|---|---|
| GetPayoutStatus | GET | `/finance/payout/status/get` | 查结算单/打款状态 | 日对账 |
| QueryAccountTransactions | POST | `/finance/transaction/accountTransactions/query` | 账户流水（充值/提现/付款） | 日对账 |
| QueryTransactionDetails | GET | `/finance/transaction/details/get` | 订单级交易明细 | 明细对账 |
| QueryLogisticsFeeDetail | GET/POST | `/lbs/slb/queryLogisticsFeeDetail` | 物流费明细 | 成本核对 |

## 2. GetPayoutStatus — `GET /finance/payout/status/get`

### 2.1 请求

| 字段 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| created_after | String | 是 | 结算单创建时间下界 | 日期，示例 `2018-01-01` |

### 2.2 响应 `data[]`

| 字段 | 类型 | 含义 | 说明 |
|---|---|---|---|
| statement_number | String | 结算单号 | 幂等键 |
| created_at | String | 创建时间 | `yyyy-MM-dd HH:mm:ss` |
| updated_at | String | 更新时间 | `yyyy-MM-dd HH:mm:ss` |
| opening_balance | String | 期初余额 | |
| closing_balance | String | 期末余额 | |
| guarantee_deposit | String | 保证金 | |
| payout | String | 应打款金额 | 示例含币种 `3962.41 EUR` |
| paid | String | 打款状态 | `1` 已打款，`0` 未打款 |
| item_revenue | String | 商品收入 | |
| shipment_fee | String | 运费支出 | |
| shipment_fee_credit | String | 运费补贴/抵扣 | |
| other_revenue_total | String | 其他收入合计 | |
| fees_total | String | 支付费+退货给卖家费合计 | |
| subtotal1 | String | 商品收入+其他收入 | |
| refunds | String | 退款合计 | |
| fees_on_refunds_total | String | 退款相关费用 | |
| subtotal2 | String | `subtotal1 - refunds` | 官方描述 |

- `payout` 示例带币种后缀，不能直接 `parseFloat`；需剥离币种。
- `paid` 是字符串 `"0"/"1"`，不是 Boolean。
- 结算单金额与订单/退款明细需用 `statement_number` 关联。

## 3. QueryAccountTransactions — `POST /finance/transaction/accountTransactions/query`

### 3.1 请求

| 字段 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| page_size | Number | 是 | 每页数量 | |
| page_num | Number | 是 | 页码 | 从 1 开始 |
| start_time | String | 是 | 开始日期 | `yyyyMMdd` |
| end_time | String | 是 | 结束日期 | `yyyyMMdd` |
| transaction_type | String | 否 | 主类型 | `Deposit` / `Withdrawal` / `Payment` / `null` |
| sub_transaction_type | String | 否 | 子类型 | `Settlement` / `Failed Payment` / `Returned Payment` / `Auto Withdrawal` / `Manual Withdrawal` / `Sponsored Solutions Top-up` / `null` |
| transaction_number | String | 否 | 交易号 | |

### 3.2 响应

| 字段 | 类型 | 含义 |
|---|---|---|
| data.page_info.page_num / page_size / total_page / total_count | Number | 分页 |
| data.transactions[].transaction_number | String | 交易号 |
| ...pmt_reference | String | 银行/支付参考号 |
| ...transaction_time | String | 交易时间 `yyyy-MM-dd HH:mm:ss` |
| ...type | String | 主类型（本地化展示） |
| ...sub_type | String | 子类型（本地化展示） |
| ...amount | String | 金额，可能带 `+/-` |
| ...currency | String | 币种 |
| ...payee_account.account / description | String | 收款账户 |
| ...remarks | String | 备注 |
| ...tracking_list[].name | String | 状态机名称，如 `WITHDRAWAL_INITIATED` |
| ...tracking_list[].status | String | 状态展示文案（本地化） |
| ...tracking_list[].update_time | String | 更新时间 |
| ...tracking_list[].remark | String | 备注 |
| success / error_code / msg | Boolean/String | 批次结果 |

- `type` / `sub_type` 示例为本地化文案（如印尼语），过滤应使用请求参数枚举，不要匹配响应文案。
- 金额是字符串，保留符号；入账时按 `currency` + 符号解析。
- `tracking_list` 是状态历史，不是当前状态单值。

## 4. QueryTransactionDetails — `GET /finance/transaction/details/get`

### 4.1 请求

| 字段 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| start_time | String | 是 | 开始日期 | `yyyy-MM-dd` |
| end_time | String | 是 | 结束日期 | `yyyy-MM-dd` |
| limit | String | 否 | 返回行数 | 最大 500 |
| offset | String | 否 | 跳过行数 | |
| trans_type | String | 否 | 交易类型 ID | 默认 `-1` |
| trade_order_id | String | 否 | 订单 ID | |
| trade_order_line_id | String | 否 | 订单项 ID | |

### 4.2 响应 `data[]`

| 字段 | 类型 | 含义 | 说明 |
|---|---|---|---|
| transaction_number | String | 交易唯一号 | 格式 `Seller code-xxxx` |
| transaction_date | String | 交易日期 | `dd MMM yyyy` 等，逐站点可能不同 |
| transaction_type | String | 交易/费用名称 | |
| fee_type | String | 费用类型 ID | |
| fee_name | String | 费用名称 | |
| details | String | 明细描述 | |
| amount | String | 交易金额 | 含正负 |
| VAT_in_amount | String | 金额中的 VAT | |
| WHT_amount | String | 预扣税 | |
| WHT_included_in_amount | String | WHT 是否含在金额内 | `Yes`/`No` |
| statement | String | 结算单/周期 | |
| paid_status | String | 打款状态 | `Paid` / `Not paid` |
| order_no | String | 订单号 | |
| orderItem_no | String | 订单项号 | |
| orderItem_status | String | 订单项状态 | |
| seller_sku | String | 卖家 SKU | |
| lazada_sku | String | 平台 SKU | |
| shipping_provider | String | 物流商 | |
| shipping_speed | String | 配送时效 | |
| shipment_type | String | 履约类型 | `Dropshipping` 等 |
| reference | String | 订单项 ID | |
| payment_ref_id | String | 支付参考号 | |
| comment | String | 财务备注 | |

- 单次最多 500 行，全量对账需按日期窗口分段。
- `transaction_number` 是幂等键；同一订单可能多行费用。
- `amount` 与 `VAT_in_amount`、`WHT_amount` 的关系需按站点财务规则确认，不要自行反推含税/不含税。

## 5. QueryLogisticsFeeDetail — `GET/POST /lbs/slb/queryLogisticsFeeDetail`

### 5.1 请求

| 字段 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| seller_id | String | 是 | 卖家 ID | |
| request_type | String | 是 | 调用来源 | 固定 `OPEN_API` |
| trade_order_id | String | 否 | 订单 ID | |
| trade_order_line_id | String | 否 | 订单项 ID | |
| fee_type | String | 否 | 费用类型 | 示例 `COD` |
| biz_flow_type | String | 否 | 结算场景 | `LAZADA` / `LAZADA_3PV`，默认 `LAZADA` |
| bill_start_time | Number | 否 | 账单开始 | 毫秒时间戳 |
| bill_end_time | Number | 否 | 账单结束 | 毫秒时间戳 |
| page_no | Number | 否 | 页码 | 默认 1 |
| page_size | Number | 否 | 每页数量 | 默认 20 |

### 5.2 响应 `data[]`

| 字段 | 类型 | 含义 |
|---|---|---|
| statement_id | String | 结算单号 |
| statement_period | String | 结算周期 |
| seller_id / seller_short_code | String | 卖家 |
| trade_order_id / trade_order_line_id | String | 订单/订单项 |
| amount | Object | 记入卖家的物流费金额 |
| tax_in_amount | Object | 物流费税额 |
| fee_code | String | 费用代码，如 `shippingFeeChargedByLazada` |
| fee_name | String | 费用名称 |
| fee_creation_date | Object | Java 风格时间对象（见 5.3） |
| order_info | Object | 订单层信息 |
| package_info | Object | 包裹层信息 |
| sku_info | Object | SKU 信息 |
| currency | String | 币种 |
| tenant_id | String | 租户，如 `LAZADA_SG` |

### 5.3 特殊时间对象

`fee_creation_date`、`order_creation_date`、`billing_date`、`delivery_date` 返回 Java 序列化时间对象，不是 ISO 字符串。可用字段：

```text
year, month_value, day_of_month, hour, minute, second, nano,
zone.id, offset.total_seconds, chronology.id
```

- 必须用 `year + month_value + day_of_month + hour + minute + second + zone.id` 构造时间。
- 不能直接把整个对象字符串塞进 `timestamptz`。
- `offset.total_seconds` 是相对 UTC 的秒偏移。

### 5.4 关键子结构

| 路径 | 字段 | 含义 |
|---|---|---|
| order_info | order_item_status | 订单项状态，如 `CONFIRMED` |
| order_info | order_creation_date | 下单时间对象 |
| package_info | tracking_number | 包裹追踪号 |
| package_info | package_chargeable_weight | 计费重量（kg） |
| package_info | destination_address / origin_address | 目的地/发货地 |
| package_info | billing_date / delivery_date | 计费/送达时间对象 |
| sku_info | seller_sku / lazada_sku | SKU |
| sku_info | item_details | 商品明细 |

- 物流费按包裹/订单项拆分行，不能只汇总到订单。
- `amount`、`tax_in_amount` 官方标为 Object，实际解析按响应数值/结构处理。

## 6. 对账建议

| 维度 | 数据源 | 幂等键 |
|---|---|---|
| 结算单 | GetPayoutStatus | `statement_number` |
| 账户流水 | QueryAccountTransactions | `transaction_number` |
| 订单费用明细 | QueryTransactionDetails | `transaction_number` |
| 物流费 | QueryLogisticsFeeDetail | `statement_id + trade_order_line_id + fee_code` |
| 退款 | 售后接口 | `reverse_order_line_id` |

- 四类金额口径不同，不要直接相加：
  - 结算单是周期汇总；
  - 账户流水是资金动作；
  - 交易明细是订单/费用行；
  - 物流费是履约成本。
- 对账差异记录到独立表，不要回写平台原始金额。
- 日期格式逐接口不同：`yyyyMMdd`、`yyyy-MM-dd`、`yyyy-MM-dd HH:mm:ss`、`dd MMM yyyy`、毫秒时间戳、Java 时间对象。

## 7. 官方来源

| 资源 | URL |
|---|---|
| Finance 分类 | <https://open.lazada.com/handler/share/apidoc/getApiCategory.json?cid=9&language=en> |
| GetPayoutStatus | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Ffinance%2Fpayout%2Fstatus%2Fget&methodType=GET&categoryId=9> |
| QueryAccountTransactions | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Ffinance%2Ftransaction%2FaccountTransactions%2Fquery&methodType=POST&categoryId=9> |
| QueryTransactionDetails | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Ffinance%2Ftransaction%2Fdetails%2Fget&methodType=GET&categoryId=9> |
| QueryLogisticsFeeDetail | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Flbs%2Fslb%2FqueryLogisticsFeeDetail&methodType=GET%2FPOST&categoryId=9> |
