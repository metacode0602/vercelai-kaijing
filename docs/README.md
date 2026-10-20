# 文档索引

仓库内所有设计文档、操作手册、商业方案的**唯一入口**。各模块内的文档按同一套分类就地存放，本目录只收**跨模块**内容与总索引。

## 分类规则

判定顺序：

1. 被代码/构建读取的（站点源、应用内素材）→ **不移动**，原位保留
2. 描述「系统应该怎么建」 → `design`
3. 描述「人该怎么操作」 → `guide`
4. 描述「怎么卖 / 定价 / 合同 / 商业策略」 → `business`
5. 已被取代的旧文档 → `archive`（保留不删，标注 `已取代` 并链接新版）
6. 跨多个模块、无单一归属 → 收到本目录 `docs/{design,guide,business}`

**主轴：内容属于哪个模块，就放哪个模块的 `content/` 下；只有跨模块内容才上提到 `docs/`。**

## 本目录结构

```text
docs/
├── README.md            # 本文件：总索引
├── design/              # 跨模块设计
│   ├── INDEX.md         # 设计文档清单与状态（生效 / 已过期 / 已取代）
│   ├── audit/           # 审计与差距分析
│   ├── cloud/           # 算力平台核心架构（含 INDEX.md、00-overview.md）
│   ├── gpus/            # 消费者侧概览
│   └── k8s/             # K8s / 镜像仓库
├── guide/               # 跨模块操作手册
│   └── INDEX.md
├── business/            # 商业方案（唯一集中地）
│   └── INDEX.md
└── archive/             # 历史归档，不参与三分类
```

## 按类型查找

| 类型 | 顶层入口 | 模块内入口 |
| --- | --- | --- |
| 设计 | [design/INDEX.md](design/INDEX.md)、[design/cloud/INDEX.md](design/cloud/INDEX.md) | `apps/web/content/design/`、`apps/merchant/content/design/`、`apps/docs/content/guide/` 之外的设计见各模块 README |
| 操作手册 | [guide/INDEX.md](guide/INDEX.md) | `apps/web/content/guide/`、`apps/merchant/content/guide/`、`apps/docs/content/guide/` |
| 商业方案 | [business/INDEX.md](business/INDEX.md) | `apps/web/content/business/`、`apps/merchant/content/business/` |
| 审计与差距 | [design/audit/](design/audit/) | `apps/web/content/design/audit/` |

## 顶层文档清单

### `docs/design/` — 跨模块设计

| 文档 | 说明 |
| --- | --- |
| [merchant-open-items-design.md](design/merchant-open-items-design.md) | 商户平台开放项设计（Q1–Q18 决策、对账/白牌/access_mode 口径） |
| [onboarding-pipeline-p2.md](design/onboarding-pipeline-p2.md) | 入驻流水线 P2 |
| [supplier-upload-strategy-p0.md](../apps/supplier/content/design/supplier-upload-strategy-p0.md) | 供应商上传策略 P0 |
| [invoice-upload-design.md](design/invoice-upload-design.md) | 发票文件上传实现方案 |

`design/audit/` — 审计与差距分析：

| 文档 | 说明 |
| --- | --- |
| [doc-contradictions.md](design/audit/doc-contradictions.md) | ★ 文档矛盾台账：5 大重复主题 39 条矛盾逐条裁决与处置标签 |
| [doc-health-scan.md](design/audit/doc-health-scan.md) | ★ 机器扫描报告：§引用、断链、状态标记、表名与 schema 交集 |
| [p0-p1-audit.md](design/audit/p0-p1-audit.md) | P0/P1 缺口审计 |
| [supplier-settlement-closure-audit.md](../apps/supplier/content/design/supplier-settlement-closure-audit.md) | 供应商结算闭环审计 |
| [supplier-settlement-open-items.md](../apps/supplier/content/design/supplier-settlement-open-items.md) | 供应商结算未闭合项清单 |
| [design-vs-schema-conflicts.md](design/audit/design-vs-schema-conflicts.md) | 设计与 schema 冲突记录 |
| [merchant-console-followups.md](design/audit/merchant-console-followups.md) | 商户控制台遗留项 |
| [mode-a-p0-middleware.md](design/audit/mode-a-p0-middleware.md) | Mode A P0 中间件 |
| [gpus-commercialization-gap-analysis.md](../apps/gpus/content/design/gpus-commercialization-gap-analysis.md) | GPU 商业化差距分析 |
| [serverless-commercialization-gap.md](design/audit/serverless-commercialization-gap.md) | Serverless 商业化差距 |

### `docs/guide/` — 跨模块操作手册

| 文档 | 说明 |
| --- | --- |
| [invoice-upload-test-guide.md](guide/invoice-upload-test-guide.md) | 发票上传测试指南 |
| [supplier-idc-provisioning-checklist.md](../apps/supplier/content/guide/supplier-idc-provisioning-checklist.md) | 供应商机房交付清单 |

### `docs/business/` — 商业方案

| 文档 | 说明 |
| --- | --- |
| [商业方案.md](business/商业方案.md) | 主商业方案 |
| [商业方案-投资人版.md](business/商业方案-投资人版.md) | 投资人版 |
| [cost.md](business/cost.md) | 成本与内部销售提成口径 |
| [merchant-product-plan.md](business/merchant-product-plan.md) | 商户产品规划（Q1–Q18） |
| [commercial-closed-loop-gap-analysis.md](business/commercial-closed-loop-gap-analysis.md) | 商业闭环差距分析 |
| [oem-brand-site-contract.md](business/oem-brand-site-contract.md) | OEM 品牌站契约 |
| [product-line-taxonomy.md](business/product-line-taxonomy.md) | 产品线 / 计费语义权威 |
| [bare-metal-order-commercialization.md](business/bare-metal-order-commercialization.md) | 裸金属订单商业化 |
| [image-preload-commercial-and-community-incentive.md](business/image-preload-commercial-and-community-incentive.md) | 镜像预热商业化与社区激励 |

### `docs/archive/` — 历史归档

[README.md](archive/README.md)、[FINAL_SUMMARY.md](archive/FINAL_SUMMARY.md)、[IMPLEMENTATION_SUMMARY.md](archive/IMPLEMENTATION_SUMMARY.md)

## 各模块文档位置

| 模块 | design | guide | business | 说明 |
| --- | --- | --- | --- | --- |
| `apps/web` | `content/design/`（含 `sla/`、`reports/`、`audit/`） | `content/guide/` | `content/business/` | 运营平台，设计文档最多 |
| `apps/merchant` | `content/design/` | `content/guide/` | `content/business/` | 商户控制台 |
| `apps/docs` | — （架构类已上提 `docs/design/cloud|gpus|k8s`） | `content/guide/` | — | `content/docs/` 是站点源，见 [apps/docs/content/README.md](../apps/docs/content/README.md) |
| `apps/gpus` | — | — | — | 仅 `README.md`，需要时按规则新增 `content/design/` |
| `apps/supplier` | — | — | — | 同上 |
| `apps/api` | — | — | — | 同上 |
| `goes/` | — | `docs/guide/` | — | Go 代理组件，独立于 pnpm workspace |

### `docs/` 根目录 — Waverless 跨模块设计集（2026-10-17）

外采任务型 Serverless / Gongji Provider。**一期范围以拍板记录为准**；推荐文 §1–§8 为早期可行性分析。

| 文档 | 状态 | 定位 |
| --- | --- | --- |
| [waverless-product-decisions-2026-10-17.md](waverless-product-decisions-2026-10-17.md) | **生效（一期范围权威）** | 拍板 #1–#11 |
| [waverless-autoscaler-provider-decoupling-2026-10-17.md](waverless-autoscaler-provider-decoupling-2026-10-17.md) | **生效（Autoscaler/Gongji 实现权威）** | 拍板 #2/#6 |
| [waverless-cn-provider-implementation-plan.md](waverless-cn-provider-implementation-plan.md) | **生效（P0 任务）** | 单厂闭环 + 两账 |
| [waverless-cloud-skypilot-integration-recommendation.md](waverless-cloud-skypilot-integration-recommendation.md) | **生效（目标架构）**；§1–§8 已被 §9–§10+拍板取代 | 结合建议 + 国内 §10 |
| [waverless-runpod-ui-parity-and-priority.md](waverless-runpod-ui-parity-and-priority.md) | **生效（UI/优先级）** | Runpod 对照 |
| [waverless-design-logic-review-2026-10-17.md](waverless-design-logic-review-2026-10-17.md) | **快照评审**（不作为现行范围） | 逻辑矛盾 → 拍板映射 |
| [waverless-cn-provider-code-design-review.md](waverless-cn-provider-code-design-review.md) | **快照评审**（不作为现行范围） | 代码是否撑得住目标 |

相关专题：`docs/design/cloud/waverless-provider-cost-and-customer-billing.md`、`docs/design/cloud/waverless-region-provider-gateway-design.md`。

## 不参与三分类的文档（原位保留）

| 位置 | 原因 |
| --- | --- |
| `AGENTS.md`、各模块 `README.md` | 约定即原位 |
| `apps/docs/content/docs/**` | fumadocs 站点源（`source.config.ts` 指定），会被发布 |
| `apps/web/content/legal/**` | 对外合规文档，由法务口径维护 |
| `apps/web/content/pages/**`、`content/release/**` | 站点法律页与版本发布说明（`.mdx`） |
| `apps/web/src/app/api/v1/**/api.md`、`*/ppt/*.md`、`apps/merchant/**/ppt/**/README.md` | 位于应用路由树内 |
| `goes/docs/` | 独立 Go 组件自有文档 |

## 相关约定

- 流程图用 mermaid，线框图保持原格式 — 见 `AGENTS.md` → 设计文档约定
- 新文档落盘前先按上面的判定顺序分类，跨模块才上提 `docs/`
