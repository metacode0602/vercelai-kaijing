# 第六章：SkyPilot 调度控制面

> SkyPilot 是平台的核心调度引擎，提供多集群 GPU 资源发现、智能调度决策、REST API 驱动的任务生命周期管理。

---

## 6.1 安装 SkyPilot

### 6.1.1 在中心集群安装 SkyPilot Control

```bash
# 创建 Python 虚拟环境
python3 -m venv ~/skypilot-env
source ~/skypilot-env/bin/activate

# 安装 SkyPilot
pip install "skypilot[all]>=0.7.0"

# 验证
sky status
# 预期: 显示本地集群信息
```

### 6.1.2 配置 SkyPilot 与 K8s 集成

```bash
# 设置 kubeconfig（指向中心集群）
export KUBECONFIG=$CENTRAL_KUBECONFIG

# SkyPilot 自动发现 K8s 集群
sky check kubernetes
# 预期: Kubernetes: enabled
```

### 6.1.3 部署 SkyPilot REST API Server

SkyPilot 提供 REST API 供平台 API Server 调用：

```bash
# 启动 SkyPilot REST API Server
# 需要使用 sky serve 或自定义 FastAPI 包装
pip install "skypilot[all]>=0.7.0"

# 创建 SkyPilot API Server 配置
cat <<'EOF' > ~/skypilot-api-server.py
from fastapi import FastAPI
from sky.server import server
import uvicorn

app = FastAPI(title="SkyPilot API Server")

# 注册 SkyPilot 路由
app.include_router(server.router, prefix="/sky")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8888)
EOF
```

### 6.1.4 使用 Helm 部署（推荐）

```yaml
# skypilot-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: skypilot-api
  namespace: GPURun-system
spec:
  replicas: 2
  selector:
    matchLabels:
      app: skypilot-api
  template:
    metadata:
      labels:
        app: skypilot-api
    spec:
      serviceAccountName: skypilot-sa
      containers:
        - name: skypilot-api
          image: skypilot/skypilot:0.7.0
          command: ["python", "-m", "sky.server.server"]
          ports:
            - containerPort: 8888
          env:
            - name: SKYPILOT_CONFIG
              value: "/root/.sky/config.yaml"
          volumeMounts:
            - name: sky-config
              mountPath: /root/.sky
            - name: kubeconfig
              mountPath: /root/.kube
          resources:
            requests:
              cpu: "1"
              memory: 2Gi
            limits:
              cpu: "4"
              memory: 8Gi
      volumes:
        - name: sky-config
          configMap:
            name: skypilot-config
        - name: kubeconfig
          secret:
            secretName: karmada-kubeconfig
---
apiVersion: v1
kind: Service
metadata:
  name: skypilot-api
  namespace: GPURun-system
spec:
  selector:
    app: skypilot-api
  ports:
    - port: 8888
      targetPort: 8888
  type: ClusterIP
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: skypilot-config
  namespace: GPURun-system
data:
  config.yaml: |
    kubernetes:
      # 使用 Karmada kubeconfig 管理所有 IDC 集群
      kubeconfig: /root/.kube/config
    # 云凭证（如有使用云 GPU）
    # aws:
    #   access_key_id: xxx
    #   secret_access_key: xxx
```

```bash
kubectl --kubeconfig=$CENTRAL_KUBECONFIG apply -f skypilot-deployment.yaml
```

---

## 6.2 配置 SkyPilot 多集群上下文

### 6.2.1 SkyPilot 集群上下文映射

SkyPilot 通过 kubeconfig context 识别不同 IDC 集群：

```bash
# 生成包含所有 IDC 集群的 kubeconfig
cp $CENTRAL_KUBECONFIG ~/.kube/all-clusters.config

# 添加 IDC-A context
kubectl config set-context idc-a-beijing \
  --cluster=idc-a-beijing \
  --user=idc-a-beijing-admin \
  --namespace=default \
  --kubeconfig=~/.kube/all-clusters.config

# 添加 IDC-B context
kubectl config set-context idc-b-shanghai \
  --cluster=idc-b-shanghai \
  --user=idc-b-shanghai-admin \
  --namespace=default \
  --kubeconfig=~/.kube/all-clusters.config
```

### 6.2.2 SkyPilot 配置文件

```yaml
# ~/.sky/config.yaml
kubernetes:
  # 使用 Karmada 管理的多集群 kubeconfig
  kubeconfig: /root/.kube/all-clusters.config
  # 每个 IDC 集群作为独立 context
  contexts:
    - name: idc-a-beijing
      labels:
        platform.idc: idc-a
        platform.region: beijing
    - name: idc-b-shanghai
      labels:
        platform.idc: idc-b
        platform.region: shanghai
    - name: idc-c-guangzhou
      labels:
        platform.idc: idc-c
        platform.region: guangzhou
```

---

## 6.3 SkyPilot 任务提交接口

### 6.3.1 REST API 端点

平台 API Server 通过以下端点与 SkyPilot 交互：

| 方法 | 端点 | 用途 |
|------|------|------|
| `POST` | `/sky/api/job` | 提交任务 |
| `GET` | `/sky/api/job/{job_id}` | 查询任务状态 |
| `POST` | `/sky/api/job/{job_id}/cancel` | 取消任务 |
| `POST` | `/sky/api/serve` | 创建推理服务 |
| `GET` | `/sky/api/serve/{serve_id}` | 查询推理服务 |
| `DELETE` | `/sky/api/serve/{serve_id}` | 删除推理服务 |
| `GET` | `/sky/api/clusters` | 集群列表 |
| `GET` | `/sky/api/status` | SkyPilot 状态 |

### 6.3.2 任务提交示例

```json
{
  "name": "train-alice-001",
  "resources": {
    "gpu": "A100:2",
    "cpu": 16,
    "memory_gb": 64,
    "disk_size_gb": 100
  },
  "image": "pytorch:2.3-cuda12.1",
  "entrypoint": "bash -c 'python train.py --epochs 100'",
  "metadata": {
    "platform.org-id": "org_abc123",
    "platform.org-slug": "alice",
    "platform.task-id": "task_xyz789",
    "platform.billing-mode": "prepaid",
    "platform.idc": "idc-a"
  },
  "scheduling": {
    "namespace": "tenant-alice",
    "nodeSelector": {
      "nvidia.com/gpu.product": "NVIDIA-A100-SXM4-80GB"
    },
    "tolerations": [
      {
        "key": "GPURun.cloud/gpu",
        "operator": "Equal",
        "value": "true",
        "effect": "NoSchedule"
      }
    ]
  },
  "retry": 0,
  "timeout": 86400
}
```

---

## 6.4 SkyPilot 调度策略配置

### 6.4.1 GPU 资源匹配

SkyPilot 自动发现所有 IDC 集群的 GPU 资源，根据以下因素评分：

| 评分因素 | 权重 | 说明 |
|---------|------|------|
| GPU 匹配度 | 40% | GPU 型号和数量匹配 |
| 资源利用率 | 30% | 越低越优先 |
| 区域亲和性 | 20% | 优先用户指定区域 |
| 成本因素 | 10% | 优先低成本 IDC |

### 6.4.2 节点亲和性调度

```python
# SkyPilot YAML 任务定义
resources:
  accelerators: A100:2
  cloud: kubernetes
  region: idc-a-beijing  # 指定 IDC

run: |
  python train.py
```

---

## 6.5 SkyPilot 与 Kueue 协同

### 6.5.1 安装 Kueue（中心集群）

```bash
kubectl --kubeconfig=$CENTRAL_KUBECONFIG apply -f \
  https://github.com/kubernetes-sigs/kueue/releases/download/v0.10.0/manifests.yaml
```

### 6.5.2 配置 MultiKueue（跨集群队列）

```yaml
# multicluster-queue.yaml
apiVersion: kueue.x-k8s.io/v1beta1
kind: ClusterQueue
metadata:
  name: global-gpu-queue
spec:
  cohort: default
  resourceGroups:
    - covered: ["nvidia.com/gpu"]
      resources:
        - name: "nvidia.com/gpu"
          nominalQuota: 64  # 总 GPU 配额
    - covered: ["cpu"]
      resources:
        - name: "cpu"
          nominalQuota: 512
    - covered: ["memory"]
      resources:
        - name: "memory"
          nominalQuota: "2048Gi"
---
apiVersion: kueue.x-k8s.io/v1beta1
kind: LocalQueue
metadata:
  name: default-queue
  namespace: GPURun-system
spec:
  clusterQueue: global-gpu-queue
```

```bash
kubectl --kubeconfig=$CENTRAL_KUBECONFIG apply -f multicluster-queue.yaml
```

---

## 6.6 验证检查清单

| 检查项 | 命令 | 预期结果 |
|--------|------|---------|
| SkyPilot 安装 | `sky check kubernetes` | Kubernetes: enabled |
| API Server 运行 | `kubectl get pods -n GPURun-system` | skypilot-api Running |
| 集群发现 | `sky status` | 显示所有 IDC 集群 |
| 任务提交 | `sky launch --cloud kubernetes --gpus A100:1 "nvidia-smi"` | 任务 Running |
| 任务取消 | `sky cancel <job-id>` | 任务 Cancelled |
| 推理服务 | `sky serve up --gpus A100:1 ...` | Serve Running |
| Kueue 就绪 | `kubectl get clusterqueues` | global-gpu-queue 存在 |
