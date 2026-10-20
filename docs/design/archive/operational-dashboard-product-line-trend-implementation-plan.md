# 运营大盘 — 产品线消费趋势图实现方案

> **已废止（2026-10-06）**：大盘报表（`/dashboard`、`/dashboard/global`）及其后端、DB 表已整体下线。本文仅作历史归档，**不再描述现网能力**。裁决见 [矛盾台账](../audit/doc-contradictions.md) §5。


**页面**：`/dashboard` — `ProductLineTrendChart`  
**父文档**：[operational-dashboard-implementation-plan.md](operational-dashboard-implementation-plan.md)  
**版本**：v1.2（2026-06-23）

---

## 1. 现状

- 堆叠柱状图：X 轴为日，Y 轴为金额（万）。
- 指标 Toggle：`total` | `balance` | `voucher`。
- 产品线（Mock）：`elastic`、`cloud_vm`、`job`、`storage` 四类 **归并 key**，与 DB 不一致。
- 数据：`fetchProductLineTrend` → `dailyByMetric[metric]`，每行含各 Mock 产品线 key。

---

## 2. 目标

按 **账单月** 堆叠展示各产品线消费；切换总消费 / 余额 / 算力券三种度量。数据源为 CRM 月度账单明细 `tenant_bill_detail`。

**产品线粒度**：直接使用 DB `product_line` 作为图表 series key，**不做四类归并**；预期 10+ 根堆叠柱段（含裸金属、存储、Token 等）。展示名以账单导入 `PRODUCT_LINE_MAP`（`tenant-billing-import-utils.ts`）的 `resourceName` 为准。

---

## 3. 产品线标识与展示

### 3.1 原则

| 项 | 规则 |
|----|------|
| **图表 key** | `tenant_bill_detail.product_line` 原值（如 `pod_deployment`） |
| **展示名** | `PRODUCT_LINE_MAP` 对应 `resourceName`；未知 key 回退为 key 本身 |
| **归并** | **不做**；`share_storage` 与 `juicefs` 等各占独立柱段 |
| **真值来源** | `lib/crm/tenant-billing-import-utils.ts` 中 `PRODUCT_LINE_MAP`（平台导入时写入 DB） |

> `lib/data/types.ts#productLineNames` 为历史 CRM 展示表，部分文案与 `PRODUCT_LINE_MAP` 不一致（如 `pod_development`）。**运营大盘及后续账单类图表以 `PRODUCT_LINE_MAP` 为准**；实现期将 `productLineNames` 对齐或改为复用同一导出表。

### 3.2 已知产品线（`PRODUCT_LINE_MAP` → DB key / 展示名）

| DB `product_line` | 展示名（`resourceName`） |
|-------------------|--------------------------|
| `pod_job` | Job |
| `pod_deployment` | 弹性部署 |
| `pod_development` | **云主机** |
| `maas_token` | Token服务 |
| `bare_metal` | 裸金属整租 |
| `juicefs` | 对象存储加速 |
| `share_storage` | 共享存储卷 |
| `harbor` | 镜像仓库 |
| `prepaid_deduction` | 预付费抵扣 |

平台同步未知 key 时按 snake_case 落库；图表仍单独成柱，展示名用 DB 值。

### 3.3 配置与复用

- 从 `PRODUCT_LINE_MAP` **导出** `BILLING_PRODUCT_LINE_REGISTRY`：`{ productLine, label }[]`（label = `resourceName`），供 API 排序、配色及 Top 10 等产品线维度展示名。
- **不**再维护 `key → dbValues[]` 归并配置；**不**引入 Mock 用 `elastic` / `cloud_vm` 等别名 key。
- CRM 项目消费趋势图（`project-consumption-trend-chart.tsx`）当前仍用四类归并且将 `pod_development` 划入「弹性服务」——与本文口径冲突；**代码改造时**应改为与本专篇一致（DB key 直出 + `PRODUCT_LINE_MAP` 展示名）。

---

## 4. 指标与聚合

主表：`tenant_bill_detail`，经 `tenant_bill` 关联 `bill_month` 与租户。

| metric | 每产品线值 |
|--------|-------------|
| `total` | `SUM(amount)` 或 `balance + coupon` |
| `balance` | `SUM(balance_amount)` |
| `voucher` | `SUM(coupon_amount)` |

### 4.1 时间粒度

`tenant_bill_detail` 无自然日字段；按 `tenant_bill.bill_month`（`YYYY-MM`）分组。`:monthsInRange` 由查询区间推导（同 [消费趋势专篇](operational-dashboard-consumption-trend-implementation-plan.md) §3.2）。

> 与 Mock「按日」不同：首期 **按账单月 × 产品线** 堆叠，不做按日 proration。X 轴展示 `MM` 或 `YYYY-MM`；区间仅含一个自然月时为单列堆叠柱。

### 4.2 过滤

| 规则 | 说明 |
|------|------|
| 时间 | `tenant_bill.bill_month = ANY(:monthsInRange)` |
| 内部租户 | 排除查询区间内有效的 `billing_tenant.type = internal` |
| 范围 | 全平台 B+C，非 CRM 范围 |

### 4.3 SQL 示意

```sql
SELECT
  b.bill_month AS date,
  d.product_line,
  SUM(d.balance_amount) AS balance,
  SUM(d.coupon_amount) AS voucher,
  SUM(d.amount) AS total
FROM tenant_bill_detail d
JOIN tenant_bill b ON b.id = d.bill_id
JOIN billing_tenant t ON t.id = b.tenant_id
WHERE b.bill_month = ANY(:monthsInRange)
  AND NOT internal_tenant_excluded(t, :periodRange)
GROUP BY b.bill_month, d.product_line
ORDER BY b.bill_month, d.product_line;
```

应用层 pivot 为图表行：`{ date, label, pod_deployment, pod_development, pod_job, share_storage, … }`（key 即 DB `product_line`，**无二次归并**）。区间内某月某产品线无数据时补 `0`。

---

## 5. API

```typescript
type ProductLineMetric = 'total' | 'balance' | 'voucher'

type ProductLineTrendRow = {
  date: string          // bill_month YYYY-MM
  label: string
} & Record<string, number> // key = DB product_line

type ProductLineTrendResponse = {
  dailyByMetric: Record<ProductLineMetric, ProductLineTrendRow[]>
  productLines: Array<{ key: string; label: string; color: string }>
  // key = product_line；productLines 含区间内出现的产品线 + 已知 registry 稳定排序
}
```

Procedure：`dashboard.ops.productLineTrend`。

---

## 6. 前端改造

- 删除 Mock 四类 `PRODUCT_LINES`；`chartConfig` 与 `<Bar dataKey>` 由 API `productLines` 动态生成。
- 堆叠柱预期 **10+ 段**：图例可滚动或分两行；配色按 registry 固定色板循环，未知 key 用默认色。
- `metric` Toggle 切换时仅换 `dailyByMetric[metric]`，不重复请求（单次返回三套）。
- 堆叠 `stackId="total"`；最顶段圆角逻辑按 **实际渲染顺序最后一项** 计算。
- X 轴 / 描述文案：由「按天」改为「按账单月 · CRM 月度账单」。

---

## 7. 验收

| # | 场景 | 期望 |
|---|------|------|
| C1 | total | 每月堆叠和 = 当月 `tenant_bill_detail` 全平台 `amount` SUM |
| C2 | balance + voucher | 与 total 分解一致（`balance_amount` + `coupon_amount` ≈ `amount`） |
| C3 | 产品线 | 各柱段与 `GROUP BY product_line` **一一对应**，无归并 |
| C4 | 展示名 | `pod_development` 展示为「云主机」；与 `PRODUCT_LINE_MAP` 一致 |
| C5 | 空产品线月 | 补 0，柱高连续 |
| C6 | 与消费趋势 | 同区间 all 总量与消费趋势图余额+券一致 |

---

## 8. 非目标

- 首期不做新客/老客 × 产品线矩阵（月报 T4 专表）。
- 不做按日 proration。
- 不区分 published / preview 双路径。
- 不做四类（弹性/云主机/Job/存储）汇总视图（若需 coarse 视图另开需求）。
