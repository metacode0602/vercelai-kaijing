# Agent Guidelines for GPURun Cloud

GPURun Cloud 是一个 GPU 云服务平台，包含前端用户控制台、运营平台和 OpenAPI。

## 技术栈

| 层 | 技术 | 备注 |
|---|---|---|
| **前端框架** | Next.js 16 + App Router | Server Components 优先 |
| **UI 组件** | shadcn/ui (Radix + @base-ui/react) | `@workspace/ui` 包统一管理 |
| **后端 RPC** | tRPC | apps/web、apps/merchant、apps/supplier 使用 |
| **REST API** | Hono 4 + @hono/zod-openapi | apps/api 对外暴露 OpenAPI |
| **ORM** | Drizzle ORM | PostgreSQL 方言，node-postgres driver |
| **认证** | better-auth | apps/web 和 apps/api 共享 |
| **构建** | Turborepo | pnpm workspace monorepo |
| **样式** | Tailwind CSS v4 | @workspace/ui/globals.css 提供全局样式 |

## 架构概览

```text
GPURun-cloud/
├── apps/
│   ├── gpus/                   # 最终用户前端 (Next.js 16 + App Router) — tRPC → dataaccess → db
│   ├── web/                    # 运营平台 (Next.js 16 + App Router) — tRPC → dataaccess → db
│   ├── merchant/               # 商户平台 (Next.js 16) — tRPC → dataaccess → db
│   ├── supplier/               # 供应商门户 (Next.js 16)
│   ├── api/                    # OpenAPI (Hono + zod-openapi)
│   └── docs/                   # 文档站点 (Fumadocs)
├── packages/
│   ├── db/                     # Drizzle ORM 数据层 (schema definitions)
│   ├── auth/                   # 认证鉴权 (better-auth)
│   ├── billing/                # 共享计费服务 (recharge/balance/payment)
│   ├── ui/                     # 共享 UI 组件 (shadcn/ui)
│   ├── shared-next/            # 共享 Next.js 工具
│   ├── email/                  # 邮件服务
│   ├── sms-captcha/            # 短信验证码
│   ├── eslint-config/          # ESLint 配置
│   └── typescript-config/      # TypeScript 配置
└── docker/                     # Docker 部署配置
```

## 依赖方向

- `apps/gpus` -> `@workspace/shared-next`, `@workspace/ui`, `@workspace/billing`
- `apps/web` -> `@workspace/auth`, `@workspace/db`, `@workspace/email`, `@workspace/shared-next`, `@workspace/ui`, `@workspace/billing`
- `apps/merchant` -> `@workspace/auth`, `@workspace/db`, `@workspace/ui`, `@workspace/billing`
- `apps/api` -> `@workspace/auth`, `@workspace/db`, `@workspace/billing`
- `packages/auth` -> `@workspace/db`
- `packages/billing` -> `@workspace/db` (shared recharge/balance/payment orchestration)
- `packages/db` -> 不引用任何 workspace 包 (仅 drizzle-orm)
- `packages/ui`, `packages/shared-next`, `packages/email` -> 不引用 `apps/*` 或其他业务包

## 数据访问架构

`apps/web`、`apps/gpus`、`apps/merchant` 遵循统一的数据访问模式：

```
UI (React Components)
  ↓ tRPC (Router 定义在 app/src/lib/server/routers/)
  mappers (可选，src/lib/server/mappers/ — 将 DB 模型转为 DTO)
  dataaccess (src/lib/server/dataaccess/  — 事务在此层处理)
    ↓ Drizzle ORM
  @workspace/db (packages/db/src/ — schema 定义)
    ↓
  PostgreSQL
```

### 层职责

- **tRPC Router** — 定义路由、输入校验 (zod)、权限控制。编排调用 dataaccess/mappers 层。
- **mappers 层** (`src/lib/server/mappers/`) — 将 DB 查询结果映射为 DTO/API 响应结构。可选：简单查询可直接在 router 中映射，复杂场景应提取到 mappers。
- **dataaccess 层** — 提供数据库查询封装和**事务支持** (`db.transaction()`)，不包含业务编排逻辑。
- **@workspace/db** — 只包含 Drizzle ORM table schema 定义和类型导出，不含业务逻辑。
- **apps/api** 使用 Hono + zod-openapi 对外暴露 RESTful OpenAPI，直接使用 `@workspace/db` 和 `@workspace/auth`。

### dataaccess 组织方式

dataaccess 按领域子模块组织，每个子模块对应一组关联领域：

```
dataaccess/
├── crm/                # CRM 运营数据
├── merchant/           # 商户管理
├── supplier/           # 供应商管理
├── finance/            # 财务账单
├── dashboard/          # 大盘看板
├── platform-pricing/   # 平台定价（含 index.ts 复合导出）
├── unit-costs/         # 单位成本
├── shared/             # 共享查询
├── integrations/       # 第三方集成（飞书等）
├── site-messages.ts    # 站内信（直接文件）
└── global-search.ts    # 全局搜索
```

子模块通常提供 `index.ts` 导出统一的数据访问对象，如 `platform-pricing/index.ts`：

```typescript
export const platformPricingDataAccess = {
  getListPage: () => platformPricingDbDataAccess.getListPage(),
  createPrice: platformPricingDbDataAccess.createPrice.bind(platformPricingDbDataAccess),
  // ...
}
```

## 分页规范

**所有列表分页必须使用数据库级分页。** 禁止将全部数据拉到客户端后通过 `Array.slice()` 或 `useListPagination` 做前端分页。

### 数据库级分页模式

每个分页查询返回统一结构：

```typescript
// dataaccess 层返回值
type PaginatedResult<T> = {
  items: T[]
  total: number       // 符合条件的总记录数（count 查询结果）
  page: number        // 当前页码（已 clamp）
  pageSize: number    // 每页条数（已 clamp）
}
```

实现模式（参考 `coupon-list.ts`、`discount-template-list.ts`、`tenant-blacklist.ts`）：

```typescript
// dataaccess 层实现
async function list(filters: Filters): Promise<PaginatedResult<Item>> {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20))
  const conditions: SQL[] = buildConditions(filters)
  const where = and(...conditions)

  // 1. 总数查询（独立 count）
  const [totalRow] = await db
    .select({ total: count() })
    .from(table)
    .where(where)

  const total = Number(totalRow?.total ?? 0)
  const offset = (page - 1) * pageSize

  // 2. 分页数据查询
  const rows = await db
    .select({ ... })
    .from(table)
    .where(where)
    .orderBy(desc(table.createdAt))
    .limit(pageSize)
    .offset(offset)

  return { items: rows.map(mapRow), total, page, pageSize }
}
```

### tRPC 层分页输入

分页路由必须接受 `page`/`pageSize` 输入，并传递给 dataaccess：

```typescript
.input(
  z.object({
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(20),
    ... // 筛选条件
  }),
)
```

### 共存两种分页类型

- **服务端分页**（推荐）：用于数据量大（>200 条）或需要跨页持久化筛选的场景。tRPC 调用带 `page`/`pageSize`，dataaccess 执行 `count()` + `.limit().offset()`。
- **无分页**：用于数据明确较少（<200 条）且不需要分页 UI 的场景，直接返回全量数组。

### 非分页列表的转换原则

如果一个列表当前没有分页但数据量可能增长，必须预留分页参数接口（`page`/`pageSize` 设为 optional），后续数据量增长时只需补齐 dataaccess 实现，无需修改 tRPC 和 UI 接口。

### 前端分页组件

现有 `ListPagination` 组件 (`@/components/shared/list-pagination`) 和 `useListPagination` hook (`@/hooks/use-list-pagination`) 是客户端分页工具，**仅用于对后端已经分页返回的结果做本地二次切分**（如：搜索筛选后部分数据的局部翻页）。不得用于替代数据库分页。

## Drizzle ORM 最佳实践

### Schema 定义

- 使用 `pgTable` 定义表，主键用 `text`（UUID）或 `serial`/`bigserial`。
- 金额字段统一用 `numeric(name, { precision: 15, scale: 4 })`，在 schema 文件中定义 `const money = (n) => numeric(n, { precision: 15, scale: 4 })` 复用。
- 时间戳字段使用 `timestamp(name, { withTimezone: true }).defaultNow()`。
- 枚举字段用 `varchar` + TypeScript union type，避免数据库 enum 的迁移成本。
- 扩展字段用 `jsonb`。
- 聚合字段（`projectCount`、`totalRecharge` 等）**不入库**，在 dataaccess 层通过子查询/join 计算。

### 查询模式

- 使用 `db.select()` 显式指定返回列（避免 `db.query.table.findMany()` 隐含列泄露）。
- 相关子查询使用 `db.select(...).from(table).as('alias')` 创建命名子查询，再 `leftJoin`/`innerJoin`。
- 复杂条件用 `and(...)` / `or(...)` 组合 SQL[] 数组。
- 事务用 `db.transaction(async (tx) => { ... })`。
- **永远不要使用 `for...of` + 逐条 `await` 查询** — 使用 `inArray`、批量 insert/update。

### 迁移

- 使用 `drizzle-kit generate` / `drizzle-kit migrate`。
- 生成的迁移文件在 `packages/db/drizzle/`，**不要手动编辑**。
- Schema 变更后运行 `pnpm --filter @workspace/db run db:generate`。

## shadcn/ui 最佳实践

### 组件库

所有 shadcn/ui 组件位于 `@workspace/ui` 包中：

- 组件路径：`@workspace/ui/components/<name>`
- 工具函数：`@workspace/ui/lib/utils`（`cn()` - clsx + tailwind-merge）
- 全局样式：`@workspace/ui/globals.css`
- 自定义 hooks：`@workspace/ui/hooks/<name>`

### 样式约定

- 使用 Tailwind CSS v4 utility classes。
- 自定义组件样式使用 `cn()` 组合条件类名。
- shadcn 的 `className` prop 统一用 `cn()` 合并。
- 避免内联 `style`；用 Tailwind 的 `style` prop 仅用于 CSS 变量绑定。

### 组合模式

- 使用 shadcn 插槽模式（Slot / asChild）让组件可组合。
- Dialog、Sheet、Popover 等弹层组件配合 Button/Trigger 使用。
- 表格数据展示：用 shadcn Table 组件 + `ListPagination` 做分页控制。

## tRPC 最佳实践

### tRPC 超集 (transformer)

`apps/web` 使用 `superjson` 作为 tRPC transformer，支持 `Date`、`Map`、`Set` 等类型的自动序列化。此外注册了自定义 `Dinero` 类型的序列化：

```typescript
// apps/web/src/lib/server/routers/transformer.ts
superjson.registerCustom(
  { isApplicable, serialize, deserialize },
  'Dinero',
)
export const transformer = superjson
```

新应用应复用此 transformer，避免手动序列化金额类型。


### Router 组织

Router 按领域模块分组，顶层合并：

```typescript
export const appRouter = router({
  auth: authRouter,
  crm: crmRouter,
  merchant: merchantRouter,
  supplier: supplierRouter,
  finance: financeRouter,
  integration: router({ feishu: integrationFeishuRouter }),
  // ...
})
```

每个子路由文件导出独立 `createTRPCRouter`，避免单一文件膨胀。

## Next.js (App Router) 最佳实践

- **路由组织**：`/[locale]/<module>/<page>`，locale 由 i18n middleware 解析。
- **布局**：`layout.tsx` 做数据加载（session、权限），`page.tsx` 专注于页面内容。
- **模块内私有目录**：在 `/<module>/` 下使用 `_components/` 存放该模块专用的客户端组件，`_lib/` 存放私有工具函数。跨模块共享的组件应提升到 `@/components/`。
- **数据加载**：优先在 Server Component 中用 tRPC caller 获取数据（`createCaller(createInnerTRPCContext(...))`）。
- **搜索参数**：用 `searchParams` prop 处理列表页筛选和分页（使 URL 可分享）。
- **表单**：用 tRPC 做表单提交，避免客户端状态管理带来的复杂度。

## 设计文档约定

所有设计文档中的流程图使用 mermaid 表述；线框图保持原有格式不变。

### 文档目录约定

全仓 md 文档统一按三类存放，**内容属于哪个模块就放哪个模块的 `content/` 下，只有跨模块内容才上提 `docs/`**：

```text
docs/                          # 跨模块 + 全仓总索引
├── README.md                  # 唯一入口（三维索引：按类型 / 按模块 / 按状态）
├── design/                    # 跨模块设计（INDEX.md、audit/、cloud/、gpus/、k8s/）
├── guide/                     # 跨模块操作手册（INDEX.md）
├── business/                  # 商业方案唯一集中地（INDEX.md）
└── archive/                   # 已被取代的历史文档（保留不删）

apps/<app>/content/
├── design/                    # 设计：系统应该怎么建
├── guide/                     # 操作手册：人该怎么操作
├── business/                  # 商业方案：怎么卖 / 定价 / 合同
├── README.md                  # 本模块文档索引
└── （legal/ pages/ release/ 等站点与合规内容原位保留）
```

判定顺序：被代码/构建读取的（站点源、应用内素材）不移动 → 描述「系统怎么建」进 `design` → 描述「人怎么操作」进 `guide` → 描述「怎么卖/定价/合同」进 `business` → 已被取代的进 `archive`（标注 `已取代` 并链接新版，**不删除**）→ 跨多个模块无单一归属的上提 `docs/`。

约定细节：

- 新增设计/手册/商业方案时按上面的分类落盘，并在对应的 `INDEX.md` 登记一行
- 代码里用 `@see <仓库根相对路径> §章节号` 指向设计文档；md 之间用相对链接（移动文档后必须同步更新这两处）
- `apps/docs/content/docs/` 是 fumadocs 站点源（会被发布），**不要改 `source.config.ts` 的 `dir`**
- `apps/web/content/legal/` 由法务口径维护，不参与三分类

## How To Work

- 读取完成任务所需的最小上下文，不要打开不必要的文件。
- 保持改动范围聚焦，避免无关重构。
- 对于 bug 修复，先编写可复现的测试，确认失败，再修复 bug。
- 对 `apps/web/**`、`apps/gpus/**`、`apps/merchant/**` 中的用户可见前端变更，在浏览器中验证完整流程。
- 对于文档截图，避免在 Markdown `<img>` 标签上使用固定 `height`；优先用 Markdown 图片语法或仅设置宽度。
- 不要新增或扩大 ESLint disable 注释或配置覆盖，除非获得用户明确批准。
- 始终在 shell 命令中引用文件路径，或对包含动态 Next.js 路由的路径使用 `noglob`。
- 绝不提交密钥或凭据。保持 `.env*.example` 文件与所需环境变量同步。
- **禁止使用 `'use server'` 指令**。页面与服务端的交互统一通过 tRPC procedure 进行数据获取和变更。Server Components 中需要调用服务端逻辑时，使用 tRPC 的 `createServerCaller` 或直接导入纯服务端模块（不含 `'use server'` 指令）。如需封装可复用的服务端工具函数，可放在 `lib/server/actions/` 下作为纯模块导出（参考 `apps/web/src/lib/server/actions/users.ts`），这些不是 Next.js Server Actions，不带 `'use server'` 指令。
- 新增加分页列表时，必须使用数据库级分页模式（count + limit/offset）。如果重构现有客户端分页列表，优先改造成服务端分页。

## Pre-existing Issues

以下问题不是你引入的，在验证时请跳过：

- `pnpm run lint` 从根目录运行时，部分包 (`supplier`, `dashboard`, `sms-captcha`, `doc`) 因缺少 eslint 依赖而失败。验证单个包时使用 `turbo lint --filter=<pkg>` 或直接 `pnpm --filter <pkg> run lint`。
- `pnpm run typecheck` 从根目录运行时，因 `@workspace/db` 的预存错误级联失败。验证单个包时使用 `turbo typecheck --filter=<pkg>`。

## Core Commands

- 安装依赖: `pnpm install`
- 启动所有应用: `pnpm run dev`
- 启动 gpus: `pnpm run dev:gpus`
- 启动 web: `pnpm run dev:web`
- 启动 merchant: `pnpm run dev:merchant`
- 启动 api: `pnpm run dev:api`
- Lint: `pnpm run lint`
- 类型检查: `pnpm run typecheck`
- 构建检查: `pnpm run build`
- 数据库迁移生成: `pnpm --filter @workspace/db run db:generate`
- 数据库迁移: `pnpm --filter @workspace/db run db:migrate`
- Drizzle Studio: `pnpm --filter @workspace/db run db:studio`

## Verification

- `apps/gpus/**` 或 `apps/web/**` 或 `apps/merchant/**`: `pnpm run lint` + 针对性的前端测试
- `apps/api/**`: `pnpm run lint` + API 端点测试
- `packages/db/**` schema 变更: `pnpm run lint`, `pnpm --filter @workspace/db run db:generate`, 并检查受影响 apps 的编译
- 跨包重构: `pnpm run lint`, `pnpm run typecheck`, 以及受影响包的针对性测试
- 公共 API 合约变更: `pnpm run lint`, API 测试

## Generated Files

不要手动编辑以下生成或构建产物：

- `apps/web/.next/*`
- `apps/gpus/.next/*`
- `apps/merchant/.next/*`
- `apps/api/dist/*`
- `*/dist/*`
- `packages/db/drizzle/*` (drizzle-kit 生成)

---

提供完成证据而非空泛声明：引用每条检查的摘要行 — 例如 `Tasks: 8 successful, 8 total` (turbo lint/typecheck) 或 `Tests 12 passed (12)` (vitest) — 说明跳过了哪些检查及其原因，绝不要将未验证的工作报告为已完成。
