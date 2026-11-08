# 模块5：费用模板（进口税 / 平台费）

> 状态：已在 `apps/shop` 落地生产路径。分支 `feat/shop-trpc-fee-templates`。
> 后续闭环：[#64–#68 成本财务生产闭环](cost-finance-production-closure.md) 扩展类型 `ocean_freight`；费用表本身在早期 commerce schema（`0000`），**不是** `0012_cost_finance_closure`（该历史迁移已重生成并入 `0002_glamorous_bruce_banner.sql`）。

## 范围

| 已接 PostgreSQL | 仍缺口 / 边界（非本模块） |
| --- | --- |
| `fee_templates` / `fee_template_versions`（早期 schema `0000` + `ocean_freight` 类型语义扩展，历史 0012 并入 `0002_glamorous_bruce_banner`） | 真实平台 OpenAPI |
| tRPC `feeTemplates` CRUD + 审核流 + resolve | 售后回库 |
| Console `/console/fee-templates` 列表/详情 | 海运柜次业务化 |
| 成本测算主路径 `resolve` → DB 模板 | 采购/库位/流水改动 |
| 中文 UI ↔ DB 状态映射；seed LK + Lazada 占位；类型含 `ocean_freight` | — |

## 架构

```
console/fee-templates | cost-calculator-workbench
  → trpc.feeTemplates.*（React Query）
  → /api/trpc
  → routers/fee-templates（tenantProcedure）
  → dataaccess/fee-templates (+ mappers/fee-templates)
  → Drizzle → fee_templates / fee_template_versions
```

`fee-template-store` 主路径已停用（类型/常量/`adaptResolvedFromDto`/`componentsToTariffRates` 保留）；`resolveFeeTemplateVersion` 同步调用恒返回 null。

## 表与迁移

基表：早期 commerce schema（`packages/db/drizzle/0000_*.sql` 中的 `fee_templates` / `fee_template_versions`）。
类型扩展：`ocean_freight`（与 import_tax / platform_fee 并列）；历史 `0012_cost_finance_closure.sql` 已重生成并入 `packages/db/drizzle/0002_glamorous_bruce_banner.sql`。
历史文档若写「migration 0012 = 费用模板建表」已过时；2026-11-08 迁移重生成后仅 `0000`/`0001`/`0002`，以闭环文档 §4 为准。

| 表 | 关键列 |
| --- | --- |
| `fee_templates` | `code/name/platform/country/fulfillment_pool/fulfillment_logistics/type/status/note`；`UNIQUE (organization_id, code)` |
| `fee_template_versions` | `version_no/effective_from/effective_to/priority/formula_profile/components(jsonb)/published/review_needed`；审核：`status/submitted_*/reviewed_*/review_note`；`UNIQUE (template_id, version_no)` |

### 审核状态映射（UED v1.1）

```text
draft → in_review → published → disabled
  ↑         │
  └──驳回────┘（回 draft，保留 review_note）
```

| UI（版本） | DB `status` | `published` |
| --- | --- | --- |
| 草稿 | `draft` | false |
| 审核中 | `in_review` | false |
| 已发布 | `published` | true |
| 已停用 | `disabled` | false |

模板头 UI「草稿/启用/停用」↔ DB `draft/active/disabled`。

## 业务默认（C1–C9）

| 项 | 默认 |
| --- | --- |
| C1-C | 有效期可重叠；解析取同维度 **priority 最高**且有效、已发布 |
| C2-C | 履约两级 = 业务履约池 + 物流形态（空=不限） |
| C3-C | 原 `import_tax` / `platform_fee`；#64 起另支持 `ocean_freight`（运费页/模板过滤） |
| C5-A | Lazada 种子占位（标待复核） |
| C6-A | 表即 `fee_templates` + `fee_template_versions` |
| C7-A | LK 初值自 `TARIFF_PROFILES`，`review_needed=true` |
| C8-A | 计算器优先模板；未命中回退 `TARIFF_PROFILES` 并标记 `resolvedFrom` |
| 开发租户 | `SHOP_DEV_ORGANIZATION_ID=org_shop_dev_demo` |

## 迁移与种子

```bash
docker compose up -d
pnpm --filter @workspace/db db:migrate
pnpm --filter @workspace/db db:seed:commerce-fee-templates
# SHOP_DEV_ORGANIZATION_ID=org_shop_dev_demo
pnpm --filter shop dev
```

种子含：Daraz LK `import_tax`（apparel / electronics / home_sports）+ Lazada 占位 + 至少 1 条 `platform_fee`。

## 关键文件

| 文件 | 说明 |
| --- | --- |
| `apps/shop/src/lib/server/routers/fee-templates.ts` | tRPC API |
| `apps/shop/src/lib/server/dataaccess/fee-templates.ts` | DB 读写 / resolve |
| `apps/shop/src/lib/server/mappers/fee-templates.ts` | 中文状态映射 |
| `packages/db/drizzle/0000_*.sql` + `0002_glamorous_bruce_banner.sql` | 基表 + `ocean_freight` 类型扩展（历史 0012 并入） |
| `packages/db/src/scripts/seed-commerce-fee-templates.ts` | 演示数据 |
| `apps/shop/src/lib/crossborder/fee-template-store.ts` | 主路径停用；类型与适配器 |
| `apps/shop/src/lib/crossborder/cost-calculator.ts` | `FeeResolutionOverrides` + `resolvedFrom` |

## tRPC 过程（`feeTemplates`）

`list` / `stats` / `meta` / `get` / `create` / `update` / `createVersion` / `updateVersion` / `submit` / `publish` / `reject` / `disableVersion` / `disable` / `duplicate` / `resolve`

## 成本测算

工作台对 `import_tax` / `platform_fee` 各调一次 `feeTemplates.resolve`，经 `adaptResolvedFromDto` 注入 `computeLandedCost(input, overrides)`。`resolve` 先按 `formulaProfile` 严格命中，未中再放宽。未命中 → 正式落成本路径应阻断（#64 起）；工作台不得把未命中模板当生产成本。历史 UED 中的 `TARIFF_PROFILES` 回退仅作非生产标记，见 [cost-finance-production-closure.md](cost-finance-production-closure.md)。
