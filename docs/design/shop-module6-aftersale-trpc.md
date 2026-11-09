# 模块6：售后（取消释放占库 / 退货收货质检回库报损）

> 状态：已在 `apps/shop` 落地生产路径。分支 `feat/shop-trpc-aftersale-restock`。

## 范围

| 已接 PostgreSQL | 仍缺口 / 边界（非本模块） |
| --- | --- |
| `reverse_orders` / `reverse_order_items` / `reverse_qc_records` / `reverse_order_events` / `refunds` / `return_shipments`（基表 `0000`；决策列/策略表在 `0002_glamorous_bruce_banner`，历史编号 0008/0011） | 真实平台售后 OpenAPI |
| tRPC `aftersale` 列表/详情/stats + upsert/syncStub + 取消审核 + 退货收货/质检过账 | 已发货订单取消的出库冲销 |
| Console `/console/aftersales`、`aftersale-returns`、`aftersale-cancels`（含 `[id]`） | 费用模板 / ocean / 左侧菜单 |
| 库存流水 `order_release` / `aftersale_restock` / `aftersale_scrap`（应用层类型；幂等键） | Seller SKU 映射专页等 |
| Seed `db:seed:commerce-aftersales` | — |

## 架构

```
console/aftersales | aftersale-returns | aftersale-cancels
  → trpc.aftersale.*（React Query）
  → /api/trpc
  → routers/aftersale（tenantProcedure）
  → dataaccess/aftersale (+ mappers/aftersale)
  → Drizzle → reverse_* / refunds / return_shipments
             + inventory_balances / inventory_movements / inventory_reservations
```

`aftersale-store` 主路径已停用（保留类型 / `RETURN_STATUSES` / `CANCEL_STATUSES` / `toRelated*Shape`）。

## 表使用（无新迁移）

表已在 `0000` 基线存在（历史编号 0008）。本迭代仅扩展应用层 `inventoryMovementTypes`：`aftersale_restock` / `aftersale_scrap`（`movement_type` 为自由 varchar，无需 DB 迁移）。

| 表 | 用途 |
| --- | --- |
| `reverse_orders` | 售后主单；UI 状态/仓库/库位/数量等放 `raw` |
| `reverse_order_items` | 行；幂等 `(shopId, externalReverseLineId)` |
| `return_shipments` | 退货包裹；`receivedAt` / `status` |
| `reverse_qc_records` | 质检结论 |
| `reverse_order_events` | 事件时间线 |
| `refunds` | 退款状态（可选更新） |
| `inventory_reservations` | 取消释放目标 |
| `inventory_movements` | `order_release` / `aftersale_restock` / `aftersale_scrap` |
| `inventory_balances` | 仅经流水投影更新（禁止静默改余额） |

## 业务规则（Q08 / Q18）

| 项 | 默认 |
| --- | --- |
| 取消批准（现行） | 对关联订单 **未发货** active 占库写 `order_release`；幂等键 `ledger:aftersale_cancel_release:{externalReverseId}:{orderLineId}`。目标行为改为建档即按策略释放，退款分开，见 [aftersale-cancel-ingest-and-policy.md](aftersale-cancel-ingest-and-policy.md) |
| 已出库取消 | **本迭代不做**冲销出库（可 stub 状态，不写负向 `order_ship`） |
| 退货收货 | 更新 `return_shipments.receivedAt`；**不**增加可用库存 |
| 质检过账 | 合格 → `aftersale_restock`（`on_hand`↑，可用随之↑）；残次 → `aftersale_scrap`（`damaged`↑，不进可用） |
| 部分回库 | 允许（合格+残次=实收） |
| 流水幂等 | 沿用 `inventory_movements (organization_id, idempotency_key)` |
| 开发租户 | `SHOP_DEV_ORGANIZATION_ID=org_shop_dev_demo` |

## tRPC 过程

| 过程 | 说明 |
| --- | --- |
| `list` / `stats` / `get` / `meta` | 售后工单 |
| `listReturns` / `returnStats` / `getReturn` | 退货行视图 |
| `listCancels` / `cancelStats` / `getCancel` | 取消单视图 |
| `upsert` | `(shopId, externalReverseOrderId)` 幂等 |
| `syncStub` | 平台 OpenAPI stub 写入演示逆向单 |
| `createTicket` / `createCancel` | Console 登记 |
| `registerReceive` | 登记退货收货 |
| `completeQc` | 质检过账（回库/报损流水） |
| `approveCancel` / `rejectCancel` | 取消审核 |
| `updateRefundStatus` | 退款状态 |

## Console 路由

| 路由 | 说明 |
| --- | --- |
| `/console/aftersales` | 售后总览 |
| `/console/aftersales/[id]` | 售后详情 |
| `/console/aftersale-returns` | 退货收货与质检 |
| `/console/aftersale-returns/[id]` | 退货详情 + 质检过账 |
| `/console/aftersale-cancels` | 取消与退款 |
| `/console/aftersale-cancels/[id]` | 取消详情 + 审核 |

## 迁移与种子

```bash
docker compose up -d
pnpm --filter @workspace/db db:migrate
pnpm --filter @workspace/db db:seed:commerce-products
pnpm --filter @workspace/db db:seed:commerce-orders
pnpm --filter @workspace/db db:seed:commerce-aftersales
# SHOP_DEV_ORGANIZATION_ID=org_shop_dev_demo
pnpm --filter shop dev
```

种子含：`AS-C-SEED-01` 取消待审（含 active 占库）、`AS-R-SEED-01` 退货待质检、`AS-R-SEED-02` 已回库（含 `aftersale_restock` 流水）。

## 关键文件

| 层 | 路径 |
| --- | --- |
| tRPC | `apps/shop/src/lib/server/routers/aftersale.ts` |
| dataaccess | `apps/shop/src/lib/server/dataaccess/aftersale.ts` |
| mappers | `apps/shop/src/lib/server/mappers/aftersale.ts` |
| seed | `packages/db/src/scripts/seed-commerce-aftersales.ts` |
| 对照 | `apps/shop/src/lib/server/dataaccess/order.ts`（释放占库） |
| 原型（停用） | `apps/shop/src/lib/crossborder/aftersale-store.ts` |
