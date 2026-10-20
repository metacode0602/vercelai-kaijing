# 资源池管理：统一调度引擎与动态池分配 — 完整实现方案

> 版本: 3.0 | 日期: 2026-07-22
> 状态: 设计完成，待实施

---

## 一、现有方案评估

### 1.1 做得好的部分（保留）

| 设计点 | 评价 |
|---|---|
| **三层资源模型**（物理层 → 池层 → 产品线层） | ✅ 抽象的层次感正确 |
| **ops_status 派生池归属** | ✅ 避免冗余表，状态即归属 |
| **Karmada drain/cordon 机制** | ✅ 成熟的集群操作原语 |
| **Spot 抢占通知体系**（tenant_notification 必达） | ✅ 租户体验考虑周全 |
| **产品线三维正交模型**（product_line × billing_mode × commitment） | ✅ 语义清晰，无歧义 |
| **GPU 卡型主数据唯一来源** (gpu_card_type) | ✅ 避免多源不一致 |
| **Serverless interruptible 跨区域迁移** | ✅ 弹性调度成熟 |

### 1.2 需要优化的核心问题

| # | 问题 | 严重程度 | 影响 |
|---|------|---------|------|
| **P1** | **池模型过于静态**：设备只能属于 K8s 池或裸金属池，无法动态共享 | 🔴 高 | 设备利用率受限于池边界，裸金属闲置时 K8s 池无法使用 |
| **P2** | **调度策略缺失**：无租户等级/任务类型感知的调度优先级 | 🔴 高 | 所有租户平等竞争，VIP 租户无保障；批处理与推理同一优先级不合理 |
| **P3** | **抢占式迁移是被动触发** | 🟡 中 | 仅在用户下单裸金属时触发，缺乏前瞻性调度 |
| **P4** | **双表管理设备库存**：`supplier_device` vs `supplier_gpu_inventory` 数据同源但分离 | 🟡 中 | 裸金属和 K8s 产品线查询逻辑不统一，维护成本高 |
| **P5** | **调度规则硬编码** | 🟡 中 | ops_status 池归属、Spot 优先级等规则写死在代码中，运营无法调整 |
| **P6** | **缺少调度决策的可观测性** | 🟢 低 | 为什么这台设备被选为裸金属而非 K8s？决策链路不透明 |

---

## 二、优化方案：统一设备资源池与可配置调度引擎

### 2.1 核心思路

```
传统模型（当前）:
  设备 → [K8s池 | 裸金属池] → 各自产品线
  缺点：池割裂，设备不可跨池使用

优化模型:
  设备 → 统一资源池 → 调度引擎（基于规则）→ 任意产品线
  优点：按需动态分配，利用率最大化
```

### 2.2 统一资源池数据模型

#### 2.2.1 新增核心表

```sql
-- ── 调度策略规则表 ──
CREATE TABLE resource_scheduling_rule (
    id              TEXT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,           -- 规则名称（展示用）
    priority        INTEGER NOT NULL DEFAULT 0,      -- 规则优先级（越大越高）
    enabled         BOOLEAN NOT NULL DEFAULT true,

    -- 匹配条件（结构化列 + JSONB 混合）
    -- 结构化列用于高频查询字段，JSONB 用于扩展条件
    tenant_tier      VARCHAR(16)[],           -- ['vip', 'enterprise']
    product_line     VARCHAR(32)[],           -- ['cloud_vm', 'serverless']
    billing_mode     VARCHAR(32)[],           -- ['on_demand', 'spot']
    task_category    VARCHAR(32)[],           -- ['production', 'batch', 'inference_online']
    match_extra      JSONB NOT NULL DEFAULT '{}',
    /*
    match_extra 示例（低频/扩展条件）:
    {
      "gpu_card_type_id": ["h100-80g", "a100-80g"],
      "data_center_id": ["dc-001"],
      "supplier_id": ["supplier-001"],
      "idle_window_from_idc": true   -- 引用 idc_capacity_window，见 §2.3.5
    }
    */

    -- 调度动作
    action          JSONB NOT NULL,
    /*
    示例:
    {
      "type": "pool_assignment",
      "target_pool": "elastic",
      "priority_class": "od-high",
      "weight": 100
    }
    或:
    {
      "type": "preemption_policy",
      "can_preempt": true,
      "preempt_target": ["spot-low", "batch-low"],
      "max_preempt_count": 5
    }
    或:
    {
      "type": "capacity_reservation",
      "reserve_gpu_count": 16,
      "reserve_card_type": "h100-80g",
      "reserve_duration_hours": 24
    }
    */

    -- 生效范围
    scope           VARCHAR(16) NOT NULL DEFAULT 'global',  -- global | data_center | supplier
    scope_id        TEXT,                                   -- 对应 data_center.id 或 supplier.id

    -- 元信息
    description     TEXT,
    created_by      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (scope IN ('global', 'data_center', 'supplier'))
);

CREATE INDEX rsr_priority_idx ON resource_scheduling_rule(priority DESC);

-- ── 设备统一库存视图（物化） ──
-- 用途：运营后台容量看板 + 调度决策参考
-- 注意：此表是调度视图，数据每 5 分钟刷新，存在延迟
--       用户端市场查询直接查 supplier_device（实时），不依赖此表
--       事务性设备分配也直接查 supplier_device（FOR UPDATE），见 §2.3.7
CREATE TABLE device_availability_snapshot (
    id                      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    supplier_device_id      TEXT NOT NULL REFERENCES supplier_device(id),
    data_center_id          TEXT NOT NULL REFERENCES data_center(id),
    gpu_card_type_id        TEXT NOT NULL REFERENCES gpu_card_type(id),
    gpu_count               INTEGER NOT NULL,

    -- 池归属（由调度引擎计算）
    pool                    VARCHAR(16) NOT NULL,  -- elastic | dedicated | maintenance | idle
    pool_updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- 占用状态
    allocated_to            VARCHAR(32),             -- 产品线或 compute_base_id
    allocated_gpu_count     INTEGER DEFAULT 0,
    allocatable_gpu_count   INTEGER NOT NULL,        -- 可分配 GPU 数 = gpu_count - allocated_gpu_count

    -- 优先级
    current_priority_class  VARCHAR(32) NOT NULL DEFAULT 'od-normal',  -- od-high | od-normal | od-low | spot
    current_weight          INTEGER NOT NULL DEFAULT 50,  -- 调度权重

    -- 可抢占标记
    preemptible             BOOLEAN NOT NULL DEFAULT false,
    preempt_notice_seconds  INTEGER DEFAULT 120,

    -- 快照时间
    snapshot_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (supplier_device_id)
);

CREATE INDEX das_pool_idx ON device_availability_snapshot(pool, allocatable_gpu_count DESC);
CREATE INDEX das_card_dc_idx ON device_availability_snapshot(gpu_card_type_id, data_center_id);
```

#### 2.2.2 状态机优化

将原来的静态 ops_status 池派生改为动态池分配：

```
                    ┌──────────────────────────────────────┐
                    │          供应商设备接入               │
                    │     (lifecycle_status = online)        │
                    └────────────────┬─────────────────────┘
                                      │
                                      ▼
                     ┌──────────────────────────────────────┐
                     │    自动上架引擎评估                   │
                     │   (devicePlatformProbe 自动修复)     │
                     │   条件: probe一致 + 定价已配置        │
                     │        + 不在维护中 + 未禁用上架      │
                     └────────────────┬─────────────────────┘
                                      │ 通过
                                      ▼
                     ┌──────────────────────────────────────┐
                     │        设备上架                       │
                     │     (lifecycle_status = listed)       │
                     │     listing_disabled = false          │
                     └────────────────┬─────────────────────┘
                                      │
                                      ▼
                     ┌──────────────────────────────────────┐
                     │       调度引擎初次评估               │
                     │   遍历 resource_scheduling_rule       │
                     │   匹配 → 计算 pool + priority_class   │
                     └────────────────┬─────────────────────┘
                                     │
                ┌────────────────────┼────────────────────┐
                │                    │                    │
                ▼                    ▼                    ▼
        ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
        │ pool=elastic │    │ pool=        │    │ pool=idle    │
        │ (弹性池)     │    │ dedicated   │    │ (闲置池)     │
        │              │    │ (专属池)     │    │              │
        │ 供: cloud_vm │    │ 供: bare_    │    │ 等待调度     │
        │  serverless  │    │  metal直租  │    │ 重新评估     │
        │  job         │    │  或VIP专属   │    │              │
        │  inference   │    │              │    │              │
        └──────┬───────┘    └──────┬───────┘    └──────┬───────┘
               │                   │                    │
               │    ┌──────────────┘                    │
               │    │  弹性池 ↔ 专属池 可动态切换        │
               │    │  (基于调度规则 + 容量需求)         │
               │    └──────────────┘                    │
               │                                        │
               ▼                                        │
    ┌──────────────────────┐                           │
    │  子池：priority_class │                           │
    │  - od-high (VIP租户)  │                           │
    │  - od-normal (默认)   │                           │
    │  - od-low (实验/批处理)│                           │
    │  - spot (闲时可抢占)   │                           │
    └──────────────────────┘                           │
```

### 2.3 可配置调度规则引擎

#### 2.3.1 租户等级体系

```sql
-- 在 tenant 表增加字段（若尚无）
ALTER TABLE tenant ADD COLUMN tier VARCHAR(16) NOT NULL DEFAULT 'standard';
-- tier: vip | enterprise | standard | trial

ALTER TABLE tenant ADD COLUMN tier_features JSONB DEFAULT '{}';
/*
{
  "max_concurrent_gpus": 128,
  "priority_class": "od-high",
  "preempt_protection": true,
  "dedicated_pool_min_gpus": 0,
  "support_hours": "7x24",
  "sla_response_minutes": 15
}
*/
```

##### 租户等级变更的级联影响

租户等级变更（`billingTenant.tier` 修改）触发以下级联流程：

```
等级变更（运营操作或自动升降级）
    │
    ├─ 升级（standard → vip / enterprise）
    │   1. 立即生效：下一次快照刷新时重新评估该租户所有设备的规则匹配
    │   2. 已运行实例不自动迁移（避免服务中断）
    │   3. 新创建实例立即享受新等级的调度优先级
    │   4. 如 tier_features.dedicated_pool_min_gpus > 0，
    │      调度引擎预留专属池容量
    │
    └─ 降级（vip → standard / trial）
        1. 标记降级时间点，写入 scheduling_rule_change_log
        2. 下一次快照刷新时重新评估规则匹配
        3. 已分配到 dedicated 池的实例：
           a. 不强制迁移（已运行实例保持到生命周期结束）
           b. 该租户的 preempt_protection 失效（下次抢占评估时不再保护）
        4. tier_features.dedicated_pool_min_gpus 清零
        5. 新创建实例按新等级的优先级调度
```

**关键约束**：
- 等级变更**不触发实时迁移**，仅影响下一次调度评估（5 分钟快照周期内生效）
- 降级时已有的抢占保护逐步失效，而非立即失效——给运营 1 个快照周期的缓冲
- 等级变更必须通过运营后台操作，记录到 `scheduling_rule_change_log`

#### 2.3.2 任务类型分类

```sql
-- compute_base 增加字段
ALTER TABLE compute_base ADD COLUMN task_category VARCHAR(32) DEFAULT 'production';
-- task_category: production | batch | experiment | inference_online | training

-- task_category 与 priority_class 默认映射:
-- production       → od-high
-- inference_online → od-high
-- training         → od-normal
-- batch            → od-low
-- experiment       → od-low
```

#### 2.3.3 调度规则示例

```sql
-- 规则 1: VIP 租户的在线推理任务使用高优先级专用池
INSERT INTO resource_scheduling_rule (id, name, priority, tenant_tier, task_category, action, scope)
VALUES (
    'rule-vip-inference',
    'VIP推理高优保障',
    100,
    ARRAY['vip'],
    ARRAY['inference_online'],
    '{
        "type": "pool_assignment",
        "target_pool": "dedicated",
        "priority_class": "od-high",
        "weight": 100,
        "preempt_protection": true
    }',
    'global'
);

-- 规则 2: 企业租户的 production 任务保障不被打断
INSERT INTO resource_scheduling_rule (id, name, priority, tenant_tier, task_category, action, scope)
VALUES (
    'rule-enterprise-production',
    '企业租户生产保障',
    90,
    ARRAY['enterprise', 'vip'],
    ARRAY['production'],
    '{
        "type": "pool_assignment",
        "target_pool": "elastic",
        "priority_class": "od-high",
        "weight": 90
    }',
    'global'
);

-- 规则 3: Spot 任务优先使用闲时窗口设备（引用 idc_capacity_window）
INSERT INTO resource_scheduling_rule (id, name, priority, billing_mode, product_line, match_extra, action, scope)
VALUES (
    'rule-spot-idle-window',
    'Spot闲时窗口调度',
    50,
    ARRAY['spot'],
    ARRAY['job'],
    '{"idle_window_from_idc": true}',
    '{
        "type": "pool_assignment",
        "target_pool": "elastic",
        "priority_class": "spot",
        "weight": 30
    }',
    'global'
);

-- 规则 4: 实验/批处理任务可被 VIP 抢占
INSERT INTO resource_scheduling_rule (id, name, priority, task_category, action, scope)
VALUES (
    'rule-low-priority-preemptible',
    '低优任务可抢占标记',
    10,
    ARRAY['batch', 'experiment'],
    '{
        "type": "preemption_policy",
        "can_be_preempted": true,
        "preempt_notice_seconds": 60
    }',
    'global'
);

-- 规则 5: 某机房 H100 设备优先给裸金属专属池
INSERT INTO resource_scheduling_rule (id, name, priority, match_extra, action, scope, scope_id)
VALUES (
    'rule-dc-sg-h100-dedicated',
    '新加坡H100裸金属优先',
    80,
    '{"gpu_card_type_id": ["h100-80g"], "data_center_id": ["dc-sg-01"]}',
    '{
        "type": "pool_assignment",
        "target_pool": "dedicated",
        "priority_class": "od-normal"
    }',
    'data_center',
    'dc-sg-01'
);
```

#### 2.3.5 与 `idc_capacity_window` 的关系

调度规则的 `match_extra.idle_window_from_idc` 字段引用 `spot-preemption-design.md` 中定义的 `idc_capacity_window` 表。两者的关系：

```
idc_capacity_window（声明式窗口定义）
    │
    │  窗口状态 = active 且当前时间在 [window_start, window_end] 内
    │
    ▼
resource_scheduling_rule.match_extra.idle_window_from_idc = true
    │
    │  规则引擎在匹配时：
    │  1. 查询该设备所在 data_center 的活跃 idc_capacity_window
    │  2. 若存在 mode='idle_open' 的活跃窗口 → match_extra 条件满足
    │  3. 若无活跃窗口或 mode='reclaim' → match_extra 条件不满足
    │
    ▼
设备被分配到 spot priority_class（仅在闲时窗口内生效）
```

| 场景 | `idc_capacity_window` 状态 | 调度规则匹配结果 |
|------|---------------------------|----------------|
| 供应商闲时放出设备 | `mode=idle_open`, `status=active` | Spot 规则匹配，设备进入 spot pool |
| 供应商忙时回收 | `mode=reclaim`, `status=active` | Spot 规则不匹配，设备回到 elastic pool |
| 无窗口定义 | 无记录 | Spot 规则不匹配 |

**关键约束**：`time_range` 不再作为独立的 `match_condition` 字段。时间相关的调度逻辑统一由 `idc_capacity_window` 驱动，避免两套时间管理机制冲突。规则引擎通过 `idle_window_from_idc: true` 声明"我需要闲时窗口"，由引擎内部查询 `idc_capacity_window` 表判定。

#### 2.3.6 调度引擎工作流

```
                       ┌─────────────┐
                       │  触发事件    │
                       │  (5min 定时  │
                       │   / 新设备   │
                       │   / 订单请求) │
                       └──────┬──────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  读取活跃规则    │
                    │  ORDER BY        │
                    │  priority DESC   │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │ 遍历每个设备  │              │
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │遍历规则   │  │匹配条件   │  │执行动作   │
        │(优先级序) │→│match_     │→│action     │
        │          │  │condition │  │写入快照   │
        └──────────┘  └──────────┘  └──────────┘
              │
              ▼
    ┌──────────────────────────────┐
    │  更新 device_availability_    │
    │  snapshot (pool/priority/     │
    │  weight/preemptible)          │
    └──────────────┬───────────────┘
                   │
                   ▼
    ┌──────────────────────────────┐
    │  执行池间迁移 (如有必要)      │
    │  - Karmada node drain/cordon  │
    │  - 更新 supplier_device       │
    │  - 租户通知                   │
    └──────────────────────────────┘
```

#### 2.3.7 设备分配与计费的事务边界

`device_availability_snapshot` 是调度视图，**不参与事务性分配**。用户下单时的设备锁定和计费扣款必须走独立的事务路径，与快照解耦。

**裸金属订单路径**（`bare_metal_order`）：

```sql
-- 单事务：锁定设备 + 扣款 + 创建订单
BEGIN;
  -- 1. 锁定物理设备（行级锁，防并发分配）
  SELECT * FROM supplier_device
  WHERE id = $device_id
    AND lifecycle_status = 'listed'
    AND listing_disabled = false
  FOR UPDATE;

  -- 2. 检查余额（@workspace/billing 原语）
  SELECT * FROM tenant_balance
  WHERE tenant_id = $tenant_id
  FOR UPDATE;

  -- 3. 扣减余额
  UPDATE tenant_balance
  SET available_balance = available_balance - $amount
  WHERE tenant_id = $tenant_id
    AND available_balance >= $amount;

  -- 4. 创建订单 + 更新设备状态
  INSERT INTO bare_metal_order (...) VALUES (...);
  UPDATE supplier_device
  SET ops_status = '租用中',
      lifecycle_status = 'allocated'
  WHERE id = $device_id;
COMMIT;

-- 5. 事务外：刷新该设备的快照（事件驱动）
SELECT refreshDeviceSnapshot($device_id);
```

**K8s 产品线路径**（`compute_base`）：

```sql
-- 单事务：余额冻结 + 创建计算任务
BEGIN;
  -- 1. 余额冻结（@workspace/billing freeze 原语）
  SELECT * FROM tenant_balance WHERE tenant_id = $tenant_id FOR UPDATE;
  UPDATE tenant_balance
  SET reserved_balance = reserved_balance + $amount,
      available_balance = available_balance - $amount
  WHERE tenant_id = $tenant_id;

  -- 2. 创建计算任务
  INSERT INTO compute_base (...) VALUES (...);
COMMIT;

-- 3. 事务外：SkyPilot 调度（异步）
-- 调度时从 supplier_device / compute_node 查询可用节点，不依赖快照
```

**关键约束**：
- 快照（`device_availability_snapshot`）**仅用于运营看板和市场展示的近似容量感知**，不用于事务性分配判断
- 设备锁定以 `supplier_device` 表为准（`FOR UPDATE` 行级锁）
- 余额操作统一走 `@workspace/billing` 原语，禁止业务直写 `tenant_balance`
- 快照在事务提交后通过事件驱动异步刷新，不阻塞主流程

### 2.4 抢占式调度优化

#### 2.4.1 从被动到主动

| 方面 | 当前方案 | 优化方案 |
|---|---|---|
| 触发方式 | 用户下单 bare_metal | 调度引擎周期性评估 + 事件驱动 |
| 决策依据 | `ops_status` 静态归属 | 规则引擎 + 实时容量 |
| 抢占粒度 | 整台物理机 | GPU 级别（单设备 8 GPU 可分给不同任务） |
| 租户感知 | 仅通知 | 租户等级决定是否可被抢占 |
| 可配置性 | 硬编码 | 运营后台增删改规则 |

#### 2.4.2 分级抢占策略

```
抢占等级（从高到低）：
───────────────────────────────────────
L0: VIP 租户 production / inference_online — 不可抢占
L1: enterprise 租户 production — 不可抢占（除非紧急）
L2: 普通 on_demand 业务 — 可迁移到其他设备
L3: batch/experiment — 可抢占，通知 60s
L4: spot 任务 — 可抢占，通知 120s（保持现有）
L5: idle 闲置设备 — 随时回收
───────────────────────────────────────
```

#### 2.4.3 GPU 级抢占（非整机）

当前设计抢占目标是整台物理机（8 GPU）。优化后支持 GPU 级抢占：

```sql
-- device_availability_snapshot 扩展
-- allocatable_gpu_count 已经支持 GPU 粒度追踪

-- 抢占时：
-- 1. 查找有足够 allocatable_gpu_count 的设备
-- 2. 如不足，从低优先级设备驱逐若干 GPU 的工作负载
-- 3. 释放的 GPU 分配给高优先级请求
-- 最大程度减少"整机被占时无法分配"的问题
```

### 2.5 管理后台规则配置

#### 2.5.1 新增运营页面

在 `apps/web` 运营平台增加「调度规则管理」：

| 模块 | 功能 |
|---|---|
| 规则列表 | 展示所有 `resource_scheduling_rule`，支持启用/禁用/删除 |
| 规则编辑器 | 可视化 conditional builder → 生成结构化列 + match_extra JSONB |
| 规则优先级拖拽 | 拖拽调整 priority 顺序 |
| 规则测试 | 输入模拟租户/任务参数，预览规则匹配结果 |
| 规则变更历史 | 记录谁在何时修改了什么 |
| 容量看板 | 各 pool 的设备数、GPU 分配率、等待队列长度 |

#### 2.5.2 规则配置 UI 示意

```
┌─ 调度规则管理 ─────────────────────────────────────────────────┐
│  [+ 新建规则]                                                    │
│                                                                  │
│  ┌── 拖拽调整 ──────────────────────────────────────────┐       │
│  │ #1 rule-vip-inference         VIP推理高优保障    ✅   │       │
│  │ #2 rule-enterprise-production 企业租户生产保障   ✅   │       │
│  │ #3 rule-dc-sg-h100-dedicated  新加坡H100优先     ✅   │       │
│  │ #4 rule-spot-idle-window      Spot闲时窗口       ✅   │       │
│  │ #5 rule-low-priority-preempt  低优可抢占标记    ✅   │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                  │
│  选中规则详情:                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 规则名称: VIP推理高优保障                                 │    │
│  │ 优先级: 100                                               │    │
│  │                                                           │    │
│  │ 匹配条件:                                                 │    │
│  │   租户等级 = [VIP]                                       │    │
│  │   任务类型 = [推理服务]                                   │    │
│  │   [+ 添加条件]                                            │    │
│  │                                                           │    │
│  │ 执行动作:                                                 │    │
│  │   目标池 = 专属池                                        │    │
│  │   优先级类 = od-high                                      │    │
│  │   权重 = 100                                              │    │
│  │   抢占保护 = 开启                                        │    │
│  │                                                           │    │
│  │ [保存] [删除] [测试此规则]                                │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

### 2.6 数据查询分层：用户场景 vs 运营场景

#### 2.6.1 场景分离原则

| 场景 | 数据源 | 原因 |
|------|--------|------|
| **用户端市场列表** | `supplier_device` + `gpu_card_type` + `data_center` | 实时查询，反映当前真实可用设备 |
| **用户端下单分配** | `supplier_device` FOR UPDATE | 事务性锁定，保证一致性 |
| **运营后台容量看板** | `device_availability_snapshot` | 汇总视图，5 分钟延迟可接受 |
| **运营后台池分布统计** | `device_availability_snapshot` | 聚合查询，用于调度规则效果评估 |

**`opsStatus` 的语义**：`supplier_device.opsStatus` 仅描述设备在运维层面的上架状态（预留闲置中、可租用、使用中等），是设备接入平台时由供应商/运营填写的运维标签。它**不参与**用户端的市场展示和下单逻辑。市场的商业可见性由 `lifecycle_status`（只有 `'listed'` 时可见）、`listing_disabled` 和 `in_maintenance` 共同决定。

#### 2.6.2 用户端市场查询（直接查 `supplier_device`）

```sql
-- 用户端裸金属市场查询（实时）
SELECT
    sd.id,
    gct.name AS gpu_model,
    gct.memory_gb,
    sd.gpu_count,
    dc.name AS data_center_name,
    dc.bare_metal_region AS region,
    sd.device_spec,
    -- 价格
    sclp.list_price_per_hour AS price_per_hour
FROM supplier_device sd
JOIN gpu_card_type gct ON sd.gpu_card_type_id = gct.id
JOIN data_center dc ON sd.data_center_id = dc.id
LEFT JOIN supplier_card_list_price sclp
    ON sclp.supplier_id = sd.supplier_id
    AND sclp.data_center_id = sd.data_center_id
    AND sclp.gpu_card_type_id = sd.gpu_card_type_id
    AND sclp.effective_to IS NULL
WHERE sd.lifecycle_status = 'listed'
  AND sd.listing_disabled = false
  AND sd.in_maintenance = false
  -- 产品线过滤
  AND (
      (:product_line = 'bare_metal')
      OR
      (:product_line IN ('cloud_vm', 'serverless', 'job', 'inference')
       AND EXISTS (
           SELECT 1 FROM compute_node cn
           WHERE cn.supplier_device_id = sd.id
             AND cn.lifecycle_status = 'online'
       ))
  )
ORDER BY sd.gpu_count DESC;
```

#### 2.6.3 运营后台容量看板（查 `device_availability_snapshot`）

```sql
-- 运营看板：按 pool × 卡型 × 机房 聚合
SELECT
    das.pool,
    gct.name AS gpu_model,
    dc.name AS data_center_name,
    COUNT(*) AS device_count,
    SUM(das.gpu_count) AS total_gpu,
    SUM(das.allocated_gpu_count) AS allocated_gpu,
    SUM(das.allocatable_gpu_count) AS allocatable_gpu,
    ROUND(SUM(das.allocated_gpu_count)::numeric / NULLIF(SUM(das.gpu_count), 0) * 100, 1) AS utilization_pct
FROM device_availability_snapshot das
JOIN gpu_card_type gct ON das.gpu_card_type_id = gct.id
JOIN data_center dc ON das.data_center_id = dc.id
GROUP BY das.pool, gct.name, dc.name
ORDER BY das.pool, gct.name, dc.name;
```

### 2.7 完整实施计划

#### Phase A — 数据库变更（2 天）

##### A.1 新增 Schema 文件

在 `packages/db/src/` 新建 `scheduling-schema.ts`，定义三张新表：

**`resource_scheduling_rule`** — 调度策略规则表：
```typescript
export const resourceSchedulingRule = pgTable(
  "resource_scheduling_rule",
  {
    id: text("id").primaryKey(),
    name: varchar("name", { length: 128 }).notNull(),
    priority: integer("priority").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    // 结构化匹配列（高频查询字段）
    tenantTier: text("tenant_tier").array(),      // ['vip', 'enterprise']
    productLine: text("product_line").array(),     // ['cloud_vm', 'serverless']
    billingMode: text("billing_mode").array(),     // ['on_demand', 'spot']
    taskCategory: text("task_category").array(),   // ['production', 'batch']
    // 扩展匹配条件（低频/扩展字段）
    matchExtra: jsonb("match_extra").notNull().default({}),
    // 调度动作
    action: jsonb("action").notNull(),
    // 生效范围
    scope: varchar("scope", { length: 16 }).notNull().default("global"),
    scopeId: text("scope_id"),
    description: text("description"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [
    index("rsr_priority_idx").on(table.priority.desc()),
    index("rsr_enabled_idx").on(table.enabled),
    index("rsr_scope_idx").on(table.scope, table.scopeId),
    // GIN 索引用于数组列的 @> 匹配
    index("rsr_tenant_tier_idx").on(table.tenantTier),
    index("rsr_product_line_idx").on(table.productLine),
  ],
)
```

**`device_availability_snapshot`** — 设备可用性快照表（调度引擎输出）：
```typescript
export const deviceAvailabilitySnapshot = pgTable(
  "device_availability_snapshot",
  {
    id: text("id").primaryKey(),
    supplierDeviceId: text("supplier_device_id")
      .notNull().references(() => supplierDevice.id, { onDelete: "cascade" }),
    dataCenterId: text("data_center_id")
      .notNull().references(() => dataCenter.id, { onDelete: "restrict" }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull().references(() => gpuCardType.id, { onDelete: "restrict" }),
    gpuCount: integer("gpu_count").notNull(),
    pool: varchar("pool", { length: 16 }).notNull(),
    poolUpdatedAt: timestamp("pool_updated_at", { withTimezone: true }).notNull().defaultNow(),
    allocatedTo: varchar("allocated_to", { length: 64 }),
    allocatedGpuCount: integer("allocated_gpu_count").default(0),
    allocatableGpuCount: integer("allocatable_gpu_count").notNull(),
    currentPriorityClass: varchar("current_priority_class", { length: 32 }).notNull().default("od-normal"),
    currentWeight: integer("current_weight").notNull().default(50),
    preemptible: boolean("preemptible").notNull().default(false),
    preemptNoticeSeconds: integer("preempt_notice_seconds").default(120),
    snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("das_device_uk").on(table.supplierDeviceId),
    index("das_pool_allocatable_idx").on(table.pool, table.allocatableGpuCount.desc()),
    index("das_card_dc_idx").on(table.gpuCardTypeId, table.dataCenterId),
  ],
)
```

**`scheduling_rule_change_log`** — 规则变更审计日志：
```typescript
export const schedulingRuleChangeLog = pgTable(
  "scheduling_rule_change_log",
  {
    id: text("id").primaryKey(),
    ruleId: text("rule_id")
      .notNull().references(() => resourceSchedulingRule.id, { onDelete: "cascade" }),
    changedBy: text("changed_by").notNull(),
    changeType: varchar("change_type", { length: 16 }).notNull(), // create | update | delete | toggle
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("srcl_rule_id_idx").on(table.ruleId),
    index("srcl_changed_at_idx").on(table.changedAt.desc()),
  ],
)
```

##### A.2 现有表新增字段

**`billingTenant`**（`packages/db/src/crm-schema.ts:103`）：
```typescript
tier: varchar("tier", { length: 16 }).notNull().default("standard"),
tierFeatures: jsonb("tier_features").default({}),
```

**`computeBase`**（`packages/db/src/compute-schema.ts:46`）：
```typescript
taskCategory: varchar("task_category", { length: 32 }).default("production"),
```

##### A.3 导出与迁移

`packages/db/src/index.ts` 增加 `export * from "./scheduling-schema"`，然后执行：
```bash
pnpm --filter @workspace/db run db:generate
pnpm --filter @workspace/db run db:migrate
```

##### A.4 种子数据

新建 `packages/db/src/scripts/seed-scheduling-rules.ts`，包含 §2.3.3 中的 5 条默认规则。平台初始化 / `db:seed` 时执行。

---

#### Phase B — 调度引擎实现（3 天）

##### B.1 模块结构

新建 `apps/web/src/lib/server/scheduling/` 目录：

```
scheduling/
├── index.ts              # 公开 API 导出
├── engine.ts             # 核心调度引擎
├── rule-matcher.ts       # 规则匹配器
├── snapshot-refresher.ts # 快照刷新
├── migration-executor.ts # 池间迁移编排
└── types.ts              # 类型定义
```

##### B.2 核心类型（`types.ts`）

```typescript
export type Pool = "elastic" | "dedicated" | "maintenance" | "idle"
export type PriorityClass = "od-high" | "od-normal" | "od-low" | "spot"
export type RuleScope = "global" | "data_center" | "supplier"
export type TaskCategory = "production" | "batch" | "experiment" | "inference_online" | "training"
export type TenantTier = "vip" | "enterprise" | "standard" | "trial"

export interface RuleMatchCondition {
  // 结构化列（来自 resource_scheduling_rule 表列）
  tenant_tier?: TenantTier[]
  product_line?: string[]
  billing_mode?: string[]
  task_category?: TaskCategory[]
  // 扩展条件（来自 match_extra JSONB）
  match_extra?: {
    gpu_card_type_id?: string[]
    data_center_id?: string[]
    supplier_id?: string[]
    idle_window_from_idc?: boolean
  }
}

export type SchedulingAction =
  | { type: "pool_assignment"; target_pool: Pool; priority_class: PriorityClass; weight: number; preempt_protection?: boolean; require_idle_window?: boolean }
  | { type: "preemption_policy"; can_preempt?: boolean; can_be_preempted?: boolean; preempt_notice_seconds?: number }
  | { type: "capacity_reservation"; reserve_gpu_count: number; reserve_card_type: string; reserve_duration_hours: number }

export interface SchedulingResult {
  deviceId: string
  pool: Pool
  priorityClass: PriorityClass
  weight: number
  preemptible: boolean
  preemptNoticeSeconds?: number
  matchedRuleId: string
}
```

##### B.3 规则匹配器（`rule-matcher.ts`）

```typescript
// 职责：加载活跃规则 → 按 priority DESC 排序 → 逐个匹配设备
//
// 匹配逻辑（列 + JSONB 混合）：
//   结构化列（tenant_tier, product_line, billing_mode, task_category）
//     维度内部：OR（数组任一值匹配即通过）
//     维度之间：AND（所有维度都必须匹配）
//   JSONB match_extra（gpu_card_type_id, data_center_id, supplier_id, idle_window_from_idc）
//     使用 @> 操作符匹配
//     idle_window_from_idc → 查询 idc_capacity_window 判定（见 §2.3.5）
//   scope 过滤：
//     global → 始终生效
//     data_center → scopeId 匹配 device.dataCenterId
//     supplier → scopeId 匹配 device.supplierId

export function evaluateDevice(
  rules: Rule[],
  device: DeviceContext,
  tenant?: TenantContext,
  task?: TaskContext,
): SchedulingResult {
  // 第一条匹配的规则胜出
  // fallback: pool=elastic, priorityClass=od-normal, weight=50
}
```

##### B.3.1 规则冲突检测

规则冲突指两条规则对同一设备+租户+任务产生不同 `action.target_pool`，虽通过 priority 决胜，但运营可能未意识到隐式覆盖。

**冲突检测时机**：规则创建/更新时（tRPC `scheduling.rules.create` / `update`）。

```typescript
// detectRuleConflicts(db, newRule):
//   1. 加载所有 enabled=true 的规则（含新规则）
//   2. 按 priority DESC 排序
//   3. 对每对相邻规则 (A, B)：
//      a. 检查 A 和 B 的匹配条件是否有交集：
//         - tenant_tier: A.tenant_tier ∩ B.tenant_tier ≠ ∅（或一方为 NULL 表示全匹配）
//         - product_line: 同理
//         - billing_mode: 同理
//         - task_category: 同理
//         - scope: A.scope 包含 B.scope 或 B.scope 包含 A.scope
//      b. 若有交集且 A.action ≠ B.action：
//         → 返回冲突警告：规则 B (#id, priority=#p) 会被规则 A (#id, priority=#p) 隐式覆盖
//   4. 冲突警告写入 response，不阻止保存（运营可确认后保存）
//   5. 冲突信息展示在规则编辑器 UI 中
```

**冲突等级**：
- **警告**：两条规则匹配条件有交集但 `action` 不同，优先级高的覆盖低的。正常行为，提醒运营确认意图。
- **错误**：同 `priority` 的两条规则匹配条件完全重叠且 `action` 不同。拒绝保存，要求调整优先级。

##### B.4 核心引擎（`engine.ts`）

```typescript
// 公开 API:
//   refreshAllSnapshots(db)          — 全量刷新（定时任务调用）
//   refreshDeviceSnapshot(db, id)    — 单设备刷新（事件触发）
//   evaluatePlacement(db, ctx)       — 为新任务推荐最优设备池
//   preemptCheck(db, request)        — 检查是否需要抢占
//
// 内部流程：
//   1. 加载 resource_scheduling_rule WHERE enabled=true ORDER BY priority DESC
//   2. 加载 supplier_device WHERE lifecycle_status IN ('listed','allocated') AND listing_disabled = false
//   3. 逐设备 evaluateDevice → UPSERT device_availability_snapshot
//   4. 对比旧快照：若 pool/priority_class 变化 → 触发池间迁移
```

##### B.4.1 合同产能约束

调度引擎在评估设备分配时，必须检查 `supplier_contract_capacity_line` 的产能上限，防止超卖。

```typescript
// 合同产能检查逻辑（在 refreshAllSnapshots 或单设备刷新时执行）：
//
// 1. 按 (supplier_id, data_center_id, gpu_card_type_id) 聚合：
//    SELECT
//      supplier_id,
//      data_center_id,
//      gpu_card_type_id,
//      SUM(gpu_quantity) AS contract_gpu_capacity
//    FROM supplier_contract_capacity_line
//    WHERE line_status = 'active'
//      AND current_date BETWEEN start_date AND end_date
//    GROUP BY supplier_id, data_center_id, gpu_card_type_id
//
// 2. 对每个 (supplier_id, data_center_id, gpu_card_type_id) 组合：
//    allocated = SUM(device_availability_snapshot.allocated_gpu_count)
//                WHERE pool IN ('elastic', 'dedicated')
//    available_capacity = contract_gpu_capacity - allocated
//
// 3. 若 available_capacity ≤ 0：
//    → 该组合的设备标记 pool='maintenance'（已达合同上限，暂停分配）
//    → 写入告警到 scheduling_rule_change_log
//
// 4. 若 available_capacity > 0 且 pool='maintenance' 的设备有余量：
//    → 恢复为正常 pool
```

**关键约束**：
- 合同产能检查**在规则匹配之后执行**——规则决定设备应该去哪个 pool，合同检查决定该 pool 是否还有余量
- `whole_rent`（整租）合作类型的设备不计入弹性池产能，仅 `idle_time`（闲时）设备参与合同产能计算
- 合同过期（`end_date < current_date`）的 `capacity_line` 不参与计算

##### B.5 快照刷新器（`snapshot-refresher.ts`）

```typescript
// 刷新策略：
//   - 全量刷新：每 5 分钟 cron（通过现有调度基础设施）
//   - 事件驱动：设备 opsStatus 变更 / 租户升级 / 规则变更 → 批量刷新
//   - 并发控制：pg_try_advisory_lock 防竞态
//   - UPSERT: INSERT ... ON CONFLICT (supplier_device_id) DO UPDATE
```

##### B.6 迁移执行器（`migration-executor.ts`）

弹性池 → 专属池迁移流程（用户租用裸金属时）：
1. 检查设备上是否有不可驱逐的 on_demand 工作负载 → 拒绝迁移
2. 通知受影响租户（`tenant_notification` 表）
3. 等待 drain_grace 期（120s）
4. Karmada drain node → cordon
5. 更新 `supplier_device.opsStatus` → 新池状态
6. 写入 `scheduling_rule_change_log`

专属池 → 弹性池回收流程（裸金属退租）：
1. 裸金属订单已释放且无后续预定
2. 更新 `supplier_device.opsStatus`
3. Karmada uncordon node
4. 触发全量快照刷新

---

#### Phase C — 管理后台（3 天）

##### C.1 文件结构

```
apps/web/src/
├── lib/server/
│   ├── dataaccess/
│   │   └── scheduling/
│   │       ├── index.ts          # schedulingDataAccess 统一导出
│   │       ├── rules.ts          # CRUD: resource_scheduling_rule
│   │       ├── snapshots.ts      # 查询: device_availability_snapshot
│   │       └── scheduler.ts      # 定时任务注册
│   └── routers/
│       └── scheduling.ts         # tRPC schedulingRouter
├── app/[locale]/(protected)/
│   └── scheduling/
│       ├── page.tsx              # 规则列表页（Server Component）
│       └── _components/
│           ├── rule-list.tsx         # 规则列表表格
│           ├── rule-editor.tsx       # 规则编辑器（Dialog/Sheet）
│           ├── rule-priority-dnd.tsx # 优先级拖拽排序
│           ├── rule-test-panel.tsx   # 规则测试面板
│           ├── capacity-dashboard.tsx# 容量看板
│           ├── change-log-table.tsx  # 变更历史
│           └── rule-form-fields.tsx  # 条件构造器表单
```

##### C.2 dataaccess 层

`rules.ts` 遵循现有模式（参考 `supplier/physical-devices.ts`）：
```typescript
// getListPage(filters) → PaginatedResult<Rule>
//   支持按 name、scope、enabled 筛选，按 priority DESC 排序
//   
// create(input) → Rule
// update(id, input) → Rule
// delete(id) → void
// toggle(id) → Rule
// reorder(orderedIds: string[]) → void
//   在 transaction 中批量更新 priority
// testRule(rule, deviceContext) → boolean
```

##### C.3 tRPC Router

```typescript
// schedulingRouter 注册到 appRouter 的 scheduling 键下：
//
// scheduling.rules.list       — 分页查询规则列表
// scheduling.rules.get        — 单条规则详情
// scheduling.rules.create     — 新建规则（adminProcedure）
// scheduling.rules.update     — 更新规则
// scheduling.rules.delete     — 删除规则
// scheduling.rules.toggle     — 启用/禁用规则
// scheduling.rules.reorder    — 拖拽调整优先级
// scheduling.rules.test       — 测试规则匹配
// scheduling.snapshots.list   — 快照列表（容量看板数据源）
// scheduling.changeLog.list   — 规则变更历史
// scheduling.triggerRefresh   — 手动触发全量刷新
```

##### C.4 UI 组件设计

**规则列表页**包含：
- 规则表格（Table + Badge + Switch）：显示 name、priority、scope、enabled 状态
- 拖拽排序区域：dnd-kit 实现优先级调整
- 选中规则详情面板：展示 matchCondition（结构化列 + match_extra）和 action 的可读摘要
- 操作按钮：编辑（Dialog）、测试（Panel）、启用/禁用、删除（确认框）
- 规则编辑器 Dialog：条件构造器（Select/MultiSelect + Input）+ 动作构造器（根据类型切换表单）
- 规则测试 Panel：输入设备/租户/任务参数 → 显示匹配结果

**容量看板**包含：
- 池级摘要卡片：elastic/dedicated/idle 各池的设备数、GPU 总数、分配率
- 机房 × 卡型热力图：可用 GPU 数按维度聚合

##### C.5 导航菜单

在 `apps/web/src/lib/navigation/sidebar-menu.tsx` 的「算力供应链」分组中增加：
```typescript
{ title: "调度规则", url: "/scheduling", icon: "Gauge" }
```

---

#### Phase D — 市场查询统一（3 天）

##### D.1 目标

根据 §2.6 的数据查询分层原则，统一所有产品线的用户端市场查询到 `supplier_device`，消除 `supplier_device`（裸金属）vs `supplier_gpu_inventory`（K8s 产品线）双表分治。运营后台容量看板单独查 `device_availability_snapshot`。

##### D.2 用户端市场查询 dataaccess

新建 `apps/gpus/src/lib/server/dataaccess/unified-market.ts`：

```typescript
// getMarketList({ productLine, ...filters, page, pageSize })
//   → PaginatedResult<MarketItem>
//
// 查询逻辑：
//   1. FROM supplier_device WHERE lifecycle_status = 'listed'
//      AND listing_disabled = false AND in_maintenance = false
//   2. productLine 过滤:
//        bare_metal → (无额外条件, lifecycle_status='listed' 即满足)
//        cloud_vm/serverless/job/inference → EXISTS compute_node (lifecycle_status='online')
//   3. JOIN gpu_card_type, data_center 获取展示字段
//   4. LEFT JOIN supplier_card_list_price 获取实时价格
//   5. 按 data_center × gpu_card_type 聚合（stock = 同配置设备数）
//   6. ORDER BY gpu_count DESC
```

##### D.3 运营后台容量看板 dataaccess

在 `apps/web/src/lib/server/dataaccess/scheduling/snapshots.ts` 中实现：

```typescript
// getCapacityDashboard()
//   → 从 device_availability_snapshot 聚合
//   → 按 pool × gpu_card_type × data_center 分组
//   → 返回各维度的设备数、GPU 总数、分配率
```

##### D.4 迁移策略

无需特性开关。直接切换：

1. 新建 `unified-market.ts`，查询 `supplier_device`
2. 修改 `console/metal/list`、`console/server/list`、`console/serverless/list` 页面的数据源，从硬编码/旧查询切换到 `unified-market.ts`
3. 运营后台「容量看板」直接查 `device_availability_snapshot`
4. 移除 `supplier_gpu_inventory` 表的查询逻辑（该表保留但不再被用户端查询）

##### D.5 涉及页面

| 页面 | 当前数据源 | 切换后 |
|------|-----------|--------|
| `console/metal/list` | 硬编码 `METAL_DEVICES` | `supplier_device`（实时查询） |
| `console/server/list` | 硬编码 `MARKET_OFFERINGS` | `supplier_device` + `compute_node` |
| `console/serverless/list` | 硬编码 `MARKET_OFFERINGS` | `supplier_device` + `compute_node` |
| 运营后台「容量看板」 | 新增模块 | `device_availability_snapshot`（近似） |

##### D.6 验证方法

1. 并行运行新旧查询（保留旧代码 1 周），对比返回的设备数、价格
2. 运营后台验证容量看板数据与实际 `supplier_device` 状态一致
3. 确认无差异后移除旧查询代码和硬编码数据

---

#### Phase E — 抢占优化（5 天）

##### E.1 GPU 级抢占

当前抢占目标是整台物理机。优化为 GPU 粒度：

```
VIP 请求 N GPU
  → 查询 elastic pool 中 allocatable_gpu_count >= N 的设备
    → 有 → 直接分配
    → 无 → 查找有足够总 GPU 但有低优先级占用的设备
      → 按优先级从低到高选择工作负载驱逐，释放恰好 N 个 GPU
      → 重新分配给 VIP 请求
```

不驱逐整机，只驱逐所需数量 GPU 对应的工作负载，优先选择驱逐 GPU 数最少的设备组合。

##### E.2 主动调度触发

| 触发条件 | 频率 | 操作 |
|---------|------|------|
| 定时全量评估 | 每 5 分钟 | `refreshAllSnapshots()` |
| 设备 opsStatus 变更 | 事件驱动 | `refreshDeviceSnapshot(deviceId)` |
| 调度规则变更 | 事件驱动 | `refreshAllSnapshots()` |
| 容量阈值告警（pool 可用 GPU < 10%） | 事件驱动 | 触发池间迁移 |

##### E.3 分级抢占规则

在 seed 数据中补充抢占保护规则（§2.3.3 规则 4 + 新增）：

| 抢占等级 | 规则 | 说明 |
|---------|------|------|
| L0 | VIP production/inference — can_be_preempted: false | 不可抢占 |
| L1 | enterprise production — can_be_preempted: false | 不可抢占（紧急除外） |
| L2 | 普通 on_demand — 可迁移到其他设备 | 保持运行 |
| L3 | batch/experiment — can_be_preempted: true, notice: 60s | 可抢占 |
| L4 | spot — can_be_preempted: true, notice: 120s | 可抢占（保持现有） |
| L5 | idle 设备 — 随时回收 | 无需通知 |

---

#### Phase F — 可观测性与运维（后续迭代）

| 能力 | 方案 | 优先级 |
|------|------|--------|
| 调度决策日志 | 快照刷新时 pool 变更 → 写入 `scheduling_rule_change_log` | P0 |
| 容量看板 | `device_availability_snapshot` 聚合查询 → 运营后台图表 | P0 |
| 规则变更审计 | 增删改 + 启用/禁用 → `scheduling_rule_change_log` | P1 |
| 决策回放 | 记录 matchCondition + 匹配结果，支持"为什么这样调度"追溯 | P1 |
| 容量预测 | 基于 `device_platform_probe_snapshot` 历史数据预测趋势 | P2 |
| 自动扩缩 | 定时检测利用率 → 自动触发池间迁移 | P2 |
| **自动上下架** | **devicePlatformProbe 驱动: probe一致→auto-list, probe失败→auto-unlist** | **P1** |

##### F.1 监控指标

```typescript
interface SchedulingMetrics {
  snapshotRefreshDurationMs: number   // 全量刷新耗时
  devicesEvaluated: number            // 评估设备数
  poolTransitions: number             // 池间迁移次数
  preemptionEvents: number            // 抢占事件数
  orphanDevices: number               // 无规则匹配的设备数
  elasticPoolUtilization: number      // elastic 利用率 %
  dedicatedPoolUtilization: number    // dedicated 利用率 %
}
```

建议通过现有 Langfuse 基础设施上报。

---

#### Phase 汇总

| Phase | 内容 | 工期 | 涉及包 |
|-------|------|------|--------|
| **A. 数据库** | scheduling-schema.ts，tenant/computeBase 加字段，种子数据 | 2d | `@workspace/db` |
| **B. 调度引擎** | scheduling/ 模块：规则匹配、快照刷新、迁移编排 | 3d | `apps/web` |
| **C. 管理后台** | dataaccess + tRPC router + UI 页面 + 导航 | 3d | `apps/web` |
| **D. 市场查询统一** | unified-market.ts，用户端查 `supplier_device`，运营看板查快照 | 3d | `apps/gpus` |
| **E. 抢占优化** | GPU 级抢占，主动调度，分级策略 | 5d | `apps/web` |
| **F. 可观测性** | 调度日志、容量看板、监控指标 | 后续 | 跨包 |

##### 兼容性保证

- **Phase A-D 不破坏现有表结构**：`supplier_device`、`supplier_gpu_inventory`、`resource_pool_binding` 保持不变，`device_availability_snapshot` 从 `supplier_device` 派生
- **用户端查询直接查 `supplier_device`**：不依赖快照表，保证实时性
- **运营看板查快照表**：5 分钟延迟可接受，用于容量监控和调度效果评估
- **回滚路径**：用户端查询直接查 `supplier_device`，无需回滚；运营看板可降级到直接聚合 `supplier_device`
- **数据一致性**：`supplier_device` 是物理设备唯一真源；`device_availability_snapshot` 是调度视图；事务性分配走 `supplier_device` FOR UPDATE

---

### 2.8 核心表关系

```
┌─────────────────────┐     ┌──────────────────────────┐
│  billingTenant       │     │  computeBase             │
│  + tier             │     │  + task_category        │
│  + tier_features    │     │                          │
└─────────┬───────────┘     └────────────┬─────────────┘
          │                              │
          │  tier 作为                   │  task_category 作为
          │  匹配条件输入                  │  匹配条件输入
          │                              │
          ▼                              ▼
┌──────────────────────────────────────────────────────────┐
│               resource_scheduling_rule                   │
│  tenant_tier[] + product_line[] + billing_mode[] +      │
│  task_category[] (结构化列)                              │
│  match_extra (JSONB) + action (JSONB)                   │
│  scope (global|data_center|supplier)                    │
└──────────────────────────┬───────────────────────────────┘
                           │ 调度引擎加载 →
                           ▼
┌──────────────────────────────────────────────────────────┐
│              device_availability_snapshot                │
│  从 supplier_device 派生，定期全量刷新                    │
│  pool | priority_class | weight | preemptible           │
└──────────────────────────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
   ┌──────────┐    ┌──────────┐    ┌──────────┐
   │ elastic  │    │ dedicated│    │ idle     │
   │ 池       │    │ 池       │    │ 池       │
   │ cloud_vm │    │ bare_    │    │ 待调度   │
   │ serverless│   │ metal    │    │          │
   │ job      │    │ VIP专属  │    │          │
   │ inference│    │          │    │          │
   └──────────┘    └──────────┘    └──────────┘
```

快照刷新流程：

```
cron(5min) / 事件触发
     │
     ▼
┌──────────────────┐
│ pg_try_advisory_ │  ← 分布式锁防并发
│ lock(...)        │
└────────┬─────────┘
         │ 获取锁成功
         ▼
┌──────────────────┐
│ 加载所有 enabled  │
│ 规则 (priority    │
│ DESC)            │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 遍历 supplier_    │
│ device (available │
│ + in_use)        │
└────────┬─────────┘
         │ 逐设备 evaluateDevice()
         ▼
┌──────────────────┐
│ UPSERT            │
│ device_availabil- │
│ ity_snapshot     │
└────────┬─────────┘
         │ pool 变更？
         ▼
┌──────────────────┐
│ migration-executor│  ← Karmada drain/
│                   │     cordon/uncordon
└──────────────────┘
```
---

## 三、总结对比

| 维度 | 当前方案 | 优化方案 |
|---|---|---|
| 池模型 | 静态 K8s vs 裸金属二选一 | 统一池 + 动态分配（弹性/专属/闲置） |
| 调度决策 | ops_status 硬编码 | 规则引擎（结构化列 + JSONB），运营后台可配置 |
| 租户感知 | 无 | tier × task_category → priority_class |
| 抢占粒度 | 整台物理机 | GPU 级别 |
| 抢占触发 | 用户下单时被动 | 定时 + 事件驱动主动评估 |
| 市场查询 | 双表分治（supplier_device / supplier_gpu_inventory） | 用户端统一查 `supplier_device`；运营看板查快照 |
| 数据一致性 | 无 | 事务性分配走 `supplier_device` FOR UPDATE，快照仅用于运营看板 |
| 可观测性 | 无 | 规则变更历史 + 容量看板 + 规则冲突检测 |
| 兼容性 | — | 不破坏现有表结构，增量演进 |

---

## 四、与现有文档的关系

| 文档 | 优化后的引用关系 |
|---|---|
| `../../business/product-line-taxonomy.md` | 不变，采纳其 product_line × billing_mode × commitment 模型 |
| `spot-preemption-design.md` | **协同**：L4 抢占策略由规则引擎驱动；`idc_capacity_window` 作为规则引擎闲时窗口的数据源（§2.3.5） |
| `serverless-implementation.md` | 不变，interruptible 迁移仍由 Karmada 执行 |
| `supplier-device-ops-pool-masterdata-design.md` | **替代**：ops_status 静态池归属 → 调度引擎动态计算 |
| `multi-idc-federation.md` | 增强：规则支持 data_center 和 supplier 级别作用域 |
| `../../business/bare-metal-order-commercialization.md` | 事务性分配走 `bare_metal_order` + `supplier_device` FOR UPDATE（§2.3.7） |
