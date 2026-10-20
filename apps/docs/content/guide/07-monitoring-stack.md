# 第七章：监控告警全栈

> 基于 Prometheus + Grafana + Loki + DCGM 的全方位监控体系，覆盖基础设施、GPU、应用、业务四层。

---

## 7.1 架构概览

```
IDC-A 边缘集群                        中心集群
┌───────────────────┐       ┌─────────────────────────────┐
│ DCGM Exporter ────┼──────►│ Prometheus (联邦)            │
│ Node Exporter ────┤       │   ├── Remote Write 接收      │
│ kube-state-metrics┤       │   └── PromQL 查询            │
└───────────────────┘       │                             │
                            │ Grafana (Dashboard)          │
IDC-B 边缘集群              │   ├── GPU Dashboard          │
┌───────────────────┐       │   ├── 基础设施 Dashboard     │
│ DCGM Exporter ────┼──────►│   └── 业务 Dashboard         │
│ Node Exporter ────┤       │                             │
│ kube-state-metrics┤       │ Loki (日志)                  │
└───────────────────┘       │   └── Promtail → Loki        │
                            │                             │
                            │ AlertManager                │
                            │   └── 飞书/电话告警           │
                            └─────────────────────────────┘
```

---

## 7.2 中心集群：Prometheus

### 7.2.1 使用 kube-prometheus-stack 安装

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install kube-prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --kubeconfig=$CENTRAL_KUBECONFIG \
  --set prometheus.prometheusSpec.retention=30d \
  --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.storageClassName=local-ssd \
  --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage=200Gi \
  --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false \
  --set prometheus.prometheusSpec.podMonitorSelectorNilUsesHelmValues=false \
  --set grafana.adminPassword="<REPLACE_WITH_SECURE_PASSWORD>" \
  --set grafana.persistence.enabled=true \
  --set grafana.persistence.size=20Gi \
  --set alertmanager.alertmanagerSpec.retention=120h \
  --wait --timeout 300s
```

### 7.2.2 配置联邦抓取（IDC → 中心）

```yaml
# federation-scrape-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-federation
  namespace: monitoring
data:
  federation.yaml: |
    # 联邦抓取：中心 Prometheus 从各 IDC Prometheus 拉取指标
    scrape_configs:
      - job_name: 'federation-idc-a'
        honor_labels: true
        metrics_path: '/federate'
        params:
          'match[]':
            - '{job=~".+"}'
            - '{__name__=~"nvidia_.*"}'
            - '{__name__=~"dcgm_.*"}'
        static_configs:
          - targets:
            - 'prometheus-idc-a.monitoring.svc:9090'
        scrape_interval: 30s

      - job_name: 'federation-idc-b'
        honor_labels: true
        metrics_path: '/federate'
        params:
          'match[]':
            - '{job=~".+"}'
        static_configs:
          - targets:
            - 'prometheus-idc-b.monitoring.svc:9090'
        scrape_interval: 30s
```

---

## 7.3 IDC 边缘集群：Prometheus + DCGM Exporter

在**每个 IDC 集群**上安装轻量 Prometheus：

### 7.3.1 安装 Prometheus（IDC 轻量版）

```bash
helm install prometheus prometheus-community/prometheus \
  --namespace monitoring \
  --kubeconfig=$IDC_KUBECONFIG \
  --create-namespace \
  --set server.retention=7d \
  --set server.persistentVolume.size=50Gi \
  --set alertmanager.enabled=false \
  --set pushgateway.enabled=false \
  --set server.service.type=ClusterIP
```

### 7.3.2 安装 DCGM Exporter

```bash
helm repo add gpu-helm-charts https://nvidia.github.io/dcgm-exporter/helm-charts

helm install dcgm-exporter gpu-helm-charts/dcgm-exporter \
  --namespace monitoring \
  --kubeconfig=$IDC_KUBECONFIG \
  --set tolerations[0].key=GPURun.cloud/gpu \
  --set tolerations[0].operator=Equal \
  --set tolerations[0].value=true \
  --set tolerations[0].effect=NoSchedule \
  --set nodeSelector."nvidia\.com/gpu\.present"=true
```

### 7.3.3 DCGM Exporter GPU 指标

DCGM Exporter 暴露以下关键指标：

| 指标 | 类型 | 说明 |
|------|------|------|
| `DCGM_FI_DEV_BUSY_GPU` | gauge | GPU 利用率 (%) |
| `DCGM_FI_DEV_FB_USED` | gauge | 显存使用 (MiB) |
| `DCGM_FI_DEV_FB_FREE` | gauge | 显存空闲 (MiB) |
| `DCGM_FI_DEV_TEMPERATURE` | gauge | GPU 温度 (°C) |
| `DCGM_FI_DEV_POWER_USAGE` | gauge | 功耗 (W) |
| `DCGM_FI_DEV_ECC_SBE` | counter | 单 bit ECC 错误 |
| `DCGM_FI_DEV_ECC_DBE` | counter | 双 bit ECC 错误 |
| `DCGM_FI_SM_ACTIVE` | gauge | SM 活跃周期 |
| `DCGM_FI_SM_OCCUPANCY` | gauge | SM 占用率 |

### 7.3.4 安装 kube-state-metrics

```bash
helm install kube-state-metrics prometheus-community/kube-state-metrics \
  --namespace monitoring \
  --kubeconfig=$IDC_KUBECONFIG \
  --set collectors=pods,nodes,deployments,jobs
```

---

## 7.4 Grafana Dashboard

### 7.4.1 导入 Dashboard

Grafana 预置以下 Dashboard（通过 kube-prometheus-stack 自带）：

| Dashboard ID | 名称 | 用途 |
|-------------|------|------|
| 315 | Kubernetes Cluster Monitoring | K8s 集群总览 |
| 11074 | K8s Pod Metrics | Pod 级监控 |
| 12239 | DCGM Exporter | GPU 监控 |
| 11349 | Node Exporter Full | 主机监控 |

### 7.4.2 自定义 GPU 业务 Dashboard

```json
{
  "dashboard": {
    "title": "GPURun GPU 业务监控",
    "panels": [
      {
        "title": "GPU 总利用率",
        "type": "timeseries",
        "targets": [{
          "expr": "avg(DCGM_FI_DEV_BUSY_GPU{namespace=~\"tenant-.*\"}) by (namespace)",
          "legendFormat": "{{ namespace }}"
        }]
      },
      {
        "title": "可用 GPU 数量",
        "type": "stat",
        "targets": [{
          "expr": "sum(DCGM_FI_DEV_FB_FREE{namespace=~\"tenant-.*\"} > 0) by (instance)",
          "legendFormat": "{{ instance }}"
        }]
      },
      {
        "title": "GPU 温度",
        "type": "gauge",
        "targets": [{
          "expr": "DCGM_FI_DEV_TEMPERATURE",
          "legendFormat": "{{ instance }}"
        }],
        "fieldConfig": {
          "defaults": {
            "thresholds": {
              "steps": [
                {"value": 0, "color": "green"},
                {"value": 75, "color": "yellow"},
                {"value": 85, "color": "red"}
              ]
            }
          }
        }
      },
      {
        "title": "Pod GPU 使用",
        "type": "table",
        "targets": [{
          "expr": "sum(DCGM_FI_DEV_FB_USED) by (namespace, pod)",
          "legendFormat": "{{ namespace }}/{{ pod }}"
        }]
      }
    ]
  }
}
```

---

## 7.5 告警规则

### 7.5.1 GPU 告警

```yaml
# gpu-alerts.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: gpu-alerts
  namespace: monitoring
spec:
  groups:
    - name: gpu_alerts
      rules:
        - alert: GpuHighTemperature
          expr: DCGM_FI_DEV_TEMPERATURE > 85
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "GPU 温度过高: {{ $labels.instance }}"
            description: "GPU 温度 {{ $value }}°C 超过 85°C 阈值"

        - alert: GpuMemoryHigh
          expr: (DCGM_FI_DEV_FB_USED / (DCGM_FI_DEV_FB_USED + DCGM_FI_DEV_FB_FREE)) > 0.95
          for: 10m
          labels:
            severity: warning

        - alert: GpuEccError
          expr: rate(DCGM_FI_DEV_ECC_DBE[5m]) > 0
          labels:
            severity: critical

        - alert: GpuNodeDown
          expr: up{job="dcgm-exporter"} == 0
          for: 2m
          labels:
            severity: critical
```

### 7.5.2 节点告警

```yaml
# node-alerts.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: node-alerts
  namespace: monitoring
spec:
  groups:
    - name: node_alerts
      rules:
        - alert: NodeHighCPU
          expr: 100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 90
          for: 10m
          labels:
            severity: warning

        - alert: NodeLowMemory
          expr: (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) < 0.1
          for: 5m
          labels:
            severity: critical

        - alert: NodeDiskSpaceLow
          expr: (node_filesystem_avail_bytes / node_filesystem_size_bytes) < 0.1
          for: 5m
          labels:
            severity: critical
```

### 7.5.3 业务告警

```yaml
# business-alerts.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: business-alerts
  namespace: monitoring
spec:
  groups:
    - name: business_alerts
      rules:
        - alert: HighPaymentFailureRate
          expr: rate(payment_callback_total{status="failed"}[5m]) / rate(payment_callback_total[5m]) > 0.05
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "支付失败率超过 5%"

        - alert: TaskScheduleDelay
          expr: histogram_quantile(0.95, rate(task_schedule_duration_seconds_bucket[5m])) > 60
          for: 10m
          labels:
            severity: warning
```

```bash
kubectl --kubeconfig=$CENTRAL_KUBECONFIG apply -f gpu-alerts.yaml node-alerts.yaml business-alerts.yaml
```

---

## 7.6 AlertManager 配置

### 7.6.1 飞书告警

```yaml
# alertmanager-config.yaml
apiVersion: monitoring.coreos.com/v1alpha1
kind: AlertmanagerConfig
metadata:
  name: GPURun-alerts
  namespace: monitoring
spec:
  route:
    groupBy: ['alertname', 'severity']
    groupWait: 30s
    groupInterval: 5m
    repeatInterval: 4h
    receiver: feishu
    routes:
      - match:
          severity: critical
        receiver: feishu-critical
        groupWait: 10s
      - match:
          severity: warning
        receiver: feishu
  receivers:
    - name: feishu
      webhookConfigs:
        - url: 'https://open.feishu.cn/open-apis/bot/v2/hook/<WEBHOOK_TOKEN>'
    - name: feishu-critical
      webhookConfigs:
        - url: 'https://open.feishu.cn/open-apis/bot/v2/hook/<CRITICAL_WEBHOOK_TOKEN>'
```

---

## 7.7 Loki 日志聚合

### 7.7.1 安装 Loki

```bash
helm repo add grafana https://grafana.github.io/helm-charts

helm install loki grafana/loki \
  --namespace monitoring \
  --kubeconfig=$CENTRAL_KUBECONFIG \
  --set persistence.enabled=true \
  --set persistence.size=100Gi \
  --set singleBinary.replicas=1
```

### 7.7.2 安装 Promtail（IDC → Loki）

```bash
# 在每个 IDC 集群上安装 Promtail
helm install promtail grafana/promtail \
  --namespace monitoring \
  --kubeconfig=$IDC_KUBECONFIG \
  --set config.lokiAddress=http://loki.monitoring.svc:3100/loki/api/v1/push
```

### 7.7.3 日志查询示例

```logql
# 查询特定租户 Pod 日志
{namespace="tenant-alice"} | logfmt

# 查询 GPU 节点错误日志
{node=~"gpu-node-.*"} |= "ERROR"

# 查询任务调度日志
{app="skypilot-api"} | json | status="failed"
```

---

## 7.8 Grafana Tempo 追踪

```bash
helm install tempo grafana/tempo \
  --namespace monitoring \
  --kubeconfig=$CENTRAL_KUBECONFIG \
  --set persistence.enabled=true \
  --set persistence.size=50Gi
```

---

## 7.9 验证检查清单

| 检查项 | 命令 | 预期结果 |
|--------|------|---------|
| Prometheus 运行 | `kubectl get pods -n monitoring` | Running |
| DCGM Exporter | `kubectl get pods -n monitoring \| grep dcgm` | Running |
| GPU 指标 | `curl http://prometheus:9090/api/v1/query?query=DCGM_FI_DEV_BUSY_GPU` | 返回数据 |
| Grafana 可访问 | `kubectl port-forward svc/grafana 3000:80` | Dashboard 可用 |
| Loki 日志 | Grafana → Loki → Explore | 可查日志 |
| 告警规则 | Grafana → Alerting → Rules | 显示规则 |
| 告警测试 | 触发测试告警 → 飞书收到通知 | 通知到达 |
