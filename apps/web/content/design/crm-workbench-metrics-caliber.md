# CRM 工作台 — 统计口径与 SQL

**页面**：`/crm/workbench`  
**涉及组件**：

| 组件 | 路径 |
|------|------|
| KPI 五卡 | `apps/web/src/components/dashboard/workbench/workbench-kpi-section.tsx` |
| 产品线消费分布 | `apps/web/src/components/dashboard/workbench/workbench-product-line-card.tsx` |
| 消费趋势 | `apps/web/src/components/dashboard/workbench/workbench-consumption-trend-card.tsx` |

**后端入口**：

- `trpc.crm.dashboard.summary` → `lib/server/dataaccess/crm/dashboard.ts#summary`
- `trpc.crm.analytics.consumptionTrend` → `lib/server/dataaccess/crm/dashboard.ts#consumptionTrendByDateRange`
- `trpc.crm.analytics.productLineBreakdown` → `lib/server/dataaccess/crm/dashboard.ts#productLineBreakdown`

**数据范围**：全部接口经 `crmScopedProcedure` 注入 `ctx.crmScope`；`admin` 全量，`user` 按 AM + 项目四人组并集过滤，`member` 无 CRM 访问权限。

**日期上下文**：由 `WorkbenchPeriodProvider` 提供 `{ preset, startDate, endDate }`，东八区自然日（`Asia/Shanghai`）。

---

## 1. 公共约定

### 1.1 日期区间

| 预设 | `startDate` | `endDate` |
|------|-------------|-----------|
| 今天 | 今日 | 今日 |
| 近 7 天 | 今日 − 6 日 | 今日（含首尾共 7 天） |
| 本月 | 当月 1 日 | 今日（非整月） |
| 自定义 | 用户选择 | 用户选择 |

工具函数：`lib/crm/workbench-date-range.ts`

### 1.2 消费金额字段

表 `consumption_usage_daily.amount` 表示 **总消费（元）**，含算力券消费与余额/实付消费之和（`voucher_amount + balance_amount` 的汇总口径，由计费导入写入）。

### 1.3 充值时间边界

充值按 **东八区自然日左闭右开** 过滤 `completed_at`：

```typescript
// shanghaiDateRangeToUtcBounds(startDate, endDate)
// startUtc = 东八区 startDate 00:00:00 → UTC
// endExclusiveUtc = 东八区 (endDate + 1 天) 00:00:00 → UTC
```

### 1.4 CRM 可见性（`user` 角色）

**可见项目子查询 `vp`**（`buildVisibleProjectSubquery`）：

```sql
SELECT DISTINCT p.id AS project_id, p.customer_id, p.primary_tenant_id
FROM project p
LEFT JOIN account_manager_assignment ama
  ON ama.customer_id = p.customer_id
 AND ama.user_staff_id = :staffId
 AND ama.effective_to IS NULL
LEFT JOIN project_staff_assignment psa
  ON psa.project_id = p.id
 AND psa.user_staff_id = :staffId
 AND psa.effective_to IS NULL
 AND psa.role_type IN (
   'pre_sales', 'account_manager', 'delivery_manager', 'project_manager'
 )
WHERE ama.customer_id IS NOT NULL OR psa.project_id IS NOT NULL
```

**可见租户子查询 `scoped_tenant`**（`buildScopedTenantSubquery`）：

```sql
SELECT DISTINCT pt.tenant_id
FROM project_tenant pt
INNER JOIN ( /* vp */ ) vp ON vp.project_id = pt.project_id
UNION
SELECT vp.primary_tenant_id AS tenant_id
FROM ( /* vp */ ) vp
WHERE vp.primary_tenant_id IS NOT NULL
```

**可见客户条件**（`customerVisibleSql`，用于活跃客户计数）：

```sql
EXISTS (
  SELECT 1 FROM account_manager_assignment ama
  WHERE ama.customer_id = customer.id
    AND ama.user_staff_id = :staffId
    AND ama.effective_to IS NULL
)
OR EXISTS (
  SELECT 1 FROM project p
  INNER JOIN project_staff_assignment psa
    ON psa.project_id = p.id
   AND psa.user_staff_id = :staffId
   AND psa.effective_to IS NULL
   AND psa.role_type IN (
     'pre_sales', 'account_manager', 'delivery_manager', 'project_manager'
   )
  WHERE p.customer_id = customer.id
)
```

下文 SQL 中 `:staffId` 仅在有范围限制时出现；`admin` 省略可见性 JOIN / EXISTS 条件。

---

## 2. KPI 五卡（`workbench-kpi-section.tsx`）

**接口**：`trpc.crm.dashboard.summary`  
**输入**：`{ preset?, startDate?, endDate? }`  
**实现**：`dashboardDataAccess.summary(scope, input)`

---

### 2.1 活跃客户

| 项 | 说明 |
|----|------|
| **UI 标题** | 活跃客户 |
| **响应字段** | `activeCustomerCount` |
| **是否随日期切换** | 否（当前快照） |
| **统计口径** | 状态为 `active` 的客户数量；受 CRM 数据范围约束 |
| **主表** | `customer` |

**SQL（admin，全量）**：

```sql
SELECT COUNT(*) AS active_customer_count
FROM customer c
WHERE c.status = 'active';
```

**SQL（user，范围过滤）**：

```sql
SELECT COUNT(*) AS active_customer_count
FROM customer c
WHERE c.status = 'active'
  AND (
    EXISTS (
      SELECT 1 FROM account_manager_assignment ama
      WHERE ama.customer_id = c.id
        AND ama.user_staff_id = :staffId
        AND ama.effective_to IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM project p
      INNER JOIN project_staff_assignment psa
        ON psa.project_id = p.id
       AND psa.user_staff_id = :staffId
       AND psa.effective_to IS NULL
       AND psa.role_type IN (
         'pre_sales', 'account_manager', 'delivery_manager', 'project_manager'
       )
      WHERE p.customer_id = c.id
    )
  );
```

---

### 2.2 运行项目

| 项 | 说明 |
|----|------|
| **UI 标题** | 运行项目 |
| **响应字段** | `activeProjectCount` |
| **是否随日期切换** | 否（当前快照） |
| **统计口径** | 状态为 `active` 的经营项目数量；受 CRM 数据范围约束 |
| **主表** | `project` |

**SQL（admin）**：

```sql
SELECT COUNT(*) AS active_project_count
FROM project p
WHERE p.status = 'active';
```

**SQL（user）**：

```sql
SELECT COUNT(*) AS active_project_count
FROM project p
WHERE p.status = 'active'
  AND p.id IN (
    SELECT vp.project_id FROM (
      SELECT DISTINCT p2.id AS project_id
      FROM project p2
      LEFT JOIN account_manager_assignment ama
        ON ama.customer_id = p2.customer_id
       AND ama.user_staff_id = :staffId
       AND ama.effective_to IS NULL
      LEFT JOIN project_staff_assignment psa
        ON psa.project_id = p2.id
       AND psa.user_staff_id = :staffId
       AND psa.effective_to IS NULL
       AND psa.role_type IN (
         'pre_sales', 'account_manager', 'delivery_manager', 'project_manager'
       )
      WHERE ama.customer_id IS NOT NULL OR psa.project_id IS NOT NULL
    ) vp
  );
```

---

### 2.3 时段消费（含环比）

| 项 | 说明 |
|----|------|
| **UI 标题** | 今日消费 / 近7天消费 / 本月消费 / 时段消费（随 `preset` 变化） |
| **响应字段** | `periodConsumption`（当前区间）、`comparePeriodConsumption`（对比区间）、`trends.periodConsumption`（环比 %） |
| **是否随日期切换** | 是 |
| **统计口径** | 选中日期区间内，可见租户在 `consumption_usage_daily` 上的 `amount` 合计（元） |
| **主表** | `consumption_usage_daily` |
| **前端展示** | `¥{(periodConsumption / 10000).toFixed(1)}万` |

**当前区间 SQL（admin）**：

```sql
SELECT COALESCE(SUM(cud.amount), 0) AS period_consumption
FROM consumption_usage_daily cud
WHERE cud.usage_date >= :startDate
  AND cud.usage_date <= :endDate;
```

**当前区间 SQL（user）**：

```sql
SELECT COALESCE(SUM(cud.amount), 0) AS period_consumption
FROM consumption_usage_daily cud
INNER JOIN (
  SELECT DISTINCT pt.tenant_id
  FROM project_tenant pt
  INNER JOIN ( /* vp */ ) vp ON vp.project_id = pt.project_id
  UNION
  SELECT vp.primary_tenant_id AS tenant_id
  FROM ( /* vp */ ) vp
  WHERE vp.primary_tenant_id IS NOT NULL
) st ON st.tenant_id = cud.tenant_id
WHERE cud.usage_date >= :startDate
  AND cud.usage_date <= :endDate;
```

**对比区间**（用于环比，对 `:compareStartDate` / `:compareEndDate` 执行相同 SQL）：

| 预设 | 当前区间 | 对比区间 | UI 副文案 |
|------|----------|----------|-----------|
| 今天 | `[today, today]` | `[today-1, today-1]` | 较昨日 |
| 近 7 天 | `[today-6, today]` | `[today-13, today-7]` | 较上 7 天 |
| 本月 | `[month-01, today]` | 上月 1 日 ~ 上月同日（无该日则取上月最后一天） | 较上月 |
| 自定义 | `[start, end]` | 等长上一段：`[start−len, start−1]` | 较上周期 |

**环比计算公式**：

```sql
-- 应用层计算（非 SQL）
-- comparePeriodConsumption = 0 时返回 null，前端不展示 trend
period_consumption_trend =
  CASE
    WHEN compare_period_consumption = 0 THEN NULL
    ELSE ROUND((period_consumption - compare_period_consumption)
         / compare_period_consumption * 100, 1)
  END
```

---

### 2.4 充值金额

| 项 | 说明 |
|----|------|
| **UI 标题** | 充值金额 |
| **响应字段** | `periodRecharge` |
| **是否随日期切换** | 是（与 KPI 日期区间一致） |
| **统计口径** | 选中东八区日期区间内，状态为 `paid` 且 `completed_at` 非空的充值记录 `amount` 合计（元）；不含环比 |
| **主表** | `recharge` |
| **前端展示** | `¥{(periodRecharge / 10000).toFixed(1)}万` |

**SQL（admin）**：

```sql
SELECT COALESCE(SUM(r.amount), 0) AS period_recharge
FROM recharge r
WHERE r.status = 'paid'
  AND r.completed_at IS NOT NULL
  AND r.completed_at >= :startUtc          -- 东八区 startDate 00:00
  AND r.completed_at < :endExclusiveUtc;    -- 东八区 (endDate+1) 00:00
```

**SQL（user）**：

```sql
SELECT COALESCE(SUM(r.amount), 0) AS period_recharge
FROM recharge r
INNER JOIN ( /* scoped_tenant */ ) st ON st.tenant_id = r.tenant_id
WHERE r.status = 'paid'
  AND r.completed_at IS NOT NULL
  AND r.completed_at >= :startUtc
  AND r.completed_at < :endExclusiveUtc;
```

---

### 2.5 账户余额

| 项 | 说明 |
|----|------|
| **UI 标题** | 账户余额 |
| **UI 副文案** | 总余额 |
| **响应字段** | `totalBalance` |
| **是否随日期切换** | 否（当前快照） |
| **统计口径** | 可见计费租户 `tenant.balance` 字段求和（元），非历史快照 |
| **主表** | `tenant` |
| **前端展示** | `¥{(totalBalance / 10000).toFixed(1)}万` |

**SQL（admin）**：

```sql
SELECT COALESCE(SUM(t.balance), 0) AS total_balance
FROM tenant t;
```

**SQL（user）**：

```sql
SELECT COALESCE(SUM(t.balance), 0) AS total_balance
FROM tenant t
INNER JOIN ( /* scoped_tenant */ ) st ON st.tenant_id = t.id;
```

---

## 3. 产品线消费分布（`workbench-product-line-card.tsx`）

**接口**：`trpc.crm.analytics.productLineBreakdown`  
**输入**：`{ startDate, endDate }`（工作台传日期区间）  
**实现**：`dashboardDataAccess.productLineBreakdown(input, scope)`

| 项 | 说明 |
|----|------|
| **UI 标题** | 产品线消费分布 |
| **响应字段** | `{ name: productLine, value: amount }[]`，按 `value` 降序 |
| **是否随日期切换** | 是 |
| **统计口径** | 选中日期区间内，按 `product_line` 分组汇总 `consumption_usage_daily.amount`；`product_line` 为空记为 `unknown` |
| **主表** | `consumption_usage_daily` |
| **前端展示** | 柱状图 X 轴：`value / 10000` 万；Tooltip 显示原始元；产品线中文名见 `PRODUCT_LINE_MAP` 导出（`resourceName`） |

**SQL（admin）**：

```sql
SELECT
  cud.product_line,
  COALESCE(SUM(cud.amount), 0) AS value
FROM consumption_usage_daily cud
WHERE cud.usage_date >= :startDate
  AND cud.usage_date <= :endDate
GROUP BY cud.product_line
ORDER BY value DESC;
```

**SQL（user）**：

```sql
SELECT
  cud.product_line,
  COALESCE(SUM(cud.amount), 0) AS value
FROM consumption_usage_daily cud
INNER JOIN ( /* scoped_tenant */ ) st ON st.tenant_id = cud.tenant_id
WHERE cud.usage_date >= :startDate
  AND cud.usage_date <= :endDate
GROUP BY cud.product_line
ORDER BY value DESC;
```

**产品线编码 → 中文名**（`tenant-billing-import-utils.ts#PRODUCT_LINE_MAP` → `resourceName`；与 DB `product_line` 一一对应，**不归并**）：

| 编码 | 中文名 |
|------|--------|
| `bare_metal` | 裸金属整租 |
| `offline_order` | 线下订单 |
| `image_registry` / `harbor` | 镜像仓库 |
| `shared_storage` / `share_storage` | 共享存储卷 |
| `object_storage` / `juicefs` | 对象存储加速 |
| `pod_deployment` | 弹性部署 |
| `pod_job` | Job |
| `pod_development` | **云主机** |
| `maas_token` | Token服务 |
| `prepaid_deduction` | 预付费抵扣 |

> 历史 `lib/data/types.ts#productLineNames` 中 `pod_development` 为「开发机」，与 `PRODUCT_LINE_MAP` 不一致；工作台及运营类图表实现时应以对齐后的 registry 为准。

---

## 4. 消费趋势（`workbench-consumption-trend-card.tsx`）

**接口**：`trpc.crm.analytics.consumptionTrend`  
**输入**：`{ startDate, endDate }`  
**实现**：`dashboardDataAccess.consumptionTrendByDateRange(startDate, endDate, scope)`

| 项 | 说明 |
|----|------|
| **UI 标题** | 消费趋势 |
| **响应字段** | `{ date: YYYY-MM-DD, consumption: number }[]` |
| **是否随日期切换** | 是 |
| **统计口径** | 选中日期区间内，按 `usage_date` 日粒度汇总 `amount`；区间内无数据日期补 `consumption = 0` |
| **主表** | `consumption_usage_daily` |
| **前端展示** | X 轴：`date.slice(5)`（MM-DD）；Y 轴：`consumption / 10000` 万 |

**聚合 SQL（admin）**：

```sql
SELECT
  cud.usage_date,
  COALESCE(SUM(cud.amount), 0) AS consumption
FROM consumption_usage_daily cud
WHERE cud.usage_date >= :startDate
  AND cud.usage_date <= :endDate
GROUP BY cud.usage_date
ORDER BY cud.usage_date;
```

**聚合 SQL（user）**：

```sql
SELECT
  cud.usage_date,
  COALESCE(SUM(cud.amount), 0) AS consumption
FROM consumption_usage_daily cud
INNER JOIN ( /* scoped_tenant */ ) st ON st.tenant_id = cud.tenant_id
WHERE cud.usage_date >= :startDate
  AND cud.usage_date <= :endDate
GROUP BY cud.usage_date
ORDER BY cud.usage_date;
```

**补零逻辑**（应用层，非 SQL）：

```typescript
// enumerateShanghaiDates(startDate, endDate) 生成完整日期序列
// 对每个 date，取 SQL 结果 Map 中的 consumption，缺失则为 0
[{ date: '2026-06-01', consumption: 12345.67 }, ...]
```

---

## 5. 源表结构摘要

### `consumption_usage_daily`

| 列 | 类型 | 说明 |
|----|------|------|
| `tenant_id` | text | 计费租户 FK → `tenant.id` |
| `usage_date` | date | 东八区自然日 |
| `usage_month` | varchar(7) | YYYY-MM，月维度筛选用 |
| `product_line` | varchar(64) | 产品线编码 |
| `amount` | money | 总消费（元） |
| `voucher_amount` | money | 算力券消费 |
| `balance_amount` | money | 余额/实付消费 |

唯一约束：`(tenant_id, usage_date, product_line)`

### `recharge`

| 列 | 类型 | 说明 |
|----|------|------|
| `tenant_id` | text | 计费租户 FK |
| `amount` | money | 充值金额（元） |
| `status` | varchar(32) | `pending` / `paid` / `cancelled` / `failed` |
| `completed_at` | timestamptz | 充值完成时间 |

### `tenant`

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | text | 租户 ID |
| `customer_id` | text | 所属客户 |
| `balance` | money | 当前账户余额（元） |

### `customer` / `project`

| 表 | 状态字段 | 活跃值 |
|----|----------|--------|
| `customer` | `status` | `active` |
| `project` | `status` | `active` |

---

## 6. 代码索引

| 层级 | 文件 |
|------|------|
| 前端 KPI | `apps/web/src/components/dashboard/workbench/workbench-kpi-section.tsx` |
| 前端产品线 | `apps/web/src/components/dashboard/workbench/workbench-product-line-card.tsx` |
| 前端趋势 | `apps/web/src/components/dashboard/workbench/workbench-consumption-trend-card.tsx` |
| 日期 / 环比 | `apps/web/src/lib/crm/workbench-date-range.ts` |
| 数据访问 | `apps/web/src/lib/server/dataaccess/crm/dashboard.ts` |
| 范围 SQL | `apps/web/src/lib/server/auth/crm-scope-sql.ts` |
| tRPC 路由 | `apps/web/src/lib/server/routers/crm/index.ts`（`dashboard.summary`、`analytics.*`） |
| Schema | `packages/db/src/crm-schema.ts` |

**关联设计**：[crm-workbench-implementation-plan.md](crm-workbench-implementation-plan.md)、[project-tenant-daily-consumption-design.md](project-tenant-daily-consumption-design.md)
