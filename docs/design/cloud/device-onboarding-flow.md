# 设备纳管全流程与资源池自动化处理

> 版本: 1.0 | 日期: 2026-07-22
> 状态: 设计稿
> 关联设计: `procurement-to-onboarding-closed-loop.md`（采购上架闭环 — 上游衔接）、`idle-compute-gateway-network.md`（闲时算力网关与网络接入模型）、`idc-auto-onboarding-design.md`（供应商接入流程）、`idc-edge-agent-design.md`（Edge Agent）、`idc-auto-onboarding-implementation.md`（自动纳管实现）、`resource-pool-optimization.md`（资源池调度引擎）、`../../../apps/supplier/content/guide/supplier-idc-provisioning-checklist.md`（机房交付）、`idle-compute-gateway-network.md` §八（GW 实施方案）
> 实现: `apps/supplier/`（供应商门户）、`apps/web/`（运营平台）、`goes/proxy/`（Go Edge Agent）

---

## 一、概述

本文档描述设备从供应商上报到资源池上架的**完整数据流与控制流**，串联三个子系统：

| 子系统 | 角色 | 职责 |
|--------|------|------|
| **`apps/supplier`** | 供应商门户 | 注册 → 创建机房 → 上传设备批次 → 查看接入状态 |
| **`apps/web`** | 运营平台 | 审核设备 → 设定上架策略 → 触发自动化流水线 → 资源池调度 |
| **`goes/proxy`** | Go Edge Agent | 部署在各 IDC 机房，执行 SSH 验证→GPU 检测→环境初始化→K8s Join→标签污点 |

### 1.1 与现有设计的关系

| 现有设计文档 | 本文档覆盖 |
|------------|----------|
| `idc-auto-onboarding-design.md` | 供应商视角接入流程（已设计），本文档补充**运营审核与策略设定**环节 |
| `idc-edge-agent-design.md` | Edge Agent 架构（已实现 `goes/proxy`），本文档定义**平台侧 API 与任务调度** |
| `idc-auto-onboarding-implementation.md` | 自动纳管实现（设计稿），本文档补充**流水线状态机与错误恢复** |
| `resource-pool-optimization.md` | 调度引擎设计，本文档定义**设备上线 → 调度评估的衔接** |


### 1.2 关键设计决策：四种设备角色

一个 IDC 机房内的设备，在**池归属可变性**和**GPU 复用策略**两个维度上形成四种角色：

```
                    池归属可变？
                   │  否（固定）        │  是（可切换）
─────┬─────────────┼───────────────────┼────────────────────
 GPU │ 参与出售     │ compute           │ convertible
     │             │ (弹性池专属)       │ (弹性池 ↔ 专属池)
     ├─────────────┼───────────────────┼────────────────────
     │ 不参与出售   │ bare_metal        │ control_plane
     │ 或条件复用   │ (专属池专属)       │ (管控面 GPU 复用)
─────┴─────────────┴───────────────────┴────────────────────
```

| 角色 | 用途 | GPU | 池归属 | 可切换至 | 流水线 | 数量 |
|------|------|-----|--------|---------|--------|------|
| **`compute`** | 纯容器化 GPU 工作负载 | ✅ 出售 | elastic（固定） | — | 标准 5 阶段 | 数十~数百 |
| **`bare_metal`** | 纯裸金属整机出租 | ✅ 出售 | dedicated（固定） | — | 简化（可能跳过 K8s） | 数台~数十 |
| **`convertible`** | 容器 ↔ 裸金属动态切换 | ✅ 出售 | elastic ↔ dedicated | 双向互转 | 标准 5 阶段（含双池注册） | 数台~数十 |
| **`control_plane`** | 管控节点 + 可选 GPU 复用 | ⚠️ 条件复用 | elastic（低优） | — | 管控节点初始化 | 1-3/机房 |

**混在一起会导致的问题**：
+- 管控节点和计算节点混在一起 → 平台不知道哪些需要安装 K8s 控制面组件，哪些只装 kubelet
+- 计算节点和裸金属节点混在一起 → 池归属错误（dedicated 池的裸金属被当成 elastic 池的容器节点）
+- 可切换设备与固定设备混在一起 → 调度引擎在裸金属订单到来时不知道哪些设备可以安全迁移

因此，**批次创建时必须显式指定 `device_role`**：

```sql
ALTER TABLE supplier_device
    ADD COLUMN device_role VARCHAR(16) NOT NULL DEFAULT 'compute';
    -- control_plane | compute | bare_metal | convertible
```

| device_role | 批次约束 | 上线后 ops_status | 池归属 |
|------------|---------|------------------|--------|
| `control_plane` | 无需批次（运营直接配置） | `集群组件运行中` | elastic（低优，见 §1.4） |
| `compute` | cooperation_type 必须一致，network_mode 必须一致 | `在集群中` | elastic |
| `convertible` | cooperation_type 必须一致，network_mode 必须一致；需指定 bare_metal_mode | `在集群中`（初始） ↔ 按 bare_metal_mode 切换裸金属状态 | elastic ↔ dedicated |
| `bare_metal` | 需指定 bare_metal_mode | 依模式而定 | dedicated |
---

### 1.3 场景一：K8s ↔ 裸金属互转（convertible 角色）

#### 1.3.1 设计原则：network_mode 与 bare_metal_mode 正交

`network_mode`（GPU 互联拓扑：standalone/nvlink/infiniband/roce）与 `bare_metal_mode`（租户接入方式：gateway_proxy/gateway_direct/direct）是**两个正交维度**：

```
                    bare_metal_mode（租户如何接入）
                    │ gateway_proxy  │ gateway_direct │ direct
─────┬──────────────┼────────────────┼────────────────┼──────────
 net │ standalone   │ ✅ 可切换       │ ✅ 可切换       │ ✅ 可切换(需公网IP)
 wo  │ nvlink       │ ✅ 可切换       │ ✅ 可切换       │ ✅ 可切换(需公网IP)
 rk  │ infiniband   │ ✅ 可切换       │ ✅ 可切换       │ ✅ 可切换(需公网IP)
 _mo │ roce         │ ✅ 可切换       │ ✅ 可切换       │ ✅ 可切换(需公网IP)
 de  │              │                │                │
─────┴──────────────┴────────────────┴────────────────┴──────────
```

- **弹性池阶段**：设备使用 `network_mode` 配置 K8s 节点标签（如 `nvidia.com/nvlink=enabled`），GPU 拓扑信息影响 NCCL 通信模式和 Volcano 调度决策
- **专属池阶段**：设备使用 `bare_metal_mode` 决定租户如何 SSH 到设备——通过平台网关代理（`gateway_proxy`）、网关端口转发（`gateway_direct`）或直连 IP（`direct`）
- **切换时**：Edge Agent 执行 drain → cordon → 更新 ops_status → 按 bare_metal_mode 配置暴露方式。设备已在网关可达范围内（Agent 就是通过 SSH 纳管的），三种接入方式均可动态切换

#### 1.3.2 互转前置条件

| 条件 | 检查方式 | 不满足则 |
|------|---------|---------|
| device_role = `convertible` | 供应商在 Excel 中显式选择 | 归类为 `compute` 或 `bare_metal`（不可切换） |
| GPU 卡型有对应的 `platform_card_price_record`（容器 + 裸金属双产品线定价） | 运营审核时校验 | 驳回并要求补充定价 |
| 设备已在 K8s 集群中正常运行（k8s channel probed OK） | device-platform-probe 校验 | 先完成 compute 角色上线后再转为 convertible |
| 若 bare_metal_mode = `direct`：设备有租户可直连的 IP | 运营审核时确认 | 要求供应商提供公网 IP 或 VPN 方案，或改选 gateway 模式 |

```
elastic ──────────────────────▶ dedicated
（容器工作负载）                  （裸金属出租）

触发: 用户下单裸金属，选中此设备
  → 检查设备当前是否有不可驱逐的工作负载（非 spot、非 interruptible）
    → 有 → 拒绝转换，选择其他设备
    → 无 → 执行转换流程

dedicated ────────────────────▶ elastic
（裸金属出租中）                  （容器工作负载）

触发: 裸金属订单到期释放（rentEndsAt < NOW()）
  或 运营手动触发回收
  → 无需迁移（裸金属已释放）
  → Karmada uncordon → 重新加入弹性池
```

#### 1.3.4 转换流程（elastic → dedicated）

```
用户下单裸金属，选中 convertible 设备
  │
  ▼
┌──────────────────────────────────────────────┐
│ Pre-flight check                             │
│  1. 设备 role = convertible?                 │
│  2. 设备上无可驱逐的 on_demand 负载？          │
│     - job(spot) / serverless(interruptible)   │
│       → 可迁移 ✓                              │
│     - cloud_vm / inference / on_demand job    │
│       → 不可迁移 ✗ → 拒绝转换                  │
│  3. 目标租户 tier 满足最低要求？               │
└──────────────┬───────────────────────────────┘
               │ ✓ 全部通过
               ▼
┌──────────────────────────────────────────────┐
│ 1. 通知受影响租户（tenant_notification）       │
│    - job(spot) → checkpoint + 通知重试         │
│    - serverless(interruptible) → 迁移到其他机房 │
│ 2. 等待 drain_grace 期（120s）                 │
└──────────────┬───────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────┐
│ 3. Karmada drain node → cordon                │
│ 4. 更新 ops_status → '网关代理裸金属上架中'     │
│    (pool_memberships 从 [elastic_service]      │
│     变为 [bare_metal, elastic_service])        │
│ 5. 创建 bare_metal_order + 分配设备            │
│ 6. 调度引擎重新评估 → pool=dedicated           │
└──────────────────────────────────────────────┘
```

#### 1.3.5 转换流程（dedicated → elastic）

```
裸金属订单到期释放 / 运营手动回收
  │
  ▼
┌──────────────────────────────────────────────┐
│ 1. 释放 bare_metal_order_device               │
│    allocationStatus = 'released'              │
│ 2. Karmada uncordon node                      │
│ 3. 更新 ops_status → '在集群中'                │
│ 4. 调度引擎重新评估 → pool=elastic             │
│ 5. supplier_gpu_inventory.online_quantity += N │
└──────────────────────────────────────────────┘
```

#### 1.3.6 转换状态追踪

在 `supplier_device_change_log` 中记录每次互转：

```sql
-- change_action 新增:
--   '弹性池转裸金属' — elastic → dedicated 开始
--   '裸金属转弹性池' — dedicated → elastic 完成
```

---

### 1.4 场景二：管控节点 GPU 复用（control_plane 角色）

#### 1.4.1 问题

管控节点通常配备少量 GPU（如 2-4×A100），这些 GPU 在 `集群组件运行中` 状态下属于 `ELASTIC_POOL_OPS` 但被 control-plane taint 阻止调度，实际闲置。**每机房浪费 2-24 卡 GPU。**

#### 1.4.2 复用策略

管控节点 GPU 复用遵循 **"兜底不争先"** 原则——仅在弹性池主容量不足时作为补充，且严格控制资源配额以保证管控组件稳定。

```
管控节点 GPU 复用层次:

┌─────────────────────────────────────────────┐
│ 管控组件资源预留（不可触碰）                   │
│  CPU: 4C  |  Memory: 16GB  |  GPU: 0        │
│  (API Server, etcd, Edge Agent, etc.)       │
├─────────────────────────────────────────────┤
│ 低优可出让 GPU（spot/batch 可调度）           │
│  GPU: 全部可用 GPU                            │
│  PriorityClass: spot-low                     │
│  Taint: GPURun.cloud/role=control-plane   │
│         :NoSchedule                          │
│  Toleration: 仅 spot-low / batch-low         │
│         PriorityClass 的 Pod 可容忍           │
├─────────────────────────────────────────────┤
│ 紧急腾空（控制面压力过大时立即驱逐）            │
│  监控: CPU > 80% 或 Memory > 80%             │
│  动作: drain 所有租户 GPU 工作负载             │
│  通知: 30s 抢占通知                           │
└─────────────────────────────────────────────┘
```

#### 1.4.3 配置方式

运营在控制面节点上线后，在自动上架配置页面设定 `gpu_reuse_policy`：

```typescript
interface ControlPlaneGpuReusePolicy {
  enabled: boolean
  reservedCpuCores: number        // 默认 4
  reservedMemoryGb: number        // 默认 16
  maxReusableGpuCount: number     // 最多复用多少 GPU（默认全部）
  maxGpuMemoryPercent: number     // GPU 显存上限百分比（默认 80%）
  allowedPriorityClasses: string[] // 默认 ['spot-low', 'batch-low']
  evictionCpuPercent: number      // 默认 80
  evictionMemoryPercent: number   // 默认 80
  evictionNoticeSeconds: number   // 默认 30
}
```

#### 1.4.4 纳管标签

控制面节点在流水线 `gpu_label` 阶段应用特殊标签和污点：

```yaml
# 应用于控制面节点（仅当 gpu_reuse_policy.enabled = true）
labels:
  GPURun.cloud/role: "control-plane"
  GPURun.cloud/gpu-reuse: "enabled"
  GPURun.cloud/pool: "elastic"
  GPURun.cloud/priority-class: "spot-low"

taints:
  - key: GPURun.cloud/role
    value: control-plane
    effect: NoSchedule
```

#### 1.4.5 市场表现

管控节点 GPU 在市场上与普通弹性池 GPU **分开展示**：

| 特性 | 普通弹性池 GPU | 管控节点复用 GPU |
|------|--------------|-----------------|
| 市场可见性 | ✅ 始终可见 | ⚠️ 仅弹性池利用率 > 70% 时可见 |
| 可用数量标记 | 标准 | 标注「低优 · 可抢占」 |
| 价格 | 标准价 | 标准价 × 0.7（spot 折扣） |
| 可驱逐 | ❌ on_demand 不可驱逐 | ✅ 30s 通知可驱逐 |
| PriorityClass | od-normal / od-high | spot-low |
| 适用产品线 | 全部 | job (spot) / serverless (interruptible) |

#### 1.4.6 监控与自动腾空

```typescript
// apps/web/src/lib/server/scheduling/control-plane-monitor.ts

// 每 30s 检查控制面节点资源压力
async function monitorControlPlaneHealth(nodeId: string) {
  const metrics = await getNodeMetrics(nodeId)
  const policy = await getGpuReusePolicy(nodeId)

  if (metrics.cpuPercent > policy.evictionCpuPercent ||
      metrics.memoryPercent > policy.evictionMemoryPercent) {
    await drainTenantWorkloads(nodeId, policy.evictionNoticeSeconds)
    await notifyOps('control-plane-gpu-eviction', { nodeId, metrics })
  }
}
```

供应商操作指南参见 `apps/web/content/guide/supplier-device-onboarding-user-guide.md`。
---

## 二、流程全景

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         设备纳管全生命周期                                     │
├──────────────┬──────────────────┬─────────────────┬──────────────┬───────────┤
│ apps/supplier│    apps/web       │   goes/proxy    │ Auto-Listing │ marketplace│
│ (供应商门户)  │   (运营平台)       │   (Go Agent)    │  Engine      │ (gpus)    │
├──────────────┼──────────────────┼─────────────────┼──────────────┼───────────┤
│ ① 创建机房    │                  │                 │              │           │
│ ② 创建上架批次 │                  │                 │              │           │
│   上传设备清单  │                  │                 │              │           │
│      │       │                  │                 │              │           │
│      └──────▶│ ③ 运营审核        │                 │              │           │
│              │   校验 SN/IP/规格  │                 │              │           │
│              │   审核通过/驳回    │                 │              │           │
│              │      │           │                 │              │           │
│              │ ④ 设定上架策略     │                 │              │           │
│              │   K8s 组件版本    │                 │              │           │
│              │   存储/网络/标签   │                 │              │           │
│              │   池归属策略       │                 │              │           │
│              │      │           │                 │              │           │
│              │ ⑤ 确认上架         │                 │              │           │
│              │   创建 Agent 任务   │                 │              │           │
│              │      └──────────▶│ ⑥ Agent Polling  │              │           │
│              │                 │   拉取待执行任务    │              │           │
│              │                 │      │           │              │           │
│              │                 │ ⑦ 执行上架流水线     │              │           │
│              │                 │   ssh_verify     │              │           │
│              │                 │   → gpu_detect   │              │           │
│              │                 │   → env_init     │              │           │
│              │                 │   → k8s_join     │              │           │
│              │                 │   → gpu_label    │              │           │
│              │                 │      │           │              │           │
│              │◀────────────────│ ⑧ 上报任务结果      │              │           │
│              │   更新设备状态     │                 │              │           │
│              │   lifecycle=online │                 │             │           │
│              │   ops=在集群中    │                 │             │           │
│              │      │           │                 │             │           │
│              │      └──────────────────────────────────────────│ ⑨ 自动上架  │
│              │                                                │   评估      │
│              │                                                │   probe一致 │
│              │                                                │   +定价已配 │
│              │                                                │      │     │
│              │                                                │ ⑩ lifecycle│
│              │                                                │   =listed  │
│              │                                                │      │     │
│              │                                                │      └──▶│ ⑪ 市场可见
└──────────────┴──────────────────┴─────────────────┴─────────────┴──────────┘
```

---

## 三、阶段详解

### 阶段 1-2 — 供应商上报设备（apps/supplier）

> 此部分设计详见 `idc-auto-onboarding-design.md` §2。本文档仅列出与后序阶段衔接的关键点。

#### 1.1 供应商创建上架批次

**入口**: `apps/supplier/src/app/[locale]/console/devices/batches/`

供应商选择机房 → 设定合作模式 → 上传设备清单（Excel/CSV），系统调用 `createBatch()` 创建 `onboarding_batch` 记录。

**现有实现**: `apps/supplier/src/lib/server/dataaccess/batch.ts:createBatch()`
**缺失**: CSV 解析与逐条设备写入（当前批量创建批次但设备数据通过 `apps/web` 端 device-import 写入）

#### 1.2 设备清单字段

| 字段 | DB 列 | 必填 |
|------|-------|------|
| 设备 SN | `supplier_device.sn` | ✅ 全局唯一 |
| 资产编号 | `supplier_device.asset_no` | — |
| GPU 卡型 | `supplier_device.gpu_card_type_id` | ✅ 关联 `gpu_card_type` |
| GPU 数量 | `supplier_device.gpu_count` | ✅ |
| 内网 IP | `supplier_device.internal_ip` | ✅ |
| 外网 IP | `supplier_device.external_ip` | — |
| 机房编码 | `supplier_device.idc_code` | ✅ |
| 设备用途 | `supplier_device.device_purpose` | — |
| root 用户名 | `supplier_device.login_username` | ✅ Edge Agent SSH 登录 |
| root 密码 | `supplier_device.login_password` | ✅ 加密存储 |

#### 1.3 供应商侧设备实时状态

设备接入后供应商在门户查看实时状态（参考 `idc-auto-onboarding-design.md` §3）：

| 列表列 | 来源 | 示例 |
|--------|------|------|
| 设备 SN | `supplier_device.sn` | SN2026A10001 |
| 在线状态 | `compute_node.lifecycleStatus` | 🟢 在线 |
| 业务类型 | `devicePlatformProbeSnapshot` | 容器服务 + 裸金属 |
| 占用详情 | probe + `bareMetalOrderDevice` + `internalTestHold` | 6/8 GPU 已分配 |
| 可用 GPU | probe allocatable | 2 / 8 |
| 合作模式 | `supplier_device.cooperationType` | 闲时合作 |

---

### 阶段 3 — 运营审核（apps/web）

#### 3.1 审核入口

运营人员登录 `apps/web` → 算力供应链 → 计划批次 → 点击待审核批次

对应路由: `/supplier/online-tasks`
对应组件: `apps/web/src/app/[locale]/(protected)/supplier/_components/planned-batches-content.tsx`

#### 3.2 审核流程

```
供应商上传设备批次
  │  batchStatus = '待接入'
  │  device.review_status = 'pending'
  ▼
┌──────────────────────────────────┐
│ 运营审核设备清单                   │
│                                  │
│ 自动校验:                         │
│  ✓ SN 全局唯一性 (DB 查重)        │
│  ✓ GPU 卡型存在性 (gpu_card_type) │
│  ✓ 规格与合同产能匹配              │
│                                  │
│ 人工审核:                         │
│  ○ IP 段合理性                    │
│  ○ 设备用途合理性                  │
│  ○ 机型与 GPU 数量匹配             │
│                                  │
│ 操作: 逐台通过/驳回 | 批量通过     │
└──────────────┬───────────────────┘
               │
     ┌─────────┴─────────┐
     ▼                   ▼
  审核通过              审核驳回
     │                   │
     │ review_status=     │ review_status=rejected
     │ approved           │ review_remark=驳回原因
     │                   │ → 通知供应商（站内信/飞书）
     ▼                   │ → 供应商修正后重新提交
┌──────────────────────────────────┐
│ 进入阶段 4：设定上架策略           │
└──────────────────────────────────┘
```

#### 3.3 新增字段

`supplier_device` 表中新增审核字段（当前 status 列仅 `lifecycle_status` 与 `ops_status`）：

```sql
ALTER TABLE supplier_device
    ADD COLUMN review_status VARCHAR(16) NOT NULL DEFAULT 'pending',
    -- pending | approved | rejected
    ADD COLUMN review_remark TEXT,
    ADD COLUMN reviewed_by TEXT,
    ADD COLUMN reviewed_at TIMESTAMPTZ;
```

---

### 阶段 4 — 设定上架策略（apps/web）

#### 4.1 策略配置模型

在 `apps/web/src/app/[locale]/(protected)/supplier/auto-onboarding/` 页面已有 UI 框架（mock 数据），需改造为真实 CRUD。

```typescript
// apps/web/src/lib/types/onboarding-policy.ts

export interface DeviceOnboardingPolicy {
  id: string
  name: string                    // 模板名称，如 "标准 H100 推理节点"
  description?: string

  // ── 集群 ──
  karmadaClusterId?: string       // 目标 Karmada Member Cluster
  k8sVersion?: string
  karmadaVersion?: string

  // ── 组件版本 ──
  gpuPlugin: {
    version: string               // NVIDIA GPU Operator 版本
    driverVersion?: string         // 驱动版本
    migEnabled: boolean
    timeSlicingEnabled: boolean
  }
  volcano: { version: string; queueName: string; queueWeight: number }
  capsule?: { version: string; tenantNamespace: string }
  skypilot?: { version: string; regionTag: string }

  // ── 存储 ──
  storage: {
    localSsdMount?: string
    networkMount?: string
    imageCacheEnabled: boolean
  }

  // ── 网络 ──
  network: {
    mode: 'standalone' | 'nvlink' | 'infiniband' | 'roce'
    rdmaEnabled: boolean
  }

  // ── 标签与污点 ──
  labels: Record<string, string>
  taints: Array<{ key: string; value: string; effect: 'NoSchedule' | 'PreferNoSchedule' | 'NoExecute' }>

  // ── 池归属 ──
  poolAssignment: {
    mode: 'auto' | 'manual'
    manualPool?: 'elastic' | 'dedicated' | 'idle'
    manualPriorityClass?: 'od-high' | 'od-normal' | 'od-low' | 'spot'
  }

  // ── 监控 ──
  monitoring: {
    nodeExporterEnabled: boolean
    dcgmExporterEnabled: boolean
  }

  // ── 超时与重试 ──
  sshTimeout: number
  maxRetries: number
  retryInterval: number
}
```

#### 4.2 策略应用流程

运营人员在批次审核通过后：

1. **选择策略模板** — 从已有模板列表中选择（可按机房/GPU 卡型筛选推荐）
2. **批量应用** — 将策略应用到批次中所有设备
3. **按设备微调** — 部分设备可覆盖模板中的特定字段（如手动指定 pool）
4. **预览确认** — 展示生效效果（标签/污点/池归属/集群目标）
5. **确认上架** — 写入 `device_onboarding_policy_batch`，创建 `device_onboarding_task`

#### 4.3 新增表

```sql
-- 上架策略模板表
CREATE TABLE device_onboarding_policy (
    id              TEXT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    description     TEXT,
    policy_json     JSONB NOT NULL DEFAULT '{}',  -- 完整策略 JSON
    created_by      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 策略-批次关联表
CREATE TABLE device_onboarding_policy_batch (
    id          TEXT PRIMARY KEY,
    policy_id   TEXT NOT NULL REFERENCES device_onboarding_policy(id),
    batch_id    TEXT NOT NULL REFERENCES onboarding_batch(id),
    -- 设备级策略覆盖（可选）
    device_overrides JSONB DEFAULT '[]',
    applied_by  TEXT,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 阶段 5 — 创建 Agent 任务 → Edge Agent 执行

#### 5.1 平台侧：创建上架任务

运营确认上架后，`apps/web` 为每台设备创建 `device_onboarding_task`，Agent 通过 Polling 拉取。

```sql
-- 设备上架任务表（Agent 通过 API 拉取）
CREATE TABLE device_onboarding_task (
    id                  TEXT PRIMARY KEY,
    supplier_device_id  TEXT NOT NULL REFERENCES supplier_device(id),
    batch_id            TEXT NOT NULL REFERENCES onboarding_batch(id),
    agent_id            TEXT,               -- 执行该任务的 Edge Agent ID
    policy_json         JSONB NOT NULL,      -- 快照上架策略

    -- 流水线阶段
    stage               VARCHAR(32) NOT NULL DEFAULT 'pending',
    -- pending → ssh_verify → gpu_detect → env_init → k8s_join → gpu_label → completed | failed

    stage_status        VARCHAR(16) NOT NULL DEFAULT 'waiting',
    stage_started_at    TIMESTAMPTZ,
    stage_completed_at  TIMESTAMPTZ,
    stage_error         TEXT,

    retry_count         INTEGER NOT NULL DEFAULT 0,
    max_retries         INTEGER NOT NULL DEFAULT 3,

    -- 编排信息
    payload             JSONB NOT NULL DEFAULT '{}',
    -- { "ip": "10.0.1.101", "username": "root", "password": "***",
    --   "gpu_card_type": "h100-80g", "gpu_count": 8,
    --   "k8s_version": "1.30", "join_command": "kubeadm join ...",
    --   "labels": {...}, "taints": [...] }

    node_name           VARCHAR(255),       -- K8s Node 名称（加入成功后）
    completed_at        TIMESTAMPTZ,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 5.2 Edge Agent 侧：流水线执行

> Edge Agent 架构详见 `idc-edge-agent-design.md`。已实现在 `goes/proxy/internal/engine/engine.go`。

Agent 流水线阶段（与现有 `goes/proxy` 实现对齐）：

```
Agent Polling: GET /api/agent/tasks/pending
  │ 获取 type=device_onboard 的 pending 任务
  ▼
┌──────────────────────────────────────────────────────────┐
│ Stage 1: ssh_verify                                       │
│  - 通过 SSH 连接到 device.internal_ip:22                   │
│  - 验证登录凭据（login_username / login_password）         │
│  - 探测 OS 类型与架构                                      │
│  - 失败 → 重试 → 标记 failed + 上报平台                    │
├──────────────────────────────────────────────────────────┤
│ Stage 2: gpu_detect (对应 goes gpu_check)                 │
│  - 运行 nvidia-smi 获取 GPU 型号、数量、驱动版本            │
│  - 与实际 gpu_card_type / gpu_count 对账                   │
│  - NVLink 拓扑检测（如适用）                                │
│  - 不一致 → 告警 → 人工确认后可跳过                         │
├──────────────────────────────────────────────────────────┤
│ Stage 3: env_init                                         │
│  - 安装基础依赖                                            │
│  - 挂载本地 SSD / 网络存储                                  │
│  - 配置 containerd / docker runtime                       │
│  - 配置系统内核参数                                        │
├──────────────────────────────────────────────────────────┤
│ Stage 4: k8s_join                                         │
│  - 通过 Karmada/平台获取 kubeadm join token                │
│  - 执行 kubeadm join                                       │
│  - 等待节点 Ready                                          │
│  - 写入 compute_node 记录                                  │
├──────────────────────────────────────────────────────────┤
│ Stage 5: gpu_label (对应 goes gpu_label → 扩展为组件部署)   │
│  - 安装 GPU Operator（NVIDIA GPU Operator）                 │
│  - 配置 MIG / 时分复用（根据策略）                           │
│  - 部署 Volcano Queue                                      │
│  - 应用 labels + taints                                    │
│  - 部署监控组件（node_exporter, dcgm_exporter）             │
│  - 验证 nvidia.com/gpu allocatable > 0                     │
├──────────────────────────────────────────────────────────┤
│ 上报结果: PATCH /api/agent/tasks/{taskId}                  │
│   status: completed | failed                               │
│   node_name: "node-xxx" (k8s_join 成功后)                   │
│   stage_results: [...每个阶段的输出...]                     │
└──────────────────────────────────────────────────────────┘
```

#### 5.3 平台侧 API（需新增）

Edge Agent 调用以下平台 API（参考 `idc-edge-agent-design.md` §4）：

| 方法 | 路径 | 说明 | 状态 |
|------|------|------|------|
| `POST` | `/api/agent/register` | Agent 注册，绑定 data_center | **待实现** |
| `POST` | `/api/agent/heartbeat` | 心跳上报（30s） | **待实现** |
| `GET` | `/api/agent/tasks/pending` | 拉取该 data_center 的待执行任务 | **待实现** |
| `PATCH` | `/api/agent/tasks/{id}` | 上报任务结果（阶段/完成/失败） | **待实现** |
| `GET` | `/api/agent/version` | 最新 Agent 版本号 | **待实现** |
| `GET` | `/api/agent/downloads/{version}/{file}` | 下载 Agent 二进制 | **CDN stub**（`AGENT_CDN_BASE_URL`→302，否则 501） |

**实现位置**: `apps/api/` (Hono + zod-openapi)，作为独立 REST API 对外暴露给 Edge Agent。

Agent 上报任务结果后，平台侧执行：

```typescript
// apps/web/src/lib/server/actions/agent-task-callback.ts

async function onAgentTaskCompleted(taskId: string, result: AgentTaskResult) {
  if (result.status === 'completed') {
    // 1. 更新 device_onboarding_task
    await db.update(deviceOnboardingTask).set({
      stage: 'completed',
      stageStatus: 'success',
      nodeName: result.nodeName,
      completedAt: new Date(),
    }).where(eq(deviceOnboardingTask.id, taskId))

    // 2. 更新 supplier_device ops_status → 在集群中, lifecycle → online
    await db.update(supplierDevice).set({
      opsStatus: '在集群中',
      lifecycleStatus: 'online',
    }).where(eq(supplierDevice.id, taskDeviceId))

    // 3. 写入 compute_node 记录
    await db.insert(computeNode).values({
      id: newId(),
      supplierDeviceId: taskDeviceId,
      nodeRole: 'compute',
      lifecycleStatus: 'online',
      ...result.nodeInfo,
    })

    // 4. 触发资源池调度评估
    await refreshDeviceSnapshot(db, taskDeviceId)

    // 5. 通知供应商
    await notifySupplier(taskDeviceId, 'device.online')
  } else {
    // 失败处理: 更新状态、记录错误、通知运营
    await handleTaskFailure(taskId, result)
  }
}
```

#### 5.4 错误恢复与重试

| 失败阶段 | 重试策略 | 人工干预 |
|---------|---------|---------|
| `ssh_verify` | 自动重试 3 次（间隔 60s） | IP 不可达 → 通知供应商确认网络 |
| `gpu_detect` | 不自动重试 | GPU 型号不匹配 → 运营确认是否继续 |
| `env_init` | 自动重试 2 次 | 磁盘/挂载失败 → 通知供应商 |
| `k8s_join` | 自动重试 3 次 | join token 过期 → 重新生成 |
| `gpu_label` | 自动重试 2 次 | GPU Operator 安装失败 → 运营排查 |

Agent 上报失败后，平台通知运营（飞书/站内信），运营可在批次详情页重试单台设备或批量重试。

---

### 阶段 6 — 资源池自动处理（调度引擎）

#### 6.1 触发时机

设备 `ops_status` 变为 `在集群中` 后，自动触发调度引擎单设备评估。

```typescript
// apps/web/src/lib/server/scheduling/engine.ts

export async function onDeviceOnline(deviceId: string) {
  await refreshDeviceSnapshot(db, deviceId)
  const snapshot = await getSnapshot(db, deviceId)

  // 写入 supplier_gpu_inventory（更新在线可用数）
  await db
    .update(supplierGpuInventory)
    .set({ onlineQuantity: sql`online_quantity + ${snapshot.gpuCount}` })
    .where(and(
      eq(supplierGpuInventory.supplierId, device.supplierId),
      eq(supplierGpuInventory.dataCenterId, device.dataCenterId),
      eq(supplierGpuInventory.gpuCardTypeId, device.gpuCardTypeId),
    ))
}
```

#### 6.2 调度决策

设备上线时无租户/任务上下文，调度引擎仅基于设备属性（`gpu_card_type_id`、`data_center_id`、`cooperation_type`）匹配规则：

| 合作类型 | 典型规则匹配结果 | 目标池 | 可调度产品线 |
|---------|----------------|--------|------------|
| `idle_time` | 默认弹性 | `elastic` | cloud_vm, serverless, job, inference |
| `idle_time` + 高价值卡型 + 某机房 | 专属池优先 | `dedicated` | bare_metal |
| `whole_rent` | 整租不接入 K8s | `dedicated` | bare_metal |
| 手动指定（策略中 `poolAssignment.mode=manual`） | 直接使用 | 手动指定值 | — |

#### 6.3 自动上下架引擎

设备上线（`lifecycleStatus='online'`）后，**自动上架引擎**（基于 `devicePlatformProbe` 改造）定时评估：

**上架条件**（同时满足）：
- `lifecycleStatus = 'online'`
- devicePlatformProbe 一致性检查通过（`consistencyFlag='consistent'`）
- 定价已配置（`supplier_card_list_price` 存在有效记录）
- `inMaintenance = false`
- `listingDisabled = false`（运营可手动禁用）

**自动上架**：满足条件后，引擎将设备设为 `lifecycleStatus='listed'`，市场可见。

**自动下架**（任一条件触发）：
| 触发条件 | 操作 |
|---------|------|
| Probe 检测通道缺失 (`missing_platform`) | `lifecycleStatus='online'` |
| 运营标记维护 (`inMaintenance=true`) | 强制市场不可见 |
| 运营禁用上架 (`listingDisabled=true`) | 市场不可见 |
| 设备退订 (`lifecycleStatus='retired'`) | 清理快照 |

**`listing_disabled` 字段**：新增 `supplier_device.listing_disabled` 布尔字段，默认 `false`。运营可在不改变生命周期状态的情况下，临时隐藏设备。

#### 6.4 供应商自助上下架

在 `apps/supplier` 供应商门户中，对已上线设备增加操作权限：
- 对 `lifecycleStatus='online'` 的设备，供应商可发起上架请求
- 对 `lifecycleStatus='listed'` 的设备，供应商可发起下架请求
- 上架请求需满足自动上架引擎的同等条件；下架立即生效

> 供应商上下架权限可通过 `supplierProcedure` 中间件控制，仅限操作本供应商设备。

#### 6.5 资源池与市场的衔接

```
设备上线 (lifecycleStatus=online)
  │
  ├── auto-listing Engine (cron 每小时评估)
  │     ├── probe一致 + 定价已配 + 不在维护
  │     └── lifecycleStatus → listed
  │
  ├── lifecycleStatus=listed → 商业可见
  │     ├── market listing: 从 supplier_device WHERE lifecycleStatus='listed'
  │     │                      AND listingDisabled=false 读取
  │     ├── supply_gpu_inventory.online_quantity += gpu_count
  │     │
  │     └── 市场查询（apps/gpus）:
  │           metal/list, server/list, serverless/list, job/list
  │           从 supplier_device 直接查询（通过 unified-market.ts）
  │
  └── pool=dedicated → dedicated 池
        │
        └── 额外条件: lifecycleStatus='listed' 设备才可被客户分配
```

---

## 四、数据库变更汇总

### 4.1 新增表

| 表 | 用途 | 所属 schema |
|----|------|-----------|
| `device_onboarding_policy` | 上架策略模板 | `packages/db/src/supply-schema.ts` |
| `device_onboarding_policy_batch` | 策略-批次关联 | 同上 |
| `device_onboarding_task` | 设备上架任务（Agent 拉取） | 同上 |

### 4.2 现有表新增字段

```sql
-- supplier_device
ALTER TABLE supplier_device
    ADD COLUMN review_status VARCHAR(16) NOT NULL DEFAULT 'pending',
    ADD COLUMN review_remark TEXT,
    ADD COLUMN reviewed_by TEXT,
    ADD COLUMN reviewed_at TIMESTAMPTZ,
    ADD COLUMN listing_disabled BOOLEAN NOT NULL DEFAULT false;
```

### 4.3 新增 API 端点（apps/api）

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/agent/register` | Agent 注册 |
| `POST` | `/api/agent/heartbeat` | Agent 心跳 |
| `GET` | `/api/agent/tasks/pending` | 拉取待执行任务 |
| `PATCH` | `/api/agent/tasks/{id}` | 上报任务结果 |
| `GET` | `/api/agent/version` | Agent 版本 |
| `GET` | `/api/agent/downloads/{version}/{file}` | 下载 Agent 二进制 |

---

## 五、实施计划

> **落地状态（2026-09-26）**：A/C/D/G 主干 + #27 接线 + 本轮 P0（probe 门禁、auto-unlist、agent_registry、CDN stub）已合入 `develop-gpus`。Agent 真实二进制托管仍依赖配置 `AGENT_CDN_BASE_URL`。详见 `procurement-to-onboarding-closed-loop.md` §八。

| 阶段 | 内容 | 工期 | 涉及包 | 依赖 |
|------|------|------|--------|------|
| **A. 数据模型** | 新增 3 表 + supplier_device 加 review 字段 | ✅ | `@workspace/db` | 已合入 |
| **B. 供应商上报** | CSV 导入、设备批量录入、接入状态展示 | 3d | `apps/supplier` | A |
| **C. 运营审核** | 审核界面、逐台/批量审核、策略模板 CRUD | ✅/🟡 | `apps/web` | 审核✅；策略应用 UI 待补 |
| **D. Agent API** | 实现 6 个 Agent API 端点、任务调度 | ✅ | `apps/api` | 端点+API key+registry✅；CDN stub（需配置） |
| **E. 流水线引擎** | 任务创建编排、Agent 回调处理、状态机 | 2d | `apps/web` | D |
| **F. 状态机联调** | ops_status 转换、通知体系、端到端验证 | 2d | 跨包 | C, E |
| **G. 资源池自动化** | 设备上线 → 调度评估 → 市场上架 | 🟡 | `apps/web` | cron 上架✅；完成触发/下架待补 |

**总工期**: 约 3 周。阶段 A-D 可并行推进，阶段 E-G 依赖前置。

---

## 六、与现有文档的关系

| 文档 | 关系 |
|------|------|
| `idc-auto-onboarding-design.md` | 供应商视角接入流程，本文档补充运营审核与策略设定 |
| `idc-edge-agent-design.md` | Edge Agent 架构，本文档定义平台侧任务调度与 API |
| `idc-auto-onboarding-implementation.md` | 自动纳管实现，本文档细化状态机与错误恢复 |
| `resource-pool-optimization.md` | 调度引擎，本文档 §6 对接设备上线事件 |
| `supplier-device-onboarding-user-guide.md` | 本文档的供应商操作指南，位于 `apps/web/content/guide/` |
| `supplier-device-ops-pool-masterdata-design.md` | ops_status 生命周期，本文档复用并扩展上架流水线阶段 |
| `supplier-onboarding-plan-changelog-tracking-design.md` | 批次设备变更追踪，本文档复用 batch_progress 机制 |
