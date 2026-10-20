# 租户卡时消费 · 月度导入与日/月独立存储 — 实现方案

> 版本：v0.2  
> 日期：2026-07-08  
> 状态：**已实施**  
> 关联：  
> - [tenant-region-gpu-consumption-daily-monthly-design.md](tenant-region-gpu-consumption-daily-monthly-design.md) — 原日/月表设计（**rollup 部分由本文 supersede**）  
> - 现有日导入：`import-rows.ts`、`tenant-region-gpu-import-dialog.tsx`

---

## 1. 背景与问题

平台导出的租户卡时消费 Excel 常为 **月度汇总** 粒度（租户 × 区域 × GPU [× 产品线]），**不含「日期」列**，例如：

| 租户ID | base_value | 总消费 | … | GPU型号 | 区域 |
|--------|------------|--------|---|---------|------|
| 984 | 132,548.76 | 130,493.74 | … | 5090 | tj1q |

现有「导入 Excel」要求每行带 **日期**，写入日表后会 **rollup 月表**。用户上传月度汇总时报 **「缺少或无效日期」**。

### 1.1 本期决策摘要（v0.2 更新）

| 项 | 决策 |
|----|------|
| 日/月关系 | **完全独立**，取消 rollup；日写入 **不** 更新月表，月写入 **不** 更新日表 |
| 粒度键 | 增加 **产品线桶** `product_line`（裸金属 / 弹性部署 / Spot） |
| 月度导入 | 新按钮 + 选月份 + Excel 直写月表 |
| 日导入 | 行为保留，增加产品线列支持；**去掉 rollup 调用** |
| 列表 | 月表展示 **来源** 列 |
| 月行详情 | 新页面：对账状态 + 匹配日明细（可产品线过滤） |
| 按钮文案 / 默认月 / 忽略 Excel 日期列 | **已确认：是** |

---

## 2. 目标与非目标

### 2.1 目标

| # | 目标 |
|---|------|
| G1 | 页头 **「日卡时导入」** + **「月度卡时导入」** 并列 |
| G2 | 月度导入：用户 **必选 `usage_month`**，Excel **无需日期列**（含日期列则 **忽略**） |
| G3 | 日/月表均增加 **`product_line`**；导入支持列映射，缺省 **弹性部署** |
| G4 | **移除 rollup**：日 upsert 不再调用 `refreshTenantRegionGpuConsumptionMonthly` |
| G5 | 月表增加 **`source`**，列表 **展示来源** |
| G6 | 月行 **详情页**：展示对账结论 + 同键日明细，支持产品线过滤 |
| G7 | 日/月各自幂等 upsert，UK 含 `product_line` |

### 2.2 非目标

- 不自动把月汇总拆成日行，也不把日行 SUM 写回月表  
- 不改造平台 sync 任务（可二期按同 schema 接入）  
- 不在列表页做批量 purge  
- 日明细 Tab 不强制展示「与日合计是否等于月行」（对账放在 **月行详情页**）

---

## 3. 产品线模型

### 3.1 存储枚举（桶）

日表、月表统一存 **`product_line`**（varchar），取值 **三档**：

| 存储值 | 展示名 | 说明 |
|--------|--------|------|
| `elastic_deployment` | 弹性部署 | **默认值**；业务上涵盖平台细粒度 `pod_deployment`、`pod_job`、`pod_development` |
| `bare_metal` | 裸金属 | 裸金属短租/整租等 |
| `spot` | Spot | Spot 实例 |

> **设计说明**：本表按 **财务对账桶** 存储，**不** 再细分 `pod_*` 子类型。若平台日 sync 未来写入细粒度码，导入层 **归一化** 到上表三档后再入库。

### 3.2 Excel / UI 列映射

解析函数 `normalizeTenantRegionGpuProductLine(raw)`：

| 输入（别名，大小写/空格归一化后） | 存储值 |
|----------------------------------|--------|
| 空 / 未提供 | `elastic_deployment` |
| 弹性部署、弹性、Pod、pod、deployment、job、development、pod_deployment、pod_job、pod_development | `elastic_deployment` |
| 裸金属、bare_metal、BareMetal | `bare_metal` |
| Spot、spot、SPOT | `spot` |

**Excel 列名别名**：`产品线` / `product_line` / `productLine` / `类型`

### 3.3 展示映射（前端）

```typescript
const TENANT_REGION_GPU_PRODUCT_LINE_LABELS = {
  elastic_deployment: '弹性部署',
  bare_metal: '裸金属',
  spot: 'Spot',
} as const

const TENANT_REGION_GPU_SOURCE_LABELS = {
  platform_sync: '平台同步',
  manual_import: '手工导入',
  backfill: '历史回填',
} as const
```

月表 `source` 无 `daily_rollup`（rollup 已取消）。

---

## 4. 数据模型变更

### 4.1 唯一键调整

**日表** `tenant_region_gpu_consumption_daily`：

```text
UK: (tenant_platform_id, usage_date, region_code, gpu_model, product_line)
```

**月表** `tenant_region_gpu_consumption_monthly`：

```text
UK: (tenant_platform_id, usage_month, region_code, gpu_model, product_line)
```

幂等键 / `platform_idempotency_key`（日表）同步纳入 `product_line`。

### 4.2 新增 / 调整列

| 表 | 列 | 变更 |
|----|-----|------|
| 日表 | `product_line` | **新增** NOT NULL DEFAULT `'elastic_deployment'` |
| 月表 | `product_line` | **新增** NOT NULL DEFAULT `'elastic_deployment'` |
| 月表 | `source` | **新增** NOT NULL DEFAULT `'manual_import'`（历史行 migration 见 §4.4） |
| 月表 | `day_count` | **删除**（rollup 专用，改由详情 API 实时 COUNT 日表） |
| 月表 | `last_daily_sync_at` | **删除**（rollup 专用） |

日表已有 `source`，语义不变：`platform_sync` | `manual_import` | `backfill`。

### 4.3 Migration 要点

1. 两表 ADD `product_line`，存量行 DEFAULT `elastic_deployment`  
2. DROP 旧 UK → CREATE 新 UK（含 `product_line`）  
3. 月表 ADD `source`；存量无 rollup 来源的行可标 `manual_import` 或 `platform_sync`（按 `created_at` 与是否曾有日表推断，实现时 **统一默认 `manual_import`** 亦可接受）  
4. 月表 DROP `day_count`、`last_daily_sync_at`  
5. 新增索引：`(usage_month, product_line)`、`(tenant_platform_id, usage_month, product_line)` 等（按列表/详情查询补全）

### 4.4 与日/月独立存储的关系

```text
┌─────────────────┐         ┌─────────────────┐
│  日表 daily     │         │  月表 monthly   │
│  日导入/sync    │   ✕     │  月导入         │
│  写 daily only  │ ─rollup─│  写 monthly only│
└─────────────────┘  已移除 └─────────────────┘
         │                           │
         └───────── 详情页只读对账 ───┘
                   （SUM 比较，不写库）
```

---

## 5. 取消 Rollup（实现要求）

### 5.1 删除 / 停用

| 项 | 处理 |
|----|------|
| `refreshTenantRegionGpuConsumptionMonthly` | **删除** 或保留空壳 deprecated，**无任何调用方** |
| `refreshTenantRegionGpuConsumptionMonth` | 同上 |
| `upsertTenantRegionGpuConsumptionDaily` 末尾 rollup 调用 | **移除** |
| 设计文档 §6 rollup SQL | 标记 superseded |

### 5.2 行为变化（用户可见）

| 场景 | 新行为 |
|------|--------|
| 仅日导入 | 日 Tab 有数据；**月 Tab 不自动出现对应行** |
| 仅月导入 | 月 Tab 有数据；日 Tab 无对应行 |
| 日 + 月同键均导入 | 两表 **各自保留**；详情页可比对是否一致 |
| 删除日表行 | **不影响** 月表 |
| 覆盖月导入 | **不影响** 日表 |

### 5.3 对账（只读）

对账 **仅** 在月行详情页计算，**不** 回写月表：

```text
daily_sum = SUM(日表度量列)
WHERE tenant_platform_id = :tid
  AND usage_month = :month
  AND region_code = :region
  AND gpu_model = :gpu
  AND product_line = :product_line   -- 与月行一致时为主对账键

matches = |monthly.metric - daily_sum.metric| ≤ tolerance
```

容忍度与 D8 一致：金额 0.01 元，卡时 6 位小数。

---

## 6. 导入功能

### 6.1 入口

`/finance/tenant-region-gpu-consumption` 页头：

```
[ 日卡时导入 ]   [ 月度卡时导入 ]
```

- 日按钮：原「导入 Excel」改名，流程 upload → preview → done  
- 月按钮：独立弹窗，**必选目标月份**（默认 **当前自然月**）

### 6.2 Excel 列规范（日 / 月通用）

**必填**

| 列 | 映射 |
|----|------|
| 租户Id / 租户ID / tenant_id / tenant_platform_id | `tenant_platform_id` |
| 区域 / region / region_code | `region_code`（`normalizeBillingRegion`） |
| GPU型号 / gpu_model | `gpu_model` |

**可选**

| 列 | 默认 |
|----|------|
| 产品线 / product_line（§3.2） | `elastic_deployment` |
| base_value / 基准消费 | 刊例价 × 总卡时回填，否则 `0` |
| 总消费 / 券消费 / 余额消费 / 总卡时 / 券卡时 / 余额卡时 | 同现逻辑 |

**日导入额外必填**

| 列 | 映射 |
|----|------|
| 日期 / usage_date / usageDate | `usage_date`（YYYY-MM-DD） |

**月导入**

- **无日期列**；若 Excel 含「日期」列 → **一律忽略**，以 UI 所选 `usage_month` 为准  
- 合计行：复用 `isTenantBillTotalRow` 跳过

**校验（D8）**

```text
总卡时   = 券卡时   + 余额卡时
总消费   ≈ 券消费   + 余额消费   （0.01 元）
balance_* ≥ 0
```

### 6.3 写入目标

| 入口 | 目标表 | source |
|------|--------|--------|
| 日卡时导入 | `tenant_region_gpu_consumption_daily` | `manual_import` |
| 月度卡时导入 | `tenant_region_gpu_consumption_monthly` | `manual_import` |

快照 as-of：

- CRM：`resolveTenantCrmSnapshot({ tenantPlatformId, usageMonth })`  
- 定价：`resolveInfraPricingSnapshot({ regionCode, gpuModel, usageDate })`  
  - 日导入：`usageDate` = 行日期  
  - 月导入：`usageDate` = `lastDayOfMonth(usageMonth)`

### 6.4 预览列

| 日导入预览 | 月导入预览 |
|------------|------------|
| 日期 | 所选月份 |
| 产品线 | 产品线 |
| 租户Id / 区域 / GPU / 度量 | 同左 |

月导入 **不再** 做「与日冲突 warn」（日/月独立，无覆盖关系）。

---

## 7. 列表页改造

路径：`/finance/tenant-region-gpu-consumption`

### 7.1 月度 Tab 增列

| 列 | 说明 |
|----|------|
| **产品线** | §3.3 展示名 |
| **来源** | `source` → 手工导入 / 平台同步 / 历史回填 |
| **操作** | 「详情」链接 → 月行详情页 |

### 7.2 日明细 Tab 增列

| 列 | 说明 |
|----|------|
| **产品线** | §3.3 展示名 |

（日表可不展示 source，或二期与日表对齐；**月表必展示 source**。）

### 7.3 筛选（可选首期）

- 产品线下拉：全部 / 弹性部署 / 裸金属 / Spot  
- 与现有「月度、租户 Id、机房」筛选叠加

---

## 8. 月行详情页

### 8.1 路由

```
/finance/tenant-region-gpu-consumption/monthly/[monthlyRowId]
```

- `monthlyRowId` = 月表 PK  
- 权限：`admin`（与导入一致）  
- 面包屑：`租户卡时消费` → `{usage_month}` → `详情`

### 8.2 页面结构

```
┌─────────────────────────────────────────────────────────────┐
│ 月行摘要（只读）                                              │
│  月份 | 租户Id | 租户名 | 区域 | GPU | 产品线 | 来源          │
│  总消费 / 余额消费 / 总卡时 / 余额卡时 / base_value / …       │
├─────────────────────────────────────────────────────────────┤
│ 对账卡片                                                      │
│  状态：✓ 与日合计一致 | ✗ 不一致 | — 无日明细                  │
│  月行值 vs 日合计 vs 差额（消费、卡时各列）                    │
│  日明细行数：N                                                │
├─────────────────────────────────────────────────────────────┤
│ 日明细列表                                                    │
│  筛选：产品线 [当前行产品线 ▼] （全部 / 弹性部署 / 裸金属 / Spot）│
│  固定条件：同 tenant_platform_id + usage_month + region + gpu │
│  表格：日期 | 产品线 | 余额消费 | 余额卡时 | 来源 | …         │
│  分页                                                        │
└─────────────────────────────────────────────────────────────┘
```

### 8.3 对账逻辑

**主对账**（默认展示）：月行 `product_line` 与日表 **同 product_line** 的 SUM。

**产品线过滤器**（日明细区）：

| 筛选值 | 日表明细范围 |
|--------|--------------|
| 默认（当前月行产品线） | `product_line = 月行.product_line` |
| 全部 | 同 tenant + month + region + gpu，**不限** product_line |
| 指定其他产品线 | 仅该 `product_line` |

切换过滤器时：

- 日明细表格刷新  
- 对账卡片可 **联动**：选「全部」时展示 **分产品线拆分 SUM** + 与月行对比（仅当筛选=月行产品线时显示「是否一致」主结论；选全部时展示各线 SUBTOTAL 表格，避免误导）

推荐 UX：

| 筛选 | 对账卡片 |
|------|----------|
| = 月行产品线 | 显示 **一致 / 不一致 / 无日明细** |
| ≠ 月行产品线 或 全部 | 隐藏主一致 badge，改为「当前筛选下日合计」参考值 |

### 8.4 API

```typescript
// tRPC query
getMonthlyRowDetail(input: {
  monthlyRowId: string
  dailyProductLineFilter?: 'all' | TenantRegionGpuProductLine  // 默认月行 product_line
  dailyLimit?: number
  dailyOffset?: number
}): {
  monthly: TenantRegionGpuConsumptionListItem
  reconciliation: {
    scopeProductLine: TenantRegionGpuProductLine
    status: 'match' | 'mismatch' | 'no_daily'
    monthlyMetrics: Metrics
    dailySumMetrics: Metrics | null
    deltaMetrics: Metrics | null
    dailyRowCount: number
  }
  dailyRows: { rows: DailyListItem[]; total: number }
}
```

`Metrics`：`totalConsumption`, `balanceConsumption`, `totalCardHours`, `balanceCardHours`, `voucher*` 等。

### 8.5 前端文件（规划）

```
apps/web/src/app/.../tenant-region-gpu-consumption/
  monthly/[monthlyRowId]/page.tsx
  _components/tenant-region-gpu-monthly-detail-content.tsx
```

---

## 9. 后端模块

### 9.1 目录

```
tenant-region-gpu-consumption/
  product-line.ts              # normalizeTenantRegionGpuProductLine + labels
  import-rows.ts               # 日导入（增 product_line；去掉 rollup）
  import-monthly-rows.ts       # 月导入 preview + commit
  upsert-daily.ts              # 从 upsert-and-rollup 拆出日 upsert（无 rollup）
  upsert-monthly.ts            # 月 upsert
  reconcile.ts                 # 对账 SUM 逻辑（详情页用）
  monthly-detail.ts            # getMonthlyRowDetail
  list.ts                      # 列表增 product_line、source 字段
```

**删除 / 废弃**：`refreshTenantRegionGpuConsumptionMonthly`、`refreshTenantRegionGpuConsumptionMonth`。

### 9.2 tRPC 增量

| 方法 | 说明 |
|------|------|
| `previewMonthlyImport` | `{ fileName, fileBase64, usageMonth }` |
| `commitMonthlyImport` | 同上 |
| `getMonthlyRowDetail` | §8.4 |
| 现有 `previewImport` / `commitImport` | 增 `product_line` 解析；日 upsert 去 rollup |

### 9.3 类型

```typescript
export type TenantRegionGpuProductLine =
  | 'elastic_deployment'
  | 'bare_metal'
  | 'spot'

export type TenantRegionGpuMonthlyImportPreviewRow = {
  rowNo: number
  parseStatus: 'ok' | 'error' | 'skip'
  parseMessage?: string
  usageMonth?: string
  productLine?: TenantRegionGpuProductLine
  tenantPlatformId?: string
  regionCode?: string
  gpuModel?: string
  balanceConsumption?: string
  balanceCardHours?: string
}
```

---

## 10. 实施步骤

| 阶段 | 内容 | 预估 |
|------|------|------|
| P1 | Migration：`product_line`、`source`；DROP rollup 列；重建 UK | 1d |
| P2 | 去掉 rollup；日/月 upsert 拆分；`product-line.ts` | 1d |
| P3 | 日/月 import 解析 + tRPC | 1d |
| P4 | 列表增列（产品线、来源、详情链接）+ 双导入 Dialog | 1d |
| P5 | 月行详情页 + reconcile API | 1.5d |
| P6 | 测试 + 更新主设计文档 rollup 章节 | 0.5d |

**合计约 6 人日**。

---

## 11. 测试计划

| # | 用例 | 期望 |
|---|------|------|
| T1 | 月导入样例 Excel + 选月 | 写入月表，`source=manual_import`，默认 `elastic_deployment` |
| T2 | Excel 含「产品线=裸金属」 | 存 `bare_metal` |
| T3 | 日导入含日期 + 无产品线 | 日表 `elastic_deployment`；**月表无自动行** |
| T4 | 同键日 + 月分别导入 | 两表共存，互不影响 |
| T5 | 详情页：月行 = 日 SUM | 对账 **一致** |
| T6 | 详情页：月行 ≠ 日 SUM | 对账 **不一致**，展示差额 |
| T7 | 详情页：无日明细 | **无日明细** |
| T8 | 详情页产品线筛选 Spot | 仅展示 Spot 日行；对账卡片按 §8.3 切换 |
| T9 | 重复月导入同 UK | 覆盖月行，日表不变 |
| T10 | 日导入后 | **不** 触发月表任何变更 |

---

## 12. 已确认事项

| # | 问题 | 结论 |
|---|------|------|
| 1 | 日/月是否 rollup | **否，完全独立** |
| 2 | 按钮文案 | **日卡时导入 / 月度卡时导入** |
| 3 | 默认月份 | **当前自然月** |
| 4 | Excel 日期列（月导入） | **忽略** |
| 5 | 月列表展示来源 | **是** |
| 6 | 产品线三档 | **裸金属 / 弹性部署（默认）/ Spot** |
| 7 | 月行详情页 | **是**（对账 + 日明细 + 产品线过滤） |

---

## 13. 文件清单（确认后实施）

**新增**

- `product-line.ts`  
- `import-monthly-rows.ts`  
- `upsert-monthly.ts`  
- `upsert-daily.ts`（或重构 `upsert-and-rollup.ts`）  
- `reconcile.ts`  
- `monthly-detail.ts`  
- `tenant-region-gpu-monthly-import-dialog.tsx`  
- `tenant-region-gpu-monthly-detail-content.tsx`  
- `monthly/[monthlyRowId]/page.tsx`  
- `tenant-region-gpu-monthly-import.ts`（types）  
- `packages/db/drizzle/00xx_*.sql`

**修改**

- `packages/db/src/crm-schema.ts`  
- `import-rows.ts`（product_line + 去 rollup 调用）  
- `tenant-region-gpu-consumption/index.ts`  
- `list.ts`  
- `routers/finance/index.ts`  
- `tenant-region-gpu-consumption-content.tsx`  
- `tenant-region-gpu-import-dialog.tsx`  
- `tenant-region-gpu-consumption-daily-monthly-design.md`（rollup 章节标注废弃）

**删除 / 清空调用**

- `refreshTenantRegionGpuConsumptionMonthly`  
- `refreshTenantRegionGpuConsumptionMonth`

---

## 14. 附录：原 v0.1 策略变更对照

| v0.1 | v0.2 |
|------|------|
| 策略 A/B rollup 冲突 | **整节删除**；日/月独立 |
| `source=daily_rollup` | **取消** |
| `day_count` / `last_daily_sync_at` | **删除** |
| 月导入 warn 日明细冲突 | **取消** |
| 无 product_line | **UK + 列 + 导入 + 详情** |
| 无详情页 | **§8 月行详情 + 对账** |
| 来源列首期不做 | **月列表必展示** |
