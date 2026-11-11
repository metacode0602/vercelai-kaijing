# apps/web — 平台运营后台

面向**平台运营**的管理端：租户与店铺审核、跨租户同步健康、待审动作抽检、平台配置。

## 定位

| 项 | 说明 |
| --- | --- |
| 使用者 | 平台运营、管理员 |
| 作用 | 跨租户只读 / 受限操作与平台级配置 |
| 技术栈 | Next.js 16 App Router、tRPC（superjson）、Drizzle ORM、better-auth |
| 当前阶段 | 跨境运营页面已接真实 tRPC（`platformOps.dashboardStats` / `syncHealth` / `pendingActions`）；`mock-data.ts` / `demo-alert.tsx` 已删除 |

## 主要功能

| 路径 | 功能 |
| --- | --- |
| `src/app/[locale]/(protected)/console` | 运营总览（旧路径 `/crossborder` 会重定向到这里） |
| ├ `tenants` / `onboarding` / `users` | 租户、入驻审核、平台用户及其独立详情页 |
| ├ `shops` / `shop-conflicts` / `auth-exceptions` | 店铺、店铺冲突、授权异常及其详情页 |
| ├ `pending-actions` / `sync-health` | 待审动作详情、连接器 / 同步健康（行进店铺详情） |
| `src/app/[locale]/(protected)/settings` | 账号设置；侧栏另含平台配置 / 操作日志 / 系统公告 / 角色权限（即将上线） |
| `src/app/[locale]/(auth)` | 登录 / 注册 / 找回密码 |

壳层：`console/layout.tsx` 与 `settings/layout.tsx` 各自提供独立侧边栏、顶部导航、自动面包屑与站内信入口。

tRPC：

- 入口：`src/lib/server/routers/index.ts`
- 当前路由：`apiKeys`、`platformOnboarding`（租户入驻审核）、`platformOps`（运营总览 / 同步健康 / 待审抽检）、`siteMessages`（站内信列表 / 未读数 / 已读）
- 新增领域路由按 `routers/` → dataaccess → `@workspace/db` 分层实现

跨租户写操作默认进入待审队列；平台端不直接绕过租户确认。

## 运行

```bash
pnpm install
cp .env.example .env          # DATABASE_URL / BETTER_AUTH_SECRET 等
docker compose up -d
pnpm --filter @workspace/db db:migrate
pnpm --filter web dev
```

端口以 `apps/web/.env` 的 `PORT` 为准。

> 单独跑类型检查时建议加大内存：
> `NODE_OPTIONS="--max-old-space-size=8192" pnpm --filter web run typecheck`

## 脚本

| 脚本 | 说明 |
| --- | --- |
| `pnpm dev` | 开发服务器（Turbopack） |
| `pnpm build` / `pnpm start` | 生产构建 / 运行 |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript |

## 相关文档

- 改造总览：[../../docs/design/crossborder-mvp-overview.md](../../docs/design/crossborder-mvp-overview.md)
- 数据库设计：[../../docs/design/crossborder-database-design.md](../../docs/design/crossborder-database-design.md)
- 仓库约定：[AGENTS.md](../../AGENTS.md)
