> # ⛔ 已归档 — 部分内容已过期
>
> **归档日期**：2026-09-26　**原路径**：`docs/merchant-console-followups.md`
> **归档原因**：商户控制台的**实施说明**（rollup / cron / 三价对比），非设计文档。rollup 的存在与形态仍有效，但其中若干「已完成」结论已被推翻，且其技术债列表未覆盖后续的模型级变更。
>
> **已知过期点**：
> - §2 称销售价列已能正确显示「未设置」badge —— 实际 `apps/merchant/src/lib/server/pricing-data.ts:221` 硬编码 `hasSalesPrice: false`，永远显示「未设置」（主设计文档 P1-12）。
> - 技术债 #3 称 `merchantBillMonthly` 无 `status` 字段「待补充」—— 已由迁移 `0016` + `settlement-data.ts:147-182` 实现；本文 §1 结论与 #3 自相矛盾。
> - 未覆盖：预付账户、券账户、预付 vs 后付费的模型级冲突（主设计文档 §3.1）。
>
> **当前有效设计文档**：`apps/merchant/content/design/merchant-module-review-and-design.md`

# 商户控制台后续开发 — 技术说明

## 已完成功能

### 1. 商户日报/月报 Rollup 表（HARD REQUIREMENT）

根据用户要求「对于月报表和日报表需要建单独表，由单独的cron进程进行rollup，而不是复杂查询」，已实现：

#### Schema 变更

在 `merchant_bill_daily` 和 `merchant_bill`（merchantBillMonthly 别名）表中添加：
- `platform_cost` (numeric): 商户采购成本（**已实现真实计算**）
- `gross_profit` (numeric): 毛利 = totalAmount - platformCost
- `bill_date` (date): merchantBillDaily 新增，用于日切统计

新增 `merchant_tenant_contribution` 汇总表：
- `total_revenue` (numeric): 租户累计收入
- `total_cost` (numeric): 租户累计成本（预留字段）
- `total_profit` (numeric): 租户累计毛利
- `first_bill_date` / `last_bill_date` / `bill_days_count`: 账单统计信息

#### Rollup 逻辑

文件：`apps/web/src/lib/server/jobs/merchant-rollup/run-merchant-rollup.ts`

**platformCost 真实计算公式** (已实现):

```
platformCost = Σ (cardHours × hourlyPurchasePrice)

其中：
- cardHours 来自 tenant_consumption_daily_detail.total_card_hours
- hourlyPurchasePrice 从 merchant_purchase_price 查询，匹配条件：
  * merchantId
  * dataCenterId (from consumption detail)
  * gpuCardTypeId (from consumption detail)
  * productLine (from consumption detail)
  * status = 'active' AND effective_to IS NULL

- billingUnit 转换：
  * hour: price × 1
  * day: price / 24
  * week: price / (24 × 7)
  * month: price / (24 × 30) (近似)

- 缺失价格处理：
  * 记录 warning 日志，该项成本计为 0
  * 日志包含 merchantId, rollupDate, dataCenterId, gpuCardTypeId, productLine, cardHours
```

**日报表 rollup** (`runMerchantDailyRollup`):
1. 从 `tenant_bill_daily` 聚合收入侧（totalAmount, couponAmount, balanceAmount, tenantCount）
2. 从 `tenant_consumption_daily_detail` 读取卡时消费明细
3. 查询 `merchant_purchase_price` 构建价格映射
4. 计算 platformCost = Σ(cardHours × hourlyRate)，匹配不到价格的记录 warning
5. 写入/更新 `merchant_bill_daily`（幂等 onConflictDoUpdate）

**月报表 rollup** (`runMerchantMonthlyRollup`):
- 从 `merchant_bill_daily` 按月聚合（已包含正确的 platformCost）
- 计算字段：totalAmount, platformCost, grossProfit, couponAmount, balanceAmount
- 支持幂等重跑

**租户贡献汇总** (`maintainTenantContributions`):
- 从 `tenant_bill_daily` 按商户+租户聚合累计收入
- 写入/更新 `merchant_tenant_contribution` 表
- tenants list 页面直接 JOIN 此表，**不再做 live 聚合**

**回填工具**:
- `backfillMerchantDaily(startDate, endDate)`: 批量回填日报
- `backfillMerchantMonthly(startMonth, endMonth)`: 批量回填月报

#### Cron 调度

文件：`apps/web/src/lib/server/jobs/register-merchant-rollup-cron.ts`

- 每日 03:00 东八区自动运行昨日商户日报 + 当月月报 + 租户贡献汇总
- 环境变量：`MERCHANT_ROLLUP_CRON`（默认 `0 3 * * *`）
- 已在 `init-cron-jobs.ts` 中注册

#### 数据访问层更新

- `settlement-data.ts`: 直接读取 merchantBillDaily/merchantBillMonthly，不再做 live GROUP BY
- `dashboard-data.ts`: `get30DayRevenue` 改为简单 SELECT，不再 groupBy
- `tenant-data.ts`: **移除 tenant_bill_daily 子查询聚合**，改为 LEFT JOIN `merchant_tenant_contribution`

### 2. 销售定价三价对比

#### Schema

`merchant_sales_price` 表已存在（设计文档定义），新增：
- 查询逻辑：`pricing-data.ts` 中 JOIN merchantSalesPrice
- 返回字段：`salesPrice` (可选)

#### tRPC 路由

文件：`apps/merchant/src/lib/server/routers/pricing.ts`

新增 `upsertSalesPrice` mutation：
- 输入：dataCenterId, gpuCardTypeId, productLine, billingUnit, salesPrice, purchasePrice, remark
- 逻辑：关闭旧 active 记录，插入新记录（effectiveFrom = 今天）
- 验证：前端已实现 salesPrice >= purchasePrice 校验

#### UI 更新

- `pricing-content.tsx`: 销售价列从显示进货价改为显示真实销售价（未设置显示"未设置" badge）
- `sales-price-dialog.tsx`: 编辑器调用 tRPC mutation 保存

### 3. 我的客户页面增强

文件：`apps/merchant/src/lib/server/tenant-data.ts`

新增字段：
- `source` (string): 客户来源（推广 / OEM / 其他）
  - 逻辑：通过 LEFT JOIN `merchant_promo_attribution` 判断是否为推广客户
  - OEM 判断需 merchant.accessMode，当前简化为 推广 / 其他
- `totalRevenue` (string): 累计收入
  - **数据源：LEFT JOIN `merchant_tenant_contribution.total_revenue`（precomputed）**
  - **不再使用 live 聚合 tenant_bill_daily**

UI 更新：`tenants-table.tsx` 新增两列

### 4. Dashboard 真实图表

文件：`apps/merchant/src/app/[locale]/console/_components/revenue-chart.tsx`

- 使用 recharts 3.8.0（项目已有依赖）
- 数据来源：`dashboard.revenue30Days` tRPC query → merchantBillDaily rollup table
- 显示：日均 / 最高 / 最低日收益 + 折线图

## 数据库迁移

迁移文件：`packages/db/drizzle/0015_add_merchant_rollup_fields.sql`

### 迁移内容

1. **merchant_bill 表新增字段**:
   - `platform_cost` numeric(15,4) NOT NULL DEFAULT '0'
   - `gross_profit` numeric(15,4) NOT NULL DEFAULT '0'

2. **merchant_bill_daily 表新增字段**:
   - `bill_date` date NOT NULL DEFAULT CURRENT_DATE
   - `platform_cost` numeric(15,4) NOT NULL DEFAULT '0'
   - `gross_profit` numeric(15,4) NOT NULL DEFAULT '0'

3. **merchant_bill_daily 索引调整**:
   - 删除旧的 `merchant_bill_daily_merchant_date_uk` (基于 usage_date)
   - 创建新的 `merchant_bill_daily_merchant_date_uk` (基于 bill_date)
   - 删除 `merchant_bill_daily_usage_date_idx`
   - 创建 `merchant_bill_daily_bill_date_idx`

4. **merchant_tenant_contribution 新表**:
   - `id` text PRIMARY KEY
   - `merchant_id` text NOT NULL (FK → merchant.id)
   - `tenant_id` text NOT NULL (FK → tenant.id)
   - `total_revenue` numeric(15,4) DEFAULT '0'
   - `total_cost` numeric(15,4) DEFAULT '0'
   - `total_profit` numeric(15,4) DEFAULT '0'
   - `first_bill_date` date
   - `last_bill_date` date
   - `bill_days_count` integer DEFAULT 0
   - `synced_at` timestamp with time zone DEFAULT now()
   - `created_at` / `updated_at` timestamps
   - UNIQUE INDEX: `(merchant_id, tenant_id)`
   - INDEX: `merchant_id`
   - INDEX: `tenant_id`

### 执行迁移

```bash
# 1. 配置数据库连接（生产环境已有）
export DATABASE_URL="postgresql://user:password@host:port/database"

# 2. 执行迁移
pnpm --filter @workspace/db run db:migrate

# 3. 验证迁移
psql $DATABASE_URL -c "\d merchant_bill_daily"
psql $DATABASE_URL -c "\d merchant_tenant_contribution"
```

### 回填历史数据

迁移完成后，运行回填脚本：

```typescript
import { backfillMerchantDaily, backfillMerchantMonthly } from '@/lib/server/jobs/merchant-rollup/run-merchant-rollup'

// 回填近 90 天日报
await backfillMerchantDaily('2025-01-01', '2025-03-31')

// 回填近 12 个月月报
await backfillMerchantMonthly('2024-04', '2025-03')
```

或通过 API/admin 工具手动触发。

### 注意事项

1. **bill_date 默认值**: 新增的 `bill_date` 字段默认值为 `CURRENT_DATE`，现有记录会自动填充当前日期。回填时需要通过 UPDATE 语句根据 `usage_date` 更新正确的 `bill_date`。

2. **索引重建**: 迁移会先删除旧索引再创建新索引，短暂影响查询性能，建议在低峰期执行。

3. **外键约束**: `merchant_tenant_contribution` 表的外键约束会验证 `merchant_id` 和 `tenant_id` 的存在性，确保数据完整性。

### 新增字段清单

`merchant_bill_daily`:
- `platform_cost` numeric(15,4) NOT NULL DEFAULT '0'
- `gross_profit` numeric(15,4) NOT NULL DEFAULT '0'
- `bill_date` date NOT NULL

`merchant_bill`:
- `platform_cost` numeric(15,4) NOT NULL DEFAULT '0'
- `gross_profit` numeric(15,4) NOT NULL DEFAULT '0'

`merchant_tenant_contribution` (新表):
- `id` text PRIMARY KEY
- `merchant_id` text NOT NULL
- `tenant_id` text NOT NULL
- `total_revenue` numeric(15,4) DEFAULT '0'
- `total_cost` numeric(15,4) DEFAULT '0'
- `total_profit` numeric(15,4) DEFAULT '0'
- `first_bill_date` date
- `last_bill_date` date
- `bill_days_count` integer DEFAULT 0
- `synced_at` timestamp
- `created_at` / `updated_at` timestamps
- UK: `(merchant_id, tenant_id)`

### 回填历史数据

迁移完成后，运行回填脚本：

```typescript
import { backfillMerchantDaily, backfillMerchantMonthly } from '@/lib/server/jobs/merchant-rollup/run-merchant-rollup'

// 回填近 90 天日报
await backfillMerchantDaily('2025-01-01', '2025-03-31')

// 回填近 12 个月月报
await backfillMerchantMonthly('2024-04', '2025-03')
```

或通过 API/admin 工具手动触发。

## 成本计算细节

### platformCost 数据流

```
tenant_consumption_daily_detail (事实表)
  ├─ total_card_hours: 实际消费卡时
  ├─ product_line: 产品线 (elastic_service, cloud_vm, etc.)
  ├─ data_center_id: 机房
  └─ gpu_card_type_id: GPU 型号
       ↓ 匹配查询
merchant_purchase_price (进货价表)
  ├─ purchase_price: 进货价
  ├─ billing_unit: 计费单位 (hour/day/week/month)
  └─ status='active', effective_to IS NULL
       ↓ 计算
platformCost += cardHours × (purchasePrice / unitHours)
```

### 缺失价格处理

当某条消费明细找不到匹配的 purchase_price 时：
1. 该项成本计为 **0**
2. 记录 `merchant-rollup.missingPrice` 日志（level: log）
3. 日终汇总 `merchant-rollup.costWarning`，包含缺失价格项数

### 月报聚合策略

月报从 `merchant_bill_daily` 聚合（而非从 `tenant_bill` 聚合），原因：
- merchant_bill_daily 已包含正确的 platformCost 计算
- 避免月报层重复计算成本
- 保证日报和月报的 platformCost 一致性

## 验证步骤

1. **Lint**: 已通过 (merchant + web packages)
   - merchant: 0 errors
   - web: 0 errors

2. **迁移**:
   - 需配置 DATABASE_URL 后运行 `db:generate` + `db:migrate`
   - 回填 rollup 数据

3. **功能测试** (需运行环境):
   - 访问 `/console` 查看 30 天收益图表
   - 访问 `/console/pricing` 编辑销售价并验证三价对比
   - 访问 `/console/tenants` 查看来源和累计收入列（读取 contribution 表）
   - 访问 `/console/settlement` 验证日报/月报读取 rollup 表，grossProfit 正确
   - 检查日志 `merchant-rollup.missingPrice` 确认无大量缺失价格

4. **Cron 验证** (生产环境):
   - 等待次日 03:00 或手动触发 `runMerchantDailyPipeline('YYYY-MM-DD')`
   - 检查 `merchant_bill_daily` 表新增记录
   - 验证 `platformCost > 0`（有消费时）
   - 检查 `merchant_tenant_contribution` 表是否有数据

## 技术债务与后续改进

1. ~~**platformCost 计算**~~: ✅ 已实现真实计算（cardHours × purchasePrice）
2. **OEM 来源判断**: 当前只区分推广/其他，需增加 merchant.accessMode 判断逻辑
3. **月报确认流程**: `merchantBillMonthly` 表无 status 字段，确认功能待补充
4. **租户级成本分摊**: `merchantTenantContribution.total_cost` 当前设为 0，可扩展为按租户聚合消费×价格

## 遵循规范

- ✅ 数据库级分页（tenants list 未改动，已符合要求）
- ✅ Drizzle ORM 查询模式（显式 select, 子查询 as alias, 条件 and/or 数组）
- ✅ 禁用 `'use server'` 指令（tRPC 路由，Server Component 直接导入）
- ✅ 金额字段 `numeric(15,4)` + money helper
- ✅ Cron job 注册模式（node-cron + timezone）
- ✅ Recharts 现有依赖复用
- ✅ **移除 tenants list 的 live 聚合**，改用 JOIN merchant_tenant_contribution

## 相关文件

### 新增
- `apps/web/src/lib/server/jobs/merchant-rollup/run-merchant-rollup.ts`
- `apps/web/src/lib/server/jobs/register-merchant-rollup-cron.ts`
- `apps/merchant/src/app/[locale]/console/_components/revenue-chart.tsx`

### 修改
- `packages/db/src/merchant-schema.ts` (新增 merchantTenantContribution 表, 更新字段)
- `apps/merchant/src/lib/server/settlement-data.ts` (使用 rollup 表)
- `apps/merchant/src/lib/server/dashboard-data.ts` (移除 GROUP BY)
- `apps/merchant/src/lib/server/tenant-data.ts` (**移除 live 子查询，改用 contribution 表**)
- `apps/merchant/src/lib/server/pricing-data.ts` (JOIN salesPrice, 新增 upsertSalesPrice)
- `apps/merchant/src/lib/server/routers/pricing.ts` (新增 mutation)
- `apps/merchant/src/app/[locale]/console/tenants/tenants-table.tsx` (UI)
- `apps/merchant/src/app/[locale]/console/pricing/pricing-content.tsx` (UI)
- `apps/merchant/src/app/[locale]/console/pricing/sales-price-dialog.tsx` (UI)
- `apps/merchant/src/app/[locale]/console/page.tsx` (Dashboard 图表)
- `apps/web/src/lib/server/jobs/init-cron-jobs.ts` (注册新 cron)
