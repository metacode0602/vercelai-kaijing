# 第十二章：OpenMeter 计量计费部署

> 在中心 Kubernetes 集群部署 OpenMeter（Helm），配置 Meter 定义，对接 Prometheus 指标采集器和计费 CronJob。

---

## 12.1 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                    中心 Kubernetes 集群                       │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              OpenMeter (billing namespace)            │   │
│  │                                                      │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │   │
│  │  │ API       │  │ Sink     │  │ Billing Worker    │  │   │
│  │  │ Server    │  │ Worker   │  │ (Subscription +   │  │   │
│  │  │ (ingest + │  │ (validate│  │  Invoice lifecycle)│  │   │
│  │  │  query)   │  │  + dedup │  └──────────────────┘  │   │
│  │  └──────────┘  │  + write │  ┌──────────────────┐  │   │
│  │                 │  to CH)  │  │ Balance Worker    │  │   │
│  │  ┌──────────┐  └──────────┘  │ (entitlement +    │  │   │
│  │  │ Scheduled │               │  credit balance)  │  │   │
│  │  │ Jobs      │  ┌──────────┐ └──────────────────┘  │   │
│  │  │ (migrate +│  │ Kafka    │  ┌──────────────────┐  │   │
│  │  │  mainten- │  │ (event   │  │ Notification Svc  │  │   │
│  │  │  ance)    │  │  bus)    │  │ (webhook rules)  │  │   │
│  │  └──────────┘  └──────────┘  └──────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ ClickHouse    │  │ PostgreSQL   │  │ Redis (optional) │  │
│  │ (usage store) │  │ (metadata)   │  │ (dedup + query)  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Prometheus    │  │ Billing      │  │ Resource          │  │
│  │ (metrics)     │  │ CronJob      │  │ Collectors        │  │
│  │               │  │ (5min pull)  │  │ (60s push)        │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 组件职责

| 组件 | 职责 | 副本数 |
|------|------|--------|
| **API Server** | 事件接收、Management API、用量查询、Webhook 投递 | 2 |
| **Sink Worker** | 事件校验、去重、持久化到 ClickHouse | 2 |
| **Balance Worker** | 计算 Entitlement 和 Credit 余额 | 1 |
| **Billing Worker** | 订阅同步、Rating、Invoice 生命周期 | 1 |
| **Notification Service** | 评估通知规则、记录待发通知事件 | 1 |
| **Scheduled Jobs** | 数据库迁移、跨域维护任务 | 1 (leader elected) |
| **Kafka** | 事件总线，解耦 API Server 和 Workers | 3 (broker) |
| **ClickHouse** | 用量事件存储和聚合查询 | 3 (shard) |
| **PostgreSQL** | 产品目录、订阅、计费元数据 | 与平台共享或独立 |

---

## 12.2 前置条件

```bash
# 确认 Helm 3 已安装
helm version --short  # >= 3.10

# 确认 kubectl 可连接中心集群
kubectl cluster-info

# 创建 billing 命名空间
kubectl create namespace billing
```

### 资源规划

| 组件 | CPU Request | CPU Limit | Memory Request | Memory Limit | 存储 |
|------|------------|-----------|---------------|-------------|------|
| API Server ×2 | 500m | 1000m | 512Mi | 1Gi | — |
| Sink Worker ×2 | 500m | 1000m | 512Mi | 1Gi | — |
| Balance Worker | 250m | 500m | 256Mi | 512Mi | — |
| Billing Worker | 250m | 500m | 256Mi | 512Mi | — |
| Notification Svc | 100m | 250m | 128Mi | 256Mi | — |
| Kafka ×3 | 1000m | 2000m | 2Gi | 4Gi | 100Gi SSD |
| ClickHouse ×3 | 2000m | 4000m | 4Gi | 8Gi | 500Gi SSD |
| PostgreSQL | 500m | 1000m | 1Gi | 2Gi | 100Gi SSD |

---

## 12.3 部署 Kafka

OpenMeter 依赖 Kafka 作为事件总线。如果中心集群没有现成的 Kafka，使用 Bitnami Helm chart 部署：

```bash
# 添加 Bitnami Helm repo
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

# 部署 Kafka（3 节点，生产级配置）
helm upgrade --install kafka bitnami/kafka \
  --namespace billing \
  --set controller.replicaCount=3 \
  --set controller.persistence.size=100Gi \
  --set controller.persistence.storageClass=local-path \
  --set controller.resources.requests.cpu=1000m \
  --set controller.resources.requests.memory=2Gi \
  --set controller.resources.limits.cpu=2000m \
  --set controller.resources.limits.memory=4Gi \
  --set controller.kafkaConfig.defaultReplicationFactor=3 \
  --set controller.kafkaConfig.minInsyncReplicas=2 \
  --set controller.kafkaConfig.numPartitions=6 \
  --set controller.kafkaConfig.logRetentionHours=168 \
  --set controller.kafkaConfig.logSegmentBytes=1073741824 \
  --set controller.kafkaConfig.logRetentionCheckIntervalMs=300000 \
  --set controller.automountServiceAccountToken=true \
  --wait --timeout 5m

# 验证 Kafka
kubectl -n billing get pods -l app.kubernetes.io/name=kafka
# 预期: kafka-0, kafka-1, kafka-2 全部 Running

# 创建 OpenMeter 事件主题
kubectl -n billing exec -it kafka-0 -- \
  kafka-topics.sh --bootstrap-server localhost:9092 \
  --create --topic openmeter-events \
  --partitions 6 --replication-factor 3

# 验证主题
kubectl -n billing exec -it kafka-0 -- \
  kafka-topics.sh --bootstrap-server localhost:9092 --list
```

---

## 12.4 部署 ClickHouse

OpenMeter 使用 ClickHouse 存储和聚合用量数据：

```bash
# 部署 ClickHouse（3 节点集群模式）
helm upgrade --install clickhouse bitnami/clickhouse \
  --namespace billing \
  --set shardsCount=3 \
  --set replicaCount=1 \
  --set auth.enabled=false \
  --set persistence.size=500Gi \
  --set persistence.storageClass=local-path \
  --set resources.requests.cpu=2000m \
  --set resources.requests.memory=4Gi \
  --set resources.limits.cpu=4000m \
  --set resources.limits.memory=8Gi \
  --set zookeeper.enabled=false \
  --set clickhouse.config."max_server_memory_usage_to_ram_ratio"="0.8" \
  --set clickhouse.config."mark_cache_size"="10737418240" \
  --set clickhouse.config."uncompressed_cache_size"="8589934592" \
  --wait --timeout 10m

# 验证 ClickHouse
kubectl -n billing get pods -l app.kubernetes.io/name=clickhouse
# 预期: clickhouse-shard-0/1/2 全部 Running

# 创建 OpenMeter 数据库
kubectl -n billing exec -it clickhouse-shard-0-0 -- \
  clickhouse-client --query "CREATE DATABASE IF NOT EXISTS openmeter"

# 验证数据库
kubectl -n billing exec -it clickhouse-shard-0-0 -- \
  clickhouse-client --query "SHOW DATABASES" | grep openmeter
```

---

## 12.5 部署 PostgreSQL（OpenMeter 专用）

> 如果平台已有 PostgreSQL 且资源充足，可复用现有实例，创建独立 database。
> 推荐使用独立实例避免计费流量影响业务库。

```bash
# 部署 PostgreSQL（OpenMeter 专用）
helm upgrade --install openmeter-pg bitnami/postgresql \
  --namespace billing \
  --set auth.database=openmeter \
  --set auth.username=openmeter \
  --set auth.password=<生成随机密码> \
  --set primary.persistence.size=100Gi \
  --set primary.persistence.storageClass=local-path \
  --set resources.requests.cpu=500m \
  --set resources.requests.memory=1Gi \
  --set resources.limits.cpu=1000m \
  --set resources.limits.memory=2Gi \
  --set primary.extendedConfiguration="max_connections=200" \
  --wait --timeout 5m

# 验证 PostgreSQL
kubectl -n billing get pods -l app.kubernetes.io/name=postgresql
# 预期: openmeter-pg-postgresql-0 Running

# 记录连接信息
export OPENMETER_PG_URL="postgresql://openmeter:<PASSWORD>@openmeter-pg-postgresql.database.svc:5432/openmeter"
```

---

## 12.6 部署 OpenMeter（Helm）

使用官方 Helm chart 部署 OpenMeter：

```bash
# 部署 OpenMeter
helm upgrade --install openmeter \
  oci://ghcr.io/openmeterio/helm-charts/openmeter \
  --namespace billing \
  --set api.replicaCount=2 \
  --set api.resources.requests.cpu=500m \
  --set api.resources.requests.memory=512Mi \
  --set api.resources.limits.cpu=1000m \
  --set api.resources.limits.memory=1Gi \
  --set sinkWorker.replicaCount=2 \
  --set sinkWorker.resources.requests.cpu=500m \
  --set sinkWorker.resources.requests.memory=512Mi \
  --set sinkWorker.resources.limits.cpu=1000m \
  --set sinkWorker.resources.limits.memory=1Gi \
  --set balanceWorker.replicaCount=1 \
  --set billingWorker.replicaCount=1 \
  --set notificationService.replicaCount=1 \
  --set scheduledJobs.replicaCount=1 \
  --wait --timeout 5m

# 验证 OpenMeter
kubectl -n billing get pods -l app.kubernetes.io/name=openmeter
# 预期: api, sink-worker, balance-worker, billing-worker, notification-service, scheduled-jobs 全部 Running

# 获取 API 地址
kubectl -n billing get svc openmeter-api
# 预期: ClusterIP 类型，端口 80

# 端口转发测试
kubectl -n billing port-forward svc/openmeter-api 8888:80 &
curl http://localhost:8888/api/v1/ok
# 预期: {"status":"ok"}
```

---

## 12.7 Meter 定义

### 12.7.1 通过 API 创建 Meter

```bash
# 设置环境变量
export OM_API="http://localhost:8888"
export OM_TOKEN="<OPENMETER_API_TOKEN>"

# 1. GPU 卡时计量（SUM 聚合）
curl -X POST "${OM_API}/api/v1/meters" \
  -H "Authorization: Bearer ${OM_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "gpu_count_seconds",
    "description": "GPU Card Hours",
    "eventType": "resource_usage",
    "valueProperty": "$.data.resources.gpu.count",
    "aggregation": "SUM",
    "groupBy": {
      "tenant_id": "$.data.tenant_id",
      "gpu_type": "$.data.resources.gpu.type",
      "product_line": "$.data.product_line",
      "idc": "$.data.idc",
      "task_id": "$.data.task_id"
    },
    "filter": "$.data.billable == true"
  }'

# 2. CPU 核时计量
curl -X POST "${OM_API}/api/v1/meters" \
  -H "Authorization: Bearer ${OM_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "cpu_core_seconds",
    "description": "CPU Core Hours",
    "eventType": "resource_usage",
    "valueProperty": "$.data.resources.cpu",
    "aggregation": "SUM",
    "groupBy": {
      "tenant_id": "$.data.tenant_id",
      "product_line": "$.data.product_line",
      "task_id": "$.data.task_id"
    },
    "filter": "$.data.billable == true"
  }'

# 3. 内存 GB 时计量
curl -X POST "${OM_API}/api/v1/meters" \
  -H "Authorization: Bearer ${OM_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "memory_gb_seconds",
    "description": "Memory GB Hours",
    "eventType": "resource_usage",
    "valueProperty": "$.data.resources.memory",
    "aggregation": "SUM",
    "groupBy": {
      "tenant_id": "$.data.tenant_id",
      "product_line": "$.data.product_line",
      "task_id": "$.data.task_id"
    },
    "filter": "$.data.billable == true"
  }'

# 4. 推理 Token 计量
curl -X POST "${OM_API}/api/v1/meters" \
  -H "Authorization: Bearer ${OM_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "inference_tokens",
    "description": "Inference Tokens",
    "eventType": "inference_usage",
    "valueProperty": "$.data.total_tokens",
    "aggregation": "SUM",
    "groupBy": {
      "tenant_id": "$.data.tenant_id",
      "model": "$.data.model",
      "task_id": "$.data.task_id"
    }
  }'

# 5. 推理请求数计量
curl -X POST "${OM_API}/api/v1/meters" \
  -H "Authorization: Bearer ${OM_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "inference_requests",
    "description": "Inference Requests",
    "eventType": "inference_usage",
    "aggregation": "COUNT",
    "groupBy": {
      "tenant_id": "$.data.tenant_id",
      "model": "$.data.model",
      "task_id": "$.data.task_id"
    }
  }'
```

### 12.7.2 通过配置文件创建（备选）

创建 `openmeter-values.yaml`：

```yaml
meters:
  - slug: gpu_count_seconds
    description: GPU Card Hours
    eventType: resource_usage
    valueProperty: "$.data.resources.gpu.count"
    aggregation: SUM
    groupBy:
      tenant_id: "$.data.tenant_id"
      gpu_type: "$.data.resources.gpu.type"
      product_line: "$.data.product_line"
      idc: "$.data.idc"
      task_id: "$.data.task_id"
    filter: "$.data.billable == true"

  - slug: cpu_core_seconds
    description: CPU Core Hours
    eventType: resource_usage
    valueProperty: "$.data.resources.cpu"
    aggregation: SUM
    groupBy:
      tenant_id: "$.data.tenant_id"
      product_line: "$.data.product_line"
      task_id: "$.data.task_id"
    filter: "$.data.billable == true"

  - slug: memory_gb_seconds
    description: Memory GB Hours
    eventType: resource_usage
    valueProperty: "$.data.resources.memory"
    aggregation: SUM
    groupBy:
      tenant_id: "$.data.tenant_id"
      product_line: "$.data.product_line"
      task_id: "$.data.task_id"
    filter: "$.data.billable == true"

  - slug: inference_tokens
    description: Inference Tokens
    eventType: inference_usage
    valueProperty: "$.data.total_tokens"
    aggregation: SUM
    groupBy:
      tenant_id: "$.data.tenant_id"
      model: "$.data.model"
      task_id: "$.data.task_id"

  - slug: inference_requests
    description: Inference Requests
    eventType: inference_usage
    aggregation: COUNT
    groupBy:
      tenant_id: "$.data.tenant_id"
      model: "$.data.model"
      task_id: "$.data.task_id"
```

重新部署：

```bash
helm upgrade --install openmeter \
  oci://ghcr.io/openmeterio/helm-charts/openmeter \
  --namespace billing \
  -f openmeter-values.yaml \
  --wait --timeout 5m
```

---

## 12.8 Meter 验证

```bash
# 列出所有 Meter
curl -s "${OM_API}/api/v1/meters" \
  -H "Authorization: Bearer ${OM_TOKEN}" | jq '.[].slug'
# 预期:
# "gpu_count_seconds"
# "cpu_core_seconds"
# "memory_gb_seconds"
# "inference_tokens"
# "inference_requests"

# 发送测试事件
curl -X POST "${OM_API}/api/v1/events" \
  -H "Authorization: Bearer ${OM_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "specversion": "1.0",
    "type": "resource_usage",
    "id": "test-event-001",
    "source": "test-collector",
    "time": "'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'",
    "subject": "tenant:test-tenant:task:test-task",
    "data": {
      "tenant_id": "test-tenant",
      "product_line": "k8s_gpu",
      "task_id": "test-task",
      "idc": "idc-a-beijing",
      "billable": true,
      "resources": {
        "gpu": { "count": 1, "type": "H100" },
        "cpu": 8,
        "memory": 32
      }
    }
  }'

# 查询 GPU 卡时用量（5 分钟窗口）
curl -s "${OM_API}/api/v1/meters/gpu_count_seconds/query" \
  -H "Authorization: Bearer ${OM_TOKEN}" \
  -G \
  --data-urlencode "from=$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)" \
  --data-urlencode "to=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --data-urlencode "windowSize=5m" \
  --data-urlencode "groupBy=tenant_id" \
  | jq '.data[]'
```

---

## 12.9 监控与告警

### 12.9.1 Prometheus 指标

OpenMeter 暴露以下 Prometheus 指标（端口 9090，路径 `/metrics`）：

| 指标名 | 类型 | 说明 |
|--------|------|------|
| `openmeter_events_total` | Counter | 已接收事件总数 |
| `openmeter_events_errors_total` | Counter | 事件处理错误数 |
| `openmeter_query_duration_seconds` | Histogram | 查询耗时 |
| `openmeter_aggregation_latency_seconds` | Histogram | 聚合延迟 |
| `openmeter_kafka_consumer_lag` | Gauge | Kafka 消费延迟 |

### 12.9.2 Prometheus 采集配置

```yaml
# prometheus-additional-scrape.yaml
- job_name: openmeter
  static_configs:
    - targets:
        - openmeter-api.billing.svc:9090
  metrics_path: /metrics
  scrape_interval: 15s
```

### 12.9.3 告警规则

```yaml
# prometheus-rules-openmeter.yaml
groups:
  - name: openmeter
    rules:
      - alert: OpenMeterEventIngestionFailed
        expr: rate(openmeter_events_errors_total[5m]) > 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "OpenMeter 事件接收失败"
          description: "过去 5 分钟内有 {{ $value }} 个事件处理失败"

      - alert: OpenMeterQueryTimeout
        expr: histogram_quantile(0.99, rate(openmeter_query_duration_seconds_bucket[5m])) > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "OpenMeter 查询超时"
          description: "P99 查询延迟超过 10 秒: {{ $value }}s"

      - alert: OpenMeterKafkaConsumerLag
        expr: openmeter_kafka_consumer_lag > 1000
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "OpenMeter Kafka 消费延迟"
          description: "Kafka consumer lag: {{ $value }}"

      - alert: OpenMeterPodNotReady
        expr: kube_pod_status_ready{namespace="billing",pod=~"openmeter-.*"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "OpenMeter Pod 未就绪"
          description: "Pod {{ $labels.pod }} 未就绪超过 2 分钟"
```

### 12.9.4 Grafana Dashboard

```
OpenMeter 计量看板
├── 事件吞吐量（events/sec，按 meter 分组）
├── 事件错误率（errors/sec）
├── 查询延迟（P50 / P95 / P99）
├── Kafka 消费延迟（按 consumer group）
├── ClickHouse 写入延迟
├── 活跃 Meter 数量
└── 按租户的用量 Top 10
```

---

## 12.10 计费 CronJob 对接

### 12.10.1 5 分钟增量拉取

```typescript
// apps/cronjobs/openmeter-billing-pull.ts

import { OpenMeter } from '@openmeter/sdk'

const openmeter = new OpenMeter({
  baseUrl: process.env.OPENMETER_API_URL,  // http://openmeter-api.billing.svc
  apiKey: process.env.OPENMETER_API_TOKEN,
})

// 每 5 分钟拉取增量用量
async function pullIncrementalUsage() {
  const from = getLastPullTime()  // 上次拉取时间
  const to = new Date()

  // 查询 GPU 卡时增量
  const gpuUsage = await openmeter.meters.query('gpu_count_seconds', {
    from: from.toISOString(),
    to: to.toISOString(),
    windowSize: '5m',
    groupBy: ['tenant_id', 'gpu_type', 'product_line', 'idc', 'task_id'],
  })

  // 按租户聚合并计算费用
  for (const dataPoint of gpuUsage.data) {
    const { tenant_id, gpu_type, product_line, idc, task_id } = dataPoint.window?.groupBy || {}
    const gpuSeconds = dataPoint.value

    // 查询单价
    const price = await getUnitPrice(tenant_id, gpu_type, product_line, idc)

    // 计算费用: gpu_seconds × (hourly_price / 3600)
    const cost = gpuSeconds * (price / 3600)

    // 执行余额扣款（freeze → consume → unfreeze 模型）
    await deductBalance(tenant_id, cost, {
      taskId: task_id,
      meterEventId: dataPoint.eventId,
      meterSubject: dataPoint.subject,
    })
  }

  // 更新上次拉取时间
  setLastPullTime(to)
}
```

### 12.10.2 日账单生成

```typescript
// 每天 00:30 生成昨日账单
async function generateDailyBill() {
  const yesterday = getYesterdayDateRange()

  // 查询昨日所有用量
  const meters = ['gpu_count_seconds', 'cpu_core_seconds', 'memory_gb_seconds', 'inference_tokens', 'inference_requests']

  for (const meterSlug of meters) {
    const usage = await openmeter.meters.query(meterSlug, {
      from: yesterday.from,
      to: yesterday.to,
      windowSize: '1d',
      groupBy: ['tenant_id'],
    })

    // 生成 line_item 记录
    for (const dataPoint of usage.data) {
      await createLineItem({
        tenantId: dataPoint.window?.groupBy?.tenant_id,
        meterSlug,
        amount: dataPoint.value,
        periodStart: yesterday.from,
        periodEnd: yesterday.to,
      })
    }
  }
}
```

---

## 12.11 运维操作

### 12.11.1 常用命令

```bash
# 查看 OpenMeter 所有 Pod
kubectl -n billing get pods -l app.kubernetes.io/name=openmeter

# 查看 OpenMeter 日志
kubectl -n billing logs -l app.kubernetes.io/name=openmeter,app.kubernetes.io/component=api --tail=100

# 查看 Kafka 消费状态
kubectl -n billing exec -it kafka-0 -- \
  kafka-consumer-groups.sh --bootstrap-server localhost:9092 --list

# 查看 ClickHouse 表
kubectl -n billing exec -it clickhouse-shard-0-0 -- \
  clickhouse-client --query "SHOW TABLES FROM openmeter"

# 重启 OpenMeter（不影响 Kafka 和 ClickHouse）
helm upgrade --install openmeter \
  oci://ghcr.io/openmeterio/helm-charts/openmeter \
  --namespace billing \
  --reuse-values \
  --wait --timeout 5m
```

### 12.11.2 数据保留策略

```bash
# ClickHouse 用量数据保留 30 天（默认）
# 修改 OpenMeter 配置：
# events.retention: 30d

# 手动清理 ClickHouse 历史数据
kubectl -n billing exec -it clickhouse-shard-0-0 -- \
  clickhouse-client --query "ALTER TABLE openmeter.events DELETE WHERE time < today() - 30"
```

### 12.11.3 扩缩容

```bash
# 扩展 API Server 副本数（应对流量高峰）
helm upgrade --install openmeter \
  oci://ghcr.io/openmeterio/helm-charts/openmeter \
  --namespace billing \
  --set api.replicaCount=4 \
  --reuse-values \
  --wait --timeout 5m

# 扩展 Kafka Broker（增加吞吐）
helm upgrade kafka bitnami/kafka \
  --namespace billing \
  --set controller.replicaCount=5 \
  --reuse-values \
  --wait --timeout 5m
```

---

## 12.12 故障排查

| 现象 | 可能原因 | 排查命令 |
|------|---------|---------|
| 事件接收 401 | API Token 无效 | 检查 `OPENMETER_API_TOKEN` 环境变量 |
| 事件接收 500 | Kafka 不可用 | `kubectl -n billing get pods -l app.kubernetes.io/name=kafka` |
| 查询超时 | ClickHouse 负载高 | `kubectl -n billing exec -it clickhouse-shard-0-0 -- clickhouse-client --query "SELECT * FROM system.processes"` |
| 用量数据缺失 | Sink Worker 未消费 | 检查 Kafka consumer lag: `kafka-consumer-groups.sh --describe --group openmeter-sink` |
| Pod CrashLoopBackOff | 配置错误或资源不足 | `kubectl -n billing describe pod <pod-name>` + `kubectl -n billing logs <pod-name> --previous` |
| 磁盘空间不足 | ClickHouse 数据增长 | `kubectl -n billing exec -it clickhouse-shard-0-0 -- clickhouse-client --query "SELECT formatReadableSize(sum(bytes_on_disk)) FROM system.parts"` |

---

## 12.13 卸载

```bash
# 卸载 OpenMeter（保留 ClickHouse 数据）
helm uninstall openmeter -n billing

# 卸载 Kafka（谨慎：会丢失事件）
helm uninstall kafka -n billing

# 卸载 ClickHouse（谨慎：会丢失用量数据）
helm uninstall clickhouse -n billing

# 卸载 PostgreSQL（谨慎：会丢失元数据）
helm uninstall openmeter-pg -n billing

# 清理命名空间
kubectl delete namespace billing
```
