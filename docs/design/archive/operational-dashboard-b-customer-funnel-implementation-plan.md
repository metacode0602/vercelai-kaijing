# 运营大盘 — B 端客户漏斗实现方案

> **已废止（2026-10-06）**：大盘报表（`/dashboard`、`/dashboard/global`）及其后端、DB 表已整体下线。本文仅作历史归档，**不再描述现网能力**。裁决见 [矛盾台账](../audit/doc-contradictions.md) §5。


**页面**：`/dashboard` — `DashboardBCustomerFunnelSection`  
**父文档**：[operational-dashboard-implementation-plan.md](operational-dashboard-implementation-plan.md)  
**版本**：v1.0（2026-06-23）

---

## 1. 现状

- 标题：「T1 · B 端客户漏斗」。
- 步骤：新增注册 → 测试通过 → 转正（客户）→ 转正（项目）。
- 数据：`getMockMonthlyReport('2026-05')`（月报 Mock），**未联动** `DashboardPeriodProvider`。
- 展示：数量 + MoM 环比 + 转化率箭头。

---

## 2. 目标

对齐月报 [T1 B 端客户漏斗](../../../apps/web/content/design/reports/operational-monthly-report-p0-metrics.md#2-t1--b-端客户漏斗当月)：

- 统计周期与大盘周期选择器联动；
- `customMonth`：按自然月统计当月事件；
- `last7days` / `thisMonth`：按 **事件发生日** 落在区间内计数（非仅自然月），或 **限制仅 customMonth 展示漏斗**（需产品确认，见 §3.1）。

---

## 3. 周期策略（建议）

| preset | 建议行为 |
|--------|----------|
| `customMonth` | 主路径：`YYYY-MM` 自然月漏斗 + MoM（对比上月） |
| `thisMonth` | 当月 1 日～today 累计漏斗 + 对比上月同期 |
| `last7days` | **隐藏漏斗** 或展示「漏斗仅支持按月查看」提示 |

理由：漏斗为 **当月发生事件** 指标，近 7 天漏斗业务意义弱且 MoM 难定义。

---

## 4. 指标定义

| UI 步骤 | 月报 # | 定义 | 数据源 | 过滤 |
|---------|--------|------|--------|------|
| 新增注册 | F1 | B 端新建客户 | `customer` | `type='B'`，`created_at` 在统计月/区间 |
| 测试通过 | F2 | 测试完成 | `customer` | `test_completed_on` 在统计月/区间 |
| 转正（客户） | F3 | 客户转正 | `customer` | `conversion_date` 在统计月/区间 |
| 转正（项目） | F4 | 项目激励开始 | `project_conversion_setting` ⋈ `project` ⋈ `customer` | `conversion_date` 在统计月/区间 |
| 辅助：测试中→转正项目 | F5 | 见月报 | `project` + `project_conversion_setting` | `stage='converted'` 等 |

转化率（派生）：

- 注册→测试：`F2 / F1`
- 测试→转正（客户）：`F3 / F2`

MoM：`(本月值 − 上月值) / 上月值 × 100`；上月值为 0 时 `momPercent = null`。

---

## 5. SQL 示意（F1～F4，自然月）

```sql
-- F1
SELECT COUNT(*) FROM customer
WHERE type = 'B' AND date_trunc('month', created_at AT TIME ZONE 'Asia/Shanghai') = :monthStart;

-- F2
SELECT COUNT(*) FROM customer
WHERE type = 'B' AND test_completed_on >= :monthStart AND test_completed_on < :monthEndExclusive;

-- F3
SELECT COUNT(*) FROM customer
WHERE type = 'B' AND conversion_date >= :monthStart AND conversion_date < :monthEndExclusive;

-- F4
SELECT COUNT(DISTINCT pcs.project_id)
FROM project_conversion_setting pcs
JOIN project p ON p.id = pcs.project_id
JOIN customer c ON c.id = p.customer_id
WHERE c.type = 'B'
  AND pcs.conversion_date >= :monthStart AND pcs.conversion_date < :monthEndExclusive;
```

---

## 6. API

复用或扩展月报数据访问：`lib/server/dataaccess/finance/operational-monthly-report`（若已有）。

```typescript
type MomMetric = { value: number; momPercent: number | null }

type BCustomerFunnelResponse = {
  periodCode: string // YYYY-MM 或区间文案
  newRegistrations: MomMetric
  testPassed: MomMetric
  conversionsCustomer: MomMetric
  conversionsProject: MomMetric
  testingToConverted: MomMetric
  registrationToTestRate: number | null
  testToConversionRate: number | null
}
```

Procedure：`dashboard.ops.bCustomerFunnel`  
输入：`{ preset, customMonth }`。

---

## 7. 前端改造

- `useDashboardPeriod()` 替代硬编码 `2026-05`。
- 复用月报格式化：`formatReportCount`、`formatPercent`、`formatRate`（已 import）。
- `last7days` 时展示 Empty 或禁用态（§3）。
- MoM 展示逻辑保持 `MomBadge` 组件。

---

## 8. 验收

| # | 场景 | 期望 |
|---|------|------|
| E1 | customMonth = 已发布月报月 | 与 `/finance/monthly-report` T1 完全一致 |
| E2 | 切换月份 | 数字与 MoM 刷新 |
| E3 | F1=0 | 转化率显示「—」不抛错 |
| E4 | 与周期选择器 | 副标题展示正确 `periodLabel` |

---

## 9. 非目标

- 不做 C 端漏斗。
- 不做漏斗下钻客户清单（月报二期）。
