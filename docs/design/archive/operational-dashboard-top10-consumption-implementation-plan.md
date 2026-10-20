# 运营大盘 — Top 10 消费项目实现方案

> **已废止（2026-10-06）**：大盘报表（`/dashboard`、`/dashboard/global`）及其后端、DB 表已整体下线。本文仅作历史归档，**不再描述现网能力**。裁决见 [矛盾台账](../audit/doc-contradictions.md) §5。


**页面**：`/dashboard` — `Top10ConsumptionChart`  
**父文档**：[operational-dashboard-implementation-plan.md](operational-dashboard-implementation-plan.md)  
**版本**：v1.1（2026-06-23）

---

## 1. 现状

- 横向堆叠柱：余额消费 + 算力券消费。
- Y 轴：`name`（Mock 为「H800 训练集群」「A100 推理服务」等 **GPU/任务风格名称**）。
- 柱内标签：余额、券、占 Top10 合计 `ratio%`。
- 数据：`fetchTop10Items(query)` → 10 行，按 `total` 降序。

---

## 2. 维度定义

数据源改为 CRM 月度账单 `tenant_bill_detail`，与「消费项目」字面含义对齐，**首期聚合维度为项目**：

| 维度 | 聚合键 | 展示名 | 说明 |
|------|--------|--------|------|
| **project**（默认） | `tenant_bill.project_id` | `crm_project.name` | **推荐**；账单已挂项目 |
| product_line | `tenant_bill_detail.product_line` | `PRODUCT_LINE_MAP` 展示名 | 备选，见 [产品线专篇 §3](operational-dashboard-product-line-trend-implementation-plan.md#3-产品线标识与展示) |
| resource | `tenant_bill_detail.resource_name` | 资源名称 | 行级过细，二期 |

`project_id` 为空时回退 `tenant_bill.tenant_id` → 有效项目解析（`primary_tenant_id` / `project_tenant`）得到项目名；仍无法归因则归入「未关联项目」桶（通常不进 Top10）。

Mock 的 GPU/任务风格名称 **不再作为真源**；UI 展示 CRM 项目名称。

---

## 3. 指标口径

主表：`tenant_bill_detail`，经 `tenant_bill` 关联项目、账单月与租户。

区间内（`bill_month ∈ monthsInRange`）按维度汇总：

| 字段 | 计算 |
|------|------|
| `balanceConsumption` | `SUM(tenant_bill_detail.balance_amount)` |
| `voucherConsumption` | `SUM(tenant_bill_detail.coupon_amount)` |
| `total` | `balance + voucher`（或 `SUM(amount)`） |
| `ratio` | `total / SUM(top10 total) × 100`（占 Top10 合计，非全平台） |

### 3.1 过滤

| 规则 | 说明 |
|------|------|
| 时间 | `tenant_bill.bill_month = ANY(:monthsInRange)` |
| 内部租户 | 排除查询区间内有效的 `billing_tenant.type = internal` |
| 范围 | 全平台 B+C，非 CRM 范围 |

`:monthsInRange` 由查询区间推导（同消费趋势专篇 §3.2）。

### 3.2 SQL 示意（项目维度）

```sql
WITH agg AS (
  SELECT
    COALESCE(b.project_id, b.tenant_id) AS group_key,
    COALESCE(p.name, t.name, '未关联项目') AS name,
    SUM(d.balance_amount) AS balance_consumption,
    SUM(d.coupon_amount) AS voucher_consumption,
    SUM(d.amount) AS total
  FROM tenant_bill_detail d
  JOIN tenant_bill b ON b.id = d.bill_id
  JOIN billing_tenant t ON t.id = b.tenant_id
  LEFT JOIN crm_project p ON p.id = b.project_id
  WHERE b.bill_month = ANY(:monthsInRange)
    AND NOT internal_tenant_excluded(t, :periodRange)
  GROUP BY group_key, name
  ORDER BY total DESC
  LIMIT 10
)
SELECT *, total / SUM(total) OVER () * 100 AS ratio FROM agg;
```

---

## 4. API

```typescript
type Top10ConsumptionItem = {
  name: string
  balanceConsumption: number
  voucherConsumption: number
  total: number
  ratio: number
}

type Top10ConsumptionResponse = {
  items: Top10ConsumptionItem[]
  dimension: 'project' | 'product_line' | 'resource'
}
```

Procedure：`dashboard.ops.top10Consumption`  
可选 input：`dimension`（默认 `project`）。

---

## 5. 前端改造

- 替换 `fetchTop10Items`；副标题注明维度，如「按项目 · CRM 月度账单 · 占 Top10 合计占比」。
- `Top10BarLabel` 逻辑不变；`width < 60` 时仍隐藏标签防重叠。
- 空数据：展示「暂无消费数据」。

---

## 6. 验收

| # | 场景 | 期望 |
|---|------|------|
| F1 | 区间汇总 | 每行 total = balance + voucher |
| F2 | 排序 | 严格按 total 降序，最多 10 条 |
| F3 | ratio | Top10 内 ratio 之和 = 100%（±舍入） |
| F4 | 与产品线图 | 全平台 total 之和 ≥ Top10 合计（Top10 为子集） |
| F5 | 数据源 | 与 `tenant_bill_detail` + `tenant_bill` 手工 SUM 一致 |

---

## 7. 非目标

- 不做 Top 20 切换。
- 不做 GPU 型号 / 任务维度（无对应账单字段，改读 `tenant_region_gpu_consumption_daily` 为二期）。
- 不做点击下钻到租户明细（跳转 CRM 账单列表为二期）。
- 不做按日 proration。
