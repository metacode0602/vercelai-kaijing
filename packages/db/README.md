# @workspace/db — 数据模型与迁移

全仓**唯一的数据模型来源**：Drizzle ORM 的表定义、关系与迁移。所有应用（`apps/web`、`apps/merchant`、`apps/supplier`、`apps/gpus`、`apps/api`）都只从这里读取 schema，不在各自应用内重复定义表结构。

## 定位

| 项 | 说明 |
| --- | --- |
| 作用 | 定义 PostgreSQL 表结构、关系、枚举与类型导出；产出并管理迁移 |
| 边界 | **只包含 schema 定义与类型**，不含业务逻辑，不引用任何 workspace 业务包（仅依赖 `drizzle-orm`） |
| 消费方 | 各 `apps/*`（经 dataaccess 层）、`packages/auth`（adapter）、`packages/billing` |

## Schema 组成

| 文件 | 领域 |
| --- | --- |
| `auth-schema.ts` | better-auth：`user` / `session` / `account` / `verification` |
| `merchant-schema.ts` | 商户域：`merchant`、`merchant_account`（+ 逐池余额）、`merchant_account_ledger`、`merchant_bill`、`merchant_recon_statement` / `merchant_recon_diff`、算力券、API Key scope、`merchant_branding`、进货价等 |
| `supply-schema.ts` / `supply-lifecycle-dictionary.ts` | 供应商、数据中心、设备、合同、发票 |
| `sla-schema.ts` | 机房 SLA 与月度报告 |
| `crm-schema.ts` | 客户与销售线索 |
| `finance-schema.ts` | 账单、发票、收款 |
| `platform-pricing-schema.ts` | 平台定价 |
| `gpus-consumer-schema.ts` | 最终用户侧：租户、计量、消费明细 |
| `dashboard-schema.ts` / `scheduling-schema.ts` / `feishu-schema.ts` | 大盘、调度、飞书集成 |
| `schema.ts` / `compute-schema.ts` | 汇总导出与计算相关定义 |

约定：

- 主键用 `text`（UUID）或序列；时间戳统一 `timestamp(..., { withTimezone: true }).defaultNow()`
- 金额统一 `numeric(name, { precision: 15, scale: 4 })`
- 枚举用 `varchar` + TypeScript union，避免数据库 enum 的迁移成本
- 聚合字段不入库，在 dataaccess 层用子查询计算

## 导出

| 导出 | 路径 | 说明 |
| --- | --- | --- |
| `.` | `src/index.ts` | 全部表、关系与 `schema` 对象 |
| `./schema` | `src/schema.ts` | 仅 schema（直接 import 用） |

## 脚本

```bash
# schema 变更后生成迁移（生成文件在 drizzle/，禁止手改）
pnpm --filter @workspace/db db:generate

# 应用待执行迁移
pnpm --filter @workspace/db db:migrate

# 不生成迁移文件直接推 schema（仅开发环境可用）
pnpm --filter @workspace/db db:push

# 校验迁移与 schema 一致性
pnpm --filter @workspace/db db:check

# 图形化查看数据
pnpm --filter @workspace/db db:studio
```

### 种子数据

```bash
pnpm --filter @workspace/db db:seed:metal      # 金属机 / 硬件清单
pnpm --filter @workspace/db db:seed:admin      # 平台管理员账号
pnpm --filter @workspace/db db:seed:funding    # 商户资金配置
pnpm --filter @workspace/db db:seed:images     # 基础镜像
pnpm --filter @workspace/db db:seed:metal      # 其余见 src/scripts/
```

## 运行前置

根目录 `.env` 中需有可连的 PostgreSQL：

```
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname
```

本地库一键启动：`docker compose up -d`。

## 部署

本包**不独立部署**，作为依赖随各应用构建发布：

- 迁移在发布流程中执行：`pnpm --filter @workspace/db db:migrate`
- 如使用 `db:push`，请仅限开发环境（生产应走迁移文件）

> 已知环境问题：若目标库从未用 drizzle-kit 记录过迁移账本（`drizzle.__drizzle_migrations` 为空但表已存在），`db:migrate` 会因「relation already exists」失败，此时应改用 `db:push` 或补齐账本。

## 相关文档

- 模块协作关系：[根 README](../../README.md#模块协作关系)
- 分层与查询规范：[AGENTS.md](../../AGENTS.md)
