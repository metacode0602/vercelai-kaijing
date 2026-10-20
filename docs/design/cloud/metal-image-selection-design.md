# 裸金属预装环境模板 — 实现方案

## 1. 背景

裸金属是物理机，出厂已预装：
- **Ubuntu 24.04 LTS**
- **NVIDIA 驱动**（匹配设备 GPU 型号）
- **CUDA runtime**

因此不存在"选择 OS 镜像"的概念。用户在部署页选择的是**预装环境模板**——下单后平台自动在物理机上执行安装脚本，预装指定的软件栈。

---

## 2. 核心概念

| 概念 | 说明 |
|------|------|
| **预装环境模板** | 一组预定义的软件安装脚本，下单后自动在物理机上执行 |
| **出厂环境** | 物理机的基础系统：Ubuntu 24.04 + NVIDIA 驱动 + CUDA runtime，所有模板共享 |
| **纯净模式** | 不执行额外安装，仅使用出厂环境 |

**与容器云镜像的关键区别：**

| 维度 | 容器云（Server） | 裸金属（Metal） |
|------|-----------------|----------------|
| 基础系统 | 用户选择 OS 镜像 | 固定 Ubuntu 24.04 |
| 可选内容 | OS + CUDA + 框架（整体镜像） | 软件栈安装脚本（在已有系统上追加） |
| 写入方式 | 覆盖系统盘 | 在现有系统上 pip install / apt install |
| 耗时 | 3-5 分钟（全盘写入） | 0-5 分钟（取决于加速方案） |
| 数据盘 | 随镜像一起初始化 | 不受影响 |

---

## 3. 当前已实现的模板

在 `metal-market-data.ts` 中定义了 4 套模板：

| 模板 ID | 名称 | 预装内容 | 安装耗时（无加速） | 安装耗时（本地缓存） | 安装耗时（Btrfs 快照） |
|---------|------|---------|-------------------|---------------------|---------------------|
| `pytorch` | PyTorch | PyTorch 2.11 + torchvision + torchaudio | 2-5 min | 1-2 min | <30 sec |
| `miniconda` | Miniconda | Miniconda3 + Python 3.12 | ~1 min | ~30 sec | <10 sec |
| `cuda-dev` | CUDA 开发 | CUDA devel + cuDNN + NCCL | 3-7 min | 2-3 min | <30 sec |
| `clean` | 纯净 Ubuntu | 无额外安装 | 0 | 0 | 0 |

默认选择：**纯净 Ubuntu**（`clean`）。

---

## 4. 安装耗时瓶颈分析

### 4.1 各模板包体积与安装构成

| 模板 | 包体积 | 下载占比 | 解压安装占比 | 瓶颈 |
|------|--------|---------|------------|------|
| PyTorch (cu128) | torch ~2.5GB + torchvision ~8MB + torchaudio ~8MB | **90%** | 10% | **网络下载** |
| Miniconda | Miniconda3 installer ~100MB | 50% | 50% | 均衡 |
| CUDA dev toolkit | cuda-toolkit ~2GB + cuDNN ~600MB + NCCL ~400MB | **80%** | 20% | **网络下载** |

### 4.2 不同网络环境下的耗时实测参考

| 网络环境 | PyTorch (2.5GB) | CUDA dev (3GB) | 备注 |
|---------|----------------|----------------|------|
| 内网 10Gbps | ~2 sec 下载 + 1.5 min 安装 | ~3 sec + 2 min | **最佳情况** |
| 内网 1Gbps | ~20 sec + 1.5 min | ~25 sec + 2 min | 常见机房 |
| 内网 100Mbps | ~3 min + 1.5 min | ~4 min + 2 min | **超时风险** |
| 公网（国内镜像） | ~30 sec + 1.5 min | ~40 sec + 2 min | 依赖镜像质量 |
| 公网（PyPI 官方） | ~5 min + 1.5 min | **超时** | **不可接受** |

**结论：在无加速条件下，100Mbps 带宽时 PyTorch 安装约 4.5 分钟，CUDA dev 超过 5 分钟，无法满足 SLA。**

---

## 5. 缩短到 5 分钟以内的加速方案

### 方案 A：本地缓存（推荐，实施最简单）

**原理：** 机器入库时预先下载所有模板的安装包到本地 NVMe，部署时从本地读取，下载耗时归零。

**适用场景：** 所有部署模式，无需特殊基础设施。

#### 机器入库时预缓存

```bash
#!/bin/bash
# metal-prime-cache.sh — 机器入库时执行一次
set -euo pipefail

CACHE_DIR="/opt/metal-cache"
mkdir -p "$CACHE_DIR"/{pip,conda,cuda}

# 预下载 PyTorch（约 2.5GB，需 ~30 sec@1Gbps）
pip download torch torchvision torchaudio \
  --index-url https://download.pytorch.org/whl/cu128 \
  -d "$CACHE_DIR/pip"

# 预下载 Miniconda（约 100MB）
wget -q -O "$CACHE_DIR/conda/Miniconda3-latest-Linux-x86_64.sh" \
  https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh

# 预下载 CUDA dev 包（约 3GB，需 ~30 sec@1Gbps）
apt-get download -o Dir::Cache="$CACHE_DIR/cuda" \
  cuda-toolkit-12-8 libcudnn9-dev-cuda-12 libnccl-dev

# 记录缓存版本，用于增量更新
echo "cached_at=$(date +%s)" > "$CACHE_DIR/manifest.json"
echo "pytorch_version=2.11.0" >> "$CACHE_DIR/manifest.json"
echo "cuda_version=12.8" >> "$CACHE_DIR/manifest.json"
```

#### 部署时从本地缓存安装

```bash
# pytorch.sh（本地缓存版）
#!/bin/bash
set -euo pipefail

CACHE_DIR="/opt/metal-cache"

pip install --no-cache-dir \
  --find-links "$CACHE_DIR/pip" \
  torch torchvision torchaudio

python -c "import torch; print(f'PyTorch {torch.__version__}, CUDA: {torch.cuda.is_available()}')"
```

```bash
# cuda-dev.sh（本地缓存版）
#!/bin/bash
set -euo pipefail

CACHE_DIR="/opt/metal-cache"

# 优先从本地 .deb 包安装
dpkg -i "$CACHE_DIR/cuda"/*.deb 2>/dev/null || \
  apt-get install -y cuda-toolkit-12-8 libcudnn9-dev-cuda-12 libnccl-dev
```

#### 耗时对比

```
┌─────────────────────────────────────────────────────────────┐
│                    安装耗时对比（分钟）                       │
│                                                             │
│  PyTorch (2.5GB):                                           │
│  ████████████████████████  无加速: ~4.5 min (100Mbps)       │
│  ████████████  本地缓存: ~1.5 min                           │
│  ████████  Btrfs 快照: ~0.5 min                              │
│                                                             │
│  CUDA dev (3GB):                                            │
│  ███████████████████████████████  无加速: ~6 min (100Mbps)  │
│  ██████████████  本地缓存: ~2.5 min                         │
│  ████████  Btrfs 快照: ~0.5 min                              │
│                                                             │
│  Miniconda (100MB):                                         │
│  ████████  无加速: ~1 min                                   │
│  ████  本地缓存: ~0.5 min                                   │
│  ██  Btrfs 快照: <0.2 min                                    │
└─────────────────────────────────────────────────────────────┘
```

---

### 方案 B：Btrfs 快照（最快，≤2 分钟）

**原理：** 机器入库时使用 Btrfs 文件系统格式化系统盘，配置 base 环境并创建每个模板的 subvolume 快照。部署时 `btrfs subvolume snapshot` 秒级克隆，配合 `zstd` 透明压缩节省存储空间。

**适用场景：** 所有新建机房默认采用，适合有运维能力的团队。

#### 机器入库流程（一次性，~15 分钟）

```
新机上架
  │
  ▼
安装 Ubuntu 24.04（系统盘使用 Btrfs 文件系统）
  │
  ├─ /dev/nvme0n1 → btrfs 单设备卷（1TB NVMe）
  │   ├─ @base       ← 系统 + NVIDIA 驱动 + CUDA runtime + 本地缓存
  │   ├─ @snap_pytorch   ← snapshot(@base) — PyTorch 模板
  │   ├─ @snap_miniconda ← snapshot(@base) — Miniconda 模板
  │   └─ @snap_cudadev   ← snapshot(@base) — CUDA dev 模板
  │
  └─ /dev/nvme1n1 → btrfs 独立卷（4TB NVMe）
      └─ /data         ← 数据盘，独立挂载
  │
  ▼
配置 base 环境：hostname、时区、apt、常用工具
  │
  ▼
预装 PyTorch、Miniconda、CUDA dev（安装到 @base subvolume）
  │
  ▼
创建 Btrfs 快照：
  btrfs subvolume snapshot /mnt/system/@base /mnt/system/@snap_pytorch
  btrfs subvolume snapshot /mnt/system/@base /mnt/system/@snap_miniconda
  btrfs subvolume snapshot /mnt/system/@base /mnt/system/@snap_cudadev
  │
  ▼
预热本地缓存（方案 A 复用）：
  /opt/metal-setup/metal-prime-cache.sh
  │
  ▼
标记机器为 "ready"，可接受订单
```

#### 部署流程（秒级）

```
用户下单
  │
  ▼
后端分配物理机
  │
  ▼
从对应模板快照创建用户实例 subvolume（~5-30 秒）：
  btrfs subvolume snapshot /mnt/system/@snap_{template} /mnt/system/@inst-{id}
  │
  ▼
挂载用户实例 + 配置 fstab（~10 秒）：
  mount -o subvol=@inst-{id},compress=zstd /dev/nvme0n1 /mnt/instance
  │
  ▼
配置 SSH 密钥 + 端口（~5 秒）
  │
  ▼
标记为 running（总计 <1 分钟）
```

#### 优势与限制

| 优势 | 限制 |
|------|------|
| 部署极快（<1 分钟） | 需要 Btrfs 文件系统（Ubuntu 24.04 默认支持） |
| 所有模板零网络依赖 | 每个模板占用一份快照空间（5-10GB） |
| 部署时间完全确定（可预测） | 单设备模式下无 RAID 保护（需硬件 RAID 或 mdraid） |
| 内置 checksumming，保护数据完整性 | Btrfs RAID5/6 不推荐生产使用 |
| zstd 透明压缩，节省 30-50% 存储 | — |
| 机器入库时需要完整安装所有模板 | — |

---

### 方案 C：预装机池 + 即时分配（混合方案）

**原理：** 维护一批"已就绪"机器，每台已安装好特定模板。用户下单直接分配，零等待。

**适用场景：** 机房规模较大（>50 台），有能力维护预装机池。

```
                    ┌─────────────────────────┐
                    │     预装机池管理器        │
                    │                         │
                    │  已就绪机器: 120 台       │
                    │  ├─ PyTorch:     50 台   │
                    │  ├─ Miniconda:   30 台   │
                    │  ├─ CUDA dev:    20 台   │
                    │  └─ 纯净 Ubuntu: 20 台   │
                    │                         │
                    │  自动补充规则:            │
                    │  每种模板保持 ≥10 台余量   │
                    └─────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
     用户下单 PyTorch    用户下单 CUDA dev   用户下单 Miniconda
            │                 │                 │
            ▼                 ▼                 ▼
     从池中分配一台        从池中分配一台      从池中分配一台
     （即时，<30 秒）     （即时，<30 秒）    （即时，<30 秒）
            │                 │                 │
            ▼                 ▼                 ▼
     后台异步补充一台      后台异步补充一台    后台异步补充一台
     PyTorch 机器         CUDA dev 机器      Miniconda 机器
```

#### 池管理策略

```typescript
interface Pre provisionedPool {
  templates: {
    pytorch: { ready: number, target: number, provisioning: number }
    miniconda: { ready: number, target: number, provisioning: number }
    cudaDev: { ready: number, target: number, provisioning: number }
    clean: { ready: number, target: number, provisioning: number }
  }
}

// 分配逻辑
function allocateFromPool(templateId: string): MetalDevice | null {
  const pool = getPoolStatus()
  const available = pool.templates[templateId]
  if (available.ready > 0) {
    // 直接分配，零等待
    return takeFromPool(templateId)
  }
  // 池空，走实时部署（方案 A 或 B）
  return null
}

// 后台补充逻辑
function replenishPool() {
  for (const [templateId, status] of Object.entries(pool.templates)) {
    const deficit = status.target - status.ready - status.provisioning
    if (deficit > 0) {
      // 异步在空闲机器上安装，完成后加入池
      provisionAndAddToPool(templateId, deficit)
    }
  }
}
```

---

### 三种方案对比

| 维度 | 方案 A：本地缓存 | 方案 B：Btrfs 快照 | 方案 C：预装机池 |
|------|----------------|----------------|----------------|
| **部署耗时** | 1-3 分钟 | <1 分钟 | <30 秒 |
| **实施复杂度** | 低 | 中 | 高 |
| **基础设施要求** | 无（仅 NVMe 存储） | Btrfs 文件系统（Ubuntu 24.04 默认支持） | 自动化部署系统 |
| **机器入库耗时** | ~5 分钟（下载缓存） | ~15 分钟（安装所有模板） | ~15 分钟（同 B） |
| **存储开销** | 额外 3-5GB/台（缓存） | 额外 10-30GB/台（快照） | 同 B |
| **模板更新** | 更新缓存即可 | 更新 @base 后重建快照 | 需重装池中机器 |
| **适用规模** | 任意 | 中小规模（<100 台） | 大规模（>50 台） |
| **SLA 保障** | 有（1-3 min） | 强（<1 min） | 最强（<30 sec） |
| **数据完整性** | 无保障 | **内置 checksumming** | 同 B |
| **存储效率** | — | **zstd 透明压缩（节省 30-50%）** | 同 B |

---

### 推荐实施路径

```
阶段 1（立即实施）  →  方案 A：本地缓存
                        - 无需额外基础设施
                        - 部署耗时 1-3 分钟，满足 5 分钟 SLA
                        - 1 天内可完成实施

阶段 2（规模化时）  →  方案 B：Btrfs 快照
                        - 部署耗时 <1 分钟
                        - 适合机房 <100 台时使用
                        - Btrfs 为 Ubuntu 24.04 默认文件系统，无需额外分区
                        - 内置 checksumming 保护训练数据完整性

阶段 3（大规模时）  →  方案 C：预装机池 + 方案 B 混合
                        - 池内机器使用 Btrfs 快照即时分配
                        - 池空时走方案 A 实时部署
                        - 适合机房 >50 台，需自动化运维平台
```

---

## 6. 后端实现方案

### 6.1 安装脚本管理

每套模板对应一个安装脚本，存放在平台的脚本仓库中：

```
scripts/metal-setup/
├── base.sh              # 公共初始化（hostname、时区、swap 等）
├── pytorch.sh           # PyTorch 环境安装（含本地缓存逻辑）
├── miniconda.sh         # Miniconda 安装
├── cuda-dev.sh          # CUDA 开发工具安装
├── metal-prime-cache.sh # 入库预缓存脚本（方案 A）
└── templates.json       # 模板元数据（名称、描述、依赖、耗时等）
```

**`base.sh`**（所有模板都会执行）：
```bash
#!/bin/bash
set -euo pipefail

hostnamectl set-hostname "metal-$(cat /sys/class/dmi/id/product_serial 2>/dev/null | tr -d ' ' | head -c 8)"
timedatectl set-timezone Asia/Shanghai
apt-get update -qq
apt-get install -y -qq curl wget git htop nvtop tmux unzip python3-pip
systemctl enable ssh
```

**`pytorch.sh`**（含本地缓存优先逻辑）：
```bash
#!/bin/bash
set -euo pipefail

CACHE_DIR="/opt/metal-cache"

if [ -d "$CACHE_DIR/pip" ] && [ "$(ls -1 "$CACHE_DIR/pip"/*.whl 2>/dev/null | wc -l)" -gt 0 ]; then
  echo "Installing from local cache..."
  pip install --no-cache-dir --find-links "$CACHE_DIR/pip" torch torchvision torchaudio
else
  echo "Local cache empty, downloading from mirror..."
  pip install --no-cache-dir \
    torch torchvision torchaudio \
    --index-url https://mirror.sjtu.edu.cn/pytorch-wheels/cu128
fi

python -c "import torch; print(f'PyTorch {torch.__version__}, CUDA: {torch.cuda.is_available()}')"
```

### 6.2 部署流程（方案 A 本地缓存版）

```
用户下单
  │
  ▼
后端分配物理机（检查 /opt/metal-cache 是否存在）
  │
  ▼
执行 base.sh（~30 sec）
  │
  ├─ 缓存存在 → 执行 template.sh（从本地安装，1-3 min）
  │
  └─ 缓存不存在 → 先执行 metal-prime-cache.sh（~5 min）→ 再执行 template.sh
  │
  ▼
配置 SSH 密钥 + 暴露端口（~10 sec）
  │
  ▼
标记为 running，通知前端
```

**前端展示的预计耗时 = base (30s) + 模板安装 (1-3min) + SSH 配置 (10s) ≈ 2-4 分钟**

### 6.3 API 接口

#### 获取可用模板列表

```
GET /api/v1/metal/env-templates
```

**Response:**
```json
{
  "templates": [
    {
      "id": "pytorch",
      "label": "PyTorch",
      "description": "预装 PyTorch 2.11 + torchvision + CUDA toolkit",
      "setupMinutes": 2,
      "packages": ["PyTorch 2.11", "torchvision", "torchaudio", "CUDA toolkit"],
      "scriptHash": "a1b2c3d4",
      "compatibleGpuModels": ["all"]
    }
  ]
}
```

#### 创建订单时指定模板

```
POST /api/v1/metal/orders
```

```json
{
  "deviceId": "metal-4090-8x-nvlink-jiangsu2",
  "billing": "daily",
  "quantity": 1,
  "rentalDuration": 3,
  "envTemplateId": "pytorch",
  "sshKey": "ssh-ed25519 AAAA...",
  "ports": "22,8080",
  "autoRenew": false,
  "voucherId": null
}
```

#### 部署进度查询

```
GET /api/v1/metal/instances/{instanceId}/deploy-progress
```

**Response:**
```json
{
  "instanceId": "metal-inst-9d3e1a",
  "status": "deploying",
  "steps": [
    { "name": "base_setup", "label": "系统初始化", "progress": 100, "status": "done" },
    { "name": "env_setup", "label": "安装 PyTorch 环境", "progress": 65, "status": "running" },
    { "name": "ssh_config", "label": "配置 SSH", "progress": 0, "status": "pending" }
  ],
  "overallProgress": 55,
  "estimatedRemainingMinutes": 1
}
```

---

## 7. 前端实现细节

### 7.1 数据层

在 `metal-market-data.ts` 中定义模板数据和工具函数：

```typescript
export interface MetalEnvTemplate {
  id: string
  label: string
  description: string
  setupMinutes: number
  packages: string[]
}

export const METAL_ENV_TEMPLATES: MetalEnvTemplate[] = [...]
export function getMetalEnvTemplateById(id: string): MetalEnvTemplate | undefined
```

### 7.2 部署页模板选择 UI

使用卡片式选择器，展示模板名称、描述、包含的软件包标签、预估耗时：

```
┌──────────────────────────────────────────────┐
│ 预装环境                                       │
│ 物理机已预装 Ubuntu 24.04 + NVIDIA 驱动 + CUDA  │
│                                                │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────┐│
│ │ PyTorch  │ │ Miniconda│ │ CUDA 开发 │ │纯净  ││
│ │          │ │          │ │          │ │Ubuntu││
│ │ PyTorch  │ │ Miniconda│ │ CUDA     │ │      ││
│ │ 2.11     │ │ 3.12     │ │ devel    │ │ 无额 ││
│ │ torchvision│ │          │ │ cuDNN   │ │ 外安 ││
│ │ torchaudio│ │          │ │ NCCL    │ │ 装   ││
│ │          │ │          │ │          │ │      ││
│ │ ~2 min   │ │ ~1 min   │ │ ~3 min   │ │ 0min ││
│ └──────────┘ └──────────┘ └──────────┘ └─────┘│
└──────────────────────────────────────────────┘
```

### 7.3 Store 类型

`MetalInstance` 使用 `envTemplateId: string` 字段记录所选模板，不再有 `imageId` / `imageVersion`。

---

## 8. 部署时序图

```
用户                    前端                      后端                     物理机
 │                       │                        │                        │
 │  选择模板 + 提交订单   │                        │                        │
 │ ────────────────────> │                        │                        │
 │                       │  POST /metal/orders    │                        │
 │                       │  { envTemplateId }     │                        │
 │                       │ ─────────────────────> │                        │
 │                       │                        │  分配物理机             │
 │                       │                        │  执行 base.sh (30s)    │
 │                       │                        │ ────────────────────> │
 │                       │  { status: deploying } │                        │
 │                       │ <───────────────────── │                        │
 │                       │                        │                        │
 │  跳转部署进度页        │                        │  执行 template.sh      │
 │ <──────────────────── │                        │  (本地缓存, 1-3min)   │
 │                       │                        │ ────────────────────> │
 │                       │                        │                        │
 │  轮询进度              │  GET /deploy-progress  │                        │
 │ ────────────────────> │ ─────────────────────> │  查询脚本执行状态       │
 │                       │ <───────────────────── │ <──────────────────── │
 │                       │  { progress: 65% }     │                        │
 │                       │                        │                        │
 │  ...直到 100%...      │                        │  配置 SSH + 端口       │
 │                       │                        │ ────────────────────> │
 │                       │                        │                        │
 │                       │  { status: "running" } │                        │
 │                       │ <───────────────────── │                        │
 │  显示 SSH 连接信息     │                        │                        │
 │ <──────────────────── │                        │                        │
 │                                                             总计: 2-4 min
```

---

## 9. 缓存管理

### 9.1 缓存目录结构

```
/opt/metal-cache/
├── manifest.json          # 缓存版本元数据
├── pip/                   # Python 包缓存
│   ├── torch-2.11.0+cu128.whl
│   ├── torchvision-0.22.0+cu128.whl
│   └── torchaudio-2.11.0+cu128.whl
├── conda/                 # Conda 安装器
│   └── Miniconda3-latest-Linux-x86_64.sh
└── cuda/                  # CUDA dev deb 包
    ├── cuda-toolkit-12-8_*.deb
    ├── libcudnn9-dev-cuda-12_*.deb
    └── libnccl-dev_*.deb
```

### 9.2 缓存更新策略

```typescript
// manifest.json 示例
{
  "cachedAt": 1721337600,
  "pytorchVersion": "2.11.0",
  "cudaVersion": "12.8",
  "pythonVersion": "3.12",
  "totalSizeMB": 4200,
  "expiresAt": 1723929600  // 30 天后过期，需重新缓存
}
```

### 9.3 缓存预热（可选后台任务）

```bash
#!/bin/bash
# 定期检查并更新缓存（cron 每周执行）
CACHE_DIR="/opt/metal-cache"
MANIFEST="$CACHE_DIR/manifest.json"

if [ ! -f "$MANIFEST" ]; then
  echo "No cache found, running prime..."
  /opt/metal-setup/metal-prime-cache.sh
  exit 0
fi

# 检查是否过期（30 天）
CACHED_AT=$(grep cachedAt "$MANIFEST" | cut -d= -f2)
NOW=$(date +%s)
DIFF=$(( NOW - CACHED_AT ))
if [ "$DIFF" -gt 2592000 ]; then
  echo "Cache expired, refreshing..."
  /opt/metal-setup/metal-prime-cache.sh
fi
```

---

## 10. 扩展：自定义安装脚本

未来可支持用户提供自定义安装脚本，流程如下：

1. 用户在部署页上传 `setup.sh`（或在文本框中编写）
2. 提交订单时一并上传脚本内容
3. 后端校验脚本安全性（禁止 rm -rf /、禁止网络攻击等）
4. 部署时先执行 `base.sh`，再执行用户脚本

**安全限制：**
- 脚本必须以 `#!/bin/bash` 开头
- 禁止 `rm -rf /`、`dd`、`mkfs` 等危险命令
- 禁止访问内网 IP 段
- 脚本执行超时 10 分钟自动终止
- 执行日志全量记录供审计

---

## 11. 注意事项

1. **模板与 GPU 型号无关**：所有模板适用于所有 GPU 型号，因为安装的是 Python 层面的软件包
2. **脚本幂等性**：安装脚本需保证幂等，重复执行不出错
3. **数据盘不受影响**：模板安装仅操作系统盘，数据盘 `/data` 挂载点不受影响
4. **预装失败处理**：脚本执行失败时，实例标记为 `failed`，用户可查看日志后重试
5. **模板版本管理**：脚本更新后通过 `scriptHash` 标识版本，已部署实例不受影响
6. **缓存空间管理**：本地缓存约占 3-5GB/台，需在 NVMe 系统盘上预留空间
7. **首次部署延迟**：如果机器未预缓存，首次部署会先执行预缓存（额外 ~5 分钟），后续部署从本地缓存安装

---

## 12. 退租还原方案

用户退租（释放）裸金属设备后，需要将系统还原为纯净预装状态，供下一位用户使用。核心要求：

- **安全擦除**：彻底清除上一位用户的所有数据（训练数据、模型权重、代码、日志）
- **系统还原**：恢复到 Ubuntu 24.04 + NVIDIA 驱动 + CUDA runtime 的出厂状态
- **缓存重建**：重新准备本地安装包缓存，供下次部署使用

### 12.1 方案对比

| 维度 | 方案 A：Btrfs 快照回滚 | 方案 B：PXE 全盘重装 | 方案 C：文件级清理 |
|------|----------------------|---------------------|-------------------|
| **还原耗时** | <1 分钟 | 10-15 分钟 | 3-5 分钟 |
| **安全等级** | 高（subvolume 级删除） | **最高（全盘覆写）** | 中（依赖清理完整性） |
| **数据残留风险** | 低（块级释放 + discard） | 无 | 中（用户可能修改系统文件） |
| **实施复杂度** | 中 | 高 | 低 |
| **需 Btrfs** | 是 | 否 | 否 |
| **需 PXE 环境** | 否 | 是 | 否 |
| **适用场景** | 通用，退租频率高 | 高安全要求，合规场景 | 小规模、信任用户场景 |

### 12.2 方案 A：Btrfs 快照回滚（推荐）

**原理：** 部署时从模板快照创建用户实例 subvolume，退租时删除用户 subvolume 并重建模板快照。Btrfs 的 `discard` 挂载选项确保删除的块自动回收并清零。

#### 部署时（创建实例）

```bash
# 1. 从模板快照创建用户实例 subvolume（秒级）
btrfs subvolume snapshot /mnt/system/@snap_${TEMPLATE} /mnt/system/@inst-${INSTANCE_ID}

# 2. 挂载用户实例
mount -o subvol=@inst-${INSTANCE_ID},compress=zstd /dev/nvme0n1 /mnt/instance

# 3. 配置用户环境（SSH key、端口等）
# ...
```

#### 退租时（还原系统）

```bash
#!/bin/bash
# metal-release.sh — 退租还原脚本
set -euo pipefail

INSTANCE_ID="$1"
SYSTEM_DISK="/dev/nvme0n1"
MNT="/mnt/system"

echo "[1/5] 卸载用户实例..."
umount /mnt/instance 2>/dev/null || true

echo "[2/5] 删除用户实例 subvolume（秒级，自动触发 discard）..."
btrfs subvolume delete ${MNT}/@inst-${INSTANCE_ID}

echo "[3/5] 重建模板快照..."
# 删除旧快照，从 @base 重新创建
for tmpl in pytorch miniconda cuda-dev; do
  btrfs subvolume delete ${MNT}/@snap_${tmpl} 2>/dev/null || true
  btrfs subvolume snapshot ${MNT}/@base ${MNT}/@snap_${tmpl}
done

echo "[4/5] 强制 Btrfs discard 回收已释放块..."
btrfs filesystem discard ${SYSTEM_DISK}

echo "[5/5] 预热本地缓存..."
/opt/metal-setup/metal-prime-cache.sh

echo "还原完成，机器已就绪"
```

#### 安全增强：subvolume 删除前擦除

```bash
# 更安全的做法：在删除用户 subvolume 前，对其执行全盘擦除
# 这确保即使文件系统元数据被恢复，也无法读取用户数据

echo "安全擦除用户实例..."
# 向用户 subvolume 的所有已分配块写零
dd if=/dev/zero of=/mnt/system/@inst-${INSTANCE_ID}/.wipe_marker bs=1M count=10 2>/dev/null
# 然后删除 subvolume
btrfs subvolume delete /mnt/system/@inst-${INSTANCE_ID}
# Btrfs 的 discard 选项会自动回收并清零已释放的块
```

### 12.3 方案 B：PXE 全盘重装

**原理：** 通过 PXE 网络启动，从内部镜像服务器全盘重装 Ubuntu + 驱动。

```bash
#!/bin/bash
# metal-reinstall.sh — PXE 全盘重装
set -euo pipefail

INSTANCE_ID="$1"

# 1. 配置目标机器进入 PXE 启动
ipmitool -H ${BMC_IP} -U admin -P password chassis bootdev pxe

# 2. 重启机器
ipmitool -H ${BMC_IP} -U admin -P power cycle

# 3. 等待 PXE 引导 + 自动安装（~10-15 分钟）
wait_for_install_completion ${BMC_IP}

# 4. 安装完成后预缓存
ssh root@${INSTANCE_IP} "/opt/metal-setup/metal-prime-cache.sh"

echo "重装完成"
```

**PXE 自动安装流程：**
```
机器重启
  │
  ▼
PXE 引导（从 DHCP 获取 TFTP 地址）
  │
  ▼
下载 iPXE 内核 + initrd
  │
  ▼
执行 preseed/kickstart 自动安装脚本
  │
  ├─ 分区（Btrfs 文件系统）
  ├─ 安装 Ubuntu 24.04
  ├─ 安装 NVIDIA 驱动 + CUDA runtime
  ├─ 配置 SSH + 常用工具
  │
  ▼
重启进入新系统
  │
  ▼
执行 metal-prime-cache.sh 预缓存
  │
  ▼
标记为 ready
```

### 12.4 方案 C：文件级清理

**原理：** 不重装系统，直接删除用户数据并重置系统配置。

```bash
#!/bin/bash
# metal-sanitize.sh — 文件级清理
set -euo pipefail

echo "[1/6] 停止用户服务..."
# 停止用户可能启动的所有非系统服务
systemctl list-units --type=service --state=running | grep -v -E '(ssh|systemd|dbus|network)' | \
  awk '{print $1}' | xargs -r systemctl stop

echo "[2/6] 清除用户数据..."
SECURE_PATHS=(
  "/home/*"
  "/root/.ssh"
  "/root/.bash_history"
  "/root/.cache"
  "/tmp/*"
  "/var/log/*"
  "/opt/user-data"
  "/data/*"  # 数据盘
)

for pattern in "${SECURE_PATHS[@]}"; do
  for target in $pattern; do
    [ -e "$target" ] || continue
    # 安全擦除：先写零再删除
    find "$target" -type f -exec dd if=/dev/zero of={} bs=1M count=1 2>/dev/null \; 2>/dev/null
    rm -rf "$target"
  done
done

echo "[3/6] 重置用户账户..."
# 删除所有非系统用户
awk -F: '$3 >= 1000 && $3 < 65534 {print $1}' /etc/passwd | \
  xargs -r deluser --remove-home

echo "[4/6] 清理 SSH 密钥..."
rm -rf /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys 2>/dev/null
rm -f /etc/ssh/ssh_host_*
ssh-keygen -A

echo "[5/6] 重置网络和系统配置..."
# 清理 iptables 用户规则
iptables -F
# 清理 crontab
crontab -r 2>/dev/null || true
# 清理 systemd 用户服务
find /etc/systemd/system -name "*.service" -exec grep -l "user" {} \; | xargs -r rm -f
systemctl daemon-reload

echo "[6/6] 预热缓存..."
/opt/metal-setup/metal-prime-cache.sh

echo "清理完成"
```

**风险：** 用户可能安装了系统级软件包、修改了内核参数、安装了内核模块等，文件级清理无法完全覆盖。

### 12.5 推荐方案

```
高安全要求（金融、政务）  →  方案 B：PXE 全盘重装（10-15 min，最安全）
通用场景（大部分用户）    →  方案 A：Btrfs 快照回滚（<1 min，高效安全）
低风险场景（测试环境）    →  方案 C：文件级清理（3-5 min，简单快速）
```

**实际生产中推荐 A + B 组合：**
- 日常退租使用方案 A（秒级还原）
- 定期（如每月）或安全审计时对所有机器执行方案 B（全盘重装）
- 两者结合兼顾效率与安全

---

## 13. Btrfs 快照与模型训练场景适配性分析

### 13.1 Btrfs 快照工作原理

```
                     部署前                              部署后（有写入）
  ┌─────────────────────────┐      ┌─────────────────────────┐
  │    @base subvolume       │      │    @base subvolume       │
  │                         │      │                         │
  │  Block A: Ubuntu 系统    │      │  Block A: Ubuntu 系统    │
  │  Block B: NVIDIA 驱动    │      │  Block B: NVIDIA 驱动    │
  │  Block C: Python 环境    │      │  Block C: Python 环境    │
  │  Block D: (free)         │      │  Block D: 用户代码 ← 修改│
  │                         │      │  Block E: checkpoint ← 新增│
  └─────────────────────────┘      └─────────────────────────┘
                                            │
                                            │ 写时复制 (CoW)
                                            ▼
                                   ┌─────────────────────────┐
                                   │ @inst-{id} subvolume     │
                                   │  (snapshot of @base)     │
                                   │                         │
                                   │  Block D': 原始 Block D  │
                                   │  Block E': checkpoint    │
                                   │  (A/B/C 共享 @base 块)   │
                                   │                         │
                                   │  checksum: 每块独立校验   │
                                   └─────────────────────────┘
```

**关键机制：** 写时复制（Copy-on-Write）+ 块级校验和（Checksumming）
- **读操作**：直接读取 @base subvolume 的数据块，零额外开销
- **写操作**：先将原始数据块复制到用户 subvolume，再覆写 @base —— 有 I/O 放大
- **数据完整性**：每个 4K 块独立计算校验和（xxhash），读取时自动验证，可检测 silent data corruption

### 13.2 模型训练 I/O 特征

| 阶段 | I/O 类型 | 读写比 | 典型数据量 | 对快照的影响 |
|------|---------|--------|-----------|------------|
| 数据加载 | 顺序读 | 纯读 | GB 级 | **零影响**（读不触发 CoW） |
| 模型初始化 | 随机读 | 纯读 | MB 级 | 零影响 |
| 前向/反向传播 | 计算为主 | 极少量写 | — | 几乎无影响 |
| Checkpoint 保存 | 顺序写 | 纯写 | 1-10 GB | **主要瓶颈**（触发 CoW） |
| TensorBoard 日志 | 顺序写 | 小量写 | MB 级/min | 轻微影响 |
| 数据预处理缓存 | 随机写 | 中量写 | GB 级 | 中等影响 |

### 13.3 性能影响量化

```
┌──────────────────────────────────────────────────────────────┐
│           Btrfs 快照对训练各阶段的性能影响                       │
│                                                              │
│  数据加载 (顺序读):                                          │
│  ████████████████████████████████████████  0% overhead        │
│                                                              │
│  前向/反向 (计算):                                           │
│  ████████████████████████████████████████  0% overhead        │
│                                                              │
│  Checkpoint 保存 (顺序写, 首次):                              │
│  ██████████████████████████████  15-30% overhead              │
│  (需先 CoW 原始块再写入新数据)                                 │
│                                                              │
│  Checkpoint 保存 (顺序写, 重复覆盖同一位置):                   │
│  ██████████████████████████████████████  5-10% overhead       │
│  (CoW 块已在快照中，后续写入无需再次复制)                       │
│                                                              │
│  TensorBoard 日志 (小量写):                                   │
│  ████████████████████████████████████████  0-2% overhead      │
│                                                              │
│  大规模数据预处理 (大量随机写):                                │
│  ████████████████████████████████████  10-20% overhead        │
│                                                              │
│  注：使用 zstd 透明压缩时，写入量减少 ~30%，                   │
│      但增加约 2-5% CPU 开销（压缩/解压）                       │
└──────────────────────────────────────────────────────────────┘
```

### 13.4 关键风险与缓解

#### 风险 1：磁盘空间耗尽（低风险）

```
风险场景：
  用户训练 7B 模型，checkpoint 每 10 分钟保存一次（~6GB/次）
  如果系统盘空间不足，快照写入失败

  与 LVM thin pool 的区别：Btrfs 不存在"thin pool 耗尽导致快照损坏"的致命风险
  Btrfs 的 subvolume 共享文件系统总空间，空间不足时写入失败但不会损坏元数据

缓解措施：
  ① 监控系统盘使用率
     当使用率 > 70% 时告警
     当使用率 > 85% 时通知用户清理或迁移到数据盘

  ② 引导用户将 checkpoint 写入数据盘
     数据盘独立挂载，不经过系统盘快照
     部署脚本中配置：
       ln -s /data/checkpoints /root/checkpoints

  ③ 设置 checkpoint 保存上限
     在用户环境中配置 PyTorch lightning 的 ModelCheckpoint
       save_top_k=3  (只保留最近 3 个 checkpoint)
       monitor=None   (按步数保存，不按指标)

  ④ 使用 Btrfs qgroup 配额限制用户实例空间
     btrfs qgroup limit 200G /mnt/system/@inst-${INSTANCE_ID}
     防止单个用户实例耗尽系统盘空间
```

#### 风险 2：I/O 性能下降（训练速度影响）

```
风险场景：
  首次 checkpoint 保存时 CoW 导致写入延迟增加

缓解措施：
  ① 使用 NVMe 系统盘
     NVMe 随机写 IOPS > 500K，CoW 开销可忽略
     SATA SSD 仅 50K IOPS，CoW 开销明显

  ② 预热快照
     部署后立即写入一个测试文件触发 CoW，避免首次训练时的延迟尖峰

  ③ 将 checkpoint 写入独立卷
     最佳方案：数据盘（/data）不走系统盘快照
     用户代码在系统盘 subvolume 上，checkpoint 在独立卷上

  ④ 使用 zstd 压缩（可选）
     mount -o compress=zstd 可减少写入量（压缩后写入）
     适合顺序写入场景（checkpoint、TensorBoard 日志）
     对随机写入场景（数据预处理）收益有限
```

#### 风险 3：多实例并发写入（CoW 放大）

```
风险场景：
  同一台物理机上 8 张 GPU，每张一个实例
  每个实例一个 subvolume 快照，共 8 个快照共享同一个 @base
  如果 8 个实例同时写入，CoW 放大效应叠加

缓解措施：
  ① 限制每台物理机的最大实例数
     规则：同时活跃实例数 ≤ GPU 数量 × 2

  ② Btrfs 的 CoW 管理优于 LVM thin pool
     Btrfs 在内核级管理块分配，CoW 效率更高
     无需维护 thin pool 元数据，减少管理开销

  ③ 监控 CoW 放大率
     btrfs filesystem usage /mnt/system 查看已分配 vs 实际数据
     当放大率 > 3x 时告警
```

#### 风险 4：退租还原时间（与 LVM 持平）

```
风险场景：
  用户训练了 7 天，subvolume 积累了大量 CoW 数据
  退租时需要删除用户 subvolume

  与 LVM 的区别：Btrfs subvolume 删除是秒级操作
  Btrfs 直接释放 subvolume 占用的块，无需合并或回写

缓解措施：
  ① 退租时直接删除用户 subvolume（秒级）
     btrfs subvolume delete /mnt/system/@inst-${ID}
     删除操作仅释放元数据和数据块，不需回写（秒级）

  ② @base subvolume 保持不变
     用户的修改只在用户 subvolume 中，删除后 @base 自动恢复
     下一位用户的部署从 @base 重新创建新快照

  ③ 使用 discard 挂载选项确保块及时回收
     mount -o discard /dev/nvme0n1 /mnt/system
     删除 subvolume 后块立即标记为可重用
```

### 13.5 推荐的训练场景 Btrfs 架构

```
┌─────────────────────────────────────────────────────────┐
│                    物理机磁盘布局                         │
│                                                         │
│  /dev/nvme0n1 (系统盘 1TB NVMe)                        │
│  └─ btrfs 单设备卷（mount -o compress=zstd,discard）    │
│      ├─ @base          ← Ubuntu + 驱动 + 缓存（只读快照源）│
│      ├─ @snap_pytorch  ← template subvolume             │
│      ├─ @snap_miniconda ← template subvolume            │
│      ├─ @snap_cudadev  ← template subvolume             │
│      ├─ @inst-001      ← 用户 1 实例快照                 │
│      ├─ @inst-002      ← 用户 2 实例快照                 │
│      └─ @cache         ← 本地安装包缓存                  │
│                                                         │
│  /dev/nvme1n1 (数据盘 4TB NVMe)  ← 独立挂载             │
│  └─ btrfs 独立卷                                        │
│      └─ /data                ← 用户训练数据 + checkpoints│
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**关键设计原则：**

1. **系统盘走 Btrfs 快照，数据盘独立挂载** — checkpoint 写入不触发系统盘 CoW
2. **使用 zstd 透明压缩** — 节省 30-50% 存储空间，对顺序写入场景（checkpoint）有压缩收益
3. **启用 discard 挂载选项** — 退租删除 subvolume 时块立即回收，秒级还原
4. **退租时删除用户 subvolume（不合并）** — 秒级还原，无需回写
5. **引导用户写 checkpoint 到 /data** — 脚本中配置 `ln -s /data/checkpoints ~/checkpoints`
6. **使用 btrfs qgroup 限制用户实例空间** — 防止单用户耗尽系统盘

### 13.6 训练场景退租还原流程

```
用户训练完成，点击退租
  │
  ▼
后端执行：
  │
  ├─ 1. 强制停止用户进程（SIGTERM → SIGKILL）
  │
  ├─ 2. 安全擦除数据盘 /data（dd zero 或 shred）
  │     （数据盘独立挂载，不走系统盘快照，需单独擦除）
  │
  ├─ 3. 删除用户实例 subvolume（秒级）
  │     btrfs subvolume delete /mnt/system/@inst-${INSTANCE_ID}
  │
  ├─ 4. 强制 discard 回收已释放块
  │     btrfs filesystem discard /dev/nvme0n1
  │
  ├─ 5. 重建模板快照（秒级）
  │     btrfs subvolume snapshot /mnt/system/@base /mnt/system/@snap_${TEMPLATE}
  │
  ├─ 6. 预热本地缓存（如果被清理）
  │     /opt/metal-setup/metal-prime-cache.sh
  │
  └─ 7. 标记机器为 ready
        总耗时：<1 分钟（不含缓存重建）
```

### 13.7 结论：Btrfs 快照是否适合训练场景？

**适合，且优于 LVM：**

| 条件 | 说明 |
|------|------|
| ✅ 系统盘用 NVMe | CoW 开销可忽略 |
| ✅ 数据盘独立挂载 | checkpoint 不触发系统盘 CoW |
| ✅ 内置 checksumming | 检测 GPU 计算导致的 silent data corruption，保护 checkpoint 完整性 |
| ✅ zstd 透明压缩 | 节省 30-50% 存储空间，减少写入量 |
| ✅ discard 挂载选项 | 退租时块立即回收，秒级还原 |
| ✅ qgroup 配额 | 精确限制用户实例磁盘空间 |
| ⚠️ 首次 checkpoint 有延迟 | 可通过预热缓解 |
| ✅ 适合：频繁大量随机写 | CoW 放大比 LVM 更可控（内核级块管理） |

**对比其他方案在训练场景的表现：**

| 方案 | 训练 I/O 性能 | 退租还原速度 | 实施复杂度 | 数据完整性 | 推荐度 |
|------|-------------|------------|-----------|-----------|--------|
| Btrfs 快照 + 独立数据盘 | ★★★★☆ | ★★★★★ (<1 min) | ★★★☆☆ | ★★★★★ (checksumming) | **推荐** |
| LVM 快照 + 独立数据盘 | ★★★★☆ | ★★★★★ (<1 min) | ★★★☆☆ | ★★★☆☆ (无校验) | 历史方案 |
| 无快照（纯文件清理） | ★★★★★ | ★★☆☆☆ (3-5 min) | ★☆☆☆☆ | ★★☆☆☆ | 简单场景可用 |
| PXE 全盘重装 | ★★★★★ | ★☆☆☆☆ (10-15 min) | ★★★★☆ | ★★★★★ | 高安全要求 |
