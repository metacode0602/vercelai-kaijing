# 模块12：供应商 SKU 主数据 + 订单履约异常（tRPC → DB）

> 状态：已在 `apps/shop` 落地生产路径。分支 `feat/shop-trpc-supplier-order-exceptions`。
> 基线：`feat/shop-trpc-listing-mapping`（PR #48 栈，含 #44–#48）；**不依赖 / 不合并** 售后 #43。

## 范围

| 已接 PostgreSQL | 仍缺口 / 边界（非本模块） |
| --- | --- |
| `commerce_suppliers` 列表/详情/CRUD | 供应商门户 / 对账门户 |
| `supplier_skus` 列表/详情/CRUD、首选、参考价 | 调价履历独立表（现就地更新+生效日） |
| 采购申请/PO 可选 `supplier_id` / `supplier_sku_id` | 采购申请 UI 自动填价（API `preferredForSku` 已就绪） |
| `order_exception_cases` 规则扫描+处理+审计 | — |
| seed `db:seed:commerce-suppliers`（复用既有 Daraz LK 店铺） | — |
| `/console/supplier-skus` `/console/suppliers` `/console/order-exceptions` | — |

> 2026-11-08：`/console/sync-tasks`（模块13）、候选选品/财务成本（模块13/14）、Dashboard KPI、店铺 OAuth（`trpc.shops`）均已接库。

映射异常（`mapping_exceptions`）仍在 `trpc.mappings.*`；本页不再塞假异常列表。

## 架构

```
console/suppliers | supplier-skus
  → trpc.suppliers.* → dataaccess/suppliers → commerce_suppliers / supplier_skus

console/order-exceptions
  → trpc.orderExceptions.* → dataaccess/order-exceptions
  → order_exception_cases + audit_events
  ← 扫描源：orders / mapping_exceptions / inventory_reservations /
            stock_outbounds / fulfillment_attempts
```

`supplier-store` / `supplier-sku-store` / `mapping-exception-store` **已删除**（2026-11-08）。

## 异常规则

| UI | DB kind | 来源 |
| --- | --- | --- |
| 超时未发货 | timeout_unshipped | 已支付 >48h 且无有效发货 |
| 占库失败 | reservation_failed | 开放 mapping_exception 或已支付行无 active 预留 |
| 拣货异常 | picking_exception | 订单出库 picking/cancelled 且 reason 含异常语义 |
| 同步失败 | sync_failed | fulfillment_attempts result=failed/error |

处理：`start` / `resolve` / `ignore` → 写 `audit_events`（entity_type=`order_exception_case`）。已结案案件扫描时跳过（只刷新 last_scanned_at）。

## 迁移与种子

迁移：`packages/db/drizzle/0000_flashy_silver_samurai.sql`（`commerce_suppliers` / `supplier_skus` / `order_exception_cases` 基表；历史编号 `0016_commerce_supplier_order_exceptions`，2026-11-08 重生成并入）

- `commerce_suppliers` / `supplier_skus` / `order_exception_cases`
- `purchase_requests.supplier_id`、`purchase_request_lines.supplier_sku_id`
- `purchase_orders.supplier_id`、`purchase_order_lines.supplier_sku(_id)`

```bash
docker compose up -d
pnpm --filter @workspace/db db:migrate
pnpm --filter @workspace/db db:seed:commerce-products
pnpm --filter @workspace/db db:seed:commerce-orders   # 可选
pnpm --filter @workspace/db db:seed:commerce-suppliers
# SHOP_DEV_ORGANIZATION_ID=org_shop_dev_demo
pnpm --filter shop dev
```

## tRPC

### `suppliers`

`list` / `stats` / `meta` / `get` / `create` / `update`

货号：`listSkus` / `skuStats` / `getSku` / `createSku` / `updateSku` / `preferredForSku` / `linkPurchaseRequest`

### `orderExceptions`

`list` / `stats` / `meta` / `get` / `scan` / `start` / `resolve` / `ignore`

## 关键文件

| 文件 | 说明 |
| --- | --- |
| `apps/shop/src/lib/server/routers/suppliers.ts` | 供应商 tRPC |
| `apps/shop/src/lib/server/routers/order-exceptions.ts` | 履约异常 tRPC |
| `apps/shop/src/lib/server/dataaccess/suppliers.ts` | 供应商 DB |
| `apps/shop/src/lib/server/dataaccess/order-exceptions.ts` | 异常扫描/处理 |
| `apps/shop/src/lib/server/mappers/suppliers.ts` | 中文状态 |
| `apps/shop/src/lib/server/mappers/order-exceptions.ts` | 异常中文映射 |
| `packages/db/drizzle/0000_flashy_silver_samurai.sql` | 迁移（历史 0016 并入） |
| `packages/db/src/scripts/seed-commerce-suppliers.ts` | 演示种子 |
| `docs/design/shop-module12-supplier-order-exceptions-trpc.md` | 本文档 |

## 本 PR 不做

合并售后 #43 / #44–#48；真实平台 OpenAPI；sync-tasks 接库；财务成本 / 候选选品；改左侧菜单。
