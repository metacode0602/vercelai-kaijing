# 模块7：海运柜次 / 在途库存（tRPC → DB）

> 状态：已在 `apps/shop` 落地生产路径。分支 `feat/shop-trpc-ocean-intransit`。
> 对齐：`daraz-lk-erp-p0-ued.md` F22 / F32；成本测算见 `cost-calculator-sl-landed-ued.md`。

## 范围

| 已接 PostgreSQL | 仍 mock / stub |
| --- | --- |
| `ocean_shipments` / `ocean_shipment_lines` / `ocean_shipment_boxes` | 真实船司/清关 OpenAPI |
| 状态机 draft→booked→departed→arrived→customs→received | WMS 非海运出库入口 |
| 开船/清关/到仓写 `inventory_balances` 桶 + `inventory_movements` | 售后 #43（独立 PR，未合） |
| 柜次成本 `sku_costs.container_lot_id`（saveCost / 测算工作台） | 左侧菜单结构调整 |
| Console `/console/ocean-containers` 列表/详情 + 库存桶 | Dashboard 其它 KPI |
| seed `db:seed:commerce-ocean` | 采购入库港重写（复用 m2，不重做） |

## 架构

```
console/ocean-containers | inventory-balances | cost-calculator-workbench
  → trpc.ocean.*（React Query）
  → /api/trpc
  → routers/ocean（tenantProcedure）
  → dataaccess/ocean (+ mappers/ocean)
  → Drizzle → ocean_* / inventory_* / sku_costs
```

`ocean-container-store` 主路径已停用（类型/常量保留）。

## 状态机与库存桶

```text
draft → booked → departed → arrived → customs → received
                      │         │         │          │
                      │         │         │          └─ customs_clearing↓  on_hand↑ / damaged↑
                      │         │         └─ in_transit↓  customs_clearing↑
                      │         └─ 审计流水（在途桶不变）
                      └─ in_transit↑（不写 on_hand）
```

兼容旧原型值：`in_transit`≈departed、`customs_clearing`≈customs、`received_local`≈received。

| 库存桶 | 列 | 计入 available？ |
| --- | --- | --- |
| 在途 | `inventory_balances.in_transit` | 否 |
| 清关中 | `customs_clearing` | 否 |
| 本地可用 | `on_hand - reserved - qc_hold - damaged` | 是 |
| 残次 | `damaged` | 否 |

目的仓默认 `WH-LK-CMB-001`，staging 库位 `STAGING`（不共享 `WH-CN-XMN`）。

## 幂等键（`ledger:ocean_*`）

| 阶段 | movement_type | idempotency_key |
| --- | --- | --- |
| 开船 | `ocean_depart` | `ledger:ocean_depart:{shipmentId}:{lineId}` |
| 到港 | `ocean_arrive` | `ledger:ocean_arrive:{shipmentId}:{lineId}` |
| 清关 | `ocean_customs` | `ledger:ocean_customs:{shipmentId}:{lineId}` |
| 到仓 | `ocean_receive` | `ledger:ocean_receive:{shipmentId}:{lineId}` |

同 org 下唯一索引短路；重复推进不双记账。

## 迁移与种子

迁移：`packages/db/drizzle/0014_commerce_ocean_intransit.sql`

- 创建 `ocean_shipments` / `ocean_shipment_lines` / `ocean_shipment_boxes`（历史 schema-only）
- 补齐 `inventory_balances` 在途/清关等列（IF NOT EXISTS）
- 确保 `sku_costs` 存在（柜次成本）

```bash
docker compose up -d
pnpm --filter @workspace/db db:migrate
pnpm --filter @workspace/db db:seed:commerce-products
pnpm --filter @workspace/db db:seed:commerce-ocean
# SHOP_DEV_ORGANIZATION_ID=org_shop_dev_demo
pnpm --filter shop dev
```

## tRPC 过程（`ocean`）

`list` / `stats` / `meta` / `get` / `create` / `update` / `upsertLine` / `removeLine` / `upsertBox` / `removeBox` / `advance` / `cancel` / `saveCost` / `inventoryBuckets` / `uiStatuses`

## 关键文件

| 文件 | 说明 |
| --- | --- |
| `apps/shop/src/lib/server/routers/ocean.ts` | tRPC API |
| `apps/shop/src/lib/server/dataaccess/ocean.ts` | DB 读写与事务 |
| `apps/shop/src/lib/server/mappers/ocean.ts` | 中文状态映射 |
| `packages/db/drizzle/0014_commerce_ocean_intransit.sql` | 迁移 |
| `packages/db/src/scripts/seed-commerce-ocean.ts` | 演示种子 |
| `apps/shop/src/lib/crossborder/ocean-container-store.ts` | 主路径停用；类型保留 |

## 本 PR 不做

合并售后 #43、真实船司 API、改左侧菜单、重写采购入库（m2）。
