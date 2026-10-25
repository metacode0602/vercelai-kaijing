# apps/api — OpenAPI / MCP 接口

基于 **Hono** 的 REST API：对外提供 OpenAPI 文档与健康检查；跨境业务资源接口按设计待实现。

## 定位

| 项 | 说明 |
| --- | --- |
| 使用者 | 第三方开发者、Agent、内部服务 |
| 作用 | 对外暴露跨境运营数据与动作；OpenAPI 与 MCP 共用同一套 domain 服务 |
| 技术栈 | Hono 4 + `@hono/node-server`、`@hono/zod-openapi`、Scalar、Drizzle ORM |
| 当前阶段 | 仅健康检查与示例；认证端点占位，业务接口待实现 |

## 现有路由

| 路由 | 挂载路径 | 说明 |
| --- | --- | --- |
| `health` | `/api/v1/health` | 健康检查 |
| `hello` | `/api/v1/hello` | 示例接口 |
| 认证占位 | `/api/auth/*` | 当前返回 501，待接入 |
| OpenAPI JSON | `/api/v1/open-api` | 机器可读文档 |
| Scalar UI | `/docs` | 交互式 API 文档 |

规划中的跨境资源（shops / products / listings / orders / inventory / pending-actions / candidates）与 MCP tools 见
[`docs/design/crossborder-api-mcp-design.md`](../../docs/design/crossborder-api-mcp-design.md)。

## 运行

```bash
# 前置：根目录 .env + 本应用 .env（dev/start 使用 --env-file=./.env）
cp .env.example .env
docker compose up -d
pnpm --filter @workspace/db db:migrate

pnpm --filter api dev          # 默认 http://localhost:8080
```

```bash
curl http://localhost:8080/api/v1/health
open http://localhost:8080/docs
```

### 测试

```bash
pnpm --filter api test
```

## 脚本

| 脚本 | 说明 |
| --- | --- |
| `pnpm dev` | 开发服务器（tsx watch） |
| `pnpm build` | tsdown 打包 |
| `pnpm start` | 运行生产构建 |
| `pnpm test` | `node:test` 回归测试 |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript |

## 相关文档

- 接口设计：[../../docs/design/crossborder-api-mcp-design.md](../../docs/design/crossborder-api-mcp-design.md)
- 仓库约定：[AGENTS.md](../../AGENTS.md)
