# 文档矛盾台账（第二阶段梳理 · 2026-10-06）

> 对 5 个高风险重复主题的逐条裁决。**裁决基准**：`docs/design/merchant-open-items-design.md`（2026-10-05 定稿）+ 实际代码与 `packages/db/src/*-schema.ts`。
>
> 矛盾出处格式：`文件 §章节`。处置标签取值：`权威` / `已取代→目标` / `子文档→权威` / `过期待重写`。

---

## 1. 计费体系

**结论**：存在 4 个真值源 —— 租户账单 = 上游 OpenAPI 镜像（已实施）、商户毛利 = rollup 实算（已实施）、余额 = `tenant_balance`（已采纳）、OpenMeter = **未采纳候选**。

### 1.1 矛盾清单

| # | 矛盾点 | 出处 A | 出处 B | 裁决 |
| --- | --- | --- | --- | --- |
| 1 | 毛利公式 | `merchant-billing-system-design §毛利`、`openmeter-billing-design`：`收入−支出−券−折扣` | `merchant-open-items-design §最终资金口径:487/499`：`prepay=收入−进货−券`；`commission=收入×分成−券消费` | **B**（10-05 定稿，`run-merchant-rollup.ts:318-322` 逐字实现） |
| 2 | 折扣成本是否入毛利 | `merchant-billing §91/§437` 计入 | `merchant-open-items Q8:470/488` 不入，仅展示 | **B**（schema `merchant_bill.discount_amount` 注释「不进 grossProfit」） |
| 3 | 券成本取数源 | `merchant-billing §403` 取 `coupon_usage`（**表不存在**）；`tenant-billing §575` 取 `Σtenant_bill.coupon_amount` | `merchant-open-items:471` 取 `Σmerchant_account_ledger WHERE ref_type='voucher_redeem'` | **B**（rollup:230-240 即此源） |
| 4 | 分成方向自相矛盾 | `merchant-billing §168`「70=商户得70%」vs 同文 `§377/§386`「支出=收入×70%」 | `merchant-open-items:497` `成本=收入×(1−分成)` | **B**（`run-merchant-rollup.ts:151` 为 `revenue*(1-rate)`） |
| 5 | `commission_rate` 单位 | `merchant-billing §168/§195` 百分数 0–100 | schema `merchant-schema.ts:699` + `merchant-pricing.ts:392` 校验 `0<x<=1` | **schema** |
| 6 | 非卡时成本兜底 | `merchant-billing §105` 用 `收入×(1−平台毛利率)` 跨域倒推 | `merchant-open-items Q11/D5-3:448` 必须查 `merchant_product_purchase_price` | **B**（明令禁止倒推） |
| 7 | 余额真值 | `tenant-balance-unification:5/11`：`tenant_balance` 唯一，废止 `tenant.balance` | `tenant-balance-snapshot-design:21/207`：`tenant.balance` 为真值 | **unification**，但 schema 两真值并存（`crm-schema.ts:123` vs `gpus-consumer-schema.ts:151`）**未收口 → 见 §6** |
| 8 | `balance_transaction` 字段集 | `unification §5:128-154` 无 voucher 快照与幂等键；`recharge §3.6` 仅 `balance_before/after` | schema `gpus-consumer-schema.ts:179-229` 实有 8 快照列 + 4 voucher 列 + `idempotency_key` | **schema**（两份 DDL 均过时） |
| 9 | `payment_order.scene` 枚举 | `recharge §173` 仅 `recharge`/`bare_metal_order` | `packages/billing/src/types.ts:19-27` 实有 5 个（含 `merchant_prepay`、`voucher_purchase`） | **代码** |
| 10 | 券/折扣来源判定字段 | `tenant-billing §319/§585`、`merchant-billing §403-422`、`openmeter §1159` 依赖 `coupon.source`、`discount_template.source`、`gpu_coupon.merchant_id` | 三列在 schema **均不存在** | 改由 ledger `ref_type` + `merchant_sales_price`（open-items Q9/D5-2） |
| 11 | OpenMeter 是否已采纳 | `openmeter-billing-design §5`：事件驱动 L1 实时计费 + 20 张新表 | `tenant-billing §76-84`：上游 OpenAPI 镜像「不做二次计算」，import v1.4 / daily-sync v1.3 **已实施**；`tenant_bill_line_item` 等全缺 | **tenant-billing**；OpenMeter 属未采纳候选 |
| 12 | prepay/commission 分流 | 仅 `merchant-open-items:477-511` 定义（+ schema `merchant.funding_mode` check） | `merchant-billing` / `openmeter` / `tenant-billing` **全篇无 funding_mode** | **open-items**；三份账单设计需补分流说明 |

### 1.2 处置

| 文档 | 标签 |
| --- | --- |
| [merchant-open-items-design.md](../merchant-open-items-design.md) | `权威`（资金/毛利终版，与代码一致） |
| [cloud/tenant-billing-system-design.md](../cloud/tenant-billing-system-design.md) | `权威`（镜像读路径唯一且已实施）· §9.2-9.3 归因两段须改指 open-items |
| [cloud/tenant-balance-unification.md](../cloud/tenant-balance-unification.md) | `权威`（`cloud/INDEX.md §1.1` 语义权威） |
| [cloud/recharge-flow-and-database-design.md](../cloud/recharge-flow-and-database-design.md) | `权威` · §8.1 事务与 `scene` 枚举须按实现改写 |
| [cloud/merchant-billing-system-design.md](../cloud/merchant-billing-system-design.md) | `已取代→merchant-open-items-design.md` |
| [cloud/openmeter-billing-design.md](../cloud/openmeter-billing-design.md) | `过期待重写`（须标「候选·未采纳」，仅 L2 §5.4 与存储计费段可复用） |
| [tenant-balance-snapshot-design.md](../../../apps/web/content/design/tenant-balance-snapshot-design.md) | `权威` · §G4/§3.6 真值口径改为「派生自上游，不作余额真值」 |
| [docs/business/cost.md](../../business/cost.md) | `权威`（提成域唯一口径，与商户毛利分属不同主体，禁止互相反向引用） |

---

## 2. 设备生命周期

### 2.1 矛盾清单

| # | 矛盾点 | 出处 A | 出处 B | 裁决 |
| --- | --- | --- | --- | --- |
| 1 | 计划 commit 是否改设备状态 | `supplier-device-retire-design §6.4/§10.2`：commit 置已下线+已退订 | `datacenter-device-retire-design §4.2/§12.1`：永不改设备，变更表驱动 | **B**（代码仅 INSERT 批次） |
| 2 | Legacy 下架入口存废 | `datacenter-device-retire §10.1/§11.1/§12.1-4`：入口保留 | `datacenter-device-retire §9 G11` + retire 头部：07-08 已删 | **后者**（router 仅 datacenter 三接口） |
| 3 | 批次状态机 | `supplier-device-retire §10.1` `import_status` 7 态 | `datacenter-device-retire §2.5` `batch_status` 4 态 | **B**（代码写「待开始」） |
| 4 | 清单列与校验 | `supplier-device-retire §4.1/§5.2`：4 列、error 跳过部分成功 | `datacenter-device-retire §5.1-5.2`：卡型+合作类型必填、error 阻断 | **B** |
| 5 | 已退订生命周期取值 | `supplier-device-retire`：`已下线` | `supplier-device-ops-pool-masterdata §7.2`：`下线中`；字典 payload：`退订` | 字典 / ops-pool；`已下线` **不存在** |
| 6 | 待接入 KPI 口径 | `supplier-device-ops-pool-masterdata §7.1`：仅实体、已确认 | `supplier-overview-scenarios-from-zero §2.1.1`：实体+计划缺口 | **overview**（`mergeKpiMetric` 已合并 pipeline） |
| 7 | 变更表是否改设备 | `supplier-overview-scenarios-from-zero §5.2 R3a/b` 列出 lifecycle/ops 变化 | `supplier-device-ops-pool-masterdata D2` + `commitChangelog` 不 UPDATE | **D2**；overview 该表过期 |
| 8 | probe CM-7 状态 | `supplier-device-platform-probe` 头部：已实施 | 同文 `§12.1/§16`：待确认 | **已实施**（schema 有 `presence_*`、orphan UK） |

### 2.2 处置

| 文档 | 标签 |
| --- | --- |
| [datacenter-device-retire-design.md](../../../apps/web/content/design/datacenter-device-retire-design.md) | `权威` |
| [supplier-device-ops-pool-masterdata-design.md](../../../apps/web/content/design/supplier-device-ops-pool-masterdata-design.md) | `权威` · `§3`「12 条字典」实为 11 条，需订正 |
| [supplier-device-platform-probe-design.md](../../../apps/web/content/design/supplier-device-platform-probe-design.md) | `权威` · 需改头部状态行 |
| [supplier-device-retire-design.md](../../../apps/web/content/design/supplier-device-retire-design.md) | `已取代→datacenter-device-retire-design.md` |
| [device-platform-orphan-import-rules-design.md](../../../apps/web/content/design/device-platform-orphan-import-rules-design.md) | `子文档→supplier-device-platform-probe-design.md` |
| [supplier-overview-scenarios-from-zero.md](../../../apps/web/content/design/supplier-overview-scenarios-from-zero.md) | `过期待重写`（自称 v1.1 正文写 v1.2，§5.2/§2.1.1 已失真） |

---

## 3. 飞书集成

三份文档为「总设计 / 入站细则 / 出站字段」分层，**边界基本清晰**，冲突集中在 3 条：

| # | 矛盾点 | 出处 A | 出处 B | 裁决 |
| --- | --- | --- | --- | --- |
| 1 | 入站通道默认值 | `feishu-integration-design §5.11.2/§12-F13`：事件订阅优先 | `feishu-bitable-automation-inbound §2.2 ADR-BA6`：默认 `bitable_automation`（其 §10.1 又写 event_subscription） | **bitable_automation**（schema 默认 + 路由已建），inbound §10.1 需自订正 |
| 2 | 工单分类默认值 | `feishu-integration-design §5.11.1`：技术支持 | `feishu-work-order-module-category §2.2/§6`：集群机器上下架 | **module**（`DEFAULT_FEISHU_WORK_ORDER_CATEGORY`） |
| 3 | 已删组件残留 | `feishu-bitable-automation-inbound §1.3/§14` 引用 `feishu_bitable_sync_config`、`feishu-bitable-sync-panel` | `feishu-integration-design §4.3/§7`（07-22 已删） | **integration** |
| 4 | §14 废弃描述有误 | `feishu-integration-design §14` 称 `device_inventory`/`device_changelog` Excel 导入已废弃 | （07-22 时点）代码 `commitInventory/commitChangelog` 仍在 | **已闭环（2026-10-06）**：当日稍后整条 Excel 链亦下线，§14 描述的设备批量导入入口**现网已不存在**；文档已二次订正 |

### 处置

| 文档 | 标签 |
| --- | --- |
| [feishu-integration-design.md](../../../apps/web/content/design/feishu-integration-design.md) | `权威` · §5.11.2、§12-F13、§14 需勘误 |
| [feishu-bitable-automation-inbound-design.md](../../../apps/web/content/design/feishu-bitable-automation-inbound-design.md) | `子文档→feishu-integration-design.md`（以 ADR-BA6 反向勘误父文档） |
| [feishu-work-order-module-category-design.md](../../../apps/web/content/design/feishu-work-order-module-category-design.md) | `子文档→feishu-integration-design.md` |

---

## 4. 月度成本

> **已处置（2026-10-06）**：账期提成派生链路整体下线 —— 旧成本页残留（`listProjectCostMetadata`、`purgeCostDerived`、`cost-pricing-resolve`、`baremetal-card-hours`）与 **7 张派生表**（`platform_cost_monthly`、`billing_period_cost_source_line`、`billing_period_cost_pricing_snapshot`、`income_adjustment_history`、`voucher_card_hours_adjustment_history`、6×`platform_cost_commission_derive_*` 中的 6 张）已删除，迁移 `0039_jazzy_blue_blade.sql` 已在 `cloud` 库执行（19 表 + 3 列）。**§4.1 第 4 条「月序 vs 客群」口径已按 ② 落地**：实现维度为 `商机来源 × 客群(新客/老客) × 角色`（`MONTHLY_COST_SALES_RATES`），`COMMISSION_POLICY_RATES` 与 `project.commission_month_phase` / `commission_phase_locked_at` 列删除，`docs/business/cost.md` 已加口径标注待业务确认重写。下表与 §4.2 保留为历史裁决记录。

### 4.1 矛盾清单

| # | 矛盾点 | 出处 A | 出处 B | 裁决 |
| --- | --- | --- | --- | --- |
| 1 | 成本真源三套并存 | `cost-compute-v3-redesign-with-examples §0.2`：`platform_cost_monthly` 是最终输出 | `monthly-cost-confirm-and-legacy-cost-removal-plan §1 G1`：`monthly_cost_*` 为唯一真源；`project-monthly-cost-snapshot §1.2` 仍称 `platform_cost_monthly` 为财务权威 | **①+②**（07-08 更新，代码仅 `confirm.ts`/`run.ts` 写月度成本，`finance/[id]/cost` 路由已删） |
| 2 | 旧成本页是否已删 | `platform-cost-commission-phase-derive` 标「已实施」、`finance-cost-regenerate §入口` 列 3 个入口 | 上述文件 `cost-regenerate-dialog`、`commission-derive-regenerate-dialog`、`regenerateCost`、`listCostSourceLines`、`commissionDerive` **均已不存在** | `monthly-cost-confirm §7`（Phase3 已做，Phase4/5 未做） |
| 3 | 提成分段口径 | `platform-cost-commission-phase-derive §1.1`：成交后 1–6 月 vs 第 7 月起（`COMMISSION_POLICY_RATES` 零引用） | `monthly-cost-from-gpu-consumption §8.3`：同数值改按新客/老客（`MONTHLY_COST_*_RATES` 实际生效） | **②更可信，但属业务语义变更 → 见 §6 待确认** |
| 4 | 项目快照写入方 | `project-monthly-cost-snapshot §1 G1/G3`：由项目成本弹窗保存 | `monthly-cost-confirm §9 Q5=B/§2.5`：迁移或下线；`monthly-cost-from-gpu §1.2`：确认固化时写入 | **②/①**（`monthly-cost/confirm.ts:198` 证实），③写入路径已失效 |
| 5 | 月报毛利口径 | `reports/operational-monthly-report-p0-metrics §3.1` 权威=路径1 `platform_cost_monthly`+`source_line` | 代码 `monthly-report.ts:188,308` 实用 `billing_period.total_gross_profit` + `project_monthly_cost_snapshot` | **①+代码**，月报口径过期 |

### 4.2 处置

| 文档 | 标签 |
| --- | --- |
| [monthly-cost-confirm-and-legacy-cost-removal-plan.md](../../../apps/web/content/design/monthly-cost-confirm-and-legacy-cost-removal-plan.md) | `权威`（Phase1–3 已实施，Phase4–6 未做） |
| [monthly-cost-from-gpu-consumption-design.md](../../../apps/web/content/design/monthly-cost-from-gpu-consumption-design.md) | `权威`（新真源，P1–P5 已实现） |
| [finance-single-period-income-design.md](../../../apps/web/content/design/finance-single-period-income-design.md) | `权威`（收入口径与 `cost-compute-v3 §0.1` 一致） |
| [cost-compute-v3-redesign-with-examples.md](../../../apps/web/content/design/cost-compute-v3-redesign-with-examples.md) | `已取代→monthly-cost-confirm-and-legacy-cost-removal-plan.md`（保留 §0 Raw 约定） |
| [platform-cost-commission-phase-derive-design.md](../../../apps/web/content/design/platform-cost-commission-phase-derive-design.md) | `已取代→monthly-cost-from-gpu-consumption-design.md` |
| [project-monthly-cost-snapshot-design.md](../../../apps/web/content/design/project-monthly-cost-snapshot-design.md) | `过期待重写`（入口与写入方全变，仅保留 CRM 展示语义） |
| [finance-cost-regenerate-baremetal-source-design.md](../../../apps/web/content/design/finance-cost-regenerate-baremetal-source-design.md) | `过期待重写`（入口清单 3 项中 2 项已删） |

---

## 5. 大盘报表

> **已处置（2026-10-06）**：大盘报表（`/dashboard`、`/dashboard/global`）及其后端、DB 表已**整体下线**。本节 16 份设计与实施计划全部移入 [`archive/`](../archive/) 并标 `已废止`；§5.1 矛盾清单与 §5.2 状态表仅作历史记录，不再有裁决意义。保留的报表文档仅余 `reports/operational-monthly-report-*.md`（月报）。

**边界澄清**（历史）：`content/design/global-dashboard-*`（全局大盘，设备/批次主数据口径）与 `content/design/reports/operational-dashboard-*`（运营大盘 `/dashboard`，`tenant_bill` 消费/充值口径）**不是同一批需求**，仅命名撞车；`reports` cluster 篇反向依赖 Period 供应侧卡时，需标注边界。

### 5.1 矛盾清单

| # | 矛盾点 | 出处 A | 出处 B | 裁决 |
| --- | --- | --- | --- | --- |
| 1 | KPI 项数与键名 | `global-dashboard-kpi-caliber-spec §4/§7`：9 项含 `gpu_target`、变更记录「全 9 KPI」 | `global-dashboard-period-analytics §6.1` 与 `global-dashboard-implementation-plan §3.1`：8 项；且 implementation-plan 写 `device_pending_shelving`（代码仅 `device_pending_access`） | **kpi-caliber-spec + schema**（`gpu_target` 已并入 `gpu_total.targetGpuCount`，spec §8.1 自认；键名以 `dashboard-schema.ts DASHBOARD_KPI_METRIC_KEYS` 8 项为准） |
| 2 | 实现状态互相打架 | `period-analytics §1.2`（07-08）：DWS 未灌数、主数据 ETL 待建 | `m2-masterdata-etl`：M2 代码已落地（`init-cron-jobs.ts:47` 已注册）；`period-composition-card-hours` 头部称 M1–M6 落地但正文 `§5/§174` 称 `progress_event` 待建 | **m2 + 代码**；`period-analytics §1.2`、`card-hours` 头部需改 |
| 3 | `onboarding_batch_progress_event` 是否已建 | `period-composition-card-hours-design §5/§174`：待建、Schema 未落库 | `packages/db/src/supply-schema.ts:730` 已建并有 `appendBatchProgressEvent` | **schema**（文档过期） |
| 4 | 月报 KPI 引用的字段 | `reports/operational-monthly-report-metrics:79` 引用 `project_monthly_cost_snapshot.revenue_department` | 该列不存在，实际在 `crm_project.revenue_department` | **schema** |
| 5 | 远景方案是否实施 | `global-dashboard-period-composition-m7-dws-acceleration` | 同主题文档标「M7 不实施」 | 归档远景，`过期待重写` |

### 5.2 处置

| 文档 | 标签 |
| --- | --- |
| [global-dashboard-kpi-caliber-spec.md](../archive/global-dashboard-kpi-caliber-spec.md) | `权威`（KPI 口径唯一） |
| [global-dashboard-period-composition-card-hours-design.md](../archive/global-dashboard-period-composition-card-hours-design.md) | `权威` · 头部 v1.6/M1–M6 状态需改 |
| [global-dashboard-resource-composition-chart-design.md](../archive/global-dashboard-resource-composition-chart-design.md) | `权威`（互斥分桶，已实施） |
| [reports/operational-dashboard-implementation-plan.md](../archive/operational-dashboard-implementation-plan.md) | `权威`（运营大盘总纲，口径与全局大盘不同） |
| [reports/operational-monthly-report-metrics.md](../../../apps/web/content/design/reports/operational-monthly-report-metrics.md) | `权威` · §3.1 毛利路径与 `revenue_department` 引用需订正 |
| [global-dashboard-implementation-plan.md](../archive/global-dashboard-implementation-plan.md) | `子文档→global-dashboard-kpi-caliber-spec.md` |
| [global-dashboard-period-analytics.md](../archive/global-dashboard-period-analytics.md) | `子文档→global-dashboard-period-composition-card-hours-design.md`（§1.2 状态需校正） |
| m1-progress-event / m2-masterdata-etl | `子文档→global-dashboard-period-composition-card-hours-design.md` |
| [global-dashboard-period-composition-m7-dws-acceleration.md](../archive/global-dashboard-period-composition-m7-dws-acceleration.md) | `过期待重写`（归档远景，本期不实施） |
| reports/ 其余 8 份 implementation-plan | `子文档→reports/operational-dashboard-implementation-plan.md` |

---

## 6. 待人工确认 / 待修复

| # | 事项 | 类型 | 建议处理 |
| --- | --- | --- | --- |
| 1 | 提成分段口径：「月序（1–6 月 vs 第 7 月起）」vs「客群（新客/老客）」 | **业务语义变更** | 需业务书面确认后，由 `monthly-cost-from-gpu-consumption-design §8.3` 单方面定稿 |
| 2 | 余额双真值并存：`tenant_balance` vs `tenant.balance`（schema 层） | **代码/schema 缺口**（文档侧已补） | 文档侧 ✅ 2026-10-06 已在 unification 加「两列职责声明」；schema 收口仍需代码改动 |
| 3 | `payment_order.scene` 5 值 vs 文档 2 值 | ~~文档过期~~ **已回填** | ✅ 2026-10-06 已回填 recharge 文档头部勘误、DDL 注释与 zod 枚举（5 值 = recharge/bare_metal_order/serverless/merchant_prepay/voucher_purchase） |
| 4 | `balance_transaction` 缺 voucher 快照与幂等键的描述 | ~~文档过期~~ **已回填** | ✅ 2026-10-06 已回填 unification 文首勘误 + §5 订正（21 列，缺 5 列） |
| 5 | OpenMeter 文档需加「候选·未采纳」状态行 | ~~文档状态~~ **已完成** | ✅ 2026-10-05 头部已标 `候选·未采纳` |
| 6 | `supplier-device-platform-probe` CM-7 状态、`period-analytics §1.2`、`card-hours` 头部状态 | ~~文档状态~~ **已完成** | ✅ 2026-10-06 三处状态行均按实际实现订正 |

---

## 7. 处置标签汇总

| 标签 | 数量 | 文档 |
| --- | --- | --- |
| `已取代→<目标>` | 7 | merchant-billing-system-design、supplier-device-retire-design、cost-compute-v3、platform-cost-commission-phase-derive、（reports 月报口径段）… |
| `过期待重写` | 7 | openmeter-billing-design、supplier-overview-scenarios-from-zero、project-monthly-cost-snapshot、finance-cost-regenerate-baremetal-source、global-dashboard-period-composition-m7、… |
| `子文档→<权威>` | 17 | feishu 入站/工单、orphan-import-rules、global-dashboard 系列、reports 系列 8 份 |
| `权威` | 22 | 见各节处置表 |

> 后续：本表中的 `已取代` 文档头部均已加标注（见其文件首部），完整状态列见 [`docs/design/INDEX.md`](../INDEX.md)。
