# 第五章：Volcano Gang Scheduling

> Volcano 为批处理任务和 GPU 训练任务提供 Gang Scheduling（All-or-Nothing 调度），确保多 GPU 任务同时获得资源。

---

## 5.1 安装 Volcano

在**每个 IDC 边缘集群**上安装：

### 5.1.1 使用 Helm 安装

```bash
helm repo add volcano-sh https://volcano-sh.github.io/helm-charts
helm repo update

kubectl --kubeconfig=$IDC_KUBECONFIG create namespace volcano-system

helm install volcano volcano-sh/volcano \
  --namespace volcano-system \
  --kubeconfig=$IDC_KUBECONFIG \
  --set custom.collocatingGPU.enabled=true \
  --set custom.schedulingPolicy.enableSchedulerExtender=true \
  --wait --timeout 300s
```

### 5.1.2 使用 kubectl 安装（替代方案）

```bash
VOLCANO_VERSION="v1.9.0"
kubectl --kubeconfig=$IDC_KUBECONFIG apply -f \
  https://raw.githubusercontent.com/volcano-sh/volcano/${VOLCANO_VERSION}/installer/volcano-development.yaml
```

### 5.1.3 验证安装

```bash
kubectl --kubeconfig=$IDC_KUBECONFIG get pods -n volcano-system
# 预期: volcano-scheduler, volcano-controller, volcano-admission 全部 Running

kubectl --kubeconfig=$IDC_KUBECONFIG get crd | grep volcano
# 预期: jobs.scheduling.volcano.sh, queues.scheduling.volcano.sh 等
```

---

## 5.2 配置 Volcano Queue

### 5.2.1 默认队列

```yaml
# default-queue.yaml
apiVersion: scheduling.volcano.sh/v1beta1
kind: Queue
metadata:
  name: default-queue
spec:
  weight: 1
  reclaimable: true
  deserved: 0
  revocableZone: ""
```

### 5.2.2 业务队列（按租户/产品线）

```yaml
# business-queues.yaml
apiVersion: scheduling.volcano.sh/v1beta1
kind: Queue
metadata:
  name: cloud-vm-queue
spec:
  weight: 3
  reclaimable: true
  deserved: 100  # 最少保证 100 核
---
apiVersion: scheduling.volcano.sh/v1beta1
kind: Queue
metadata:
  name: inference-queue
spec:
  weight: 5
  reclaimable: true
  deserved: 50
---
apiVersion: scheduling.volcano.sh/v1beta1
kind: Queue
metadata:
  name: batch-queue
spec:
  weight: 2
  reclaimable: true
  deserved: 200
---
apiVersion: scheduling.volcano.sh/v1beta1
kind: Queue
metadata:
  name: spot-queue
spec:
  weight: 1
  reclaimable: true
  revocableZone: "spot-low"  # 可被回收
```

```bash
kubectl --kubeconfig=$IDC_KUBECONFIG apply -f business-queues.yaml
```

### 5.2.3 队列权重说明

| 队列 | 权重 | 说明 |
|------|------|------|
| inference-queue | 5 | 推理服务高优 |
| cloud-vm-queue | 3 | 云服务器正常 |
| batch-queue | 2 | 批处理任务 |
| spot-queue | 1 | Spot 可回收 |
| default-queue | 1 | 兜底 |

---

## 5.3 配置 PriorityClass

```yaml
# priority-classes.yaml
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: od-high
value: 1000000
globalDefault: false
description: "VIP 租户在线推理"
---
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: od-normal
value: 500000
globalDefault: true
description: "默认在线任务"
---
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: od-low
value: 100000
globalDefault: false
description: "实验/批处理低优任务"
---
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: spot-low
value: 10000
globalDefault: false
description: "Spot 可抢占任务"
preemptionPolicy: Never
description: "不主动抢占其他 Pod"
```

```bash
kubectl --kubeconfig=$IDC_KUBECONFIG apply -f priority-classes.yaml
```

---

## 5.4 使用 Volcano 调度 GPU Job

### 5.4.1 Volcano Job 示例

```yaml
# volcano-gpu-job.yaml
apiVersion: batch.volcano.sh/v1alpha1
kind: Job
metadata:
  name: train-alice-001
  namespace: tenant-alice
  labels:
    platform.org-id: "org_abc123"
    platform.task-id: "task_xyz789"
spec:
  minAvailable: 1
  schedulerName: volcano
  queue: batch-queue
  policies:
    - event: PodEvicted
      action: RestartJob
  tasks:
    - replicas: 1
      name: trainer
      template:
        metadata:
          annotations:
            platform.billing-mode: "prepaid"
            platform.org-id: "org_abc123"
        spec:
          priorityClassName: od-normal
          containers:
            - name: trainer
              image: pytorch:2.3-cuda12.1
              command:
                - bash
                - -c
                - python train.py --epochs 100
              resources:
                limits:
                  nvidia.com/gpu: 2
                  cpu: 8
                  memory: 32Gi
                requests:
                  nvidia.com/gpu: 2
                  cpu: 8
                  memory: 32Gi
              env:
                - name: NVIDIA_VISIBLE_DEVICES
                  value: "all"
          tolerations:
            - key: "GPURun.cloud/gpu"
              operator: "Equal"
              value: "true"
              effect: "NoSchedule"
```

### 5.4.2 提交与验证

```bash
# 提交
kubectl --kubeconfig=$IDC_KUBECONFIG apply -f volcano-gpu-job.yaml

# 查看 Job 状态
kubectl --kubeconfig=$IDC_KUBECONFIG get vj -n tenant-alice
# 预期: train-alice-001  Running  1/1

# 查看 Pod 调度
kubectl --kubeconfig=$IDC_KUBECONFIG get pods -n tenant-alice -o wide

# 查看队列状态
kubectl --kubeconfig=$IDC_KUBECONFIG get queues
```

---

## 5.5 Gang Scheduling 行为验证

```yaml
# gang-scheduling-test.yaml
# 测试 4 GPU All-or-Nothing 调度
apiVersion: batch.volcano.sh/v1alpha1
kind: Job
metadata:
  name: gang-test
  namespace: default
spec:
  minAvailable: 4  # 至少 4 个 Pod 同时调度
  schedulerName: volcano
  queue: default-queue
  tasks:
    - replicas: 4
      name: worker
      template:
        spec:
          containers:
            - name: worker
              image: nvidia/cuda:12.4.0-base-ubuntu22.04
              command: ["sleep", "3600"]
              resources:
                limits:
                  nvidia.com/gpu: 1
                  cpu: 2
                  memory: 4Gi
          tolerations:
            - key: "GPURun.cloud/gpu"
              operator: "Equal"
              value: "true"
              effect: "NoSchedule"
```

**验证要点**：
1. 如果可用 GPU < 4，所有 Pod 保持 Pending（Gang Scheduling 保证）
2. 一旦 4 个 GPU 同时可用，4 个 Pod 同时 Running
3. 不存在 1-3 个 Pod 运行而其他 Pending 的情况

```bash
kubectl --kubeconfig=$IDC_KUBECONFIG get pods -n default -l volcano.sh/job-name=gang-test
# 预期: 4 个 Pod 要么全部 Pending，要么全部 Running
```

---

## 5.6 Volcano 与 GPU 拓扑调度

### 5.6.1 NVLink 拓扑感知

对于 A100/H100 多卡节点，配置拓扑感知调度：

```yaml
# volcano-topology-config.yaml
apiVersion: scheduling.volcano.sh/v1beta1
kind: Queue
metadata:
  name: training-queue
spec:
  weight: 3
  reclaimable: true
  deserved: 0
  # GPU 拓扑感知调度
  allocation:
    - resource: nvidia.com/gpu
      request: 1
      # 优先分配同一 NVLink 域内的 GPU
```

### 5.6.2 节点亲和性

```yaml
# 在 Volcano Job 中指定 GPU 拓扑需求
affinity:
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      nodeSelectorTerms:
        - matchExpressions:
            - key: nvidia.com/gpu.product
              operator: In
              values:
                - NVIDIA-A100-SXM4-80GB
            - key: nvidia.com/nvlink
              operator: In
              values:
                - "enabled"
```

---

## 5.7 Volcano 监控

```bash
# 查看 Volcano Scheduler 指标
kubectl --kubeconfig=$IDC_KUBECONFIG port-forward -n volcano-system \
  svc/volcano-scheduler 9090:8080

# 访问 http://localhost:9090/metrics
# 关键指标:
# volcano_queue_allocated_resources{queue="batch-queue",resource="nvidia.com/gpu"} 8
# volcano_queue_request_resources{queue="batch-queue",resource="nvidia.com/gpu"} 12
# volcano_scheduling_latency_seconds_bucket
```

---

## 5.8 验证检查清单

| 检查项 | 命令 | 预期结果 |
|--------|------|---------|
| Volcano 运行 | `kubectl get pods -n volcano-system` | 3 个组件 Running |
| Queue 创建 | `kubectl get queues` | default + 4 business queues |
| PriorityClass | `kubectl get priorityclass` | 4 个优先级 |
| Gang 调度 | 提交 4-GPU Job，GPU<4 时 | 全部 Pending |
| Gang 调度 | GPU>=4 时 | 全部 Running |
| 队列权重 | 混合提交高/低优 Job | 高优优先调度 |
