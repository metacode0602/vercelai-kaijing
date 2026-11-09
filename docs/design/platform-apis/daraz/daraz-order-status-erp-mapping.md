# Daraz 订单状态 → ERP 动作映射（锁库 / 释放 / 扣减）

> 核验日期：2026-11-05。
> 官方事实来源：Daraz API Reference Order 分类 `cid=2`，`/orders/get`、`/order/get`、`/order/items/get`。
> 官方入口：<https://open.daraz.com/doc/api.htm>
>
> **结论先行：官方 API 文档只给出状态枚举，没有给出状态迁移规则，也没有定义“何时锁库/释放/扣减”。**
> 因此本文把内容分成两部分：
> - “官方状态事实”：可以从官方文档直接确认；
> - “ERP 动作建议”：属于本仓库的设计建议，不是 Daraz 官方语义。

## 1. 官方能确定什么、不能确定什么

### 1.1 可以确定

| 项目 | 官方依据 |
|---|---|
| 订单查询支持的状态枚举 | `/orders/get` 的 `status` 参数：`unpaid`、`pending`、`canceled`、`ready_to_ship`、`delivered`、`returned`、`shipped`、`failed`；白名单另有 `topack`、`toship` |
| 订单项有独立状态 | `/order/items/get` 返回 `status`、`return_status` |
| 取消/退货发起方 | `cancel_return_initiator`：`cancellation-internal`、`cancellation-customer`、`cancellation-failed Delivery`、`cancellation-seller`、`return-customer`、`refund-internal` |
| 取消/退货原因 | `reason`、`reason_detail`，原因定义在 `sales_order_reason` |
| 支付时间字段 | 订单项 `payment_time`（毫秒时间戳） |
| 发货 SLA | 订单项 `sla_time_stamp`、`promised_shipping_time`、`fulfillment_sla` |
| 包裹与追踪号 | 订单项 `package_id`、`tracking_code`、`shipment_provider` |
| 打包/RTS 动作 | `/order/fulfill/pack`、`/order/package/rts`，逐项返回 `item_err_code` |
| 售后独立数据 | `/reverse/getreverseordersforseller`、`/order/reverse/return/detail/list` |

### 1.2 不能确定

| 项目 | 原因 |
|---|---|
| 状态之间允许的迁移 | 官方没有状态机图或迁移表 |
| `pending` 是否等于“已支付” | 官方只给状态名，没有支付语义定义 |
| 锁库应发生在哪个状态 | 官方文档不涉及库存台账 |
| 扣减应发生在 pack 还是 RTS | 官方只说明动作，不定义库存归属转移 |
| `returned` 是否等于“已收到退货” | 官方没有区分退货在途、仓库签收、QC 完成 |
| 取消后是否自动释放库存 | 官方不保证；取决于卖家 ERP |
| 退款是否等于退货入库 | 否；`ONLY_REFUND` 不退货 |

> 因此，**仅凭当前 Daraz 官方文档无法唯一确定订单状态→ERP 动作映射**。下面给出可落地的推荐设计，并标注假设。

## 2. 推荐状态机与库存动作

### 2.1 核心原则

1. **以订单项（order_item）为最小履约单位**，不以订单头状态驱动库存。一个订单可能部分发货、部分退货。
2. **库存动作由事件触发，不由状态快照触发**。状态是从 `pending` 直接跳到 `ready_to_ship` 时，不能靠“当前状态”推断中间发生过什么。
3. **锁库、扣减、释放必须幂等**，用 `order_item_id + action + version` 作为幂等键。
4. **退款不等于退货入库**；只有实际收到退货并 QC 通过才回补可售库存。
5. 平台状态只存原值；ERP 内部状态单独维护，不覆盖平台字段。
6. **每个订单项记录 = 1 个商品单位**。官方字段表虽未列出 `qty` / `quantity`，但同一 SKU 多件会拆成多条不同 `order_item_id` 的记录；件数 = 去重 `order_item_id` 计数，单条记录固定 1 件。

### 2.2 状态→动作表（设计建议）

> 下表中的 `qty`：单位行模型固定为 1；聚合行模型为本次动作涉及的 `order_item_id` 条数。

| 平台状态 / 事件 | 官方状态事实 | 建议 ERP 内部状态 | 库存动作 | 触发时机 | 说明 |
|---|---|---|---|---|---|
| `unpaid` | 官方枚举 | `awaiting_payment` | 不锁库；可做短时软占用（带过期） | 订单创建 | 未支付不占用可售库存，避免长时间占用 |
| 支付成功（由 `payment_time` 或订单进入 `pending` 推断） | `payment_time` 字段存在；`pending` 为官方枚举 | `paid` | **锁库**：`reserved += qty` | 首次观察到 `payment_time` 或 `pending` | “`pending`=已支付”是假设，需用实际订单验证 |
| `topack` / `toship`（白名单） | 官方白名单枚举 | `awaiting_pack` | 保持锁库；可生成拣货任务 | 状态进入 | 白名单卖家才可见 |
| `ready_to_ship` | 官方枚举 | `packed` | 保持锁库；包裹与订单行绑定 | 打包成功 | 实物仍在仓库，不扣 `on_hand` |
| `shipped` | 官方枚举 | `shipped` | **扣减**：`on_hand -= qty`，`reserved -= qty` | 首次进入 `shipped` 或 RTS 成功 | 库存所有权转移给物流/买家 |
| `delivered` | 官方枚举 | `delivered` | 无库存动作 | 首次进入 | 可做收入确认/结算预期 |
| `canceled`（发货前） | 官方枚举；`cancel_return_initiator` 区分发起方 | `canceled` | **释放**：`reserved -= qty`；若已扣减则回补 `on_hand` | 首次进入且未 `shipped` | 已打包但未 RTS 也按未发货处理 |
| `canceled`（发货后） | 官方枚举 | `cancel_pending_return` | 不直接释放；按退货流程 | 首次进入且已 `shipped` | 需逆向单/退货签收后再决定入库 |
| `failed` | 官方枚举 | `delivery_failed` | 不直接释放/扣减 | 首次进入 | 等待重派、退回或取消结果 |
| `returned` | 官方枚举；售后详情有 `whqc_decision` | `returned` | 按 QC 决策入库：可售回补 `on_hand`；损坏入 `damaged`；报废核销 | 收到退货并完成 QC | `returned` 本身不保证已入库 |
| `ONLY_REFUND` 完成 | 售后 `request_type` | `refunded_no_return` | 不回补库存 | 退款完成 | 仅退款不退货 |
| `RETURN` 退款完成但未收到货 | 售后状态 + 物流 | `refund_pending_return` | 不释放/不回补 | 退款先于退货 | 防止“钱退了货没回”导致库存虚增 |
| `CANCEL` 售后完成 | 售后 `request_type=CANCEL` | `canceled` | 同取消规则 | 售后完成 | |
| `unknown` / 未识别 | 官方未定义 | `unknown` | 不动作，进入人工队列 | 同步时 | 禁止猜测 |

### 2.3 锁库/释放/扣减节点总结

| 动作 | 建议节点 | 前置条件 | 反向动作 |
|---|---|---|---|
| 锁库 | 支付成功 | `payment_time` 存在或状态进入 `pending` | 取消/超时 → 释放 |
| 释放 | 发货前取消 | 未进入 `shipped` | 无 |
| 扣减 | RTS/进入 `shipped` | 包裹已交接 | 退货入库/取消回补 |
| 回补 | 退货 QC 通过 | `whqc_decision` 为可退商家/仓库且质检可售 | 再次出库时重新扣减 |
| 转损坏 | 退货 QC 不合格 | `whqc_decision` 非可售 | 报废/核销 |
| 不动 | 仅退款、配送失败待定、状态未知 | — | 人工复核 |

> 如果业务选择“打包即扣减”，必须接受“已打包但未交接”期间的库存差异，并在包裹丢失/取消时做反向调整。推荐仍以 RTS/`shipped` 为扣减点。

## 3. 事件模型（建议）

仅存当前状态无法审计“何时锁/放/扣”。建议新增：

### 3.1 `order_status_events`

| 字段 | 类型 | 含义 |
|---|---|---|
| id | text | 主键 |
| organization_id | text | 租户 |
| shop_id | text | 店铺 |
| order_id | text | 本地订单 |
| order_line_id | text | 本地订单行，可空（订单头事件） |
| external_order_id | text | 平台订单 ID |
| external_line_id | text | 平台订单项 ID |
| source | varchar | `order` / `reverse` / `logistics` / `manual` |
| from_status | varchar | 变更前 |
| to_status | varchar | 变更后 |
| platform_status | varchar | 平台原值 |
| event_time | timestamptz | 平台事件时间 |
| observed_at | timestamptz | 本地观察时间 |
| raw | jsonb | 原始事件 |
| dedupe_key | text | 唯一键，如 `shop:line:status:event_time` |

唯一索引：`(organization_id, dedupe_key)`。

### 3.2 `inventory_movements`

| 字段 | 类型 | 含义 |
|---|---|---|
| id | text | 主键 |
| organization_id | text | 租户 |
| variant_id | text | 内部 SKU |
| warehouse_code | varchar | 仓库 |
| bin_code | varchar | 库位 |
| movement_type | varchar | `reserve` / `release` / `ship` / `return_restock` / `damage` / `adjust` |
| qty | integer | 正负数量 |
| reference_type | varchar | `order_line` / `after_sales_line` / `manual` |
| reference_id | text | 关联单据 |
| idempotency_key | text | 幂等键 |
| occurred_at | timestamptz | 发生时间 |
| raw | jsonb | 依据 |

唯一索引：`(organization_id, idempotency_key)`。

### 3.3 `inventory_reservations`

| 字段 | 类型 | 含义 |
|---|---|---|
| id | text | 主键 |
| organization_id | text | 租户 |
| order_line_id | text | 订单行 |
| variant_id | text | SKU |
| qty | integer | 锁定数量 |
| status | varchar | `active` / `released` / `consumed` |
| expires_at | timestamptz | 未支付软占用过期 |
| idempotency_key | text | 幂等键 |

## 4. 状态同步实现建议

```text
每 5 分钟：
  GET /orders/get?update_after=<watermark>&limt=100&sort_by=updated_at&sort_direction=ASC
    → 对每个订单 GET /order/items/get
    → 逐订单项比较 platform_status
    → 生成 order_status_events（幂等）
    → 按 2.2 表执行库存动作（幂等）
    → 更新 orders / order_lines 当前状态
    → 失败进入 mapping_exceptions / 人工队列

每 30 分钟或按需：
  GET /reverse/getreverseordersforseller?ReverseOrderLineModifiedTimeRangeStart=...
    → GET /order/reverse/return/detail/list
    → 更新售后行；QC 完成后再决定回补/损坏
```

关键实现细节：

- `statuses[]` 是订单项状态集合，不能当订单头状态。
- 状态可能跳跃（例如从 `pending` 直接到 `ready_to_ship`）；事件表要允许缺失中间态。
- `updated_at` 可能因非状态变更而更新；必须比较状态值，不能只看时间。
- 取消/退货状态需要同时看 `order_lines.status`、`return_status`、`reverse_status`，不能单看一个。
- 对于 `topack` / `toship`，只有白名单卖家会返回；非白名单不要报错。
- 平台状态值区分大小写；官方拼写是 `canceled`（单 L）、参数名是 `limt`。

## 5. 待验证事项（接入前必须做）

| 事项 | 验证方法 |
|---|---|
| `pending` 是否一定已支付 | 抽样订单对照 `payment_time` 与 Seller Center |
| `topack`/`toship` 对 LK 店铺是否可见 | 用 LK 测试店调用 `/orders/get` |
| `ready_to_ship` 与 `shipped` 的实际跳转 | 用测试订单走 pack → RTS，记录状态变化 |
| 取消后库存是否由平台回补 | 平台不管理卖家本地库存，预期不会；仍需验证 |
| `returned` 是否代表已入库 | 对照 `/order/reverse/return/detail/list` 的 `whqc_decision` |
| `refund_amount` 单位 | 用 LK 真实退款与结算单交叉验证 |
| 状态事件时间 | 订单 `updated_at` 精度、`payment_time` 时区 |
| 多件同 SKU 是否拆分 | 用真实多件订单验证返回多条不同 `order_item_id`；件数按去重记录计数 |

## 6. 官方来源

- GetOrders：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Forders%2Fget&methodType=GET&categoryId=2>
- GetOrder：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Forder%2Fget&methodType=GET%2FPOST&categoryId=2>
- GetOrderItems：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Forder%2Fitems%2Fget&methodType=GET&categoryId=2>
- Pack：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Forder%2Ffulfill%2Fpack&methodType=POST&categoryId=22>
- ReadyToShip：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Forder%2Fpackage%2Frts&methodType=POST&categoryId=22>
- 售后：<https://open.daraz.com/handler/share/apidoc/getApiCategory.json?cid=23>
