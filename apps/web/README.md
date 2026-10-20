# apps/web — 运营平台

面向**平台运营与商务**的中枢系统：客户/商户/供应商的全生命周期管理、财务与账单、大盘看板、平台定价，以及所有「平台侧 → 商户侧」的数据推送与定时任务。

## 定位

| 项 | 说明 |
| --- | --- |
| 使用者 | 平台运营、商务、财务、管理员 |
| 作用 | 平台侧唯一的数据与规则来源：CRM、定价、财务、大盘、定时任务、对外推送 |
| 技术栈 | Next.js 16 App Router、tRPC（superjson transformer + Dinero 序列化）、Drizzle ORM |
| 上下游 | 向 `apps/merchant` / `apps/supplier` 推送数据；与 `apps/api` 共享 `@workspace/db`、`@workspace/auth` |

> **全局原则**：商户平台的出账与数据均由 `apps/web` 提供并推送，`apps/merchant` 只做展示与确认。

## 主要功能

| tRPC 路由（`src/lib/server/routers/`） | 职责 |
| --- | --- |
| `crm` | 客户与销售线索、跟进、商务关系 |
| `merchant` | 商户增删改查、能力开关（`oem`/`promo`/`iframe`）、资金模式、平台同步 |
| `supplier` | 供应商、数据中心、设备与供应侧数据 |
| `finance` | 账单、发票、收款与财务视图 |
| `dashboard` | 大盘看板 KPI 与经营分析 |
| `admin` / `web` | 平台配置、站点与运营配置 |
| `integration` | 第三方集成（飞书等） |
| `scheduling` / `invitation` / `contact-binding` | 调度、邀请、联系人绑定 |

其他平台能力：

- **平台定价与毛利成本**：`platform-pricing`、`unit-costs`、`merchant_product_purchase_price`（`fixed_price` / `revenue_share`）、缺价站内信告警
- **对账中心**：`src/lib/server/dataaccess/recon/` 生成月度对账单（`merchantReconStatement` / `merchantReconDiff`），推送站内信给商户
- **定时任务**：`src/lib/server/jobs/register-*.ts`（对账单生成、算力券过期回收等），统一由 `/api/internal/cron/*` + `CRON_SECRET` 触发
- **白牌与品牌**：`merchant_branding`、自定义域名、外观配置的写入方

数据链路：**UI → tRPC → mappers → dataaccess（事务在此层）→ Drizzle → `@workspace/db` → PostgreSQL**。

## 运行

```bash
pnpm install
cp .env.example .env           # DATABASE_URL / BETTER_AUTH_SECRET / CRON_SECRET 等
docker compose up -d           # 本地 Postgres
pnpm --filter @workspace/db db:migrate
pnpm --filter web dev          # 或 pnpm run dev:web
```

访问 `http://localhost:40041`。另有 `apps/web/.env`、`apps/web/.env.production` 提供应用级覆盖。

> 单独跑类型检查时建议加大内存：
> `NODE_OPTIONS="--max-old-space-size=8192" pnpm --filter web run typecheck`

## 部署

```bash
pnpm docker:build:web          # docker/Dockerfile --target web → gongji-crm-web:latest
```

也可纳入批量构建：`pnpm docker:compose:build`（`docker/docker-compose.build.yml`）。

生产环境必须配置：

- `DATABASE_URL`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、`BETTER_AUTH_TRUSTED_ORIGINS`
- `CRON_SECRET`：定时任务接口鉴权（未配置则 `/api/internal/cron/*` 一律拒绝）
- 内部同步密钥 `INTERNAL_SYNC_API_KEY` 及外部开放平台相关变量（见根目录 `.env.example`）

## 脚本

| 脚本 | 说明 |
| --- | --- |
| `pnpm dev` | 开发服务器（40041） |
| `pnpm build` / `pnpm start` | 生产构建 / 运行 |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript 检查（建议加大堆内存） |

## 相关文档

- 模块协作关系：[根 README](../../README.md#模块协作关系)
- 仓库约定与分层规范：[AGENTS.md](../../AGENTS.md)
