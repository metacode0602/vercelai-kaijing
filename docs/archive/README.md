# 设计文档归档说明

本目录存放**已过期、不再作为设计依据**的商户域文档。

## 归档原则

1. **只移动，不删除** —— 保留原文以供历史追溯。
2. **每份文档顶部加归档横幅** —— 写明归档日期、原路径、归档原因、已知过期点、当前有效文档。
3. **归档 ≠ 删除，但归档后不得据其排期或改代码**。

## 归档清单

| 文档 | 原路径 | 归档原因 | 取代者 |
|---|---|---|---|
| `design-vs-schema-conflicts.md` | 仓库根目录 | 整篇过期：声称 `merchant_promo_link` / `merchant_branding` / `merchant_bill_daily` 等表「缺失」，实际全部存在 | `docs/design/cloud/merchant-billing-system-design.md` |
| `FINAL_SUMMARY.md` | 仓库根目录 | PR #1 实施完成报告；引用不存在的 `apps/merchant/src/middleware.ts`，且把「写响应头」当作正确实现 | `apps/merchant/content/design/merchant-module-review-and-design.md` |
| `IMPLEMENTATION_SUMMARY.md` | 仓库根目录 | PR #1 实施清单；迁移号与后续手写迁移冲突，「已完成」结论被推翻 | 同上 |
| `merchant-console-followups.md` | `docs/` | 控制台实施说明；`hasSalesPrice` 硬编码、技术债 #3 自相矛盾 | 同上 |
| `mode-a-p0-middleware.md` | `docs/` | 描述的白牌域名实现本身有缺陷（响应头 ≠ 请求头），照做会导致 Q17=A 失效 | 同上（P1-15） |

## 当前有效设计文档

| 文档 | 定位 |
|---|---|
| `apps/merchant/content/design/merchant-module-review-and-design.md` | **商户模块权威设计（v3）**：A/B/C/D 四形态矩阵、商户账户体系（现金/券/授信三池）、算力券采购→发放→核销→过期返还、外部用户映射、实时扣减幂等与双记账、三方对账、UED、数据流、冲突评审（§2）、实施路线、待决策 DEC-1~DEC-8 |
| `docs/business/merchant-product-plan.md` | **Q1–Q18 锁定决策**来源（v0.3），设计与评审的决策依据。⚠ 其 `:145`「IFrame / 纯 API 作为后续扩展」已被权威设计 §4.6/§5.3 升级为本期交付；Q13/Q15 已按最新口径补充平台侧对账镜像要求 |
| `docs/design/cloud/merchant-billing-system-design.md` | **账单口径**定义（收入/进货成本/券成本/折扣成本/毛利公式）。⚠ 券成本需按采购价折算，不能直接用 `coupon_amount` 面值（见权威设计 §2.3 P0-9） |
| `apps/merchant/content/business/merchant-pricing-design.md` | **定价三层**（刊例价/进货价/销售价）与 `merchant_sales_price` 设计 |
| `docs/business/oem-brand-site-contract.md` | 形态 B 品牌站与平台的 API 合约、进货价同步、品牌站库边界 |
| `apps/web/content/design/merchant-management-design.md` | 运营平台侧（`apps/web`）的商户 CRM 设计 |
| `apps/web/content/design/merchant-am-data-access-design.md` | `apps/web` 商户域 AM 数据访问设计（配套） |
| `apps/web/content/design/merchant-review-contact-and-cross-app-auth-design.md` | 商户联系人与跨应用鉴权设计（配套） |

> 冲突时的优先级：`apps/merchant/content/design/merchant-module-review-and-design.md` > 本文列出的其他文档。发现不一致时以权威设计为准，并回改被覆盖文档。

## 归档判据

出现以下任一情况即应归档：

- 关键结论已被代码推翻（如声称表/字段缺失但实际存在）；
- 描述的实现路径不存在或已知有缺陷；
- 属于实施完成报告 / 阶段性 TODO 清单，且其内容已被正式设计文档覆盖；
- 与已锁定的商业模型（预付 + 券账户）冲突且未被更新。
