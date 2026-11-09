# 模块11：店铺平台映射与刊登主路径（tRPC → DB）

> 状态：已在 `apps/shop` 落地生产路径。分支 `feat/shop-trpc-listing-mapping`。
> 基线：`feat/shop-related-info-real-data`（PR #47 栈，含 #46/#45/#44）；**不依赖 / 不合并** 售后 #43。

## 范围

| 已接 PostgreSQL | 仍缺口 / 边界（非本模块） |
| --- | --- |
| `shops` 下拉（mappings/listings meta；`trpc.shops`） | 真实平台刊登 / 上下架 OpenAPI（`listings.requestPlatformSync` **stub**） |
| `seller_sku_mappings` 列表/详情/绑定/解绑/确认 | （已迁模块12）供应商货号 / 履约异常 |
| `mapping_exceptions` 列表 KPI + resolve/ignore（mappings 主路径） | — |
| `listings` 列表/详情/新建/编辑/本地上下架/加映射行 | — |
| seed `db:seed:commerce-listings`（依赖 products） | — |
| 内部 SKU 详情注入真实刊登+映射 related | — |

> 2026-11-08：`/console/sync-tasks`（模块13）、候选选品（模块14）、财务成本（模块13）、店铺连接（`trpc.shops`，`shop-connection-store` 已删）、Dashboard KPI 均已接库。

无新 migration（复用既有 `listings` / `seller_sku_mappings` / `mapping_exceptions` / `shops`，均在 `0000` 基线；2026-11-08 迁移重生成后编号为 `0000`/`0001`/`0002`）。

## 架构

```
console/mappings | listings
  → trpc.mappings.* / trpc.listings.*（React Query）
  → /api/trpc
  → routers/{mappings,listings}（tenantProcedure）
  → dataaccess/{mappings,listings} (+ mappers/listings)
  → Drizzle → shops / listings / seller_sku_mappings / mapping_exceptions
```

`mapping-store` **已删除**（2026-11-08）；`listing-store` 主路径已停用（仅余类型/助手，listings 页仍 import 其 helper）。

## 状态映射

| 域 | UI | DB |
| --- | --- | --- |
| 刊登 status | 草稿/待审/在售/失败/下架 | draft/pending_review/live/failed/offline |
| 刊登 publishState | 未发布/待同步/已发布/同步失败 | unpublished/pending_sync/published/sync_failed |
| 映射 status | 待确认/启用/异常/停用 | pending/active/exception/disabled |
| 异常 status | 开放/已修复/已忽略（阻断扣库=open+blocks） | open/resolved/ignored |
| 异常 reason | 未映射/冲突/停用 SKU/重复 Seller SKU | unmapped/conflict/disabled_variant/duplicate_seller_sku |

## 平台同步 stub

`listings.requestPlatformSync` **明确返回** `{ stub: true, ok: false, message }`，只把本地 `publishState` 置为「待同步」并写入说明性 `lastError`。**不要**把它当成已打通的 Daraz/Lazada/TikTok OpenAPI。

本地上下架：`listings.setShelf` 只改 `listings.status`（在售↔下架）。

## 本地环境

```bash
docker compose up -d
pnpm --filter @workspace/db db:migrate
pnpm --filter @workspace/db db:seed:commerce-products
pnpm --filter @workspace/db db:seed:commerce-listings
# SHOP_DEV_ORGANIZATION_ID=org_shop_dev_demo
pnpm --filter shop dev
```

## tRPC 过程

### `mappings`

`list` / `stats` / `meta` / `listShops` / `get` / `create` / `update` / `confirm` / `unbind`

异常：`listExceptions` / `exceptionStats` / `getException` / `resolveException` / `ignoreException`

### `listings`

`list` / `stats` / `meta` / `get` / `create` / `update` / `setShelf` / `addMappingLine` / `requestPlatformSync`（stub）

## 关键文件

| 文件 | 说明 |
| --- | --- |
| `apps/shop/src/lib/server/routers/listings.ts` | 刊登 tRPC |
| `apps/shop/src/lib/server/routers/mappings.ts` | 映射 / 异常 tRPC |
| `apps/shop/src/lib/server/dataaccess/listings.ts` | 刊登 DB |
| `apps/shop/src/lib/server/dataaccess/mappings.ts` | 映射 / 异常 DB |
| `apps/shop/src/lib/server/mappers/listings.ts` | 中文状态映射 |
| `packages/db/src/scripts/seed-commerce-listings.ts` | 演示种子 |
| `apps/shop/src/lib/crossborder/listing-store.ts` | 主路径停用；类型保留 |
| `apps/shop/src/lib/crossborder/mapping-store.ts` | **已删除**（2026-11-08） |
| `docs/design/shop-module11-listing-mapping-trpc.md` | 本文档 |

## 本 PR 不做

合并售后 #43；真实平台 OpenAPI；供应商门户 / `supplier-skus` 新表；改左侧菜单；财务成本 / 候选选品接库。
