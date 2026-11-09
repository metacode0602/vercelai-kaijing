# Agent Guidelines for Open Shop

Open Shop 是多租户跨境电商运营数据中枢，包含租户端控制台、平台运营后台、OpenAPI 与文档站。MVP 聚焦 Daraz 斯里兰卡站。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端框架 | Next.js 16 + App Router（Server Components 优先） |
| UI 组件 | shadcn/ui（Radix + @base-ui/react），统一在 `@workspace/ui` |
| 后端 RPC | tRPC（`apps/web`） |
| REST API | Hono 4 + `@hono/zod-openapi`（`apps/api`） |
| ORM | Drizzle ORM（PostgreSQL，node-postgres） |
| 认证 | better-auth |
| 构建 | Turborepo + pnpm workspace |
| 样式 | Tailwind CSS v4（`@workspace/ui/globals.css`） |

## 架构

```text
apps/
  shop/    租户端（营销页 + /console 运营台）
  web/     平台运营后台（跨租户审核、同步健康、待审抽检）
  api/     OpenAPI 与认证端点（认证当前为占位）
  docs/    Fumadocs 文档站
packages/
  db/                Drizzle schema（auth / commerce / feishu）与迁移
  auth/              better-auth 配置
  marketplace/       平台连接器（Daraz / Lazada / TikTok OAuth、签名、同步）
  ui/                共享 UI 组件
  shared-next/       共享 Next.js 工具
  email/             邮件
  sms-captcha/       短信验证码
  redis/             统一 Redis 连接
  storage/           统一对象存储
  eslint-config/     共享 ESLint 预设
  typescript-config/ 共享 TS 预设
```

### 模块边界

- `apps/shop`：租户（卖家）视角。店铺连接、选品候选、待审、商品/刊登、订单、库存、成本、财务；只能访问本组织数据。控制台主路径已接 tRPC → dataaccess → PostgreSQL（成本测算、费用模板、利润、售后等），仅少数页面仍为内存/本地演示，列表一律数据库级分页。
- `apps/web`：平台运营视角。租户/店铺审核、同步健康、待审抽检、平台配置；跨租户操作默认只读或受限。
- `apps/api`：第三方与 Agent 接入；OpenAPI 与 MCP 共用同一套 domain 服务，禁止两套写路径。
- `apps/docs`：只发布 `content/docs/`；不要改 `source.config.ts` 的 `dir`。

### 依赖方向

- `apps/*` → `@workspace/{db,auth,marketplace,ui,shared-next,email,redis,storage,sms-captcha}`
- `packages/auth` → `@workspace/db`
- `packages/marketplace` → `@workspace/db`
- `packages/db` → 不引用任何 workspace 包
- `packages/ui`、`packages/shared-next`、`packages/email` → 不引用 `apps/*`

## 数据访问

标准链路：

```text
UI (React Components)
  ↓ tRPC（apps/web/src/lib/server/routers/）
  mappers（可选，src/lib/server/mappers/）
  dataaccess（src/lib/server/dataaccess/，事务在此层）
    ↓ Drizzle ORM
  @workspace/db（packages/db/src/）
    ↓
  PostgreSQL
```

- 业务表强制 `organization_id`；外部平台 ID 只进映射表。
- 跨境域 schema 在 `packages/db/src/commerce-schema.ts`。
- `apps/shop` 新接业务时按上述链路补 tRPC / dataaccess，不把业务查询写进组件。
- 事务统一用 `db.transaction(async (tx) => { ... })`。

### 分页

所有列表必须数据库级分页：

```typescript
type PaginatedResult<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
}
```

实现：独立 `count()` + `.limit(pageSize).offset(offset)`。禁止把全量数据拉到前端再 `slice`。tRPC 输入统一接受 `page` / `pageSize`（默认 1 / 20，最大 100）。

## Drizzle ORM

- 主键用 `text`（cuid/UUID）或序列；时间戳用 `timestamp(..., { withTimezone: true }).defaultNow()`。
- 金额字段用 `numeric(..., { precision: 15, scale: 4 })`。
- 枚举字段用 `varchar` + TypeScript union，避免数据库 enum 迁移成本。
- 扩展字段用 `jsonb`。
- 使用 `db.select()` 显式列出字段，避免隐式列泄露。
- 批量查询用 `inArray` / 批量 insert；禁止 `for...of` 逐条 await。
- 迁移文件由 `drizzle-kit generate` 生成，不手动编辑 `packages/db/drizzle/`。

## shadcn/ui

- 组件在 `@workspace/ui/components/<name>`；工具用 `@workspace/ui/lib/utils` 的 `cn()`。
- 使用 Tailwind v4 utility classes；避免内联 `style`。
- 弹层组件配合 Button/Trigger；表格用 shadcn Table + 分页。
- 新增组件：`pnpm --filter @workspace/ui dlx shadcn@latest add <component>`。

## tRPC

- Router 按领域拆分，顶层合并；`apps/web` 使用 superjson transformer。
- 输入用 zod 校验并做权限控制；跨租户写操作进入待审队列。
- 输出 DTO 与 DB 模型分离，复杂映射放 mappers。

## Next.js（App Router）

- 路由：`/[locale]/<module>/...`，locale 由 next-intl 处理。
- 模块私有组件放 `_components/`，私有工具放 `_lib/`；跨模块组件上提 `@/components/`。
- 列表筛选与分页用 `searchParams`，保持 URL 可分享。
- **禁止 `'use server'`**。服务端复用逻辑放 `lib/server/` 纯模块，或通过 tRPC caller 调用。
- 落地页 / 营销页暂保持现状，不在文档清理中改动。

## 文档

按内容归属存放：

```text
docs/                         # 跨模块 + 总索引
├── README.md
└── design/                   # 跨模块设计（INDEX.md）
apps/<app>/content/
├── design/                   # 模块设计
├── guide/                    # 操作手册
└── business/                 # 商业方案
apps/docs/content/docs/       # fumadocs 站点源（会发布）
```

- 当前只维护跨境运营域文档；不要重新引入已移除的业务域设计。
- 新增文档后在 `docs/design/INDEX.md` 或对应模块索引登记。
- 代码里用 `@see <仓库根相对路径> §章节号` 指向设计文档。
- 流程图用 mermaid。

## 工作方式

- 读取完成任务所需的最小上下文，保持改动范围聚焦。
- bug 修复先写可复现测试，确认失败再修。
- `apps/shop`、`apps/web` 的用户可见变更需在浏览器验证完整流程。
- 不新增或扩大 ESLint disable（除非明确批准）。
- Shell 命令中引用文件路径，动态 Next.js 路由用 `noglob`。
- 不提交密钥；同步维护 `.env*.example`。
- 不在文档截图的 `<img>` 上写死 `height`。

## 常用命令

```bash
pnpm install
pnpm dev                    # 全部应用
pnpm --filter shop dev
pnpm --filter web dev
pnpm --filter api dev
pnpm --filter doc dev

pnpm lint
pnpm typecheck
pnpm build

pnpm --filter @workspace/db db:generate
pnpm --filter @workspace/db db:migrate
pnpm --filter @workspace/db db:studio
```

## 验证

- `apps/shop` / `apps/web`：`pnpm --filter <shop|web> lint` + `typecheck`；用户可见流程做浏览器验证。
- `apps/api`：`pnpm --filter api lint` + `typecheck` + 针对性端点测试。
- `packages/db` schema 变更：`pnpm --filter @workspace/db db:generate`，并验证受影响应用编译。
- 跨包改动：`pnpm lint`、`pnpm typecheck` + 受影响包测试。
- 根目录全量命令若有历史配置问题，优先用 `turbo <task> --filter=<pkg>` 或 `pnpm --filter <pkg> run <task>` 验证单包。

提供完成证据：引用检查摘要行（如 `Tasks: N successful`、`Tests N passed`），说明跳过项及原因，不把未验证工作报告为完成。

## 生成文件（不要手改）

- `apps/*/.next/*`
- `apps/api/dist/*`
- `*/dist/*`
- `packages/db/drizzle/*`
