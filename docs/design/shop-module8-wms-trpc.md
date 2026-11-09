# 模块8：WMS 库存余额 / 台账 / 非订单出库 / 库存预警（tRPC → DB）

> 状态：已在 `apps/shop` 落地生产路径。分支 `feat/shop-trpc-wms-inventory`。
> 对齐：PR#28 仓存 UED；`haoshiyun-erp-ued-catalog.md` §5；余额公式与 m7 在途列兼容。
> 2026-11-08：重排编号章节并补 §3.5 库存预警（代码 `@see … §3.5` 指向处）；迁移引用同步为重生成后编号。

## 1. 范围

| 已接 PostgreSQL | 仍 mock / stub |
| --- | --- |
| `commerce_warehouses` / `commerce_bins` 列表+CRUD | 订单出库（仍 `order.*` / 模块3） |
| `inventory_balances` 分页（含 in_transit/customs/damaged） | 左侧菜单结构调整 |
| `inventory_movements` 台账分页+幂等键 | 真实 RF 拣货枪 / 波次 |
| 非订单出库 create→推进→过账（`ledger:wms_outbound:*`） | — |
| `stock_adjustments` 审批/过账写 `stock_adjust` 流水 | — |
| 库位绑定 `commerce_bin_bindings` + 履历 `bin_binding_history`（`wms.listBinBindings`） | — |
| `inventory_pools` 查询/CRUD/店铺分配（`wms.*InventoryPool*`） | 独立库存池管理页 |
| **库存预警 `stock_alerts`（阈值/静音/重算，见 §3.5）**：设置页 `/console/settings/stock-alerts` + `/console/inventory` 预警列表（`wms.listInventoryAlerts`） | — |
| seed `db:seed:commerce-wms`（库区/绑定/库存池） | — |
| 库区页 → 见 module9（`commerce_warehouse_zones`） | — |

## 2. 架构

```
console/warehouse | inventory-balances | inventory-ledger | stock-outbounds | stock-adjustments | settings/stock-alerts
  → trpc.wms.* / trpc.stockAlerts.*（React Query）
  → /api/trpc
  → routers/{wms,stockAlerts}（tenantProcedure）
  → dataaccess/{wms,stock-alerts} (+ mappers/wms)
  → Drizzle → commerce_* / inventory_* / stock_outbounds / stock_adjustments / stock_alerts
```

`wms-store` 主路径已停用（类型/常量保留，便于旧详情页兼容）。

## 3. 库存模型

### 3.1 可用量与库存桶

```text
available = on_hand - reserved - qc_hold - damaged
在途 in_transit / 清关 customs_clearing / 待入 pending_inbound 不计入 available
```

非订单出库过账：**只减 on_hand**（盘亏报损可减 damaged），**绝不**改 `reserved`、不写 `inventory_reservations`。

### 3.2 库位绑定与库存池

- `commerce_bin_bindings` 保存当前绑定态（`active`/`released`/`disabled`），partial unique index 保证一个库位仅一条 `active`；`bin_binding_history` 追加记录 `bind`/`unbind`/`disable`/`correct`，不可物理删除。
- `commerce_bins.bound_sku` 保留为冗余缓存，由绑定事务同步维护；旧数据不回填，首次换绑/解绑时补履历。
- 换绑/解绑要求该库位库存为 0；解绑与停用必须填写原因；停用时不可同时换绑或解绑。
- `inventory_pools` 以 `organization_id + code` 唯一，`shops.inventory_pool_id` 指向默认池；池不改变库存事实（仍按 warehouse + bin + SKU）。

### 3.3 幂等键

| 动作 | movement_type | idempotency_key |
| --- | --- | --- |
| 非订单出库过账 | `wms_outbound` | `ledger:wms_outbound:{outboundId}:{lineId}` |
| 调整过账 | `stock_adjust` | `ledger:stock_adjust:{adjustmentId}:{lineId}` |

同 org 下 `inventory_movements` 唯一索引短路；重复过账不双记账。

### 3.4 迁移与种子

迁移（2026-11-08 重生成后）：`packages/db/drizzle/0000_flashy_silver_samurai.sql`（`commerce_warehouses` / `commerce_bins` / `stock_adjustments` / `stock_alerts` 等基表）+ `0002_glamorous_bruce_banner.sql`（`commerce_warehouse_zones` / `commerce_bin_bindings` / `bin_binding_history` / `inventory_pools` 等，历史编号 0009/0015）。

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

### 3.5 库存预警（`stock_alerts`）

> 本节是代码 `@see docs/design/shop-module8-wms-trpc.md §3.5` 的指向处（`dataaccess/stock-alerts.ts`、`dataaccess/wms.ts` `listInventoryAlerts`）。

**模型**（`stock_alerts`，基表在 `0000`）：按 `(organization_id, variant_id)` 维护一行；可选 `shop_id` / `warehouse_code`；`threshold` 为用户覆盖值（`integer`，缺省回退 `DEFAULT_STOCK_THRESHOLD = 20`）；`status` ∈ `critical | open | muted | resolved`；`triggered_at` 记录首次触发时间。

**重算（`recomputeStockAlert` / `recomputeStockAlerts`）**：

- 任何写 `inventory_balances`（on_hand / reserved / qc_hold / damaged）的事务，在**同一事务内**对受影响 variant 调用重算，保证预警与余额强一致。调用方：`wms`（出库/调整过账）、`order`（占库/出库/取消释放）、`aftersale`（取消释放/回库/报损）、`purchase`（上架）。
- 派生规则：`available ≤ 0` → `critical`；`0 < available < threshold` → `open`；否则 `resolved`。库龄阈值 `STOCK_AGE_DAYS_THRESHOLD = 60` 天单独计入 `aged` 计数与 `open` 告警（列表口径）。
- **`muted` 为用户手动忽略**：重算不改 `muted` 行的 status，只刷新 `triggered_at` 留痕，等用户手动解除。
- 幂等：同 variant 重复调用只覆盖 status / triggered_at / threshold（保留用户覆盖）。

**读路径**：

- `/console/inventory` 预警列表：`wms.listInventoryAlerts`（`listInventoryAlerts`）——按 variant GROUP BY 的 SQL 聚合（available / ageDays / alert）+ LEFT JOIN `stock_alerts` 取阈值与 muted；关键词、告警过滤、排序、分页全部下推 SQL，Node 只持有当前页。
- 设置页 `/console/settings/stock-alerts`（侧栏 `settings.stockAlerts`）：`trpc.stockAlerts.list / get / upsert / setMuted / delete / meta`——阈值维护、静音/解除、删除重算行（删除后下次重算按缺省阈值重建）。

## 4. tRPC 过程

### `wms`

仓库/库位：`listWarehouses` / `warehouseStats` / `getWarehouse` / `createWarehouse` / `updateWarehouse` / `listBins` / `createBin` / `updateBin` / `meta`

余额/台账：`listBalances` / `balanceStats` / `getBalance` / `listMovements` / `movementStats` / `getMovement` / `listInventoryAlerts` / `getInventoryAlertBySku`

非订单出库：`listOutbounds` / `outboundStats` / `getOutbound` / `createOutbound` / `advanceOutbound` / `postOutbound` / `cancelOutbound`

调整：`listAdjustments` / `adjustmentStats` / `getAdjustment` / `createAdjustment` / `approveAdjustment` / `rejectAdjustment` / `postAdjustment`

库区（module9 并入）：`listZones` / `zoneStats` / `createZone` / …

### `stockAlerts`

`list` / `get` / `upsert` / `setMuted` / `delete` / `meta`（见 §3.5）

## 5. 关键文件

| 文件 | 说明 |
| --- | --- |
| `apps/shop/src/lib/server/routers/wms.ts` | tRPC API（含 `listInventoryAlerts`） |
| `apps/shop/src/lib/server/routers/stock-alerts.ts` | 库存预警 tRPC API |
| `apps/shop/src/lib/server/dataaccess/wms.ts` | DB 读写与事务（`listInventoryAlerts` @see §3.5） |
| `apps/shop/src/lib/server/dataaccess/stock-alerts.ts` | 预警重算与维护（@see §3.5） |
| `apps/shop/src/lib/server/mappers/wms.ts` | 中文状态映射 |
| `packages/db/drizzle/0000_flashy_silver_samurai.sql` | 基表（含 `stock_alerts`） |
| `packages/db/drizzle/0002_glamorous_bruce_banner.sql` | 库区/绑定/库存池（历史 0009/0015 并入） |
| `packages/db/src/scripts/seed-commerce-wms.ts` | 演示种子 |
| `apps/shop/src/lib/crossborder/wms-store.ts` | 主路径停用；类型保留 |

## 6. 本 PR 不做（边界）

合并售后 #43、海运 #44；改左侧菜单；重做订单出库（m3）；独立库存池管理页；真实 RF 拣货枪 / 波次。

> 库区页接库与 typecheck 稳定见 [shop-module9-zones-stabilize.md](./shop-module9-zones-stabilize.md)。
