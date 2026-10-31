# apps/shop — 租户端

面向**跨境卖家（租户）**的运营工作台：店铺连接、选品候选、待审队列、商品/刊登、订单、库存、到仓成本与财务粗览。

## 定位

| 项 | 说明 |
| --- | --- |
| 使用者 | 卖家 / 租户运营 |
| 作用 | 本组织跨境业务的数据查看与运营操作入口 |
| 技术栈 | Next.js 16 App Router、next-intl、`@workspace/ui`、better-auth |
| 当前阶段 | 控制台以 mock 数据展示；尚未接入业务 tRPC |

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
cp .env.example .env          # DATABASE_URL / BETTER_AUTH_SECRET 等
docker compose up -d          # 本地 Postgres
pnpm --filter @workspace/db db:migrate
pnpm --filter shop dev
```

端口以 `apps/shop/.env` 的 `PORT` 为准。

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
