# apps/shop — 租户端

面向**跨境卖家（租户）**的运营工作台：店铺连接、选品候选、待审队列、商品/刊登、订单、库存、到仓成本与财务粗览。

## 定位

| 项 | 说明 |
| --- | --- |
| 使用者 | 卖家 / 租户运营 |
| 作用 | 本组织跨境业务的数据查看与运营操作入口 |
| 技术栈 | Next.js 16 App Router、next-intl、`@workspace/ui`、better-auth |
| 当前阶段 | **模块1–16（商品 / 采购入库 / 订单占库→出库 / LGS·JSB / 费用模板 / 售后 / 海运在途 / WMS / 库区 / 关联信息 / 刊登映射 / 供应商与异常 / 财务同步 / 候选站内信 / 运营清理 / 演示收尾）已接 tRPC → dataaccess → PostgreSQL**；真实平台 OAuth·OpenAPI 联调仍为边界 |

## 主要路由

| 路径 | 功能 |
| --- | --- |
| `src/app/[locale]/(marketing)` | 对外营销页（暂保持现状） |
| `src/app/[locale]/(auth)` | 登录 / 注册 / 找回密码 / 验证码登录 |
| `src/app/[locale]/console` | 控制台主体 |
| ├ `dashboard` | 运营仪表盘 |
| ├ `candidates` | AI 选品候选 |
| ├ `pending` | 待审队列 |
| ├ `products` / `products/[sku]` | 商品与刊登 |
| ├ `orders` / `orders/[id]` | 多店订单 |
| ├ `inventory` / `inventory/[sku]` | 库存预警 |
| ├ `costs` / `costs/[sku]` | 到仓成本与计算器入口 |
| ├ `finance` / `finance/[platform]` | 财务粗览 |
| ├ `settings/*` | 店铺连接、成员、通知、偏好 |
| └ `profile/*` | 个人资料 |
| `src/app/[locale]/(crossborder)` | `/crossborder/*` → `/console/*` 的过渡重定向 |

数据链路目标：**UI → tRPC → mappers → dataaccess → Drizzle → `@workspace/db` → PostgreSQL**。
列表使用数据库级分页（`count` + `limit/offset`）。

## 运行

```bash
pnpm install
cp .env.example .env          # 根目录：DATABASE_URL / BETTER_AUTH_SECRET 等
# 本地 Postgres 密码与 compose 一致：postgres（不是 .env.example 里的 password）
# DATABASE_URL=postgres://postgres:postgres@localhost:5432/studio
docker compose up -d          # 本地 Postgres
pnpm --filter @workspace/db db:migrate
# 可选：种子演示组织 + 样例 SPU/SKU
pnpm --filter @workspace/db db:seed:commerce-products
pnpm --filter @workspace/db db:seed:commerce-purchase
pnpm --filter @workspace/db db:seed:commerce-orders
pnpm --filter @workspace/db db:seed:commerce-logistics
pnpm --filter @workspace/db db:seed:commerce-aftersales
pnpm --filter @workspace/db db:seed:commerce-ocean
# 开发无登录时，把种子组织写入环境（与 seed 默认一致）
# SHOP_DEV_ORGANIZATION_ID=org_shop_dev_demo
pnpm --filter shop dev
```

端口以环境变量 `PORT` 为准（未设则 Next 默认 3000）。

### 模块1：商品 SPU / 内部 SKU（已接库）

| 层 | 路径 |
| --- | --- |
| tRPC 路由 | `src/lib/server/routers/products.ts` → `/api/trpc` |
| dataaccess | `src/lib/server/dataaccess/products.ts` |
| 表 | `products` / `product_variants`（`@workspace/db` commerce-schema） |
| 控制台页 | `console/master-products`、`console/master-skus` |
| 客户端 | `src/lib/trpc/*` + `Providers` 中 QueryClient |

**已接库**：SPU / 内部 SKU 列表、详情、新建、编辑（含规格变体）。`product-store` 的 localStorage 读写已停用。

### 模块2：采购申请 → 入库上架（已接库）

| 层 | 路径 |
| --- | --- |
| tRPC 路由 | `src/lib/server/routers/purchase.ts` |
| dataaccess | `src/lib/server/dataaccess/purchase.ts` |
| 表 | `purchase_*` / `stock_inbounds` / `inventory_*`（migration 0009） |
| 控制台页 | `purchase-requests` / `purchase-approvals` / `purchase-orders` / `purchase-receipts` / `stock-inbounds` |

**已接库**：申请 CRUD/提交/撤回/取消、审批转 PO/驳回、登记到货、质检、确认上架写库存流水。对应 `purchase-*-store` localStorage 已停用。

### 模块3：订单同步 → 占库/拣货 → 出库（已接库）

| 层 | 路径 |
| --- | --- |
| tRPC 路由 | `src/lib/server/routers/order.ts` |
| dataaccess | `src/lib/server/dataaccess/order.ts` |
| 表 | `orders` / `order_lines` / `inventory_*` / `stock_outbounds*`（migration 0010） |
| 控制台页 | `orders` / `picking` / `stock-outbounds` |

**已接库**：人工增量同步（平台 stub）/ 导入 upsert、确认占库、创建出库单、拣货推进、出库过账写 `order_ship` 流水。订单/出库主路径 localStorage 已停用。

**Q07 默认**：`paid`/`ready_to_ship` 自动占库 + 人工补锁；扣减在出库过账。可用 `ORDER_RESERVE_MODE=manual_only` 关闭自动锁。

### 模块4：LGS / 物流履约（已接库）

| 层 | 路径 |
| --- | --- |
| tRPC 路由 | `src/lib/server/routers/logistics.ts` |
| dataaccess | `src/lib/server/dataaccess/logistics.ts` |
| 表 | `shipments` / `shipment_items` / `tracking_events`(+`source`) / `fulfillment_batches*` / `fulfillment_attempts`（migration 0011） |
| 控制台页 | `shipments` / `logistics-lgs` / `logistics-jsb` |

**已接库**：包裹列表/详情、从订单创建、追加轨迹（强制 source）、stub 同步写 attempt、LGS/JSB 交接批次建批/加包/提交/关闭。`shipment-store` 主路径 localStorage 已停用。

**仍 mock / stub**：真实平台 OAuth / OpenAPI（订单·刊登·结算拉取、评论与物流轨迹等）。费用模板 / 售后 / 海运柜次 / WMS 非订单出库等 ERP 自有路径已接 DB（见模块5–8 设计文档）。

### 模块5 · 费用模板（进口税 / 平台费）

| 项 | 说明 |
| --- | --- |
| 迁移 | `packages/db/drizzle/0012_commerce_fee_templates.sql` |
| tRPC | `feeTemplates.list/get/stats/create/update/createVersion/updateVersion/submit/publish/reject/disableVersion/disable/duplicate/resolve/meta` |
| Console | `/console/fee-templates`、`/console/fee-templates/[id]` |
| 测算 | `cost-calculator-workbench` → `feeTemplates.resolve` → `computeLandedCost(..., overrides)`；未命中回退 `TARIFF_PROFILES` |
| Seed | `pnpm --filter @workspace/db db:seed:commerce-fee-templates` |


### 模块6 · 售后（取消释放占库 / 退货质检回库报损）

| 项 | 说明 |
| --- | --- |
| 表 | `reverse_*` / `refunds` / `return_shipments`（migration **0008**；无新迁移） |
| tRPC | `aftersale.list/get/stats/meta/listReturns/returnStats/getReturn/listCancels/cancelStats/getCancel/upsert/syncStub/createTicket/createCancel/registerReceive/completeQc/approveCancel/rejectCancel/updateRefundStatus` |
| Console | `/console/aftersales`、`/console/aftersale-returns`、`/console/aftersale-cancels`（各含 `[id]`） |
| 流水 | 取消 `order_release`；回库 `aftersale_restock`；报损 `aftersale_scrap`（幂等对齐模块3） |
| Seed | `pnpm --filter @workspace/db db:seed:commerce-aftersales` |

### 模块7：海运柜次 / 在途库存（已接库）

| 层 | 路径 |
| --- | --- |
| tRPC 路由 | `src/lib/server/routers/ocean.ts` |
| dataaccess | `src/lib/server/dataaccess/ocean.ts` |
| 表 | `ocean_shipments*` / `inventory_*` / `sku_costs`（migration 0014） |
| 控制台页 | `ocean-containers` |
| 种子 | `pnpm --filter @workspace/db db:seed:commerce-ocean` |

**已接库**：柜次列表/详情/stats、装箱箱明细、状态推进写在途/清关/到仓库存桶与幂等流水、柜次成本 saveCost。`ocean-container-store` localStorage 主路径已停用。

详见 [docs/design/shop-module1-spu-sku-trpc.md](../../docs/design/shop-module1-spu-sku-trpc.md)、[docs/design/shop-module2-purchase-to-inbound-trpc.md](../../docs/design/shop-module2-purchase-to-inbound-trpc.md)、[docs/design/shop-module3-order-to-outbound-trpc.md](../../docs/design/shop-module3-order-to-outbound-trpc.md)、[docs/design/shop-module4-lgs-fulfillment-trpc.md](../../docs/design/shop-module4-lgs-fulfillment-trpc.md)、[docs/design/shop-module5-fee-templates-trpc.md](../../docs/design/shop-module5-fee-templates-trpc.md)、[docs/design/shop-module6-aftersale-trpc.md](../../docs/design/shop-module6-aftersale-trpc.md)、[docs/design/shop-module7-ocean-trpc.md](../../docs/design/shop-module7-ocean-trpc.md)、[docs/design/shop-module8-wms-trpc.md](../../docs/design/shop-module8-wms-trpc.md)、[docs/design/shop-module16-real-data-final.md](../../docs/design/shop-module16-real-data-final.md)。

## 脚本

| 脚本 | 说明 |
| --- | --- |
| `pnpm dev` | 开发服务器（Turbopack） |
| `pnpm build` | 生产构建 |
| `pnpm start` | 运行生产构建 |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript |

## 相关文档

- 租户端 UED：[content/design/crossborder-shop-ued-product-design.md](content/design/crossborder-shop-ued-product-design.md)
- 成本计算器：[content/design/cost-calculator-sl-landed-ued.md](content/design/cost-calculator-sl-landed-ued.md)
- 改造总览：[../../docs/design/crossborder-mvp-overview.md](../../docs/design/crossborder-mvp-overview.md)
- 仓库约定：[AGENTS.md](../../AGENTS.md)

## Marketplace sync (skeleton)

```bash
pnpm --filter shop sync:marketplace -- --shopId=b5ofcwj2mzauov29y08m0q99 --platform=daraz
```

See `packages/marketplace/ENV_CHECKLIST.md` and `src/workers/marketplace-sync.ts`.

