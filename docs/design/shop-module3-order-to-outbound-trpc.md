# 模块3：订单同步 → 占库/拣货 → 出库（tRPC → DB）

> 状态：已在 `apps/shop` 落地生产路径。分支 `feat/shop-trpc-order-to-outbound`。

## 范围

| 已接 PostgreSQL | 仍 mock / localStorage |
| --- | --- |
| 订单列表 / 详情 / 状态 | 真实平台 OpenAPI（当前 stub 适配器） |
| 人工增量同步 / 导入幂等 upsert | LGS / JSB 履约事件推送 |
| 确认占库 / 释放占库（inventory_reservations + movements） | 费用模板 |
| 从订单创建出库单、拣货推进、出库过账 | WMS 非订单出库（调拨/盘亏手工入口） |
| Console 订单 / 拣货 / 出库页改 tRPC | 映射异常专页、库存流水页仍可混用旧 store |
| 中文 UI ↔ DB 状态映射 | Dashboard 其它 KPI |

## Q07 / C12 默认（PR 写明）

| 项 | 默认 | 覆盖 |
| --- | --- | --- |
| 锁定节点 | `paid` / `ready_to_ship` **自动占库** + **人工补锁** | `ORDER_RESERVE_MODE=manual_only` |
| 扣减节点 | **出库过账**（`order_ship`） | `ORDER_DEDUCT_NODE` 仅文档占位，本迭代固定 outbound_post |
| 映射异常 | 阻断占库 | — |
| 取消 | 释放占库写 `order_release` | 30 分钟超时兜底本迭代未做 job |

## 架构

```
console/orders | picking | stock-outbounds
  → trpc.order.*（React Query）
  → /api/trpc
  → routers/order（tenantProcedure）
  → dataaccess/order
  → Drizzle → orders / order_lines / inventory_* / stock_outbounds*
```

主路径：stub/import 同步 upsert →（自动或人工）占库 → 创建出库单 → 待拣货→拣货中→已复核→出库过账扣减。

## 迁移与种子

```bash
docker compose up -d
pnpm --filter @workspace/db db:migrate
pnpm --filter @workspace/db db:seed:commerce-products
pnpm --filter @workspace/db db:seed:commerce-orders
# 可选采购演示
pnpm --filter @workspace/db db:seed:commerce-purchase
pnpm --filter shop dev
```

环境变量：

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/studio
SHOP_DEV_ORGANIZATION_ID=org_shop_dev_demo
# 可选
ORDER_RESERVE_MODE=auto_on_paid   # 或 manual_only
```

迁移 `0010_commerce_order_to_outbound.sql` 新增：

- `stock_outbounds` / `stock_outbound_lines`
- 应用层扩展流水类型：`order_reserve` / `order_release` / `order_ship`

## 关键文件

| 文件 | 说明 |
| --- | --- |
| `apps/shop/src/lib/server/routers/order.ts` | tRPC API |
| `apps/shop/src/lib/server/dataaccess/order.ts` | DB 读写与事务 |
| `apps/shop/src/lib/server/mappers/order.ts` | 中文状态映射 |
| `packages/db/drizzle/0010_commerce_order_to_outbound.sql` | 迁移 |
| `packages/db/src/scripts/seed-commerce-orders.ts` | 店铺/映射/余额种子 |

## 本 PR 不做

LGS/费用模板、真实平台 connector、非订单出库入口、占库超时 job、售后回库。
