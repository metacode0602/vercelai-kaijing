# K8s 云原生集成技术方案

> **状态**: ✅ 已采纳（2026-07-26）
> **范围**: gpus 应用与 Skypilot / K8s 的完全打通
> **对齐**: `serverless-implementation.md`、`tenant-balance-unification.md`、`monitoring-observability.md`、`storage-quota-and-s3-volume.md`、`billing-display.md`、`image-registry-optimization.md`
> **目标**: 实现 Pod 5分钟计费、日志追踪收集、PVC 存储操作、镜像拉取优化的完整闭环

---

## 目录

1. [架构总览](#1-架构总览)
2. [OpenMeter 用量计量](#2-openmeter-用量计量)
3. [Pod 5分钟计费循环](#3-pod-5分钟计费循环)
4. [镜像拉取优化](#4-镜像拉取优化)
5. [日志追踪与收集](#5-日志追踪与收集)
6. [PVC 存储操作](#6-pvc-存储操作)
7. [数据模型扩展](#7-数据模型扩展)
8. [API 设计](#8-api-设计)
9. [监控与告警](#9-监控与告警)
10. [安全与多租户](#10-安全与多租户)
11. [实施路线图](#11-实施路线图)
12. [附录](#12-附录)

---

## 1. 架构总览

### 1.1 系统架构

```mermaid
flowchart TB
    subgraph 前端[前端控制台]
        UI[用户界面]
        API[API Gateway]
    end

    subgraph 应用层[应用层]
        GPUS[gpus 应用<br/>tRPC + Server Components]
        LOG[日志服务<br/>Loki 集成]
    end

    subgraph 计量层[计量层 OpenMeter]
        OM[OpenMeter<br/>事件接收 + 实时聚合]
        METER[Meter 定义<br/>GPU/CPU/内存/存储]
        QUERY[查询 API<br/>增量用量]
    end

    subgraph 计算层[计算层]
        CRON[定时计费服务<br/>每5分钟拉增量]
        DAILY[日定时任务<br/>00:30 生成昨日账单]
        MONTHLY[月定时任务<br/>1日 生成上月账单]
    end

    subgraph 数据层[数据层]
        DB[(PostgreSQL<br/>Drizzle ORM)]
        REDIS[(Redis<br/>缓存 + 队列)]
        CLICKHOUSE[(ClickHouse<br/>OpenMeter 存储)]
    end

    subgraph 云原生层[云原生层]
        SKY[Skypilot Serve API]
        K8S[K8s API Server]
        CSI[CSI Driver<br/>存储]
    end

    subgraph 基础设施[基础设施]
        NODE[GPU 节点]
        PVC[PersistentVolume]
        LOGS[日志收集<br/>Promtail → Loki]
        METRICS[指标采集<br/>Prometheus]
        COLLECTOR[资源采集器<br/>每60秒上报]
    end

    UI --> API
    API --> GPUS
    GPUS --> DB
    GPUS --> REDIS
    GPUS --> SKY
    SKY --> K8S
    K8S --> NODE
    K8S --> PVC
    NODE --> METRICS
    NODE --> COLLECTOR
    COLLECTOR --> OM
    OM --> METER
    METER --> QUERY
    QUERY --> CRON
    CRON --> DB
    DAILY --> DB
    MONTHLY --> DB
    LOG --> DB
    LOG --> LOGS
    OM --> CLICKHOUSE
```

### 1.2 组件分工

| 组件 | 职责 | 技术栈 |
|------|------|--------|
| **gpus 应用** | 用户交互、API 路由、数据展示 | Next.js 16 + tRPC |
| **OpenMeter** | 用量计量、事件接收、实时聚合 | OpenMeter + ClickHouse |
| **计费服务** | 5分钟周期扣费、余额管理 | Cron Job + Drizzle |
| **日志服务** | Pod 日志收集、查询、导出 | Promtail + Loki |
| **存储服务** | PVC 创建/扩容/删除 | K8s API + CSI |
| **Skypilot** | 容器编排、服务发现 | REST API |
| **K8s** | Pod 调度、资源管理 | Kubernetes API |

### 1.3 数据流

```mermaid
flowchart LR
    subgraph 采集[资源采集]
        NODE[GPU 节点]
        AGENT[Node Agent]
        SKY[Skypilot]
    end

    subgraph 计量[OpenMeter]
        EVENT[事件接收]
        METER[Meter 聚合]
        STORE[(ClickHouse)]
    end

    subgraph 计费[计费服务]
        CRON[5min Cron]
        DAILY[日账单]
        MONTHLY[月账单]
    end

    subgraph 存储[(PostgreSQL)]
        BAL[tenant_balance]
        TX[balance_transaction]
        BILL[tenant_bill]
    end

    NODE --> AGENT
    AGENT -->|resource_usage| EVENT
    SKY -->|inference_usage| EVENT
    EVENT --> METER
    METER --> STORE
    STORE --> CRON
    CRON --> BAL
    CRON --> TX
    DAILY --> BILL
    MONTHLY --> BILL
```

---

## 2. OpenMeter 用量计量

### 2.1 设计原则

对齐 `billing-display.md` §2：

- **事件驱动**：资源采集器每 60 秒发送标准化使用事件
- **实时聚合**：OpenMeter 按 Meter 定义实时聚合用量
- **增量查询**：计费服务每 5 分钟拉取增量用量
- **多维度**：支持 tenant_id、product_line、gpu_type、region 等维度

### 2.2 事件模型

#### 资源使用事件（resource_usage）

```typescript
interface ResourceUsageEvent {
  type: "resource_usage"
  subject: string  // task-instance-xxx 或 compute-base-xxx
  data: {
    billable: boolean  // 镜像拉取期间 false
    organization_id: string
    tenant_id: string
    idc: string
    node: string
    resources: {
      cpu: number  // CPU 核数
      memory_gb: number  // 内存 GB
      gpu: {
        type: string  // GPU 型号，如 "A100"
        count: number  // GPU 数量
      }
      storage: Array<{
        type: string  // local-ssd, network-ssd
        gb: number
      }>
    }
  }
}
```

#### 推理使用事件（inference_usage）

```typescript
interface InferenceUsageEvent {
  type: "inference_usage"
  subject: string  // endpoint-xxx
  data: {
    tenant_id: string
    organization_id: string
    request_count: number
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    gpu_seconds: number
    model: string
  }
}
```

### 2.3 OpenMeter Meter 定义

```yaml
# openmeter-config.yaml
meters:
  # GPU 使用时长（秒）
  - slug: gpu_count_seconds
    eventType: resource_usage
    valueProperty: $.data.resources.gpu.count
    groupBy:
      tenant_id: $.data.tenant_id
      organization_id: $.data.organization_id
      gpu_type: $.data.resources.gpu.type
      product_line: $.data.product_line
      region: $.data.idc
    filter: $.data.billable == true
    windowSize: 1m

  # CPU 使用时长（核·秒）
  - slug: cpu_core_seconds
    eventType: resource_usage
    valueProperty: $.data.resources.cpu
    groupBy:
      tenant_id: $.data.tenant_id
      organization_id: $.data.organization_id
      product_line: $.data.product_line
      region: $.data.idc
    filter: $.data.billable == true
    windowSize: 1m

  # 内存使用时长（GB·秒）
  - slug: memory_gb_seconds
    eventType: resource_usage
    valueProperty: $.data.resources.memory_gb
    groupBy:
      tenant_id: $.data.tenant_id
      organization_id: $.data.organization_id
      product_line: $.data.product_line
      region: $.data.idc
    filter: $.data.billable == true
    windowSize: 1m

  # 推理 Token 数
  - slug: inference_tokens
    eventType: inference_usage
    valueProperty: $.data.total_tokens
    groupBy:
      tenant_id: $.data.tenant_id
      organization_id: $.data.organization_id
      model: $.data.model
    windowSize: 1m

  # 推理请求数
  - slug: inference_requests
    eventType: inference_usage
    valueProperty: $.data.request_count
    groupBy:
      tenant_id: $.data.tenant_id
      organization_id: $.data.organization_id
      model: $.data.model
    windowSize: 1m
```

### 2.4 资源采集器设计

```typescript
// 资源采集器 - 每 60 秒执行一次
async function collectResourceUsage(): Promise<ResourceUsageEvent[]> {
  const events: ResourceUsageEvent[] = []
  
  // 1. 查询所有 running 实例
  const runningInstances = await db
    .select({
      id: computeBase.id,
      organizationId: computeBase.organizationId,
      tenantId: computeBase.tenantId,
      region: computeBase.region,
      resourceSpec: computeBase.resourceSpec,
    })
    .from(computeBase)
    .where(eq(computeBase.status, "running"))

  for (const instance of runningInstances) {
    const resourceSpec = instance.resourceSpec as Record<string, unknown>
    
    // 2. 从 K8s 获取实际资源使用
    const k8sUsage = await getK8sResourceUsage(instance.id)
    
    // 3. 构建事件
    events.push({
      type: "resource_usage",
      subject: `compute-base-${instance.id}`,
      data: {
        billable: true,
        organization_id: instance.organizationId,
        tenant_id: instance.tenantId,
        idc: instance.region,
        node: k8sUsage.nodeName,
        resources: {
          cpu: k8sUsage.cpuCores,
          memory_gb: k8sUsage.memoryGb,
          gpu: {
            type: (resourceSpec.gpuCardTypeId as string) || "unknown",
            count: (resourceSpec.gpuCount as number) || 0,
          },
          storage: [],
        },
      },
    })
  }

  return events
}

// 发送到 OpenMeter
async function sendToOpenMeter(events: ResourceUsageEvent[]): Promise<void> {
  for (const event of events) {
    await fetch(`${OPENMETER_API_URL}/api/v1/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENMETER_API_TOKEN}`,
      },
      body: JSON.stringify(event),
    })
  }
}
```

### 2.5 OpenMeter 查询 API

```typescript
// 查询增量用量（用于 5 分钟计费）
async function queryIncrementalUsage(params: {
  tenantId: string
  meterSlug: string
  startTime: Date
  endTime: Date
}): Promise<{
  total: number
  windows: Array<{ start: string; end: string; value: number }>
}> {
  const response = await fetch(
    `${OPENMETER_API_URL}/api/v1/meters/${params.meterSlug}/query` +
      `?subject=tenant-${params.tenantId}` +
      `&from=${params.startTime.toISOString()}` +
      `&to=${params.endTime.toISOString()}`,
    {
      headers: {
        Authorization: `Bearer ${OPENMETER_API_TOKEN}`,
      },
    },
  )

  const data = await response.json()
  return {
    total: data.total,
    windows: data.windows,
  }
}
```

### 2.6 OpenMeter 部署配置

```yaml
# docker-compose.yaml (开发环境)
version: '3.8'
services:
  openmeter:
    image: openmeter/openmeter:latest
    ports:
      - "8080:8080"
    environment:
      - OPENMETER_DATABASE_URL=postgres://user:pass@postgres:5432/openmeter
      - OPENMETER_CLICKHOUSE_URL=http://clickhouse:8123/openmeter
    depends_on:
      - postgres
      - clickhouse

  clickhouse:
    image: clickhouse/clickhouse-server:latest
    ports:
      - "8123:8123"
    volumes:
      - clickhouse_data:/var/lib/clickhouse

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=openmeter
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  clickhouse_data:
  postgres_data:
```

### 2.7 与现有计费系统集成

```typescript
// 5 分钟计费 Cron Job（更新版）
async function billingCronJob(): Promise<void> {
  const now = new Date()
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)

  // 1. 查询所有 running on-demand 实例
  const onDemandInstances = await db
    .select({
      computeBaseId: computeBase.id,
      organizationId: computeBase.organizationId,
      tenantId: computeBase.tenantId,
      resourceSpec: computeBase.resourceSpec,
    })
    .from(computeBase)
    .where(
      and(
        eq(computeBase.status, "running"),
        eq(computeBase.commitment, "on_demand"),
      ),
    )

  for (const instance of onDemandInstances) {
    // 2. 从 OpenMeter 查询增量用量
    const gpuUsage = await queryIncrementalUsage({
      tenantId: instance.tenantId,
      meterSlug: "gpu_count_seconds",
      startTime: fiveMinutesAgo,
      endTime: now,
    })

    const cpuUsage = await queryIncrementalUsage({
      tenantId: instance.tenantId,
      meterSlug: "cpu_core_seconds",
      startTime: fiveMinutesAgo,
      endTime: now,
    })

    // 3. 计算费用
    const resourceSpec = instance.resourceSpec as Record<string, unknown>
    const gpuCardTypeId = resourceSpec.gpuCardTypeId as string
    const gpuCount = (resourceSpec.gpuCount as number) || 1

    const priceSnapshot = await lookupPriceSnapshot({
      gpuCardTypeId,
      productLine: "serverless",
      billingUnit: "hour",
    })

    if (!priceSnapshot) continue

    // 4. 计算扣费金额
    // GPU 费用：gpu_count_seconds × (hourly_price / 3600)
    const gpuSeconds = gpuUsage.total
    const gpuDeduction = gpuSeconds * (priceSnapshot.sellPrice / 3600)

    // 5. 执行扣费
    await billServerlessPeriodicDeduction({
      organizationId: instance.organizationId,
      computeBaseId: instance.computeBaseId,
      tenantId: instance.tenantId,
      pricePerHour: priceSnapshot.sellPrice,
      gpuCount,
    })
  }
}
```

---

## 3. Pod 5分钟计费循环

### 3.1 设计原则

对齐 `tenant-balance-unification.md` §4.1 和 `billing-display.md` §2：

- **事件驱动**：资源采集器每 60 秒发送标准化使用事件到 OpenMeter
- **实时聚合**：OpenMeter 按 Meter 定义实时聚合用量
- **增量查询**：计费服务每 5 分钟拉取增量用量
- **按秒计费**：费用 = 秒数 × (小时价格 / 3600)
- **预估冻结**：创建时冻结1小时预估金额
- **余额不足**：自动停止实例并标记为 `error`

### 3.2 计费流程

```mermaid
sequenceDiagram
    participant COLLECTOR as 资源采集器 (60s)
    participant OM as OpenMeter
    participant CRON as Cron Job (5min)
    participant DB as PostgreSQL
    participant BILL as 计费服务
    participant SKY as Skypilot API
    participant K8S as K8s API

    loop 每 60 秒
        COLLECTOR->>OM: 发送 resource_usage 事件
        OM->>OM: 实时聚合用量
    end

    loop 每 5 分钟
        CRON->>DB: 查询 running + on-demand 实例
        loop 每个实例
            CRON->>DB: 解析 tenantId
            CRON->>OM: 查询增量用量 (gpu_count_seconds)
            OM-->>CRON: 返回增量用量
            CRON->>DB: 查询价格快照
            CRON->>BILL: 计算扣费金额
            BILL->>DB: consume_reserved(金额)
            alt 余额不足
                BILL->>SKY: stopService(instanceId)
                SKY->>K8S: scale deployment to 0
                BILL->>DB: update status = 'error'
            end
        end
    end
```

### 3.3 扣费公式

```typescript
// 从 OpenMeter 查询增量用量
const gpuUsage = await queryIncrementalUsage({
  tenantId,
  meterSlug: "gpu_count_seconds",
  startTime: lastBillingTime,
  endTime: currentTime,
})

const cpuUsage = await queryIncrementalUsage({
  tenantId,
  meterSlug: "cpu_core_seconds",
  startTime: lastBillingTime,
  endTime: currentTime,
})

// GPU 费用：gpu_count_seconds × (hourly_price / 3600)
const gpuDeduction = gpuUsage.total * (pricePerHour / 3600)

// CPU 费用：cpu_core_seconds × (cpu_hourly_price / 3600)（可选）
const cpuDeduction = cpuUsage.total * (cpuPricePerHour / 3600)

// 总费用
const totalDeduction = gpuDeduction + cpuDeduction

// 考虑 Spot 乘数（如果适用）
const finalAmount = totalDeduction * spotPriceMultiplier

// 考虑中断容错乘数
const payableAmount = finalAmount * interruptibleMultiplier
```

### 3.4 价格管理

对齐 `billing-display.md` §2.3 和 `00-overview.md` §7.3：

| 字段 | 说明 |
|------|------|
| resource_type | cpu / memory / gpu / storage |
| resource_spec | GPU 型号等规格标识 |
| base_price | 基础单价（元/小时） |
| off_peak_price_multiplier | 闲时价格乘数（默认 1.00） |
| spot_price_multiplier | Spot 价格乘数（默认 0.60，刊例六折） |
| effective_from/to | 生效时间段 |

```typescript
// 价格查询
async function lookupPriceSnapshot(params: {
  gpuCardTypeId: string
  productLine: string
  billingUnit: string
}): Promise<PriceSnapshot | null> {
  const [row] = await db
    .select()
    .from(platformCardPriceRecord)
    .where(
      and(
        eq(platformCardPriceRecord.gpuCardTypeId, params.gpuCardTypeId),
        eq(platformCardPriceRecord.productLine, params.productLine),
        eq(platformCardPriceRecord.billingUnit, params.billingUnit),
      ),
    )
    .limit(1)

  return row ? {
    gpuCardTypeId: row.gpuCardTypeId,
    productLine: row.productLine,
    billingUnit: row.billingUnit,
    sellPrice: Number(row.sellPrice),
    priceRecordId: row.priceRecordId,
  } : null
}
```

### 3.5 状态机

```mermaid
stateDiagram-v2
    [*] --> deploying: createServerless
    deploying --> running: SkyPilot 部署成功
    deploying --> error: 部署失败
    
    running --> stopping: stopServerless
    stopping --> stopped: SkyPilot 停止成功
    
    stopped --> deploying: startServerless
    stopped --> deleted: deleteServerless
    
    running --> error: 余额不足
    error --> stopped: 人工干预
    
    running --> migrating: 跨区迁移
    migrating --> running: 迁移完成
```

### 3.6 数据库查询

```typescript
// 查询需要扣费的实例
const onDemandInstances = await db
  .select({
    computeBaseId: computeBase.id,
    organizationId: computeBase.organizationId,
    status: computeBase.status,
    commitment: computeBase.commitment,
    resourceSpec: computeBase.resourceSpec,
    createdAt: computeBase.createdAt,
  })
  .from(computeBase)
  .innerJoin(
    serverlessDetail,
    eq(computeBase.id, serverlessDetail.computeBaseId),
  )
  .where(
    and(
      eq(computeBase.status, "running"),
      eq(computeBase.commitment, "on_demand"),
    ),
  )
```

### 3.7 错误处理

| 错误场景 | 处理方式 | 用户通知 |
|----------|----------|----------|
| 余额不足 | 停止实例 + 标记 `error` | 站内信 + 邮件 |
| SkyPilot API 失败 | 重试3次 + 标记 `error` | 运维告警 |
| K8s API 失败 | 标记 `error` + 人工干预 | 运维告警 |
| 数据库事务失败 | 回滚 + 重试 | 运维告警 |

---

## 4. 镜像拉取优化

### 4.1 设计目标

镜像拉取是实例启动的关键路径，需要解决三个核心问题：

1. **监控拉取时长**：实时跟踪拉取进度、速度、剩余时间
2. **避免GPU卡空占**：镜像拉取期间不分配GPU，拉取完成后才调度
3. **追踪GPU卡调度**：记录从请求到GPU实际分配的完整耗时

对齐 `00-overview.md` §6.3 和 `../../business/image-preload-commercial-and-community-incentive.md`：

- 镜像拉取期间 `billable=false`，不计入OpenMeter用量
- 镜像拉取完成后回调，才开始SkyPilot调度和计费

### 4.2 状态机（更新）

```mermaid
stateDiagram-v2
    [*] --> image_pulling: createServerless
    image_pulling --> pending: 镜像就绪回调
    image_pulling --> failed: 拉取超时/失败
    pending --> deploying: SkyPilot调度
    deploying --> running: 部署成功
    deploying --> error: 部署失败
    
    running --> stopping: stopServerless
    stopping --> stopped: SkyPilot停止成功
    
    stopped --> image_pulling: startServerless(换镜像)
    stopped --> pending: startServerless(同镜像)
    stopped --> deleted: deleteServerless
    
    running --> error: 余额不足
    error --> stopped: 人工干预
    
    running --> migrating: 跨区迁移
    migrating --> running: 迁移完成
```

### 4.3 镜像拉取流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant API as gpus API
    participant DB as PostgreSQL
    participant NODE as 候选节点
    participant AG as Node Agent
    participant REG as 镜像仓库
    participant SP as SkyPilot

    U->>API: createServerless(config)
    API->>DB: BEGIN TRANSACTION
    API->>DB: 1. 检查余额 (SELECT ... FOR UPDATE)
    API->>DB: 2. 估算预估费用，冻结预留金
    API->>DB: 3. INSERT compute_base (status='image_pulling')
    API->>DB: 4. INSERT compute_task_event (image_pull_start)
    API->>DB: COMMIT
    API-->>U: {instanceId, status: "image_pulling"}

    Note over API,NODE: 镜像拉取阶段（不计费）
    API->>NODE: 选择候选节点（基于镜像缓存状态）
    API->>AG: 发送拉取指令 (镜像名, 预期大小)
    AG->>REG: docker pull (后台)
    
    loop 每30秒回调进度
        AG->>API: POST /api/node/callback/image-progress
        Note over API: { nodeId, imageRef, pulledBytes, totalBytes, speed }
        API->>DB: INSERT image_pull_progress
        API-->>U: 推送: 镜像拉取中 (进度%)
    end
    
    AG->>API: POST /api/node/callback/image-ready
    Note over API: { nodeId, imageRef, digest, pullDuration }
    API->>DB: UPDATE compute_base SET image_digest=?, image_ready_node=?
    API->>DB: INSERT compute_task_event (image_pull_done)

    Note over API,SP: GPU调度阶段（开始计费）
    API->>SP: POST /api/jobs (指定节点亲和性)
    SP->>NODE: 调度到已缓存镜像的节点
    SP-->>API: {job_id: "sky-xxx"}
    
    API->>DB: UPDATE compute_base SET sky_serve_id='sky-xxx', status='running'
    API->>DB: INSERT compute_task_event (running, billing_start)
    
    Note over API: 计费开始
    API-->>U: 推送: 实例已启动
```

### 4.4 镜像拉取监控

#### 4.4.1 进度追踪

```typescript
// 镜像拉取进度事件
interface ImagePullProgressEvent {
  type: "image_pull_progress"
  subject: string  // compute-base-xxx
  data: {
    nodeId: string
    imageRef: string
    pulledBytes: number
    totalBytes: number
    speed: number  // bytes/second
    eta: number    // seconds remaining
    pulledLayers: number
    totalLayers: number
  }
}

// 镜像拉取完成事件
interface ImagePullCompleteEvent {
  type: "image_pull_complete"
  subject: string  // compute-base-xxx
  data: {
    nodeId: string
    imageRef: string
    digest: string
    pullDuration: number  // milliseconds
    totalBytes: number
    averageSpeed: number  // bytes/second
    cacheHit: boolean     // 是否命中节点缓存
  }
}
```

#### 4.4.2 拉取速度优化

```typescript
// 镜像拉取优化策略
interface ImagePullOptimization {
  // 1. 节点选择：优先选择已缓存镜像的节点
  selectNode: {
    strategy: "cache_first" | "random" | "least_load"
    cacheCheck: boolean  // 检查节点是否已缓存镜像
  }
  
  // 2. 并行拉取：大镜像分层并行拉取
  parallelPull: {
    enabled: boolean
    maxConcurrency: number  // 最大并行层数
  }
  
  // 3. P2P分发：多节点间P2P传输
  p2pDistribution: {
    enabled: boolean
    maxPeers: number  // 最大P2P节点数
  }
  
  // 4. 预测性预热：基于历史数据预测并预热
  predictivePreload: {
    enabled: boolean
    lookbackDays: number  // 回溯天数
  }
}
```

#### 4.4.3 超时与重试

```typescript
// 镜像拉取超时配置
const IMAGE_PULL_TIMEOUT_CONFIG = {
  // 基础超时（秒）
  baseTimeout: 300,  // 5分钟
  
  // 每GB额外超时（秒）
  perGbTimeout: 60,  // 每GB增加1分钟
  
  // 最大超时（秒）
  maxTimeout: 1800,  // 30分钟
  
  // 重试次数
  maxRetries: 3,
  
  // 重试间隔（秒）
  retryInterval: 10,
  
  // 失败阈值：连续失败次数后标记为failed
  failureThreshold: 3,
}

// 计算超时时间
function calculatePullTimeout(imageSizeGb: number): number {
  const timeout = IMAGE_PULL_TIMEOUT_CONFIG.baseTimeout + 
                  imageSizeGb * IMAGE_PULL_TIMEOUT_CONFIG.perGbTimeout
  return Math.min(timeout, IMAGE_PULL_TIMEOUT_CONFIG.maxTimeout)
}
```

### 4.5 GPU调度追踪

#### 4.5.1 调度延迟指标

```typescript
// GPU调度追踪事件
interface GpuSchedulingEvent {
  type: "gpu_scheduling"
  subject: string  // compute-base-xxx
  data: {
    // 时间戳
    requestTime: string      // 用户请求时间
    imagePullStartTime: string  // 镜像拉取开始时间
    imagePullEndTime: string    // 镜像拉取完成时间
    schedulingStartTime: string // SkyPilot调度开始时间
    gpuAllocatedTime: string    // GPU实际分配时间
    containerStartTime: string  // 容器启动时间
    
    // 耗时统计
    totalDuration: number       // 总耗时（秒）
    imagePullDuration: number   // 镜像拉取耗时（秒）
    schedulingDuration: number  // 调度耗时（秒）
    containerStartDuration: number // 容器启动耗时（秒）
    
    // 节点信息
    nodeId: string
    nodeRegion: string
    gpuType: string
    gpuCount: number
    
    // 优化信息
    cacheHit: boolean          // 镜像缓存命中
    schedulingAttempts: number // 调度尝试次数
    failureReason?: string     // 失败原因
  }
}
```

#### 4.5.2 调度优化策略

```typescript
// GPU调度优化
interface GpuSchedulingOptimization {
  // 1. 节点亲和性：优先调度到已缓存镜像的节点
  nodeAffinity: {
    requiredDuringSchedulingIgnoredDuringExecution: {
      nodeSelectorTerms: [{
        matchExpressions: [{
          key: "GPURun.cloud/image-cache"
          operator: "In"
          values: [imageDigest]
        }]
      }]
    }
  }
  
  // 2. 容忍度：允许调度到有taint的GPU节点
  tolerations: [{
    key: "nvidia.com/gpu"
    operator: "Exists"
    effect: "NoSchedule"
  }]
  
  // 3. 资源请求：明确请求GPU资源
  resources: {
    requests: {
      "nvidia.com/gpu": gpuCount
    }
    limits: {
      "nvidia.com/gpu": gpuCount
    }
  }
  
  // 4. Pod拓扑 spread：均匀分布到多个GPU节点
  topologySpreadConstraints: [{
    maxSkew: 1
    topologyKey: "kubernetes.io/hostname"
    whenUnsatisfiable: "ScheduleAnyway"
  }]
}
```

### 4.6 计费集成

#### 4.6.1 不计费窗口

```typescript
// 镜像拉取期间不计费
const BILLING_EXCLUSION_STATES = [
  "image_pulling",  // 镜像拉取中
  "pending",        // 等待调度（镜像已就绪，等待GPU）
]

// OpenMeter事件标记
function createResourceUsageEvent(instance: Instance) {
  return {
    type: "resource_usage",
    subject: `compute-base-${instance.id}`,
    data: {
      // 关键：镜像拉取期间billable=false
      billable: !BILLING_EXCLUSION_STATES.includes(instance.status),
      organization_id: instance.organizationId,
      tenant_id: instance.tenantId,
      // ... 其他字段
    }
  }
}
```

#### 4.6.2 计费开始时机

```typescript
// 计费开始条件
const BILLING_START_CONDITIONS = {
  // 1. 镜像拉取完成
  imagePullComplete: true,
  
  // 2. SkyPilot调度成功
  skyPilotJobCreated: true,
  
  // 3. Pod实际运行
  podRunning: true,
  
  // 4. 三个条件同时满足才开始计费
  required: ["imagePullComplete", "skyPilotJobCreated", "podRunning"]
}

// 计费开始事件
interface BillingStartEvent {
  type: "billing_start"
  subject: string  // compute-base-xxx
  data: {
    instanceId: string
    tenantId: string
    organizationId: string
    startTime: string
    gpuType: string
    gpuCount: number
    pricePerHour: number
  }
}
```

### 4.7 镜像缓存管理

#### 4.7.1 缓存策略

```typescript
// 镜像缓存管理
interface ImageCacheManager {
  // 缓存保留策略
  retention: {
    // 最近使用的镜像保留7天
    recentUsedDays: 7,
    
    // 预热镜像保留30天
    preloadedDays: 30,
    
    // 最大缓存大小（节点级）
    maxCacheSizeGb: 100,
    
    // 缓存水位线（超过此值开始清理）
    watermarkPercent: 80,
  }
  
  // 清理策略
  eviction: {
    // LRU：最近最少使用
    strategy: "lru",
    
    // 优先清理未预热的镜像
    priority: ["non_preloaded", "expired", "large_unused"]
  }
  
  // 预热策略
  preload: {
    // 基于历史使用预测
    predictive: true,
    
    // 预热到指定节点数
    targetNodes: 3,
    
    // 预热时间窗口（凌晨低峰期）
    timeWindow: "02:00-06:00"
  }
}
```

#### 4.7.2 缓存状态查询

```typescript
// 查询节点镜像缓存状态
async function getNodeImageCacheStatus(nodeId: string, imageRef: string) {
  const response = await fetch(
    `${NODE_AGENT_URL}/api/image-cache/status`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId, imageRef })
    }
  )
  
  return response.json() as Promise<{
    cached: boolean
    digest?: string
    sizeBytes?: number
    lastUsed?: string
    pullDuration?: number  // 历史拉取耗时
  }>
}

// 查询所有节点缓存状态
async function getAllNodesCacheStatus(imageRef: string) {
  const nodes = await getGpuNodes()
  const statuses = await Promise.all(
    nodes.map(node => getNodeImageCacheStatus(node.id, imageRef))
  )
  
  return nodes.map((node, i) => ({
    nodeId: node.id,
    region: node.region,
    ...statuses[i]
  }))
}
```

### 4.8 节点选择算法

```typescript
// 节点选择：基于镜像缓存 + GPU可用性
async function selectOptimalNode(params: {
  imageRef: string
  gpuType: string
  gpuCount: number
  region?: string
}): Promise<NodeSelectionResult> {
  // 1. 获取所有GPU节点
  const gpuNodes = await getGpuNodes({
    gpuType: params.gpuType,
    region: params.region
  })
  
  // 2. 查询每个节点的镜像缓存状态
  const cacheStatuses = await Promise.all(
    gpuNodes.map(async node => ({
      node,
      cache: await getNodeImageCacheStatus(node.id, params.imageRef),
      availableGpu: await getAvailableGpuCount(node.id, params.gpuType)
    }))
  )
  
  // 3. 过滤：需要足够GPU + 镜像已缓存或可拉取
  const candidates = cacheStatuses.filter(status => 
    status.availableGpu >= params.gpuCount &&
    (status.cache.cached || status.node.diskFreeGb > 50)  // 有足够磁盘空间拉取
  )
  
  // 4. 评分
  const scored = candidates.map(status => ({
    ...status,
    score: calculateNodeScore(status)
  }))
  
  // 5. 选择得分最高的节点
  scored.sort((a, b) => b.score - a.score)
  return scored[0]
}

// 节点评分函数
function calculateNodeScore(status: {
  node: GpuNode
  cache: CacheStatus
  availableGpu: number
}): number {
  let score = 0
  
  // 镜像缓存命中：+100分
  if (status.cache.cached) score += 100
  
  // GPU可用数量：+10分/GPU
  score += status.availableGpu * 10
  
  // 节点负载：-1分/%
  score -= status.node.loadPercent
  
  // 历史拉取速度：+1分/MB/s
  if (status.cache.pullDuration) {
    const speed = (status.cache.sizeBytes || 0) / status.cache.pullDuration / 1024 / 1024
    score += speed
  }
  
  return score
}
```

---

## 5. 日志追踪与收集

### 5.1 日志架构

```mermaid
flowchart LR
    subgraph K8S[K8s 集群]
        POD1[Pod 1<br/>stdout/stderr]
        POD2[Pod 2<br/>stdout/stderr]
        POD3[Pod 3<br/>stdout/stderr]
    end

    subgraph 采集层[日志采集]
        PROMTAIL[Promtail<br/>DaemonSet]
        FLUENTD[Fluentd<br/>可选]
    end

    subgraph 存储层[日志存储]
        LOKI[Loki<br/>日志聚合]
        S3[S3<br/>长期存储]
    end

    subgraph 查询层[日志查询]
        GRAFANA[Grafana<br/>可视化]
        API[日志 API<br/>gpus 应用]
    end

    POD1 --> PROMTAIL
    POD2 --> PROMTAIL
    POD3 --> PROMTAIL
    PROMTAIL --> LOKI
    LOKI --> S3
    LOKI --> GRAFANA
    LOKI --> API
```

### 5.2 日志标签体系

```yaml
# Promtail 配置
scrape_configs:
  - job_name: kubernetes-pods
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      # 实例 ID 标签
      - source_labels: [__meta_kubernetes_pod_label_app]
        target_label: app
      - source_labels: [__meta_kubernetes_pod_label_compute_base_id]
        target_label: compute_base_id
      - source_labels: [__meta_kubernetes_pod_label_organization_id]
        target_label: organization_id
      # 区域标签
      - source_labels: [__meta_kubernetes_namespace]
        target_label: namespace
      - source_labels: [__meta_kubernetes_pod_node_name]
        target_label: node
      # 服务标签
      - source_labels: [__meta_kubernetes_pod_label_sky_serve_id]
        target_label: sky_serve_id
```

### 5.3 日志查询 API

```typescript
// gpus 应用中的日志查询接口
export const logRouter = createTRPCRouter({
  /**
   * 查询实例日志
   */
  getInstanceLogs: protectedProcedure
    .input(
      z.object({
        computeBaseId: z.string(),
        startTime: z.date().optional(),
        endTime: z.date().optional(),
        filter: z.string().optional(),
        limit: z.number().int().min(1).max(1000).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const logs = await queryLokiLogs({
        query: `{compute_base_id="${input.computeBaseId}"}`,
        start: input.startTime?.toISOString(),
        end: input.endTime?.toISOString(),
        filter: input.filter,
        limit: input.limit,
      })
      return logs
    }),

  /**
   * 查询实例事件
   */
  getInstanceEvents: protectedProcedure
    .input(z.object({ computeBaseId: z.string() }))
    .query(async ({ ctx, input }) => {
      const events = await queryK8sEvents({
        labelSelector: `compute_base_id=${input.computeBaseId}`,
      })
      return events
    }),
})
```

### 5.4 日志保留策略

| 日志类型 | 保留时间 | 存储位置 | 查询性能 |
|----------|----------|----------|----------|
| 应用日志 | 30天 | Loki | 快速 |
| 系统日志 | 7天 | Loki | 快速 |
| 审计日志 | 1年 | S3 + PostgreSQL | 中等 |
| 计费日志 | 永久 | PostgreSQL | 快速 |

### 5.5 日志格式规范

```typescript
// 结构化日志格式
interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  computeBaseId: string
  organizationId: string
  skyServeId?: string
  podName?: string
  containerName?: string
  metadata?: Record<string, unknown>
}

// 示例
{
  "timestamp": "2026-07-26T10:30:00Z",
  "level": "info",
  "message": "Pod started successfully",
  "computeBaseId": "ep-abc123",
  "organizationId": "org-xyz789",
  "skyServeId": "sky-serve-001",
  "podName": "sky-serve-001-abc12",
  "containerName": "worker",
  "metadata": {
    "gpuCount": 2,
    "region": "cn-east-1"
  }
}
```

---

## 6. PVC 存储操作

### 6.1 存储架构

```mermaid
flowchart TB
    subgraph 用户空间[用户存储]
        LOCAL[本地数据盘<br/>PVC RWO]
        S3[S3 网络卷<br/>CSI Driver]
    end

    subgraph 系统空间[系统存储]
        SYS[系统盘<br/>PVC RWO]
        LOG[日志卷<br/>emptyDir]
    end

    subgraph K8S[K8s 集群]
        PV[PersistentVolume]
        SC[StorageClass<br/>gp3-retain]
        CSI[CSI Driver<br/>S3/本地]
    end

    LOCAL --> PV
    S3 --> CSI
    SYS --> PV
    LOG --> emptyDir
    PV --> SC
```

### 6.2 PVC 操作类型

| 操作 | API 方法 | 适用产品线 | 说明 |
|------|----------|------------|------|
| **创建** | `createNamespacedPersistentVolumeClaim` | 所有 | 创建 PVC |
| **扩容** | `patchNamespacedPersistentVolumeClaim` | cloud_vm, serverless | 扩容 PVC（只扩不缩） |
| **删除** | `deleteNamespacedPersistentVolumeClaim` | 所有 | 删除 PVC |
| **扩容** | `readNamespacedPersistentVolumeClaim` | 所有 | 查询 PVC 状态 |

### 6.3 存储类配置

```yaml
# StorageClass 定义
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3-retain
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  iops: "3000"
  throughput: "125"
  encrypted: "true"
reclaimPolicy: Retain
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer
```

### 6.4 PVC 创建流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant API as gpus API
    participant K8S as K8s API
    participant CSI as CSI Driver
    participant DB as PostgreSQL

    U->>API: createServerless(config)
    API->>API: 校验配额
    API->>DB: 创建 compute_base + serverless_detail
    API->>K8S: createNamespacedPersistentVolumeClaim()
    K8S->>CSI: Provision Volume
    CSI-->>K8S: PV Ready
    K8S-->>API: PVC Bound
    API->>DB: 更新 storage_config
    API->>API: 调用 Skypilot 部署
    API-->>U: 返回实例信息
```

### 6.5 PVC 扩容流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant API as gpus API
    participant K8S as K8s API
    participant CSI as CSI Driver
    participant DB as PostgreSQL

    U->>API: expandDataDisk(taskId, targetGb)
    API->>API: 校验 target ≤ max
    API->>DB: 查询当前 data_disk_gb
    API->>API: 计算 delta_paid
    API->>API: 冻结 delta × price × min_hours
    API->>K8S: patchNamespacedPersistentVolumeClaim()
    K8S->>CSI: Expand Volume
    CSI-->>K8S: Volume Expanded
    K8S-->>API: 扩容完成
    API->>DB: 更新 data_disk_gb / data_disk_paid_gb
    API-->>U: 扩容成功
```

### 6.6 存储配额管理

```typescript
// 存储配额检查
async function checkStorageQuota(
  tenantId: string,
  productLine: string,
  requestedGb: number,
): Promise<{ allowed: boolean; reason?: string }> {
  const policy = await getStorageQuotaPolicy(tenantId)
  
  // 检查单实例上限
  if (requestedGb > policy.data_disk_max_gb) {
    return {
      allowed: false,
      reason: `单实例数据盘上限 ${policy.data_disk_max_gb} GB`,
    }
  }
  
  // 检查租户总配额
  const totalUsed = await getTotalStorageUsed(tenantId)
  if (totalUsed + requestedGb > policy.tenant_total_storage_gb) {
    return {
      allowed: false,
      reason: `租户总存储配额不足`,
    }
  }
  
  return { allowed: true }
}
```

### 6.7 产品线存储矩阵

| 产品线 | 本地数据盘 | S3 网络卷 | 系统盘 | 日志卷 |
|--------|------------|-----------|--------|--------|
| **cloud_vm** | ✅ 免费50GB + 付费扩容 | ✅ 可选 | ✅ | ✅ |
| **serverless** | ❌ 推荐 S3 | ✅ 推荐 | ✅ | ✅ |
| **job** | ✅ 免费20GB + 付费扩容 | ✅ 可选 | ✅ | ✅ |
| **inference** | ❌ 权重走 S3 | ✅ 推荐 | ✅ | ✅ |

---

## 7. 数据模型扩展

### 7.1 存储配置表

```sql
-- 扩展 compute_base 添加存储字段
ALTER TABLE compute_base ADD COLUMN storage_config JSONB;

-- 存储配置结构
-- {
--   "dataDiskGb": 100,
--   "dataDiskFreeGb": 50,
--   "dataDiskPaidGb": 50,
--   "storageClass": "gp3-retain",
--   "pvcName": "pvc-compute-base-xxx",
--   "volumeId": "vol-xxx",
--   "mountPath": "/data"
-- }
```

### 7.2 日志表

```sql
-- 实例日志索引（用于快速查询）
CREATE TABLE instance_log (
    id              TEXT PRIMARY KEY,
    compute_base_id TEXT NOT NULL REFERENCES compute_base(id),
    organization_id VARCHAR(64) NOT NULL,
    timestamp       TIMESTAMPTZ NOT NULL,
    level           VARCHAR(8) NOT NULL,
    message         TEXT NOT NULL,
    pod_name        VARCHAR(255),
    container_name  VARCHAR(255),
    metadata        JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_instance_log_compute_base ON instance_log(compute_base_id);
CREATE INDEX idx_instance_log_timestamp ON instance_log(timestamp);
CREATE INDEX idx_instance_log_level ON instance_log(level);
```

### 7.3 PVC 追踪表

```sql
-- PVC 操作日志
CREATE TABLE pvc_operation (
    id              TEXT PRIMARY KEY,
    compute_base_id TEXT NOT NULL REFERENCES compute_base(id),
    operation       VARCHAR(32) NOT NULL,  -- create | expand | delete
    status          VARCHAR(16) NOT NULL,  -- pending | success | failed
    pvc_name        VARCHAR(255) NOT NULL,
    storage_class   VARCHAR(64) NOT NULL,
    size_gb         INT NOT NULL,
    error_message   TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_pvc_operation_compute_base ON pvc_operation(compute_base_id);
```

### 7.4 镜像拉取追踪表

```sql
-- 镜像拉取进度
CREATE TABLE image_pull_progress (
    id              TEXT PRIMARY KEY,
    compute_base_id TEXT NOT NULL REFERENCES compute_base(id),
    node_id         VARCHAR(255) NOT NULL,
    image_ref       VARCHAR(512) NOT NULL,
    pulled_bytes    BIGINT NOT NULL DEFAULT 0,
    total_bytes     BIGINT,
    speed_bytes     BIGINT,  -- bytes/second
    eta_seconds     INT,
    pulled_layers   INT,
    total_layers    INT,
    status          VARCHAR(16) NOT NULL,  -- pulling | completed | failed
    error_message   TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_image_pull_progress_compute_base ON image_pull_progress(compute_base_id);
CREATE INDEX idx_image_pull_progress_node ON image_pull_progress(node_id);

-- 镜像拉取完成记录
CREATE TABLE image_pull_completion (
    id              TEXT PRIMARY KEY,
    compute_base_id TEXT NOT NULL REFERENCES compute_base(id),
    node_id         VARCHAR(255) NOT NULL,
    image_ref       VARCHAR(512) NOT NULL,
    digest          VARCHAR(255) NOT NULL,
    pull_duration   INT NOT NULL,  -- milliseconds
    total_bytes     BIGINT NOT NULL,
    average_speed   BIGINT,  -- bytes/second
    cache_hit       BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_image_pull_completion_compute_base ON image_pull_completion(compute_base_id);
CREATE INDEX idx_image_pull_completion_node ON image_pull_completion(node_id);
CREATE INDEX idx_image_pull_completion_digest ON image_pull_completion(digest);
```

### 7.5 GPU调度追踪表

```sql
-- GPU调度事件
CREATE TABLE gpu_scheduling_event (
    id              TEXT PRIMARY KEY,
    compute_base_id TEXT NOT NULL REFERENCES compute_base(id),
    event_type      VARCHAR(32) NOT NULL,  -- request | pull_start | pull_end | schedule_start | gpu_allocated | container_start
    node_id         VARCHAR(255),
    node_region     VARCHAR(64),
    gpu_type        VARCHAR(64),
    gpu_count       INT,
    duration_ms     INT,  -- 本次事件耗时（毫秒）
    total_ms        INT,  -- 总耗时（毫秒）
    cache_hit       BOOLEAN,
    failure_reason  TEXT,
    metadata        JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gpu_scheduling_event_compute_base ON gpu_scheduling_event(compute_base_id);
CREATE INDEX idx_gpu_scheduling_event_type ON gpu_scheduling_event(event_type);
CREATE INDEX idx_gpu_scheduling_event_created ON gpu_scheduling_event(created_at);
```

---

## 8. API 设计

### 8.1 tRPC 路由

```typescript
export const computeRouter = createTRPCRouter({
  // 现有路由...
  
  /**
   * 获取实例日志
   */
  getInstanceLogs: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        startTime: z.date().optional(),
        endTime: z.date().optional(),
        filter: z.string().optional(),
        limit: z.number().int().min(1).max(1000).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const instance = await getServerlessInstance(input.id, ctx.organizationId)
      if (!instance) throw new Error("Instance not found")
      
      return queryInstanceLogs({
        computeBaseId: input.id,
        startTime: input.startTime,
        endTime: input.endTime,
        filter: input.filter,
        limit: input.limit,
      })
    }),

  /**
   * 获取实例存储信息
   */
  getStorageInfo: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const instance = await getServerlessInstance(input.id, ctx.organizationId)
      if (!instance) throw new Error("Instance not found")
      
      return getInstanceStorageInfo(input.id)
    }),

  /**
   * 扩容数据盘
   */
  expandDataDisk: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        targetGb: z.number().int().min(1).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const instance = await getServerlessInstance(input.id, ctx.organizationId)
      if (!instance) throw new Error("Instance not found")
      
      return expandInstanceDataDisk(input.id, input.targetGb)
    }),

  /**
   * 获取镜像拉取进度
   */
  getImagePullProgress: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const instance = await getServerlessInstance(input.id, ctx.organizationId)
      if (!instance) throw new Error("Instance not found")
      
      return getImagePullProgress(input.id)
    }),

  /**
   * 获取GPU调度追踪
   */
  getGpuSchedulingTimeline: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const instance = await getServerlessInstance(input.id, ctx.organizationId)
      if (!instance) throw new Error("Instance not found")
      
      return getGpuSchedulingTimeline(input.id)
    }),

  /**
   * 查询节点镜像缓存状态
   */
  getNodeImageCacheStatus: protectedProcedure
    .input(
      z.object({
        nodeId: z.string().optional(),
        imageRef: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (input.nodeId) {
        return getNodeImageCacheStatus(input.nodeId, input.imageRef)
      }
      return getAllNodesCacheStatus(input.imageRef)
    }),
})
```

### 8.2 REST API（OpenAPI）

```yaml
# /api/v1/compute/{id}/logs
GET:
  summary: 获取实例日志
  parameters:
    - name: id
      in: path
      required: true
      schema:
        type: string
    - name: startTime
      in: query
      schema:
        type: string
        format: date-time
    - name: endTime
      in: query
      schema:
        type: string
        format: date-time
    - name: filter
      in: query
      schema:
        type: string
    - name: limit
      in: query
      schema:
        type: integer
        default: 100
  responses:
    '200':
      description: 日志列表
      content:
        application/json:
          schema:
            type: object
            properties:
              logs:
                type: array
                items:
                  $ref: '#/components/schemas/LogEntry'

# /api/v1/compute/{id}/storage
GET:
  summary: 获取实例存储信息
  responses:
    '200':
      description: 存储信息
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/StorageInfo'

# /api/v1/compute/{id}/storage/expand
POST:
  summary: 扩容数据盘
  requestBody:
    content:
      application/json:
        schema:
          type: object
          properties:
            targetGb:
              type: integer
  responses:
    '200':
      description: 扩容成功

# /api/v1/compute/{id}/image-pull
GET:
  summary: 获取镜像拉取进度
  responses:
    '200':
      description: 镜像拉取进度
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ImagePullProgress'

# /api/v1/compute/{id}/gpu-scheduling
GET:
  summary: 获取GPU调度时间线
  responses:
    '200':
      description: GPU调度时间线
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/GpuSchedulingTimeline'

# /api/v1/nodes/{nodeId}/image-cache
GET:
  summary: 查询节点镜像缓存状态
  parameters:
    - name: nodeId
      in: path
      required: true
      schema:
        type: string
    - name: imageRef
      in: query
      required: true
      schema:
        type: string
  responses:
    '200':
      description: 镜像缓存状态
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ImageCacheStatus'
```

---

## 9. 监控与告警

### 9.1 关键指标

```yaml
# OpenMeter 指标
openmeter_events_total{type, tenant_id}  # 事件接收总数
openmeter_query_duration_seconds{meter}  # 查询耗时
openmeter_aggregation_latency_seconds    # 聚合延迟

# 镜像拉取指标
image_pull_total{image_ref, status}  # 拉取总数
image_pull_duration_seconds{image_ref}  # 拉取耗时
image_pull_speed_bytes{image_ref}  # 拉取速度
image_pull_cache_hit_total{node_id}  # 缓存命中数
image_pull_failure_total{image_ref, reason}  # 拉取失败数

# GPU调度指标
gpu_scheduling_total{gpu_type, status}  # 调度总数
gpu_scheduling_duration_seconds{gpu_type}  # 调度耗时
gpu_allocation_total{gpu_type}  # GPU分配总数
gpu_allocation_duration_seconds{gpu_type}  # GPU分配耗时
gpu_idle_seconds{node_id}  # GPU空闲时间

# 计费指标
billing_deduction_total{instance_id, status}  # 扣费次数
billing_deduction_amount_total{instance_id}   # 扣费金额
billing_insufficient_balance_total             # 余额不足次数

# 存储指标
storage_pvc_total{instance_id, type}          # PVC 数量
storage_pvc_size_bytes{instance_id}           # PVC 大小
storage_expand_total{instance_id, status}     # 扩容次数

# 日志指标
log_entries_total{instance_id, level}         # 日志条数
log_query_duration_seconds{instance_id}       # 查询耗时
```

### 9.2 告警规则

```yaml
groups:
  - name: openmeter_alerts
    rules:
      - alert: OpenMeterEventIngestionFailed
        expr: rate(openmeter_events_total{status="failed"}[5m]) > 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "OpenMeter 事件接收失败"

      - alert: OpenMeterQueryTimeout
        expr: histogram_quantile(0.95, rate(openmeter_query_duration_seconds_bucket[5m])) > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "OpenMeter 查询超时"

  - name: image_pull_alerts
    rules:
      - alert: ImagePullTimeout
        expr: histogram_quantile(0.95, rate(image_pull_duration_seconds_bucket[5m])) > 600
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "镜像拉取超时: {{ $labels.image_ref }}"

      - alert: ImagePullFailureHigh
        expr: rate(image_pull_failure_total[5m]) / rate(image_pull_total[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "镜像拉取失败率超过 10%"

      - alert: ImagePullCacheHitLow
        expr: rate(image_pull_cache_hit_total[5m]) / rate(image_pull_total[5m]) < 0.3
        for: 30m
        labels:
          severity: warning
        annotations:
          summary: "镜像缓存命中率低于 30%"

  - name: gpu_scheduling_alerts
    rules:
      - alert: GpuSchedulingDelay
        expr: histogram_quantile(0.95, rate(gpu_scheduling_duration_seconds_bucket[5m])) > 120
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "GPU调度延迟超过 2 分钟"

      - alert: GpuIdleHigh
        expr: avg(gpu_idle_seconds) by (node_id) > 3600
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "GPU空闲时间超过 1 小时: {{ $labels.node_id }}"

  - name: billing_alerts
    rules:
      - alert: BillingDeductionFailed
        expr: rate(billing_deduction_total{status="failed"}[5m]) > 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "计费扣费失败: {{ $labels.instance_id }}"

      - alert: InsufficientBalance
        expr: billing_insufficient_balance_total > 0
        labels:
          severity: warning
        annotations:
          summary: "余额不足实例数: {{ $value }}"

  - name: storage_alerts
    rules:
      - alert: PvcExpansionFailed
        expr: rate(storage_expand_total{status="failed"}[1h]) > 0
        labels:
          severity: critical
        annotations:
          summary: "PVC 扩容失败"

      - alert: StorageQuotaExceeded
        expr: storage_pvc_size_bytes / storage_pvc_quota_bytes > 0.9
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "存储配额使用超过 90%"

  - name: log_alerts
    rules:
      - alert: HighErrorRate
        expr: rate(log_entries_total{level="error"}[5m]) / rate(log_entries_total[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "错误日志率超过 10%"
```

### 9.3 Grafana Dashboard

```json
{
  "dashboard": {
    "title": "Serverless 实例监控",
    "panels": [
      {
        "title": "OpenMeter 事件吞吐量",
        "type": "timeseries",
        "targets": [{
          "expr": "sum(rate(openmeter_events_total[5m])) by (type)",
          "legendFormat": "{{ type }}"
        }]
      },
      {
        "title": "镜像拉取成功率",
        "type": "stat",
        "targets": [{
          "expr": "sum(rate(image_pull_total{status='success'}[5m])) / sum(rate(image_pull_total[5m])) * 100",
          "legendFormat": "成功率 %"
        }]
      },
      {
        "title": "镜像拉取耗时分布",
        "type": "histogram",
        "targets": [{
          "expr": "histogram_quantile(0.95, rate(image_pull_duration_seconds_bucket[5m]))",
          "legendFormat": "P95"
        }]
      },
      {
        "title": "镜像缓存命中率",
        "type": "gauge",
        "targets": [{
          "expr": "sum(rate(image_pull_cache_hit_total[5m])) / sum(rate(image_pull_total[5m])) * 100",
          "legendFormat": "命中率 %"
        }]
      },
      {
        "title": "GPU调度延迟",
        "type": "timeseries",
        "targets": [{
          "expr": "histogram_quantile(0.95, rate(gpu_scheduling_duration_seconds_bucket[5m]))",
          "legendFormat": "P95 调度延迟"
        }]
      },
      {
        "title": "GPU空闲时间",
        "type": "timeseries",
        "targets": [{
          "expr": "avg(gpu_idle_seconds) by (node_id)",
          "legendFormat": "{{ node_id }}"
        }]
      },
      {
        "title": "计费扣费成功率",
        "type": "stat",
        "targets": [{
          "expr": "sum(rate(billing_deduction_total{status='success'}[5m])) / sum(rate(billing_deduction_total[5m])) * 100",
          "legendFormat": "成功率 %"
        }]
      },
      {
        "title": "存储使用趋势",
        "type": "timeseries",
        "targets": [{
          "expr": "sum(storage_pvc_size_bytes) by (instance_id)",
          "legendFormat": "{{ instance_id }}"
        }]
      },
      {
        "title": "日志级别分布",
        "type": "piechart",
        "targets": [{
          "expr": "sum(log_entries_total) by (level)",
          "legendFormat": "{{ level }}"
        }]
      }
    ]
  }
}
```

---

## 10. 安全与多租户

### 10.1 租户隔离

```yaml
# Capsule Tenant CRD
apiVersion: capsule.clastix.io/v1beta2
kind: Tenant
metadata:
  name: tenant-xxx
spec:
  owners:
    - name: org-xxx
      kind: User
  namespaceQuota:
    count: 10
  resourceQuota:
    items:
      - hard:
          requests.nvidia.com/gpu: "8"
          limits.nvidia.com/gpu: "8"
          requests.cpu: "32"
          limits.cpu: "64"
          requests.memory: "128Gi"
          limits.memory: "256Gi"
  networkPolicy:
    enabled: true
    egress:
      - to:
          - podSelector:
              matchLabels:
                capsule.clastix.io/tenant: tenant-xxx
```

### 10.2 存储安全

```yaml
# PVC 安全上下文
securityContext:
  runAsUser: 1000
  runAsGroup: 3000
  fsGroup: 2000
  supplementalGroups:
    - 5000
```

### 10.3 日志安全

```yaml
# 日志访问控制
apiVersion: v1
kind: ConfigMap
metadata:
  name: loki-authorization
data:
  config.yaml: |
    auth_enabled: true
    tenant_id_header: X-Scope-OrgID
    application: auth
    auth:
      type: basic
      basic_auth_users:
        - username: admin
          password_hash: $2a$10$...
```

### 10.4 RBAC 权限

```yaml
# gpus 应用 ServiceAccount
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: gpus-app-role
rules:
  - apiGroups: [""]
    resources: ["pods", "pods/log", "events"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["persistentvolumeclaims"]
    verbs: ["get", "list", "create", "update", "delete"]
  - apiGroups: ["apps"]
    resources: ["deployments", "replicasets"]
    verbs: ["get", "list", "watch"]
```

---

## 11. 实施路线图

### Phase 1: OpenMeter 集成（1-2周）

| 任务 | 优先级 | 负责人 |
|------|--------|--------|
| OpenMeter 部署配置 | P0 | 运维 |
| Meter 定义（GPU/CPU/内存） | P0 | 后端 |
| 资源采集器开发 | P0 | 后端 |
| 事件发送 API | P0 | 后端 |

### Phase 2: 镜像拉取优化（2-3周）

| 任务 | 优先级 | 负责人 |
|------|--------|--------|
| 镜像拉取进度追踪 | P0 | 后端 |
| 节点镜像缓存管理 | P0 | 后端 |
| GPU调度延迟优化 | P0 | 后端 |
| 镜像拉取超时重试 | P1 | 后端 |
| 节点选择算法优化 | P1 | 后端 |

### Phase 3: 基础集成（1-2周）

| 任务 | 优先级 | 负责人 |
|------|--------|--------|
| Skypilot API 封装完善 | P0 | 后端 |
| 5分钟计费 Cron Job | P0 | 后端 |
| PVC 创建/删除 API | P0 | 后端 |
| 日志查询 API | P1 | 后端 |

### Phase 4: 存储与日志（2-3周）

| 任务 | 优先级 | 负责人 |
|------|--------|--------|
| PVC 扩容 API | P0 | 后端 |
| Promtail 部署配置 | P1 | 运维 |
| Loki 集成 | P1 | 运维 |
| 日志查询 UI | P1 | 前端 |

### Phase 5: 监控与告警（1-2周）

| 任务 | 优先级 | 负责人 |
|------|--------|--------|
| Grafana Dashboard | P1 | 运维 |
| 告警规则配置 | P1 | 运维 |
| 存储配额告警 | P2 | 后端 |

### Phase 6: 优化与加固（持续）

| 任务 | 优先级 | 负责人 |
|------|--------|--------|
| 多租户隔离优化 | P1 | 后端 |
| 日志保留策略 | P2 | 运维 |
| 性能优化 | P2 | 全栈 |

---

## 12. 附录

### 12.1 术语表

| 术语 | 定义 |
|------|------|
| **PVC** | PersistentVolumeClaim，K8s 存储声明 |
| **CSI** | Container Storage Interface，容器存储接口 |
| **Skypilot** | 开源的云原生 AI 平台 |
| **SkyServe** | Skypilot 的推理服务组件 |
| **Capsule** | K8s 多租户隔离框架 |
| **Promtail** | Loki 的日志采集代理 |
| **Loki** | Grafana 的日志聚合系统 |
| **OpenMeter** | 开源的用量计量平台，支持事件驱动计费 |
| **Meter** | OpenMeter 中的计量单元，用于聚合特定维度的用量 |
| **Image Pull** | 镜像拉取，从镜像仓库下载容器镜像到节点的过程 |
| **Image Cache** | 镜像缓存，节点本地存储的已拉取镜像副本 |
| **GPU Scheduling** | GPU调度，将Pod分配到有可用GPU的节点的过程 |

### 12.2 参考文档

| 文档 | 关系 |
|------|------|
| `serverless-implementation.md` | Serverless 产品定义 |
| `tenant-balance-unification.md` | 余额模型与扣费原语 |
| `billing-display.md` | 账单展示与 OpenMeter 集成 |
| `monitoring-observability.md` | 监控架构 |
| `storage-quota-and-s3-volume.md` | 存储配额设计 |
| `capsule-skypilot-multi-tenancy.md` | K8s 多租户隔离 |
| `compute-task-decoupling-analysis.md` | 计算资源解耦 |
| `00-overview.md` | 系统架构总览 |
| `image-registry-optimization.md` | 镜像仓库与拉取优化 |

### 12.3 变更记录

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2026-07-26 | v1.0 | 初始版本 |
| 2026-07-26 | v1.1 | 集成 OpenMeter 用量计量 |
| 2026-07-26 | v1.2 | 添加镜像拉取优化设计 |

### 12.4 OpenMeter 部署配置

#### 开发环境

```yaml
# docker-compose.dev.yaml
version: '3.8'
services:
  openmeter:
    image: openmeter/openmeter:latest
    ports:
      - "8080:8080"
    environment:
      - OPENMETER_DATABASE_URL=postgres://user:pass@postgres:5432/openmeter
      - OPENMETER_CLICKHOUSE_URL=http://clickhouse:8123/openmeter
      - OPENMETER_API_TOKEN=dev-token
    volumes:
      - ./openmeter-config.yaml:/etc/openmeter/config.yaml
    command: ["--config", "/etc/openmeter/config.yaml"]

  clickhouse:
    image: clickhouse/clickhouse-server:latest
    ports:
      - "8123:8123"
      - "9000:9000"
    volumes:
      - clickhouse_data:/var/lib/clickhouse
      - ./clickhouse-config.xml:/etc/clickhouse-server/config.d/logging.xml
    ulimits:
      nofile:
        soft: 262144
        hard: 262144

  postgres:
    image: postgres:15
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_DB=openmeter
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  clickhouse_data:
  postgres_data:
```

#### 生产环境

```yaml
# k8s-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: openmeter
  namespace: billing
spec:
  replicas: 2
  selector:
    matchLabels:
      app: openmeter
  template:
    metadata:
      labels:
        app: openmeter
    spec:
      containers:
        - name: openmeter
          image: openmeter/openmeter:latest
          ports:
            - containerPort: 8080
          env:
            - name: OPENMETER_DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: openmeter-secrets
                  key: database-url
            - name: OPENMETER_CLICKHOUSE_URL
              valueFrom:
                secretKeyRef:
                  name: openmeter-secrets
                  key: clickhouse-url
            - name: OPENMETER_API_TOKEN
              valueFrom:
                secretKeyRef:
                  name: openmeter-secrets
                  key: api-token
          resources:
            requests:
              cpu: "500m"
              memory: "512Mi"
            limits:
              cpu: "1000m"
              memory: "1Gi"
          livenessProbe:
            httpGet:
              path: /api/v1/ok
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /api/v1/ok
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: openmeter
  namespace: billing
spec:
  selector:
    app: openmeter
  ports:
    - port: 8080
      targetPort: 8080
  type: ClusterIP
```

#### OpenMeter 配置文件

```yaml
# openmeter-config.yaml
# OpenMeter 服务器配置
server:
  port: 8080
  host: 0.0.0.0

# 数据库配置
database:
  url: ${OPENMETER_DATABASE_URL}
  driver: postgres

# ClickHouse 配置（用于存储用量数据）
clickhouse:
  url: ${OPENMETER_CLICKHOUSE_URL}
  database: openmeter

# 日志配置
log:
  level: info
  format: json

# 事件配置
events:
  # 事件保留时间
  retention: 30d
  # 事件批处理大小
  batch_size: 100

# Meter 配置
meters:
  # GPU 使用时长
  - slug: gpu_count_seconds
    eventType: resource_usage
    valueProperty: $.data.resources.gpu.count
    groupBy:
      tenant_id: $.data.tenant_id
      organization_id: $.data.organization_id
      gpu_type: $.data.resources.gpu.type
      product_line: $.data.product_line
      region: $.data.idc
    filter: $.data.billable == true
    windowSize: 1m

  # CPU 使用时长
  - slug: cpu_core_seconds
    eventType: resource_usage
    valueProperty: $.data.resources.cpu
    groupBy:
      tenant_id: $.data.tenant_id
      organization_id: $.data.organization_id
      product_line: $.data.product_line
      region: $.data.idc
    filter: $.data.billable == true
    windowSize: 1m

  # 内存使用时长
  - slug: memory_gb_seconds
    eventType: resource_usage
    valueProperty: $.data.resources.memory_gb
    groupBy:
      tenant_id: $.data.tenant_id
      organization_id: $.data.organization_id
      product_line: $.data.product_line
      region: $.data.idc
    filter: $.data.billable == true
    windowSize: 1m

  # 推理 Token 数
  - slug: inference_tokens
    eventType: inference_usage
    valueProperty: $.data.total_tokens
    groupBy:
      tenant_id: $.data.tenant_id
      organization_id: $.data.organization_id
      model: $.data.model
    windowSize: 1m

  # 推理请求数
  - slug: inference_requests
    eventType: inference_usage
    valueProperty: $.data.request_count
    groupBy:
      tenant_id: $.data.tenant_id
      organization_id: $.data.organization_id
      model: $.data.model
    windowSize: 1m
```
