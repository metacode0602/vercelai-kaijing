# 模块2：采购申请 → 审批转 PO → 分批到货 → 质检 → 入库上架（tRPC → DB）

> 状态：已在 `apps/shop` 落地生产路径。分支 `feat/shop-trpc-purchase-to-inbound`。

## 范围

| 已接 PostgreSQL | 仍 mock / localStorage |
| --- | --- |
| 采购申请 CRUD / 提交 / 撤回 / 取消 | 订单出库 |
| 审批通过转 PO / 驳回 | WMS 非采购入库（盘盈/调拨等手工入口） |
| 采购单详情（只读，由审批生成） | LGS / 海柜 / 费用模板 |
| 登记到货、质检、生成待上架入库单 | 供应商主数据（当前为展示字符串） |
| 确认上架写 `inventory_balances` + `inventory_movements`（幂等键） | 字典 / 成员下拉 |
| 控制台采购侧栏对应列表与详情页 | Dashboard 其它 KPI 仍 mock |

状态映射：中文 UI ↔ DB varchar（见 `apps/shop/src/lib/server/mappers/purchase.ts`）。

## 架构

```
console/purchase-* | stock-inbounds
  → trpc.purchase.*（React Query）
  → /api/trpc
  → routers/purchase（tenantProcedure）
  → dataaccess/purchase
  → Drizzle → purchase_* / stock_inbounds / inventory_*
```

主路径：申请草稿 → 提交待审 → 通过转 PO（status=`sent`）→ 登记到货（收货 `qc_pending`）→ 质检生成入库（`pending_shelve`）→ 确认上架写库存流水。

## 迁移与种子

1. 根目录 `.env`：

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/studio
SHOP_DEV_ORGANIZATION_ID=org_shop_dev_demo
```

2. 迁移 + 种子：

```bash
docker compose up -d
pnpm --filter @workspace/db db:migrate
# 先商品，再采购演示申请
pnpm --filter @workspace/db db:seed:commerce-products
pnpm --filter @workspace/db db:seed:commerce-purchase
pnpm --filter shop dev
```

迁移 `0009_commerce_purchase_to_inbound.sql` 新增：

- `purchase_requests` / `purchase_request_lines`
- `purchase_orders` / `purchase_order_lines`
- `purchase_receipts` / `purchase_receipt_lines`
- `stock_inbounds`
- `inventory_movements.idempotency_key` + 组织内唯一索引（确认上架幂等）
- 扩展 `inventory_movement_types`：`purchase_stock_in`、`qc_fail_damage`

## 关键文件

| 文件 | 说明 |
| --- | --- |
| `apps/shop/src/lib/server/routers/purchase.ts` | tRPC API |
| `apps/shop/src/lib/server/dataaccess/purchase.ts` | DB 读写与事务 |
| `apps/shop/src/lib/server/mappers/purchase.ts` | 中文状态映射 |
| `apps/shop/src/lib/crossborder/purchase-*-store.ts` | 仅类型 / BIN_OPTIONS；localStorage 已停用 |
| `packages/db/drizzle/0009_commerce_purchase_to_inbound.sql` | 迁移 |
| `packages/db/src/scripts/seed-commerce-purchase.ts` | 演示种子 |

## 本 PR 不做

订单同步出库、LGS、费用模板、供应商实体化、WMS 非采购入库入口。
