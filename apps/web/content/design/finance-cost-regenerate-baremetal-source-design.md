# 成本裸金属 · 数据库读库导入实现方案

> **过期 · 待重写**
>
> 本文档的入口、写入方或实现状态已变化，**勿按其字面实施**。裁决依据见 [矛盾台账](../../../../docs/design/audit/doc-contradictions.md)。
>
> 要点：§4 月度成本：入口清单 3 项中 2 项已删除，仅保留 Raw 读库约定


> 版本：v2.1  
> 日期：2026-07-08  
> 状态：**已实施**  
> 实现：`apps/web/src/lib/server/dataaccess/finance/baremetal-db-import.ts`  
> UI：`apps/web/src/app/[locale]/(protected)/finance/_components/baremetal-db-import-panel.tsx`  
> 入口：  
> - 添加账期弹窗 `create-billing-period-dialog.tsx`  
> - 成本重新生成 `cost-regenerate-dialog.tsx`  
> - 弹性算力提成重新生成 `commission-derive-regenerate-dialog.tsx`  
> 关联：  
> - [bare-metal-order-schema-design.md](bare-metal-order-schema-design.md)  
> - [finance-create-billing-period-dialog-plan.md](finance-create-billing-period-dialog-plan.md)

---

## 1. 背景与现行口径

### 1.1 现状（v2.1）

裸金属成本 Raw 从供应链域读库：

- **`bare_metal_order`**：订单头  
- **`bare_metal_order_device`**：设备明细  

映射后写入 `billing_period_raw_baremetal_order`，`file_type = 'baremetal_order'`，下游 `compute-cost-source-line` **零改动**。

**客户账单详情** 仍为 Excel 上传 → `billing_period_raw_tenant_bill`（本期不变）。

### 1.2 时间字段分离（v2.1 重要）

`bare_metal_order` 上 **下单时间** 与 **入库时间** 独立维护：

| 字段 | 含义 | 写入时机 |
|------|------|----------|
| `ordered_at` | 租户在平台下单时间（平台 `create_time`；线下单为明细最早 `rent_starts_at`） | 平台同步 / 线下导入时写入；UPDATE 可随平台 payload 刷新 |
| `imported_at` | 订单 **首次** 写入 CRM 的时间（平台同步 INSERT、线下 Excel commit） | **仅 INSERT**；后续 UPDATE **不修改** |
| `created_at` | ORM 行创建时间戳 | 与 `imported_at` 同源，**不用于** 财务账期筛选 |

晚补同步的历史订单：`ordered_at` 为真实下单日，`imported_at` 为首次入库日——重新生成 / 个人收入按 `imported_at` 入账期，避免与 `created_at` 语义混淆。

### 1.3 账期筛选字段

| 场景 | `periodField` | 说明 |
|------|---------------|------|
| **添加账期 / 首次成本** | `ordered_at` | 按下单时间落入账期区间（东八区） |
| **成本重新生成** | `imported_at` | 与个人收入一致，按入库时间落入账期区间 |
| **个人收入裸金属** | `imported_at` | `file_type = personal_baremetal_order`，独立 batch |

成本 Raw 内 **`ordered_at` 列** 仍存订单头 `ordered_at`（刊例价 as-of 不变）；**筛选候选订单** 的字段由上表决定。`raw_json` 额外写入 `ordered_at` / `imported_at` ISO 字符串便于审计。

### 1.4 非目标

- 不回写/修正 `bare_metal_order` 主数据（除同步 payload 常规 UPDATE）  
- 不改变 `billing_period_raw_baremetal_order` 表结构  
- 企业收入 **不** 读本路径（企业收入读 CRM `tenant_bill`，见 [finance-single-period-income-design.md](finance-single-period-income-design.md)）

---

## 2. 数据映射

（与 v1.0 §2 一致：Raw 形状、`device_model` / `purchase_qty_text` 推导、异构拆行规则。实现见 `baremetal-db-import.ts` → `mapOrderToRawRows`。）

### 2.1 支付过滤

所有路径均仅统计 **已支付** 订单（`isBaremetalPayStatusPaid`）。

### 2.2 空批次

**成本重新生成**、**个人收入** 允许账期内无订单时写入 **空 batch**（`parse_status = ok`，`row_count = 0`）。  
**首次添加账期** 成本路径仍要求至少 1 行有效 Raw（与 `syncBillingPeriodImportStatus` 一致）。

---

## 3. API（tRPC `finance.periods`）

| 过程 | 用途 |
|------|------|
| `previewBaremetalFromDb` | 成本路径预览；可选 `periodField`（`ordered_at` \| `imported_at`） |
| `importBaremetalFromDb` | 成本路径写入；可选 `periodField`、`allowEmptyImport` |
| `previewPersonalBaremetalFromDb` | 个人收入预览（固定 `imported_at`） |
| `importPersonalBaremetalFromDb` | 个人收入写入（固定 `imported_at`） |

> **兼容**：API 仍接受已废弃的 `periodField=created_at`，服务端映射为 `imported_at`。

---

## 4. 前端

`BaremetalDbImportPanel`：

| prop | 说明 |
|------|------|
| `variant="cost"` | 成本/提成；默认 `periodField=ordered_at` |
| `variant="personal"` | 个人收入；走 personal 专用 API（固定 `imported_at`） |
| `periodField="imported_at"` | 成本重新生成弹窗传入 |
| `allowEmptyImport` | 重新生成 / 个人路径允许空批次 |

按 `imported_at` 筛选时，预览表同时展示 **下单时间** 与 **入库时间** 两列，便于核对晚补同步订单。

---

## 变更记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v2.1 | 2026-07-08 | **`imported_at` 字段**：下单 / 入库时间分离；重新生成与个人收入改按 `imported_at` 筛选 |
| v2.0 | 2026-06-23 | **已实施**：裸金属全面读库；重新生成按 `created_at`；个人收入读库 |
