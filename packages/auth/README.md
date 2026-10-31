# @workspace/auth — 认证配置

集中定义 **better-auth** 实例与选项，并负责生成对应的 Drizzle schema。`apps/web` 使用这份共享配置与 `@workspace/db` 的认证表。

## 定位

| 项 | 说明 |
| --- | --- |
| 作用 | 提供认证实例工厂、路径常量与共享选项（邮箱密码登录、组织/成员等） |
| 消费方 | `apps/web` |
| 依赖 | `@workspace/db`（Drizzle adapter） |

## 主要功能

| 导出 | 说明 |
| --- | --- |
| `createAuth(db, options)` | 用给定的 Drizzle 数据库与配置创建 better-auth 实例 |
| `AUTH_PATH` | 认证路由前缀（`/api/auth`） |
| `sharedAuthOptions` | 共享配置（邮箱密码等） |

`src/generate.ts` 用于 better-auth CLI 生成 Drizzle schema。

## 使用

```ts
import { createAuth, AUTH_PATH } from "@workspace/auth"

const auth = createAuth(db, {
  baseURL: "http://localhost:8080",
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: ["http://localhost:3000"],
})

// 挂载到 Hono
app.on(["GET", "POST"], `${AUTH_PATH}/*`, (c) => auth.handler(c.req.raw))
```

## 运行 / 生成 schema

认证表的 Drizzle schema 位于 `packages/db/src/auth-schema.ts`。修改认证选项或插件后重新生成：

```bash
pnpm --filter @workspace/auth auth:generate
```

生成后按 `@workspace/db` 的流程产出并应用迁移：

```bash
pnpm --filter @workspace/db db:generate
pnpm --filter @workspace/db db:migrate
```

### 相关环境变量

```
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=...
BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3000,http://localhost:8080
```

## 部署

本包**不独立部署**，随宿主应用（`apps/web`）构建发布。发布时确保注入 `BETTER_AUTH_*` 环境变量。

## 脚本

| 脚本 | 说明 |
| --- | --- |
| `pnpm auth:generate` | 重新生成 Drizzle 认证 schema |
| `pnpm build` | 构建 |
| `pnpm test` | 单元测试 |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript |

## 相关文档

- 模块协作关系：[根 README](../../README.md#模块协作关系)
- 数据模型：[packages/db](../db/README.md)
