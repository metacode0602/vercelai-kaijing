# 个人收入（非项目租户）实现方案

> 版本：v2.0  
> 日期：2026-07-07  
> 状态：**已实施**  
> 页面：`apps/web/src/app/[locale]/(protected)/finance/[id]/personal/page.tsx`  
> 实现：`compute-personal-income.ts`、`validate-personal-income.ts`、`baremetal-db-import.ts`、`personal-income-core.ts`  
> 关联：  
> - [finance-personal-income-baremetal-source-v2-design.md](finance-personal-income-baremetal-source-v2-design.md)（v2 裸金属双源、四段汇总、对账 — 详细规格）  
> - [finance-single-period-income-design.md](finance-single-period-income-design.md)（企业收入 · CRM 账单）  
> - [finance-cost-regenerate-baremetal-source-design.md](finance-cost-regenerate-baremetal-source-design.md)（裸金属读库映射）

---

## 1. 需求摘要

| # | 需求 | 现行实现（v2.0） |
|---|------|------------------|
| R1 | 数据源 | **客户账单详情 Excel**（`personal_tenant_bill`，必填）+ **裸金属读库**（`personal_baremetal_order`，**选填**） |
| R2 | 裸金属口径 | **互斥**：读库模式（`db`）或 Excel 模式（`excel`），不可叠加；见 §2.2 |
| R3 | 四段汇总 | 每账期 **4 行** `billing_period_personal_income_summary`：`enterprise_project`、`non_project`、`blacklist`、`internal`（互斥） |
| R4 | 对账 | 四段 `total_consumption` 之和 = Excel 全量确认收入；偏差超 ε 阻断计算 |
| R5 | 重新生成 | `purgePersonalIncome` 清理个人 batch + summary + tenant_line，不影响企业 `platform_income_monthly` |

### 1.1 与企业收入的关系

| 入口 | 纳入租户 | 数据源 |
|------|----------|--------|
| `/finance/[id]/income` 企业收入 | 有关联项目的租户 | CRM **`tenant_bill` + `tenant_bill_detail`** |
| **`/finance/[id]/personal` 个人收入** | Excel 涉及的全部租户，按 §3 四段互斥分类 | Excel 账单 + **可选**读库裸金属 |

`billing_period.personal_income` 取 **`non_project` 汇总行**的 `total_consumption`（不含 B 端 / 黑名单 / 内部）。

---

## 2. 输入数据

### 2.1 客户账单详情（`personal_tenant_bill`）— Excel 上传

**现网模板**（推荐）：租户ID、**类型**、租户类型、客户类型、客户名、总消费、券消费、**余额消费**。

- 列 **「类型」=「新版裸金属」** 标识裸金属行；该行 **余额消费** 为裸金属余额支付（Excel 模式计入 `M_bare`）。
- 支持 legacy 模板（无「类型」列）：全部行进 `B_non_bare`；裸金属仅能通过读库模式计入。
- 解析：`importFile` slot `personalTenantBill` → `billing_period_raw_tenant_bill`（含 `bill_line_type` 等扩展列）。

### 2.2 裸金属（`personal_baremetal_order`）— 读库导入（选填）

| 项 | 规则 |
|----|------|
| 是否必填 | **否**；`assertPersonalImportsReady` 仅校验 Excel |
| 模式判定 | 存在 `parse_status = ok` 的 baremetal batch → **`db` 模式**（含空批次）；否则 **`excel` 模式** |
| 账期筛选 | **`imported_at`** 落入 `[period_start, period_end]`（东八区）；与 `ordered_at`（下单时间）独立 |
| 映射 | 与成本读库相同；Raw 写入 `billing_period_raw_baremetal_order` |
| Excel 模式 | `M_bare` = Excel「新版裸金属」行余额消费合计 |
| 读库模式 | `M_bare` = 读库订单余额支付合计；**忽略** Excel 中「新版裸金属」行 |

UI：`BaremetalDbImportPanel variant="personal"`，Badge「选填」；可选「清除读库」回退 Excel 模式。

个人路径 **独立 batch**，不读取企业/成本的 `baremetal_order` batch。

---

## 3. 数据库

### 3.1 派生表 `billing_period_personal_income_summary`

每个账期固定 **四行**（UK：`billing_period_id + summary_kind`）：

| summary_kind | UI 标签 |
|--------------|---------|
| `enterprise_project` | B 端（项目租户） |
| `non_project` | 个人收入（非项目租户） |
| `blacklist` | 黑名单租户 |
| `internal` | 内部租户 |

### 3.2 租户明细 `billing_period_personal_income_tenant_line`

计算时按租户落库一行，供详情抽屉与 Excel 导出；`segment` 与汇总行一致。

### 3.3 批次唯一约束

| file_type | 约束 |
|-----------|------|
| `personal_tenant_bill` | 每账期 1 batch |
| `personal_baremetal_order` | 每账期 1 batch（可选） |

---

## 4. 计算逻辑（v2.0）

### 4.1 租户分段（互斥优先级）

```text
内部租户 → B 端（项目关联）→ 黑名单 → 个人（非项目）
```

Excel 列「租户类型」「客户类型」不驱动分段，仅展示与交叉 warning。

### 4.2 租户级聚合

```text
B_non_bare(t)  = 非「新版裸金属」行余额消费之和
M_bare(t)      = 裸金属确认收入（db 或 excel 模式，互斥）
total(t)       = B_non_bare(t) + M_bare(t)
```

各段汇总：`balance_consumption = Σ B_non_bare`，`bare_metal_consumption = Σ M_bare`，`total_consumption` 为两列之和。

券消费仅 reconciliation，不计入确认收入。

规则版本：`PERSONAL_INCOME_RULE_VERSION = 'v2.0'`。

---

## 5. API（tRPC `finance.periods`）

| 过程 | 说明 |
|------|------|
| `getPersonalBundle` | period + 四段 summaries + batches + validation（含 `baremetalSourceMode`） |
| `importFile` slot `personalTenantBill` | Excel 账单 |
| `previewPersonalBaremetalFromDb` / `importPersonalBaremetalFromDb` | 裸金属读库（选填） |
| `computePersonalIncome` | 计算并写入 summary + tenant_line |
| `purgePersonalIncome` | 清理个人数据 |
| `listPersonalIncomeTenantLines` | 按 segment 查租户明细 |

### 5.1 可计算条件

```text
canCompute :=
  personal_tenant_bill 解析成功
  AND Excel 中至少 1 个租户
  AND period.status ∉ { void, published }
  // 不要求 baremetal batch
```

---

## 变更记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 | 2026-06-03 | 初稿 |
| v1.1 | 2026-06-03 | 裸金属 Excel 必传、双行 summary |
| v1.2 | 2026-06-23 | 裸金属改读库（`created_at`，v2.1 起为 `imported_at`） |
| v2.0 | 2026-07-07 | **已实施**：裸金属选填 + Excel/db 互斥；四段汇总 + 对账；详见 [finance-personal-income-baremetal-source-v2-design.md](finance-personal-income-baremetal-source-v2-design.md) |
