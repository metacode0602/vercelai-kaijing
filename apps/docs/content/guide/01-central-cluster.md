# 第一章：中心 Kubernetes 集群安装

> 中心集群是整个平台的控制面，承载 Karmada 控制面、SkyPilot、平台应用、数据库、监控等核心组件。

---

## 1.1 使用 Kubeadm 安装（推荐生产环境）

### 1.1.1 环境准备

在所有 3 台 Master 节点上执行：

```bash
# 安装 kubeadm, kubelet, kubectl
KUBE_VERSION="1.30"
curl -fsSL https://pkgs.k8s.io/core:/stable:/v${KUBE_VERSION}/deb/Release.key | gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
echo "deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v${KUBE_VERSION}/deb/ /" | tee /etc/apt/sources.list.d/kubernetes.list
apt-get update && apt-get install -y kubelet kubeadm kubectl
apt-mark hold kubelet kubeadm kubectl
```

### 1.1.2 初始化第一个 Master

```bash
# kubeadm-config.yaml
cat <<EOF | tee kubeadm-config.yaml
apiVersion: kubeadm.k8s.io/v1beta3
kind: ClusterConfiguration
kubernetesVersion: v${KUBE_VERSION}.0
controlPlaneEndpoint: "central-api.platform.com:6443"  # HA LB 地址
networking:
  podSubnet: "10.244.0.0/16"
  serviceSubnet: "10.96.0.0/16"
  dnsDomain: "cluster.local"
apiServer:
  extraArgs:
    enable-admission-plugins: "NamespaceLifecycle,LimitRanger,ServiceAccount,DefaultStorageClass,DefaultTolerationSeconds,MutatingAdmissionWebhook,ValidatingAdmissionWebhook,ResourceQuota"
---
apiVersion: kubeadm.k8s.io/v1beta3
kind: InitConfiguration
nodeRegistration:
  criSocket: "unix:///var/run/containerd/containerd.sock"
EOF

kubeadm init --config=kubeadm-config.yaml --upload-certs | tee kubeadm-init.log
```

### 1.1.3 配置 kubectl

```bash
mkdir -p $HOME/.kube
cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
chown $(id -u):$(id -g) $HOME/.kube/config
# 另存为中心集群 kubeconfig
cp $HOME/.kube/config $CENTRAL_KUBECONFIG
```

### 1.1.4 安装 CNI（Calico）

```bash
kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.27.0/manifests/calico.yaml

# 验证
kubectl get pods -n kube-system -l k8s-app=calico-node
```

### 1.1.5 添加其他 Master 节点

在第一个 Master 上获取 join 命令：

```bash
kubeadm token create --print-join-command
```

在第 2、3 台 Master 上执行（加 `--control-plane`）：

```bash
kubeadm join central-api.platform.com:6443 \
  --token <token> \
  --discovery-token-ca-cert-hash sha256:<hash> \
  --control-plane \
  --certificate-key <cert-key>
```

### 1.1.6 添加 Worker 节点

```bash
kubeadm join central-api.platform.com:6443 \
  --token <token> \
  --discovery-token-ca-cert-hash sha256:<hash>
```

### 1.1.7 验证集群

```bash
kubectl get nodes
# 预期：3 Master + N Worker 全部 Ready

kubectl get pods -A
# 预期：所有系统 Pod Running
```

---

## 1.2 使用 K3s 安装（轻量方案）

适用于小规模部署或测试环境：

```bash
# 安装 K3s Server (HA 模式使用 external DB)
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server \
  --disable traefik \
  --disable servicelb \
  --write-kubeconfig-mode 644 \
  --tls-san=central-api.platform.com" sh -

# 复制 kubeconfig
cp /etc/rancher/k3s/k3s.yaml $CENTRAL_KUBECONFIG
sed -i "s/127.0.0.1/central-api.platform.com/g" $CENTRAL_KUBECONFIG
```

> **注意**：K3s 默认禁用 Traefik（我们将使用独立部署的 Traefik）和 ServiceLB（使用 MetalLB 或云 LB）。

---

## 1.3 安装 MetalLB（仅裸金属环境，条件安装）

> **适用场景**：仅在裸金属物理机部署且需要 `LoadBalancer` 类型 Service（如 Traefik 推理网关对外暴露）时安装。
> 云环境（EKS/GKE/ACK）使用云厂商原生 LB；K3s 自带 ServiceLB，无需 MetalLB。
> 如果所有 Service 均使用 `ClusterIP` + Ingress，可跳过此步骤。

```bash
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.14.5/config/manifests/metallb-native.yaml

# 配置 IP 地址池（替换为实际网段）
cat <<EOF | kubectl apply -f -
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: default-pool
  namespace: metallb-system
spec:
  addresses:
  - 10.0.1.200-10.0.1.250   # 替换为实际可用 IP 段
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: default
  namespace: metallb-system
EOF
```

---

## 1.4 安装 PostgreSQL

### 1.4.1 使用 CloudNativePG Operator（推荐）

```bash
kubectl apply -f https://raw.githubusercontent.com/cloudnative-pg/cloudnative-pg/release-1.24/releases/cnpg-1.24.0.yaml

# 等待 Operator 就绪
kubectl wait --for=condition=available deployment/cnpg-cloudnative-pg \
  -n cnpg-system --timeout=120s
```

### 1.4.2 创建 PostgreSQL 集群

```yaml
# postgres-cluster.yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: GPURun-db
  namespace: database
spec:
  instances: 3
  primaryUpdateStrategy: unsupervised
  postgresql:
    parameters:
      max_connections: "200"
      shared_buffers: "4GB"
      effective_cache_size: "12GB"
      work_mem: "16MB"
    pg_hba:
    - host all all 10.0.0.0/8 md5
  bootstrap:
    initdb:
      database: GPURun
      owner: GPURun
      secret:
        name: GPURun-db-credentials
  storage:
    size: 100Gi
    storageClass: local-ssd
  resources:
    requests:
      cpu: "2"
      memory: 8Gi
    limits:
      cpu: "4"
      memory: 16Gi
  backup:
    barmanObjectStore:
      destinationPath: "s3://GPURun-backup/pg/"
      s3Credentials:
        accessKeyId:
          name: s3-credentials
          key: ACCESS_KEY_ID
        secretAccessKey:
          name: s3-credentials
          key: ACCESS_SECRET_KEY
    retentionPolicy: "30d"
---
apiVersion: v1
kind: Secret
metadata:
  name: GPURun-db-credentials
  namespace: database
type: Opaque
stringData:
  username: GPURun
  password: "<REPLACE_WITH_SECURE_PASSWORD>"  # 替换
```

```bash
kubectl create namespace database
kubectl apply -f postgres-cluster.yaml

# 验证
kubectl get pods -n database
kubectl get svc -n database
# 连接信息：GPURun-db-rw.database.svc:5432
```

---

## 1.5 安装 Redis

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

helm install redis bitnami/redis \
  --namespace cache \
  --create-namespace \
  --set architecture=replication \
  --set replica.replicaCount=3 \
  --set auth.enabled=true \
  --set auth.password="<REPLACE_WITH_SECURE_PASSWORD>" \
  --set master.persistence.size=20Gi \
  --set replica.persistence.size=20Gi \
  --set resources.requests.cpu=500m \
  --set resources.requests.memory=1Gi

# 验证
kubectl get pods -n cache
# 连接信息：redis-master.cache.svc:6379
```

---

## 1.6 安装 cert-manager（可选，用于 TLS）

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.14.0/cert-manager.yaml

# 验证
kubectl get pods -n cert-manager
```

---

## 1.7 安装 nginx-ingress（可选，用于 Web UI）

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --set controller.service.type=LoadBalancer
```

---

## 1.8 创建平台命名空间

```bash
kubectl create namespace GPURun-system
kubectl create namespace monitoring
kubectl create namespace karmada-system
kubectl create namespace gpu-system
```

---

## 1.9 验证检查清单

| 检查项 | 命令 | 预期结果 |
|--------|------|---------|
| 所有节点 Ready | `kubectl get nodes` | 全部 `Ready` |
| 系统 Pod 正常 | `kubectl get pods -A` | 所有 Pod `Running` |
| PostgreSQL 就绪 | `kubectl get pods -n database` | 3/3 Running |
| Redis 就绪 | `kubectl get pods -n cache` | 3/3 Running |
| Calico 正常 | `kubectl get pods -n kube-system` | Calico pods Running |
| MetalLB 正常（若安装） | `kubectl get pods -n metallb-system` | All Running |
| API Server 可达 | `kubectl cluster-info` | 显示 URL |
| DNS 正常 | `kubectl run test --image=busybox --rm -it --nslookup kubernetes.default` | 解析成功 |
