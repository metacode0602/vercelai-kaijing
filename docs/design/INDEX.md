# 设计文档索引

> 全仓设计文档（design）清单。**跨模块设计在本目录，模块内设计就地存放在 `<app>/content/design/`。**
>
> 状态列取值：`生效` / `已取代→<目标>` / `过期·待重写` / `候选·未采纳` / `规划`。
> 裁决依据见 [audit/doc-contradictions.md](audit/doc-contradictions.md)（5 大重复主题逐条裁决）与 [audit/doc-health-scan.md](audit/doc-health-scan.md)（机器扫描）。

## 0. Waverless 跨模块集（`docs/` 根目录，2026-10-17）

外采任务型 Serverless。权威分层见 [waverless-product-decisions-2026-10-17.md](../waverless-product-decisions-2026-10-17.md)。

| 文档 | 状态 | 定位 |
| --- | --- | --- |
| [waverless-product-decisions-2026-10-17.md](../waverless-product-decisions-2026-10-17.md) | **生效（一期范围权威）** | 拍板 #1–#11 |
| [waverless-autoscaler-provider-decoupling-2026-10-17.md](../waverless-autoscaler-provider-decoupling-2026-10-17.md) | **生效（实现权威）** | Gongji Provider + Autoscaler 解耦 |
| [waverless-provider-hub-placement-final-2026-10-17.md](../waverless-provider-hub-placement-final-2026-10-17.md) | **生效（§8 已拍板；M2a 权威）** | 拼池 + Traefik http_service |
| [waverless-cn-provider-implementation-plan.md](../waverless-cn-provider-implementation-plan.md) | **生效** | P0 单厂闭环任务 |
| [waverless-cloud-skypilot-integration-recommendation.md](../waverless-cloud-skypilot-integration-recommendation.md) | **生效（目标架构）** | §9–§10 现行；§1–§8 早期分析 |
| [waverless-runpod-ui-parity-and-priority.md](../waverless-runpod-ui-parity-and-priority.md) | **生效** | UI / 优先级 |
| [waverless-design-logic-review-2026-10-17.md](../waverless-design-logic-review-2026-10-17.md) | 快照评审 | 不作为开工范围 |
| [waverless-cn-provider-code-design-review.md](../waverless-cn-provider-code-design-review.md) | 快照评审 | 不作为开工范围 |

## 1. 跨模块设计（`docs/design/`）

| 文档 | 状态 | 定位 |
| --- | --- | --- |
| [merchant-open-items-design.md](merchant-open-items-design.md) | **生效**（资金/毛利终版） | 商户平台开放项：对账中心、白牌主题、access_mode 派生、资金毛利口径（Q1–Q18 决策）。**计费与商户账单类设计的裁决基准** |
| [onboarding-pipeline-p2.md](onboarding-pipeline-p2.md) | 生效 | 入驻流水线 P2 |
| [supplier-upload-strategy-p0.md](../../apps/supplier/content/design/supplier-upload-strategy-p0.md) | 生效 | 供应商上传策略 P0 |
| [invoice-upload-design.md](invoice-upload-design.md) | 生效 | 发票文件上传实现方案 |

## 2. 审计与差距（`docs/design/audit/`）

| 文档 | 状态 | 定位 |
| --- | --- | --- |
| [doc-contradictions.md](audit/doc-contradictions.md) | **生效**（2026-10-06 裁决） | ★ 文档矛盾台账：计费 / 设备生命周期 / 飞书集成 / 月度成本 / 大盘报表 5 主题，39 条矛盾与处置标签 |
| [doc-health-scan.md](audit/doc-health-scan.md) | **生效**（可复跑） | ★ 机器扫描：§引用失效、断链、状态标记、表名与 schema 交集 |
| [p0-p1-audit.md](audit/p0-p1-audit.md) | 生效 | P0/P1 缺口审计与闭合清单 |
| [supplier-settlement-closure-audit.md](../../apps/supplier/content/design/supplier-settlement-closure-audit.md) | 生效 | 供应商结算闭环审计（证据与结论） |
| [supplier-settlement-open-items.md](../../apps/supplier/content/design/supplier-settlement-open-items.md) | 生效 | 供应商结算**未闭合项**清单 |
| [design-vs-schema-conflicts.md](audit/design-vs-schema-conflicts.md) | **过期**（已由 doc-health-scan 取代） | 旧的 schema 冲突记录，全篇结论已失效，见 `docs/archive/README.md` |
| [merchant-console-followups.md](audit/merchant-console-followups.md) | 生效 | 商户控制台遗留项 |
| [mode-a-p0-middleware.md](audit/mode-a-p0-middleware.md) | 生效 | Mode A P0 中间件 |
| [gpus-commercialization-gap-analysis.md](../../apps/gpus/content/design/gpus-commercialization-gap-analysis.md) | 生效 | GPU 商业化差距分析 |
| [serverless-commercialization-gap.md](audit/serverless-commercialization-gap.md) | 生效 | Serverless 商业化差距 |

## 3. 平台架构（`docs/design/{cloud,k8s}`）

| 目录 | 文档数 | 入口 |
| --- | --- | --- |
| `cloud/` | 35 | **[cloud/INDEX.md](cloud/INDEX.md)**（含 [cloud/00-overview.md](cloud/00-overview.md) 总览、[cloud/database-design.md](cloud/database-design.md) 数据库设计） |
| `k8s/` | 4 | [k8s/cloud-native-integration.md](k8s/cloud-native-integration.md)、[k8s/image-registry-optimization.md](k8s/image-registry-optimization.md)、[k8s/image-registry-cost-optimization.md](k8s/image-registry-cost-optimization.md)、[k8s/image-tenant-workflow.md](k8s/image-tenant-workflow.md) |

`cloud/` 内的**商业化类**文档已按分类规则移至 [`docs/business/`](../business/INDEX.md)（产品线 taxonomy、裸金属商业化、镜像预热激励），**机房交付清单**移至 [`docs/guide/`](../guide/INDEX.md)，**商业化差距分析**移入本目录 `audit/`。

`cloud/` 已裁决状态：

| 文档 | 状态 |
| --- | --- |
| [merchant-billing-system-design.md](cloud/merchant-billing-system-design.md) | **已取代** → [`merchant-open-items-design.md`](merchant-open-items-design.md)（毛利公式、券成本、`commission_rate`、`funding_mode` 四处口径变更） |
| [openmeter-billing-design.md](cloud/openmeter-billing-design.md) | **候选 · 未采纳**（仅 L2 §5.4 与存储计费段可复用；实际走上游 OpenAPI 镜像） |
| [tenant-billing-system-design.md](cloud/tenant-billing-system-design.md) | **权威**（镜像读路径，已实施）· §9.2-9.3 归因段待改指 open-items |
| [tenant-balance-unification.md](cloud/tenant-balance-unification.md) | **权威**（`cloud/INDEX.md §1.1` 语义权威） |
| [recharge-flow-and-database-design.md](cloud/recharge-flow-and-database-design.md) | **权威** · §8.1 事务与 `scene` 枚举待按实现改写 |
| [tenant-balance-snapshot-design.md](../../apps/web/content/design/tenant-balance-snapshot-design.md) | **权威** · §G4/§3.6 真值口径待改为「派生自上游」 |

> 仍为 `生效` 的 `cloud/` 其余 31 份见 [cloud/INDEX.md](cloud/INDEX.md)；其中 [cloud/INDEX.md](cloud/INDEX.md) §文档清单的 3 个商业类条目已随文件移动改为 `../../business/` 相对链接。

## 4. `apps/web` 设计（`apps/web/content/design/`，79 份）

### 认证与权限

`auth-system-design.md` · `auth-closed-registration-password-policy.md` · `auth-risk-isolation-analysis.md` · `rbac-design.md` · `role-menu-data-access-design.md` · `merchant-review-contact-and-cross-app-auth-design.md`

### CRM 与线索

`crm-database.md` · `crm-sales-leads-design.md` · `crm-workbench-implementation-plan.md` · `crm-workbench-metrics-caliber.md` · `opportunity-import-design.md` · `supply-chain-leads-design.md` · `supply-chain-leads-bitable-import-design.md` · `entity-contacts-design.md` · `feishu-bitable-automation-inbound-design.md` · `feishu-integration-design.md` · `feishu-work-order-module-category-design.md`

### 财务与计费

`billing-period-import-design.md` · `cost-compute-v3-redesign-with-examples.md` · `finance-personal-income-design.md` · `finance-personal-income-baremetal-source-v2-design.md` · `finance-single-period-income-design.md` · `finance-cost-regenerate-baremetal-source-design.md` · `finance-create-billing-period-dialog-plan.md` · `monthly-cost-from-gpu-consumption-design.md` · `monthly-cost-confirm-and-legacy-cost-removal-plan.md` · `platform-cost-commission-phase-derive-design.md` · `platform-pricing-design.md` · `discount-coupon-sync-design.md` · `project-billing-scheduled-sync-design.md` · `project-monthly-cost-snapshot-design.md` · `tenant-balance-snapshot-design.md` · `tenant-bill-daily-sync-design.md` · `tenant-billing-import-design.md`

### 大盘与报表

**大盘报表已于 2026-10-06 整体下线**（`/dashboard`、`/dashboard/global` 及其后端、DB 表全删）。原 16 份设计与实施计划已移入 [`archive/`](archive/)（标 `已废止`），不再描述现网能力。

现存：`gpu-card-types-filter-and-detail-design.md` · `project-tenant-daily-consumption-design.md` · `project-revenue-department-design.md` · `tenant-region-gpu-consumption-daily-monthly-design.md` · `tenant-region-gpu-consumption-monthly-import-design.md`

月报指标口径见 [`reports/`](../../apps/web/content/design/reports/)（2 份），SLA 见 [`sla/`](../../apps/web/content/design/sla/)（3 份设计 + 1 份 SQL），设计-实现差距见 [`audit/design-implementation-gap-audit.md`](../../apps/web/content/design/audit/design-implementation-gap-audit.md)。

### 供应商与设备

`supplier-database.md` · `supplier-import-design.md` · `supplier-datacenter-import-design.md` · `supplier-device-import-schema.md` · `supplier-device-data-cleanup-sql.md` · `supplier-device-ops-pool-masterdata-design.md` · `supplier-device-platform-probe-design.md` · `supplier-device-retire-design.md` · `supplier-device-management-ops-panorama.md` · `supplier-internal-occupancy-batch-design.md` · `supplier-onboarding-plan-changelog-tracking-design.md` · `supplier-overview-scenarios-from-zero.md` · `supplier-planned-batches-hub-design.md` · `datacenter-device-retire-design.md` · `device-platform-orphan-import-rules-design.md`

### 商户与项目

`merchant-management-design.md` · `merchant-am-data-access-design.md` · `project-import-design.md` · `site-messages-design.md` · `tenant-blacklist-management-design.md` · `tenant-customer-reassignment-design.md`

### 裸金属与 IDC

`bare-metal-order-schema-design.md` · `bare-metal-order-discount-fields-sync-plan.md` · `commerce-order-bare-metal-merge.md` · `platform-metal-order-api-field-mapping.md` · `idc-auto-onboarding-design.md` · `idc-auto-onboarding-implementation.md` · `idc-edge-agent-design.md`

### 商业类（已归入模块 business）

见 [`apps/web/content/business/`](../../apps/web/content/business/)：`spot-sales-operations-sop.md`、`supplier-lifecycle-product-plan.md`、`supplier-contract-management-design.md`

### 已裁决文档状态（2026-10-06）

| 文档 | 状态 | 归属主题 |
| --- | --- | --- |
| `supplier-device-retire-design.md` | **已取代** → `datacenter-device-retire-design.md` | §2 设备生命周期 |
| `supplier-overview-scenarios-from-zero.md` | **过期 · 待重写** | §2 设备生命周期 |
| `cost-compute-v3-redesign-with-examples.md` | **已取代** → `monthly-cost-confirm-and-legacy-cost-removal-plan.md` | §4 月度成本 |
| `platform-cost-commission-phase-derive-design.md` | **已取代** → `monthly-cost-from-gpu-consumption-design.md` | §4 月度成本 |
| `project-monthly-cost-snapshot-design.md` | **过期 · 待重写** | §4 月度成本 |
| `finance-cost-regenerate-baremetal-source-design.md` | **过期 · 待重写** | §4 月度成本 |
| `archive/global-dashboard-period-composition-m7-dws-acceleration.md` | **已废止 · 已归档**（大盘下线） | §5 大盘报表 |
| `monthly-cost-confirm-and-legacy-cost-removal-plan.md` | **权威** | §4 月度成本 |
| `monthly-cost-from-gpu-consumption-design.md` | **权威**（新真源） | §4 月度成本 |
| `finance-single-period-income-design.md` | **权威** | §4 月度成本 |
| `archive/global-dashboard-kpi-caliber-spec.md` | **已废止 · 已归档**（原权威） | §5 大盘报表 |
| `archive/global-dashboard-period-composition-card-hours-design.md` | **已废止 · 已归档**（原权威） | §5 大盘报表 |
| `archive/global-dashboard-resource-composition-chart-design.md` | **已废止 · 已归档**（原权威） | §5 大盘报表 |
| `archive/operational-dashboard-implementation-plan.md` | **已废止 · 已归档**（原权威·运营大盘总纲） | §5 大盘报表 |
| `datacenter-device-retire-design.md` | **权威** | §2 设备生命周期 |
| `supplier-device-ops-pool-masterdata-design.md` | **权威**（§3「12 条字典」实为 11 条，待订正） | §2 设备生命周期 |
| `supplier-device-platform-probe-design.md` | **权威**（头部状态行待改） | §2 设备生命周期 |
| `device-platform-orphan-import-rules-design.md` | **子文档** → `supplier-device-platform-probe-design.md` | §2 设备生命周期 |
| `feishu-integration-design.md` | **权威**（§5.11.2/§12-F13/§14 待勘误） | 飞书集成 |
| `feishu-bitable-automation-inbound-design.md` | **子文档** → `feishu-integration-design.md` | 飞书集成 |
| `feishu-work-order-module-category-design.md` | **子文档** → `feishu-integration-design.md` | 飞书集成 |
| `archive/global-dashboard-implementation-plan.md` 等 4 份 | **已废止 · 已归档**（原子文档） | §5 大盘报表 |
| `archive/operational-dashboard-*.md` 其余 7 份 | **已废止 · 已归档**（原子文档） | §5 大盘报表 |

> 完整矛盾清单（含 `文件 §章节` 出处）见 [`audit/doc-contradictions.md`](audit/doc-contradictions.md)。

## 5. `apps/merchant` 设计（`apps/merchant/content/design/`）

| 文档 | 状态 | 定位 |
| --- | --- | --- |
| [merchant-module-review-and-design.md](../../apps/merchant/content/design/merchant-module-review-and-design.md) | 生效（含 20 处待定标记） | 商户模块审查与设计（§3.2/§3.4/§3.6/§3.7/§5.6/§6.5–6.6 被代码引用） |
| [merchant-funding-addendum.md](../../apps/merchant/content/design/merchant-funding-addendum.md) | 生效 | 资金模式补充设计 |

定价见 [`apps/merchant/content/business/merchant-pricing-design.md`](../../apps/merchant/content/business/merchant-pricing-design.md)。

## 6. 梳理进度

**已完成（2026-10-06 第二阶段）**

1. ✅ 5 大重复主题逐条裁决 → [`audit/doc-contradictions.md`](audit/doc-contradictions.md)（39 条矛盾、46 份文档处置标签）
2. ✅ 机器扫描 → [`audit/doc-health-scan.md`](audit/doc-health-scan.md)（§引用 7 处失效、断链 36、状态标记 105 文件、表名未命中 116）
3. ✅ 9 份文档头部已加 `已取代` / `过期·待重写` / `候选·未采纳` 标注（原位保留，不移动）
4. ✅ 状态列补齐（本文件 §1/§2/§5 与 §4 已裁决表）

5. ✅ 按 [`audit/doc-contradictions.md §6`](audit/doc-contradictions.md) 订正权威文档错误段落（2026-10-06）：`tenant-billing` §9.2/9.3 归因、`tenant-balance-snapshot` 真值口径、`recharge` scene 枚举与 §8.1 事务、`tenant-balance-unification` §5 字段、`ops-pool` 字典条数、`probe` CM-7 状态、飞书 9 处（入站通道/默认分类/已删组件/Excel 废弃）、`p0-metrics` §3.1 毛利路径、`metrics:79` 部门字段、`card-hours`/`period-analytics` 状态行
6. ✅ 断链修复：**42 → 0**（28 处层级笔误改写、13 处死链转纯文本标注、5 处含括号路径改 `<...>` 包裹）
7. ✅ 跨文档 `§` 引用：3 处真失效改锚；4 处确认为中文数字章节的扫描误报，引用有效
8. ✅ `tenant-balance-unification` 补「两列职责声明」（双真值收口前的过渡口径）

**待办（剩余）**

1. schema 缺口回填：余额双真值收口、`commission_rate` 单位 —— 属代码改动，非文档
2. 业务确认：提成分段「月序 vs 客群」需业务书面定稿（台账 §6 第 1 条）
3. 表名断言 116 处 / 49 文件待人工区分「规划中新表」与「过期描述」（低优先级）

