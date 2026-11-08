# 模块1：商品 SPU + 内部 SKU（tRPC → DB）

> 状态：已在 `apps/shop` 落地生产路径（非 CloudAgent）。分支建议 `feat/shop-trpc-master-spu-sku`。

## 范围

| 已接 PostgreSQL | 仍缺口 / 边界（非本模块） |
| --- | --- |
| SPU 列表 / 详情 / 新建 / 编辑 | 真实平台 OpenAPI |
| 内部 SKU 列表 / 详情 / 新建 / 编辑 | — |
| `products.stats` KPI；字典 / 品类 / 成员下拉（`trpc.dictionaries/categories/members`） | — |
| 组织隔离（session → membership → `SHOP_DEV_ORGANIZATION_ID`） | — |

> 2026-11-08：Seller SKU / 刊登映射见模块11–12；采购/订单/WMS/LGS/费用模板见模块2–8，均已接库；原右列「仍 mock」项已清。

状态映射：UI `待确认/启用/停用` ↔ DB `draft/active/disabled`。

## 架构

```
console/master-products|master-skus
  → trpc.products.*（React Query）
  → /api/trpc
  → routers/products（tenantProcedure）
  → dataaccess/products
  → Drizzle → products / product_variants
```

编码规则：SPU `HSY` + 6 位流水；SKU = SPU + 3 位流水（同 SPU 下递增）。

## 本地环境

1. 根目录 `.env`：

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/studio
SHOP_DEV_ORGANIZATION_ID=org_shop_dev_demo
```

注意：`docker compose` 中 `POSTGRES_PASSWORD=postgres`。若沿用旧示例 `password` 会连不上。

2. 启动库并迁移：

```bash
docker compose up -d
pnpm --filter @workspace/db db:migrate
pnpm --filter @workspace/db db:seed:commerce-products
pnpm --filter shop dev
```

3. 打开控制台「主数据 → 商品 SPU / 内部 SKU」。开发态可不登录（依赖 `SHOP_DEV_ORGANIZATION_ID`）；生产应走登录会话的 `activeOrganizationId` / membership。

## 关键文件

| 文件 | 说明 |
| --- | --- |
| `apps/shop/src/app/api/trpc/[trpc]/route.ts` | tRPC HTTP 入口 |
| `apps/shop/src/lib/server/context.ts` | 会话与组织解析 |
| `apps/shop/src/lib/server/trpc.ts` | `tenantProcedure` |
| `apps/shop/src/lib/server/routers/products.ts` | CRUD API |
| `apps/shop/src/lib/server/dataaccess/products.ts` | DB 读写 |
| `apps/shop/src/lib/server/mappers/products.ts` | 状态/图片映射 |
| `apps/shop/src/lib/crossborder/product-store.ts` | **已删除**（2026-11-08，17 个死 store 清理之一） |
| `packages/db/src/scripts/seed-commerce-products.ts` | 演示种子 |
| `packages/db/src/commerce-schema.ts` | `products` / `product_variants` |

## 后续模块（本 PR 不做）

（已完成）采购申请→入库、订单同步→出库、LGS、费用等均已按模块2–8 接库；`mock-data.ts` 等 17 个死 store 已于 2026-11-08 删除。
