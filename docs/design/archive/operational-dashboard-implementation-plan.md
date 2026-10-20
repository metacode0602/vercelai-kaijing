# 运营大盘 — 总览实现方案

> **已废止（2026-10-06）**：大盘报表（`/dashboard`、`/dashboard/global`）及其后端、DB 表已整体下线。本文仅作历史归档，**不再描述现网能力**。裁决见 [矛盾台账](../audit/doc-contradictions.md) §5。


**页面**：`/dashboard`（`apps/web/src/app/[locale]/(protected)/dashboard/page.tsx`）  
**当前状态**：`DashboardMockContent` + `mock-data.ts` 全 Mock，无后端接口  
**关联月报口径**：[operational-monthly-report-p0-metrics.md](../../../apps/web/content/design/reports/operational-monthly-report-p0-metrics.md)（T1～T4）  
**文档性质**：实现方案（确认后再改代码）  
**版本**：v1.0（2026-06-23）

---

## 1. 页面模块与专篇索引

| # | UI 模块 | 组件 | 专篇 |
|---|---------|------|------|
| 0 | 统计周期选择 | `dashboard-period-selector.tsx` | 本文 §2 |
| 1 | KPI 五卡 | `dashboard-kpi-section.tsx` | [operational-dashboard-kpi-implementation-plan.md](operational-dashboard-kpi-implementation-plan.md) |
| 2 | 消费趋势 | `consumption-trend-chart.tsx` | [operational-dashboard-consumption-trend-implementation-plan.md](operational-dashboard-consumption-trend-implementation-plan.md) |
| 3 | 产品线消费趋势 | `product-line-trend-chart.tsx` | [operational-dashboard-product-line-trend-implementation-plan.md](operational-dashboard-product-line-trend-implementation-plan.md) |
| 4 | 充值趋势 | `recharge-trend-chart.tsx` | [operational-dashboard-recharge-trend-implementation-plan.md](operational-dashboard-recharge-trend-implementation-plan.md) |
| 5 | T1 B 端客户漏斗 | `dashboard-b-customer-funnel-section.tsx` | [operational-dashboard-b-customer-funnel-implementation-plan.md](operational-dashboard-b-customer-funnel-implementation-plan.md) |
| 6 | Top 10 消费项目 | `top10-consumption-chart.tsx` | [operational-dashboard-top10-consumption-implementation-plan.md](operational-dashboard-top10-consumption-implementation-plan.md) |
| 7 | 集群消耗分析 | `cluster-analysis-chart.tsx` | [operational-dashboard-cluster-analysis-implementation-plan.md](operational-dashboard-cluster-analysis-implementation-plan.md) |

与 `/dashboard/global`（供应侧接入看板）、`/crm/workbench`（AM 范围 CRM 工作台）**口径与权限不同**，禁止复用 CRM `crmScopedProcedure` 的可见性过滤。

---

## 2. 统计周期（全页共享）

### 2.1 预设

| 预设 | `preset` | 区间（东八区 `Asia/Shanghai`） | 说明 |
|------|----------|-------------------------------|------|
| 近 7 天 | `last7days` | `[today−6, today]` | 含首尾 7 个自然日 |
| 本月 | `thisMonth` | `[当月 1 日, today]` | **非整月**，截至当前日 |
| 指定月 | `customMonth` | `[YYYY-MM-01, min(today, 月末)]` | 选历史整月时到月末；选当月时同「本月」 |

实现参考：`dashboard-period-context.tsx`、`dashboard-period-utils.ts`、`mock-data.ts#getDateRange`。

### 2.2 对比区间（KPI 环比）

| 预设 | 当前区间 | 对比区间 | KPI 副文案 |
|------|----------|----------|------------|
| 近 7 天 | 近 7 天 | 前 7 天（today−13 ~ today−7） | 较上期 |
| 本月 | 本月 1 日～today | 上月同期（上月 1 日～上月同日；若上月天数不足则到上月最后一天） | 较上期 |
| 指定月 | 整月或截至 today | 上一自然月整月 | 较上期 |

### 2.3 客群筛选（消费趋势、充值趋势）

| `segment` | 含义 | 规则 |
|-----------|------|------|
| `all` | 全部 | 不过滤客群 |
| `new` | 新客 | 项目标签含 `销售新客`，且不含 `平台老客`、`中台直客` |
| `old` | 老客 | 项目标签含 `平台老客` 或 `中台直客` |

与月报 [§1.3 新客/老客划分](../../../apps/web/content/design/reports/operational-monthly-report-p0-metrics.md#13-新客--老客划分t2t4-共用) 一致；**未分类**计入 `all`，不单独出 Toggle（首期）。

---

## 3. 数据真值分层（全模块共用）

| 层级 | 适用场景 | 主表 |
|------|----------|------|
| **财务月结（权威）** | `customMonth` 对应账期 `status = published` | `billing_period`、`platform_income_monthly`、`platform_cost_monthly`、`billing_period_cost_source_line` |
| **平台同步（预览）** | 近 7 天、本月未关账、账期未发布 | `consumption_usage_daily`、`tenant_region_gpu_consumption_daily`、`recharge` |
| **供应侧卡时** | 集群上架/空置（非租户账单消费） | `device_hourly_snapshot` / Period 聚合（见 global 专篇） |

UI 须在账期未发布或区间跨未关账月时展示 **「预览」** 角标（与月报一致）。

---

## 4. 后端 API 骨架（建议）

### 4.1 路由

在 `lib/server/routers/web/dashboard.ts` 新增子路由 `ops`（或 `operational`），与 `globalOps` 并列：

```typescript
export const dashboardRouter = createTRPCRouter({
  globalSearch: …,
  globalOps: globalOpsRouter,
  ops: operationalDashboardRouter, // 新增
})
```

权限：`sharedReadProcedure` + 角色 `admin` / `user`（平台运营）；**不做** CRM AM 范围过滤。

### 4.2 输入 Schema（建议）

```typescript
const operationalPeriodInputSchema = z.object({
  preset: z.enum(['last7days', 'thisMonth', 'customMonth']),
  customMonth: z.string().regex(/^\d{4}-\d{2}$/), // preset=customMonth 时有效
  segment: z.enum(['all', 'new', 'old']).optional(), // 趋势图用
})
```

### 4.3 Procedure 清单

| Procedure | 消费方 |
|-----------|--------|
| `dashboard.ops.kpi` | KPI 五卡 |
| `dashboard.ops.consumptionTrend` | 消费趋势 |
| `dashboard.ops.productLineTrend` | 产品线趋势 |
| `dashboard.ops.rechargeTrend` | 充值趋势 |
| `dashboard.ops.bCustomerFunnel` | B 端漏斗 |
| `dashboard.ops.top10Consumption` | Top 10 |
| `dashboard.ops.clusterUsage` | 集群消耗 |

首期可合并为 `dashboard.ops.getBundle`（单次请求），减少瀑布请求；组件层保持现有 `useMemo` 数据结构。

### 4.4 数据访问层

建议目录：`lib/server/dataaccess/dashboard/operational-dashboard.ts`  
复用：

- `lib/crm/workbench-date-range.ts`（东八区日界、`shanghaiDateRangeToUtcBounds`）
- `lib/server/dataaccess/finance/` 账期解析、内部租户排除
- 客群标签：新建 `resolveCustomerSegmentByProjectId()`（读 `project_tag_assignment`）
- 产品线展示名：`tenant-billing-import-utils.ts` 导出之 `PRODUCT_LINE_MAP` / `BILLING_PRODUCT_LINE_REGISTRY`（见 [产品线专篇 §3](operational-dashboard-product-line-trend-implementation-plan.md#3-产品线标识与展示)）

---

## 5. 前端改造步骤（确认后执行）

1. 新建 `operational-dashboard-types.ts`（对齐 mock 类型，去 mock 前缀）。
2. `DashboardMockContent` → `DashboardContent`；各图表 `useQuery(trpc.dashboard.ops.*)`。
3. 删除或保留 `mock-data.ts` 仅用于 Storybook / 开发 fallback。
4. Loading：各 Card 内 `Skeleton`；Error：`Alert` + 重试。
5. 预览态：页头或 `DashboardPeriodSelector` 旁展示 `预览数据` Badge。

---

## 6. 分期建议

| 阶段 | 范围 | 验收 |
|------|------|------|
| **M1** | 周期 + KPI + 消费趋势 + 充值趋势 | 与 `consumption_usage_daily` / `recharge` 可对账 |
| **M2** | 产品线趋势 + Top 10 | 产品线 key = DB `product_line`，展示名对齐 `PRODUCT_LINE_MAP` |
| **M3** | B 端漏斗 | 与月报 T1 同数 |
| **M4** | 集群消耗分析 | 供应侧卡时 + 租户消费卡时可交叉验证 |

---

## 7. 非目标（全页）

- 不做 CRM 行级 AM 过滤（本页为平台经营视角）。
- 不做导出 Excel/PDF。
- 不在此页实现 C 端独立主题（C 端消耗仅在平台合计中体现）。
- 不替代 `/finance/monthly-report` 正式月报发布流程。
