# 裸金属订单同步：折扣与支付拆分字段更新方案

**版本**：v1.1（2026-07-01）  
**状态**：**已实施**

---

## 1. 背景

算算力平台 `POST /admin/metal_order/list` 接口在订单列表 `result[]` 中新增/调整了金额相关字段，CRM 当前同步逻辑仍按旧口径将 `total_price` 同时写入 `order_amount` 与 `final_amount`，且 `balance_amount`、`coupon_amount` 固定为 `0`，导致：

- 订单详情页「余额支付 / 算力券支付」始终为 0；
- CRM 租户裸金属订单列表的余额/券拆分不准确；
- 裸金属日消耗同步（`bare-metal-daily-consumption.ts`）依赖 `couponAmount / finalAmount` 比例，券占比为 0；
- 财务 Raw 导入使用的 `final_amount` 语义需与平台「折后应付」对齐。

---

## 2. 平台 API 新字段语义

### 2.1 完整响应格式

```json
{
  "code": "0000",
  "message": "success",
  "data": {
    "count": 1,
    "results": [
      {
        "order_id": 1595,
        "order_no": "1781790999562",
        "status": "Finished",
        "tenant_id": 984,
        "buy_count": 1,
        "device_count": 1,
        "total_price": 28000000,
        "old_total_price": 28000000,
        "discount_price": 0,
        "create_time": "2026-06-18 21:56:39.547577 +08:00",
        "billing_type": "Hour",
        "idc_name": "天津一区机房",
        "zone_name": "天津一区",
        "zone_id": 14,
        "gpu_models": [
          {
            "gpu_model": "5090",
            "gpu_count": 8,
            "order_details_id": 1592,
            "order_detail_status": "Finished",
            "total_price": 28000000,
            "is_paid": true
          }
        ],
        "cancel_total_price": 0,
        "device_id": 101,
        "is_paid": true
      }
    ]
  }
}
```

> CRM 封装层从 `data.results[]` 取行；`code` / `message` 由 OpenAPI 客户端统一校验。

### 2.2 字段定义

| 平台字段 | 业务含义 | 说明 |
|----------|----------|------|
| `old_total_price` | **折扣前原价** | 订单原始金额（未做商业折扣） |
| `total_price` | **折后应付总额** | 给用户折扣后的订单应付金额 |
| `discount_price` | **算力券抵扣金额** | 从应付总额中由算力券支付的部分 |
| — | **余额支付 / 确认收入** | `total_price - discount_price`（平台未单独返回，需 CRM 计算）；**不含算力券，即 CRM 确认收入口径** |

### 2.3 金额关系（平台口径）

```
商业折扣金额 = old_total_price - total_price
余额支付     = total_price - discount_price
算力券支付   = discount_price
折后应付     = total_price = 余额支付 + 算力券支付
```

> **注意**：平台字段名 `discount_price` 表示「算力券金额」，**不是**「商业折扣金额」。商业折扣应通过 `old_total_price - total_price` 推导。

### 2.4 金额单位

与现网一致：`PLATFORM_METAL_ORDER_LIST_AMOUNT_DIVISOR = 1_000_000`（10⁶ 平台单位 = 1 元）。  
换算函数：`platformMetalOrderListAmountToMoneyString`（`tenant-billing-import-utils.ts`）。

---

## 3. CRM 现有表结构与缺口

### 3.1 `bare_metal_order` 相关列（已有，无需 migration）

| DB 列 | 当前同步写入 | 目标语义 |
|-------|--------------|----------|
| `order_amount` | `total_price` ❌ | **`old_total_price`**（订单总金额 / 折扣前原价） |
| `final_amount` | `total_price` | **`total_price`**（折后应付总额）✅ 字段选对、旧 API 下二者相同 |
| `coupon_amount` | 默认 `'0'` ❌ | **`discount_price`**（算力券金额） |
| `balance_amount` | 默认 `'0'` ❌ | **`total_price - discount_price`**（余额支付 = **确认收入**，不含算力券） |
| `refund_amount` | `cancel_total_price` | 不变 |

**CRM 列语义（已确认）**：

| DB 列 | 业务含义 |
|-------|----------|
| `order_amount` | 订单总金额（折扣前原价） |
| `final_amount` | 折后应付总额（余额 + 算力券） |
| `coupon_amount` | 算力券支付 |
| `balance_amount` | **确认收入**（余额实付，**不含算力券**） |

### 3.2 「折扣金额」字段策略

用户要求「增加折扣金额字段」。CRM 头表 **尚无** 独立的 `discount_amount` 列。两种方案：

| 方案 | 做法 | 优点 | 缺点 |
|------|------|------|------|
| **A（推荐）** | **不新增 DB 列**；折扣金额 = `order_amount - final_amount`，在 DTO / UI 读层推导 | 零 migration；与 `order_amount`、`final_amount` 不冗余 | 无法单独索引；历史脏数据需靠重同步修复 |
| B | 新增 `discount_amount numeric(15,4)` 列，同步时写入 `old_total_price - total_price` | 可查询、可审计 | 需 migration + 回填；与 `order_amount - final_amount` 冗余 |

**推荐方案 A**：现有四列已能完整表达支付拆分；「折扣金额」作为展示字段由 `order_amount - final_amount` 计算即可。若后续报表需按商业折扣聚合，再评估方案 B。

---

## 4. 字段映射（目标）

### 4.1 `metal_order/list` → `bare_metal_order`

| 平台字段 | DB 列 | 映射规则 |
|----------|-------|----------|
| `old_total_price` | `order_amount` | `platformMetalOrderListAmountToMoneyString(old_total_price)` |
| `total_price` | `final_amount` | `platformMetalOrderListAmountToMoneyString(total_price)` |
| `discount_price` | `coupon_amount` | `platformMetalOrderListAmountToMoneyString(discount_price ?? 0)` |
| — | `balance_amount` | `platformMetalOrderListAmountToMoneyString(total_price - (discount_price ?? 0))` |
| `cancel_total_price` | `refund_amount` | 不变 |
| 推导 | （展示）折扣金额 | `parseMoney(order_amount) - parseMoney(final_amount)`，不落库（方案 A） |

### 4.2 兼容旧 API（字段缺失）

平台若暂未全量返回新字段，同步层应做降级：

| 场景 | 处理 |
|------|------|
| `old_total_price` 缺失 | 回退为 `total_price`；`match_flags.amount_legacy_fallback = true` |
| `discount_price` 缺失 | 视为 `0`；`balance_amount = final_amount` |
| 校验：`balance + coupon ≈ final` | 允许 ±0.0001 元误差；超出则 `match_flags.payment_split_mismatch = true` 并写 warn 日志 |

### 4.3 明细行（`bare_metal_order_device`）

列表 `gpu_models[].total_price` 与 `details.order_details[].total_price` **仍为行级应付/行金额**，本次 **不改动** 明细 `line_amount` 映射。

头表 `balance_amount` / `coupon_amount` 写入后，详情页已有逻辑会按 `line_amount` 比例分摊到设备行（`allocateBareMetalDevicePaymentAmounts`，`bare-metal-order.ts`），**无需改分摊算法**。

---

## 5. 代码变更清单（实施时）

### 5.1 API 层

**文件**：`apps/web/src/lib/server/integrations/suanli-billing-api.ts`

| 变更 | 说明 |
|------|------|
| `PlatformMetalOrderRecord` 类型 | 增加 `old_total_price?: number`、`discount_price?: number` |
| `mapMetalOrderListRow` | 解析上述两字段；`zone_name`、`zone_id`、`device_id` 等继续留在 `platform_payload` 快照 |

### 5.2 同步核心

**文件**：`apps/web/src/lib/server/dataaccess/supplier/bare-metal-order-sync.ts`

在 `upsertPlatformBareMetalOrder` 的 `headValues` 中：

```typescript
// 伪代码 — 实施参考
const oldTotal = record.old_total_price ?? record.total_price
const discountedTotal = record.total_price
const couponRaw = record.discount_price ?? 0
const balanceRaw = discountedTotal - couponRaw

orderAmount: platformMetalOrderListAmountToMoneyString(oldTotal),
finalAmount: platformMetalOrderListAmountToMoneyString(discountedTotal),
couponAmount: platformMetalOrderListAmountToMoneyString(couponRaw),
balanceAmount: platformMetalOrderListAmountToMoneyString(balanceRaw),
```

可选：抽取 `mapPlatformMetalOrderPaymentAmounts(record)` 纯函数，便于单测。

**调用方**（逻辑不变，自动受益）：

- `bare-metal-order-scheduled-sync.ts`（Cron / 手动补同步）
- `bare-metal-order-sync-errors.ts`（失败重试）

### 5.3 文档同步

| 文件 | 变更 |
|------|------|
| `platform-metal-order-api-field-mapping.md` | §3 金额表、§4.1 映射表、§5.1 未落库字段（移除 balance/coupon 默认 0 说明） |
| `bare-metal-order-schema-design.md` | §5.1 金额列语义补充商业折扣 vs 算力券 |

### 5.4 UI / DTO（可选增强）

| 文件 | 变更 |
|------|------|
| `bare-metal-order-api.ts` | 详情 DTO 增加可选 `discountAmount?: string`（读层计算） |
| `bare-metal-order-detail-content.tsx` | 订单金额区块增加「折扣金额」展示（`orderAmount - finalAmount`） |
| `bare-metal-orders-content.tsx` | 列表可选增加「算力券 / 余额」列（非必须，详情已有） |

> 详情页已展示「订单金额 / 实付金额 / 余额支付 / 算力券支付」，同步修复后 **无需改 UI 即可看到正确数值**；「折扣金额」为增量展示。

### 5.5 不需改动的模块

| 模块 | 原因 |
|------|------|
| 线下 Excel 导入（`bare-metal-order-offline-import.ts`） | 独立路径，字段来源不同 |
| 明细 device/details 拉取链路 | 金额以 details 行 `total_price` 为准，与头表支付拆分正交 |
| `allocateBareMetalDevicePaymentAmounts` | 已按头表 balance/coupon 分摊 |
| DB migration | 方案 A 下无 schema 变更 |

---

## 6. 下游影响

### 6.1 裸金属日消耗（`bare-metal-daily-consumption.ts`）

当前按 `voucherRatio = couponAmount / finalAmount` 将设备行 `line_amount` 拆成券/余额日消费。  
同步写入正确 `coupon_amount` 后，**下次日消耗同步自动生效**；建议对受影响租户触发一次补算（或等待账单导入附带触发）。

### 6.2 财务 Raw 导入（`baremetal-db-import.ts`）

Raw 行 `final_amount` 列写入 **确认收入**，来源为头表 **`balance_amount`**（不含算力券）。  
`order_amount` 写入 Raw 的 `order_amount` 列（折扣前原价）。  
线下导入订单若未拆分券/余额（`coupon_amount = 0` 且 `balance_amount = 0`），回退使用 `final_amount`。

### 6.3 CRM 租户订单列表（`bare-metal-order-list.ts`）

已读取 `finalAmount`、`balanceAmount`、`couponAmount`；同步修复后直接正确。

---

## 7. 数据回填

| 方式 | 说明 |
|------|------|
| **自然回填（推荐）** | 裸金属 Cron（默认每小时）或手动补同步重跑 `upsertPlatformBareMetalOrder`，按 `platform_order_id` 幂等 UPDATE |
| **一次性补跑** | 对历史窗口执行 `mode=backfill` 的 scheduled sync（若环境已配置 `BARE_METAL_ORDER_SYNC_ENABLED`） |
| **校验 SQL** | 同步后抽样：`coupon_amount + balance_amount ≈ final_amount`；`order_amount >= final_amount`（有商业折扣时） |

无需单独 SQL 批量 UPDATE：平台 list 接口为权威来源，重同步即可。

---

## 8. 校验与观测

### 8.1 同步时校验

```typescript
// 伪代码
const final = platformMetalOrderListAmountToRmb(record.total_price)
const coupon = platformMetalOrderListAmountToRmb(record.discount_price ?? 0)
const balance = final - coupon
if (Math.abs(balance + coupon - final) > 0.0001) {
  matchFlags.payment_split_mismatch = true
}
if (record.old_total_price != null && record.old_total_price < record.total_price) {
  matchFlags.old_total_less_than_total = true // 异常数据
}
```

### 8.2 日志

在 `bare-metal-order-sync` upsert 成功日志中增加：`orderAmount`、`finalAmount`、`couponAmount`、`balanceAmount`（脱敏仅金额，无 PII）。

### 8.3 单测建议

| 用例 | 输入 | 期望 |
|------|------|------|
| 无券无折扣 | old=28M, total=28M, discount=0 | order=28, final=28, coupon=0, balance=28 |
| 有商业折扣 | old=30M, total=28M, discount=0 | order=30, final=28, 展示折扣=2 |
| 有算力券 | old=28M, total=28M, discount=5M | coupon=5, balance=23 |
| 折扣+券 | old=30M, total=28M, discount=3M | order=30, final=28, coupon=3, balance=25 |
| 缺 old_total_price | total=28M | order=28, `amount_legacy_fallback` |

---

## 9. 实施步骤（建议顺序）

1. **API 类型与 mapper**：`suanli-billing-api.ts` 增加字段解析  
2. **同步映射**：`bare-metal-order-sync.ts` 更新四列 + match_flags  
3. **单测**：支付金额映射函数  
4. **文档**：更新 `platform-metal-order-api-field-mapping.md`  
5. **（可选）UI**：详情页增加「折扣金额」  
6. **验证**：staging 跑一轮 Cron / 手动 sync，抽查订单 1595 类样例  
7. **生产**：启用同步后观察 `match_flags.payment_split_mismatch` 计数  

---

## 10. 风险与待确认

| 项 | 说明 | 建议 |
|----|------|------|
| `gpu_models[].total_price` 与头表 `total_price` 不一致 | 行级金额可能仍为折前或折后，需平台确认 | 以头表三字段为准；明细 `line_amount` 保持 details 接口；不一致记 `match_flags` |
| `old_total_price` 全量上线时间 | 老订单可能缺字段 | 回退 `total_price` + flag |
| 字段命名混淆 | API `discount_price` = 算力券，非商业折扣 | 文档与代码注释明确；UI 用「算力券支付」而非「折扣价」 |
| 财务口径 | ~~`final_amount` 是否等于「确认收入」~~ | **已确认**：`balance_amount` = 确认收入（不含算力券）；`final_amount` = 折后应付总额 |

---

## 11. 修订记录

| 日期 | 版本 | 说明 |
|------|------|------|
| 2026-07-01 | v1.0 | 初版：平台 list 新增 `old_total_price` / `discount_price` 后的 CRM 同步方案 |
| 2026-07-01 | v1.1 | 补充完整 API 响应；确认 `balance_amount` = 确认收入；实施代码 |
