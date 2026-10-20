# 第二章：IDC 边缘集群安装

> 每个 IDC 机房独立部署一个 K8s/K3s 集群，作为 GPU 工作负载的实际运行环境。边缘集群需要安装 GPU Operator、Volcano、Capsule 等组件。**同时管理裸金属设备**，作为短租产品线的物理基础设施。

---

## 2.1 安装 Kubernetes

### 2.1.1 大中型集群（10+ 节点）：Kubeadm

与中心集群相同的 Kubeadm 安装流程，但使用 IDC 专用参数：

```bash
# 在 IDC Master 节点上
cat <<EOF | tee kubeadm-config-idc.yaml
apiVersion: kubeadm.k8s.io/v1beta3
kind: ClusterConfiguration
kubernetesVersion: v1.30.0
controlPlaneEndpoint: "${IDC_API_SERVER}"
networking:
  podSubnet: "10.245.0.0/16"
  serviceSubnet: "10.97.0.0/16"
  dnsDomain: "cluster.local"
---
apiVersion: kubeadm.k8s.io/v1beta3
kind: InitConfiguration
nodeRegistration:
  criSocket: "unix:///var/run/containerd/containerd.sock"
EOF

kubeadm init --config=kubeadm-config-idc.yaml
```

### 2.1.2 小型集群（3-5 节点）：K3s

```bash
# 在 IDC Master 节点上
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server \
  --disable traefik \
  --disable servicelb \
  --write-kubeconfig-mode 644 \
  --tls-san=${IDC_NAME}-api.internal" sh -

# 复制 kubeconfig 到运维机
scp root@${IDC_MASTER_IP}:/etc/rancher/k3s/k3s.yaml ~/.kube/${IDC_NAME}-config
sed -i "s/127.0.0.1/${IDC_MASTER_IP}/g" ~/.kube/${IDC_NAME}-config
```

### 2.1.3 安装 CNI

```bash
# Calico (推荐)
kubectl --kubeconfig=$IDC_KUBECONFIG apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.27.0/manifests/calico.yaml

# 验证
kubectl --kubeconfig=$IDC_KUBECONFIG get pods -n kube-system -l k8s-app=calico-node
```

---

## 2.2 GPU 节点准备

### 2.2.1 安装 NVIDIA 驱动

```bash
# 在每个 GPU 节点上执行
# 方法 1: 使用包管理器 (Ubuntu)
apt-get update
apt-get install -y nvidia-driver-535 nvidia-utils-535

# 方法 2: 使用 NVIDIA 官方脚本
# wget https://us.download.nvidia.com/tesla/535.183.01/NVIDIA-Linux-x86_64-535.183.01.run
# bash NVIDIA-Linux-x86_64-535.183.01.run

# 验证驱动安装
nvidia-smi
# 预期输出: 显示 GPU 型号、驱动版本、CUDA 版本
```

### 2.2.2 安装 NVIDIA Container Toolkit

```bash
# 配置 NVIDIA Container Toolkit 仓库
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

apt-get update
apt-get install -y nvidia-container-toolkit

# 配置 containerd 使用 NVIDIA runtime
nvidia-ctk runtime configure --runtime=containerd
systemctl restart containerd

# 验证
containerd --help  # 确认安装
```

### 2.2.3 配置 GPU 节点标签

```bash
# 在节点加入集群后，为 GPU 节点添加标签
kubectl --kubeconfig=$IDC_KUBECONFIG label node <gpu-node-name> \
  nvidia.com/gpu.present=true \
  nvidia.com/gpu.product=<GPU_MODEL> \
  GPURun.cloud/role=compute \
  GPURun.cloud/managed-by=edge-agent
```

---

## 2.3 裸金属设备硬件准备

> 裸金属设备不加入 K8s 集群，而是作为物理整机租用给用户。需要单独的硬件准备流程。

### 2.3.1 BIOS/UEFI 配置

在每台裸金属设备上，进入 BIOS/UEFI 设置以下关键选项：

| 设置项 | 推荐值 | 说明 |
|--------|--------|------|
| **Intel VT-d / AMD-Vi** | Enabled | IOMMU 必须启用，GPU 直通基础 |
| **Above 4G Decoding** | Enabled | 允许 GPU 映射 >4GB MMIO 地址空间 |
| **Resizable BAR** | Enabled (Auto) | GPU 显存直接映射，提升性能 |
| **SR-IOV** | Enabled | 如需 GPU 虚拟化（VF） |
| **ACS (Access Control Services)** | Enabled | IOMMU 分组隔离 |
| **CSM (Compatibility Support Module)** | Disabled | 使用纯 UEFI 引导 |
| **PCIe Speed** | Gen4/Gen5 (Auto) | 确保最大 PCIe 带宽 |
| **NUMA** | Enabled | 多路服务器必须，影响 GPU 亲和性 |
| **Power Management** | Maximum Performance | 避免 GPU 降频 |

```bash
# 验证 IOMMU 已启用（在 Linux 中）
dmesg | grep -i iommu
# 预期: AMD-Vi: Interrupt remapping enabled / Intel-IOMMU: enabled

# 验证 PCIe GPU 拓扑
nvidia-smi topo -m
# 预期: GPU 0-7 之间显示 NV# 或 SYS 直连关系
```

### 2.3.2 Btrfs 系统盘格式化

裸金属设备的系统盘必须使用 Btrfs 文件系统，用于租户隔离和快速还原。

```bash
# 在每台裸金属设备上执行
# 前提: Ubuntu 24.04 已安装，系统盘为 /dev/nvme0n1

# 1. 备份现有数据（如需要）
# mount /dev/nvme0n1 /mnt/old && tar czf /tmp/system-backup.tar.gz -C /mnt/old .

# 2. 卸载系统盘
umount /dev/nvme0n1 2>/dev/null || true

# 3. 创建 Btrfs 文件系统
mkfs.btrfs -f -L system /dev/nvme0n1

# 4. 挂载
mount /dev/nvme0n1 /mnt/system

# 5. 创建 @base subvolume
btrfs subvolume create /mnt/system/@base

# 6. 安装基础系统到 @base
# (从 Live USB 或网络安装 Ubuntu 24.04 到 @base)
# 完成后 chroot 进入 @base 安装驱动和模板

# 7. 在 @base 中安装
# - NVIDIA 驱动 (nvidia-driver-535)
# - CUDA runtime
# - Python / conda
# - 常用工具 (git, vim, htop, etc.)

# 8. 创建模板快照
btrfs subvolume snapshot /mnt/system/@base /mnt/system/@snap_pytorch
btrfs subvolume snapshot /mnt/system/@base /mnt/system/@snap_miniconda
btrfs subvolume snapshot /mnt/system/@base /mnt/system/@snap_cudadev

# 9. 配置 fstab
# /dev/nvme0n1 /mnt/system btrfs defaults,compress=zstd,discard 0 0

# 10. 预热本地缓存
# /opt/metal-setup/metal-prime-cache.sh

echo "Btrfs setup complete. Subvolumes:"
btrfs subvolume list /mnt/system
```

### 2.3.3 IPMI/BMC 配置（可选）

> 不是所有 IDC 都提供 IPMI/BMC 接口。有 BMC 的设备支持自动硬关机；无 BMC 的设备由 IDC 运维人工收回（见 `11-bare-metal-infra.md` §11.4.3）。

```bash
# 如果 IDC 提供 BMC 接口，执行以下配置:

# 1. 进入 BMC 管理界面（通常通过独立管理网口）
# 浏览器访问 https://<bmc-ip>，配置网络和管理员密码

# 2. 启用 IPMI over LAN
# BIOS → BMC Configuration → Network Protocol → Enable IPMI

# 3. 配置独立管理网口 IP
# 建议使用独立 VLAN，与业务网分离

# 4. 测试 IPMI 连通性（从跳板机）
ipmitool -H <bmc-ip> -U admin -P <password> power status
# 预期: Power is on

# 5. 记录 BMC 信息到平台数据库
# supplier_device_bmc 表: device_id, bmc_ip, bmc_user, bmc_password, bmc_type

# 6. 设置 BMC 用户密码策略
# - 禁用默认账户 (ADMIN/ADMIN)
# - 创建平台专用账户
# - 密码 ≥ 16 字符
```

### 2.3.4 数据盘准备

```bash
# 数据盘独立挂载，不使用 Btrfs（与系统盘分离）
# /dev/nvme1n1 为数据盘

# 方法 1: ext4 (简单)
mkfs.ext4 -L data /dev/nvme1n1
mkdir -p /data
mount /dev/nvme1n1 /data
echo '/dev/nvme1n1 /data ext4 defaults,noatime 0 2' >> /etc/fstab

# 方法 2: Btrfs (支持快照，但数据盘通常不需要)
# mkfs.btrfs -f -L data /dev/nvme1n1

# 配置用户目录链接
# ln -s /data/checkpoints ~/checkpoints  (引导用户写 checkpoint 到数据盘)
```

---

## 2.4 安装 NVIDIA GPU Operator

GPU Operator 统一管理 GPU 设备插件、驱动、MIG 等组件。

### 2.3.1 添加 Helm 仓库

```bash
helm repo add nvidia https://nvidia.github.io/k8s-operator
helm repo update
```

### 2.3.2 创建 Namespace

```bash
kubectl --kubeconfig=$IDC_KUBECONFIG create namespace gpu-operator
```

### 2.3.3 安装 GPU Operator

```bash
helm install gpu-operator nvidia/gpu-operator \
  --namespace gpu-operator \
  --kubeconfig=$IDC_KUBECONFIG \
  --set driver.enabled=false \
  --set toolkit.enabled=true \
  --set toolkit.version=1.16.1 \
  --set devicePlugin.enabled=true \
  --set migManager.enabled=false \
  --set gfd.enabled=true \
  --set operator.defaultRuntime=containerd \
  --wait --timeout 300s
```

**参数说明**：

| 参数 | 值 | 说明 |
|------|-----|------|
| `driver.enabled` | false | 已手动安装驱动，禁用 Operator 管理驱动 |
| `toolkit.enabled` | true | 使用 Operator 管理 Container Toolkit |
| `devicePlugin.enabled` | true | 部署 NVIDIA Device Plugin |
| `migManager.enabled` | false | MIG 按需启用（A100/H100） |
| `gfd.enabled` | true | GPU Feature Discovery，自动打标签 |

### 2.3.4 验证

```bash
# 检查 GPU Operator 组件
kubectl --kubeconfig=$IDC_KUBECONFIG get pods -n gpu-operator

# 检查 GPU 节点是否被标记
kubectl --kubeconfig=$IDC_KUBECONFIG get nodes -o wide | grep nvidia.com/gpu

# 检查 GPU allocatable
kubectl --kubeconfig=$IDC_KUBECONFIG get node <gpu-node> -o jsonpath='{.status.allocatable.nvidia\.com/gpu}'
# 预期输出: 8 (每节点 GPU 数量)

# 运行 GPU 测试 Pod
cat <<EOF | kubectl --kubeconfig=$IDC_KUBECONFIG apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: gpu-test
spec:
  containers:
  - name: gpu-test
    image: nvidia/cuda:12.4.0-base-ubuntu22.04
    command: ["nvidia-smi"]
    resources:
      limits:
        nvidia.com/gpu: 1
  restartPolicy: Never
EOF

kubectl --kubeconfig=$IDC_KUBECONFIG logs gpu-test
# 预期输出: nvidia-smi 表格显示 GPU 信息

kubectl --kubeconfig=$IDC_KUBECONFIG delete pod gpu-test
```

---

## 2.5 安装 Node Exporter（主机监控）

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts

helm install node-exporter prometheus-community/prometheus-node-exporter \
  --namespace monitoring \
  --kubeconfig=$IDC_KUBECONFIG \
  --set tolerations[0].key=node-role.kubernetes.io/master \
  --set tolerations[0].operator=Exists \
  --set tolerations[0].effect=NoSchedule
```

---

## 2.6 配置集群间网络

### 2.5.1 中心 ↔ IDC VPN（WireGuard 方案）

```bash
# 在中心集群的跳板机上
apt-get install -y wireguard

# 生成密钥
wg genkey | tee /etc/wireguard/central.key | wg pubkey

# 在 IDC 跳板机上
wg genkey | tee /etc/wireguard/idc.key | wg pubkey
```

**中心侧 WireGuard 配置** (`/etc/wireguard/wg0.conf`)：

```ini
[Interface]
PrivateKey = <central-private-key>
Address = 10.100.0.1/24
ListenPort = 51820

[Peer]
PublicKey = <idc-public-key>
Endpoint = <idc-public-ip>:51820
AllowedIPs = 10.100.1.0/24, 10.245.0.0/16
PersistentKeepalive = 25
```

**IDC 侧 WireGuard 配置**：

```ini
[Interface]
PrivateKey = <idc-private-key>
Address = 10.100.1.1/24
ListenPort = 51820

[Peer]
PublicKey = <central-public-key>
Endpoint = <central-public-ip>:51820
AllowedIPs = 10.100.0.0/24, 10.96.0.0/16
PersistentKeepalive = 25
```

```bash
# 启动
wg-quick up wg0
systemctl enable wg-quick@wg0

# 验证连通性
ping 10.100.0.1  # 从 IDC → 中心
```

---

## 2.7 创建 GPU 节点池（可选）

对于 GKE/EKS 等云 K8s，使用节点池；裸金属环境下通过 taint/toleration 管理：

```bash
# 为 GPU 节点添加专用 taint
kubectl --kubeconfig=$IDC_KUBECONFIG taint node <gpu-node> \
  GPURun.cloud/gpu=true:NoSchedule

# Volcano / SkyPilot 调度时通过 toleration 容忍此 taint
```

---

## 2.8 验证检查清单

| 检查项 | 命令 | 预期结果 |
|--------|------|---------|
| 所有节点 Ready | `kubectl get nodes` | 全部 `Ready` |
| GPU 可分配 | `kubectl get node <gpu> -o jsonpath='{.status.allocatable.nvidia\.com/gpu}'` | > 0 |
| GPU Operator 运行 | `kubectl get pods -n gpu-operator` | 全部 Running |
| nvidia-smi 正常 | `kubectl run gpu-test --image=nvidia/cuda:12.4.0-base -- nvidia-smi` | 显示 GPU |
| Node Exporter | `kubectl get pods -n monitoring` | Running |
| 到中心网络 | `ping 10.100.0.1` | 通 |
| **裸金属 IOMMU** | `dmesg \| grep iommu` | 已启用 |
| **裸金属 Btrfs** | `btrfs subvolume list /mnt/system` | 显示 @base + 模板快照 |
| **裸金属 IPMI** | `ipmitool -H <bmc-ip> -U admin -P <pass> power status` | Power is on |
| **裸金属 GPU 拓扑** | `nvidia-smi topo -m` | 显示 NV# 或 SYS 直连 |
