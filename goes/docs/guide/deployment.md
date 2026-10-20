# GPURun Edge Agent 部署与运维手册

## 1. 概述

Edge Agent 是部署在每个 IDC 机房内部的边缘代理服务，作为平台与 IDC 内部 GPU 设备之间的桥梁：

- 平台通过 HTTPS 出站连接与 Agent 通信
- Agent 在 IDC 内网执行 SSH、环境初始化、K8s join 等本地操作
- 单二进制部署，无外部依赖

### 架构图

```
平台 API Server
      │
      │ HTTPS (出站)
      ▼
┌──────────────────────────────────────┐
│  IDC 机房                             │
│                                      │
│  管控节点 (1C/2G)                     │
│  ┌──────────────────────────┐       │
│  │  GPURun-agent :9090   │       │
│  │  state.db (SQLite)       │       │
│  │  agent.yaml              │       │
│  └──────────┬───────────────┘       │
│             │ SSH (内网)             │
│             ▼                       │
│  ┌─────────┐ ┌─────────┐           │
│  │ GPU-001 │ │ GPU-002 │ ...       │
│  └─────────┘ └─────────┘           │
└──────────────────────────────────────┘
```

---

## 2. 环境要求

### 管控节点最低配置

| 资源 | 最小值 | 推荐值 |
|------|--------|--------|
| CPU | 1 核 | 2 核 |
| 内存 | 512 MB | 1 GB |
| 磁盘 | 10 GB | 20 GB |
| 网络 | 内网可达所有 GPU 设备 + 出站 443 到平台 API | 同左 |

### 操作系统

- Ubuntu 20.04 / 22.04 LTS
- CentOS 7
- Rocky Linux 9
- 其他主流 Linux 发行版

### 依赖工具

| 工具 | 用途 | 是否必须 |
|------|------|----------|
| `systemd` | 服务管理 | 是 |
| `curl` | 安装脚本 / API 调用 | 是 |
| `wget` | 下载二进制 | 是（curl 也可） |
| `ssh` | 连接 GPU 设备 | 由 agent 内置 |
| `kubectl` | K8s 集群管理（可选） | 否 |
| `nvidia-smi` | GPU 设备上执行 | 否（agent 远程调用） |

---

## 3. 安装

### 3.1 一键安装（推荐）

从平台运营获取 `agent_token` 后，在管控节点执行：

```bash
curl -fsSL https://agent.GPURun.cn/install.sh | sudo bash -s -- \
  --token "${AGENT_TOKEN}" \
  --api-url "https://api.GPURun.cn" \
  --datacenter "SH-ZJ-01"
```

**参数说明：**

| 参数 | 必须 | 说明 |
|------|------|------|
| `--token` | 是 | 平台下发的 Agent Token（256-bit） |
| `--api-url` | 否 | 平台 API 地址，默认 `https://api.GPURun.cn` |
| `--datacenter` | 是 | 机房编码，如 `SH-ZJ-01` |

**安装脚本执行内容：**

1. 检测系统架构（amd64/arm64）
2. 下载 `GPURun-agent` 二进制到 `/usr/local/bin/`
3. 生成配置文件 `/etc/GPURun/agent.yaml`
4. 注册 systemd 服务 `GPURun-agent`
5. 启动服务并验证

### 3.2 手动安装

```bash
# 1. 下载二进制
VERSION="1.0.0"
ARCH="amd64"
curl -fsSL "https://agent.GPURun.cn/api/agent/downloads/${VERSION}/GPURun-agent-linux-${ARCH}.tar.gz" \
  -o /tmp/GPURun-agent.tar.gz

# 2. 解压安装
sudo tar xzf /tmp/GPURun-agent.tar.gz -C /usr/local/bin GPURun-agent
sudo chmod +x /usr/local/bin/GPURun-agent

# 3. 创建配置目录
sudo mkdir -p /etc/GPURun

# 4. 编写配置文件
sudo tee /etc/GPURun/agent.yaml <<EOF
agent_id: "$(cat /proc/sys/kernel/random/uuid)"
agent_token: "${AGENT_TOKEN}"
api_url: "https://api.GPURun.cn"
datacenter: "SH-ZJ-01"
listen_addr: ":9090"
state_dir: "/etc/GPURun"
log_level: "info"
ssh:
  concurrent_limit: 20
  connect_timeout: 10
  command_timeout: 60
  preferred_auth: ["publickey", "password"]
  bastion:
    host: ""
    port: "22"
    user: "ops"
    private_key_path: ""
k8s:
  kubeconfig_path: ""
  default_labels:
    "GPURun.io/managed-by": "edge-agent"
    "GPURun.io/datacenter": "SH-ZJ-01"
polling:
  task_interval: 15
  heartbeat_interval: 30
retry:
  max_attempts: 3
  backoff_base: 10
  backoff_max: 300
health:
  ssh_probe_interval: 1800
  ssh_consecutive_fail_max: 3
  node_ready_timeout: 300
EOF

# 5. 注册 systemd 服务
sudo tee /etc/systemd/system/GPURun-agent.service <<EOF
[Unit]
Description=GPURun Edge Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/GPURun-agent --config /etc/GPURun/agent.yaml
Restart=always
RestartSec=10
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

# 6. 启动
sudo systemctl daemon-reload
sudo systemctl enable --now GPURun-agent
```

### 3.3 本地编译安装

```bash
cd goes/proxy
make build            # 编译 amd64
# make build-arm64   # 编译 arm64
sudo cp bin/GPURun-agent /usr/local/bin/
```

---

## 4. 配置说明

配置文件路径：`/etc/GPURun/agent.yaml`

### 4.1 基础配置

```yaml
agent_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"  # Agent 唯一标识
agent_token: "oat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"  # 平台下发的 Token
api_url: "https://api.GPURun.cn"                  # 平台 API 地址
datacenter: "SH-ZJ-01"                               # 机房编码
listen_addr: ":9090"                                  # 本地 HTTP 监听地址
state_dir: "/etc/GPURun"                           # 状态存储目录（SQLite）
```

### 4.2 日志配置

```yaml
log_level: "info"   # debug / info / warn / error
log_file: ""        # 空 = 仅 stdout（由 systemd journal 管理）
```

### 4.3 SSH 配置

```yaml
ssh:
  concurrent_limit: 20        # 最大并发 SSH 连接数
  connect_timeout: 10         # SSH 连接超时（秒）
  command_timeout: 60         # 命令执行超时（秒）
  preferred_auth:             # 认证方式优先级
    - "publickey"
    - "password"
  bastion:                    # 跳板机配置（可选）
    host: ""                  # 跳板机地址，空 = 不使用跳板机
    port: "22"
    user: "ops"
    private_key_path: "/etc/GPURun/bastion_key"
```

### 4.4 K8s 配置

```yaml
k8s:
  kubeconfig_path: "/etc/GPURun/kubeconfig"  # kubeconfig 路径，空 = 自动检测
  default_labels:                                # Node 默认标签
    "GPURun.io/managed-by": "edge-agent"
    "GPURun.io/datacenter": "sh-zj-01"
```

### 4.5 轮询配置

```yaml
polling:
  task_interval: 15         # 任务拉取间隔（秒）
  heartbeat_interval: 30    # 心跳上报间隔（秒）
```

### 4.6 重试配置

```yaml
retry:
  max_attempts: 3           # 最大重试次数
  backoff_base: 10          # 基础退避时间（秒）
  backoff_max: 300          # 最大退避时间（秒）
```

### 4.7 健康检查配置

```yaml
health:
  ssh_probe_interval: 1800       # SSH 健康检查间隔（秒），0 = 禁用
  ssh_consecutive_fail_max: 3    # 连续失败阈值，达到后标记 degraded
  node_ready_timeout: 300        # K8s Node Ready 等待超时（秒）
```

---

## 5. 服务管理

### 5.1 常用命令

```bash
# 查看状态
sudo systemctl status GPURun-agent

# 启动/停止/重启
sudo systemctl start GPURun-agent
sudo systemctl stop GPURun-agent
sudo systemctl restart GPURun-agent

# 查看日志
sudo journalctl -u GPURun-agent -f              # 实时日志
sudo journalctl -u GPURun-agent -n 100           # 最近 100 行
sudo journalctl -u GPURun-agent --since "1h ago" # 最近 1 小时

# 开机自启
sudo systemctl enable GPURun-agent
sudo systemctl disable GPURun-agent
```

### 5.2 本地健康检查

```bash
curl http://localhost:9090/health
```

响应示例：

```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": "2h30m15s",
  "task_queue": 0,
  "k8s_reachable": false,
  "devices": 12
}
```

### 5.3 验证注册状态

```bash
# 查看 Agent 日志中的注册信息
sudo journalctl -u GPURun-agent | grep "registered"

# 正常应看到：
# {"msg":"registered with platform","heartbeat_interval":30}
```

---

## 6. 跳板机配置

当 GPU 设备仅有内网 IP 且无直连路径时，配置跳板机：

```yaml
ssh:
  bastion:
    host: "10.0.0.1"                        # 跳板机内网 IP
    port: "22"
    user: "ops"
    private_key_path: "/etc/GPURun/bastion_key"
```

**准备跳板机密钥：**

```bash
# 生成密钥对
ssh-keygen -t ed25519 -f /etc/GPURun/bastion_key -N ""

# 将公钥部署到跳板机
ssh-copy-id -i /etc/GPURun/bastion_key.pub ops@10.0.0.1
```

**跳板机网络要求：**

- 管控节点 → 跳板机：SSH 可达
- 跳板机 → 所有 GPU 设备：SSH 可达（内网）

---

## 7. 升级

### 7.1 自动升级

Agent 启动时自动检查新版本。如需禁用，移除 `--check-update` 标志或修改配置。

### 7.2 手动升级

```bash
# 停止服务
sudo systemctl stop GPURun-agent

# 下载新版本
VERSION="1.1.0"
curl -fsSL "https://agent.GPURun.cn/api/agent/downloads/${VERSION}/GPURun-agent-linux-amd64.tar.gz" \
  -o /tmp/GPURun-agent.tar.gz

# 替换二进制
sudo tar xzf /tmp/GPURun-agent.tar.gz -C /usr/local/bin GPURun-agent
sudo chmod +x /usr/local/bin/GPURun-agent

# 重启
sudo systemctl start GPURun-agent
```

### 7.3 卸载

```bash
sudo systemctl stop GPURun-agent
sudo systemctl disable GPURun-agent
sudo rm /etc/systemd/system/GPURun-agent.service
sudo systemctl daemon-reload
sudo rm /usr/local/bin/GPURun-agent
sudo rm -rf /etc/GPURun
```

---

## 8. 数据目录

| 路径 | 说明 |
|------|------|
| `/usr/local/bin/GPURun-agent` | 二进制文件 |
| `/etc/GPURun/agent.yaml` | 配置文件 |
| `/etc/GPURun/state.db` | SQLite 状态库 |
| `/etc/systemd/system/GPURun-agent.service` | systemd 服务文件 |

### SQLite 数据库说明

`state.db` 包含以下表：

| 表名 | 说明 |
|------|------|
| `tasks` | 任务队列（pending/running/completed/failed） |
| `device_cache` | 设备信息缓存（SN、IP、GPU 型号/数量） |
| `audit_log` | 操作审计日志 |

**手动查看数据库：**

```bash
sudo apt install sqlite3
sqlite3 /etc/GPURun/state.db

# 查看待执行任务
SELECT id, type, status, created_at FROM tasks WHERE status IN ('pending', 'running');

# 查看设备缓存
SELECT sn, internal_ip, gpu_type, gpu_count FROM device_cache;

# 查看审计日志
SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 20;
```

---

## 9. 安全注意事项

1. **Agent Token**：一次性使用，注册后即废弃。后续通信使用 JWT access_token（24h 有效期）
2. **SSH 凭据**：由平台加密传输（AES-256-GCM），Agent 内存中解密使用，不落盘
3. **本地存储**：SQLite 仅存储任务状态和设备缓存，不存储明文密码
4. **网络通信**：所有平台 ↔ Agent 通信通过 HTTPS（TLS 1.3）
5. **最小权限**：管控节点仅需出站 443 端口，无需开放入站端口
