# 模块4：LGS / 物流履约（包裹 + 轨迹 + LGS/JSB 交接批次）

> 状态：已在 `apps/shop` 落地生产路径。分支 `feat/shop-trpc-lgs-fulfillment`。
> #66：`fulfillment_batches.carrier_id` → `commerce_carriers`（`fulfillment_batches.carrier_id` FK，历史迁移 `0013_fulfillment_batch_carrier`，现于 `0002_glamorous_bruce_banner.sql`）；LGS/JSB UI 可选承运商。见 [cost-finance-production-closure.md](cost-finance-production-closure.md)。

## 范围

| 已接 PostgreSQL | 仍缺口 / 边界（非本模块） |
| --- | --- |
| 包裹列表 / 详情 / 从订单创建 | 真实 Lazada / Daraz / Shopee OpenAPI |
| 轨迹追加（强制 `source`）/ 幂等 | — |
| stub 同步运单与轨迹 + `fulfillment_attempts` | — |
| LGS / JSB 交接批次 CRUD、加包、提交/关闭；可选 `carrier_id` | — |
| Console `shipments` / `logistics-lgs` / `logistics-jsb` | — |
| 中文 UI ↔ DB 状态映射 | — |

> 2026-11-08：费用模板（模块5）、海运柜次（模块7）、售后回库（模块6）、Dashboard KPI（模块13/14）均已接库。

## 架构

```
console/shipments | logistics-lgs | logistics-jsb
  → trpc.logistics.*（React Query）
  → /api/trpc
  → routers/logistics（tenantProcedure）
  → dataaccess/logistics (+ mappers/logistics)
  → Drizzle → shipments / shipment_items / tracking_events
               / fulfillment_batches / fulfillment_batch_packages
               / fulfillment_attempts
```

与模块3 解耦：出库过账不写 LGS；本模块在出库后建包裹与交接，不改库存流水。

## 表与迁移

迁移文件：`packages/db/drizzle/0000_flashy_silver_samurai.sql` + `0002_glamorous_bruce_banner.sql`（历史编号 `0011_commerce_lgs_fulfillment` / `0013_fulfillment_batch_carrier`，2026-11-08 重生成并入）

| 变更 | 说明 |
| --- | --- |
| `tracking_events.source` | `varchar(16) not null default 'manual'`（`api` / `manual` / `import`） |
| `fulfillment_batches` | 交接批次；`UNIQUE (organization_id, batch_no)`；channel=`lgs`\|`jsb_th`\|… |
| `fulfillment_batch_packages` | junction：`batch_id + shipment_id` UNIQUE；含 `organization_id` |
| **不**加 `shipments.batch_id` | 仅通过 junction 关联，避免一包多批歧义 |

既有表（早期 migration）：`shipments` / `shipment_items` / `tracking_events` / `fulfillment_attempts` — 不重建（历史 0011 并入 0000）。

## 业务默认

| 项 | 默认 |
| --- | --- |
| 包裹唯一 | `(shop_id, external_package_id)` |
| 轨迹幂等 | `(shipment_id, event_time, status_code)` |
| 人工补录 | `source=manual`；JSB 批量导入 `source=import`；stub/同步 `source=api` |
| provider 默认 | Lazada MY/PH/SG/VN → `lgs`；Daraz → `platform`；TH JSB → `jsb` |
| 平台 OpenAPI | stub（写 `fulfillment_attempts` + idempotencyKey） |
| 开发租户 | `SHOP_DEV_ORGANIZATION_ID=org_shop_dev_demo` |

## 迁移与种子

```bash
docker compose up -d
pnpm --filter @workspace/db db:migrate
pnpm --filter @workspace/db db:seed:commerce-products
pnpm --filter @workspace/db db:seed:commerce-orders
pnpm --filter @workspace/db db:seed:commerce-logistics
# SHOP_DEV_ORGANIZATION_ID=org_shop_dev_demo
pnpm --filter shop dev
```

## 关键文件

| 文件 | 说明 |
| --- | --- |
| `apps/shop/src/lib/server/routers/logistics.ts` | tRPC API |
| `apps/shop/src/lib/server/dataaccess/logistics.ts` | DB 读写与事务 |
| `apps/shop/src/lib/server/mappers/logistics.ts` | 中文状态映射 |
| `packages/db/drizzle/0000_flashy_silver_samurai.sql` + `0002_glamorous_bruce_banner.sql` | 迁移（历史 0011/0013 并入） |
| `packages/db/src/scripts/seed-commerce-logistics.ts` | LGS/JSB/platform 演示数据 |
| `apps/shop/src/lib/crossborder/shipment-store.ts` | 主路径已停用；仅保留常量/label |

## tRPC 过程

`list` / `stats` / `get` / `createFromOrder` / `updateStatus` / `appendTracking` / `syncFromPlatform` / `importTracking` / `listBatches` / `getBatch` / `createBatch` / `addPackageToBatch` / `submitBatch` / `closeBatch` / `appendBatchEvent` / `meta`

## 本 PR 不做

真实平台 OpenAPI、费用模板、ocean_shipments 业务化、售后回库、改左侧菜单。
