# 模块13：同步任务 · 财务成本主路径 · Dashboard 清 mock（tRPC → DB）

> 状态：已在 `apps/shop` 落地生产路径。分支 `feat/shop-trpc-finance-sync-dashboard`。
> 基线：`feat/shop-trpc-supplier-order-exceptions`（PR #49 栈，含 #44–#49）；**不依赖 / 不合并** 售后 #43。
> **闭环升级（2026-11-07）**：见 [cost-finance-production-closure.md](cost-finance-production-closure.md)（PR #64–#68）：导航 B、运价卡、结算导入/Lazop 同步、去 mock；迁移 0012/0013。

## 范围

| 已接 PostgreSQL | 仍缺口 / 边界 |
| --- | --- |
| `sync_tasks` / `sync_job_runs` 列表/详情/stats/入队/重试 | 非结算类同步的真实 connector 深度联调 |
| `integration_logs` 随入队写入 requestId | 设置·接口日志若仍有过滤偏差可后续对齐 |
| `settlements` / `settlement_lines`；`importSettlements`；`syncSettlementsFromPlatform`（Lazop） | 非 Lazop 结算适配器；店铺 OAuth 重写 |
| `sku_costs` + `ocean.saveCost`；测算强制 `fxRates` + 费用模板 | — |
| 订单/SKU 利润：`listProfits` / `getProfit` / `profitKpis` | 候选选品 |
| 运费：`commerce_freight_rate_cards` + `ocean_freight` 模板 + ocean packing（`listFreight`） | 完整独立运费引擎（见 freight-estimation-design） |
| Dashboard KPI/待办/趋势/库存汇总 | 部分图表系列仍可能示意 |
| 采购申请明细 `preferredForSku` 自动带价/交期 | 售后 #43 |

## 架构

```
console/sync-tasks
  → trpc.sync.* → dataaccess/sync → sync_tasks / sync_job_runs (+ integration_logs)

console/settlements | profits | costs | freight | freight-rate-cards
  → trpc.finance.* / freightRateCards.* → dataaccess
  → settlements / settlement_lines / sku_costs / commerce_freight_rate_cards
  → orders / fee_templates / ocean_shipments / fx_rates

console/dashboard
  → trpc.dashboard.* → dataaccess/dashboard
  → orders / inventory_balances / purchase_requests / reverse_orders
  → mapping_exceptions / seller_sku_mappings / sync_tasks
```

## 同步任务约定

- 状态 UI：成功 / 失败 / 部分失败 / 排队 / 排队重试 / 运行中
- `enqueue` / `retry`：写 `sync_tasks` + `sync_job_runs` + 可选 `integration_logs`
- **禁止**在文案或结果中声称已调用真实平台 connector

## 财务约定

- 费用拆分按 `settlement_lines.fee_kind` 汇总；空则 0，不写死税费
- 利润：`orders.total_amount − sku_costs(最新) − 结算/物流费用`；提供 `getProfit` / `profitKpis`
- 无结算关联 → 状态「未结算」
- 正式成本只经 `ocean.saveCost`；禁止 localStorage / 已删 demo store
- 结算：CSV/JSON `importSettlements`；Lazop `syncSettlementsFromPlatform`（经 apps/api）；`updateSettlementStatus` 需确认
- 运费页：`freightRateCards` + `fee_templates(type=ocean_freight)` + ocean packing；无 DEMO_FREIGHT
- 导航方案 B：承运商/箱规在仓储中心；成本财务保留 costs / fee-templates / settlements / profits / freight-rate-cards / freight

## 迁移与种子

- 同步：`packages/db/drizzle/0017_commerce_sync_tasks.sql`（`sync_tasks` / `sync_job_runs`）— 历史编号，以仓库现有 drizzle 目录为准
- 成本财务闭环：`0012_cost_finance_closure.sql`（运价卡、carrier/carton/fx FK、`ocean_freight`）、`0013_fulfillment_batch_carrier.sql`
- 财务基表沿用早期 commerce schema（`settlements` / `sku_costs` / `fx_rates` 等）

```bash
docker compose up -d
pnpm --filter @workspace/db db:migrate
pnpm --filter @workspace/db db:seed:commerce-products
pnpm --filter @workspace/db db:seed:commerce-orders
pnpm --filter @workspace/db db:seed:commerce-fee-templates   # 可选，运费模板
pnpm --filter @workspace/db db:seed:commerce-finance
# SHOP_DEV_ORGANIZATION_ID=org_shop_dev_demo
pnpm --filter shop dev
```

## tRPC

### `sync`

`list` / `stats` / `meta` / `get` / `enqueue` / `retry`

### `finance`

`overview` / `settlementStats` / `listSettlements` / `getSettlement` / `updateSettlementStatus` / `importSettlements` / `syncSettlementsFromPlatform`  
`listCosts` / `listProfits` / `getProfit` / `profitKpis` / `listFreight` / `getFreight` / `meta`（含 `settlementSync`）  
另见独立 router：`freightRateCards` / `carriers` / `cartonSpecs` / `fxRates`

### `dashboard`

`kpis` / `trends` / `todos` / `inventory`

## 关键文件

| 文件 | 说明 |
| --- | --- |
| `apps/shop/src/lib/server/routers/{sync,finance,dashboard}.ts` | tRPC |
| `apps/shop/src/lib/server/dataaccess/{sync,finance,dashboard}.ts` | DB |
| `apps/shop/src/lib/server/mappers/{sync,finance}.ts` | 中文映射 |
| `packages/db/drizzle/0017_commerce_sync_tasks.sql` | 迁移 |
| `packages/db/src/scripts/seed-commerce-finance.ts` | 演示种子 |
| `docs/design/shop-module13-finance-sync-dashboard-trpc.md` | 本文档 |

## 本模块初始 PR 不做 / 后续已补

初始模块13 PR：不合并售后 #43；不改左侧菜单。  
#64–#68 已补：导航 B、运价卡、结算导入与 Lazop 同步、去 mock。仍不做：非 Lazop 结算适配器、OAuth 重写、候选选品全量。详见 [cost-finance-production-closure.md](cost-finance-production-closure.md)。
