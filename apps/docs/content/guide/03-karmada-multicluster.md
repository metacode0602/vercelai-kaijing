# 第三章：Karmada 多集群联邦

> Karmada 实现中心集群对多个 IDC 边缘集群的统一管理：集群注册、资源同步、跨集群调度。

---

## 3.1 安装 Karmada 控制面（中心集群）

### 3.1.1 使用 karmadactl 安装

```bash
# 在中心集群 Master 上执行
karmadactl init --kubeconfig=$CENTRAL_KUBECONFIG \
  --karmada-data=/etc/karmada \
  --karmada-pki=/etc/karmada/pki \
  --etcd-servers=https://127.0.0.1:2379

# 验证
kubectl --kubeconfig=$CENTRAL_KUBECONFIG get pods -n karmada-system
# 预期: karmada-apiserver, karmada-controller-manager, karmada-scheduler, etcd 全部 Running
```

### 3.1.2 使用 Helm 安装（替代方案）

```bash
helm repo add karmada https://karmada-io.github.io/helm-charts
helm repo update

helm install karmada karmada/karmada \
  --namespace karmada-system \
  --create-namespace \
  --kubeconfig=$CENTRAL_KUBECONFIG \
  --set installMode=primary
```

### 3.1.3 获取 Karmada kubeconfig

```bash
# 获取 karmada 控制面 kubeconfig
kubectl --kubeconfig=$CENTRAL_KUBECONFIG -n karmada-system \
  get secret karmada-kubeconfig \
  -o jsonpath='{.data.kubeconfig}' | base64 -d > ~/.kube/karmada.config

# 设置别名
alias karmada="kubectl --kubeconfig=$HOME/.kube/karmada.config"

# 验证
karmada get clusters
karmada get nodes
```

---

## 3.2 注册 IDC 边缘集群

### 3.2.1 为每个 IDC 生成 join 命令

```bash
# 在中心集群上，为 IDC-A 生成 join 命令
karmadactl join idc-a-beijing \
  --cluster-kubeconfig=$IDC_A_KUBECONFIG \
  --kubeconfig=$CENTRAL_KUBECONFIG

# 记录输出的 token 和命令
```

### 3.2.2 在 IDC 集群上执行 join

```bash
# 在 IDC-A 的 Master 节点上执行
karmadactl join idc-a-beijing \
  --cluster-kubeconfig=$IDC_A_KUBECONFIG \
  --kubeconfig=$CENTRAL_KUBECONFIG \
  --token=<token> \
  --discovery-token-ca-cert-hash=<hash>
```

### 3.2.3 或使用 karmadactl 方式注册

```bash
# 方式二：使用 karmadactl join (推荐)
karmadactl join idc-a-beijing \
  --kubeconfig=$CENTRAL_KUBECONFIG \
  --cluster-kubeconfig=$IDC_A_KUBECONFIG
```

### 3.2.4 添加集群标签

```bash
# 为每个集群添加标签（用于调度决策）
karmada label cluster idc-a-beijing \
  platform.idc=idc-a \
  platform.region=beijing \
  platform.gpu-capability=high

karmada label cluster idc-b-shanghai \
  platform.idc=idc-b \
  platform.region=shanghai \
  platform.gpu-capability=medium
```

### 3.2.5 设置集群容忍度（可选）

```bash
# 为特定集群设置调度约束
karmada taint cluster idc-a-beijing \
  platform/dedicated=gpu:NoSchedule
```

---

## 3.3 集群状态验证

```bash
# 查看所有注册的集群
karmada get clusters
# 预期:
# NAME               STATUS   MODE   AGE
# idc-a-beijing      Ready    Push   5m
# idc-b-shanghai     Ready    Push   3m

# 查看集群详情
karmada describe cluster idc-a-beijing

# 查看各集群的节点
karmada get nodes --clusters=idc-a-beijing
karmada get nodes --clusters=idc-b-shanghai

# 验证集群健康状态
karmada get clusters -o jsonpath='{range .items[*]}{.metadata.name}: {.status.conditions[?(@.type=="Ready")].status}{"\n"}{end}'
```

---

## 3.4 配置资源模型

### 3.4.1 PropagationPolicy（资源传播策略）

```yaml
# propagate-to-all-idc.yaml
# 将 ConfigMap 传播到所有 IDC 集群
apiVersion: policy.karmada.io/v1alpha1
kind: PropagationPolicy
metadata:
  name: propagate-configmaps
  namespace: default
spec:
  resourceSelectors:
    - apiVersion: v1
      kind: ConfigMap
  placement:
    clusterAffinity:
      clusterNames:
        - idc-a-beijing
        - idc-b-shanghai
        - idc-c-guangzhou
```

### 3.4.2 调度约束配置

```yaml
# cluster-scheduling.yaml
apiVersion: policy.karmada.io/v1alpha1
kind: ClusterPropagationPolicy
metadata:
  name: gpu-workload-scheduling
spec:
  placement:
    clusterAffinity:
      clusterSelectors:
        matchLabels:
          platform.gpu-capability: "high"
    spread:
      spreadByField: cluster
      maxGroups: 3
```

---

## 3.5 Karmada 与 SkyPilot 协同

Karmada 负责集群级资源管理和 Pod 分发，SkyPilot 负责 GPU 资源的智能调度决策：

```
用户提交任务
  → SkyPilot 评估最优 IDC（基于 GPU 可用性、价格、延迟）
  → Karmada 将 Pod 分发到目标 IDC 集群
  → IDC 集群的 Capsule/Volcano 执行本地调度
```

---

## 3.6 多集群服务发现

### 3.6.1 安装 Submariner（可选，跨集群服务发现）

```bash
# 安装 Submariner Broker（中心集群）
subctl deploy-broker --kubeconfig=$CENTRAL_KUBECONFIG

# 为每个 IDC 集群安装 Submariner Agent
subctl join broker-info.subm --kubeconfig=$IDC_KUBECONFIG --clusterid=$IDC_NAME
```

### 3.6.2 简单服务发现方案（推荐）

通过中心集群的 Service 代理模式，IDC 集群通过 VPN 访问中心服务：

```yaml
# 在中心集群创建 ExternalName Service
apiVersion: v1
kind: Service
metadata:
  name: postgres-external
  namespace: database
spec:
  type: ExternalName
  externalName: central-db.database.svc.cluster.local
```

---

## 3.7 故障处理

### 3.7.1 集群脱管恢复

```bash
# 检查集群状态
karmada get clusters

# 如果集群不健康，检查 Agent
kubectl --kubeconfig=$IDC_KUBECONFIG get pods -n karmada-system

# 重新注册集群
karmadactl unjoin idc-a-beijing --kubeconfig=$CENTRAL_KUBECONFIG
karmadactl join idc-a-beijing \
  --kubeconfig=$CENTRAL_KUBECONFIG \
  --cluster-kubeconfig=$IDC_A_KUBECONFIG
```

### 3.7.2 集群驱逐与恢复

```bash
# 驱逐集群（维护模式）
karmada taint cluster idc-a-beijing platform/maintenance=true:NoSchedule

# 恢复集群
karmada untaint cluster idc-a-beijing platform/maintenance
```

---

## 3.8 验证检查清单

| 检查项 | 命令 | 预期结果 |
|--------|------|---------|
| 所有集群 Ready | `karmada get clusters` | 全部 `Ready` |
| 节点同步 | `karmada get nodes` | 显示所有 IDC 节点 |
| 资源传播 | 创建测试 CP，检查 IDC 集群 | Pod 在 IDC 出现 |
| 集群标签 | `karmada get clusters --show-labels` | 标签正确 |
| 跨集群调度 | `karmada run test --image=nginx --dry-run=server` | 调度决策正确 |
