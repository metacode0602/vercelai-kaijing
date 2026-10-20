# 商业方案索引

> 全仓 business（商业方案）清单。**跨模块商业方案在本目录，模块内商业方案就地存放在 `<app>/content/business/`。**

## 1. 跨模块商业方案（`docs/business/`）

| 文档 | 定位 |
| --- | --- |
| [商业方案.md](商业方案.md) | 主商业方案（产品线、定价层级、收入模型、运营指标口径） |
| [商业方案-投资人版.md](商业方案-投资人版.md) | 面向投资人的版本 |
| [cost.md](cost.md) | 成本结构与内部销售提成矩阵（**政策权威**；§1.3/§4.5/§11.6 月序表述待改客群口径，见文首 2026-10-06 标注） |
| [merchant-product-plan.md](merchant-product-plan.md) | 商户产品规划（Q1–Q18 决策与排期） |
| [commercial-closed-loop-gap-analysis.md](commercial-closed-loop-gap-analysis.md) | 商业闭环差距分析 |
| [oem-brand-site-contract.md](oem-brand-site-contract.md) | OEM 品牌站契约（branding / 域名 / access_mode 约定） |
| [product-line-taxonomy.md](product-line-taxonomy.md) | **产品线与计费语义权威**（`product_line` × `billing_mode` × `commitment` 枚举冻结） |
| [bare-metal-order-commercialization.md](bare-metal-order-commercialization.md) | 裸金属订单商业化（券类型、下单流程、运营页面） |
| [image-preload-commercial-and-community-incentive.md](image-preload-commercial-and-community-incentive.md) | 镜像预热商业化与社区激励（计费模型、免费额度） |
| [auto-listing-and-commercialization.mdx](auto-listing-and-commercialization.mdx) | 自动上架与商业化（原 `.mdx` 稿件，第二轮梳理时去 mdx 化） |

## 2. `apps/web` 商业方案（`apps/web/content/business/`）

| 文档 | 定位 |
| --- | --- |
| [spot-sales-operations-sop.md](../../apps/web/content/business/spot-sales-operations-sop.md) | Spot 销售运营 SOP |
| [supplier-lifecycle-product-plan.md](../../apps/web/content/business/supplier-lifecycle-product-plan.md) | 供应商生命周期产品规划 |
| [supplier-contract-management-design.md](../../apps/web/content/business/supplier-contract-management-design.md) | 供应商合同管理设计 |

## 3. `apps/merchant` 商业方案（`apps/merchant/content/business/`）

| 文档 | 定位 |
| --- | --- |
| [merchant-pricing-design.md](../../apps/merchant/content/business/merchant-pricing-design.md) | 商户定价设计（刊例价 / 进货价 / 销售价三层，`merchant_model_*` 定价表） |

## 4. 相关但不属本分类

| 文档 | 为什么不是 business |
| --- | --- |
| [`apps/web/content/legal/`](../../apps/web/content/legal/) | 对外合规文档（隐私 / 条款 / 安全），由法务口径维护，**原位保留** |
| [`apps/web/content/pages/`](../../apps/web/content/pages/) | 站点法律页与版本发布说明（`.mdx`） |
| 计费实现类设计 | 属 `design`：如 [`docs/design/cloud/openmeter-billing-design.md`](../design/cloud/openmeter-billing-design.md)、[`docs/design/cloud/tenant-billing-system-design.md`](../design/cloud/tenant-billing-system-design.md) |
