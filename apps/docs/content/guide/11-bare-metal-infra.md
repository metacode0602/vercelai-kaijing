# 第十一章：裸金属基础设施

> 裸金属短租是平台的核心产品线之一。本章覆盖裸金属设备的 SSH 访问控制、设备角色分配、资源池管理、IPMI 集成、以及订单生命周期基础设施。
>
> **关联设计**: `design/cloud/idle-compute-gateway-network.md` — 闲时算力网关与网络接入模型（完整站点拓扑与多产品形态分析）

---

## 11.1 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                    中心集群                                   │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ SSH Gateway   │  │ 裸金属订单    │  │ 计费 CronJob      │  │
│  │ (访问控制)    │  │ (tRPC API)   │  │ (续费/逾期)       │  │
│  └──────┬───────┘  └──────────────┘  └──────────────────┘  │
│         │                                                    │
└─────────┼────────────────────────────────────────────────────┘
          │ SSH 代理
          ▼
┌─────────────────────────────────────────────────────────────┐
│              IDC-A 跳板机 (Edge Agent)                        │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │ Agent    │  │ ipmitool │  │ btrfs    │                  │
│  │ (任务)   │  │ (IPMI)   │  │ (快照)   │                  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                  │
│       │              │              │                        │
└───────┼──────────────┼──────────────┼────────────────────────┘
        │              │              │
        ▼              ▼              ▼
┌──────────┐  ┌──────────┐  ┌──────────┐
│ 裸金属 #1 │  │ 裸金属 #2 │  │ 裸金属 #3 │
│ (用户#1)  │  │ (空闲)   │  │ (维护中)  │
│ Btrfs     │  │ Btrfs    │  │ Btrfs    │
│ IPMI/BMC  │  │ IPMI/BMC │  │ IPMI/BMC │
└──────────┘  └──────────┘  └──────────┘
```

---

> 闲时算力机房交付清单见 `../../../supplier/content/guide/supplier-idc-provisioning-checklist.md`；网关实施方案见 `../../../docs/design/cloud/idle-compute-gateway-network.md` §八。

## 11.2 SSH Gateway 部署

SSH 网关是裸金属设备控制的核心基础设施。所有用户 SSH 连接必须经过网关，平台才能在网络层 revoke 访问。

### 11.2.1 部署架构

```
用户 SSH 客户端
  │
  │ ssh -p 2222 user@ssh-gw.platform.com
  ▼
┌─────────────────────────────────┐
│        SSH Gateway (中心集群)     │
│                                 │
│  1. 验证用户身份（JWT Token）     │
│  2. 检查订单状态（是否有权访问）   │
│  3. 代理连接到目标设备            │
│  4. 会话录制（合规审计）          │
│                                 │
│  端口: 2222 (用户入口)           │
│        22   (转发到设备)         │
└───────────────┬─────────────────┘
                │ 内部网络
                ▼
┌─────────────────────────────────┐
│     裸金属设备 (IDC 内部网络)     │
│  IP: 10.0.1.101                │
│  Port: 22                       │
└─────────────────────────────────┘
```

### 11.2.2 部署 SSH Gateway

```bash
# 在中心集群部署 SSH Gateway
cat <<EOF | kubectl --kubeconfig=$CENTRAL_KUBECONFIG apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ssh-gateway
  namespace: GPURun-system
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ssh-gateway
  template:
    metadata:
      labels:
        app: ssh-gateway
    spec:
      containers:
      - name: ssh-gw
        image: ${SSH_GW_IMAGE}:latest
        ports:
        - containerPort: 2222
          name: user-ssh
        env:
        - name: DB_HOST
          value: "${DB_HOST}"
        - name: DB_PORT
          value: "${DB_PORT}"
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: ssh-gw-secret
              key: jwt-secret
        resources:
          limits:
            cpu: "2"
            memory: 2Gi
          requests:
            cpu: "1"
            memory: 512Mi
---
apiVersion: v1
kind: Service
metadata:
  name: ssh-gateway
  namespace: GPURun-system
spec:
  type: LoadBalancer
  ports:
  - port: 2222
    targetPort: 2222
    name: ssh
  selector:
    app: ssh-gateway
EOF
```

### 11.2.3 用户 SSH 连接流程

```bash
# 1. 用户在平台获取 SSH 连接信息
# 平台返回: ssh-gw.platform.com:2222, token, 设备 IP

# 2. 用户使用 Token 连接
ssh -p 2222 -o StrictHostKeyChecking=no \
  user@ssh-gw.platform.com \
  -o ProxyCommand="ssh-gw-proxy --token=<JWT_TOKEN> --target=10.0.1.101"

# 3. SSH Gateway 验证流程:
#    a. 验证 JWT Token 有效性
#    b. 检查 Token 关联的订单状态 (running?)
#    c. 检查设备是否属于该订单
#    d. 代理 SSH 连接到目标设备
#    e. 开始会话录制
```

### 11.2.4 平台 Revoke 访问

```bash
# 逾期/取消时，平台调用 SSH Gateway API 撤销用户访问
curl -X DELETE https://api.platform.com/api/ssh-gw/access \
  -H "Authorization: Bearer <PLATFORM_TOKEN>" \
  -d '{
    "userId": "tenant-xxx",
    "deviceId": "sd-xxx",
    "reason": "order_expired"
  }'

# Gateway 立即:
# 1. 断开该用户到该设备的所有活跃 SSH 连接
# 2. 撤销该用户的 JWT Token
# 3. 用户无法再建立新连接
```

---

## 11.3 设备角色与资源池

### 11.3.1 设备角色定义

每台裸金属设备入库时分配角色，决定其产品线归属：

| 角色 | 说明 | GPU 可售 | 池归属 | 可切换？ |
|------|------|---------|--------|---------|
| `compute` | 纯 K8s 容器 GPU 工作负载 | ✅ | elastic (固定) | ❌ |
| `bare_metal` | 纯裸金属整机租用 | ✅ | dedicated (固定) | ❌ |
| `convertible` | K8s ↔ 裸金属动态切换 | ✅ | elastic ↔ dedicated | ✅ 双向 |
| `control_plane` | 管理节点 + 可选 GPU 复用 | 有条件 | elastic (低优先级) | ❌ |

### 11.3.2 设备入库时分配角色

```bash
# Agent 入库时，根据平台指令分配角色
# device_onboard 任务 payload 中指定 role:

# K8s 计算节点
{
  "type": "device_onboard",
  "payload": {
    "role": "compute",
    "device_sn": "SN2026A10001",
    "internal_ip": "10.0.1.101",
    ...
  }
}

# 裸金属设备
{
  "type": "device_onboard",
  "payload": {
    "role": "bare_metal",
    "device_sn": "SN2026A10002",
    "internal_ip": "10.0.1.102",
    ...
  }
}

# 可转换设备（默认 elastic，可切换到 dedicated）
{
  "type": "device_onboard",
  "payload": {
    "role": "convertible",
    "device_sn": "SN2026A10003",
    "internal_ip": "10.0.1.103",
    ...
  }
}
```

### 11.3.3 资源池配置

```sql
-- dedicated_pool: 裸金属专用池
INSERT INTO resource_pool (id, name, pool_type, data_center_id, bare_metal_mode)
VALUES ('pool-ded-001', '裸金属专用池', 'dedicated', 'dc-beijing-01', 'gateway_direct');

-- elastic_pool: K8s 弹性池
INSERT INTO resource_pool (id, name, pool_type, data_center_id)
VALUES ('pool-ela-001', 'K8s 弹性池', 'elastic', 'dc-beijing-01');
```

---

## 11.4 设备控制（IPMI/BMC 可选 + 人工收回）

### 11.4.1 控制手段分层

不是所有 IDC 都提供 IPMI/BMC 接口。平台支持分层递进的设备控制：

| 层级 | 控制手段 | 适用条件 | 可靠性 |
|------|---------|---------|--------|
| **L1** | SSH 网关 revoke | 所有设备 | ✅ 最高（网络层控制） |
| **L2** | Agent device_stop | Agent 在线 | ✅ 高 |
| **L3** | IPMI 硬关机 | 设备有 BMC 接口 | ⚠️ 中（BMC 可能不可达） |
| **L4** | IDC 运维人工收回 | 所有设备（兜底） | ⚠️ 低（依赖人工响应） |

**关键原则**：L1（SSH 网关 revoke）是所有设备的**必备控制手段**，不需要 BMC。revoke 后用户无法登录，设备处于"软件隔离"状态。

### 11.4.2 逾期处理流程（含 IPMI 可选）

```
Agent device_stop 失败（5 分钟超时）
  │
  ▼
平台标记订单为 'locked'
  │
  ├── 1. SSH 网关 revoke（已完成，用户无法登录）
  │
  ├── 2. Agent 重试（再等 5 分钟）
  │
  ├── 3. Agent 仍然失败
  │   │
  │   ├── [有 BMC] → IPMI 硬关机
  │   │   ipmitool -H <bmc-ip> -U <user> -P <pass> power off
  │   │   │
  │   │   ├── IPMI 成功 → 设备关机 → Btrfs 还原
  │   │   │
  │   │   └── IPMI 失败 → 降级到 L4
  │   │
  │   └── [无 BMC] → 直接降级到 L4
  │
  └── 4. L4: 通知 IDC 运维人工收回
      │
      ├── 平台发送工单到 IDC 运维
      ├── IDC 运维物理断电/关机
      ├── IDC 运维确认设备已收回
      └── 平台执行 Btrfs 还原
```

### 11.4.3 IDC 运维人工收回流程

当设备无 BMC 或 IPMI 失败时，触发人工收回：

```
┌─────────────────────────────────────────────────────┐
│  1. 平台自动创建工单                                  │
│  ├── 工单类型: 裸金属逾期收回                          │
│  ├── 包含: 设备 SN、IP、机房位置、逾期时长              │
│  ├── 通知: IDC 运维群（飞书/钉钉）                     │
│  └── 紧急程度: 高（设备仍占用中）                       │
├─────────────────────────────────────────────────────┤
│  2. IDC 运维执行物理收回                               │
│  ├── 到机房找到设备                                   │
│  ├── 物理断电（拔电源线）                              │
│  ├── 确认设备已关机                                   │
│  └── 在工单中确认收回                                  │
├─────────────────────────────────────────────────────┤
│  3. 平台执行设备还原                                   │
│  ├── Agent 重新连接设备（设备关机后重启）               │
│  ├── 执行 Btrfs 还原脚本                              │
│  ├── 凭据轮换                                        │
│  └── 设备进入可分配池                                  │
├─────────────────────────────────────────────────────┤
│  4. 租户赔付                                          │
│  ├── 逾期未归还设备 → 等额赔付                         │
│  ├── 赔付金额 = 设备价值 × 逾期天数 × 赔付比例          │
│  ├── 从租户余额中扣除                                 │
│  └── 记录到 bare_metal_order_log (repossession)        │
└─────────────────────────────────────────────────────┘
```

### 11.4.4 IPMI 操作命令（有 BMC 时使用）

```bash
# 查询电源状态
ipmitool -H <bmc-ip> -U <user> -P <pass> power status

# 硬关机
ipmitool -H <bmc-ip> -U <user> -P <pass> power off

# 硬重启
ipmitool -H <bmc-ip> -U <user> -P <pass> power reset

# 开机
ipmitool -H <bmc-ip> -U <user> -P <pass> power on

# 查看硬件健康（温度、风扇、电压）
ipmitool -H <bmc-ip> -U <user> -P <pass> sdr list

# 查看系统事件日志
ipmitool -H <bmc-ip> -U <user> -P <pass> sel list
```

### 11.4.5 平台集成（BMC 可选）

```sql
-- 设备 BMC 信息表（仅有 BMC 的设备才写入）
CREATE TABLE supplier_device_bmc (
    id              TEXT PRIMARY KEY,
    device_id       TEXT NOT NULL REFERENCES supplier_device(id) UNIQUE,
    bmc_ip          VARCHAR(45) NOT NULL,
    bmc_user        VARCHAR(128) NOT NULL,
    bmc_password    TEXT NOT NULL,        -- 加密存储
    bmc_type        VARCHAR(32) NOT NULL, -- ipmi / idrac / ilo
    capabilities    JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
```

设备表增加 `has_bmc` 字段标识：

```sql
ALTER TABLE supplier_device ADD COLUMN has_bmc BOOLEAN NOT NULL DEFAULT false;
```

### 11.4.6 赔付机制

```sql
-- 逾期赔付记录
CREATE TABLE bare_metal_repossession (
    id              TEXT PRIMARY KEY,
    order_id        TEXT NOT NULL REFERENCES bare_metal_order(id),
    device_id       TEXT NOT NULL REFERENCES supplier_device(id),
    repossession_type VARCHAR(32) NOT NULL,  -- ipmi / manual / hybrid
    device_value    NUMERIC(15,4) NOT NULL,  -- 设备价值
    overdue_days    INTEGER NOT NULL,         -- 逾期天数
    penalty_rate    NUMERIC(5,4) NOT NULL,    -- 赔付比例 (如 0.01 = 1%/天)
    penalty_amount  NUMERIC(15,4) NOT NULL,   -- 赔付金额
    occurred_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    confirmed_by    TEXT,                     -- IDC 运维确认人
    remark          TEXT
);
```

---

## 11.5 Btrfs 快照管理

### 11.5.1 快照生命周期

```
设备入库
  │
  ▼
创建 @base + 模板快照（一次性，~15 分钟）
  │
  ▼
用户下单 → 从模板创建 @inst-{id}（秒级）
  │
  ▼
用户训练（写入仅在 @inst-{id} subvolume）
  │
  ▼
退租/逾期 → 删除 @inst-{id} + 重建模板（秒级）
  │
  ▼
设备回到可分配状态
```

### 11.5.2 快照空间管理

```bash
# 查看 Btrfs 空间使用
btrfs filesystem usage /mnt/system

# 查看各 subvolume 大小
btrfs subvolume list -s /mnt/system

# 设置用户实例空间限制（qgroup）
btrfs qgroup create 1/100 /mnt/system
btrfs qgroup limit 200G 1/100 /mnt/system/@inst-{id}

# 清理已删除 subvolume 的碎片
btrfs filesystem defragment -r /mnt/system
```

---

## 11.6 裸金属订单生命周期

### 11.6.1 订单状态机

```
[*] --> pending: 用户下单（余额充足）
[*] --> reserved: 用户下单（余额充足，设备不足）

pending --> running: 自动交付（设备可用 + Agent 确认）
pending --> cancelled: 交付失败

reserved --> running: 运营手动交付
reserved --> cancelled: 取消/超时

running --> stopping: 用户停机 / 平台逾期
running --> expired: 不续费到期

stopping --> stopped: Agent 确认关机

stopped --> running: 用户续费开机
stopped --> expired: 到期

expired --> released: 设备还原完成（Btrfs 删除 subvolume）
```

### 11.6.2 自动续费 CronJob

```yaml
# 每分钟扫描需要续费的订单
apiVersion: batch/v1
kind: CronJob
metadata:
  name: bare-metal-auto-renew
  namespace: GPURun-system
spec:
  schedule: "*/1 * * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: renew-scanner
            image: ${GPURun_IMAGE}:latest
            command: ["node", "scripts/bare-metal-renew-scanner.js"]
            env:
            - name: DB_HOST
              value: "${DB_HOST}"
          restartPolicy: Never
```

### 11.6.3 逾期处理 CronJob

```yaml
# 每分钟扫描逾期订单
apiVersion: batch/v1
kind: CronJob
metadata:
  name: bare-metal-overdue-scanner
  namespace: GPURun-system
spec:
  schedule: "*/1 * * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: overdue-scanner
            image: ${GPURun_IMAGE}:latest
            command: ["node", "scripts/bare-metal-overdue-scanner.js"]
            env:
            - name: DB_HOST
              value: "${DB_HOST}"
          restartPolicy: Never
```

---

## 11.7 监控裸金属硬件

### 11.7.1 IPMI Exporter

```bash
# 在每个 IDC 部署 ipmi_exporter
helm install ipmi-exporter prometheus-community/ipmi-exporter \
  --namespace monitoring \
  --kubeconfig=$IDC_KUBECONFIG \
  --set "extraScrapeConfigs[0].targets[0]=10.0.1.101" \
  --set "extraScrapeConfigs[0].targets[0]=10.0.1.102"
```

### 11.7.2 裸金属监控指标

| 指标 | 说明 | 告警阈值 |
|------|------|---------|
| `ipmi_power_consumption_watts` | 功耗 | > 1500W |
| `ipmi_fan_speed_rpm` | 风扇转速 | < 1000RPM |
| `ipmi_temperature_celsius` | 温度 | > 85°C |
| `ipmi_voltage_volts` | 电压 | 偏差 > 5% |
| `ipmi_power_state` | 电源状态 | 0 (off) |
| `node_disk_smart_healthy` | 磁盘健康 | 0 (不健康) |

---

## 11.8 验证检查清单

| 检查项 | 命令 | 预期结果 |
|--------|------|---------|
| SSH Gateway 运行 | `kubectl get pods -n GPURun-system -l app=ssh-gw` | Running |
| SSH Gateway 连通 | `ssh -p 2222 user@ssh-gw.platform.com` | 连接成功 |
| SSH Revoke 生效 | 平台调用 DELETE /api/ssh-gw/access | 连接断开 |
| Btrfs 快照完整 | `btrfs subvolume list /mnt/system` | @base + 模板存在 |
| IPMI 连通 | `ipmitool -H <bmc> power status` | Power is on |
| 设备角色正确 | 平台查看 supplier_device.role | bare_metal / compute |
| 资源池正确 | 平台查看 resource_pool | dedicated / elastic |
| 自动续费 CronJob | `kubectl get cronjob -n GPURun-system` | Running |
| 逾期 CronJob | `kubectl get cronjob -n GPURun-system` | Running |
| IPMI Exporter | `kubectl get pods -n monitoring -l app=ipmi-exporter` | Running |
