# 第四章：Capsule 多租户隔离

> Capsule 为每个 IDC 边缘集群提供租户级资源隔离：独立命名空间、ResourceQuota、NetworkPolicy、LimitRange。

---

## 4.1 安装 Capsule Controller

在**每个 IDC 边缘集群**上安装：

### 4.1.1 使用 Helm 安装

```bash
helm repo add capsule https://clastix.github.io/charts
helm repo update

kubectl --kubeconfig=$IDC_KUBECONFIG create namespace capsule-system

helm install capsule capsule/capsule \
  --namespace capsule-system \
  --kubeconfig=$IDC_KUBECONFIG \
  --set manager.resources.requests.cpu=100m \
  --set manager.resources.requests.memory=128Mi \
  --set manager.resources.limits.cpu=500m \
  --set manager.resources.limits.memory=512Mi \
  --set proxy.resources.requests.cpu=50m \
  --set proxy.resources.requests.memory=64Mi \
  --wait --timeout 180s
```

### 4.1.2 使用 kubectl 安装（替代方案）

```bash
# 应用 Capsule 官方 manifest
CAPSULE_VERSION="0.9.0"
kubectl --kubeconfig=$IDC_KUBECONFIG apply -f \
  https://github.com/clastix/capsule/releases/download/v${CAPSULE_VERSION}/capsule.yml
```

### 4.1.3 验证安装

```bash
# 检查 Capsule 组件
kubectl --kubeconfig=$IDC_KUBECONFIG get pods -n capsule-system
# 预期: capsule-controller-manager, capsule-proxy Running

# 检查 Capsule CRD
kubectl --kubeconfig=$IDC_KUBECONFIG get crd | grep capsule
# 预期: tenants.capsule.clastix.io, tenantreferences.capsule.clastix.io
```

---

## 4.2 配置 Capsule 全局选项

### 4.2.1 CapsuleConfiguration

```yaml
# capsule-config.yaml
apiVersion: capsule.clastix.io/v1beta1
kind: CapsuleConfiguration
metadata:
  name: default
  namespace: capsule-system
spec:
  userGroups:
    - capsule.clastix.io
  enableLeaderElection: true
  # 全局 NetworkPolicy 默认行为
  forceTenantOnBoarding: false
  # 全局 Capsule 配置
  allowedUserGroups:
    - capsule.clastix.io
```

```bash
kubectl --kubeconfig=$IDC_KUBECONFIG apply -f capsule-config.yaml
```

---

## 4.3 创建平台级 Tenant

### 4.3.1 定义 ClusterRole（租户管理员权限）

```yaml
# capsule-roles.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: capsule-tenant-admin
rules:
  - apiGroups: [""]
    resources: ["pods", "services", "configmaps", "persistentvolumeclaims"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  - apiGroups: ["apps"]
    resources: ["deployments", "statefulsets", "daemonsets"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  - apiGroups: ["batch"]
    resources: ["jobs", "cronjobs"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  - apiGroups: ["networking.k8s.io"]
    resources: ["ingresses"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: capsule-tenant-viewer
rules:
  - apiGroups: [""]
    resources: ["pods", "services", "configmaps"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["apps"]
    resources: ["deployments", "statefulsets"]
    verbs: ["get", "list", "watch"]
```

```bash
kubectl --kubeconfig=$IDC_KUBECONFIG apply -f capsule-roles.yaml
```

### 4.3.2 创建租户 Tenant CRD

```yaml
# tenant-alice.yaml
apiVersion: capsule.clastix.io/v1beta2
kind: Tenant
metadata:
  name: tenant-alice
  annotations:
    platform.org-id: "org_abc123"
    platform.org-slug: "alice"
    platform.org-type: "tenant"
    platform.billing-mode: "prepaid"
  labels:
    platform.managed-by: "GPURun"
spec:
  owner:
    kind: User
    name: tenant-alice-admin
  namespaceOptions:
    quota: 5
  networkPolicies:
    enabled: true
    deniedPorts:
      - 22  # 禁止跨租户 SSH
  resourceQuotas:
    scope: PerNamespace
  limitRanges:
    enabled: true
  additionalRoleBindings:
    - kind: ClusterRole
      name: capsule-tenant-admin
      subjects:
        - kind: Group
          name: tenant-alice-admins
    - kind: ClusterRole
      name: capsule-tenant-viewer
      subjects:
        - kind: Group
          name: tenant-alice-viewers
  images:
    allowed: "*"
  storageClasses:
    allowed:
      - local-ssd
      - network-storage
```

```bash
kubectl --kubeconfig=$IDC_KUBECONFIG apply -f tenant-alice.yaml

# 验证：Capsule 自动创建 namespace + ResourceQuota + NetworkPolicy
kubectl --kubeconfig=$IDC_KUBECONFIG get namespaces | grep tenant-alice
kubectl --kubeconfig=$IDC_KUBECONFIG get resourcequotas -n tenant-alice
kubectl --kubeconfig=$IDC_KUBECONFIG get networkpolicies -n tenant-alice
```

---

## 4.4 Capsule Sync Service（中心集群）

Capsule Sync Service 运行在中心集群，监听数据库事件，将租户变更同步到所有 IDC 的 Capsule。

### 4.4.1 部署方式

Capsule Sync Service 是平台应用的一部分，随 GPURun Platform 一起部署（见 `08-GPURun-platform.md`）。

### 4.4.2 工作流程

```
1. 租户首次提交任务 → API Server 检查 organization.capsuleNamespaceReady
2. false → 调用 Capsule Sync Service ensureTenantNamespace(orgId, slug)
3. Sync Service 通过 Karmada 向每个 IDC 的 K8s API 发送 Capsule Tenant CRD
4. 每个 IDC 的 Capsule Controller 自动创建 namespace + quota + networkpolicy
5. Sync Service 回写 organization: capsuleNamespaceReady=true, capsuleSyncStatus=synced
6. API Server 继续调度流程
```

### 4.4.3 Karmada 同步配置

```yaml
# 将 Capsule Tenant 资源传播到所有 IDC
apiVersion: policy.karmada.io/v1alpha1
kind: PropagationPolicy
metadata:
  name: propagate-capsule-tenants
  namespace: default
spec:
  resourceSelectors:
    - apiVersion: capsule.clastix.io/v1beta2
      kind: Tenant
  placement:
    clusterAffinity:
      clusterSelectors:
        matchLabels:
          platform.type: idc-edge
```

---

## 4.5 ResourceQuota 模板

### 4.5.1 租户配额定义

```yaml
# tenant-quota-template.yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: tenant-quota
  namespace: tenant-{slug}
  labels:
    platform.managed-by: "GPURun"
spec:
  hard:
    # GPU 配额
    requests.nvidia.com/gpu: "4"
    limits.nvidia.com/gpu: "4"
    # CPU 配额
    requests.cpu: "32"
    limits.cpu: "64"
    # 内存配额
    requests.memory: "128Gi"
    limits.memory: "256Gi"
    # 存储配额
    requests.storage: "500Gi"
    # Pod 数量
    pods: "20"
    # 持久卷
    persistentvolumeclaims: "10"
```

### 4.5.2 配额动态更新

平台通过 Capsule Sync Service 根据以下条件动态更新 ResourceQuota：

| 条件 | 更新内容 |
|------|---------|
| 租户升级 (standard → vip) | GPU quota 增加 |
| 余额不足 | quota 暂停 (annotation) |
| 余额恢复 | quota 恢复 |

---

## 4.6 NetworkPolicy 模板

```yaml
# tenant-networkpolicy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: tenant-isolation
  namespace: tenant-{slug}
  labels:
    platform.managed-by: "GPURun"
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
  ingress:
    # 允许同租户 Pod 互通
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: tenant-{slug}
    # 允许平台监控组件访问
    - from:
        - namespaceSelector:
            matchLabels:
              platform.service: monitoring
      ports:
        - port: 9090
          protocol: TCP
        - port: 3100
          protocol: TCP
    # 允许 Traefik 推理网关
    - from:
        - namespaceSelector:
            matchLabels:
              platform.service: traefik
      ports:
        - port: 8080
          protocol: TCP
  egress:
    # 允许同租户 Pod 互通
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: tenant-{slug}
    # 允许 DNS 解析
    - to:
        - namespaceSelector: {}
      ports:
        - port: 53
          protocol: UDP
        - port: 53
          protocol: TCP
    # 允许外网访问（镜像拉取、S3 等）
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
      ports:
        - port: 443
          protocol: TCP
        - port: 80
          protocol: TCP
```

---

## 4.7 LimitRange 模板

```yaml
# tenant-limitrange.yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: tenant-limits
  namespace: tenant-{slug}
spec:
  limits:
    - type: Container
      default:
        cpu: "2"
        memory: 4Gi
      defaultRequest:
        cpu: 500m
        memory: 1Gi
      max:
        cpu: "16"
        memory: 64Gi
      min:
        cpu: 100m
        memory: 128Mi
    - type: Pod
      max:
        cpu: "32"
        memory: 128Gi
```

---

## 4.8 租户挂起与删除

### 4.8.1 挂起

```bash
# 方法 1: 通过 annotation 挂起
kubectl --kubeconfig=$IDC_KUBECONFIG annotate tenant tenant-alice \
  platform.suspended=true --overwrite

# 挂起效果：NetworkPolicy 拒绝所有 egress → 租户 Pod 无法运行新任务
# 已运行 Pod 继续（直到余额耗尽或手动停止）
```

### 4.8.2 删除

```bash
# 方法 1: 删除 Tenant CRD → Capsule 按 Finalizer 流程清理
kubectl --kubeconfig=$IDC_KUBECONFIG delete tenant tenant-alice

# 清理流程:
# 1. 等待所有 Pod 终止
# 2. 删除 namespace
# 3. 删除 Tenant CRD
```

---

## 4.9 验证检查清单

| 检查项 | 命令 | 预期结果 |
|--------|------|---------|
| Capsule 运行 | `kubectl get pods -n capsule-system` | Running |
| Tenant 创建 | `kubectl get tenants` | 显示 tenant-alice |
| Namespace 自动创建 | `kubectl get ns \| grep tenant-alice` | 存在 |
| ResourceQuota 生效 | `kubectl get rq -n tenant-alice` | 4 GPU / 32 CPU |
| NetworkPolicy 生效 | `kubectl get np -n tenant-alice` | tenant-isolation 存在 |
| 跨租户隔离 | 在 tenant-alice 创建 Pod → 从 tenant-bob 访问 | 不通 |
| 同租户互通 | 在 tenant-alice 创建 2 个 Pod → 互访 | 通 |
| 监控可达 | Prometheus → tenant-alice Pod metrics | 可抓取 |
