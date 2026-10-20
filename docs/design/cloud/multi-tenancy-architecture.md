# 闲时算力调度平台 — 多角色、多租户实现方案

## 1. 系统架构概述

本平台采用**四层组织模型**，支持平台（Platform）、供应商（Supplier）、经销商（Merchant）、租户（Tenant）四种组织类型，实现完整的多租户、多角色权限控制体系，服务于闲时算力资源的供给、调度与消费全链路。

### 1.1 技术栈

| 层级 | 技术 |
|------|------|
| 认证授权 | Better Auth 1.5.6 |
| API 框架 | tRPC v11 + TanStack React Query |
| ORM | Drizzle ORM 0.44.6 |
| 数据库 | PostgreSQL 17 |
| 前端 | Next.js 16 + React 19 + Tailwind CSS 4 |

---

## 2. 组织模型（Organization Model）

### 2.1 组织类型

```typescript
// packages/db/src/auth-schema.ts
organization.orgType: 'platform' | 'supplier' | 'merchant' | 'tenant'
```

| 类型 | 说明 | 典型用途 |
|------|------|----------|
| `platform` | 平台运营方 | 调度引擎管理、全局资源编排、审核与结算 |
| `supplier` | 供应商 | 提供物理算力设备（GPU/CPU 节点），设备自动接入平台调度池 |
| `merchant` | 经销商/代理商 | 代理和销售平台算力服务，发展终端租户，代运营 |
| `tenant` | 终端租户/用算方 | 提交算力任务、消费算力资源、查看账单 |

### 2.2 组织层级关系

```
platform (平台)
  ├── supplier-A (供应商A — 提供 GPU 节点)
  │     └── device-1, device-2, ... (自动注册接入调度池)
  ├── supplier-B (供应商B — 提供 CPU 节点)
  │     └── device-3, device-4, ...
  │
  ├── merchant-X (经销商X)
  │     ├── tenant-1 (租户1 — 某 AI 训练公司)
  │     └── tenant-2 (租户2 — 某渲染工作室)
  ├── merchant-Y (经销商Y)
  │     └── tenant-3 (租户3)
  │
  └── tenant-4 (直客 — 无经销商，直接对接平台)

关系说明：
  supplier → 平台（设备供给，单向供给关系）
  merchant → 平台（代理销售，可发展 tenant）
  tenant   → 平台 / merchant（消费算力，可由 merchant 代运营）
```

### 2.3 核心字段

```typescript
// organization 表关键字段
{
  id: string
  orgType: 'platform' | 'supplier' | 'merchant' | 'tenant'
  name: string
  slug: string

  // 经销商关联（仅 tenant）
  parentMerchantOrgId?: string

  // 供应商专属字段
  supplierType?: 'gpu' | 'cpu' | 'hybrid' | null
  supplierTier?: 'basic' | 'professional' | 'enterprise' | null
  supplierStatus?: 'pending' | 'approved' | 'suspended' | null
  commissionRate?: number | null           // 平台抽成比例

  // 经销商专属字段
  merchantTier?: 'basic' | 'professional' | 'enterprise' | null
  merchantStatus?: 'pending' | 'approved' | 'suspended' | null
  merchantCommissionRate?: number | null   // 经销商分成比例

  // 通用
  entryApproved: boolean
  status: 'active' | 'suspended' | 'archived'
  enterpriseVerificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected'
}
```

---

## 3. 业务域模型

### 3.1 供应商 — 设备供给

供应商的核心职责是向平台提供物理算力设备，设备通过标准协议自动注册接入调度池。

```typescript
// packages/db/src/supplier-schema.ts

// 供应商设备表
export const supplierDevice = pgTable('supplier_device', {
  id: text('id').primaryKey(),
  supplierOrgId: text('supplier_org_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),

  // 设备信息
  deviceName: text('device_name').notNull(),
  deviceType: varchar('device_type', { length: 16 }).notNull(),  // 'gpu' | 'cpu'
  deviceModel: text('device_model'),         // 如 "NVIDIA A100 80G"
  deviceUuid: text('device_uuid').notNull(), // 硬件唯一标识，用于自动注册

  // 算力规格
  computeScore: integer('compute_score').notNull(),  // 算力评分（FLOPS 归一化值）
  memoryMb: integer('memory_mb').notNull(),
  storageMb: integer('storage_mb'),
  bandwidthMbps: integer('bandwidth_mbps'),

  // 设备状态（调度引擎维护）
  status: varchar('status', { length: 20 }).default('offline'),
  // 'offline' | 'registering' | 'online' | 'busy' | 'listed' | 'maintenance' | 'retired'
  lastHeartbeatAt: timestamp('last_heartbeat_at'),
  currentTaskId: text('current_task_id'),

  // 接入配置
  endpoint: text('endpoint'),            // 设备通信地址
  protocolVersion: varchar('protocol_version', { length: 8 }).default('v1'),
  autoRegister: boolean('auto_register').default(true),

  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('supplier_device_org_idx').on(table.supplierOrgId),
  index('supplier_device_type_idx').on(table.deviceType),
  index('supplier_device_status_idx').on(table.status),
  uniqueIndex('supplier_device_uuid_uidx').on(table.deviceUuid),
])
```

#### 设备自动注册流程

```
1. 供应商部署设备 → 设备 Agent 启动
2. Agent 调用 POST /api/devices/register
   携带: deviceUuid, supplierApiKey, deviceType, specs
3. 平台验证 supplierApiKey → 查找 supplierOrgId
4. 自动创建 supplierDevice 记录，status = 'registering'
5. 调度引擎健康检查 → status = 'online'
6. 设备进入可用算力池，开始接收任务
```

### 3.2 经销商 — 代理销售

经销商代理平台算力服务，可发展终端租户，享受分成收益。

```typescript
// packages/db/src/merchant-schema.ts

// 经销商服务包表
export const merchantServicePack = pgTable('merchant_service_pack', {
  id: text('id').primaryKey(),
  merchantOrgId: text('merchant_org_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),

  name: text('name').notNull(),             // 如 "A100 训练加速包"
  description: text('description'),
  computeType: varchar('compute_type', { length: 16 }).notNull(), // 'gpu' | 'cpu' | 'hybrid'

  // 定价（经销商买入价 vs 零售价）
  wholesalePrice: integer('wholesale_price').notNull(),  // 经销商从平台采购价（分/时）
  retailPrice: integer('retail_price').notNull(),        // 零售价（分/时）
  currency: varchar('currency', { length: 3 }).default('CNY'),

  // 配额
  totalQuotaHours: integer('total_quota_hours').notNull(),     // 采购的总时长配额
  usedQuotaHours: integer('used_quota_hours').default(0),
  minTaskDurationMinutes: integer('min_task_duration_minutes').default(1),

  status: varchar('status', { length: 20 }).default('active'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('merchant_pack_org_idx').on(table.merchantOrgId),
])
```

### 3.3 租户 — 算力消费

租户是算力的最终消费者，提交计算任务并按用量付费。

```typescript
// packages/db/src/tenant-schema.ts

// 租户计算任务表
export const computeTask = pgTable('compute_task', {
  id: text('id').primaryKey(),
  tenantOrgId: text('tenant_org_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),

  // 任务信息
  taskName: text('task_name').notNull(),
  taskType: varchar('task_type', { length: 32 }).notNull(),
  // 'training' | 'inference' | 'rendering' | 'data_processing' | 'other'

  // 资源需求
  requiredDeviceType: varchar('required_device_type', { length: 16 }).notNull(),
  requiredMemoryMb: integer('required_memory_mb'),
  requiredComputeScore: integer('required_compute_score'),

  // 调度结果
  assignedDeviceId: text('assigned_device_id')
    .references(() => supplierDevice.id),
  assignedMerchantPackId: text('assigned_merchant_pack_id')
    .references(() => merchantServicePack.id),

  // 状态与时间
  status: varchar('status', { length: 20 }).default('pending'),
  // 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),

  // 用量计量
  computeTimeMinutes: integer('compute_time_minutes').default(0),
  computeCost: integer('compute_cost').default(0),  // 实际费用（分）

  // 来源追踪
  sourceType: varchar('source_type', { length: 16 }).notNull(),
  // 'direct' | 'merchant' — 直客 or 经销商渠道
  merchantOrgId: text('merchant_org_id'),

  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('compute_task_tenant_idx').on(table.tenantOrgId),
  index('compute_task_device_idx').on(table.assignedDeviceId),
  index('compute_task_status_idx').on(table.status),
  index('compute_task_merchant_idx').on(table.merchantOrgId),
])
```

---

## 4. 角色体系（Role System）

### 4.1 全局用户角色

```typescript
type GlobalUserRole = 'admin' | 'user' | 'sales'
```

| 角色 | 说明 |
|------|------|
| `admin` | 平台超级管理员 |
| `user` | 普通用户 |
| `sales` | 销售人员 |

### 4.2 组织成员角色（按组织类型）

#### 平台组织角色

| 角色 | 权限 |
|------|------|
| `platform_admin` | 平台管理员，全权管理调度引擎、供应商审核、经销商管理 |
| `platform_operator` | 调度运营，管理任务队列、设备调度策略 |
| `platform_finance` | 财务，管理结算、账单、对账 |
| `owner` / `admin` | 通用角色 |

#### 供应商组织角色

| 角色 | 权限 |
|------|------|
| `supplier_owner` | 供应商所有者，管理设备、查看收益 |
| `supplier_technician` | 技术人员，管理设备注册、维护、监控 |
| `supplier_viewer` | 查看者，只读设备与收益数据 |
| `owner` / `admin` | 通用角色 |

#### 经销商组织角色

| 角色 | 权限 |
|------|------|
| `merchant_owner` | 经销商所有者，管理服务包、发展租户、查看分成 |
| `merchant_sales` | 销售，可发展租户（不可改成员/分成） |
| `merchant_operator` | 运营，可代运营下属租户的任务 |
| `merchant_finance` | 财务，只读财务与分成数据 |
| `owner` / `admin` | 通用角色 |

#### 租户组织角色

| 角色 | 权限 |
|------|------|
| `tenant_owner` | 租户所有者，完全控制任务与账单 |
| `tenant_engineer` | 工程师，提交和管理计算任务 |
| `tenant_viewer` | 查看者，只读任务与用量数据 |
| `site_operator` | 站点运营，限定单项目操作 |

### 4.3 资源级作用域（Scope）

```typescript
// member 表
{
  scopeType: 'project' | 'task' | null
  scopeId: string | null
}
```

- `site_operator` 角色可限定到具体项目
- 无作用域 = 组织级别权限

---

## 5. 权限控制实现

### 5.1 tRPC 中间件链

```
publicProcedure
  └── protectedProcedure (登录校验 + 伪装身份处理)
      ├── adminProcedure (全局管理员/sales)
      ├── tenantOrgProcedure (租户上下文解析)
      │   ├── tenantWriteProcedure (有效订阅检查)
      │   │   ├── tenantOwnerProcedure (tenant_owner)
      │   │   ├── tenantEngineerProcedure (engineer+)
      │   │   └── tenantViewerProcedure (viewer+)
      ├── consoleOrgProcedure (任意组织上下文)
      │   ├── platformconsoleProcedure (platform + platform_admin)
      │   ├── supplierconsoleProcedure (supplier + read权限)
      │   │   ├── supplierconsoleWriteProcedure (write权限)
      │   │   └── supplierconsoleOwnerProcedure (owner权限)
      │   ├── merchantconsoleProcedure (merchant + read权限)
      │   │   ├── merchantconsoleWriteProcedure (write权限)
      │   │   ├── merchantconsoleOwnerProcedure (owner权限)
      │   │   └── merchantconsoleOperatorProcedure (operator权限)
      │   └── consoleOrgOwnerProcedure (动态：根据orgType判断)
```

### 5.2 关键中间件

#### 租户上下文解析 (`resolveTenantOrgContext`)

```typescript
export type TenantOrgContext = {
  tenantOrgId: string
  org: Organization
  membership: Member
  actedByMerchant: boolean            // 是否由经销商代运营
  actedByMerchantOrgId: string | null // 经销商组织ID
}
```

校验流程：
1. 从 session 或 `x-active-org-id` header 获取当前组织
2. 验证用户成员关系
3. 检查组织状态（非归档、已开通）
4. 处理经销商代运营场景（`x-acted-by-merchant` header）

#### 供应商上下文解析 (`resolveSupplierOrgContext`)

```typescript
export type SupplierOrgContext = {
  supplierOrgId: string
  org: Organization
  membership: Member
}
```

校验流程：
1. 验证组织类型为 `supplier`
2. 验证 `supplierStatus === 'approved'`
3. 验证用户成员角色

#### 设备作用域 (`device-scope.ts`)

```typescript
// 限制供应商只能操作自己的设备
assertDeviceInScope(ctx, deviceId)
// 调度引擎查询可用设备时自动排除非在线设备
filterDevicesForScheduling(db, deviceType, requiredSpecs)
```

### 5.3 角色校验函数

```typescript
// apps/web/src/lib/server/middleware/org-roles.ts
assertPlatformAdmin(role)
assertPlatformOperator(role)
assertSupplierOwner(role)
assertSupplierTechnician(role)
assertSupplierRead(role)
assertMerchantOwner(role)
assertMerchantWrite(role)
assertMerchantRead(role)
assertMerchantOperator(role)
assertTenantOwner(role)
assertTenantEngineer(role)
isValidRoleForOrgType(orgType, role)
```

---

## 6. 数据隔离策略

### 6.1 行级租户隔离

所有业务表均包含组织归属字段：

```typescript
// 供应商数据
supplierDevice.supplierOrgId

// 经销商数据
merchantServicePack.merchantOrgId

// 租户数据
computeTask.tenantOrgId
computeTask.merchantOrgId       // 追溯渠道来源

// 平台全局数据（无 orgId 约束）
// 调度策略、全局配额、结算汇总等
```

### 6.2 查询过滤

所有数据访问均通过 tRPC 中间件注入组织 ID，查询时自动过滤：

```typescript
// 供应商只能看到自己的设备
db.query.supplierDevice.findMany({
  where: eq(supplierDevice.supplierOrgId, ctx.supplierOrgId)
})

// 租户只能看到自己的任务
db.query.computeTask.findMany({
  where: eq(computeTask.tenantOrgId, ctx.tenantOrgId)
})

// 经销商可看到下属所有租户的任务
db.query.computeTask.findMany({
  where: eq(computeTask.merchantOrgId, ctx.merchantOrgId)
})
```

### 6.3 唯一性约束

```typescript
uniqueIndex('supplier_device_uuid_uidx').on(table.deviceUuid)       // 设备全局唯一
uniqueIndex('merchant_pack_org_name_uidx').on(table.name, table.merchantOrgId) // 同经销商下服务包名唯一
```

---

## 7. 经销商代运营机制

### 7.1 代运营流程

```
1. 经销商用户选择进入下属租户
2. 前端设置 activeOrganizationId = tenantId
3. 请求携带 x-acted-by-merchant: merchantOrgId header
4. 后端校验：
   - tenant.parentMerchantOrgId === merchantOrgId
   - 用户是 merchant 组织成员
5. 操作以租户身份执行，但记录经销商操作来源
```

### 7.2 前端实现

```typescript
// apps/web/src/lib/geo-console/org-context.tsx
// OrgProvider 管理组织切换
// 支持 merchant-to-tenant 代运营
// Toast 提示代运营状态
```

---

## 8. 算力调度核心

### 8.1 调度引擎架构

```
┌──────────────────────────────────────────────────────────────┐
│                      调度引擎 (Scheduler)                     │
│                                                              │
│  ┌────────────┐   ┌──────────────┐   ┌────────────────┐     │
│  │ 任务队列    │   │ 设备匹配器    │   │ 负载均衡器      │     │
│  │ TaskQueue  │──▶│ DeviceMatcher│──▶│ LoadBalancer   │     │
│  └────────────┘   └──────────────┘   └────────────────┘     │
│        ▲                                     │               │
│        │                                     ▼               │
│  ┌─────┴──────┐                     ┌────────────────┐      │
│  │ 租户提交    │                     │ 设备分配       │      │
│  │ 任务请求    │                     │ 执行 & 计量    │      │
│  └────────────┘                     └────────────────┘      │
└──────────────────────────────────────────────────────────────┘
         ▲                          │
         │                          ▼
┌────────┴───────┐          ┌───────────────────┐
│  供应商设备池   │          │  经销商服务包池     │
│  (online 设备) │          │  (可用配额)        │
└────────────────┘          └───────────────────┘
```

### 8.2 设备自动接入

```typescript
// 设备 Agent 与平台的通信协议
interface DeviceAgentProtocol {
  // 心跳上报（每 30s）
  heartbeat: {
    deviceUuid: string
    status: 'idle' | 'busy' | 'maintenance'
    currentLoad: number        // 0-100
    temperature?: number       // GPU 温度
    activeTaskId?: string
  }

  // 任务执行反馈
  taskProgress: {
    deviceId: string
    taskId: string
    progress: number           // 0-100
    stdout?: string
    error?: string
  }

  // 设备注册
  register: {
    deviceUuid: string
    supplierApiKey: string
    deviceType: 'gpu' | 'cpu'
    deviceModel: string
    specs: {
      memoryMb: number
      storageMb?: number
      bandwidthMbps?: number
      computeScore: number
    }
  }
}
```

### 8.3 调度策略

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| `least_loaded` | 优先分配负载最低的设备 | 通用场景 |
| `best_fit` | 按资源需求匹配最合适的设备 | 精细化调度 |
| `cost_optimized` | 优先使用低成本设备 | 成本敏感任务 |
| `merchant优先` | 优先使用经销商购买的配额 | 经销商渠道任务 |

---

## 9. 配额与计费

### 9.1 配额模型

```typescript
// org_quota 表
{
  orgId: string
  metric: 'compute_hours' | 'storage_mb' | 'task_slots' | 'concurrent_tasks'
  limit: number
  used: number
  source: 'platform_grant' | 'merchant_pool' | 'purchase'
}
```

### 9.2 配额分配链

```
平台 → 供应商 (设备池容量)
平台 → 经销商 (服务包配额池)
经销商 → 租户 (服务包分配)
平台 → 直客 (直接购买配额)
```

### 9.3 计费模型

```typescript
// 计费维度
{
  computeTimeMinutes: number    // 算力使用时长
  deviceType: 'gpu' | 'cpu'    // 设备类型
  computeScore: number          // 算力评分（加权）

  // 实际费用计算
  // cost = computeTimeMinutes × deviceRate × computeScoreWeight
}
```

| 角色 | 计费方式 |
|------|----------|
| 供应商 | 按设备在线时长 + 任务完成量 获取收益 |
| 经销商 | 按采购配额批发价 vs 零售价赚取差价 |
| 租户 | 按实际算力使用量付费 |

---

## 10. 审计日志

所有关键操作记录到 `audit_log` 表：

```typescript
{
  actorId: string
  organizationId: string
  orgType: 'platform' | 'supplier' | 'merchant' | 'tenant'
  resource: string
  resourceId: string
  action: string
  diff?: jsonb
  // 供应商特有
  deviceUuid?: string
  // 任务特有
  taskId?: string
}
```

---

## 11. UI 层角色感知

### 11.1 组织切换器

`OrganizationSwitcher` 组件：
- 仅当用户属于多个组织时显示
- 支持 platform / supplier / merchant / tenant 切换
- 代运营时显示特殊状态提示

### 11.2 路由分区

```
/console/workbench/          # 租户工作台（任务管理、用量查看）
/console/merchant/           # 经销商后台
  /console/merchant/packs/     # 服务包管理
  /console/merchant/tenants/   # 下属租户管理
  /console/merchant/billing/   # 分成与账单
/console/supplier/           # 供应商后台
  /console/supplier/devices/   # 设备管理
  /console/supplier/monitor/   # 设备监控
  /console/supplier/billing/   # 收益与结算
/console/platform/           # 平台管理
  /console/platform/scheduler/   # 调度引擎管理
  /console/platform/suppliers/   # 供应商审核
  /console/platform/merchants/   # 经销商管理
  /console/platform/tenants/     # 租户管理
  /console/platform/billing/     # 全局结算
```

### 11.3 客户端角色检查

```typescript
// 供应商
canSupplierManageDevices(membership)
canSupplierViewEarnings(membership)

// 经销商
canMerchantCreateTenant(membership)
canMerchantOperateTenant(membership)
canMerchantAllocateQuota(membership)
canMerchantInviteMember(membership)

// 租户
canTenantSubmitTask(membership)
canTenantViewBilling(membership)
```

---

## 12. 实施计划

### Phase 1: 数据模型与认证（2 周）

1. 扩展 `organization` 表 — 新增 `supplier` / `merchant` 类型及专属字段
2. 新增 `supplier_device` 表 — 设备注册与状态管理
3. 新增 `merchant_service_pack` 表 — 经销商服务包
4. 新增 `compute_task` 表 — 计算任务
5. Better Auth 组织插件配置扩展

### Phase 2: 权限体系与中间件（1.5 周）

1. 新增 `supplier_*` / `merchant_*` 角色定义
2. 新增 tRPC 过程：`supplierconsoleProcedure`、`merchantconsoleProcedure`
3. 新增中间件：`resolveSupplierOrgContext`、`resolveMerchantOrgContext`
4. 经销商代运营机制

### Phase 3: 供应商设备接入（2 周）

1. 设备自动注册 API（`POST /api/devices/register`）
2. 设备心跳上报与状态管理
3. 供应商后台 UI — 设备列表、监控、维护、上下架
4. 设备 Agent SDK（可选）

### Phase 4: 调度引擎（2-3 周）

1. 任务队列与调度策略实现
2. 设备匹配与负载均衡
3. 任务执行监控与进度反馈
4. 用量计量与计费

### Phase 5: 经销商与租户功能（2 周）

1. 经销商后台 — 服务包管理、租户管理、分成报表
2. 租户工作台 — 任务提交、用量查看、账单
3. 经销商代运营前端
4. 组织切换器

### Phase 6: 集成测试与上线（1-2 周）

1. 端到端测试
2. 性能压测（调度引擎）
3. 灰度发布
4. 文档与运维手册

**预计总工期：10-12 周**

---

## 附录 A：基础设施层多租户隔离（Capsule & SkyPilot）

本章概述业务层租户与 K8s 基础设施层的映射关系，完整设计详见 [`capsule-skypilot-multi-tenancy.md`](capsule-skypilot-multi-tenancy.md)。

### A.1 映射总览

| 平台业务层 | Capsule (K8s 隔离) | SkyPilot (调度) |
|-----------|-------------------|----------------|
| `organization` (orgType=tenant) | Capsule `Tenant` CRD（懒加载，首次任务时创建） | — |
| `organization.slug` | Namespace: `tenant-{slug}` | — |
| `org_quota` (GPU/CPU/Memory) | `ResourceQuota` | — |
| `balance` (余额) | ResourceQuota 动态上限 | — |
| `compute_task` | Pod in tenant namespace | SkyPilot Job (metadata.orgId) |

### A.2 核心流程（懒加载）

```
1. 租户提交首次任务 → Task API Server 检查 capsuleNamespaceReady
2. 若未就绪 → 调用 Capsule Sync Service → 每个 IDC 创建 Capsule Tenant + Namespace
3. 若已就绪 → 直接调度
4. 任务提交 → SkyPilot 注入 namespace + orgId → Pod 运行在租户 ns
5. 余额耗尽 → Sync Service → ResourceQuota 暂停 → 新任务无法创建
```

### A.3 设计文档

| 文档 | 说明 |
|------|------|
| `capsule-skypilot-multi-tenancy.md` | Capsule Tenant 懒加载映射、ResourceQuota 联动、SkyPilot 上下文注入、多 IDC 一致性、故障处理 |

---

## 附录 B：关键文件索引

| 类别 | 路径 | 说明 |
|------|------|------|
| 认证 Schema | `packages/db/src/auth-schema.ts` | organization 表含 orgType + Capsule 状态字段 |
| 权限定义 | `packages/auth/src/permissions.ts` | 四组织类型角色（13 个角色 + 辅助函数） |
| Auth 配置 | `packages/auth/src/options.ts` | organization 插件 + 角色注册 |
| Auth 工厂 | `packages/auth/src/server.ts` | createAuth() 统一创建入口 |
| 供应商设备 Schema | `packages/db/src/supplier-schema.ts` | — |
| 经销商服务包 Schema | `packages/db/src/merchant-schema.ts` | — |
| 计算任务 Schema | `packages/db/src/tenant-schema.ts` | — |
| tRPC 过程链 | `apps/web/src/lib/server/routers/trpc.ts` | — |
| 角色校验 | `apps/web/src/lib/server/middleware/org-roles.ts` | — |
| 租户上下文 | `apps/web/src/lib/server/middleware/resolve-tenant-org.ts` | — |
| 供应商上下文 | `apps/web/src/lib/server/middleware/resolve-supplier-org.ts` | — |
| 经销商上下文 | `apps/web/src/lib/server/middleware/resolve-merchant-org.ts` | — |
| console 上下文 | `apps/web/src/lib/server/middleware/resolve-console-org.ts` | — |
| 设备作用域 | `apps/web/src/lib/server/middleware/device-scope.ts` | — |
| 组织切换 | `apps/web/src/lib/geo-console/org-context.tsx` | — |
| 经销商角色 | `apps/web/src/lib/geo-console/merchant-roles.ts` | — |
| 供应商角色 | `apps/web/src/lib/geo-console/supplier-roles.ts` | — |
| Capsule & SkyPilot 多租户映射 | `capsule-skypilot-multi-tenancy.md` | — |
