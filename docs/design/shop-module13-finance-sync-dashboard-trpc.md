# 模块13：同步任务 · 财务成本主路径 · Dashboard 清 mock（tRPC → DB）

> 状态：已在 `apps/shop` 落地生产路径。分支 `feat/shop-trpc-finance-sync-dashboard`。
> 基线：`feat/shop-trpc-supplier-order-exceptions`（PR #49 栈，含 #44–#49）；**不依赖 / 不合并** 售后 #43。

## 范围

| 已接 PostgreSQL | 仍 mock / stub |
| --- | --- |
| `sync_tasks` / `sync_job_runs` 列表/详情/stats/入队/重试 | 真实 Daraz/Lazada OpenAPI 联调（入队只写请求记录） |
| `integration_logs` 随入队写入 requestId | 设置·接口日志整页若仍有 demo 过滤可后续对齐 |
| `settlements` / `settlement_lines` 列表详情汇总 | 平台结算账单拉取 API |
| `sku_costs` 成本列表 | 成本测算工作台本地试算 UI（可并存） |
| 订单/SKU 利润：营收−成本−费用；无结算→「未结算」 | 候选选品 |
| 运费估算：`fee_templates` + `ocean_shipments`（弃用 DEMO_FREIGHT 主路径） | Dashboard 部分图表系列（平台占比/分类周转仍示意） |
| Dashboard KPI/待办/趋势/库存汇总 | 今日预警文案仍有示意条目 |
| 采购申请明细 `preferredForSku` 自动带价/交期 | 店铺 OAuth 连接器；售后 #43 |

## 架构

```
console/sync-tasks
  → trpc.sync.* → dataaccess/sync → sync_tasks / sync_job_runs (+ integration_logs)

console/finance | settlements | profits | costs | freight
  → trpc.finance.* → dataaccess/finance
  → settlements / settlement_lines / sku_costs / logistics_fee_details
  → orders / order_lines / fee_templates / ocean_shipments

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
- 利润：`orders.total_amount − sku_costs(最新) − 结算/物流费用`
- 无结算关联 → 状态「未结算」
- 运费页主路径不再读 `DEMO_FREIGHT_ESTIMATES`

## 迁移与种子

迁移：`packages/db/drizzle/0017_commerce_sync_tasks.sql`（`sync_tasks` / `sync_job_runs`）

财务表沿用既有 commerce schema（0008+），无新财务表。

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

`overview` / `settlementStats` / `listSettlements` / `getSettlement` / `updateSettlementStatus`  
`listCosts` / `listProfits` / `listFreight` / `getFreight` / `meta`

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

## 本 PR 不做

合并售后 #43 / 合入 develop；真实平台 OpenAPI；候选选品全量；改左侧菜单。
