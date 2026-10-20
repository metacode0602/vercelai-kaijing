# Serverless 商业化上线差距分析

> **日期**: 2026-07-25  
> **范围**: `product_line=serverless`（弹性服务）商业化 MVP 上线  
> **依据**: `serverless-implementation.md`、`../../business/product-line-taxonomy.md`、`database-design.md`  
> **现状**: 数据模型部分就绪，后端逻辑未实现，前端仅有 UI 壳

---

## 1. 结论：当前不满足商业化上线要求

Serverless 产品线当前**不具备商业化上线条件**。核心差距集中在以下层面：

| 层面 | 状态 | 阻塞等级 |
|------|------|---------|
| 数据库 Schema | `serverless_detail` 缺少关键字段 | 🔴 阻塞 |
| 计费集成 | 无按量扣款、无余额冻结 | 🔴 阻塞 |
| SkyPilot 集成 | 无调度/扩缩容/停止接口 | 🔴 阻塞 |
| 部署流程 | 前端 `setTimeout` Mock，零后端 | 🔴 阻塞 |
| 前端 UI | 购买/管理页面存在，但数据源为硬编码 | 🟡 可补 |
| 可中断调度 | 设计完整，实现为零 | 🟡 Phase2 |
| 跨区迁移 | 设计完整，实现为零 | ⚪ Phase3 |

---

## 2. 逐项差距分析

### 2.1 数据库 Schema 差距

#### 2.1.1 `serverless_detail` 表字段缺失

**当前实现** (`packages/db/src/compute-schema.ts`):

| 字段 | 类型 | 状态 |
|------|------|------|
| id | text PK | ✅ |
| computeBaseId | text FK | ✅ |
| faultTolerance | varchar(32) | ⚠️ 字段名与设计不一致（设计用 `interruptible` boolean） |
| minReplicas | int | ✅ |
| maxReplicas | int | ✅ |
| targetPort | int | ✅ |
| command | text | ✅ |
| envVars | jsonb | ✅ |
| endpointUrl | varchar(512) | ✅ |
| skyServeId | varchar(256) | ✅ |
| createdAt | timestamptz | ✅ |

**设计要求** (`serverless-implementation.md` §3.1) 但**缺失**的字段：

| 字段 | 类型 | 用途 | 必要性 |
|------|------|------|--------|
| `service_name` | varchar(255) NOT NULL | 服务名称（URL slug） | 🔴 MVP 必须 |
| `public_url` | varchar(512) | 公网访问地址 | 🔴 MVP 必须 |
| `internal_endpoint` | varchar(512) | 内部 ClusterIP 端点 | 🔴 MVP 必须 |
| `interruptible` | boolean DEFAULT true | 是否允许跨区调度 | 🟡 Phase2 |
| `preferred_region_id` | text | 首选区域 | 🟡 Phase2 |
| `allowed_region_ids` | text[] | 可调度区域集合 | 🟡 Phase2 |
| `region_policy` | varchar(32) | 区域策略 | 🟡 Phase2 |
| `current_region_id` | text | 当前部署区域 | 🟡 Phase2 |
| `last_migration_at` | timestamptz | 上次迁移时间 | 🟡 Phase2 |
| `migration_count` | int | 迁移次数 | 🟡 Phase2 |
| `drain_grace_seconds` | int | 排空宽限秒数 | 🟡 Phase2 |
| `endpoint_sticky` | boolean | 端点粘性 | 🟡 Phase2 |
| `data_disk_gb` | int | 本地数据盘 | 🟡 Phase2 |
| `data_disk_paid_gb` | int | 付费扩容数据盘 | 🟡 Phase2 |
| `volume_id` | text | S3 网络卷 | 🟡 Phase2 |
| `volume_mount_path` | varchar(255) | 卷挂载路径 | 🟡 Phase2 |
| `service_config` | jsonb | 服务配置 | 🟡 Phase2 |

**`faultTolerance` vs `interruptible` 命名问题**：
- 当前实现用 `faultTolerance: 'interruptible' | 'non_interruptible'`
- 设计要求用 `interruptible: boolean`（默认 `true`）
- 建议：MVP 阶段保持当前 `faultTolerance` 字段（语义等价），Phase2 迁移到 `interruptible` boolean

#### 2.1.2 `compute_base` 表字段偏差

**当前 `billing_mode` 注释**写的是 `postpaid | prepaid`，但 `../../business/product-line-taxonomy.md` 权威定义为 `on_demand | spot`。

| 字段 | 当前值 | 设计要求 | 必要性 |
|------|--------|---------|--------|
| `billingMode` 注释 | `postpaid \| prepaid` | `on_demand \| spot` | 🔴 注释修正 |
| `commitment` 注释 | `on_demand \| monthly \| yearly` | `on-demand \| hour \| daily \| weekly \| monthly` | 🔴 注释修正 |

> 注：实际枚举值可能已正确（`on_demand` 等），但注释误导开发者。需修正注释。

#### 2.1.3 缺失的表（Phase2+）

| 表名 | 用途 | 阶段 |
|------|------|------|
| `serverless_region_migration` | 迁移审计 | Phase2 |
| `region_compliance_domain` | 合规域 | Phase2 |
| `serve_endpoint` | Inference 端点（`serverless-inference.md`） | 另案 |
| `api_key` | Inference API 密钥 | 另案 |
| `inference_usage_record` | 推理用量 | 另案 |

### 2.2 计费集成差距

**设计要求** (`serverless-implementation.md` §6、`../../business/product-line-taxonomy.md` §4)：

| 功能 | 设计要求 | 实现状态 | 必要性 |
|------|---------|---------|--------|
| 按秒计费 (`commitment=on-demand`) | 每 5 分钟从 `tenant_balance.reserved` 扣减 | 🔴 未实现 | 🔴 MVP |
| 预付扣款 (`commitment=hour/daily/...`) | 创建时冻结余额，到期续费 | 🔴 未实现 | 🔴 MVP |
| 余额检查 | `SELECT ... FOR UPDATE` 行级锁 | 🔴 未实现 | 🔴 MVP |
| 余额三层防超额 | L1 提交冻结 / L2 定时扣款 / L3 到期检查 | 🔴 未实现 | 🟡 Phase2 |
| 价格快照 | 创建时冻结 `platform_card_price_record` 价格 | 🔴 未实现 | 🔴 MVP |
| 区域定价 | `supplier_datacenter_sell_price` 覆盖 | 🔴 未实现 | 🟡 Phase2 |

**`@workspace/billing` 包**已存在，提供 `freeze` / `consume_reserved` / `deduct` 原语。MVP 阶段需在部署流程中调用这些原语完成余额冻结和扣款。

### 2.3 SkyPilot 调度集成差距

**设计要求**：

| 功能 | API | 实现状态 | 必要性 |
|------|-----|---------|--------|
| 创建服务 | `POST /sky/api/serve` | 🔴 未实现 | 🔴 MVP |
| 停止服务 | `DELETE /sky/api/serve/{id}` | 🔴 未实现 | 🔴 MVP |
| 扩缩容 | `PATCH /sky/api/serve/{id}` | 🔴 未实现 | 🟡 Phase2 |
| 查询状态 | `GET /sky/api/serve/{id}` | 🔴 未实现 | 🔴 MVP |
| 获取日志 | `GET /sky/api/serve/{id}/logs` | 🔴 未实现 | 🟡 Phase2 |
| 获取 Workers | `GET /sky/api/serve/{id}/workers` | 🔴 未实现 | 🟡 Phase2 |

**缺失的服务封装层**：
- `apps/gpus/src/lib/server/services/skypilot.ts` — SkyPilot REST API 封装
- 需处理：请求签名、超时、重试、错误映射

### 2.4 部署流程差距

**当前状态**：前端 `setTimeout` 模拟 → 内存状态管理，零后端持久化。

**MVP 要求的部署流程**：

```
用户点击「部署」
  → tRPC createServerless
    → 1. 校验：名称唯一性、余额充足、卡型/区域可用
    → 2. 价格快照：从 platform_card_price_record 获取当前价
    → 3. 余额冻结：调用 @workspace/billing freeze
    → 4. 写入 compute_base + serverless_detail (status=creating)
    → 5. 调用 SkyPilot 创建 Deployment
    → 6. 更新 status=running, public_url, internal_endpoint
    → 7. 返回给前端
```

**当前完全缺失**：步骤 1-7 全部为 Mock。

### 2.5 tRPC Router 差距

**已存在** (`apps/gpus/src/lib/server/routers/compute.ts`)：

| 接口 | 状态 | 说明 |
|------|------|------|
| `cloudVmList` | ✅ 已实现 | DB 查询 compute_base |
| `serverlessList` | ✅ 已实现 | DB 查询 compute_base |
| `createCloudVm` | ❌ 缺失 | |
| `stopCloudVm` | ❌ 缺失 | |
| `createServerless` | ❌ 缺失 | |
| `stopServerless` | ❌ 缺失 | |
| `scaleServerless` | ❌ 缺失 | |
| `updateServerlessConfig` | ❌ 缺失 | |

**MVP 需新增**：

| 接口 | 类型 | 说明 |
|------|------|------|
| `createServerless` | mutation | 创建部署 |
| `stopServerless` | mutation | 停止服务 |
| `startServerless` | mutation | 启动已停止服务 |
| `deleteServerless` | mutation | 删除服务 |
| `getServerlessDetail` | query | 服务详情 |

### 2.6 Dataaccess 层差距

**已存在** (`apps/gpus/src/lib/server/dataaccess/compute/compute-base.ts`)：

| 功能 | 状态 |
|------|------|
| `listComputeBases` | ✅ 已实现 |
| `getComputeBaseById` | ✅ 已实现 |
| `createComputeBase` | ✅ 已实现 |
| `updateComputeBaseStatus` | ✅ 已实现 |
| `createCloudVmDetail` | ✅ 已实现 |
| `createServerlessDetail` | ✅ 已实现 |

**MVP 需新增**：

| 功能 | 说明 |
|------|------|
| `createServerlessDeployment` | 事务：校验 + 写入 + 调度 |
| `stopServerlessDeployment` | 事务：停止 + 结算 |
| `getServerlessPricing` | 查询 platform_card_price_record |
| `snapshotServerlessPrice` | 冻结价格到 compute_base |

### 2.7 前端差距

**MVP 需改造的页面**：

| 页面 | 当前状态 | 需改造内容 |
|------|---------|-----------|
| `/serverless/deploy` | 硬编码 GPU/区域/模板 | 从 DB 查询 GPU 卡型、区域、价格 |
| `/serverless/instances` | 内存状态 `useStore()` | 改为 tRPC `serverlessList` 查询 |
| `/serverless/instances/:id` | 内存状态 | 改为 tRPC `getServerlessDetail` |

**货币单位不一致**：`apps/gpus/src/lib/gpu-data.ts` 使用 USD (`$`)，设计要求 CNY (`¥`)。

---

## 3. MVP 实施计划（商业化最小可行路径）

### Phase 0：Schema 补全 + 注释修正（1天）

| 任务 | 文件 | 说明 |
|------|------|------|
| 0.1 | `compute-schema.ts` | 修正 `billingMode` / `commitment` 注释 |
| 0.2 | `compute-schema.ts` | `serverless_detail` 新增 `serviceName`、`publicUrl`、`internalEndpoint` |
| 0.3 | `compute-schema.ts` | 生成 Drizzle migration |

### Phase 1：部署后端流程（3-5天）

| 任务 | 文件 | 说明 |
|------|------|------|
| 1.1 | `dataaccess/compute/serverless.ts` | 新建 `createServerlessDeployment` 事务 |
| 1.2 | `services/skypilot.ts` | 新建 SkyPilot REST API 封装（创建/停止/查询） |
| 1.3 | `routers/compute.ts` | 新增 `createServerless` / `stopServerless` / `startServerless` / `deleteServerless` |
| 1.4 | `dataaccess/compute/serverless.ts` | 新增 `getServerlessPricing` + `snapshotServerlessPrice` |
| 1.5 | 集成 `@workspace/billing` | 部署时余额冻结，停止时最终结算 |

### Phase 2：前端对接（2-3天）

| 任务 | 文件 | 说明 |
|------|------|------|
| 2.1 | `/serverless/deploy/page.tsx` | 替换硬编码 → tRPC 查询 GPU/区域/价格 |
| 2.2 | `/serverless/instances/` | 替换 `useStore()` → tRPC `serverlessList` |
| 2.3 | `/serverless/instances/[id]/` | 替换内存状态 → tRPC `getServerlessDetail` |
| 2.4 | `gpu-data.ts` | 货币单位修正 USD → CNY |

### Phase 3：运维与监控（可延后）

| 任务 | 说明 |
|------|------|
| 3.1 | 状态轮询（定时查询 SkyPilot 状态更新 compute_base） |
| 3.2 | 按秒计费定时扣款（每 5 分钟遍历 running 任务） |
| 3.3 | 到期检查（commitment=hour/daily/... 到期停止） |

### 后续阶段（非 MVP）

| 阶段 | 内容 |
|------|------|
| Phase 4 | 可中断调度（`interruptible` 默认 true + UI 选项） |
| Phase 5 | 跨区迁移（`serverless_region_migration` + sticky URL + 通知） |
| Phase 6 | 合规域 + SLA + 运营强制迁移 |
| Phase 7 | Inference 产品线（另案） |

---

## 4. 需要确认的决策点

在开始实施前，需确认以下设计决策：

### 4.1 `faultTolerance` vs `interruptible`

| 选项 | 说明 |
|------|------|
| **A. 保持 `faultTolerance`** | 当前实现，语义等价，无需 migration |
| **B. 改为 `interruptible` boolean** | 与设计文档完全一致，需要 migration |

**建议**：选 A（保持 `faultTolerance`），Phase 2 可选迁移。

### 4.2 SkyPilot 集成方式

| 选项 | 说明 |
|------|------|
| **A. REST API 直接调用** | 简单直接，MVP 优先 |
| **B. 通过 Task API Server 中转** | 设计文档推荐，但增加复杂度 |

**建议**：选 A（REST API），MVP 快速验证。

### 4.3 计费粒度

| 选项 | 说明 |
|------|------|
| **A. 按秒计费 (on-demand)** | 设计要求，需 OpenMeter 或自建 |
| **B. 按小时预付 (hour)** | 简化实现，先支持预付模式 |

**建议**：MVP 先支持 `commitment=hour`（预付），`on-demand`（按秒）延后。

### 4.4 Mock 数据处理

| 选项 | 说明 |
|------|------|
| **A. 保留 Mock 作为 fallback** | DB 查询失败时降级到 Mock |
| **B. 完全替换为 DB 查询** | 删除所有 Mock 数据 |

**建议**：选 B，消除 Mock 保证数据一致性。

---

## 5. 总结

| 维度 | 当前 | MVP 目标 | 差距 |
|------|------|---------|------|
| Schema | 70% | 90% | 补 `serviceName`/`publicUrl`/`internalEndpoint` |
| 后端逻辑 | 0% | 60% | 部署/停止/查询 + 余额冻结 |
| SkyPilot | 0% | 40% | 创建/停止/查询 |
| 前端 UI | 80% (Mock) | 90% (DB) | 替换 Mock → tRPC |
| 计费 | 0% | 30% | 预付模式 (hour) |
| 可中断调度 | 0% | 0% | Phase2 |
| 跨区迁移 | 0% | 0% | Phase3 |

**预估工作量**：MVP 实施约 **6-9 人天**。

---

## 6. 文件修改清单（确认后执行）

### 需修改的文件

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| `packages/db/src/compute-schema.ts` | 修改 | 补字段 + 修正注释 |
| `packages/db/drizzle/` | 新增 | 生成 migration |
| `apps/gpus/src/lib/server/dataaccess/compute/serverless.ts` | 新建 | Serverless 部署/停止/查询 |
| `apps/gpus/src/lib/server/services/skypilot.ts` | 新建 | SkyPilot API 封装 |
| `apps/gpus/src/lib/server/routers/compute.ts` | 修改 | 新增 createServerless 等路由 |
| `apps/gpus/src/app/[locale]/console/serverless/deploy/page.tsx` | 修改 | DB 查询替换 Mock |
| `apps/gpus/src/app/[locale]/console/serverless/instances/page.tsx` | 修改 | tRPC 替换 useStore |
| `apps/gpus/src/app/[locale]/console/serverless/instances/[id]/page.tsx` | 修改 | tRPC 替换 Mock |
| `apps/gpus/src/lib/gpu-data.ts` | 修改 | 货币单位 USD → CNY |

### 需新建的文件

| 文件 | 说明 |
|------|------|
| `apps/gpus/src/lib/server/dataaccess/compute/serverless.ts` | Serverless 数据访问 |
| `apps/gpus/src/lib/server/services/skypilot.ts` | SkyPilot REST API |
