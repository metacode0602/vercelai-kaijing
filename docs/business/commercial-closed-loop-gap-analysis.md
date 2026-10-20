# 商业闭环断点分析

> **版本**：v1.0  
> **日期**：2026-09-24（UTC）  
> **分支**：`develop-gpus` @ `6e43af8` (PR #4 合并后)  
> **任务**：审计 merchant 和 supplier/IDC 两条商业链路的完整性  
> **定位**：READ-ONLY 分析，不含实现补丁  
> **内部限阅 · 禁止对外分发**：本文含进货价匹配、成本 rollup、三价对比等未公开成本结构与内部字段名，仅供内部工程与运营使用。
>
> **2026-10-05 校正**：本文是 `6e43af8` 时点的快照，此后多处「断点」已由后续 PR 闭合。
> 已就地改正的条目：供应商账单 cron **已注册**、设备上传 UI **已实现**、
> 结算确认 mutation + 按钮 **已存在**、真实计量 **已改为 probe/order 实测**。
> 仍开放的项（推广归因落 `apps/gpus`、OEM 品牌站、任务算力后端、自动化接入流水线）
> **保留为断点**，其中不在本轮范围的标注 **⏸ 挂起**。
> 各条百分比（60% / 55%）为当时估算，不作为当前完成度口径。
>
> **2026-10-06 校正**：① Excel 设备批量导入链（`batch` router 的 `parseFile` / `commit`、设备导入面板）与运营大盘 `/dashboard`、`/dashboard/global` **已整体下线**，设备主数据现经 `supplier/devices` 列表页维护——涉及「设备上传 UI / 批量上传」「大盘看板」的条目以本条为准；② 旧成本派生链（`platform_cost_monthly`、`billing_period_cost_source_line`、`platform_cost_commission_derive_*`）已随迁移 `0039` 删除，现行成本真源为 `monthly_cost_*`。

---

## 执行摘要

基于 `develop-gpus` HEAD（PR #4 合并后），对商户（merchant）和供应商（supplier/IDC）两条商业链路进行闭环审计。

### Merchant 链路判断：**半闭环（60% 完整度）**

- **闭环部分**：Schema 完整，进货价/销售价/账单 rollup/充值/推广链接数据层齐全，tRPC 路由基本覆盖
- **断点部分**：OEM 品牌站未创建，apps/api 任务服务层为演示 stub，推广归因未落地到 apps/gpus 注册页，品牌化驱动逻辑缺失

### Supplier 链路判断：**半闭环（55% 完整度）**

- **闭环部分**：供应商身份、设备上传解析+提交、日账单/月账单数据层、下架请求、Dashboard KPI 齐全
- ~~**断点部分**：账单生成 cron 未注册，真实计量为 P0 简化版（70% 估算），设备上传 UI 待实现~~
  → **三项均已闭合**：`register-supplier-billing-cron.ts`（经 `init-cron-jobs.ts` 注册 + `/api/internal/cron/supplier-billing` HTTP 入口）、
  `fetchUsageFromProbeSnapshots`（source ∈ probe / order）、`/console/devices/batches/new` 上传页

---

## 1. Merchant 商户闭环审计

### 1.1 预期链路（来自产品文档）

根据 `docs/business/merchant-product-plan.md` 和 `docs/design/audit/merchant-console-followups.md`，商户闭环应包含：

```
商户入驻 → 进货价配置 → 商户定价（销售价）→ 租户归属 →
客户消耗 → 账单 rollup（platformCost + grossProfit）→ 充值/结算 →
推广链接/OEM 渠道获客
```

两种模式：
- **模式 A（推广链接）**：商户生成推广码，落地页为官方 `apps/gpus`，归因到 `tenant.merchant_id`，收益按进销价差结算
- **模式 B（OEM 品牌站）**：商户拥有独立域名+独立库+独立部署的品牌站，任务经 `apps/api`，销售价写品牌站库

### 1.2 闭环状态评估

| 步骤 | 状态 | 证据 | 优先级/严重程度 |
|------|------|------|-----------------|
| **1. 商户入驻/身份** | ✅ 闭环 | `merchant` 表完整（`merchant-schema.ts` L39-75），`organizationId` 绑定 better-auth；`apps/merchant/onboard` router 存在 | — |
| **2. 进货价配置** | ✅ 闭环 | `merchant_purchase_price` 表（L351-393），`merchant_purchase_price_record` 历史表，CRM 配置流程存在（`apps/web/dataaccess`） | — |
| **3. 销售价配置** | ✅ 闭环 | `merchant_sales_price` 表（L767-821），`upsertSalesPrice` mutation 已实现（`apps/merchant/routers/pricing.ts` L20-38），UI 已接入 | — |
| **4. 租户归属** | ✅ 闭环 | `tenant.merchant_id` 字段存在（设计文档已确认 v1.6 废弃中间表），`@workspace/db/crm-schema.ts` 中 `billingTenant` 表包含 `merchantId` | — |
| **5. 推广链接** | ⚠️ **半闭环** | ✅ **数据层完整**：`merchant_promo_link` / `merchant_promo_attribution` 表存在（L859-940），`promo` router CRUD 完整（`apps/merchant/routers/promo.ts`）<br>❌ **断点**：`apps/gpus` 注册页未接收 `?m=&r=` 参数并写入归因，`tenant.merchant_id` 默认赋值逻辑缺失 | **P0** — 推广链接无法实际归因 |
| **6. 账单 Rollup** | ✅ 闭环 | `merchant_bill_daily` / `merchant_bill`（月报）表存在，rollup cron 已实现（路径更正：`apps/web/src/lib/server/jobs/merchant-rollup/run-merchant-rollup.ts`，由 `register-merchant-rollup-cron.ts` → `init-cron-jobs.ts` 注册），`platformCost` **真实计算**（cardHours × purchasePrice），`merchant_tenant_contribution` 汇总表避免 live 聚合 | — |
| **7. 充值/结算** | ✅ 闭环 | `merchant_recharge_record` / `merchant_payment_node` 表存在（L190-267），`recharge` / `settlement` router 完整，充值附件/审计日志齐全 | — |
| **8. OEM 品牌站** | ❌ **断点** | ❌ **代码缺位**：文档承诺独立仓库 fork `apps/gpus`（Q6'=B），但**品牌站应用尚未创建**<br>✅ **支持表存在**：`merchant_branding` 表（L825-849），`merchantBranding` 关联已定义<br>❌ **驱动逻辑缺失**：品牌站路由未实现，主题化 `ThemeProvider` 未绑定 `merchant_branding`，商户自定义域名 CNAME 路由未实现 | **P0** — OEM 模式无法交付 |
| **9. 任务经 api** | ❌ **断点** | ✅ **OpenAPI 框架存在**：`apps/api/src/routes/tasks.ts` 完整定义 5 个端点（POST/GET/PATCH/status）<br>⚠️ **服务层部分实现**（路径更正：`apps/api/src/lib/task-service.ts`）：任务记录会**真实落库**（`createTask`/`getTask` 非空实现），但算力后端仍未接（L94 `TODO: 与计算后端集成（SkyPilot / Kubernetes）`、L111 `backendTaskId: null`、L196 取消为 TODO）<br>❌ **无真实算力调度**：未对接 SkyPilot / K8s / 裸金属编排 | **P0** — OEM 品牌站任务链路断裂 |
| **10. 定价未配置时默认刊例价** | ⚠️ **半闭环** | ✅ **设计决策锁定**：Q5=C 明确「默认 = 平台刊例价」<br>⚠️ **实现待验证**：`pricing-data.ts` 查询逻辑未找到显式 fallback 到 `platform_card_list_price`；tRPC 返回 `salesPrice` 字段标注 optional，前端未配置显示 "未设置" badge | **P1** — 影响商户体验，非阻塞交易 |
| **11. 白牌 merchant 控制台** | ⚠️ **半闭环** | ✅ **一套部署多租户架构存在**：`apps/merchant` 应用存在，认证走平台 better-auth，`resolveMerchantId` 从 organization 解析<br>❌ **按域名路由未实现**：Q17=A 要求「按客户域名多租户路由与主题」，但未找到域名→merchantId 映射中间件，`merchant_branding.customDomain` 未被路由层消费 | **P0** — OEM 白牌控制台无法区分客户 |
| **12. Feature Flags** | ✅ 闭环 | `merchant.promo_enabled` / `merchant.oem_enabled` 字段存在（L63-64），Q11=B 决策已落地 | — |

### 1.3 核心断点总结

#### P0 断点（阻塞商业闭环）

1. **OEM 品牌站应用未创建**
   - **现象**：文档 Q6'=B 明确「独立仓库 fork gpus」，但代码库中无 `apps/brand` 或独立品牌站仓库
   - **影响**：模式 B（OEM）完全无法交付，商户无法拥有独立域名站点
   - **涉及文件**：无（需新建）
   - **依赖**：`merchant_branding` 表已存在但未被驱动

2. **apps/api 任务算力后端未接（原「服务层为 stub」表述已过时）**
   - **现象**：`apps/api/src/lib/task-service.ts` 的 `createTask` / `getTask` **已真实落库**（266 行，非空实现）；
     但 L94 `TODO: 与计算后端集成（SkyPilot / Kubernetes）`、L111 `backendTaskId: null`、L196 取消为 TODO
   - **影响**：任务记录可建、可查，但**不会真的调度到算力** —— OEM 任务链路后半段仍断
   - **涉及文件**：`apps/api/src/lib/task-service.ts`
   - **依赖**：对接 SkyPilot / K8s / 裸金属订单系统
   - **⏸ 挂起**：算力后端集成不在本轮范围

3. **推广归因未落地**
   - **现象**：`apps/gpus` 注册页未解析 URL 参数 `?m={merchantCode}&r={promoCode}`，未写入 `merchant_promo_attribution`，`tenant.merchant_id` 默认赋值逻辑缺失
   - **影响**：模式 A（推广链接）无法实际归因，商户看不到推广效果
   - **涉及文件**：`apps/gpus/src/app/[locale]/(auth)/signup/page.tsx`（未找到 promo 参数处理）
   - **依赖**：需在注册成功时调用 `merchantPromoAttribution` 插入

4. **白牌 merchant 控制台按域名多租户路由缺失**
   - **现象**：`apps/merchant` 无域名→merchantId 映射中间件，`merchant_branding.customDomain` 未被 Next.js 中间件消费
   - **影响**：多 OEM 客户无法通过不同域名访问各自白牌控制台，所有客户看到同一套 UI
   - **涉及文件**：`apps/merchant/src/middleware.ts`（**拟新建，当前不存在**，未实现域名映射）
   - **依赖**：需在中间件中查询 `merchant_branding` 表，根据 `customDomain` 解析 `merchantId` 并注入 context

#### P1 断点（影响体验，非阻塞）

1. **定价未配置时 fallback 刊例价逻辑缺失**
   - **现象**：`pricing-data.ts` 查询逻辑未显式 LEFT JOIN `platform_card_list_price` 并 COALESCE
   - **影响**：商户未配置销售价时，终端用户看不到价格或显示错误价格
   - **涉及文件**：`apps/merchant/src/lib/server/pricing-data.ts`
   - **修复方向**：在查询中 COALESCE(salesPrice, platformListPrice)

2. **品牌化驱动逻辑缺失**
   - **现象**：`merchant_branding` 表存在但未被 `apps/merchant` 的 `ThemeProvider` 或 `apps/brand`（未创建）消费
   - **影响**：商户配置的 Logo/主题色无法实际呈现
   - **涉及文件**：`apps/merchant` 品牌主题提供方（**拟新建，当前不存在**，未读取 branding；`apps/web` 有对应实现可参考）
   - **修复方向**：在 layout 中查询 `merchant_branding`，注入 CSS 变量或 ThemeProvider props

3. **商户自有支付/短信/邮箱通道未实现**
   - **现象**：Q10=B 决策「商户可配置自有通道」，`merchant_branding` 表有 `paymentChannelConfig` / `smsChannelConfig` / `emailChannelConfig` JSONB 字段，但 `@workspace/billing` / `@workspace/sms-captcha` / `@workspace/email` 未读取
   - **影响**：OEM 商户无法使用自有支付宝/微信商户号、自有短信签名、自有邮件发件域
   - **涉及文件**：`packages/billing/src/payment.ts`、`packages/sms-captcha/src/send.ts`、`packages/email/src/send.ts`（均未条件分支读取 merchantId config）
   - **修复方向**：在各服务初始化时根据 merchantId 查询 branding 表，动态加载通道凭据

### 1.4 已知技术债（来自文档）

根据 `../design/audit/merchant-console-followups.md`，以下债务已在 PR #4 中解决：

- ✅ **platformCost 真实计算**：已实现 cardHours × purchasePrice 匹配算法（`run-merchant-rollup.ts` L30-49）
- ✅ **tenant list live 聚合移除**：已改用 `merchant_tenant_contribution` 表 JOIN（followups 文档 L110-119）
- ✅ **Dashboard 真实图表**：30 天收益折线图已使用 `merchantBillDaily` rollup 表（followups 文档 L122-130）

### 1.5 Merchant 闭环判断

**状态**：半闭环（60% 完整度）

**闭环部分**：
- 数据层 Schema 完整且设计超前（进货价/销售价/账单/充值/推广链接/品牌化表齐全）
- tRPC 路由覆盖核心业务（pricing / tenants / billing / recharge / promo）
- 账单 rollup cron 已投产，platformCost 真实计算
- 充值/结算流程闭环（包含审计日志）

**断点部分**：
- OEM 品牌站应用未创建（**文档承诺，代码缺位**）
- apps/api 任务服务层为演示 stub（**合约接口存在，实现为空**）
- 推广归因未落地到 gpus 注册页（**数据层齐全，UI 层断开**）
- 白牌 merchant 控制台域名多租户路由缺失（**架构约定，未实现**）

**阻塞收款路径**：
- 模式 A（推广链接）：归因断开 → 无法统计推广效果 → 无法计算佣金 → 结算数据缺失
- 模式 B（OEM）：品牌站未创建 + 任务 API stub → 客户无法使用算力 → 无消耗 → 无收入

---

## 2. Supplier / IDC 供应商闭环审计

### 2.1 预期链路（来自产品文档）

根据 `../../apps/supplier/content/design/supplier-upload-strategy-p0.md`，供应商闭环应包含：

```
供应商身份 → 设备上传（清单解析 + 批次提交）→ 审批/上架 →
计量（K8s 实际使用时长）→ 日账单/月账单 → Dashboard 查看 → 结算
```

核心决策：
- **供应商优先**：`apps/supplier` 门户为主入口，`apps/web` 兜底
- **功能复用**：短期直接引用 `apps/web` 解析逻辑，中期迁移至共享包

### 2.2 闭环状态评估

| 步骤 | 状态 | 证据 | 优先级/严重程度 |
|------|------|------|-----------------|
| **1. 供应商身份** | ✅ 闭环 | `supplier` 表存在（`supply-schema.ts`），`supplier_identity.ts` 中 `requireSupplierId` 从 `organizationId` 解析，兜底抛错 | — |
| **2. 设备上传解析** | ✅ 闭环 | `device-upload.ts` 完整实现：`createDeviceUploadBatch` / `parseDeviceUploadFile` / `commitDeviceUploadBatch`，解析逻辑引用 `parse-device-inventory.ts`，批次表 `onboardingBatch` / 行表 `onboardingBatchImportRow` 齐全 | — |
| **3. 设备上传 UI** | ✅ **闭环（已闭合）** | ✅ **router 存在**：`apps/supplier/src/lib/server/routers/batch.ts` 有 `createDraftBatch` / `parseFile` / `commit`<br>~~❌ **UI 待实现**~~ → **已实现**：`apps/supplier/src/app/[locale]/console/devices/batches/new/page.tsx` + 列表 / 详情页均已存在 | — |
| **4. 审批/上架** | ✅ 闭环 | `onboardingBatch` 表有 `batchStatus`（draft / onboarding / approved / rejected），`apps/web` CRM 审批流程存在（`supplier-import.ts` dataaccess） | — |
| **5. 日账单生成** | ✅ **闭环（已闭合）** | ✅ **服务函数存在**（路径更正）：`apps/web/src/lib/server/dataaccess/supplier/supplier-bill-generation.ts` 的 `generateDailyBills`<br>✅ **数据表齐全**：`supplier_bill_daily` / `supplier_bill_daily_detail`<br>~~❌ **Cron 未注册**~~ → **已注册**：`apps/web/src/lib/server/jobs/register-supplier-billing-cron.ts`，在 `init-cron-jobs.ts:49` 注册，并有 HTTP 入口 `/api/internal/cron/supplier-billing`；受 `isSupplierBillingEnabled()`（`SUPPLIER_BILLING_ENABLED`）门控 | — |
| **6. 真实计量** | ✅ **闭环（已闭合）** | ~~❌ 70% 硬编码估算~~ → **已对接实测**：`fetchUsageFromProbeSnapshots()` 读 `devicePlatformProbeSnapshot` 逐小时快照，`source ∈ {probe, order, none}`（`supplier-bill-generation.ts:297-332, 500-501`）<br>⚠️ **剩余口径限制**：无进货价 / 待结算的卡时 `tenantConsumption` 记 `null` 且金额按 0 记账（同文件 L586-717），属设计内的「待结算」而非计量缺失 | — |
| **7. 月账单生成** | ✅ **闭环（已闭合）** | ✅ `generateMonthlyBills` 聚合日账单生成月账单<br>✅ **数据表齐全**：`supplier_bill` / `supplier_bill_detail`<br>~~❌ **Cron 未注册**~~ → **已注册**（同步骤 5，`register-supplier-billing-cron.ts` 同时覆盖日/月） | — |
| **8. Dashboard KPI** | ✅ 闭环 | `apps/supplier/dataaccess/dashboard.ts` 实现真实查询：今日预估收入（当日日账单 SUM）、本月累计（当月日账单 SUM）、在线设备数、下架待审批数 | — |
| **9. 下架请求** | ✅ 闭环 | `retire.ts` dataaccess + router 完整，`onboardingBatch` 中 `batchKind='device_retire'`，审批流程存在 | — |
| **10. 站内消息** | ✅ 闭环 | `apps/supplier/src/lib/server/services/site-message-notifications.ts` 保留 `notifySupplier` + **四类业务通知**（`notifyOnboardingResult` 入驻 / `notifyRetireResult` 下架 / `notifyBillGenerated` 账单 / `notifyContractPending` 新合同）+ `notifyBatchParseError`。**实际发送方为 `apps/web`**：`supplier-review.ts:261,305`、`retire-batch-review.ts:58,121`、`supplier-bill-generation.ts:1552`（均经 `@workspace/shared-supplier/notifications`），新合同走 `contract.ts:421` → `contract-notifications.ts#sendContractToSupplier`（站内信 + 邮件）。`site-messages` router 负责查询展示。详见 `docs/design/audit/p0-p1-audit.md` §9 四类通知表 | — |
| **11. 结算确认** | ✅ **闭环（已闭合）** | ✅ 数据层：`supplier_bill.status`（pending / confirmed / paid / disputed）<br>~~⚠️ 未找到 tRPC mutation~~ → **已存在**：`billing.confirmMonthly`（`routers/billing.ts:41`）调用 `billing-confirm.ts` 的 `confirmMonthlyBill`，并已挂到 `billing-list-client.tsx:104` 与 `billing-monthly-detail-client.tsx:77` | — |

### 2.3 核心断点总结

#### P0 断点（阻塞商业闭环）

1. ~~**账单生成 Cron 未注册**~~ → **✅ 已闭合**
   - `apps/web/src/lib/server/jobs/register-supplier-billing-cron.ts` 已在 `init-cron-jobs.ts:49` 注册
   - 另有 HTTP 入口 `apps/web/src/app/api/internal/cron/supplier-billing/route.ts`
   - 开关：`isSupplierBillingEnabled()`（未开时跳过，不是「没实现」）

2. ~~**真实计量为 P0 简化版（70% 估算）**~~ → **✅ 已闭合**
   - `fetchUsageFromProbeSnapshots()` 读 `devicePlatformProbeSnapshot` 逐小时快照，`source ∈ {probe, order, none}`
   - 残留口径限制：待结算卡时 `tenantConsumption = null`、金额按 0 记账（设计内，见步骤 6）

#### P1 断点（影响体验，非阻塞）

1. ~~**设备上传 UI 未实现**~~ → **✅ 已闭合**
   - `apps/supplier/src/app/[locale]/console/devices/batches/new/page.tsx` + 列表 / 详情页均已存在

2. ~~**结算确认流程前端缺失**~~ → **✅ 已闭合**
   - `billing.confirmMonthly`（`routers/billing.ts:41`）+ 两处确认按钮 UI

3. **⏸ 挂起 — 自动化接入流水线（P2/P3）**
   - 「SSH 自动验证、GPU 对账、K8s Node 自动纳管」**仍未实现**
   - 不在本轮范围，不排期、不承诺；详见 `docs/design/onboarding-pipeline-p2.md`

### 2.4 已知技术债（来自文档）

根据 `../../apps/supplier/content/design/supplier-upload-strategy-p0.md`，以下债务按计划演进：

- ✅ **供应商身份解析修复**：已实现 `requireSupplierId`（P0 交付物）
- ✅ **日账单 schema + dataaccess**：已交付（P0 交付物）
- ✅ **下架请求 API**：已交付（P0 交付物）
- ✅ **真实 Dashboard KPI**：已交付（P0 交付物）
- ✅ **站内消息通知服务**：已交付（P0 交付物）
- ✅ **设备上传 UI**：已交付（`/console/devices/batches/new`）
- ✅ **清单解析前端集成**：已交付（`batch.parseFile` / `batch.commit`，行级 ok/warning/failed）

### 2.5 Supplier 闭环判断

**状态**：半闭环（55% 完整度）

**闭环部分**：
- 供应商身份解析完整
- 设备上传核心逻辑完整（解析+提交+批次管理）
- 日账单/月账单数据层齐全，账单服务函数实现完整
- 下架请求全流程闭环
- Dashboard KPI 真实数据查询
- 站内消息通知服务完整

**断点部分**（2026-10-05 复核：原列的 4 项**全部已闭合**）
- ~~账单生成 Cron 未注册~~ → 已注册（`register-supplier-billing-cron.ts`）
- ~~真实计量 70% 硬编码估算~~ → 已改为 probe/order 实测
- ~~设备上传 UI 未实现~~ → 页面已存在
- ~~结算确认流程前端缺失~~ → `billing.confirmMonthly` + UI 已接

**仍开放**：
- **⏸ 挂起** 自动化接入流水线（P2/P3，SSH / K8s 纳管）—— 不在本轮范围

**阻塞收款路径**（2026-10-05 复核：两条链路**均已解除**）
- ~~账单 Cron 断开 → 日/月账单不生成~~ → `register-supplier-billing-cron.ts` 已注册（受 `SUPPLIER_BILLING_ENABLED` 门控）
- ~~真实计量缺失 → 金额 ±30% 偏差~~ → `fetchUsageFromProbeSnapshots()` 已按 probe/order 实测计费

**剩余阻塞（⏸ 挂起，不在本轮范围）**：自动化接入流水线（P2/P3）未实现，设备仍需人工验证接入

---

## 3. 跨链路共性问题

### 3.1 品牌站 vs apps/api 分界模糊

**问题描述**：
- 文档 Q7=A 明确「仅任务走 `apps/api`；账单/镜像等品牌站可直连品牌站库」
- 文档 Q13=B 明确「品牌站库自洽（用户/租户/销售价/站内账单）；任务状态以 api 为准」
- 但 OEM 品牌站未创建，无法验证实际分界清晰度

**潜在风险**：
- 品牌站直连品牌站库查账单时，如何保证与平台侧 merchant 控制台的一致性？
- 品牌站缓存任务状态（来自 api 响应）时，如何处理同步延迟和最终一致性？

**建议**：
- 在品牌站创建时，明确数据主权边界：品牌站库为 **用户域** 权威，平台库为 **商户合同域** 权威
- 任务状态采用 **pull 模型**（品牌站主动调 api）而非 push，避免回调复杂度

### 3.2 ~~迁移文件缺失~~ → **已闭合**

~~`../design/audit/merchant-console-followups.md` L132-169 提到「由于环境未配置 `DATABASE_URL`，迁移文件未自动生成」~~

**实测（2026-10-05）**：迁移文件**已存在** —— `packages/db/drizzle/0015_add_merchant_rollup_fields.sql`
覆盖 `merchant_bill.platform_cost` / `merchant_bill.gross_profit` /
`merchant_bill_daily.platform_cost` / `merchant_bill_daily.gross_profit`
以及 `merchant_tenant_contribution` 建表 + 外键，与代码预期一致。

**仍有效的建议**：把 `db:generate` → `db:migrate` → `rollup backfill` 的顺序写进 CI/CD 与 README。

### 3.3 apps/api 鉴权机制待明确

**问题描述**：
- `tasks.ts` L305-308 有 TODO 标记「require merchantId in the update body or query」，鉴权逻辑未实现
- OEM 品牌站跨网络调用 `apps/api` 时，如何携带商户/租户身份凭证？

**技术选型待定**：
- **API Key 模式**：每个商户分配独立 API Key，存于 `merchant` 表，品牌站请求时携带 Header
- **JWT 模式**：品牌站用户登录后，生成包含 `merchantId` / `tenantId` 的 JWT，api 验证签名
- **Trusted Origins 模式**：平台在 CORS 白名单中添加商户自定义域名，api 从 referer 反查 merchantId

**建议**：
- 优先 JWT 模式（better-auth 已支持），统一身份体系
- 在 `apps/api/middleware.ts` 中实现 `requireMerchantAuth` 中间件，解析 JWT 并注入 `ctx.merchantId` / `ctx.tenantId`

### 3.4 成本计算链路依赖关系复杂

**Merchant platformCost 计算链路**：
```
tenant_consumption_daily_detail (事实表)
  → 匹配 merchant_purchase_price (进货价权威)
  → rollup 至 merchant_bill_daily.platform_cost
  → 聚合至 merchant_bill.platform_cost
```

**Supplier 收益计算链路**：
```
supplier_device (设备清单)
  → 估算/实际计量 rentedGpuCount
  → 匹配 supplier_pricing_record.unit_price_per_hour
  → rollup 至 supplier_bill_daily.total_amount
  → 聚合至 supplier_bill.total_amount
```

**风险**：
- 如果 `merchant_purchase_price` 或 `supplier_pricing_record` 缺失，成本/收益计为 0，日志仅 warn（不中断）
- 价格变更后，历史账单是否重算？（当前设计为不重算，以 `effectiveFrom` / `effectiveTo` 快照）

**建议**：
- 在 CRM 配置价格时，强制要求覆盖所有在线卡型（阻止保存不完整配置）
- 在 rollup 执行前，预检查价格完整性，缺失时发送告警通知而非静默失败

---

## 4. 推荐 P0 修复优先级

### 4.1 Merchant P0（按阻塞程度排序）

| 序号 | 断点 | 修复范围 | 预估复杂度 | 阻塞业务 |
|------|------|----------|------------|----------|
| 1 | **apps/api 任务服务层实现** | 对接 SkyPilot / K8s / 裸金属编排，实现 `task-service.ts` 的 5 个函数 | **高** — 需理解多种算力后端协议，设计统一抽象层 | OEM 品牌站任务链路完全断裂 |
| 2 | **推广归因落地** | `apps/gpus` 注册页解析 URL 参数，写入 `merchant_promo_attribution`，设置 `tenant.merchant_id` | **中** — 前端参数传递 + 后端表插入 | 推广链接无法归因，佣金无法计算 |
| 3 | **OEM 品牌站应用创建** | 独立仓库 fork `apps/gpus`，实现主题化、任务 tRPC→api、独立库连接 | **极高** — 涉及新应用搭建、部署架构、多租户路由 | OEM 模式完全无法交付 |
| 4 | **白牌 merchant 控制台域名多租户路由** | `apps/merchant/middleware.ts` 实现域名→merchantId 映射，注入 context | **中** — 域名查询 + session 注入 | 多 OEM 客户无法区分，控制台串站 |
| 5 | **定价未配置时 fallback 刊例价** | `pricing-data.ts` 查询逻辑 LEFT JOIN `platform_card_list_price`，COALESCE 返回 | **低** — SQL 改写 + 前端展示调整 | 商户未配置时终端用户看不到价格 |

**推荐立即启动**：**序号 1（任务服务层）** 和 **序号 2（推广归因）**，这两项分别阻塞 OEM 和推广两条核心路径。

> ⚠️ **以上为历史建议**；**以 §8.1 Gate 决策为准**（Gate-1 M-TASK、Gate-2 M-BRAND-APP 当前状态为「依赖决策 · 暂不启动」），本节结论不作为排期依据。

**序号 3（品牌站应用）** 复杂度极高，建议拆分为多阶段：
- 阶段 1：品牌站壳搭建（fork gpus，替换主题，连接独立库）
- 阶段 2：任务 tRPC→api 集成（依赖序号 1 完成）
- 阶段 3：登录/注册/充值主题化（商户自有通道集成）

### 4.2 Supplier P0（按阻塞程度排序）

| 序号 | 断点 | 修复范围 | 预估复杂度 | 阻塞业务 |
|------|------|----------|------------|----------|
| 1 | **账单生成 Cron 注册** | 新建 `register-supplier-billing-cron.ts`，每日 00:05 调用 `generateDailyBills`，每月 1 日调用 `generateMonthlyBills` | **低** — 参考 merchant rollup cron，复制模式 | 账单不生成，供应商看不到收益 |
| 2 | **真实计量实现** | 对接 `devicePlatformProbeSnapshot` 或 `bareMetalOrderDevice`，按实际运行时间计算 `rentedGpuCount` 和 `usageHours` | **高** — 需设计时序数据查询、快照聚合、按小时计费算法 | 收益不准确（±30% 偏差），结算争议 |
| 3 | **设备上传 UI** | 新建 `apps/web/src/app/[locale]/(protected)/supplier` 下批量导入页（**2026-10-06 Excel 导入链已下线，改为设备列表页维护**） | **中** — 前端页面 + 文件上传 + 解析结果展示 | 供应商无法自助上传（依赖 CRM 兜底） |
| 4 | **结算确认流程前端** | 新增 `billing` router 的 `confirmBill` mutation，前端月账单详情页加「确认账单」按钮 | **低** — tRPC mutation + 前端按钮 | 供应商无法自助确认，回款周期长 |
| 5 | **真实 SSH 自动接入（P2）** | 自动 SSH 验证、GPU 对账、K8s Node 纳管 | **极高** — 需对接多种硬件型号、SSH 密钥管理、自动化脚本 | 运维成本高，接入效率低 |

**推荐立即启动**：**序号 1（Cron 注册）** 和 **序号 2（真实计量）**，这两项直接阻塞供应商收益可见和结算准确性。

**序号 1 可快速交付**（1-2 天），立即解除账单不生成的断点。

**序号 2 需设计评审**，建议先实施「按 probe 快照计算」的简化版（读取最近 24 小时快照的平均 rentedGpuCount），后续再优化为「按订单时长精确计费」。

---

## 5. 代码证据索引

### 5.1 Merchant 关键文件

| 模块 | 路径 | 关键内容 |
|------|------|----------|
| Schema | `packages/db/src/merchant-schema.ts` | merchant / merchantPurchasePrice / merchantSalesPrice / merchantPromoLink / merchantBranding / merchantBillDaily / merchantTenantContribution 表定义（L39-983） |
| Pricing Router | `apps/merchant/src/lib/server/routers/pricing.ts` | `upsertSalesPrice` mutation 实现（L20-38） |
| Promo Router | `apps/merchant/src/lib/server/routers/promo.ts` | 推广链接 CRUD 完整（L12-73） |
| Rollup Cron | `apps/web/src/lib/server/jobs/register-merchant-rollup-cron.ts` | 每日 03:00 调用 `runMerchantDailyPipeline`（L30-38） |
| Rollup Service | `apps/web/src/lib/server/jobs/merchant-rollup/run-merchant-rollup.ts` | platformCost 真实计算（cardHours × purchasePrice 匹配）（L30-49） |
| Tasks API | `apps/api/src/routes/tasks.ts` | OpenAPI 5 个端点定义（POST/GET/PATCH/status）（L93-369） |
| Task Service Stub | `apps/api/src/lib/task-service.ts` | TODO 标记，返回空数组（L140 / L240） |

### 5.2 Supplier 关键文件

| 模块 | 路径 | 关键内容 |
|------|------|----------|
| Identity | `apps/supplier/src/lib/server/dataaccess/supplier-identity.ts` | `requireSupplierId` 从 organizationId 解析（L10-30） |
| Device Upload | `apps/supplier/src/lib/server/dataaccess/device-upload.ts` | 解析+提交+批次管理（L50-342） |
| Bill Generation | `apps/web/src/lib/server/dataaccess/supplier/supplier-bill-generation.ts` | `generateDailyBills` / `generateMonthlyBills` 实现（L206-463），70% 估算标注（L70-74 / L119） |
| Billing DataAccess | `apps/supplier/src/lib/server/dataaccess/billing.ts` | 日账单/月账单查询（L95-314） |
| Dashboard | `apps/supplier/src/lib/server/dataaccess/dashboard.ts` | 真实 KPI 查询（今日预估/本月累计/在线设备数） |
| Cron 缺失 | — | `grep cron.schedule apps/supplier/**/*.ts` 结果为空 |

---

## 6. 验收标准（Draft PR 交付物）

本 Draft PR 仅包含分析文档，不含功能实现。验收标准：

1. ✅ **文档完整性**：覆盖 merchant 和 supplier 两条链路的完整审计
2. ✅ **状态分类清晰**：每个步骤标注 ✅ 闭环 / ⚠️ 半闭环 / ❌ 断点
3. ✅ **证据可追溯**：所有断点判断引用具体文件路径和行号
4. ✅ **优先级明确**：P0/P1 分级，阻塞收款路径清晰
5. ✅ **推荐修复顺序**：Merchant P0 前 5 项、Supplier P0 前 5 项
6. ✅ **跨链路共性问题**：迁移文件、鉴权、成本链路依赖、品牌站分界

---

## 7. 后续行动建议

### 7.1 近期（本周）

1. **启动 Merchant P0-1（任务服务层）**：设计 `task-service.ts` 实现方案，对接 SkyPilot
2. **启动 Merchant P0-2（推广归因）**：在 `apps/gpus/signup` 页面添加参数解析
3. **启动 Supplier P0-1（Cron 注册）**：复制 merchant rollup cron 模式，注册供应商账单 cron

### 7.2 中期（本月）

1. **Merchant P0-3（品牌站应用）**：立项 OEM 品牌站独立仓库，完成壳搭建
2. **Supplier P0-2（真实计量）**：设计评审，选择 probe 快照或订单时长方案
3. **补充迁移文件**：运行 `db:generate` 生成缺失的 SQL 迁移

### 7.3 长期（季度）

1. **Merchant P1 全面完成**：定价 fallback、品牌化驱动、自有通道集成
2. **Supplier P1 全面完成**：设备上传 UI、结算确认前端
3. **跨链路优化**：鉴权机制统一、成本链路监控、API 文档自动生成

---

## 8. Merchant 业务闭环待办（聚焦模式 A）

> **范围决策**：本阶段优先完成 **模式 A（推广链接）** 闭环，模式 B（OEM 品牌站）暂缓。  
> **Supplier 链路**：本阶段范围外，待后续专项启动。

### 8.1 待确认决策（C1–C3）

在开始实施前，需确认以下技术选型：

| 编号 | 决策点 | 选项 | 建议 | 说明 |
|------|--------|------|------|------|
| **C1** | 本期范围 | A. 仅闭环模式 A 推广<br>B. 模式 B 壳（品牌站 fork，无真任务）<br>C. 模式 B 全量（含真任务编排） | **A** | 此前决策「品牌站 fork 暂不动」；模式 A 路径更短，可快速验证价差结算 |
| **C2** | apps/api task-service 实现深度 | A. 对接仓库已有编排做成可调用<br>B. 合约完整 + 明确错误，真编排另立项<br>C. 完整多后端（SkyPilot/K8s/裸金属统一抽象） | **B** | 模式 A 不依赖任务 API；合约完整性可为后续 OEM 铺路，但真编排工作量极大，建议独立项目 |
| **C3** | api 鉴权机制 | A. JWT（better-auth 统一身份）<br>B. API Key（每商户独立 key）<br>C. 随 C1=A 暂缓 | **C** | 模式 A 不调用 api，鉴权可延后；若 C1 改为 B/C，优先 A（JWT） |

**确认流程**：
1. 用户在本 PR 或 issue 中回复确认选项（如「C1=A, C2=B, C3=C」）
2. 确认后更新本文档，移除「待确认」标记
3. 按确认结果调整下方优先级清单

---

### 8.2 确认后优先级（假设 C1=A，模式 A 路径）

#### P0（阻塞模式 A 闭环）

| 任务编号 | 任务名 | 范围 | 复杂度 | 依赖 | 验收标准 |
|---------|--------|------|--------|------|----------|
| **P0-1** | **M-ATTR** | apps/gpus 推广参数归因 + tenant.merchant_id | 中 | 无 | 1. `/signup` 页面解析 URL `?m={merchantCode}&r={promoCode}`<br>2. 注册成功时写入 `merchant_promo_attribution` 表（eventType='signup'）<br>3. 创建租户时设置 `tenant.merchant_id` = 推广商户<br>4. 点击推广链接 → 注册 → 商户控制台看到归因事件 |
| **P0-2** | **M-DOMAIN** | apps/merchant customDomain→merchantId 中间件 | 中 | 无 | 1. `apps/merchant/middleware.ts` 查询 `merchant_branding.customDomain`<br>2. 根据请求域名解析 `merchantId`，注入 session/context<br>3. 多商户可通过各自域名访问白牌控制台，数据隔离正确 |
| **P0-3** | **M-PRICE-FB** | 销售价缺省 fallback 刊例价 | 低 | 无 | 1. `pricing-data.ts` 查询 LEFT JOIN `platform_card_list_price`<br>2. 返回 `COALESCE(salesPrice, platformListPrice)`<br>3. 前端展示：已配置显示销售价，未配置显示刊例价（标注"默认刊例价"） |
| **P0-4** | **M-SETTLE** | 月结算确认状态机 | 低 | P0-5（migration）| 1. `merchant_bill.status` 字段新增或使用现有 `source` 扩展<br>2. tRPC mutation `settlement.confirmMonthlyBill`<br>3. 前端月账单详情页「确认账单」按钮<br>4. 确认后状态 pending→confirmed，不可逆 |
| **P0-5** | **M-MIG** | rollup 相关 migration + backfill 文档 | 低 | 无 | 1. 运行 `pnpm --filter @workspace/db run db:generate`<br>2. 生成 `merchant_bill_daily.platform_cost` / `merchant_tenant_contribution` 等字段迁移<br>3. 在 README 或 AGENTS.md 补充迁移顺序文档<br>4. 提供 backfill 脚本示例（调用 `backfillMerchantDaily`） |

#### P1（体验优化，非阻塞）

| 任务编号 | 任务名 | 范围 | 复杂度 | 说明 |
|---------|--------|------|--------|------|
| **P1-1** | **M-OEM-SRC** | 租户来源区分推广/OEM/直销 | 低 | `tenant-data.ts` 查询逻辑已 JOIN `merchant_promo_attribution`，需补充 `merchant.access_mode` 判断 OEM |
| **P1-2** | **M-CONTRIB-COST** | 租户贡献汇总补充成本字段 | 中 | `merchant_tenant_contribution.total_cost` 当前为 0，需按租户聚合消费×进货价 |
| **P1-3** | **M-BRAND-DRIVE** | 品牌化配置驱动 ThemeProvider | 中 | `apps/merchant/layout` 查询 `merchant_branding`，注入 CSS 变量或 ThemeProvider props |

#### Gate（依赖决策，暂不启动）

| 任务编号 | 任务名 | 前置条件 | 说明 |
|---------|--------|----------|------|
| **Gate-1** | **M-TASK** | C2 确认 | apps/api task-service 实现（对接编排或合约完整化） |
| **Gate-2** | **M-BRAND-APP** | C1=B/C | OEM 品牌站应用创建（独立仓库 fork gpus） |
| **Gate-3** | **M-API-AUTH** | C3=A/B | api 鉴权机制实现（JWT 或 API Key） |

#### P2（长期优化）

| 任务编号 | 任务名 | 说明 |
|---------|--------|------|
| **P2-1** | **M-CHANNELS** | 商户自有支付/短信/邮箱通道集成（Q10=B） |
| **P2-2** | **M-MODEL-PRICING** | 模型/推理 token 定价（设计文档已列 P1） |

---

### 8.3 模式 A 验收标准

完成 P0 全部任务后，模式 A（推广链接）闭环应满足：

1. **推广注册可归因**
   - 商户在控制台创建推广链接，获得短链 `https://gpus.example/signup?m=ABC&r=XYZ`
   - 用户点击链接注册成功后，`merchant_promo_attribution` 表有记录
   - `tenant.merchant_id` 正确指向推广商户
   - 商户控制台「推广链接」页面看到注册数/充值数统计

2. **Rollup 有价差**
   - 账单 rollup cron 每日自动运行（已实现）
   - `merchant_bill_daily.platform_cost` 正确计算（cardHours × purchasePrice）
   - `merchant_bill_daily.gross_profit` = totalAmount - platformCost
   - 月账单聚合日账单，数据一致

3. **控制台核心功能可用**
   - **客户（租户）**：显示推广归因来源、累计收入（读 `merchant_tenant_contribution` 表）
   - **定价**：显示三价对比（进货价/销售价/刊例价），未配置销售价时 fallback 刊例价
   - **结算**：月账单可确认（pending→confirmed），日账单/月账单明细展示

4. **域名可解析**
   - 商户配置 `merchant_branding.customDomain`（如 `merchant-a.example.com`）
   - 访问该域名时，中间件正确解析 `merchantId` 并隔离数据
   - 不同商户通过各自域名访问白牌控制台，互不串站

5. **Migration 可应用**
   - 开发/生产环境执行 `db:generate` + `db:migrate` 无报错
   - 历史数据可通过 backfill 脚本补齐（`merchant_bill_daily` 回填近 90 天）
   - Rollup cron 运行时无字段缺失错误

---

### 8.4 实施建议

#### 8.4.1 并行路径

**快速交付组**（1-3 天 each）：
- P0-3（M-PRICE-FB）：SQL 改写 + 前端展示调整
- P0-4（M-SETTLE）：状态机 + mutation + 前端按钮
- P0-5（M-MIG）：生成迁移 + 文档补充

**核心闭环组**（5-7 天 each）：
- P0-1（M-ATTR）：gpus 注册页改造 + tRPC 写归因
- P0-2（M-DOMAIN）：中间件域名解析 + session 注入

**推荐顺序**：
1. 先完成 P0-5（M-MIG），确保数据库 schema 就绪
2. 并行启动 P0-3 + P0-4（快速交付组）和 P0-1（核心）
3. P0-2 可与 P0-1 并行，但建议在 P0-1 完成后验证，避免多商户测试复杂度

#### 8.4.2 风险与依赖

| 风险点 | 影响 | 缓解措施 |
|--------|------|----------|
| **M-ATTR 归因窗口未定义** | 首次归因优先 vs 覆盖规则不明确 | 建议首期采用「首次归因优先，永久绑定」；防刷策略（IP/设备）二期实施 |
| **M-DOMAIN 域名解析失败回退** | 自定义域名配置错误时无法访问 | 中间件 fallback 到默认 merchant（`isDefault=true`），记录 warn 日志 |
| **M-SETTLE 确认权限控制** | 普通商户账号误点确认 | `confirmMonthlyBill` mutation 需检查 `ctx.organization.role`（仅 owner/finance 可确认） |
| **M-MIG 生产回填数据量大** | 90 天 × N 商户 × M 租户回填可能超时 | 提供批量回填脚本，按月分批执行；Rollup cron 之后新数据自动生成 |

#### 8.4.3 测试策略

**单元测试**：
- M-ATTR：归因逻辑、tenant.merchant_id 赋值、首次归因优先规则
- M-PRICE-FB：COALESCE 查询返回、刊例价 fallback 正确性
- M-SETTLE：状态机迁移（pending→confirmed）、不可逆校验

**集成测试**：
- M-DOMAIN：多商户域名隔离、session merchantId 正确注入
- M-MIG：迁移 up/down、backfill 脚本幂等性

**端到端测试**（手动/自动化）：
- 完整推广链路：创建链接 → 点击注册 → 查看归因 → rollup 运行 → 查看账单价差
- 多商户隔离：商户 A 域名访问控制台 → 仅看到自己租户 → 商户 B 域名独立验证

---

### 8.5 后续阶段（模式 B 铺垫）

若 C1 决策改为 B/C（启动模式 B），需补充以下任务：

| 任务 | 依赖 | 说明 |
|------|------|------|
| **M-BRAND-REPO** | C1=B/C | 创建品牌站独立仓库，fork `apps/gpus`，配置独立 DB 连接 |
| **M-BRAND-THEME** | M-BRAND-REPO | 登录/注册/充值页主题化，读取 `merchant_branding` 驱动 Logo/色值 |
| **M-BRAND-TASK-STUB** | M-BRAND-REPO + M-TASK（Gate-1） | 品牌站 tRPC→api 任务调用（依赖 task-service 合约） |
| **M-SYNC-PRICING** | M-BRAND-REPO | 进货价同步副本到品牌站库（Q15=B），销售价写品牌站库 |

---

## 9. Supplier 链路状态（本阶段范围外）

Supplier/IDC 链路的断点分析见前文 §2，核心 P0 为：
- 账单 Cron 未注册（服务函数存在，调度缺失）
- 真实计量为简化版（70% 估算，±30% 偏差）

**本阶段不实施 Supplier 修复**。待 Merchant 模式 A 闭环验收通过后，再启动 Supplier 专项。

---

**文档结束**

_本文档为 READ-ONLY 分析 + 待办清单，不含实现补丁。确认决策（C1–C3）后，按优先级分别立项实施任务。_
