# OEM 品牌站集成合约

> **版本**: v1.0  
> **日期**: 2026-09-23  
> **状态**: 设计规范  
> **参考**: `merchant-product-plan.md` v0.3 Q6'=B / Q7=A / Q13-Q18

## 1. 概述

本文档定义 **OEM 品牌站**（独立仓库 fork `apps/gpus`）与**平台服务**之间的集成合约。

### 1.1 架构分离（Q18=B 客户自托管）

```text
【平台侧】
  apps/api (OpenAPI)
    ↑
    │ HTTPS (跨网络)
    │
【OEM 客户侧（自托管）】
  品牌站应用 (fork apps/gpus)
  品牌站 DB (PostgreSQL)
  白牌商户控制台 (一套 apps/merchant 多租户)
```

- 品牌站 **独立域名（CNAME）**、**独立数据库**、**拆分部署**（Q9=A / Q13=B / Q18=B）
- 品牌站库承载：用户、租户、销售价、站内账单（自洽）
- 进货价由平台库权威，定时/事件同步副本到品牌站库（Q15=B）
- **任务** 的发布/获取/修改/监控一律品牌站 tRPC → 平台 `apps/api` OpenAPI（Q7=A / Q16=A）

### 1.2 唯一差异原则（Q7=A）

> **品牌站与官方 `apps/gpus` 的唯一产品差异**：品牌站对算力**任务**的发布/获取/修改/监控，通过品牌站自身 tRPC 层调用 **`apps/api`** 接口完成。
>
> **其它业务**（登录、注册、充值、账单列表、镜像等）可直连品牌站库或约定服务。

---

## 2. 平台 API 合约

### 2.1 API Base URL

```
https://platform-api.example.com/api/v1
```

客户需配置此 URL 为品牌站环境变量：`PLATFORM_API_BASE_URL`。

### 2.2 认证方式

品牌站调用平台 API 时需携带：

1. **Bearer Token** 或 **API Key**（待平台实施期确定）
2. **商户标识** (`merchantId`) 和 **租户标识** (`tenantId`) 在请求体或 header 中传递

平台 API 验证：
- 商户 OEM 特性已启用（`merchant.oem_enabled = true`）
- 租户归属该商户（`tenant.merchant_id = merchantId`）

### 2.3 任务 OpenAPI（`/api/v1/tasks`）

品牌站 **必须** 调用以下接口实现任务功能（Q16=A）：

#### 2.3.1 创建任务

```http
POST /api/v1/tasks
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "training-job-1",
  "type": "job",  // "job" | "serverless" | "vm" | "spot"
  "merchantId": "mch_xxx",
  "tenantId": "tenant_xxx",
  "gpuCardType": "A100-80G",
  "gpuCount": 2,
  "imageId": "img_pytorch_2.0",
  "command": "python train.py",
  "config": {
    "region": "us-west",
    "dataVolume": "/data"
  }
}
```

**响应** (201 Created):
```json
{
  "task": {
    "id": "task_12345",
    "name": "training-job-1",
    "type": "job",
    "status": "pending",
    "merchantId": "mch_xxx",
    "tenantId": "tenant_xxx",
    "gpuCardType": "A100-80G",
    "gpuCount": 2,
    "createdAt": "2026-09-23T15:30:00Z",
    "updatedAt": "2026-09-23T15:30:00Z"
  }
}
```

#### 2.3.2 查询任务列表

```http
GET /api/v1/tasks?merchantId=mch_xxx&tenantId=tenant_xxx&status=running&limit=20&offset=0
Authorization: Bearer <token>
```

**响应** (200 OK):
```json
{
  "tasks": [
    {
      "id": "task_12345",
      "name": "training-job-1",
      "type": "job",
      "status": "running",
      "merchantId": "mch_xxx",
      "tenantId": "tenant_xxx",
      "startedAt": "2026-09-23T15:31:00Z",
      "createdAt": "2026-09-23T15:30:00Z",
      "updatedAt": "2026-09-23T15:31:00Z"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

#### 2.3.3 获取任务详情

```http
GET /api/v1/tasks/{taskId}
Authorization: Bearer <token>
```

**响应** (200 OK):
```json
{
  "id": "task_12345",
  "name": "training-job-1",
  "type": "job",
  "status": "running",
  "merchantId": "mch_xxx",
  "tenantId": "tenant_xxx",
  "gpuCardType": "A100-80G",
  "gpuCount": 2,
  "imageId": "img_pytorch_2.0",
  "command": "python train.py",
  "config": {
    "region": "us-west",
    "dataVolume": "/data"
  },
  "startedAt": "2026-09-23T15:31:00Z",
  "createdAt": "2026-09-23T15:30:00Z",
  "updatedAt": "2026-09-23T15:31:00Z"
}
```

#### 2.3.4 更新任务（取消）

```http
PATCH /api/v1/tasks/{taskId}
Content-Type: application/json
Authorization: Bearer <token>

{
  "status": "cancelled"
}
```

**响应** (200 OK): 返回更新后的任务对象。

#### 2.3.5 监控任务状态（轻量级）

```http
GET /api/v1/tasks/{taskId}/status
Authorization: Bearer <token>
```

**响应** (200 OK):
```json
{
  "id": "task_12345",
  "status": "running",
  "progress": 45,
  "message": "Training epoch 45/100"
}
```

### 2.4 错误响应

所有接口遵循统一错误格式：

```json
{
  "error": "Invalid merchantId or tenant does not belong to merchant"
}
```

HTTP 状态码：
- `400` Bad Request（参数错误）
- `401` Unauthorized（未授权）
- `403` Forbidden（商户/租户权限不足）
- `404` Not Found（任务不存在）
- `500` Internal Server Error（服务端错误）

---

## 3. 进货价同步（Q15=B）

### 3.1 同步方式

平台定时（如每小时）或在进货价变更时，向品牌站推送进货价同步 payload：

```http
POST /api/sync/purchase-prices
Content-Type: application/json
X-Platform-Signature: <HMAC-SHA256>

{
  "merchantId": "mch_xxx",
  "prices": [
    {
      "dataCenterId": "dc_beijing",
      "gpuCardTypeId": "gpu_a100_80g",
      "productLine": "job",
      "billingUnit": "hour",
      "purchasePrice": "10.5000",
      "currency": "CNY",
      "effectiveFrom": "2026-09-01",
      "effectiveTo": null,
      "status": "active"
    }
  ],
  "syncedAt": "2026-09-23T16:00:00Z"
}
```

品牌站需实现 `/api/sync/purchase-prices` 接口接收同步数据。

### 3.2 安全验证

品牌站**计划**验证 `X-Platform-Signature` header（HMAC-SHA256）确保请求来自平台——**当前 apps/api 仅实现 `Authorization: API-Key` 鉴权，HMAC 验签为待实施项（非现网能力）**。

### 3.3 数据存储

品牌站库需创建 `merchant_purchase_price_sync` 表（或复用 `merchant_purchase_price` 表添加 `source='platform_sync'` 标记），存储进货价副本。

---

## 4. 品牌站 tRPC 层改造

### 4.1 任务相关 procedures 改造

品牌站 `apps/gpus` fork 后，需修改以下 tRPC procedures 以调用平台 API：

#### 原代码（官方 gpus，直连 SkyPilot）

```typescript
// apps/gpus/src/lib/server/routers/compute.ts
export const computeRouter = router({
  createTask: protectedProcedure
    .input(z.object({ name: z.string(), type: z.enum(['job', 'vm']), ... }))
    .mutation(async ({ input, ctx }) => {
      // 原逻辑：直连 SkyPilot 或本地服务
      const task = await skypilot.createTask(input)
      return task
    }),
})
```

#### 改造后（品牌站，调用平台 API）

```typescript
// brand-site/src/lib/server/routers/compute.ts
import { env } from '@/lib/env'  // 读取 PLATFORM_API_BASE_URL

export const computeRouter = router({
  createTask: protectedProcedure
    .input(z.object({ name: z.string(), type: z.enum(['job', 'vm']), ... }))
    .mutation(async ({ input, ctx }) => {
      const merchantId = await resolveMerchantId(ctx.session)
      const tenantId = ctx.session.tenantId  // 或从 session 解析

      // 调用平台 API
      const response = await fetch(`${env.PLATFORM_API_BASE_URL}/api/v1/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.PLATFORM_API_TOKEN}`,
        },
        body: JSON.stringify({
          name: input.name,
          type: input.type,
          merchantId,
          tenantId,
          gpuCardType: input.gpuCardType,
          gpuCount: input.gpuCount,
          imageId: input.imageId,
          command: input.command,
          config: input.config,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.error || 'Failed to create task',
        })
      }

      const { task } = await response.json()
      return task
    }),

  listTasks: protectedProcedure
    .input(z.object({ status: z.string().optional(), ... }))
    .query(async ({ input, ctx }) => {
      const merchantId = await resolveMerchantId(ctx.session)
      const tenantId = ctx.session.tenantId

      const params = new URLSearchParams({
        merchantId,
        tenantId,
        ...(input.status && { status: input.status }),
        limit: '20',
        offset: '0',
      })

      const response = await fetch(
        `${env.PLATFORM_API_BASE_URL}/api/v1/tasks?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${env.PLATFORM_API_TOKEN}`,
          },
        }
      )

      if (!response.ok) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch tasks' })
      }

      const data = await response.json()
      return data.tasks
    }),
})
```

### 4.2 需要改造的 routers

品牌站需改造以下 routers 的**任务相关** procedures：

- `computeRouter` — 任务创建、列表、详情、取消
- `tasksRouter` — 任务监控、状态查询
- `jobsRouter` — Job 类型任务
- `serverlessRouter` — Serverless 类型任务（如有）

### 4.3 环境变量配置

品牌站需在 `.env` 中配置：

```bash
# 平台 API 配置
PLATFORM_API_BASE_URL=https://platform-api.example.com/api/v1
PLATFORM_API_TOKEN=<merchant_api_token>

# 商户标识（可选，若从 session 解析则不必配置）
MERCHANT_ID=mch_xxx
```

---

## 5. 品牌站数据库 Schema

### 5.1 核心表（Q13=B 品牌站库自洽）

品牌站独立 DB 需包含以下表：

#### 用户与租户

```sql
-- 用户表
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 租户表
CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  merchant_id TEXT NOT NULL,  -- 归属商户（固定为当前 OEM 商户）
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  balance NUMERIC(15, 4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 进货价副本（Q15=B）

```sql
-- 进货价副本表（平台同步）
CREATE TABLE merchant_purchase_price_sync (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  data_center_id TEXT NOT NULL,
  gpu_card_type_id TEXT NOT NULL,
  product_line VARCHAR(32) NOT NULL,
  billing_unit VARCHAR(16) NOT NULL DEFAULT 'hour',
  purchase_price NUMERIC(15, 4) NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'CNY',
  effective_from DATE NOT NULL,
  effective_to DATE,
  status VARCHAR(32) NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 销售价（Q15=B）

```sql
-- 销售价表（品牌站写入）
CREATE TABLE merchant_sales_price (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  data_center_id TEXT NOT NULL,
  gpu_card_type_id TEXT NOT NULL,
  product_line VARCHAR(32) NOT NULL,
  billing_unit VARCHAR(16) NOT NULL DEFAULT 'hour',
  sales_price NUMERIC(15, 4) NOT NULL,
  purchase_price NUMERIC(15, 4) NOT NULL,  -- 快照
  currency VARCHAR(8) NOT NULL DEFAULT 'CNY',
  effective_from DATE NOT NULL,
  effective_to DATE,
  status VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 站内账单（Q13=B 自洽）

```sql
-- 租户月账单
CREATE TABLE tenant_bills (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  bill_month VARCHAR(7) NOT NULL,  -- YYYY-MM
  total_amount NUMERIC(15, 4) NOT NULL,
  balance_amount NUMERIC(15, 4) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 任务缓存（可选，Q13=B 任务以 API 为准）

```sql
-- 任务缓存表（可选，缓存平台 API 响应以减少网络调用）
CREATE TABLE task_cache (
  id TEXT PRIMARY KEY,  -- task_id from platform
  tenant_id TEXT NOT NULL,
  status VARCHAR(32) NOT NULL,
  task_data JSONB NOT NULL,  -- 完整任务对象
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX task_cache_tenant_status_idx ON task_cache (tenant_id, status);
CREATE INDEX task_cache_expires_at_idx ON task_cache (expires_at);
```

### 5.2 迁移策略

品牌站首次部署时：

1. 执行品牌站库 Schema 初始化脚本
2. 从平台获取初始进货价同步数据
3. 配置定时任务（cron 或 webhook）接收进货价更新

---

## 6. 白牌商户控制台（Q17=A 一套多租户）

### 6.1 部署模式

**一套** `apps/merchant` 部署，按**客户域名**多租户路由与主题（Q17=A）。

### 6.2 域名路由

商户控制台需识别请求域名，解析对应商户：

```typescript
// apps/merchant/src/middleware.ts
export async function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || ''

  // 查询 merchant_branding 表获取 merchantId
  const branding = await db.query.merchantBranding.findFirst({
    where: eq(merchantBranding.customDomain, hostname),
  })

  if (!branding) {
    return NextResponse.redirect(new URL('/404', request.url))
  }

  // 注入 merchantId 到 request headers（供 tRPC context 使用）
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-merchant-id', branding.merchantId)

  return NextResponse.next({
    request: { headers: requestHeaders },
  })
}
```

### 6.3 主题配置

白牌控制台需从 `merchant_branding` 表读取主题配置（Q10）：

- `brand_name` — 品牌名称
- `logo_url` — Logo URL
- `primary_color` — 主题色
- `theme_config` — 其它主题配置（JSON）

主题应用到 UI：

```typescript
// apps/merchant/src/app/layout.tsx
export default async function RootLayout({ children }) {
  const merchantId = await resolveMerchantIdFromDomain()
  const branding = await db.query.merchantBranding.findFirst({
    where: eq(merchantBranding.merchantId, merchantId),
  })

  return (
    <html>
      <head>
        <title>{branding?.brandName ?? 'Merchant Console'}</title>
        <style>{`:root { --primary-color: ${branding?.primaryColor}; }`}</style>
      </head>
      <body>
        <ThemeProvider theme={branding?.themeConfig}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
```

### 6.4 认证（Q14=A 平台身份）

商户账号认证到**平台身份体系**（`apps/web` 或平台统一认证服务）。

控制台主要读写**平台库**；品牌站库仅只读或经 API 查询（Q14=A）。

---

## 7. 部署与运维（Q18=B 客户自托管）

### 7.1 客户责任

- **基础设施**：客户自备 Kubernetes / Docker / VM 集群
- **数据库**：客户自建 PostgreSQL 实例（品牌站 DB）
- **域名与证书**：客户配置 CNAME 记录指向品牌站应用；客户负责 SSL/TLS 证书申请与续期
- **部署**：客户使用平台提供的 Docker 镜像或源码制品部署品牌站

### 7.2 平台责任

- **制品交付**：平台提供品牌站 Docker 镜像或编译产物（`brand-site.tar.gz`）
- **API 服务**：平台维护 `apps/api` 的高可用与性能
- **进货价同步**：平台负责向品牌站推送进货价更新（webhook 或定时轮询）
- **技术支持**：平台提供部署文档、故障排查指南

### 7.3 部署示例（Docker Compose）

```yaml
# docker-compose.yml
version: '3.8'

services:
  brand-site:
    image: platform-registry.example.com/brand-site:latest
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/brand_site
      - PLATFORM_API_BASE_URL=https://platform-api.example.com/api/v1
      - PLATFORM_API_TOKEN=${PLATFORM_API_TOKEN}
      - MERCHANT_ID=mch_xxx
    depends_on:
      - db

  db:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=brand_site

volumes:
  pgdata:
```

### 7.4 监控与日志

客户需自行配置：
- **应用监控**：Prometheus / Grafana
- **日志收集**：ELK / Loki
- **告警**：Alertmanager

平台提供健康检查接口：
- 品牌站：`GET /api/health`
- 平台 API：`GET /api/v1/health`

---

## 8. 版本兼容性

### 8.1 API 版本管理

平台 API 遵循语义化版本 (SemVer)：

- **主版本** (v1, v2) — Breaking Changes（需品牌站更新代码）
- **次版本** (v1.1, v1.2) — 新增功能（向后兼容）
- **修订版** (v1.1.1) — Bug 修复（向后兼容）

品牌站应定期更新以支持新 API 版本。

### 8.2 废弃策略

平台废弃旧 API 版本时，至少提前 **6 个月** 通知客户，并提供迁移指南。

---

## 9. 安全与合规

### 9.1 数据隔离

- 品牌站 DB 与平台 DB **物理隔离**
- 品牌站只能访问自己商户的数据（通过 `merchantId` / `tenantId` 校验）
- 平台 API 验证每个请求的商户/租户归属

### 9.2 传输加密

- 品牌站 → 平台 API 必须使用 **HTTPS**（TLS 1.2+）
- 平台 → 品牌站进货价同步使用 **HTTPS + HMAC 签名**

### 9.3 审计日志

平台 API 记录所有调用日志（商户、租户、操作、时间戳），保留至少 **12 个月**。

---

## 10. FAQ

### Q1: 品牌站如何获取 API Token？

商户管理员在白牌控制台「设置 → API 凭证」页面生成 API Token，配置到品牌站环境变量 `PLATFORM_API_TOKEN`。

### Q2: 进货价同步失败怎么办？

品牌站应实现失败重试机制（指数退避）；若长时间失败，品牌站可降级展示平台刊例价（Q5=C）。

### Q3: 任务状态不一致如何处理？

任务状态以平台 API 响应为准（Q13=B）。品牌站可缓存任务状态（设置短 TTL 如 30 秒），但查询详情时应调用 API 获取最新状态。

### Q4: 品牌站可以自定义任务调度逻辑吗？

**不可以**。任务调度由平台 API 统一管理（Q7=A / Q16=A）；品牌站只能通过 API 提交任务参数。

### Q5: 白牌控制台如何切换商户？

白牌控制台通过**域名**解析商户（Q17=A），不支持单域名多商户切换。每个 OEM 商户需配置独立域名（如 `admin.customer-a.com`, `admin.customer-b.com`）。

---

## 附录 A：完整 API Endpoint 列表

| Endpoint | Method | 描述 |
|----------|--------|------|
| `/api/v1/tasks` | POST | 创建任务 |
| `/api/v1/tasks` | GET | 查询任务列表 |
| `/api/v1/tasks/{id}` | GET | 获取任务详情 |
| `/api/v1/tasks/{id}` | PATCH | 更新任务（取消） |
| `/api/v1/tasks/{id}/status` | GET | 获取任务状态 |

平台后续可扩展以下接口（当前版本 **不要求**）：
- `/api/v1/images` — 镜像管理
- `/api/v1/volumes` — 存储卷管理
- `/api/v1/billing` — 账单查询

---

## 附录 B：品牌站 Fork Checklist

从 `apps/gpus` fork 创建品牌站时，需执行以下步骤：

- [ ] 复制 `apps/gpus` 代码到独立仓库 `brand-site`
- [ ] 更新 `package.json` 中的应用名称与依赖
- [ ] 修改 tRPC routers 中的任务相关 procedures（见 §4.1）
- [ ] 创建品牌站 DB Schema（见 §5.1）
- [ ] 配置环境变量 `PLATFORM_API_BASE_URL` 和 `PLATFORM_API_TOKEN`（见 §4.3）
- [ ] 实现进货价同步接口 `/api/sync/purchase-prices`（见 §3.1）
- [ ] 配置主题化 UI（从 `merchant_branding` 表读取）
- [ ] 配置 CNAME 域名与 SSL 证书
- [ ] 部署到客户自托管环境（见 §7.3）
- [ ] 测试任务创建、查询、取消流程
- [ ] 验证进货价同步与销售价展示

---

**文档结束**
