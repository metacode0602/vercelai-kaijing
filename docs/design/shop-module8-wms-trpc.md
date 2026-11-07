# 模块8：WMS 库存余额 / 台账 / 非订单出库（tRPC → DB）

> 状态：已在 `apps/shop` 落地生产路径。分支 `feat/shop-trpc-wms-inventory`。
> 对齐：PR#28 仓存 UED；`haoshiyun-erp-ued-catalog.md` §5；余额公式与 m7 在途列兼容。

## 范围

| 已接 PostgreSQL | 仍 mock / stub |
| --- | --- |
| `commerce_warehouses` / `commerce_bins` 列表+CRUD | 库存预警阈值策略 UI |
| `inventory_balances` 分页（含 in_transit/customs/damaged） | 订单出库（仍 `order.*` / 模块3） |
| `inventory_movements` 台账分页+幂等键 | 左侧菜单结构调整 |
| 非订单出库 create→推进→过账（`ledger:wms_outbound:*`） | 真实 RF 拣货枪 / 波次 |
| `stock_adjustments` 审批/过账写 `stock_adjust` 流水 | — |
| 库位绑定 `commerce_bin_bindings` + 履历 `bin_binding_history`（`wms.listBinBindings`） | — |
| `inventory_pools` 查询/CRUD/店铺分配（`wms.*InventoryPool*`） | 独立库存池管理页 |
| seed `db:seed:commerce-wms`（库区/绑定/库存池） | — |
| 库区页 → 见 module9（`commerce_warehouse_zones`，0009） | — |

## 架构

```
console/warehouse | inventory-balances | inventory-ledger | stock-outbounds | stock-adjustments
  → trpc.wms.*（React Query）
  → /api/trpc
  → routers/wms（tenantProcedure）
  → dataaccess/wms (+ mappers/wms)
  → Drizzle → commerce_* / inventory_* / stock_outbounds / stock_adjustments
```

`wms-store` 主路径已停用（类型/常量保留，便于旧详情页兼容）。

## 可用量与库存桶

```text
available = on_hand - reserved - qc_hold - damaged
在途 in_transit / 清关 customs_clearing / 待入 pending_inbound 不计入 available
```

非订单出库过账：**只减 on_hand**（盘亏报损可减 damaged），**绝不**改 `reserved`、不写 `inventory_reservations`。

## 库位绑定与库存池（0009）

- `commerce_bin_bindings` 保存当前绑定态（`active`/`released`/`disabled`），partial unique index 保证一个库位仅一条 `active`；`bin_binding_history` 追加记录 `bind`/`unbind`/`disable`/`correct`，不可物理删除。
- `commerce_bins.bound_sku` 保留为冗余缓存，由绑定事务同步维护；旧数据不回填，首次换绑/解绑时补履历。
- 换绑/解绑要求该库位库存为 0；解绑与停用必须填写原因；停用时不可同时换绑或解绑。
- `inventory_pools` 以 `organization_id + code` 唯一，`shops.inventory_pool_id` 指向默认池；池不改变库存事实（仍按 warehouse + bin + SKU）。

## 幂等键

| 动作 | movement_type | idempotency_key |
| --- | --- | --- |
| 非订单出库过账 | `wms_outbound` | `ledger:wms_outbound:{outboundId}:{lineId}` |
| 调整过账 | `stock_adjust` | `ledger:stock_adjust:{adjustmentId}:{lineId}` |

同 org 下 `inventory_movements` 唯一索引短路；重复过账不双记账。

## 迁移与种子

迁移：`packages/db/drizzle/0015_commerce_wms_outbound.sql`（避开 #44 的 0014）

- `commerce_warehouses` / `commerce_bins`
- `stock_adjustments` / `stock_adjustment_lines`
- 复用既有 `stock_outbounds`（outbound_type ≠ order）与 `inventory_*`

```bash
docker compose up -d
pnpm --filter @workspace/db db:migrate
pnpm --filter @workspace/db db:seed:commerce-products
pnpm --filter @workspace/db db:seed:commerce-wms
# SHOP_DEV_ORGANIZATION_ID=org_shop_dev_demo
pnpm --filter shop dev
```

## tRPC 过程（`wms`）

仓库/库位：`listWarehouses` / `warehouseStats` / `getWarehouse` / `createWarehouse` / `updateWarehouse` / `listBins` / `createBin` / `updateBin` / `meta`

余额/台账：`listBalances` / `balanceStats` / `getBalance` / `listMovements` / `movementStats` / `getMovement`

非订单出库：`listOutbounds` / `outboundStats` / `getOutbound` / `createOutbound` / `advanceOutbound` / `postOutbound` / `cancelOutbound`

调整：`listAdjustments` / `adjustmentStats` / `getAdjustment` / `createAdjustment` / `approveAdjustment` / `rejectAdjustment` / `postAdjustment`

## 关键文件

| 文件 | 说明 |
| --- | --- |
| `apps/shop/src/lib/server/routers/wms.ts` | tRPC API |
| `apps/shop/src/lib/server/dataaccess/wms.ts` | DB 读写与事务 |
| `apps/shop/src/lib/server/mappers/wms.ts` | 中文状态映射 |
| `packages/db/drizzle/0015_commerce_wms_outbound.sql` | 迁移 |
| `packages/db/src/scripts/seed-commerce-wms.ts` | 演示种子 |
| `apps/shop/src/lib/crossborder/wms-store.ts` | 主路径停用；类型保留 |

## 本 PR 不做

合并售后 #43、海运 #44；改左侧菜单；重做订单出库（m3）；库区实体表。

> 库区页接库与 typecheck 稳定见 [shop-module9-zones-stabilize.md](./shop-module9-zones-stabilize.md)。
