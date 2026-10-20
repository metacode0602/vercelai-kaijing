# apps/api — OpenAPI 对外接口

基于 **Hono** 的 REST API：对外提供 OpenAPI 文档与 API Key 鉴权的商户接口，同时承载 better-auth 的 HTTP 端点。是第三方开发者与外部系统接入本平台的唯一 REST 入口。

## 定位

| 项 | 说明 |
| --- | --- |
| 使用者 | 第三方开发者、外部计费系统、内部跨服务调用 |
| 作用 | 对外暴露 `@workspace/db` 中的数据与业务动作（扣费、券、主体、对账等） |
| 技术栈 | Hono 4 + `@hono/node-server`、`@hono/zod-openapi`、Scalar（API 文档 UI）、Drizzle ORM、better-auth |
| 与控制台关系 | 与 `apps/web` / `apps/merchant` 共享同一份 `@workspace/db` 与 `@workspace/auth`，不复制业务规则 |

## 主要功能

| 路由（`src/routes/`） | 挂载路径 | 说明 |
| --- | --- | --- |
| `health` / `hello` | `/api/v1/health`、`/api/v1/hello` | 健康检查与探活 |
| `recharge` | `/api/v1/recharge` | 充值与订单 |
| `consumption` | `/api/v1/consumption` | **实时扣费**（幂等 `requestId`，资金正确性核心） |
| `account` | `/api/v1/account` | 账户与余额只读 |
| `vouchers` | `/api/v1/vouchers` | 算力券采购 / 发放 / 核销 |
| `subjects` | `/api/v1/subjects` | 外部用户、租户主体同步 |
| `recon` | `/api/v1/recon` | 对账单只读（`recon:read`） |
| `bare-metal` / `tasks` | `/api/v1/bare-metal`、`/api/v1/tasks` | 裸金属与任务查询 |
| `sync` | `/api/v1/sync` | 进货价等数据同步 |
| `agent` | `/api/v1/agent` | Agent 相关接口 |
| better-auth | `/api/auth/*` | 注册 / 登录 / 会话 |
| OpenAPI JSON | `/api/v1/open-api` | 机器可读的 OpenAPI 文档 |
| Scalar UI | `/docs` | 交互式 API 文档 |

### 鉴权

- **会话类**：better-auth（邮箱密码），`AUTH_PATH = /api/auth`
- **商户 API Key**：scope 由 `MERCHANT_API_KEY_SCOPES` 定义：
  `balance:read`、`consumption:write`、`voucher:purchase`、`voucher:grant`、`subject:sync`、`recon:read`

## 运行

```bash
# 前置：根目录 .env + 本应用 .env（dev/start 使用 --env-file=./.env 读取）
cp .env.example .env
docker compose up -d
pnpm --filter @workspace/db db:migrate

pnpm --filter api dev          # tsx watch，默认 http://localhost:8080
```

> `apps/api/.env` 为应用级配置（`PORT`、`DATABASE_URL`、`BETTER_AUTH_SECRET`、`AGENT_API_KEY` 等）；未配置 `DATABASE_URL` 时依赖数据库的测试会自动跳过。

```bash
# 交互式文档
open http://localhost:8080/docs

# 健康检查
curl http://localhost:8080/api/v1/health
```

### 测试

```bash
# 需要可用的 Postgres；建议显式带上 DATABASE_URL
env $(grep '^DATABASE_URL=' ../../.env | xargs) pnpm --filter api run test
```

## 部署

```bash
pnpm build                    # tsdown 产出 dist/index.mjs
pnpm start                    # node --env-file=./.env dist/index.mjs

# 或 Docker（docker/Dockerfile --target api）
pnpm docker:build:api         # 镜像名 gongji-crm-api:latest
```

生产环境必须配置：`DATABASE_URL`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、`BETTER_AUTH_TRUSTED_ORIGINS`、`INTERNAL_SYNC_API_KEY`。

## 脚本

| 脚本 | 说明 |
| --- | --- |
| `pnpm dev` | 开发服务器（tsx watch，8080） |
| `pnpm build` | tsdown 打包 |
| `pnpm start` | 运行生产构建 |
| `pnpm test` | `node:test` 回归测试（`src/lib/*.test.ts`） |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript |

## 相关文档

- 模块协作关系：[根 README](../../README.md#模块协作关系)
- 仓库约定：[AGENTS.md](../../AGENTS.md)
