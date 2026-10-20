# 第九章：Go Edge Agent 部署

> Go Edge Agent（`goes/proxy`）部署在每个 IDC 机房，负责设备纳管、SSH 验证、GPU 检测、K8s Join、节点标签等自动化流水线。**同时负责裸金属设备的生命周期管理**（停机、数据清理、状态上报）。

---

## 9.1 架构回顾

```
┌─────────────────────────────────────────────────┐
│                 中心 API Server (apps/api)        │
│  /api/agent/register                            │
│  /api/agent/heartbeat                           │
│  /api/agent/tasks/pending                       │
│  /api/agent/tasks/{id}                          │
│  /api/agent/version                             │
└─────────────────────┬───────────────────────────┘
                      │ HTTPS (自注册 + 轮询)
                      ▼
┌─────────────────────────────────────────────────┐
│                 Go Edge Agent (goes/proxy)        │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ SSH      │ │ K8s      │ │ Health Monitor   │ │
│  │ Client   │ │ Client   │ │ (设备健康)       │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Engine   │ │ Platform │ │ Self-Updater     │ │
│  │ (流水线) │ │ Client   │ │ (自动更新)       │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
└─────────────────────┬───────────────────────────┘
                      │ SSH
                      ▼
┌─────────────────────────────────────────────────┐
│              GPU 设备节点                         │
│  nvidia-smi → GPU 检测                           │
│  kubeadm join → K8s 加入                         │
│  kubectl label → 节点标签                        │
└─────────────────────────────────────────────────┘
```

---

## 9.2 编译 Agent

```bash
# 在代码仓库 goes/proxy 目录
cd goes/proxy

# 编译 amd64
make build
# 输出: bin/edge-agent

# 编译 arm64
make build-arm64
# 输出: bin/edge-agent-arm64

# 编译并测试
make test
```

---

## 9.3 安装 Agent

### 9.3.1 使用安装脚本（推荐）

```bash
# 在每个 IDC 的跳板机/管控节点上执行
curl -sSL https://agent.GPURun.cn/install.sh | bash

# 安装脚本自动:
# 1. 检测架构 (amd64/arm64)
# 2. 下载二进制到 /usr/local/bin/GPURun-agent
# 3. 生成配置文件 /etc/GPURun/agent.yaml
# 4. 注册 systemd 服务
# 5. 启动并验证
```

### 9.3.2 手动安装

```bash
# 1. 复制二进制
cp bin/edge-agent /usr/local/bin/GPURun-agent
chmod +x /usr/local/bin/GPURun-agent

# 2. 创建配置目录
mkdir -p /etc/GPURun /var/log/GPURun

# 3. 生成配置文件
cat <<EOF > /etc/GPURun/agent.yaml
# Agent 配置
agent:
  id: "agent-idc-a-001"              # 全局唯一
  name: "IDC-A 北京管控节点"
  datacenter_code: "dc-beijing-01"    # 对应 data_center.code

# 中心 API 连接
platform:
  api_base_url: "https://api.platform.com"
  api_token: "<AGENT_API_TOKEN>"      # 平台分配的 token
  poll_interval: 30s
  heartbeat_interval: 30s

# SSH 配置
ssh:
  timeout: 30s
  max_retries: 3
  retry_interval: 60s

# K8s 配置
k8s:
  kubeconfig_path: "/etc/rancher/k3s/k3s.yaml"  # 或 kubeadm 路径
  default_labels:
    GPURun.io/managed-by: "edge-agent"
    GPURun.io/datacenter: "dc-beijing-01"

# 轮询配置
polling:
  interval: 30s
  batch_size: 10

# 重试配置
retry:
  max_retries: 3
  base_interval: 60s
  max_interval: 300s

# 健康监控
health:
  check_interval: 60s
  failure_threshold: 3
  ssh_check_enabled: true
  local_port: 9090

# 更新配置
update:
  check_interval: 3600s
  auto_update: true
  version_file: "/etc/GPURun/agent.version"
EOF

# 4. 创建 systemd 服务
cat <<EOF > /etc/systemd/system/GPURun-agent.service
[Unit]
Description=GPURun Edge Agent
After=network.target containerd.service
Wants=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/GPURun-agent --config /etc/GPURun/agent.yaml
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=GPURun-agent
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

# 5. 启动
systemctl daemon-reload
systemctl enable GPURun-agent
systemctl start GPURun-agent

# 6. 验证
systemctl status GPURun-agent
curl http://localhost:9090/health
```

---

## 9.4 Agent API Token 管理

### 9.4.1 注册 Agent 获取 Token

Agent 首次启动时自动向中心 API 注册：

```bash
# 手动注册（可选）
curl -X POST https://api.platform.com/api/agent/register \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "agent-idc-a-001",
    "name": "IDC-A 北京管控节点",
    "datacenter_code": "dc-beijing-01",
    "version": "1.0.0",
    "ip": "10.0.1.1"
  }'

# 响应:
# {
#   "agent_id": "agent-idc-a-001",
#   "token": "<AGENT_TOKEN>",
#   "registered_at": "2026-07-26T10:00:00Z"
# }
```

### 9.4.2 更新 Agent

```bash
# Agent 自动检测新版本
# 手动更新:
systemctl stop GPURun-agent
cp new-agent /usr/local/bin/GPURun-agent
systemctl start GPURun-agent
```

---

## 9.5 设备纳管流水线

### 9.5.1 流水线阶段

Agent 收到设备上架任务后，按以下阶段执行：

```
ssh_verify → gpu_detect → env_init → k8s_join → gpu_label
```

| 阶段 | 操作 | 重试 |
|------|------|------|
| `ssh_verify` | SSH 连接验证、OS 探测 | 3 次 (60s 间隔) |
| `gpu_detect` | `nvidia-smi` 获取 GPU 信息 | 不自动重试 |
| `env_init` | 安装基础依赖、配置运行时 | 2 次 |
| `k8s_join` | `kubeadm join` 加入集群 | 3 次 |
| `gpu_label` | 打标签、部署 GPU Operator | 2 次 |

### 9.5.2 任务拉取

```bash
# Agent 定期轮询待执行任务
curl -H "Authorization: Bearer <AGENT_TOKEN>" \
  https://api.platform.com/api/agent/tasks/pending

# 响应示例:
# [
#   {
#     "id": "task-001",
#     "type": "device_onboard",
#     "payload": {
#       "device_sn": "SN2026A10001",
#       "internal_ip": "10.0.1.101",
#       "login_username": "root",
#       "login_password": "***",
#       "gpu_card_type": "h100-80g",
#       "gpu_count": 8,
#       "k8s_version": "1.30",
#       "join_command": "kubeadm join ..."
#     }
#   }
# ]
```

---

## 9.6 裸金属设备生命周期管理

Agent 不仅负责 K8s 节点入网，还负责裸金属设备的全生命周期管理。

### 9.6.1 任务类型总览

| 任务类型 | 说明 | 触发方式 |
|---------|------|---------|
| `device_onboard` | 设备入库（SSH 验证 → GPU 检测 → K8s Join） | 平台派发 |
| **`device_stop`** | 设备关机（逾期/用户停机） | 平台派发 |
| **`device_cleanup`** | 数据清理 + Btrfs 还原 | 平台派发 |
| **`device_status_report`** | 设备状态上报（GPU、磁盘、内存） | 定时轮询 |
| **`gpu_health_check`** | GPU 健康检查 | 定时轮询 |

### 9.6.2 device_stop — 设备关机

```json
{
  "type": "device_stop",
  "deviceId": "sd-xxx",
  "payload": {
    "force": false,
    "timeoutSeconds": 300,
    "reason": "overdue_grace_expired"
  }
}
```

Agent 收到后执行：
1. 检查是否有正在运行的用户进程
2. 如果 `force=false`：发送 SIGTERM 给用户进程，等待 60 秒
3. 执行 `shutdown -h now`
4. 等待设备关机确认（通过 ping 检测）
5. 上报结果

### 9.6.3 device_cleanup — Btrfs 数据清理

```json
{
  "type": "device_cleanup",
  "deviceId": "sd-xxx",
  "payload": {
    "method": "btrfs",
    "instanceId": "inst-xxx",
    "template": "pytorch",
    "wipeDataDisk": true,
    "rotateCredentials": true
  }
}
```

Agent 收到后执行 Btrfs 还原脚本：

```bash
#!/bin/bash
# metal-release-btrfs.sh — Btrfs 方案退租还原
set -euo pipefail

INSTANCE_ID="$1"
TEMPLATE="${2:-pytorch}"
SYSTEM_DISK="/dev/nvme0n1"
MNT="/mnt/system"

# Phase 1: Btrfs 系统盘还原（秒级）
umount /mnt/instance 2>/dev/null || true
btrfs subvolume delete "${MNT}/@inst-${INSTANCE_ID}" 2>/dev/null || true
btrfs filesystem discard "${SYSTEM_DISK}"

# 重建模板快照
for tmpl in pytorch miniconda cuda-dev; do
    btrfs subvolume delete "${MNT}/@snap_${tmpl}" 2>/dev/null || true
    btrfs subvolume snapshot "${MNT}/@base" "${MNT}/@snap_${tmpl}"
done

# 创建新实例
btrfs subvolume snapshot "${MNT}/@snap_${TEMPLATE}" "${MNT}/@inst-${INSTANCE_ID}"
mount -o subvol=@inst-${INSTANCE_ID},compress=zstd "${SYSTEM_DISK}" /mnt/instance

# Phase 2: 凭据轮换
NEW_PASSWORD=$(openssl rand -base64 32 | tr -d '=/+' | head -c 24)
echo "root:${NEW_PASSWORD}" | chpasswd
rm -f /etc/ssh/ssh_host_* && ssh-keygen -A 2>/dev/null

# Phase 3: 网络 + GPU 重置
iptables -F USER_CHAIN 2>/dev/null || true
nvidia-smi --gpu-reset 2>/dev/null || true

echo "NEW_PASSWORD=${NEW_PASSWORD}"
```

### 9.6.4 device_status_report — 状态上报

Agent 定时上报设备状态：

```json
{
  "type": "device_status_report",
  "deviceId": "sd-xxx",
  "report": {
    "uptime": 86400,
    "gpuStatus": [
      { "index": 0, "name": "H100 80GB", "temp": 45, "memoryUsed": 0, "memoryTotal": 81920 }
    ],
    "diskUsage": { "/": { "used": 120, "total": 500, "unit": "GB" } },
    "memoryUsage": { "used": 32, "total": 128, "unit": "GB" },
    "processCount": 2,
    "agentVersion": "1.2.0"
  }
}
```

### 9.6.5 Agent 安全边界

```
✅ Agent 可以做的：
├── 上报设备状态（GPU、磁盘、内存、进程数）
├── 执行 shutdown（平台指令）
├── 执行 btrfs 还原命令（平台指令）
├── 执行 GPU health check
└── 检查自身版本并更新

❌ Agent 不应该做的：
├── 记录用户命令或输入
├── 读取用户文件内容
├── 监控用户网络流量
├── 收集 GPU 使用率（属于用户隐私）
└── 在用户活跃时执行任何操作
```

---

## 9.7 Bastion Host 支持

对于需要跳板机的 IDC 网络环境：

```yaml
# agent.yaml 中配置 bastion
ssh:
  bastion:
    enabled: true
    host: "bastion.platform.com"
    port: 22
    username: "ops"
    private_key_path: "/etc/GPURun/bastion_key"
```

---

## 9.8 监控 Agent 健康

```bash
# Agent 本地健康端点
curl http://localhost:9090/health
# {"status":"ok","version":"1.0.0","uptime":"2h30m"}

# 中心 API 查看所有 Agent 状态
curl -H "Authorization: Bearer <PLATFORM_TOKEN>" \
  https://api.platform.com/api/agents
```

---

## 9.9 验证检查清单

| 检查项 | 命令 | 预期结果 |
|--------|------|---------|
| Agent 服务运行 | `systemctl status GPURun-agent` | active (running) |
| 健康端点 | `curl localhost:9090/health` | `{"status":"ok"}` |
| 中心注册 | 平台 API 查看 Agent 列表 | Agent 已注册 |
| 心跳正常 | 平台 API 查看 Agent 心跳 | 最近 60s 内 |
| 任务拉取 | 手动创建测试任务 | Agent 拉取成功 |
| **裸金属 device_stop** | 创建测试关机任务 | Agent 执行 shutdown |
| **裸金属 device_cleanup** | 创建测试清理任务 | Agent 执行 Btrfs 还原 |
| **裸金属 status_report** | 查看平台上报记录 | GPU/磁盘/内存数据正常 |
| SSH 连通 | Agent 日志查看 | `ssh_verify: success` |
| GPU 检测 | Agent 日志查看 | `gpu_detect: success` |
| K8s Join | `kubectl get nodes` | 新节点 Ready |
