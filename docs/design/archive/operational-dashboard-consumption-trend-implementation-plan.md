# 运营大盘 — 消费趋势图实现方案

> **已废止（2026-10-06）**：大盘报表（`/dashboard`、`/dashboard/global`）及其后端、DB 表已整体下线。本文仅作历史归档，**不再描述现网能力**。裁决见 [矛盾台账](../audit/doc-contradictions.md) §5。


**页面**：`/dashboard` — `ConsumptionTrendChart`  
**父文档**：[operational-dashboard-implementation-plan.md](operational-dashboard-implementation-plan.md)  
**版本**：v1.1（2026-06-23）

---

## 1. 现状

- 图表类型：三线折线图（余额消费、算力券消费、毛利虚线）。
- 客群 Toggle：`all` | `new` | `old`。
- 数据：`fetchDailyConsumption(query, segment)` → `DailyConsumption[]`（`date`, `label`, `balanceConsumption`, `voucherConsumption`, `grossProfit`）。

---

## 2. 目标

按统计周期展示 **有效经营项目** 对应租户的消费趋势；支持新客/老客筛选。数据源为 CRM 月度账单明细 `tenant_bill_detail`；**毛利暂不计算**。

---

## 3. 指标口径

| 序列 | 字段 | 聚合 |
|------|------|------|
| 余额消费 | `balanceConsumption` | `SUM(tenant_bill_detail.balance_amount)` |
| 算力券消费 | `voucherConsumption` | `SUM(tenant_bill_detail.coupon_amount)` |
| 毛利 | `grossProfit` | **暂不计算**，固定 `null` |

主表：`tenant_bill_detail`，经 `tenant_bill` 关联租户与账单月；字段语义见 `packages/db/src/crm-schema.ts`。

### 3.1 有效项目与租户范围

**仅统计有效经营项目（`listIncomeEligibleProjects` 同口径）对应租户的数据**，与财务单账期收入计算一致：

| 条件 | 说明 |
|------|------|
| 项目状态 | `crm_project.status` 不为 `archived`、`paused` |
| 计费租户 | 经 `primary_tenant_id` 或 `project_tenant`（`sort_order`）解析出具备 `platform_tenant_id` 的 `billing_tenant` |
| 客户 | 租户关联 `customer` 存在 |
| 内部租户 | 查询区间内 `billing_tenant.type = internal` 且在 `internal_effective_from/to` 与区间有交集的租户 **排除** |

实现建议：查询前调用 `listIncomeEligibleProjects(periodRange)` 得到 `{ projectId, tenantId }[]`，以 `tenant_id IN (...)` 或 `project_id IN (...)` 过滤 `tenant_bill`。**无有效项目的租户账单不计入**。

### 3.2 时间粒度

`tenant_bill_detail` 为 **月度账单行级** 明细，无自然日字段；按 `tenant_bill.bill_month`（`YYYY-MM`）分组。

| 预设 | X 轴 |
|------|------|
| 指定月 / 本月 / 近 7 天 | 区间所覆盖自然月（通常 1 个 `bill_month`）各 1 个数据点 |
| 跨月区间（后续扩展） | 每月 1 点，`label = MM` 或 `YYYY-MM` |

> 与 Mock「逐日」展示不同：首期 **按账单月聚合**，不做按日 proration。前端 X 轴文案改为「账单月」或单月时展示单点；区间仅含一个 `bill_month` 时折线为单点（可配合 `dot` 显示）。

`:monthsInRange` 由查询区间 `[start, end]`（东八区自然日）推导。

### 3.3 客群过滤

在 **有效项目集合** 上按标签划分（与月报 §1.3 一致）：

| segment | 条件（项目维度） |
|---------|------------------|
| `new` | 存在 `销售新客` 标签 assignment，且不存在 `平台老客`、`中台直客` |
| `old` | 存在 `平台老客` 或 `中台直客` |
| `all` | 全部有效项目 |

归因：`tenant_bill.project_id` → `crm_project` → 标签；`project_id` 为空时回退 `tenant_bill.tenant_id` 匹配有效项目租户。无法归因到有效项目的账单行 **不计入** `new`/`old`，亦不计入 `all`（与「仅有效项目」一致）。

### 3.4 毛利

首期 **不展示毛利序列**；`grossProfit` 固定 `null`，不调用成本域表。

---

## 4. 补零与日期轴

- 输入区间 `monthsInRange[]` 来自 `getDateRange(preset, customMonth)` 推导的账单月列表。
- 查询结果 LEFT JOIN 月份日历，无账单数据的月份填 0。
- `date` = `bill_month`（如 `2026-06`）；`label` = `bill_month.slice(5)`（`MM`）或完整 `YYYY-MM`（跨年时）。

---

## 5. API

```typescript
// input: operationalPeriodInputSchema + segment
type ConsumptionTrendRow = {
  date: string          // bill_month YYYY-MM
  label: string         // MM 或 YYYY-MM
  balanceConsumption: number
  voucherConsumption: number
  grossProfit: null     // 暂不计算
}

type ConsumptionTrendResponse = {
  rows: ConsumptionTrendRow[]
}
```

Procedure：`dashboard.ops.consumptionTrend`。

---

## 6. SQL 示意（all + 有效项目）

```sql
SELECT
  b.bill_month AS date,
  COALESCE(SUM(d.balance_amount), 0) AS balance_consumption,
  COALESCE(SUM(d.coupon_amount), 0) AS voucher_consumption
FROM tenant_bill_detail d
JOIN tenant_bill b ON b.id = d.bill_id
JOIN billing_tenant t ON t.id = b.tenant_id
WHERE b.bill_month = ANY(:monthsInRange)
  AND b.tenant_id = ANY(:eligibleTenantIds)   -- listIncomeEligibleProjects
  AND NOT internal_tenant_excluded(t, :periodRange)
  -- segment: AND b.project_id = ANY(:segmentProjectIds)
GROUP BY b.bill_month
ORDER BY b.bill_month;
```

---

## 7. 前端改造

- `useQuery` 替换 `useMemo(fetchDailyConsumption)`；`segment` 变化时 refetch。
- 不渲染毛利线（`grossProfit === null`）；Legend 移除毛利项。
- X 轴 / 描述文案：由「按天」改为「按账单月」或「CRM 月度账单」。
- 保持 `ChartContainer`、余额/算力券双色配置与 Y 轴「万」格式。

---

## 8. 验收

| # | 场景 | 期望 |
|---|------|------|
| B1 | all + 指定月 `2026-05` | 余额 / 券消费 = 有效项目租户在 `bill_month=2026-05` 的 `tenant_bill_detail` SUM |
| B2 | new vs old | 两者之和 ≤ all；仅有效项目参与 |
| B3 | 切换客群 | 图表平滑刷新，无闪断 |
| B4 | 暂停 / 归档项目 | 对应租户账单不计入 |
| B5 | 毛利 | 不展示毛利线，接口不报错 |

---

## 9. 非目标

- 不做周/月粒度 Toggle（固定账单月粒度）。
- 不做按日 proration（无日级账单明细）。
- 毛利计算（待成本域口径确认后单独立项）。
- 不做下载。
