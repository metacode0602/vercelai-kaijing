# apps/gpus — 最终用户控制台

面向**最终用户**（个人与企业客户）的 GPU 云控制台：选购与管理算力资源、查看用量与账单、充值与实名核验。

## 定位

| 项 | 说明 |
| --- | --- |
| 使用者 | 最终用户（购买算力的一方），区别于商户（`apps/merchant`）、供应商（`apps/supplier`）、平台运营（`apps/web`） |
| 作用 | 云资源的购买入口与运维入口，是整条计费链路的消费端 |
| 技术栈 | Next.js 16 App Router + Turbopack、React 19、tRPC、`@workspace/ui` |

## 主要功能

| 目录 | 功能 |
| --- | --- |
| `src/app/[locale]/(marketing)` | 对外营销页 |
| `src/app/[locale]/(auth)` | 登录 / 注册 / 找回密码 |
| `src/app/[locale]/console` | 控制台主体 |
| ├ `instances` / `apps` / `server` / `serverless` / `sandbox` / `metal` | 实例与各类算力产品（云主机、应用部署、裸金属、Serverless、沙箱）的列表、详情与操作 |
| ├ `preloaded` / `templates` / `storage` | 预装镜像、模板、存储 |
| ├ `billing` / `usage` / `recharge` | 账单、用量与充值 |
| ├ `tasks` | 任务与异步操作进度 |
| ├ `docs` | 站内文档入口 |
| ├ `settings` / `verify` | 账号设置与实名核验 |

数据链路遵循仓库统一分层：**UI → tRPC → mappers → dataaccess → Drizzle → `@workspace/db` → PostgreSQL**。
列表一律使用数据库级分页（`count` + `limit/offset`）。

## 运行

```bash
# 1) 前置：根目录 .env + Postgres + 迁移
pnpm install
cp .env.example .env          # 填充 DATABASE_URL / BETTER_AUTH_SECRET 等
docker compose up -d          # 本地 Postgres
pnpm --filter @workspace/db db:migrate

# 2) 启动
pnpm --filter gpus dev        # 或 pnpm run dev:gpus
```

访问 `http://localhost:40031`。

## 部署

应用自带 Dockerfile（multi-stage + standalone），在**仓库根目录**构建：

```bash
# 方式一：应用脚本
pnpm --filter gpus docker:build          # 镜像名 openroute-gpus:latest

# 方式二：根脚本
pnpm docker:build:gpus                   # 镜像名 gongji-crm-gpus:latest
```

```bash
docker run --rm -p 3000:3000 <镜像名>    # 端口按部署环境调整
```

运行时必须注入与构建时一致的环境变量（`DATABASE_URL`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、`BETTER_AUTH_TRUSTED_ORIGINS` 等）。

## 脚本

| 脚本 | 说明 |
| --- | --- |
| `pnpm dev` | Turbopack 开发服务器（40031） |
| `pnpm build` | 生产构建 |
| `pnpm start` | 运行生产构建 |
| `pnpm lint` | ESLint |
| `pnpm docker:build` | 构建 Docker 镜像 |

## 相关文档

- 模块协作关系：[根 README](../../README.md#模块协作关系)
- 仓库约定：[AGENTS.md](../../AGENTS.md)
