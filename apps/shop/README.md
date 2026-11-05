# apps/shop — 租户端

面向**跨境卖家（租户）**的运营工作台：店铺连接、选品候选、待审队列、商品/刊登、订单、库存、到仓成本与财务粗览。

## 定位

| 项 | 说明 |
| --- | --- |
| 使用者 | 卖家 / 租户运营 |
| 作用 | 本组织跨境业务的数据查看与运营操作入口 |
| 技术栈 | Next.js 16 App Router、next-intl、`@workspace/ui`、better-auth |
| 当前阶段 | **模块1（商品 SPU / 内部 SKU）已接 tRPC → dataaccess → PostgreSQL**；采购/订单/WMS/LGS/费用等仍为 localStorage 原型 |

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

**仍 mock / localStorage（本 PR 不接）**：Seller SKU / 刊登映射、供应商 SKU、采购、订单、WMS、LGS、费用模板、字典/品类/成员辅助选项等。映射页可从 DB 拉取内部 SKU 编码列表，映射关系本身仍为 stub。

详见 [docs/design/shop-module1-spu-sku-trpc.md](../../docs/design/shop-module1-spu-sku-trpc.md)。

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
