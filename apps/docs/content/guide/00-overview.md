# GPURun Cloud GPU 算力平台 — 完整集群部署手册

> 版本: 2.0 | 状态: 操作指南
> 本手册以平台运维视角，指导从零搭建一个完整的 GPU 算力平台集群，涵盖中心控制面、IDC 边缘集群、**裸金属设备纳管**、调度引擎、多租户隔离、监控告警全部组件。

---

## 一、架构总览

```
┌──────────────────────────────────────────────────────────────┐
│                     中心 Kubernetes 集群                       │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ GPURun     │  │ SkyPilot     │  │ Karmada Control   │   │
│  │ Platform      │  │ Control      │  │ Plane             │   │
│  │ (Next.js API) │  │ (Scheduler)  │  │ (MultiCluster)    │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Prometheus    │  │ Grafana      │  │ PostgreSQL        │   │
│  │ + AlertManager│  │ + Loki      │  │ + Redis           │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Capsule Sync  │  │ Traefik      │  │ SSH Gateway       │   │
│  │ Service       │  │ (推理网关)    │  │ (裸金属访问控制)   │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              OpenMeter (billing)                      │   │
│  │  API Server │ Sink Worker │ Billing Worker │ Kafka    │   │
│  │  ClickHouse │ PostgreSQL  │ Balance Worker            │   │
│  └─────────────────────────────────────────────────────┘   │
└──────────────────────────┬───────────────────────────────────┘
                           │ Karmada MultiCluster
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  IDC-A 边缘   │ │  IDC-B 边缘   │ │  IDC-C 边缘   │
│  K8s 50+ 节点 │ │  K3s 10-20   │ │  K8s 3-5 节点 │
│              │ │  节点         │ │              │
│ Capsule      │ │ Capsule      │ │ Capsule      │
│ Volcano      │ │ Volcano      │ │ Volcano      │
│ GPU Operator │ │ GPU Operator │ │ GPU Operator │
│ DCGM Exporter│ │ DCGM Exporter│ │ DCGM Exporter│
│ Edge Agent   │ │ Edge Agent   │ │ Edge Agent   │
│              │ │              │ │              │
│ ┌──────────┐ │ │ ┌──────────┐ │ │ ┌──────────┐ │
│ │ 裸金属设备 │ │ │ │ 裸金属设备 │ │ │ │ 裸金属设备 │ │
│ │ (Btrfs)  │ │ │ │ (Btrfs)  │ │ │ │ (Btrfs)  │ │
│ │ IPMI/BMC │ │ │ │ IPMI/BMC │ │ │ │ IPMI/BMC │ │
│ └──────────┘ │ │ └──────────┘ │ │ └──────────┘ │
└──────────────┘ └──────────────┘ └──────────────┘
```

**平台支持两种 GPU 产品线：**

| 产品线 | 形态 | 调度方式 | 用户访问 |
|--------|------|---------|---------|
| **K8s 容器云** | Pod 调度到 GPU 节点 | SkyPilot + Volcano + Kueue | Web Console / API |
| **裸金属短租** | 物理整机租用 | Agent 直连 + Btrfs 快照 | SSH 直连（经网关） |

---

## 二、组件清单与版本要求

| 组件 | 版本 | 用途 | 部署位置 |
|------|------|------|---------|
| **Kubernetes** | ≥ 1.28 | 容器编排 | 中心 + 所有 IDC |
| **Karmada** | ≥ 1.10 | 多集群联邦 | 中心集群（控制面）+ 每个 IDC（agent） |
| **Capsule** | ≥ 0.9 (clastix) | 多租户隔离 | 每个 IDC 边缘集群 |
| **Volcano** | ≥ 1.9 | Gang Scheduling | 每个 IDC 边缘集群 |
| **SkyPilot** | ≥ 0.7 | 多集群 GPU 调度 | 中心集群 |
| **Kueue** | ≥ 0.10 | 作业排队与配额 | 中心集群 |
| **NVIDIA GPU Operator** | ≥ 24.9 | GPU 设备管理 | 每个 IDC 边缘集群 |
| **DCGM Exporter** | ≥ 3.3 | GPU 指标采集 | 每个 IDC 边缘集群 |
| **Prometheus** | ≥ 2.53 | 指标采集存储 | 中心集群 |
| **Grafana** | ≥ 11.x | 可视化 | 中心集群 |
| **Loki** | ≥ 3.x | 日志聚合 | 中心集群 |
| **Tempo** | ≥ 2.x | 分布式追踪 | 中心集群 |
| **PostgreSQL** | ≥ 16 | 业务数据库 | 中心集群 |
| **Redis** | ≥ 7.x | 缓存 | 中心集群 |
| **Traefik** | ≥ 3.x | 推理网关 | 中心/边缘集群 |
| **Docker/containerd** | 最新稳定版 | 容器运行时 | 所有节点 |
| **Go Edge Agent** | 平台自研 | 设备纳管 Agent | 每个 IDC |
| **SSH Gateway** | 平台自研 | 裸金属 SSH 访问控制 | 中心集群 |
| **OpenMeter** | ≥ 1.0 | 用量计量 + 订阅管理 + 账单生成 | 中心集群（billing 命名空间） |
| **Kafka** | ≥ 3.x | OpenMeter 事件总线 | 中心集群（billing 命名空间） |
| **ClickHouse** | ≥ 24.x | 用量数据存储与聚合 | 中心集群（billing 命名空间） |
| **ipmitool** | ≥ 1.8.19 | IPMI/BMC 远程管理（可选） | 每个 IDC 跳板机 |
| **Btrfs** | ≥ 5.10 (内核) | 裸金属快照还原 | 裸金属设备系统盘 |

---

## 三、硬件资源需求

### 3.1 中心集群（控制面）

| 节点角色 | 数量 | CPU | 内存 | 磁盘 | 用途 |
|---------|------|-----|------|------|------|
| Master | 3 | 8C+ | 32GB+ | 200GB SSD | K8s 控制面高可用 |
| Worker (业务) | 3-5 | 16C+ | 64GB+ | 500GB SSD | 平台应用、数据库 |
| Worker (监控) | 2 | 8C+ | 32GB+ | 1TB SSD | Prometheus/Grafana/Loki |

### 3.2 IDC 边缘集群

| 集群规模 | Master | GPU Worker | 说明 |
|---------|--------|-----------|------|
| 小型 (3-5 节点) | 1 (可与 Worker 复用) | 2-4 | 测试/边缘机房 |
| 中型 (10-20 节点) | 3 | 7-17 | 区域机房 |
| 大型 (50+ 节点) | 3-5 | 45+ | 核心机房 |

**GPU Worker 节点最低配置**：
- CPU: 32C+
- 内存: 128GB+
- GPU: NVIDIA A100/H100/V100 等
- 系统盘: 200GB SSD（**Btrfs 文件系统**，用于快照还原）
- 数据盘: 500GB+ SSD (本地存储)
- 网络: 10Gbps+ (NVLink/InfiniBand 可选)
- BMC/IPMI: **可选**，用于远程管理和逾期停机兜底（见 §3.3）

### 3.3 裸金属设备（短租产品线）

裸金属设备独立于 K8s 集群，作为物理整机租用给用户。

| 配置项 | 最低要求 | 说明 |
|--------|---------|------|
| CPU | 32C+ (x86_64) | 支持 VT-x, VT-d, IOMMU |
| 内存 | 128GB+ | ECC 推荐 |
| GPU | NVIDIA A100/H100/V100 等 | 驱动由 Agent 预装 |
| 系统盘 | 1TB NVMe | **必须 Btrfs 格式**，用于快照还原 |
| 数据盘 | 4TB NVMe | 独立挂载，用户训练数据 |
| 网络 | 10Gbps+ | 管理网 + 业务网分离 |
| BMC/IPMI | **可选** | 有 BMC 时支持自动硬关机；无 BMC 时由 IDC 运维人工收回 |
| BIOS | 启用 IOMMU, SR-IOV, Above 4G Decoding | GPU 直通必须 |
| 内核 | ≥ 5.10 | Btrfs subvolume 支持 |

> **IPMI/BMC 可选说明**：不是所有 IDC 都提供 IPMI/BMC 接口。平台支持两种逾期停机模式：
> - **自动模式**（有 BMC）：Agent device_stop → IPMI 硬关机 → 自动还原
> - **人工模式**（无 BMC）：Agent device_stop → SSH 网关 revoke → 通知 IDC 运维物理收回 → 人工还原
>
> 人工模式下，租户逾期未归还设备，IDC 运维强行收回设备，租户需**等额赔付**设备损坏风险。

**Btrfs 磁盘布局**：

```
/dev/nvme0n1 (系统盘 1TB NVMe)
└─ btrfs 单设备卷（mount -o compress=zstd,discard）
    ├─ @base          ← Ubuntu + NVIDIA 驱动 + CUDA runtime
    ├─ @snap_pytorch  ← template subvolume（部署时秒级克隆）
    ├─ @snap_miniconda
    ├─ @snap_cudadev
    ├─ @inst-{id}     ← 用户实例（租用时创建，退租时删除）
    └─ @cache         ← 本地安装包缓存

/dev/nvme1n1 (数据盘 4TB NVMe)
└─ 独立挂载 /data     ← 用户训练数据 + checkpoints
```

### 3.4 网络要求

| 链路 | 带宽 | 说明 |
|------|------|------|
| 中心 ↔ IDC | ≥ 100Mbps | 控制面通信、调度指令 |
| IDC 内部 | ≥ 10Gbps | Pod 间通信、存储访问 |
| 裸金属管理网 | ≥ 1Gbps | Agent 通信（IPMI/BMC 如有则需此网段） |
| 出公网 | 按需 | 镜像拉取、S3 存储 |

---

## 四、部署顺序

```
Phase 1: 中心集群基础
  ├── 1.1 Kubernetes 安装 (Kubeadm/K3s)
  ├── 1.2 PostgreSQL & Redis
  └── 1.3 基础网络 (CNI)

Phase 2: OpenMeter 计量计费                          ← 新增
  ├── 2.1 Kafka 部署（事件总线）
  ├── 2.2 ClickHouse 部署（用量存储）
  ├── 2.3 PostgreSQL（OpenMeter 专用）
  ├── 2.4 OpenMeter Helm 部署
  ├── 2.5 Meter 定义（5 个计量维度）
  └── 2.6 监控与告警配置

Phase 3: IDC 边缘集群基础
  ├── 3.1 Kubernetes 安装 (Kubeadm/K3s)
  ├── 3.2 NVIDIA GPU Operator
  └── 3.3 基础验证 (nvidia-smi, GPU allocatable)

Phase 4: 裸金属设备纳管
  ├── 4.1 设备 BIOS/UEFI 配置 (IOMMU, SR-IOV)
  ├── 4.2 Btrfs 系统盘格式化 + 模板快照创建
  ├── 4.3 IPMI/BMC 配置与验证（可选）
  ├── 4.4 Edge Agent 部署（含裸金属生命周期）
  ├── 4.5 设备入库与角色分配 (compute/bare_metal/convertible)
  └── 4.6 资源池配置 (dedicated_pool / elastic_pool)

Phase 5: 多集群联邦
  ├── 5.1 Karmada 控制面 (中心)
  ├── 5.2 Karmada Agent (每个 IDC)
  └── 5.3 集群注册与验证

Phase 6: 调度引擎
  ├── 6.1 Volcano (每个 IDC)
  ├── 6.2 Kueue (中心)
  ├── 6.3 SkyPilot Control (中心)
  └── 6.4 Capsule (每个 IDC)

Phase 7: 裸金属控制面
  ├── 7.1 SSH Gateway 部署（中心集群）
  ├── 7.2 裸金属订单与计费 CronJob
  ├── 7.3 自动续费定时任务
  └── 7.4 逾期处理定时任务

Phase 8: 监控体系
  ├── 8.1 Prometheus + Node Exporter
  ├── 8.2 DCGM Exporter (每个 IDC)
  ├── 8.3 kube-state-metrics
  ├── 8.4 Grafana + Dashboards
  ├── 8.5 Loki + Promtail
  ├── 8.6 AlertManager
  └── 8.7 IPMI Exporter (裸金属硬件监控，可选)

Phase 9: 平台应用
  ├── 9.1 GPURun Platform (Next.js)
  ├── 9.2 Traefik 推理网关
  ├── 9.3 Go Edge Agent (每个 IDC)
  └── 9.4 数据库迁移与初始化

Phase 10: 验证与调优
  ├── 10.1 端到端任务提交测试
  ├── 10.2 多租户隔离验证
  ├── 10.3 跨 IDC 调度验证
  ├── 10.4 裸金属设备纳管验证
  ├── 10.5 裸金属订单全流程验证
  ├── 10.6 OpenMeter 用量计量验证
  └── 10.7 监控告警验证
```

---

## 五、前置条件

### 5.1 工具准备

在运维跳板机上安装以下工具：

```bash
# 容器运行时
curl -fsSL https://get.docker.com | sh

# Kubernetes CLI
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl && mv kubectl /usr/local/bin/

# Helm 3
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Karmada CLI (karmadactl)
KARMADA_VERSION="v1.12.0"
wget https://github.com/karmada-io/karmada/releases/download/${KARMADA_VERSION}/karmadactl-${KARMADA_VERSION}-linux-amd64.tgz
tar xzf karmadactl-${KARMADA_VERSION}-linux-amd64.tgz
mv karmadactl /usr/local/bin/

# Kustomize
curl -s "https://raw.githubusercontent.com/kubernetes-sigs/kustomize/master/hack/install_kustomize.sh" | bash
mv kustomize /usr/local/bin/

# ── 裸金属管理工具 ──
# ipmitool (IPMI/BMC 远程管理)
apt-get install -y ipmitool

# btrfs-progs (Btrfs 文件系统管理)
apt-get install -y btrfs-progs

# smartmontools (磁盘健康监控)
apt-get install -y smartmontools
```

### 5.2 环境变量模板

在所有运维操作前，设置以下环境变量（按实际环境修改）：

```bash
# ── 中心集群 ──
export CENTRAL_KUBECONFIG=~/.kube/central-config
export CENTRAL_API_SERVER=https://central-api.platform.com:6443
export CENTRAL_POD_CIDR=10.244.0.0/16
export CENTRAL_SVC_CIDR=10.96.0.0/16

# ── IDC 边缘集群 (每个 IDC 不同) ──
export IDC_NAME="idc-a"
export IDC_API_SERVER=https://idc-a-api.internal:6443
export IDC_POD_CIDR=10.245.0.0/16
export IDC_SVC_CIDR=10.97.0.0/16

# ── Karmada ──
export KARMADA_VERSION="v1.12.0"
export KARMADA_NAMESPACE="karmada-system"

# ── Volcano ──
export VOLCANO_VERSION="v1.9.0"

# ── Capsule ──
export CAPSULE_VERSION="0.9.0"

# ── GPU Operator ──
export GPU_OPERATOR_VERSION="v24.9.0"

# ── SkyPilot ──
export SKYPILOT_VERSION="0.7.0"

# ── 平台应用 ──
export GPURun_IMAGE="registry.platform.com/GPURun"
export DB_HOST="postgres-central.platform.com"
export DB_PORT=5432
export DB_NAME="GPURun"
export REDIS_HOST="redis-central.platform.com"

# ── 裸金属配置 ──
export AGENT_API_TOKEN="<AGENT_API_TOKEN>"        # Agent 注册 token
export SSH_GW_IMAGE="registry.platform.com/ssh-gw" # SSH 网关镜像
export BMC_USER="admin"                             # IPMI/BMC 用户名
export BMC_PASSWORD="<BMC_PASSWORD>"                # IPMI/BMC 密码

# ── OpenMeter 计量计费 ──
export OPENMETER_API_URL="http://openmeter-api.billing.svc"  # OpenMeter API 地址
export OPENMETER_API_TOKEN="<OPENMETER_API_TOKEN>"           # OpenMeter API Token
export KAFKA_BROKERS="kafka-0.kafka.billing.svc:9092,kafka-1.kafka.billing.svc:9092,kafka-2.kafka.billing.svc:9092"
export CLICKHOUSE_URL="clickhouse://clickhouse-shard-0.billing.svc:8123/openmeter"
```

### 5.3 节点初始化通用脚本

每个 K8s 节点（中心 + IDC）执行以下初始化：

```bash
#!/bin/bash
# node-init.sh — 在所有 K8s 节点上执行
set -euo pipefail

# 1. 禁用 swap
swapoff -a
sed -i '/ swap / s/^/#/' /etc/fstab

# 2. 加载内核模块
cat <<EOF | tee /etc/modules-load.d/k8s.conf
overlay
br_netfilter
EOF
modprobe overlay
modprobe br_netfilter

# 3. 设置 sysctl
cat <<EOF | tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF
sysctl --system

# 4. 安装 containerd
apt-get update && apt-get install -y containerd
mkdir -p /etc/containerd
containerd config default | tee /etc/containerd/config.toml
# 启用 SystemdCgroup
sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml
systemctl restart containerd

# 5. GPU 节点额外操作（仅 GPU Worker）
if lspci | grep -i nvidia > /dev/null; then
  echo "GPU detected — ensure NVIDIA driver >= 535 is installed"
  echo "Run: apt-get install -y nvidia-driver-535 nvidia-utils-535"
fi
```

---

## 六、关键配置参数参考

### 6.1 Karmada 集群注册信息

```yaml
# 每个 IDC 集群的注册配置
cluster_name: idc-a-beijing
api_server: https://idc-a-api.internal:6443
secret_token: <karmada-agent-token>
secret_ca: <base64-encoded-ca-cert>
# 调度约束
taints: []  # 可为特定集群添加 taint 做调度排除
labels:
  platform.idc: "idc-a"
  platform.region: "beijing"
```

### 6.2 Capsule 租户模板

```yaml
apiVersion: capsule.clastix.io/v1beta2
kind: Tenant
metadata:
  name: tenant-{slug}
spec:
  owner:
    kind: User
    name: tenant-{slug}-admin
  networkPolicies:
    enabled: true
  resourceQuotas:
    scope: PerNamespace
  limitRanges:
    enabled: true
```

### 6.3 Volcano 队列模板

```yaml
apiVersion: scheduling.volcano.sh/v1beta1
kind: Queue
metadata:
  name: default-queue
spec:
  weight: 1
  reclaimable: true
  deserved: 0
  guaranteed:
    min:
      cpu: 0
      memory: 0
  revocableZone: ""
```

---

## 七、目录结构

本手册各章节文件说明：

| 文件 | 内容 |
|------|------|
| `00-overview.md` | 本文件：架构总览、组件清单、资源需求、部署顺序 |
| `01-central-cluster.md` | 中心 Kubernetes 集群安装与配置 |
| `02-idc-edge-cluster.md` | IDC 边缘集群安装与 GPU 节点配置 |
| `03-karmada-multicluster.md` | Karmada 多集群联邦搭建 |
| `04-capsule-multitenancy.md` | Capsule 多租户隔离安装与配置 |
| `05-volcano-scheduling.md` | Volcano Gang Scheduling 安装与配置 |
| `06-skypilot-control.md` | SkyPilot 调度控制面安装 |
| `07-monitoring-stack.md` | Prometheus/Grafana/Loki/DCGM 监控全栈 |
| `08-GPURun-platform.md` | GPURun 平台应用部署 |
| `09-edge-agent.md` | Go Edge Agent 部署与设备纳管 |
| `10-verification.md` | 部署后验证与调优 |
| `11-bare-metal-infra.md` | 裸金属基础设施：Btrfs、SSH 网关、IPMI（可选）、设备生命周期 |
| **`12-openmeter.md`** | **OpenMeter 计量计费：Helm 部署、Meter 定义、监控、运维** |

---

## 八、快速参考命令

```bash
# 验证中心集群
kubectl --kubeconfig=$CENTRAL_KUBECONFIG get nodes
kubectl --kubeconfig=$CENTRAL_KUBECONFIG get pods -A

# 验证 Karmada
karmadactl --kubeconfig=$CENTRAL_KUBECONFIG get clusters

# 验证 IDC 集群 GPU
kubectl --kubeconfig=$IDC_KUBECONFIG get nodes -l nvidia.com/gpu.present=true
kubectl --kubeconfig=$IDC_KUBECONFIG get pods -n gpu-operator

# 验证 Volcano
kubectl --kubeconfig=$IDC_KUBECONFIG get queues -n volcano-system

# 验证 Capsule
kubectl --kubeconfig=$IDC_KUBECONFIG get tenants -n capsule-system

# 验证 SkyPilot
sky status
```
