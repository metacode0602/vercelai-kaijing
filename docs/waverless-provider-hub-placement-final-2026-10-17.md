# ProviderHub + Placement + Slice — 设计（拼池目标版）

> **日期**: 2026-10-17（Asia/Shanghai）；**2026-10-17 晚** 拼池目标 + **§8 拍板已锁定**。  
> **状态**: **生效 / 可编码**（M1 已落地；**M2a 共绩多区拼池** 为下一实现权威）  
> **关联**: [`waverless-product-decisions-2026-10-17.md`](./waverless-product-decisions-2026-10-17.md) #7、[`waverless-autoscaler-provider-decoupling-2026-10-17.md`](./waverless-autoscaler-provider-decoupling-2026-10-17.md)、推荐文 §10.14 / §10.19  

---

## 0. 产品目标（North Star）

用户只指定 **卡型、每 Worker 卡数、min/max 副本、计费、逻辑镜像**；**不**指定 Provider、共绩物理区。

平台在 **一个 Endpoint、一条统一队列** 下，当 **单区或单厂库存不足** 时，应能 **自动把 desired 副本拆到多个 slice**（每个 slice = 一个 `provider_id` + 一个 `physical_region` + 厂侧一份 deployment 资源，如 Gongji 一个 `task_id`），使 **Σ slice.desired ≤ endpoint.desired**，且 **Σ 可用库存 ≥ 扩容需求**（在配置与合规约束内）。

**典型验收场景（你方举例）**：

- 2×4090 / Worker，`minReplicas=0`，`maxReplicas=10`（10 个 Worker，共 20 张 4090 等价算力，见 §待确认 #1）。  
- 库存：共绩 A 区 10 卡、PPIO 8 卡、仙宫 4 卡（均为可售 4090 池）。  
- **期望**：队列压力触发扩容时，平台按 **价 + 库存 + 镜像成本** 把 Worker **分配到三个 slice**，而不是卡在单区 10 或单厂。

**共绩仅多区域**（同厂、不同 `physical_region`）是拼池的 **子集**：算法相同，仅 `provider_id` 相同、`region` 不同。

---

## 1. 与当前实现（M1）的关系

| M1 已交付 | 拼池目标（M2） |
|-----------|----------------|
| `ProviderHub` + `providers.deployments[]` | 保留 |
| 创建时 `Placement.Select` → **1 条** offer | 改为 **`Placement.Allocate` → 多条** offer 或扩缩时 **增量 Allocate** |
| DB partial unique：**每 Endpoint 1 个 active slice** | **删除/放宽**；允许多个 `status=active` slice（不同 region 或不同 provider） |
| Autoscaler → 单次 `ScaleApp(endpoint, desired)` | → **`ReconcileSlices(endpoint, desired)`**：按 slice 分别 `ScaleApp` |
| Gongji catalog → `provider_offers` | 保留；PPIO/仙宫 offer 同步 **与 adapter 同里程碑**（见 §3） |
| `regionAllowlist` 多选 | **过滤候选**，仍参与 **拼池分配**（不是「只选一家」） |

M1 代码路径保留为 **`placement_mode=pin`** 或配置 **`pooling.enabled=false`** 时的降级行为（单 slice）。

---

## 2. 里程碑（修订）

| 阶段 | 交付 | 说明 |
|------|------|------|
| **M1** ✅ | Hub、单 slice、创建选一家 | 已实现；文档上降级为「拼池关」 |
| **M2a** | **共绩多区域拼池** | 同 `provider_id=gongji`，多 `physical_region` slice；Autoscaler 拆分；每区独立 `task_id` |
| **M2b** | **跨 Provider 拼池** | gongji + PPIO + 仙宫（+ 可选 novita）；依赖各厂 `CoreDeploymentProvider` + `provider_offers` |
| **M2c** | 库存触发的 **增量开 slice** | 已有 slice 顶满 `available_cap` 时，对 **新增 desired** 调用 Allocate，不迁移已在跑 Worker（除非 §5 failover） |
| **M3** | 暖机 / `ImageReady` / `T_switch≤90s` SLO | **可选**对外承诺；与拼池正交 |

建议 **工程顺序**：M2a（仅 Gongji 多区）→ 接 PPIO/仙宫 adapter（可与 M2b 并行）→ M2b → M2c failover 增强。

---

## 3. 配置（修订）

```yaml
providers:
  deployments: [gongji, ppio, xgy]
  metadata: postgres

placement:
  strategy: greedy_cost          # 单点选用；拼池用 allocation（见 §4）
  pooling:
    enabled: false               # 拍板：默认 false；M2 验收通过后商用再开
    max_slices_per_endpoint: 8   # 可配，防爆炸
    split_order: cost_then_cap   # cost_then_cap | cap_then_cost
  image_not_ready_penalty: 1.0
  allow_cold_start: true
  candidate_providers: []

gongji: { enabled: true, ... }
ppio:   { enabled: true, ... }
xgy:    { enabled: true, ... }
```

---

## 3.1 入口负载均衡：Traefik 与 Waverless 分工

**拼池不会变成「多个租户 URL」；Traefik 仍对一个 Endpoint 做一套 LB。** 多区/多厂只是 **更多 Worker（共绩 points）** 进入 **同一个 backend 池** 或 **同一套队列**。

| 层 | 职责 |
|----|------|
| **Waverless** | Autoscaler、ProviderHub：创建/扩缩/暂停/删除 Worker；维护 `endpoint → slices → workers` 与 ready/draining。 |
| **Gateway Controller** | 根据 Worker 就绪/下线事件，**更新 Traefik dynamic config**（增删 backend）；**一个 Endpoint 对应一条 router/service**。 |
| **Traefik** | 租户只访问 **一个** 平台 URL；把流量分到所有 **已 ready** 的 Worker——与 Worker 来自哪一区、哪一厂无关。 |

**拍板（2026-10-17）**：主模式为 **`http_service`** — Traefik **直打 Worker HTTP**；Waverless 在 **创建 / 删除（及 draining 下线）Worker** 后 **更新 Traefik dynamic config**（或 emit 事件由 Gateway Controller 写入，见 §8 #10）。同一 Endpoint **一条 router**，backend = 全 slice 的 ready Worker URL。

`queue_worker` 仍可作为其它 Endpoint 类型保留，但 **CN Serverless 拼池路径不以之为默认**。

**§8 #2 不是 Traefik 问题**：#2 指 **共绩控制面** 在多区域时是否需要 **多个 Deployment task**（每区一个 `task_id`）。Traefik 只消费 Waverless 汇总后的 **Worker 地址列表**；task 命名是 Gongji adapter 映射，与 LB 配置是两条线。

---

## 4. 核心接口（修订）

保留 `CoreDeploymentProvider`。**Hub** 新增/变更：

```text
PlacementService
  Select(ctx, req) (Decision, error)           # 保留：pin / 首 slice / 降级
  Allocate(ctx, req) ([]Allocation, error)     # 拼池：返回多行 (provider, region, sku, count)

Allocation
  ProviderID, PhysicalRegion, ProviderSkuID, LogicalAzID, ResourceMark
  Replicas int          # 本 slice 应承担的 Worker 数
  UnitCost, OpenCost, Score

ProviderHub
  ReconcileSlices(ctx, endpoint, desiredReplicas int) error
  ScaleSlice(ctx, sliceID, replicas int) error
  CreateSlice(ctx, endpoint, alloc Allocation, req CreateReq) (slice, error)
  ListActiveSlices(ctx, endpoint) ([]Slice, error)
```

**Allocate 算法（greedy_cost + cap，与 §10.14 一致）**：

1. 输入：`gpuType`、`gpuCountPerWorker`、`targetWorkers`（= endpoint desired）、`billingMode`、`regionAllowlist`、合规域。  
2. 从 `provider_offers` 取候选行：`available_cap` = **可再分配的 Worker 槽位数**（`floor(空闲 GPU / gpuCountPerWorker)`）；过滤 allowlist / `candidate_providers`；**CN 池不含 Novita**。  
3. 按 **有效单价** `unit_price + open_cost(image, provider, region)` 排序。  
4. **贪心**：依次取 offer，分配 `min(剩余 desired, available_cap)` Worker 到一条 Allocation，直到 `desired=0` 或候选耗尽。  
5. 若 `Σ allocated < desired`：扩缩决策 **仍可为 desired**，但标记 `capacity_shortfall` 事件（现有 queue/wait-age 继续；不静默失败）。

**Autoscaler 执行**：

```text
desired := DecisionEngine(endpoint)
ReconcileSlices(endpoint, desired)
  for each active slice: ScaleSlice(slice, slice.desired)
  if sum(slice.desired) < desired && pooling.enabled:
    newAllocs := Allocate(desired - sum(slice.desired))
    CreateSlice + Deploy/Scale  for each newAlloc
```

**Gongji 约束（拍板 #2）**：**一个共绩 Deployment task ↔ 一个物理区**（一个 `resource_mark` / 区）。多区 = 多 slice = 多 task；**task 名与 gpus `name` / 映射见 §8.1**，`slice.provider_ref = task_id`。每 task 扩缩 **points**（Worker）；**多卡同机** — Worker 为调度原子，拼池只在 **Worker 粒度** 拆分。

**Traefik（拍板 #10）**：Worker ready → 将 `backendURL` 加入该 Endpoint 的 Traefik service；Worker 删除/drain 完成 → 移除 backend；**按 endpoint 聚合**，不按 slice 暴露多个公网 URL。

**缩容（拍板 #8）**：`ReconcileSlices` 减少 desired 时，**价高（unit_cost 高）的 slice 优先缩**，同价可按 LIFO。

**队列**：仍 **仅按 endpoint** 拉取；Worker 带 `slice_id` / `provider_id` 归因，**不按厂拆队列**。

---

## 5. 数据模型（修订）

**endpoints**

- `active_slice_id` → **deprecated**；改为 **`desired_replicas`**（endpoint 级，已有 replicas 可对齐）+ 可选 **`observed_replicas`** 聚合。  
- **`endpoint_mode`**：`queue_worker` | `http_service`（拍板默认 **http_service**）。  
- **`external_endpoint_id`**（若与 `endpoint` 列分离）：存 gpus `computeBaseId`，与 [`buildCreatePayload`](../../apps/gpus/src/lib/server/services/waverless.ts) 一致。  
- `region_allowlist`：拼池时 **限制候选 offer**，不限制 slice 个数。

**endpoint_provider_slices**

- 允许多行 `status=active`；唯一键建议 `(endpoint, provider_id, physical_region, provider_sku_id, gpu_count)` 或 `(endpoint, slice_key)`。  
- **删除** M1 partial unique `(endpoint) WHERE status='active'`（迁移 `008_pooling_multi_slice.sql`）。

**provider_offers**

- 增加字段（可选）：`cap_unit` enum `worker|gpu`（见 §待确认 #1）。  
- `available_cap` 刷新：Gongji catalog、PPIO/仙宫 adapter 轮询。

**workers**

- `provider_id`, `slice_id` **必填**（新 Worker）。

---

## 6. 对 apps/gpus

- 创建：继续传 **`externalEndpointId`** + **`name`**（用户输入）+ 镜像/弹性/卡型；**不传 provider/单区**（`placementMode=auto`）；可选 **`endpointMode: http_service`**。  
- Waverless 返回 **`publicUrl`**（Traefik 入口）+ **`slices[]`**（运营可见；租户 UI 可折叠）。  
- 映射：**Cloud 只记 `externalEndpointId`**；多 Gongji task / 多区由 waverless slice 表维护，gpus 不维护厂侧 task_id 列表。

---

## 7. 验证（M2）

1. Mock offers：gongji/hebei cap=10、gongji/shanghai cap=10、desired=15 → 两 slice，Σ=15。  
2. 三厂 10+8+4，desired=10，2 卡/Worker → 三 slice 分配符合 greedy 价序且不超过各 cap。  
3. 单 slice 顶满后扩容：仅 **新开** slice，旧 slice desired 不变（M2c）。  
4. `pooling.enabled=false` 行为与现 M1 一致。

---

## 8. 已拍板（2026-10-17）

| # | 决策 | 实现要点 |
|---|------|----------|
| **1** | `maxReplicas` = **Worker 个数** | `provider_offers.available_cap` 用 **Worker 槽**；`floor(空闲GPU / gpuCountPerWorker)` |
| **2** | **一个共绩 task ↔ 一个区** | 多区 = 多 slice = 多 task；**task 命名与映射见 §8.1**（以 gpus 创建字段为准，waverless 持久化映射） |
| **3** | **M2a 优先** | 先 **共绩多区域拼池**；M2b（PPIO/仙宫）后续 |
| **4** | `placement.pooling.enabled` **默认 false** | M2 验收后再开商用默认 |
| **5** | **不承诺** 90s failover / ImageReady SLO | M2c 仅 best-effort 增量开 slice |
| **6** | **多卡必须同机** | Worker 为调度原子；`gpuCountPerWorker>1` 时整 Worker 落在同一节点；拼池不拆单 Worker |
| **7** | **禁止混合规域** | 同一 Endpoint 不得 domestic + overseas 混跑 |
| **8** | 缩容 **价高 slice 先缩** | `unit_cost_snapshot` 降序 |
| **9** | **CN 拼池不含 Novita** | `candidate_providers` / domestic 注册表默认 gongji、ppio、xgy |
| **10** | **http_service + Traefik** | Worker 创建/删除后 **更新 Traefik backend**；单 Endpoint 单公网 URL；**Traefik 写入路径 §8.1** |
| **DB** | 允许多 **active slice** | 迁移 `008` 删除 M1 partial unique（随 M2a 实施） |

### 8.1 工程细节（2026-10-17 已确认）

**Traefik 配置写入（#1 两种均可）**

| 模式 | 行为 |
|------|------|
| **A. Waverless 直写** | Worker ready/remove 钩子内更新 Traefik file/HTTP provider（与现有「创建/删除 worker 后改配置」一致）。 |
| **B. Gateway Controller** | Waverless 发 **`WorkerReady` / `WorkerRemoved` / `WorkerDraining`**（含 `endpoint`, `externalEndpointId`, `workerId`, `backendURL`, `sliceId`）；Controller 幂等合并为 **单 Endpoint 单 router** 的 backend 列表。 |

实现可 **先 A 后 B** 或按环境切换；拼池只增加 backend 条数，两种模式语义相同。

**Gongji task 与 Cloud 用户输入（#2）**

- **来源**：`apps/gpus` 创建体 [`WaverlessCreateEndpointRequest`](../../apps/gpus/src/lib/server/services/waverless.ts) — `externalEndpointId`（= `computeBaseId`）、**`name`**（用户表单服务名）、`image`、`gpuSku` / `gpuCount`、`minReplicas` / `maxReplicas` 等；拼池后 **不再强制** 租户传 `logicalAzId` / 单厂绑定（auto placement 时由 waverless 选区）。  
- **Waverless 权威映射**（须持久化，可审计）：

```text
externalEndpointId  →  endpoints.endpoint（或唯一内部 id）
name                →  endpoints.display_name / 租户可见名
slice               →  provider_ref (Gongji task_id), physical_region, logical_az_id
worker              →  vendor point_id, backendURL, slice_id
```

- **共绩 `task_name`**：以创建请求中的 **`name`**（或平台生成的 **`endpoints.endpoint` 字符串**，与 gpus 约定一致）为 **主键语义**；**同一 Endpoint 第二及以上 slice（其它区）** 在 waverless 内部生成 **稳定衍生名**（如 `{name}--{logicalAzId}` 或 `{endpoint}--{sliceId}`），**仅写入 Gongji/OpenAPI**，不要求用户再填。  
- **不要求用户感知** 多 task；gpus 只持有一个 `externalEndpointId` + `name`。

**Endpoint 模式（#3）**

- 表字段 **`endpoint_mode`**：`queue_worker` | **`http_service`**（CN Serverless **默认 `http_service`**）。  
- `http_service`：Traefik 直打 Worker；`queue_worker`：Traefik → Waverless API，Worker 拉队列。  
- gpus 创建时可传 `endpointMode: "http_service"`（控制面扩展字段）；未传时 waverless 对 domestic Serverless 默认 **http_service**。

**M2a 工程顺序（锁定）**：`008` 迁移（含 `endpoint_mode`）→ 映射表/slice 完善 → `Allocate` + `ReconcileSlices` → Gongji 多 task/区 → Worker↔Traefik（A 或 B）→ 验收后 `pooling.enabled` 可改默认 true。

---

## 9. 文档索引

| 文档 | 关系 |
|------|------|
| **本文** | Hub / Placement / **拼池** 实现权威 |
| 推荐文 §10.14 | 9×4090 拼池场景与 failover 叙事 |
| 推荐文 §10.19 | M1 初稿（单 slice 段落由本文 supersede） |
| M1 已写代码 | `apps/waverless` `pkg/hub`、`pkg/placement` — 按 §1 演进 |
