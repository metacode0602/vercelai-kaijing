# Waverless 与 gpurun/cloud（SkyPilot）结合可行性评估与推荐

> **日期**: 2026-10-17（Asia/Shanghai）；同日清理回写。  
> **范围**: 本地已克隆仓库分析。  
> **现行权威**: 一期范围以 [`waverless-product-decisions-2026-10-17.md`](./waverless-product-decisions-2026-10-17.md) 为准；Autoscaler/Gongji Provider 以 [`waverless-autoscaler-provider-decoupling-2026-10-17.md`](./waverless-autoscaler-provider-decoupling-2026-10-17.md) 为准。  
> **本文角色**: **§9–§10** 为目标架构与国内供给设计（与拍板冲突处以拍板为准）；**§1–§8** 为早期「Waverless + SkyPilot 可行性」分析，**P0 供给/计费口径已被 §9–§10 + 拍板取代**，不得再按 §6.2 的 Novita-P0 /「先粗后细」开工。  
> **仓库**:
> - Waverless: 独立仓库 `https://github.com/gpurun/waverless.git`（fork of WaveSpeedAI/waverless）；开发联调时 clone 到 cloud 的 `apps/waverless`（**非** monorepo 永久合并）
> - Cloud: 本仓库（`openroute-cloud` / gpus 线）

---

## 1. 结论（能否结合、推荐路径一句话）

> **§1–§8 阅读说明（2026-10-17 清理）**：本节至 §8 写于国内 Gongji 拍板之前，当时以 **Novita 海外路径**验证「无自建 GPU K8s」。**现行 P0 供给是共绩 Gongji + waverless 路径**（见 §9.6、§10、拍板 #4）；计费是**客户收入账 ≠ 供应商成本账**（拍板 #8/#11），不是 §6.2 的「先粗后细」。分层结合（Waverless 管任务型编排、SkyPilot 管闲时/VM/Job）这一架构结论仍然成立。

**能结合，且值得结合——但不要用 Waverless 替换 SkyPilot 全栈。**

推荐路径：**把 Waverless 作为「推理 / 任务型 Serverless 编排层 + 多 Provider 弹性 Worker 面」引入；SkyPilot 继续负责自有 IDC 上的多集群 VM / Job / 训练类调度。** 若目标强调「用户与平台都不必为推理自建/运维 GPU K8s，而直接借第三方 GPU 云商（如 Novita）」，则优先启用 Waverless 的 **Novita（及可扩展的同类）Provider 路径**，与 Cloud 现有「供应商闲时卡 → 自建边缘 K8s → SkyPilot」供给模型**并行**，而不是互相替代。

一句话：  
**分工清晰——Waverless 管「统一入口 + 队列 + 弹性 Worker」；SkyPilot 管「自有多 IDC 算力池上的 VM/Job」；第三方云商 GPU 走 Waverless Provider，闲时自有卡仍走 SkyPilot/资源池。**

---

## 2. Waverless 能力摘要

### 2.1 定位与架构

依据 `waverless/README.md`、`docs/ARCHITECTURE.md`：

- **定位**：高性能 Serverless GPU **任务编排**系统（非完整云平台）。
- **核心模式**：**Pull-based**——Worker 主动拉取任务，利于负载均衡与缩容排空。
- **兼容性**：RunPod 兼容 API / SDK，便于迁移（`POST /v1/:endpoint/run`、`runsync`、`GET /v1/status/:task_id`）。
- **控制面**：API Server + Task / Worker / Endpoint Service + Autoscaler；存储为 **MySQL（元数据）+ Redis（队列 / 分布式锁）**。
- **统一入口**：客户端只打 Waverless API，**不感知节点调度**；调度结果体现在 Worker 拉取与 Provider 扩缩容。

数据流（摘要）：

```
Client → Router → Task Service → MySQL + Redis Queue
                                      ↑ pull
Worker ←── Provider 管理的副本（K8s Pod / Novita Worker / Docker）
Autoscaler（约 30s）→ Provider.ScaleApp
```

### 2.2 Provider 抽象

依据 `pkg/provider/factory.go`、`pkg/interfaces/deployment.go`、`pkg/provider/{k8s,novita,docker}`：

| Provider | 注册名 | 用途 | 生命周期 |
|----------|--------|------|----------|
| Kubernetes | `k8s` / `kubernetes` | 生产（自有/托管集群） | Informer 全量事件 |
| Novita Serverless | `novita` | **第三方 Serverless GPU**，平台不运维 GPU 节点 | 轮询（默认 10s） |
| Docker | `docker` | 本地开发 | 基础 |

配置切换见 `config/config.example.yaml`：

```yaml
providers:
  deployment: "k8s"  # k8s | docker | novita
novita:
  enabled: false
  api_key: ""
  base_url: "https://api.novita.ai"
```

**要点**：Waverless **具备** K8s Provider，但 **不是「只能跑在自建 K8s」**。切换 `deployment: novita` 后，Worker 由 Novita 托管扩缩，控制面只需 MySQL/Redis + Waverless 进程（可用 docker-compose，见 README Quick Start）。

Novita 路径已知差异（`pkg/provider/novita/README.md`）：无 Pod YAML/PVC 级操作、日志走 Novita Console、副本变更靠轮询而非 Informer。

### 2.3 弹性扩缩容

依据 `docs/USER_GUIDE.md` §4、`pkg/autoscaler/*`：

- **触发（代码现状）**：队列深度 `pendingTasks >= scaleUpThreshold` 扩容；空闲 `idleTime >= scaleDownIdleTime` 缩容（可 **scale-to-zero**，`minReplicas=0`）。**等待时长尚未进入决策**（`WaitingTime` 仅为观测；P0 须补真实 wait-age，见 §10.2 / 拍板 #2）。
- **约束**：maxReplicas、冷却；K8s 路径还有集群 GPU/CPU/内存上限（**外采 Provider 不得用这套静态账本卡住**，见解耦方案）。
- **优先级 / 抢占**：高优先级先拿资源；可对低优先级空闲 Worker 抢占；饥饿保护（默认约 5min 提升优先级）。
- **执行**：Autoscaler → `DeploymentProvider.ScaleApp`（对 Novita 即调其 min/max worker API）。**初始化现状仍依赖 `K8s.Enabled`**，P0 必须拆掉（拍板 #6）。

### 2.4 统一请求入口

依据 `app/router/v1_routes.go`、`v2_routes.go`（Worker 侧）：

| 角色 | 路由 | 说明 |
|------|------|------|
| 用户 / SDK | `POST /v1/:endpoint/run`、`runsync` | 异步 / 同步提交 |
| 用户 | `GET /v1/status/:task_id`、`POST /v1/cancel/:task_id` | 状态与取消 |
| Worker | `/v2/:endpoint/job-take|ping|job-done/...` | 拉取、心跳、回写 |

用户侧只需 Endpoint 名 + API；**节点选址、副本数、Provider 类型对调用方透明**（管理面另有 `/api/v1/endpoints`、autoscaler 配置）。

### 2.5 与「无自建 K8s」的关系（表述需精确）

| 层面 | 是否需要自建 GPU K8s |
|------|---------------------|
| Waverless **控制面** | 不需要 GPU 集群；需进程 + MySQL + Redis |
| **Worker（K8s Provider）** | 需要某处有 K8s（自建 / 托管 ACK/EKS） |
| **Worker（Novita Provider）** | **不需要**平台自建 GPU K8s；算力在 Novita |
| 用户 | 始终不运维集群，只调 API |

因此：若问题是「用户不用建 K8s」——两边设计都满足；若问题是「**平台也不用为推理建/运 GPU K8s，而直接用云商资源**」——**Waverless Novita（及同类 Provider）路径直接覆盖**，Cloud 现状文档主路径不覆盖（见下节）。

---

## 3. Cloud / SkyPilot 现有设计摘要

### 3.1 平台定位

依据 `apps/docs/content/design/cloud/00-overview.md`：

- 定位为 **类似 Novita 的闲时算力调度平台**：对接多个 **IDC 供应商** GPU，形成全局池。
- 主供给是 **供应商闲时卡 / 整租设备**（`supplier_device.cooperation_type = idle_time | whole_rent`，见 `gpus-database-and-skypilot.md`），**不是**「把 AWS/GCP/Novita 等公有云 Serverless 当一等供给」的已落地设计。
- 调度目标：**统一调度多 IDC 机房**（K3s/K8s 边缘集群 + Karmada 等），技术栈以 **SkyPilot + Capsule + Kueue/Volcano + Traefik + OpenMeter** 为主。

### 3.2 SkyPilot 角色

依据 `guid/06-skypilot-control.md`、`gpus-database-and-skypilot.md` §2、`capsule-skypilot-multi-tenancy.md`：

- SkyPilot 是 **多集群 GPU 发现与任务/服务生命周期** 控制面；安装校验以 `sky check kubernetes` 为主。
- 配置示例以 **Karmada/多 IDC kubeconfig contexts** 为主；云凭证（AWS 等）仅为注释级可选，**未作为主路径展开**。
- 产品交互：Task API → 余额冻结 →（可选镜像预拉）→ `POST /sky/api/job` 或 Serve；租户 Namespace 由 Capsule 懒创建。
- `apps/gpus/src/lib/server/services/skypilot.ts`：已有 Serve deploy/scale/stop/start/delete 的 **HTTP 封装骨架**，对接 `SKYPILOT_API_URL`。

### 3.3 Serverless / Inference 设计

依据 `serverless-implementation.md`、`serverless-inference.md`、`product-line-taxonomy.md`：

| 产品线 | 原语 | 入口 / 编排 | 计费 |
|--------|------|-------------|------|
| `serverless` | Deployment | SkyServe + 全局入口 sticky | GPU 时长 |
| `inference` | Deployment(s) | Traefik + SkyServe | Token / 请求 / GPU 时长 |
| `cloud_vm` / `job` | Pod+PVC / Job | SkyPilot job | 时长（Job 可 spot） |
| `bare_metal` | 物理机 | **不经 SkyPilot** | 时长 |

`serverless` 设计已采纳（含 interruptible 跨区），但 **`serverless-commercialization-gap.md`（2026-07-25）明确：商业化未就绪**——无真实 SkyPilot 调度闭环、无余额冻结扣款闭环、前端多为 Mock。Inference 同为设计文档级。

### 3.4 商业闭环与「闲时卡」

- **租户侧**：余额冻结 / 扣款 / 券（`tenant-balance-unification`、`@workspace/billing`）。
- **供给侧**：供应商设备台账、机房价、平台刊例价、分成结算。
- **Spot**：仅 `product_line=job` + `billing_mode=spot`（taxonomy 权威）；Serverless 的 interruptible **≠** Spot。
- **资源池**：`resource-pool-optimization.md` 仍围绕 **自有/供应商设备池与调度规则**，未定义「第三方 Serverless 云商」为库存源。

---

## 4. 目标对照：两边覆盖度

| 目标 | Waverless | Cloud / SkyPilot 现状设计 |
|------|-----------|---------------------------|
| **用户无需自建/运维 K8s** | ✅ 用户只调 RunPod 兼容 API | ✅ 用户走 Web/tRPC，不碰集群 |
| **平台无需为推理运维 GPU K8s，直接用云商 GPU** | ✅ **Novita Provider**（可再扩 RunPod 等） | ⚠️ 主路径是 **自有 IDC K8s**；公有云仅配置注释级；Serverless 实现缺口大 |
| **弹性 scale in/out** | 🟡 队列深度 + 优先级 + 可缩 0 已有；**wait-age 未入决策**；Autoscaler 初始化仍耦 `K8s.Enabled` | 🟡 设计有 min/max、SkyServe；**实现缺口**（gap 文档） |
| **统一请求入口，用户不关心节点调度** | ✅ `/v1/:endpoint/run` + Worker pull | 🟡 Inference 设计为 Traefik 统一入口；Serverless sticky URL；**未落地** |
| **多 IDC 闲时卡商业闭环** | ❌ 无供应商/余额/分成模型 | ✅ 设计主战场（部分已实现定价/库存表，Serverless 未闭环） |
| **Cloud VM / 裸金属 / 训练 Job** | ❌ 非产品范围 | ✅ SkyPilot + 裸金属订单路径 |

**对照结论**：四个用户体验目标中，「借第三方 GPU 云商 + 弹性 + 统一入口」**Waverless 现成能力更强**；「闲时供应商卡 + 多产品线商业闭环」**Cloud 设计更完整**。结合价值在于 **能力互补**，而非二选一。

---

## 5. 结合方案选项

### 方案 A：Waverless 作为 Serverless/推理编排层，SkyPilot 仍管多云/多 IDC 的 VM 与训练 Job（推荐主方案）

**形态**：

```
用户 / SDK
    │
    ├─ 推理 & 任务型弹性部署 ──► Cloud 控制台/计费 ──► Waverless API
    │                              │                      │
    │                              │                      ├─ Provider=novita → 第三方 GPU
    │                              │                      └─ Provider=k8s → 自有 IDC（可选）
    │
    └─ Cloud VM / Job / 训练 ────► Task API + 余额 ──► SkyPilot ──► 自有 IDC K8s
```

**优点**：

- 对齐 Waverless 强项（队列、pull、autoscaler、RunPod 兼容、Novita）。
- SkyPilot 继续服务已设计的 Capsule 租户、Job/VM、多 IDC——避免推倒重来。
- 可先用 Novita **绕过推理 GPU 集群运维**，同时保留日后把同一 Endpoint 切到自有 K8s Provider 的可能。
- 商业上：Cloud 仍可做租户余额、API Key、账单；对 Novita 侧做 **成本价 + 加价** 或「透传云商费用 + 平台服务费」（需新产品线/成本科目，见风险）。

**缺点 / 代价**：

- 两套编排运行时（Waverless + SkyPilot），运维与可观测要统一包装。
- Waverless 自带 MySQL/Redis 与 Cloud PostgreSQL 并存，需边界清晰（建议：任务队列状态可在 Waverless；租户/余额/订单只在 Cloud）。
- Traefik Inference 设计与 Waverless HTTP 入口需产品选型：**二选一做用户入口**，或 Traefik 反代到 Waverless。
- Serverless「长连接 Web 服务」与 Waverless「任务队列 Worker」语义不完全等同——**更适合 inference / 异步任务型**；任意常驻 Web Deployment 仍更贴近现有 SkyServe 设计。

**与商业闭环关系**：

- 闲时卡：继续走 SkyPilot/资源池；**不被迫改变**供应商合同模型。
- 第三方 GPU：新增「外采 Serverless」成本流，与 `supplier_*` 闲时结算 **并列**，避免硬塞进 `supplier_device`。

---

### 方案 B：以 Waverless Novita（及其他 Provider）为主路径，弱化/并行 SkyPilot 在 Serverless 上的职责

**形态**：Serverless/Inference **默认** `providers.deployment=novita`（或后续 RunPod/Vast 等）；SkyPilot **仅**保留 VM/Job（甚至 Serverless 阶段完全不接 SkyServe）。

**优点**：

- 最快实现「无自建 GPU K8s + 借云商」的演示与 MVP。
- 直接复用 Waverless 已实现的 Scale / Endpoint CRUD / RunPod API。
- 降低对 `skypilot.ts` Serve API 与 SkyServe 就绪度的依赖（gap 文档已标明未实现）。

**缺点**：

- 与 overview「自有 IDC 闲时池」叙事短期偏离；供应商闲时卡难直接喂给 Novita Provider。
- 自有卡若也要进同一套弹性推理，仍要维护 K8s Provider 或自研「IdleGPU Provider」。
- 对 Novita **强依赖**（配额、区域、价格、可用性、数据合规）。
- SkyPilot 在 Serve 上的设计资产阶段性闲置（可接受为「降级并行」）。

**与商业闭环关系**：

- 适合作为 **海外对照 / 早期验证通道**；**现行国内 P0 供给是 Gongji**（§10），不是 Novita。中长期仍需自有池（方案 A 的 K8s Provider 或 SkyPilot）消化闲时卡，否则平台沦为纯 reseller。

---

### 方案 C：只借鉴 Waverless 思路，不引入仓库

**借鉴点**：pull-based Worker、队列深度扩缩、RunPod 兼容门面、Provider 接口隔离、DRAINING/双检分配。

**在 Cloud 内自研**：Task API + Redis 队列 + Worker Agent + 对接 Novita HTTP + Traefik。

**优点**：数据模型 / 租户 / 计费原生一体；无 Go 服务与许可证/上游演进耦合（Waverless 为 MIT，耦合主要是工程成本）。

**缺点**：

- 重造已在 `pkg/autoscaler`、`pkg/provider/novita`、graceful shutdown 中验证过的能力；Serverless gap 已显示实现带宽紧张。
- 与「尽快无自建 K8s 上线模型部署」目标冲突。

**与商业闭环关系**：最好，但 **时间最差**；仅当合规禁止引入外部编排或强绑定 Cloud 单体时考虑。

---

### 方案对比小结

| 维度 | A 分层结合 | B Novita 优先 | C 只借鉴自研 |
|------|------------|---------------|--------------|
| 无自建 GPU K8s（推理） | ✅（Novita） | ✅ | 🟡 自研后才有 |
| 闲时卡消化 | ✅ SkyPilot 侧保留 | ⚠️ 弱 | ✅ 可自研 |
| 实现速度 | 中快 | 最快 | 慢 |
| 与现有设计一致度 | 高（产品线分工） | 中 | 最高模型、最低代码复用 |
| 双运行时成本 | 有 | 推理侧低、供给单一 | 无（但开发成本高） |

---

## 6. 推荐方案 + 分阶段落地

### 6.1 推荐

**采用方案 A，并用方案 B 的 Novita 路径作为 P0 供给落地手段**（即：架构上分层，供给上先第三方 Serverless）。

不建议：用 Waverless 替换 SkyPilot 做 Cloud VM/裸金属；也不建议在未验证前按方案 C 重写编排。

### 6.2 早期 P0 草案（**已被 §10 + 拍板取代，勿按此开工**）

> 原文以 Novita 海外路径做技术验证。**现行一期**：国内供给 = **Gongji**；编排 = **waverless 路径**（拍板 #4）；计费 = **两账 + immutable `priceSnapshotId` + Worker 区间 usage**（拍板 #8/#11）；弹性 = 队列 **或** 真实 wait-age，且 **不依赖 `K8s.Enabled`**（拍板 #2/#6）。用户入口最终形态（仅 Cloud 反代 vs 也可下发 Waverless URL）**仍开放**，实施计划 G1 允许两种并联调。

~~1. 运行 Waverless 控制面，`providers.deployment=novita`。~~ → 改为 `gongji`（§10.4 / 实施计划 W1）。  
~~2. Cloud 薄适配挂 `inference` 或 serverless 任务型子集。~~ → 产品线 taxonomy 码仍开放；创建时写 `orchestratorType=waverless`。  
~~3. 计费「先粗后细」、按 Novita 账单对账后扣款。~~ → **禁止**用供应商成本当售价、禁止无 snapshot 商用扣款；允许 shadow 不真实扣款。  
~~4. 只验队列积压扩容。~~ → 须同时验收 wait-age（单条 pending 也能唤醒）。

### 6.3 P1（与 SkyPilot / 闲时池合流）

1. 为自有 IDC 增加 Waverless **`k8s` Provider**（或 Worker 部署到已有边缘集群 Namespace），与 Novita **按 Endpoint 或按规格路由**。
2. SkyPilot 明确边界：`cloud_vm` / `job` /（可选）常驻 Web `serverless`；**任务型推理默认不走 SkyServe**。
3. 统一可观测：把 Waverless 扩缩事件、任务状态同步到 Cloud `compute_base` / 监控。
4. 评估是否实现「IdleSupplier Provider」（把闲时卡包装成类似 Novita 的 Deploy/Scale API）——仅当闲时卡要进入同一套 pull 模型时再做。
5. 产品文案区分：**外采弹性** vs **闲时自有池**，价格与 SLA 分开。

### 6.4 明确不做什么（本阶段）

- 不把裸金属订单迁到 Waverless。
- 不删除 SkyPilot 设计；不把 Spot 语义塞进 Waverless 优先级抢占（概念相近但计费/通知模型不同）。
- 不默认开 PR；本文件为本地评估交付物。

---

## 7. 风险与开放问题

| # | 风险 / 问题 | 说明 |
|---|-------------|------|
| R1 | **供给模型冲突** | Cloud 核心是供应商闲时卡；Novita 是外采。财务科目、合同、库存展示需新产品语义，避免污染 `supplier_*`。 |
| R2 | **Serverless 语义双义** | Cloud `serverless` = 常驻 Deployment；Waverless = 任务队列 Worker。合并前需产品定义，否则计费与 SLA 错位。 |
| R3 | **双控制面状态机** | Cloud `compute_base` 状态 vs Waverless Endpoint/Task 状态需映射表与对账任务。 |
| R4 | **多租户** | Waverless Endpoint 级隔离 ≠ Capsule Namespace；若 Worker 跑自有 K8s，仍要 Capsule/配额策略。 |
| R5 | **合规与数据驻留** | Novita 区域（如 docs 示例 `us-dallas-nas-2`）可能不满足国内客户；需区域策略。 |
| R6 | **SkyServe 已写设计** | 引入 Waverless 后需在文档中标注 Inference 编排权威实现，避免两队并行实现。 |
| R7 | **上游演进** | fork `gpurun/waverless` 与 WaveSpeedAI 上游的同步策略未定。 |
| R8 | **商业化缺口仍在** | 即使编排用 Waverless，Cloud 侧余额冻结、定价快照、前端去 Mock 仍必须做（见 gap 文档）。 |

**开放问题（需产品/架构拍板，本文不预设锁定）**：

1. 用户入口最终是 Traefik、Waverless 原生 API，还是二者串联？
2. 外采 GPU 挂在 `product_line=inference` 还是新建枚举（taxonomy 当前禁止随意新码，扩展需走权威文档修订）？
3. 自有闲时卡是否要进入 Waverless，还是长期只服务 VM/Job？
4. RunPod 兼容是否对外承诺为正式 API？

---

## 8. 附录：关键文件路径

### Waverless（独立仓 `gpurun/waverless`，联调路径 `apps/waverless`）

| 路径 | 用途 |
|------|------|
| `README.md` | 功能总览、架构图、Quick Start |
| `docs/ARCHITECTURE.md` | 组件、任务流、Autoscaler、存储 |
| `docs/USER_GUIDE.md` | 部署、配置、API、扩缩容参数 |
| `docs/DEVELOPER_GUIDE.md` | 代码结构、Provider 集成步骤 |
| `config/config.example.yaml` | providers / novita / autoscaler |
| `config/specs.yaml` | GPU Spec 与平台映射 |
| `pkg/provider/factory.go` | k8s / docker / novita 注册 |
| `pkg/provider/types.go` | Lifecycle 回调 |
| `pkg/provider/k8s/` | K8s Provider |
| `pkg/provider/novita/` | Novita Provider + README |
| `pkg/provider/docker/` | Docker Provider |
| `pkg/interfaces/deployment.go` | DeploymentProvider 接口族 |
| `pkg/autoscaler/` | manager / decision_engine / executor |
| `app/router/v1_routes.go` | 统一客户端入口 |
| `app/router/v2_routes.go` | Worker pull API |

### Cloud（本仓库）

| 路径 | 用途 |
|------|------|
| `apps/docs/content/design/cloud/00-overview.md` | 平台定位（闲时池 + SkyPilot） |
| `apps/docs/content/guid/06-skypilot-control.md` | SkyPilot 安装与 API |
| `apps/docs/content/design/cloud/gpus-database-and-skypilot.md` | DB + SkyPilot 交互 |
| `apps/docs/content/design/cloud/capsule-skypilot-multi-tenancy.md` | 租户 ↔ Capsule ↔ SkyPilot |
| `apps/docs/content/design/cloud/serverless-inference.md` | Inference + Traefik + SkyServe |
| `apps/docs/content/design/cloud/serverless-implementation.md` | Serverless 已采纳设计 |
| `apps/docs/content/design/cloud/serverless-commercialization-gap.md` | Serverless 未商业化差距 |
| `apps/docs/content/design/cloud/product-line-taxonomy.md` | 产品线权威枚举 |
| `apps/docs/content/design/cloud/compute-task-decoupling-analysis.md` | compute_base 分层 |
| `apps/docs/content/design/cloud/resource-pool-optimization.md` | 自有设备资源池 |
| `apps/docs/content/design/cloud/spot-preemption-design.md` | 闲时 Spot（仅 Job） |
| `apps/gpus/src/lib/server/services/skypilot.ts` | SkyPilot Serve 客户端骨架 |

---

## 文档元信息

- **作者**: Grok Bot（executor 子代理本地分析）
- **是否已开 PR**: 否（按任务要求，主交付为本地 MD）
- **是否已复制进 cloud/apps/docs**: 否（可选后续由人工决定是否作为 design draft 入库）

---

## 9. 补充：MVP 形态——合进 cloud 还是独立项目？（2026-10-17）

**用户目标**：先做 MVP——用户可发 LLM/Image 推理与批处理 Job，具备弹性扩缩容；同时并行搭建 GPU 闲时调度。第三方（RunPod / Novita 等）本身也提供 Job / Serverless / 云主机。

### 9.1 结论

**不建议把编排深度耦合进 `gpurun/cloud` 单体；也不建议从零新写一套。**

**最优：独立部署的编排服务（直接以 `gpurun/waverless` fork 为独立 Git 仓库/服务）+ Cloud 只做薄门面（租户、鉴权、计费、产品 UI、统一对外 API）。**  
**工程落位（2026-10-17 拍板）**：waverless **不是**把源码永久 monorepo 进 cloud；开发时把 `gpurun/waverless` **clone 到 cloud 工作区路径 `apps/waverless`** 做联调。实施计划里写的 `apps/waverless` 均指该 checkout，而非「已合并进 monorepo」。闲时调度仍在 Cloud / SkyPilot 路线并行推进，与 MVP 编排通过「产品线 / 供给通道」分流，而不是同一个进程/同一套表硬揉。

### 9.2 为什么「深耦合进 cloud」不是最优

| 问题 | 说明 |
|------|------|
| 技术栈与节奏 | Waverless 是 Go + MySQL/Redis 任务队列；Cloud 是 TS monorepo + PG。硬揉进 apps/* 会拖慢 MVP，且双存储边界糊掉。 |
| 供给语义冲突 | 第三方 RunPod/Novita 是外采；闲时卡是供应商合同/`supplier_*`。深耦合容易把外采塞进闲时结算模型。 |
| SkyPilot 职责 | Cloud 已有 VM/Job/闲时池设计；把第三方 Serverless 也塞进 SkyPilot 适配层，会放大未完成的 Serve 缺口。 |
| 失败隔离 | MVP 编排宕机不应拖垮门户/计费；独立服务可单独扩缩与回滚。 |

### 9.3 为什么「完全新项目从零写」也不是最优

- 弹性、pull Worker、RunPod 兼容入口、Novita Provider 已在 waverless 里有可运行骨架。
- 从零写等于方案 C，与「先有 MVP」冲突。
- **独立项目 ≠ 从零写**：独立项目应是 **waverless 服务化**，不是另起炉灶。

### 9.4 推荐落地形态（MVP）

```
用户 → Cloud（登录 / API Key / 余额 / 控制台）
         │  创建 Endpoint / 提交任务（薄适配）
         ▼
   Waverless 服务（独立仓库与部署）
         │  Provider: Novita / RunPod（后续）/ Docker
         ▼
   第三方 GPU 云商弹性 Worker

并行线（不挡 MVP）：
用户/运营 → Cloud → SkyPilot / 资源池 → 供应商闲时 IDC（VM/Job/后续自有推理）
```

**MVP 范围建议**：
1. **推理异步任务**（LLM/Image）：Waverless Endpoint + `/run` + 弹性（Novita 优先；RunPod 作下一 Provider）。
2. **批处理 Job**：同一套任务队列语义即可试点；与 Cloud 现有「SkyPilot Job / 闲时」产品入口分开标注（外采 Job vs 自有池 Job）。
3. **Cloud 耦合深度**：仅 HTTP/SDK 客户端 + 租户/订单/计费映射表；**不要**把 Waverless 源码永久 monorepo 进 cloud（联调路径=`apps/waverless` checkout，见 §9.1）。
4. **闲时调度**：按原 SkyPilot / 网关 / 合同闭环并行；P1 再考虑「Idle Provider」或自有 K8s Provider 接入同一编排面。

### 9.5 决策表

| 选项 | MVP 速度 | 与闲时并行 | 可维护性 | 建议 |
|------|----------|------------|----------|------|
| 深耦合进 cloud 单体 | 慢 | 易搅混供给 | 差 | ❌ |
| 独立 waverless 服务 + Cloud 薄门面 | 快 | 清晰分流 | 好 | ✅ |
| 全新自研编排项目 | 最慢 | 可清晰 | 未知 | ❌（现阶段） |
| 只用第三方控制台、Cloud 纯转售链接 | 最快但无统一入口/弹性自控 | 无关 | 弱平台 | 仅作临时演示，非产品 MVP |


### 9.6 双入口确认（2026-10-17 拍板）

**先实现 waverless 路径**：用户用第三方算力部署镜像。在 **本应用（cloud/gpus）+ waverless** 共同实现目标能力——弹性扩缩容、负载均衡、用户账单、供应商成本、镜像预热等。  
镜像预热列在目标能力里，但**一期不做实现**（见 §10.18 #1/#5）。旧 SkyPilot Serverless 入口并行保留时须 `orchestratorType` 分流，不静默改计费。

---

## 10. 国内 GPU 云：区域映射 + Provider 扩展（2026-10-17）

**背景**：Novita / RunPod 为海外厂商；国内业务需兼容国内 GPU 云。目标在独立 **waverless** 服务上完成（非深耦合进 cloud）。

**一期已锁定（拍板）**：P0 国内厂商 = **共绩云（Gongji）**；逻辑区域粒度 = **可用区（AZ）**；同逻辑区内多厂商 = **调度 + 有界 failover（目标/P1+，一期不实现、不对外承诺）**；异常 worker 终止 = **平台运维与租户均可**（租户仅限自有 Endpoint）。**一期不做镜像预热/暖机**。§10.13–§10.17 为**目标架构**，不是一期必做。详见 §10.10、§10.18 与 `waverless-product-decisions-2026-10-17.md`。

### 10.1 产品目标（验收口径）

| # | 目标 | 说明 |
|---|------|------|
| G1 | **区域映射** | 国内厂商机房/可用区 → waverless 规范逻辑 `region`（AZ 粒度）；按区域做资源适配与监测 |
| G2 | **国内 Provider** | 扩展 `pkg/provider/gongji`（或 `suanli`），与 novita/k8s/docker 并列；P0 = 共绩云 |
| G3 | **弹性** | 基于 **队列长度** 与 **等待时长** 自动扩缩容（含 scale-to-zero）；由 **waverless Autoscaler** 统一驱动 `ScaleApp` |
| G4 | **统一入口** | 用户只打 waverless `/v1/:endpoint/run|runsync|status`，不感知节点调度 |
| G5 | **定点摘除** | 支持按 **worker ID** 终止异常运行节点（drain → terminate）；运维全局 + 租户自有范围 |

### 10.2 与现有 waverless 能力对照

依据 waverless 独立仓当时 checkout：

| 目标 | 现状 | 缺口 |
|------|------|------|
| G3 队列长度扩缩 | ✅ Autoscaler：`pendingTasks` / `scaleUpThreshold`；空闲 `idleTime` 缩容 | Gongji 作为**独立 CoreDeploymentProvider**（对齐 Novita）实现可靠 `ScaleApp`（`change_points`）；**P0 须按** [`waverless-autoscaler-provider-decoupling-2026-10-17.md`](./waverless-autoscaler-provider-decoupling-2026-10-17.md) **拆掉对 `K8s.Enabled` 的初始化耦合**，使 Gongji Endpoint 在未启用 K8s 时仍可弹性 |
| G3 等待时长 | ⚠️ **待实现 / 决策引擎未读 WaitingTime**（观测字段或 `FirstPendingTime` ≠ 最老 pending 年龄策略） | **P0 必做 / 验收**：`pending >= threshold` **OR** `oldestPendingAge >= scaleUpWaitSeconds`（详见解耦方案 §C.2）；文档禁止再写「已参与决策」 |
| G4 统一入口 | ✅ RunPod 兼容 V1 API + Endpoint | Cloud 薄门面映射租户即可；**先走 waverless 路径**（§9.6） |
| G5 worker 定点终止 | ✅ 接口层有 `DeleteWorker` / `TerminateWorker`；Novita 有 `DrainWorker` | Gongji 实现 `TerminateWorker` → `delete_pod`（`point_id`）；暴露 worker_id ↔ point_id 映射；鉴权见 §10.7（gpus ownership） |
| G1 区域 | Novita：`specs.yaml` 的 `region` + `productId`；`ClusterID:=region` | 落地 **Region Registry**：逻辑 AZ ↔ Gongji 物理 `region` 标签（1:N） |
| G2 国内厂商 | 仅 `k8s` / `novita` / `docker` | 新增 `pkg/provider/gongji`（**peer Provider，非 K8s/非仅 SkyPilot**）+ Spec / Region 映射；注册名 `gongji`（后续 `autodl`/`ppio`/`xgy`） |
| 镜像预热 / 暖机 | 目标能力（§10.13–10.17） | **一期不做实现**（§10.18）；P0 不验收 WarmPlanner / ImagePreHeat |

### 10.3 推荐架构：逻辑 Region（AZ）+ 多 Provider 调度

```
用户请求 → Waverless 统一入口（Endpoint）
                │
                ├─ region = cn-hebei-az1 | cn-xinjiang-az1 | cn-beijing-az1 | ...
                │            （平台逻辑可用区，对用户可见）
                ▼
        Region Registry（配置/DB）
                │  maps 1:N to vendor physical tags
                ├─ provider=gongji   physical=hebeif-1       （河北一区，P0）
                ├─ provider=gongji   physical=xingjiangf-1   （新疆一区）
                ├─ provider=gongji   physical=beijing-jxq-p1 （北京一区）
                ├─ provider=<TBD>    physical=...            （P1 第二家国内厂商）
                └─ provider=novita   physical=us-dallas-...  （海外线，国内租户默认禁用）
                ▼
        Failover Scheduler（同逻辑区内按任务属性选厂商；失败则有界切换）
                ▼
        DeploymentProvider.ScaleApp / Deploy / TerminateWorker
                ▼
        区域内 Worker 池 + 监测（副本、队列、等待时长、健康、切换时延）
```

**原则**：

1. **用户与 Cloud 只认逻辑 `region`（AZ 粒度，如 `cn-hebei-az1`）**，不认各厂商原始 zone 字符串；平台自有命名权。
2. **平台定义的逻辑 region 与厂商物理 region 标签为 1:N**（同一逻辑 AZ 可对应一家或多家厂商的物理区）。
3. **一个 Endpoint 绑定：逻辑 region + 首选 Provider 列表（有序）+ 任务属性约束（GPU 型号、显存、QoS、合规、时延档、价格/库存）**。
4. **同逻辑区内多厂商 = 调度（非仅主备）**（**P1+ 目标**；P0 单厂单 AZ，创建时单 `ProviderBinding`）：按任务属性选择；Deploy/Scale 失败或持续不健康时，在 failover 时间预算内自动切到同逻辑区下一合格厂商；**不得跨合规边界**（domestic ↔ overseas）。控制面提案：detect+failover **≤ 90s**（仅对 `ImageReady` 新容量，**一期不对外承诺**）；在途请求在旧 Worker 上 drain。记录切换时延指标。
5. **海外 Provider（Novita/RunPod）与国内 Provider 并列**；国内租户/业务线通过策略禁止调度到海外 region（合规闸门放在创建 Endpoint 时）。
6. **监测按逻辑 region 聚合**，下钻到 `provider + physical_region + worker_id`。

### 10.4 Provider 扩展契约 + 共绩云（Gongji）Open API 映射

以 `pkg/interfaces` 的模块化接口为准。包名建议：`pkg/provider/gongji`（或 `suanli`）。

**Base URL**：`https://openapi.suanli.cn`  
**文档**：https://www.gongjiyun.com/docs/platform/openapi/zx3iwhbv1i8sxdkeiapcprxhn8d/  
**Apifox**：https://s.apifox.cn/6aa360d3-d8f2-471e-b841-3a35c33a7b7c  
**Apifox llms.txt**：https://s.apifox.cn/6aa360d3-d8f2-471e-b841-3a35c33a7b7c/llms.txt  
**厂商扩缩实践**：https://docs.suanli.cn/serverless/best-practices/api-autoscaling  
**实现参考（优先）**：https://github.com/suanleme/gongji-skills — 尤其 `suanli-deployment/`（`SKILL.md` + `README`）；实现 `pkg/provider/gongji` 时以此为客户端封装首选参考。

**鉴权 Header**：`token`、`version=1.0.0`、`timestamp`（毫秒）；生产环境另加 RSA `sign_str`（RSA-SHA256）。实验室可用 Token 模式。

**API 版本锁定（P0）**：只使用 **旧版 v1** 路径（下表）。**不要**对接更新的 Apifox task APIs（如 api-434983162 等）；若文档并存新旧两套，以本表 v1 为准。

#### Gongji API → waverless Provider 映射

| waverless | Gongji（旧版 v1） |
|-----------|-------------------|
| Deploy | `POST /api/deployment/task/create` → `data.task_id`；`resources[].mark` 来自资源搜索；`services` 填 image/ports |
| ScaleApp | `POST /api/deployment/task/change_points` `{task_id, points}` |
| ListSpecs / GetSpec | `GET /api/deployment/resource/search?task_type=Deployment&device_type=GpuDevice` → device + `regions[].region` / `region_name` / `price` / `inventory` / `mark` |
| ListApps / GetApp | `GET /api/deployment/task/search` |
| GetAppStatus | `GET /api/deployment/task/detail?task_id=` → `points` / `runing_points` / `billing_points` / `status`（亦可辅以 `task/search`） |
| ListWorkers（运维/映射） | `GET /api/deployment/task/points?tenant_id&task_id` → 列出 workers/pods；映射 `point_id` ↔ `worker_id`；可选 regions 过滤 |
| WorkerEvents（运维） | `GET /api/deployment/task/pod_event?point_id=` → worker 事件 |
| UpdateDeployment | `POST /api/deployment/task/update` |
| DeleteApp | `POST /api/deployment/task/stop` `{task_id}` |
| Pause / Recover（可选） | `POST .../pause`、`.../recover` |
| TerminateWorker | `POST /api/deployment/task/delete_pod` `{point_id}` — 平台 `worker_id` ↔ Gongji `point_id` |

**物理 region 示例**（来自厂商文档）：`hebeif-1`（河北一区）、`xingjiangf-1`（新疆一区）、`beijing-jxq-p1`（北京一区）。

**Region Registry 归属**：Gongji CRM / Open API **无**逻辑↔物理区域映射表；**waverless 自有 Region Registry**（见 §10.5）负责逻辑 AZ → 厂商 `physical_region` 标签。

**必选（Core）**：上表 Deploy / GetApp / ListApps / DeleteApp / ScaleApp / GetAppStatus / UpdateDeployment。  
**强烈建议**：`SpecProvider`（ListSpecs/GetSpec）、`TerminateWorker` + drain 语义、`task/points` 做 worker 清单与 ID 映射、`pod_event` 供运维、生命周期回调（Ready / NotReady / Draining / Terminated）。

**区域相关元数据（建议写入 DeployRequest / labels）**

- `region`：逻辑区（平台规范，如 `cn-hebei-az1`）
- `provider_region`：厂商物理区（如 `hebeif-1`）
- `sku` / `mark`：厂商规格标识（来自 resource search 的 `mark`）
- `worker_id`：平台侧唯一；与厂商 `point_id` 双向映射表（由 `task/points` 同步）
- `task_id`：Gongji 部署任务 ID（对应 waverless App）

#### 双 Autoscaler 警告（MVP 必须）

Gongji 创建任务支持 `dynamic_pod_strategy`（如 `queue_delay` / `queue_length`）。**MVP 须将 `switch: false`（或省略该策略）**，由 **waverless Autoscaler** 通过 `change_points` 驱动 `ScaleApp`，以保证跨厂商的队列/等待策略统一。  
**P1 选项**：再评估联邦 Gongji 原生扩缩（需解决双控冲突与策略对齐）。

### 10.5 区域 Registry 配置草样

```yaml
# config/regions.yaml（建议新增）
regions:
  - id: cn-hebei-az1
    display_name: 华北·河北一区
    locale: zh-CN
    compliance: domestic
    providers:
      - name: gongji                 # P0 共绩云
        physical_region: hebeif-1    # 河北一区
        enabled: true
        priority: 10
        monitor:
          poll_interval: 10s
      # P1：同逻辑 AZ 第二家国内厂商（TBD）
      # - name: <cn-vendor-2>
      #   physical_region: ...
      #   enabled: false
      #   priority: 20
  - id: cn-xinjiang-az1
    display_name: 西北·新疆一区
    locale: zh-CN
    compliance: domestic
    providers:
      - name: gongji
        physical_region: xingjiangf-1  # 新疆一区
        enabled: true
        priority: 10
  - id: cn-beijing-az1
    display_name: 华北·北京一区
    locale: zh-CN
    compliance: domestic
    providers:
      - name: gongji
        physical_region: beijing-jxq-p1  # 北京一区
        enabled: true
        priority: 10
  - id: global-us                 # 海外线，国内业务默认不可选
    compliance: overseas
    providers:
      - name: novita
        physical_region: us-dallas-nas-2
        enabled: true

# config/specs.yaml 扩展：同一逻辑规格可挂 Gongji mark + 后续第二厂商
specs:
  - name: gpu-l20-48g
    region: cn-hebei-az1
    providers:
      gongji:
        mark: "..."                 # 来自 resource/search 的 mark
        region: hebeif-1
      # <cn-vendor-2>:             # P1 TBD
      #   productId: "..."
      #   region: ...
```

> P0 仅启用 Gongji；同逻辑 AZ 的第二家国内厂商保持 TBD，P1 再填入并开启调度/failover。
>
> Region Registry 由 **waverless 配置/DB 拥有**（Gongji CRM 无区域映射表）；逻辑 id（如 `cn-hebei-az1`）→ Gongji 物理标签（如 `hebeif-1`）仅在本文件与平台配置中维护。

### 10.6 弹性策略（对齐目标 G3）

**已锁定（2026-10-17）**：**不启用各厂商自带弹性**；队列长度 / 等待时长扩缩容 **一律由平台 waverless Autoscaler** 通过各 Provider 的 `ScaleApp` 执行（共绩关 `dynamic_pod_strategy`；PPIO Endpoint 不依赖其 queue/concurrency policy 做真相源；AutoDL 仅用 `replica_num` 被平台改写）。

沿用现有 Autoscaler，国内默认建议：

| 动作 | 条件（可配置） |
|------|----------------|
| 扩容 | `pendingTasks >= scaleUpThreshold` **或** `waitingTime >= scaleUpWaitSeconds` |
| 缩容 | 无 pending 且 worker `idleTime >= scaleDownIdleTime`；允许 `minReplicas=0` |
| 冷却 | 扩缩后 cooldown，避免震荡 |
| 上限 | Endpoint `maxReplicas` + 区域级 GPU 配额（监测告警） |
| 执行 | Autoscaler → `ScaleApp` → Gongji `change_points`（**关闭**厂商侧 `dynamic_pod_strategy`，见 §10.4） |

**实现注意（2026-10-17 纠偏 + follow-up）**：决策引擎**尚未**把 WaitingTime / 真实 wait-age 读进扩容条件；不得按「已具备」验收。国内 **P0** 必须实现「长等待但单条 pending」也能触发 `ScaleApp`，并与队列长度 **OR** 条件联调（验收式见解耦方案 §C.2）。另：P0 须验证 **K8s 未启用时 Gongji Endpoint 仍可启动 Autoscaler**——Gongji 为独立 Provider，挂载条件见 [`waverless-autoscaler-provider-decoupling-2026-10-17.md`](./waverless-autoscaler-provider-decoupling-2026-10-17.md)（所有权在 waverless；执行只经 `ScaleApp`；与 SkyPilot legacy 分闸）。

### 10.7 统一入口、定点终止与鉴权（G4 / G5）

- **入口**：保持 waverless V1；Cloud 只发 Endpoint 创建与 API Key。用户无厂商控制台、无节点 IP。先实现 **waverless 路径**（§9.6）。
- **定点终止流程**：
  1. 监测/人工标记异常 `worker_id`
  2. `Drain`（停拉新任务，等在途结束或超时）
  3. `TerminateWorker(endpoint, workerID, reason)` → Gongji `delete_pod`（`point_id`）
  4. Autoscaler 视副本缺口决定是否补开新 Worker
  5. **写审计日志**（谁、何时、哪个 endpoint/worker、原因）
- **鉴权（已锁定，交叉引用 gpus ownership）**：
  - **租户终止只经 `apps/gpus`**：session → Endpoint **ownership** 校验 → 以 **service identity** 调 Waverless control API；禁止浏览器/租户持有 waverless 全局 API Key 直接终止。
  - **平台运维**经 `apps/web` admin/专用角色 → 同一 `TerminateWorker` 实现。
  - Waverless 只信任已认证 service principal 携带的 actor/tenant 断言；客户端传入的 tenantId/actorRole **不可**作为授权依据。
- **drain 后在途任务语义（已拍板）**：drain deadline 到期仍有在途任务时，**默认：标记失败可重试 + 事件可见**；禁止静默杀进程丢结果。须落 lifecycle/audit 事件。
- **preheat worker 契约（即使一期无预热）**：`purpose=preheat` 的 worker **不对租户列表/终止 API 暴露**；运维终止走独立 reasonCode/scope。
- **监测**：按 region 看板——队列长度、P95 等待时长、Ready/Draining 副本、按 worker 的失败率/心跳、**failover 切换时延**（failover 指标为 P1+ 目标）；异常 worker 一键终止 API 暴露给 Cloud 运维台（及租户自助范围）。

### 10.8 调度器：同逻辑区拼池 + Failover

> **阶段标注（2026-10-17 拍板）**：**9×4090 多厂拼池与有界 failover 是实现目标（P1+）**，一期可不做、**不对外承诺 90s failover**；P0 仍为单厂单 AZ。下文设计保留供后续实现。

Endpoint 绑定 **可并行的 provider 集合** + **任务属性约束**（GPU 型号、VRAM、QoS、合规、时延档、价格/库存）。

**两种模式**（按任务属性区分）：

| 模式 | 适用 | 行为 |
|------|------|------|
| **拼池（默认，推理/可分副本）** | Worker 彼此独立（waverless pull 模型） | 同一 Endpoint 下可 **同时** 在多家厂商开副本，Σ replicas = 目标容量 |
| **单厂独占** | 单容器要 N 卡紧耦合（多卡通信/单机 9 卡） | 只能调度到 **一家** 且单机/单任务能提供 ≥N 卡的供给；不够则排队或拒绝，**禁止跨厂拆一张逻辑作业** |

下列表格中的 failover 在拼池模式下仍适用（某厂持续失败则把它的份额迁到其他合格厂）。

| 触发 | 行为 |
|------|------|
| Deploy / Scale 失败 | 在同逻辑 region 内尝试下一合格 provider |
| 持续不健康（副本 Ready 不足、心跳失败等） | 同上；新容量切到备份厂商 |
| 在途请求 | 旧 Worker drain，不强制跨厂商迁移会话 |
| 合规 | **禁止**跨 `compliance` 边界（如 domestic → overseas） |
| SLO（默认提案） | **决策+Scale 下发 ≤ 90s**；**镜像冷启动另计**（见 §10.15）；90s 内只切到 `ImageReady=true` 的目标 |
| 可观测 | 记录 `failover_switch_latency` 等切换时延指标 |

### 10.9 与 Cloud / 闲时调度的关系（不变）

- **国内第三方云**：走 waverless Gongji Provider（本节省点）；P1 再挂第二家国内厂商。
- **供应商闲时卡**：仍 Cloud + SkyPilot 并行；P1 再评估「Idle Provider」挂到同一逻辑 region。
- **合规**：国内租户 Endpoint 创建时 `compliance=domestic`，禁止绑 `global-*` region。

### 10.10 已锁定决策（2026-10-17）

| # | 议题 | 锁定结论 |
|---|------|----------|
| 1 | P0 国内厂商 | **共绩云 / Gongji**；Base URL `https://openapi.suanli.cn`；包名建议 `pkg/provider/gongji`（或 `suanli`） |
| 2 | 逻辑 region 粒度 | **可用区（AZ）**；平台逻辑区 1:N 映射厂商物理 region 标签（如 `cn-hebei-az1` → `hebeif-1`） |
| 3 | 同区多厂商 | **产品方向锁定为「同区可调度 + 有界 failover」**（拍板 #7）：**一期不实现、不对外承诺**；P0 单厂单 AZ。90s 是 P1+ 控制面指标提案（仅 `ImageReady`），不是一期 SLO |
| 4 | 异常 worker 终止 | **平台运维 + 租户均可**；租户仅限自有 Endpoint；运维全局；统一走 `TerminateWorker`；**必须审计日志** |

**仍开放的工程项（非产品二选一）**：

- failover SLO 数值（90s）仅 P1+ 联调后确认，**一期禁止写入对客/销售话术**；
- 生产 RSA 密钥发放与轮换流程；
- 首批启用哪些逻辑 AZ（依据 Gongji 实时 inventory / 价格，从 `hebeif-1` / `xingjiangf-1` / `beijing-jxq-p1` 等选取）；
- P1 第二家国内厂商选型：候选 **AutoDL / PPIO Serverless / 仙宫云**（见 §10.12）；regions.yaml 暂 TBD；
- ~~P1 是否联邦厂商原生弹性~~ → **已否决**：各厂弹性均不启用，见 §10.6；
- 若厂商日后强制迁移到新版 task API，再评估升级路径（P0 锁定旧版 v1）。

### 10.11 落地顺序建议

| 阶段 | 内容 |
|------|------|
| P0 | 实现 `pkg/provider/gongji`（独立 Provider peer）；落地 `regions.yaml`（至少 1 个逻辑 AZ ↔ Gongji 物理区）；关闭厂商侧动态扩缩；**真实 wait-age 扩容（OR 队列）**；**Autoscaler 按解耦方案不依赖 `K8s.Enabled`**；验收 G3/G4/G5 + 审计；**计费两账** + 旧 `billServerlessStop`/cron **旁路或修复**；租户终止经 gpus ownership（§10.7）。**不含** WarmPlanner / ImagePreHeat。方案见 `waverless-autoscaler-provider-decoupling-2026-10-17.md` |
| P0.5 | Cloud 薄门面：只暴露国内逻辑 AZ；租户/运维终止 UI；（可选）最小 `image_bindings`——仍**非**一期强制预热 |
| P1 | 第二家优先 **AutoDL**（或 PPIO Serverless）；复制 Provider 模板；同逻辑区调度 + failover（目标 ≤90s，仅 `ImageReady`）；**拼池**；按需启动 WarmPlanner / 官方预热 |
| P2 | RunPod Provider（海外线）；闲时 Idle Provider 评估；预热成本归因与规模化 |

### 10.12 国内其他厂商统一封装评估（AutoDL / PPIO / 仙宫云）

**结论：可以。** 统一封装落在 waverless 已有的 **模块化 Provider 契约**（`CoreDeploymentProvider` + 可选 `SpecProvider` / `TerminateWorker`），每家一个包：`pkg/provider/gongji|autodl|ppio|xiangongyun`。**不要**做一个「万能 HTTP 客户端」吞掉所有差异；差异收敛在适配层，上层统一入口、Autoscaler、Region Registry、failover 调度器共用。

参考文档：

| 厂商 | 文档 |
|------|------|
| AutoDL 弹性部署 | https://api.autodl.com/docs/esd_api_doc/ |
| PPIO 算力 / Serverless Endpoint | https://ppio.com/docs/gpus/reference-start ；创建 Endpoint https://ppio.com/docs/gpus/endpoint/reference-create-endpoint |
| 仙宫云实例 API | https://raw.githubusercontent.com/Chsengni/xiangongyun-api-skill/master/references/api_reference.md |
| 共绩云（P0） | 见 §10.4 |

#### 能力对照（相对 waverless 目标 G3/G4/G5）

| 能力 | 共绩云 | AutoDL | PPIO | 仙宫云 |
|------|--------|--------|------|--------|
| 部署形态 | 弹性任务（多 points） | ReplicaSet / Job / Container | **Serverless Endpoint**（多 Worker）或 GPU 实例 | **单实例**（VM/容器式） |
| Deploy | `task/create` | `POST /api/v1/dev/deployment` | `endpoint/create`（推荐）或 `gpu/instance/create` | `POST /open/instance/deploy` |
| ScaleApp | `change_points` | `PUT .../replica_num` | 更新 Endpoint `minNum/maxNum` 或依赖其 policy（MVP 建议平台侧驱动） | **无原生副本**：N 副本 = N 个实例 create/destroy |
| 列表/状态 | `task/search` + `detail` + `points` | `deployment/list` + `container/list` | Endpoint/Worker 查询（V1/V2） | `GET /open/instances` |
| TerminateWorker | `delete_pod`（`point_id`） | `PUT .../container/stop`（`deployment_container_uuid`；可 `decrease_one_replica_num`） | 删/停对应 Worker（以 Endpoint Worker API 为准） | `destroy` / `shutdown_release_gpu` |
| 区域字段 | `region` / `region_name`（如 `hebeif-1`） | `dc_list` / `data_center`（如 `westDC2`、`beijingDC1`） | `clusterID` / 产品所在集群 | `data_center` / `data_center_name` |
| 库存/规格 | `resource/search`（price/inventory/mark） | `machine/region/gpu_stock` | 产品列表 API | 弱（无独立库存接口，靠部署成败） |
| 与统一入口契合度 | ★★★★★ | ★★★★★（ReplicaSet） | ★★★★☆（走 Endpoint，勿走裸实例） | ★★★☆☆（需实例池适配器） |

#### 封装原则

1. **契约不变**：上层只认 `Deploy` / `ScaleApp` / `GetAppStatus` / `TerminateWorker` / `ListSpecs`；厂商特有字段进 Provider 内部或 `specs.yaml` / Region Registry。
2. **Region Registry**：逻辑 AZ ↔ 各厂物理码（AutoDL `westDC2`、共绩 `hebeif-1`、PPIO `clusterID`、仙宫 `data_center`）。
3. **弹性单一真相（已锁定）**：**永不启用**厂商自带弹性作真相源；一律由 **waverless Autoscaler** 调 `ScaleApp`（共绩 `dynamic_pod_strategy.switch=false`；PPIO 不依赖其 queue/concurrency policy；AutoDL 只被平台改 `replica_num`）。
4. **Worker ID 映射表**：平台 `worker_id` ↔ AutoDL `deployment_container_uuid` ↔ 共绩 `point_id` ↔ PPIO worker id ↔ 仙宫 `instance.id`。
5. **镜像差异**：AutoDL 强调平台内镜像 UUID（外部镜像受限）；共绩/PPIO 更接近任意镜像 + 仓库凭证——创建 Endpoint 时在适配层处理，不暴露给用户。
6. **仙宫云适配策略**：把「Endpoint 目标副本 = N」实现为维护 N 个实例的池；缩容优先 `shutdown_release_gpu` / `destroy`；扩容 `deploy`。适合 failover 备源或批处理，不作为第一优先 Serverless 供给。
7. **PPIO 选型**：统一入口场景接 **Serverless Endpoint API**（语义最接近 waverless）；裸 GPU 实例留给与 SkyPilot/闲时更像的路径，避免两套模型混进同一 Provider。

#### 建议接入顺序（在 Gongji P0 之后）

| 优先级 | 厂商 | 理由 |
|--------|------|------|
| P0 | 共绩云 | 已锁定；任务+points+delete_pod 齐 |
| P1a | AutoDL | ReplicaSet + replica_num + 定点停容器 + 区域库存，与 G3/G5 几乎 1:1 |
| P1b | PPIO Serverless | Endpoint/Worker/队列策略接近；注意与平台 Autoscaler 分工 |
| P2 | 仙宫云 | 实例池适配；补库存与多副本语义成本更高 |

**一句话**：统一封装 = **一个调度壳 + 多家薄适配器**；三家（加共绩）都可以进 waverless，只是契合度不同，按上表排队即可。

### 10.13 镜像：对客暴露、跨厂切换、最低成本（2026-10-17）

#### 问题

客户看到的镜像地址是哪一个？Failover 换厂商时镜像怎么跟？如何把平台存储/流量成本压到最低？

> **一期（P0）镜像口径（拍板 #1）**：对客可用平台仓 URL 或 BYO URL **直传 Gongji 拉取**；**不强制** `image_bindings.ready` / ImagePreHeat / 90s/R_hot。下文「逻辑镜像 + 按需物化」是目标架构（P0.5/P1），可先记录 digest，但不得当作一期验收门槛。

#### 结论（推荐，目标架构）

采用 **「平台逻辑镜像 + 按需物化」**：

1. **对客只暴露平台逻辑引用**（永不暴露共绩/AutoDL/PPIO 私有 UUID）：
   - 默认：`cr.<平台域名>/<tenant>/<name>:<tag>`（内容以 **digest** 为准）
   - 或 BYO：客户自有仓库 URL（须可被目标厂商拉取；平台只存元数据，不代存层）
2. **平台侧维护 `image_bindings` 表**：键为 `(digest, provider, physical_region)` → `vendor_ref` + **`ready`**（见 §10.15）；Gongji URL、AutoDL `image_uuid`、PPIO image+authId、仙宫 `image_id`…
3. **Failover / 调度换厂**：优先选 `ready=true` 的区厂；miss 则 **异步预热/物化**，未就绪不计入 90s 可切换容量。不预热到所有厂商，但 **preferred 列表可提前预热**。
4. **弹性与镜像无关**：副本变化只调 `ScaleApp`，不重推镜像（除非换 digest）。

#### 为什么成本最低

| 策略 | 成本 | 取舍 |
|------|------|------|
| A. 每厂各存全量副本 + 预同步 | 高（存储×N + 持续同步） | ❌ |
| B. **单一国内仓库为真相源 + 按需物化** | 低（一层存储；只在首次用到某厂时付一次推送/导入） | ✅ 推荐 |
| C. 纯 BYO、平台零存储 | 最低存储 | 仅当目标厂都能直拉；AutoDL 等受限厂仍要物化 |
| D. 每次 Deploy 现场从 DockerHub 拉 | 表面零存储 | 国内拉取慢/失败率高，隐性成本大 | ❌ |

推荐组合：**B 为主，C 为辅**——能直拉就直拉（共绩/PPIO）；不能直拉再物化（AutoDL 导入私有镜像）。

#### 对客地址与自动切换流程

```
客户提交镜像
   │  push 到平台仓库  或  登记 BYO URL
   ▼
平台记录 digest（逻辑镜像 ID）─── 对客 API/控制台只显示这个
   ▼
调度选中 provider（价格/库存/任务属性/failover）
   ▼
查 image_bindings[digest][provider]
   ├─ hit  → Deploy(vendor_ref)
   └─ miss → Image Materializer（一次性）
              ├─ 可直拉厂：把逻辑 URL + 只读拉取凭证交给 Provider
              ├─ AutoDL 类：pull → 导入平台私有镜像 → 得 image_uuid
              └─ 写 binding 后 Deploy
   ▼
Scale / Terminate 只用 vendor 侧 app/worker id，不再碰镜像
```

**自动切换**：failover 只换 Provider + 用同一 `digest` 的另一条 `vendor_ref`；客户无感，逻辑镜像地址不变。切换 SLO 内若 miss，物化耗时计入 failover 预算——对大镜像应 **异步预热可选**（按 Endpoint 的 preferred provider 列表提前物化，仍按需、不全局复制）。

#### 平台仓库怎么建（低成本落地）

- **自建轻量**：单地域 Harbor / distribution + 对象存储后端（可挂闲时/已有盘），仅国内节点拉取。
- **或托管 ACR/CCR 标准版**（按量），比自建运维更省时；避免一上来多地域多副本。
- 对客域名：`cr.<平台>` CNAME 到该仓库；租户路径隔离 + 机器人只读 pull token 发给各 Provider。
- **垃圾回收**：按 digest 引用计数（无 Endpoint 引用则延后 GC）；物化到 AutoDL 的 uuid 可随 binding 删除策略清理。

#### Provider 差异处理（适配层）

| 厂商 | 物化方式 | 备注 |
|------|----------|------|
| 共绩云 | 直传 `service_image` + 可选 `repository_username/password` | 优先直拉平台仓库 |
| PPIO | `image` + `authId` | 同上 |
| AutoDL | 同步为平台内 `image_uuid` 后创建部署 | 文档限制外部随意导入 → **唯一高成本特例**，严格按需 |
| 仙宫云 | 公共镜像名或私有 `image_id` | 实例池场景；能复用已存镜像则不重复 save |

#### 与统一入口的关系

- 创建/更新 Endpoint：客户填 **逻辑镜像**（或 BYO URL），不填厂商字段。
- `/v1/:endpoint/run` 路径不涉及镜像；仅 Deploy/换厂/换 tag 时走 Materializer。
- 换 tag（新 digest）= 新 binding 集合；滚动：先物化到当前 Provider → UpdateDeployment → 旧副本缩容。

#### 成本红线（产品约束）

1. 禁止「创建 Endpoint 时同步到全部启用厂商」。
2. 禁止把 DockerHub 当国内默认拉取源。
3. AutoDL 物化结果必须缓存 uuid，禁止每次扩容重复导入。
4. BYO 镜像若无法被目标厂拉取，调度器应跳过该厂并记原因，而不是平台代存全世界。

### 10.14 场景：要 9×4090，库存分散在多家（最低成本）

> **阶段标注（2026-10-17 拍板）**：本场景为 **实现目标（P1+）**，不是砍掉；**一期可不做**、不对外承诺「可拼满 9 卡」履约。P0 创建校验保持单 ProviderBinding。

**设定**：同逻辑区库存 Gongji=4、PPIO=3、仙宫云=2，合计 9；用户要 **9 张 4090**。

#### 先判定任务能否拆

- **可拆（推荐路径）**：9 个独立 Worker（每卡一副本）或「总 GPU 容量=9」的 Serverless Endpoint → 走 **拼池**。
- **不可拆**：一个进程要 9 卡 NVLink/单机 → 任一厂都 <9 则 **无法满足**，应拒绝或等待单厂凑齐，不能 4+3+2 硬拼进同一容器。

以下默认 **可拆**（与 waverless 队列/Worker 模型一致）。

#### 最低成本分配（贪心）

对每家拉取：`inventory(4090)`、`price`（共绩用 `discount_price` 优先，否则 `price`；PPIO/仙宫用当时报价）。

```
need = 9
plan = []
for provider in sort_by(price_asc, then prefer_warm_binding, then prefer_fewer_hops):
    take = min(need, inventory[provider])
    if take > 0 and (take * price[provider] + open_cost[provider]) 可接受:
        plan.append(provider, take)
        need -= take
    if need == 0: break
```

- **`open_cost`**：该厂尚无 `image_bindings` 时的一次性物化成本（时间折算 + 导入费）；已有 binding 则为 0。这避免「略便宜但要重新导入 AutoDL/仙宫」反而更贵。
- **单价相同时**：优先已有镜像 binding 的厂 → 再优先已有运行中 deployment 的厂 → 再少开厂（减少控制面碎片）。

**示例**（假设单价 Gongji < PPIO < 仙宫，且三家镜像都已物化）：

| 厂商 | 分配 |
|------|------|
| Gongji | 4 |
| PPIO | 3 |
| 仙宫云 | 2 |
| 合计 | 9 |

实现上：同一 `endpoint_id` 下挂 **3 条 provider deployment**（或等价映射），Autoscaler 的「目标副本=9」由 **Capacity Planner** 拆成 `(gongji,4)+(ppio,3)+(xgy,2)`，各调各自的 `ScaleApp`；Worker 都向同一 Redis 队列拉任务 → **统一入口不变**。

#### 若只要「尽量便宜」且允许略慢

1. 先把最便宜厂吃到库存上限；
2. 不够再开次便宜厂；
3. 某厂 Deploy/Scale 失败：把缺口在 **≤90s** 预算内重分配给其余有库存的厂（拼池内 failover），而不是卡住等原厂。

#### 成本公式（平台侧优化目标）

\[
\min \sum_i r_i \cdot p_i + \mathbb{1}_{new\_binding,i}\cdot C^{img}_i
\quad s.t. \quad \sum_i r_i = R,\; 0 \le r_i \le inv_i
\]

其中 \(R=9\)，\(r_i\) 为各厂副本（或卡数），\(p_i\) 为卡时单价，\(C^{img}_i\) 为首次物化成本。

#### 监测

按 Endpoint 聚合队列/等待时长；下钻展示各厂 `r_i`、单价、库存、物化状态，避免「总副本够了但全挤在贵厂」。

### 10.15 90s 与镜像就绪：分站 CDN、清镜像、换区（2026-10-17）

> **阶段标注（2026-10-17 拍板）**：**一期不对外承诺 90s failover**；控制面 `T_switch≤90s` 与 `ImageReady` 过滤作为 **P1+ 目标设计**保留。P0 对外话术仅为「队列扩容 + 冷启可能数分钟」。镜像预热/暖机 **一期不做**（§10.18）。


#### 问题

「90s 内 failover」容易被理解成「90s 内新 Worker 一定能起来」。现实约束：

- 厂商会 **清理本地/节点镜像缓存**；
- 厂商镜像地址常是 **CDN**，**每个物理区/分站一份**；控制台或 API 里「有地址」≠ **当前目标区** 已有层、可秒起；
- 换区 / 换厂首次拉取大镜像经常是 **数分钟级**，不能塞进 90s。

#### 结论：拆成两条 SLO，调度只认「区级就绪」

| SLO | 含义 | 默认目标 |
|-----|------|----------|
| **T_switch（控制面）** | 发现失败 → 选好目标 → 发出 Scale/Deploy | **≤ 90s** |
| **T_ready（数据面）** | 目标区 Worker 进程 Ready、可拉任务 | **不承诺 90s**；按镜像体积分档（如已预热 ≤30–60s，冷拉按实测 P95） |

**硬规则**：计入「90s 可切换容量」的目标，必须 `ImageReady(digest, provider, physical_region) == true`。未就绪的区可以进 **预热队列**，但 **不能** 当作 90s failover 的唯一落点。

#### 绑定键升级（相对 §10.13）

`image_bindings` 从 `(digest, provider)` 升级为：

```
(digest, provider, physical_region) → {
  vendor_ref,   # URL / image_uuid / authId…
  ready,        # 该区是否已确认可秒起
  ready_at,
  last_probe_at,
  size_bytes,
  source        # platform_registry | vendor_cdn | imported
}
```

对客仍只看逻辑 `cr.<平台>/…@digest`；调度与 failover 看 **区级 ready**。

#### 如何得到 `ready=true`（成本从低到高）

1. **热副本保底（最稳）**  
   对高峰 Endpoint：在 preferred `(provider, region)` 上保持 `minReplicas≥1`（或平台共享暖池按 GPU 型号）。镜像已在节点上，扩容 ≈ 克隆/调度已有缓存。成本：少量常驻卡时；换来 90s 内可交付的容量。

2. **区级预热（推荐默认）**  
   异步预热：有官方 API 则用（共绩 `ImagePreHeat`）；**无 API 则用 §10.16 周期暖机**（指定卡型/区短拉起再停，不接请求）。成功后打 `ready=true`。  
   - 触发：Endpoint 创建/改镜像、preferred 列表变更、库存 foresight、历史 failover 命中区。  
   - **禁止**：未预热就承诺 90s 切到新区。

3. **就绪探针（防 CDN/清缓存假阳性）**  
   定期或部署前探测：  
   - 厂商若提供「镜像在区存在」接口则用之；  
   - 否则看最近一次该区成功启动同 digest 的时间戳 + TTL（如 24h）；超 TTL 或厂商宣布 GC 后标 `ready=false` 并重新预热。  
   CDN 分站：`vendor_ref` 必须带 **区亲和**（或解析到区分站），禁止用「全局 CDN URL 成功过一次」推断所有区。

4. **冷启动路径（允许，但不占 90s 预算）**  
   库存只在未预热区时：仍可 Deploy，但标记 `capacity_class=cold`，用户侧等待时长走队列/WaitingTime 扩容语义；监控单独统计 `cold_start_seconds`。平台 Autoscaler 可并行：一边在 **ready 区** 扩到能扩的上限，一边对缺额区做预热。

#### 与「9×4090 拼池」的关系（§10.14）

容量规划改为两层：

```
R_needed = 9
R_hot    = Σ inventory ∩ ImageReady   # 可计入 90s 交付
R_cold   = 其余库存                    # 可要，但不算 90s 保证
```

最低成本贪心 **先填 `R_hot`（按单价）**，不足再决定：

- 等预热完成（通常比冷拉整镜像更可控），或  
- 接受 cold 并行拉取（要在体验上暴露排队，而不是假称 90s）。

#### 换区场景

用户/调度从 `cn-hebei-az1` 转到 `cn-beijing-az1`：

1. 检查 `(digest, provider, beijing-物理区)` binding；
2. miss 或 `ready=false` → 先打预热，**不要**把北京未就绪容量算进 90s failover；
3. 河北旧 Worker drain；北京 hot 容量接住后再缩河北。

#### 产品话术（避免承诺穿帮）

- 对外：「故障切换决策 ≤90s；**已预热区域** 新增副本通常在 X 秒内 Ready」。  
- 不对外：「任意新区 90s 必起」。

#### 工程清单

- [ ] binding 主键含 `physical_region`  
- [ ] Preheat worker + TTL/GC 监听（或保守 TTL）  
- [ ] Scheduler 过滤：`90s_eligible = ready`  
- [ ] 指标：`image_ready_ratio`、`preheat_latency`、`cold_start_p95`、`failover_to_cold_total`  
- [ ] 各 Provider 适配：
  - **共绩**：优先 `ImagePreHeat` **集群预热**（`/api/task/image_preheat/*`，`get_regions` + `create`；按 region 看 `region_cache_info[].status=Completed` 再标 ready）；节点预热为可选加强
  - PPIO / AutoDL / 仙宫：区级 pull 探针或短生命周期预拉；无官方预热 API 则用 TTL+最近成功启动推断，并偏保守标 ready=false

### 10.16 无官方预热 API 时：周期暖机（起停不接流量）（2026-10-17）

#### 背景

多数国内 GPU 云 **没有** 镜像预热接口。此前假设「拉镜像不收费、成功启动后才计费」**不能套用到所有厂商**（见下表）。因此暖机策略必须 **按厂商计费模型分支**，避免设计脱节。

#### 各厂计费起点（公开文档，2026-10-17 核对）

| 厂商 | 算力计费起点（文档表述） | 拉镜像阶段 | 官方预热 | 对「起停暖机」的含义 | 来源 |
|------|--------------------------|------------|----------|----------------------|------|
| **共绩云** | 首个节点 **运行中**（已分配节点且镜像已拉取） | **明确不收费**（可长达数小时） | 有 `ImagePreHeat` | 冷拉免费；一旦 Running 开始按秒收 → Ready 即停仍会有短窗费用；**优先官方预热** | [弹性部署计费](https://docs.suanli.cn/serverless/billing) |
| **AutoDL 弹性部署** | 容器 **开机** 起、关机止，按秒；不以是否用 GPU 为准 | 文档未写「拉取免费」；实践上启动含 pull | 无独立预热 API；有 **reuse_container**（停容器最长约 7 天可复用） | 暖机=开机就可能计费；更优：**reuse_container=true** 保复用池，或短窗起停；跨区首创私有镜像「创建中」在实例文档里有不计费描述，弹性路径勿直接类推 | [价格-弹性部署](https://www.autodl.com/docs/price/) · [复用容器实践](https://www.autodl.com/docs/elastic_deploy_practice/) |
| **PPIO GPU 容器** | FAQ：**从实例拉取镜像阶段开始计费** | **收费** | 有控制台/文档「镜像预热」 | **禁止**用「长 pull 暖机」省钱——pull 越久越贵；应走 **官方预热** 或接受短窗业务扩容 | [GPU FAQ](https://ppio.com/docs/gpu/faq) · [镜像预热](https://ppio.com/docs/gpu/image-pre-warming) |
| **PPIO Serverless** | Worker **运行中**时长按秒 | 与容器 FAQ 对齐时需谨慎：勿假设 pull 免费 | 同上预热 | Serverless 侧优先预热 + minWorker/空闲保留（空闲超时内仍收费，见产品说明） | [Serverless 计费](https://ppio.com/docs/gpu/serverless-pricing) |
| **仙宫云** | 营销/产品：**部署不计费**，运行中按量；关机释放 GPU 后停 GPU 费（盘可能仍计） | 部署阶段倾向不收算力费（公开页未细到 pull 秒级） | 未见对等 OpenAPI 预热 | 起停暖机较吻合；停用 **shutdown_release_gpu / destroy**，避免 shutdown 保卡继续收费 | [官网](https://www.xiangongyun.com/) · API 关机语义 |

> **结论修正**：不能写「各厂都是拉完才收费」。共绩≈拉免费、跑才收；PPIO 容器=拉就开始收；AutoDL=开机收 + 复用池更关键；仙宫≈部署不收、跑才收。

#### 对照：Runpod 如何做「跨区域」预热（2026-10-17）

公开文档显示 Runpod **不是**「调用一次 ImagePreHeat 覆盖全球」；而是拆成 **容器镜像** 与 **模型权重** 两套机制，区域粒度到 **datacenter**：

1. **容器镜像（host 层）**
   - Worker **Scaled down** 时平台可提前在主机上 pull 镜像 → 状态 `Initializing`（拉镜像）→ `Idle`（已就绪可启）；**此阶段不计费**。
   - 若请求到来时镜像尚未在 host，pull 会落到 cold start 且 **计费**（见 [Workers overview](https://docs.runpod.io/serverless/workers/overview)）。
   - 官方基础镜像在机队上 **预缓存**；业务层只多拉自有 layer。Flash 的 `flashboot=True`（默认）靠预加载镜像 / pause 保活加速二次冷启。
   - **跨区**：无全局镜像预热 API；多 DC 部署时各机房各自 pull/缓存，调度偏向已有层缓存的 host。

2. **模型权重（Model Store / Cached models）——真正的「跨机房」分发设计**
   - Endpoint 配置 HF Model 后：控制面记录 model↔host / model↔**机房级 network volume** 分配。
   - **每 datacenter 只拉一次**到该机房共享 volume，其它 worker 等就绪再调度（防 stampede）；优先调度已有 host 本地缓存的机器。
   - 下载阶段 **不计费**；冷 host 会等下载完成再起 worker（[Cached models](https://docs.runpod.io/serverless/endpoints/model-caching)、[Model Store blog](https://www.runpod.io/blog/building-runpods-model-store)）。
   - 架构：`runpod` 控制面 + 每机 `host` agent 传文件 + `proxy` 中继；hash 校验、状态机、失败回退 origin。

3. **Network volume**
   - **钉死单个 datacenter**，跨区 **不会自动同步**；多区要 **每区一个 volume** 并手动拷（S3 API / runpodctl / rsync）（[Network volumes](https://docs.runpod.io/storage/network-volumes)）。

4. **Model Repository**（私有制品，文档称 host-distributed、不锁单 DC；曾为 beta）
   - 相对「每区自管 volume」更接近跨区托管分发；与 HF Cached models 是不同产品线。

**对 waverless 的可抄点**

| Runpod 做法 | waverless 映射 |
|-------------|----------------|
| Pull/model 下载在 **未计费/平台侧** 完成，再把 worker 标 Ready | 共绩 ImagePreHeat；PPIO 官方预热；禁止用「计费中的长 pull」当预热 |
| **Locality-aware**：优先已有缓存的 host/区 | `image_bindings(digest, provider, physical_region).ready` + 调度打分 |
| **Defer schedule until artifact ready** | Failover/扩容只投向 `ImageReady`；未 Ready 不计入 90s 容量 |
| 模型与镜像解耦；跨区以 **DC 粒度** 各缓存一份 | 逻辑区 → 物理区各物化；无跨厂/跨区自动镜像同步幻想 |
| 无公开「全球预热」→ 多区 = 多目标并行预热任务 | `WarmPlanner` 按 (provider, physical_region, digest) 扇出 |

#### 分厂暖机策略（取代「一刀切起停」）

| 厂商 | 推荐保热手段 | 是否用周期起停暖机 |
|------|--------------|--------------------|
| 共绩 | **ImagePreHeat 集群预热** | 仅作探针/补强；冷拉可接受因 pull 免费，但 Running 后立刻停 |
| PPIO | **官方镜像预热**（按区域/卡型） | **默认不用**长生命周期 pull 暖机；若误用，费用≈整段 pull+run |
| AutoDL | **reuse_container** + 必要时短窗起停 | 可用，但控制开机时长；优先复用池而非反复全量 pull |
| 仙宫 | 周期 deploy → Running → `shutdown_release_gpu`/`destroy` | **可用**，窗口尽量短 |

#### 结论

在 **计费友好** 的厂（共绩 pull 免费、仙宫部署不收算力），周期暖机仍然成立；对 **PPIO** 必须改走官方预热，否则与「省钱暖机」目标相反。平台 `WarmPlanner` 按 `provider.billing_model` 选策略，禁止全局同一套起停。

#### 流程

```
WarmPlan(digest, provider, physical_region, gpu_sku)
  → Deploy 最小规格（通常 1× 目标卡型，与业务同镜像 digest）
  → 等待 Running / 厂商侧「镜像已在节点」信号（超时则失败）
  → 立即 Scale(0) / stop / destroy（按厂商语义选费用最低的停法）
  → 标记 image_bindings.ready=true，写入 ready_at + ttl
  → 整段过程 worker 标签 preheat=true，不注册拉任务、不进 LB
```

周期：按 `ttl`（建议与厂商缓存 GC 经验对齐，如 6–24h）或在 failover 前、库存 foresight、Endpoint preferred 变更时触发。用户可配置「要保热的卡型×区域」白名单，避免全网盲扫。

#### 与计费的关系（成本控制）

| 点 | 做法 |
|----|------|
| 计费起点 | **按厂商分支**（见上表）：共绩/仙宫≈ Running 后收；PPIO 从 pull 起收 → **禁止**用长 pull 当暖机。暖机窗口尽量短：Ready 即杀，目标 **秒～一两分钟级** 卡时（仅计费友好厂） |
| 失败重试 | 拉取失败不硬打满重试；指数退避，避免烧钱 |
| 并发 | 同一 `(digest, region, sku)` 全局互斥，防止多副本同时暖机 |
| 对比常驻 | 比 `minReplicas≥1` 常挂便宜；比完全冷启体验好。极端 SLA 仍可对少数 Endpoint 加常驻暖池 |
| 平台成本 | 暖机费用可计入平台或按租户「保热区域」加收；**预热启动后（P0.5/P1）**默认平台承担保热白名单、租户自选加钱；须同时上 `cost_cap` / 日预算。**一期无 WarmPlanner，无此项** |

#### 必须遵守的隔离

1. **调度隔离**：暖机 deployment / 容器 **禁止** 进入该 Endpoint 的 pull 队列与统一入口路由（独立 `purpose=preheat` 或独立内部 endpoint_id）。
2. **语义隔离**：暖机成功 ≠ 业务容量；只有 `ready=true` 后，业务 `ScaleApp` 扩出的副本才接流量。
3. **验收**：停掉后再在同区起一个业务副本，若仍长时间 pull，则该厂缓存未命中 → `ready=false`，加长周期或改「短驻留 N 分钟」策略（仍不接流量）。
4. **清缓存**：厂商 GC 后周期暖机就是续命；探测到冷启变慢则提前续热。

#### 与 90s SLO

90s 切换仍只落在 `ready=true` 目标。暖机是 **异步后台**；不要在 90s 路径里同步「现拉现热」除非用户接受冷启排队。

#### 配置草样

> **FORBIDDEN（2026-10-17 拍板 #10）**：下列曾出现的 **`provider: ppio` + `mode: ephemeral_restart` 样例已作废**。PPIO 从 pull 起计费，长 ephemeral 暖机与 billing 护栏冲突。实现与文档样例均不得再抄该组合；PPIO 仅允许 OfficialPreheat（且**一期整段暖机不做**）。

```yaml
# FORBIDDEN — do not copy (PPIO + ephemeral_restart)
# image_warm:
#   mode: ephemeral_restart
#   targets:
#     - provider: ppio   # ← 禁止
#       ...

# 允许的示意（非 PPIO；且一期 WarmPlanner 不做实现，仅作后续参考）：
image_warm:
  mode: ephemeral_restart   # 仅计费友好厂（如仙宫）；共绩优先 OfficialPreheat
  default_ttl: 12h
  ready_timeout: 10m
  kill_grace: 30s
  billing_guards:
    ppio_ephemeral_disabled: true   # 硬护栏
  targets:
    - digest: sha256:…
      provider: xiangongyun         # 非 PPIO
      physical_region: <cluster>
      gpu_sku: RTX4090
      ttl: 8h
```


### 10.17 镜像就绪与暖机：完整实现方案（2026-10-17）

本节把 §10.13–10.16 落成 **可直接编码的工程方案**（**目标架构**；包路径相对独立仓库 `gpurun/waverless`，联调 checkout 于 cloud `apps/waverless`）。**硬约束回顾**：平台-only Autoscaler 驱动 `ScaleApp`（禁用一切厂商原生弹性；**不依赖 K8s.Enabled**）；对客只暴露逻辑镜像 digest；`image_bindings` 键为 `(digest, provider, physical_region)` + `ready`；`T_switch≤90s` 只投向 `ImageReady`（**一期不对外承诺**）；可拆 Worker 可多厂拼池（**目标/P1+**），紧耦合 N-GPU 不可跨厂；供给顺序共绩 → AutoDL → PPIO → 仙宫；WarmPlanner 按 `billing_model` 分支（见 §10.16）。**一期不做 WarmPlanner / ImagePreHeat / ephemeral warm**（§10.18）。

#### 10.17.1 目标与非目标

**目标**

1. **区级 ImageReady**：`(digest, provider, physical_region)` 维度可查询、可 TTL、可 GC 回退。
2. **WarmPlanner 按 billing_model 分支**：OfficialPreheat / EphemeralWarm / ReusePool / ProbeOnly，禁止全局一刀切起停。
3. **调度 / failover 只认 ready**：`90s_eligible = ready`；未就绪可进预热队列或 `capacity_class=cold`，不得冒充 90s 落点。
4. **与 Autoscaler / 镜像物化闭环**：物化写出 binding；暖机写 `ready`；Autoscaler 只 `ScaleApp` 业务副本，不碰 preheat。
5. **可观测与成本护栏**：指标、互斥、`cost_cap`、`max_billable_seconds`、PPIO 禁用长 ephemeral pull。

**非目标**

- 不做全球镜像 CDN / 跨厂自动同步层。
- 不实现 Runpod 式 host agent；不假设「scaled-down 主机上可免费 pull」。
- P0 **不**实现模型权重 Model Store（镜像层优先；权重缓存可进 P2+）。
- **不**启用厂商侧 `dynamic_pod_strategy` / queue policy / 自带弹性作真相源。

#### 10.17.2 系统组件图

```
                    ┌─────────────────────┐
                    │   Endpoint / API    │
                    │  (逻辑镜像 digest)   │
                    └─────────┬───────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐
│ ImageRegistry   │  │ImageMaterializer│  │  Region Registry │
│ 逻辑镜像元数据   │  │ digest→vendor_ref│  │ 逻辑AZ↔物理区    │
└────────┬────────┘  └────────┬────────┘  └────────┬─────────┘
         │                    │                    │
         └──────────┬─────────┴──────────┬─────────┘
                    ▼                    ▼
           ┌─────────────────┐   ┌─────────────────┐
           │ImageBindingStore│   │   WarmPlanner    │
           │  (MySQL 表)     │◄──│ 扇出 warm_jobs   │
           └────────┬────────┘   └────────┬────────┘
                    │                     │
                    │            ┌────────┴────────┐
                    │            ▼                 ▼
                    │     WarmWorker + strategy plugins
                    │     OfficialPreheat | EphemeralWarm
                    │     ReusePool | ProbeOnly
                    │            │
                    │            ▼
                    │     Provider adapters
                    │     gongji / autodl / ppio / xiangongyun
                    │     实现 WarmCapability
                    │
         ┌──────────┴──────────┐
         ▼                     ▼
┌─────────────────┐   ┌─────────────────┐
│ CapacityPlanner │   │   Autoscaler    │
│ R_hot∩ready     │   │ 仅 ScaleApp     │
│ 90s_eligible    │   │ purpose=business│
└────────┬────────┘   └────────┬────────┘
         │                     │
         └──────────┬──────────┘
                    ▼
              Scheduler / Failover
              （禁止选 !ready 作 90s 目标）
```

职责边界：

| 组件 | 职责 | 不做什么 |
|------|------|----------|
| ImageRegistry | digest / logical_ref / size / 引用计数 | 不调厂商 API |
| ImageMaterializer | miss 时按需物化，写 `image_bindings`（`ready=false` 起步） | 不做暖机、不 Scale |
| ImageBindingStore | CRUD + ready/ttl 原子更新 | — |
| WarmPlanner | 按 preferred 区扇出 `warm_jobs`；选 strategy | 不接业务流量 |
| WarmWorker | 执行 strategy plugin；成功写 ready+ttl | 不注册 Redis 拉任务 |
| CapacityPlanner | `R_hot = inv ∩ ready`；拼池拆 `(provider,r_i)` | 不直接 Deploy 镜像 |
| Autoscaler | 只对 `purpose=business` 调 `ScaleApp` | 不创建/管理 preheat |
| Region Registry | 逻辑 AZ → `(provider, physical_region)` | — |

#### 10.17.3 数据模型

```sql
-- 逻辑镜像制品（对客真相源）
CREATE TABLE image_artifacts (
  digest            CHAR(71) PRIMARY KEY,          -- sha256:…
  logical_ref       VARCHAR(512) NOT NULL,         -- cr.<平台>/tenant/name:tag
  size_bytes        BIGINT,
  created_at        DATETIME(3) NOT NULL,
  updated_at        DATETIME(3) NOT NULL,
  gc_eligible_at    DATETIME(3) NULL                 -- 无 Endpoint 引用后延后 GC
);

-- 区级绑定 + 就绪（主键含 physical_region，见 §10.15）
CREATE TABLE image_bindings (
  digest            CHAR(71) NOT NULL,
  provider          VARCHAR(32) NOT NULL,          -- gongji|autodl|ppio|xiangongyun
  physical_region   VARCHAR(64) NOT NULL,
  vendor_ref        VARCHAR(1024) NOT NULL,         -- URL / image_uuid / authId / image_id；永不对客暴露
  ready             TINYINT(1) NOT NULL DEFAULT 0,
  ready_at          DATETIME(3) NULL,
  ttl_expires_at    DATETIME(3) NULL,
  last_probe_at     DATETIME(3) NULL,
  last_cold_start_ms INT NULL,
  source            VARCHAR(32) NOT NULL,           -- platform_registry|vendor_cdn|imported
  status            VARCHAR(32) NOT NULL,           -- unknown|materializing|unbound|warming|ready|expired|error
  created_at        DATETIME(3) NOT NULL,
  updated_at        DATETIME(3) NOT NULL,
  PRIMARY KEY (digest, provider, physical_region),
  KEY idx_ready_ttl (ready, ttl_expires_at),
  KEY idx_status (status)
);

-- 暖机目标（平台/租户白名单）
CREATE TABLE warm_targets (
  id                BIGINT PRIMARY KEY AUTO_INCREMENT,
  digest            CHAR(71) NOT NULL,
  provider          VARCHAR(32) NOT NULL,
  physical_region   VARCHAR(64) NOT NULL,
  gpu_sku           VARCHAR(64) NOT NULL,
  ttl               VARCHAR(16) NOT NULL DEFAULT '12h',
  enabled           TINYINT(1) NOT NULL DEFAULT 1,
  owner             VARCHAR(32) NOT NULL,           -- platform|tenant:<id>
  UNIQUE KEY uk_target (digest, provider, physical_region, gpu_sku)
);

-- 暖机任务（状态机 + 成本护栏）
CREATE TABLE warm_jobs (
  id                BIGINT PRIMARY KEY AUTO_INCREMENT,
  job_key           VARCHAR(255) NOT NULL,          -- digest|provider|region|sku 互斥键
  digest            CHAR(71) NOT NULL,
  provider          VARCHAR(32) NOT NULL,
  physical_region   VARCHAR(64) NOT NULL,
  gpu_sku           VARCHAR(64) NOT NULL,
  strategy          VARCHAR(32) NOT NULL,           -- OfficialPreheat|EphemeralWarm|ReusePool|ProbeOnly
  state             VARCHAR(32) NOT NULL,           -- pending|running|verifying|succeeded|failed|aborted
  purpose           VARCHAR(16) NOT NULL DEFAULT 'preheat',
  cost_cap_cents    INT NULL,                       -- 单次费用上限（分）
  max_billable_seconds INT NULL,
  handle_json       JSON NULL,                      -- 厂商预热 handle / deployment id
  attempts          INT NOT NULL DEFAULT 0,
  last_error        TEXT NULL,
  started_at        DATETIME(3) NULL,
  finished_at       DATETIME(3) NULL,
  created_at        DATETIME(3) NOT NULL,
  updated_at        DATETIME(3) NOT NULL,
  UNIQUE KEY uk_active_job (job_key, state)         -- 应用层保证：同一 key 最多一个 active(pending|running|verifying)
);

-- 厂商计费画像（配置也可落 YAML，DB 便于运行时覆盖）
CREATE TABLE provider_billing_profile (
  provider          VARCHAR(32) PRIMARY KEY,
  billing_model     VARCHAR(64) NOT NULL,
  -- pull_free_until_running | bill_from_pull | bill_from_power_on | deploy_free_run_bills
  preferred_strategy VARCHAR(32) NOT NULL,
  notes             TEXT,
  updated_at        DATETIME(3) NOT NULL
);

-- worker_map / deployment 映射增加 purpose（已有表则 ALTER）
-- ALTER TABLE worker_map ADD COLUMN purpose VARCHAR(16) NOT NULL DEFAULT 'business';
-- -- business | preheat
```

**唯一约束（强）**：同一时刻同一 `(digest, provider, physical_region, gpu_sku)` 最多一个 **active** `warm_job`（`state ∈ {pending, running, verifying}`）。实现用 Redis 锁 `warm:lock:{job_key}` + DB 条件插入；冲突则跳过或合并到已有 job。

种子数据（与 §10.16 一致）：

| provider | billing_model | preferred_strategy |
|----------|---------------|--------------------|
| gongji | pull_free_until_running | OfficialPreheat |
| ppio | bill_from_pull | OfficialPreheat |
| autodl | bill_from_power_on | ReusePool |
| xiangongyun | deploy_free_run_bills | EphemeralWarm |

#### 10.17.4 Provider 扩展接口 WarmCapability

落在 `pkg/provider` 契约旁；各厂 `pkg/provider/{gongji,autodl,ppio,xiangongyun}/warm.go` 实现。

```go
package provider

import "context"

type WarmStrategy string

const (
	WarmOfficialPreheat WarmStrategy = "OfficialPreheat"
	WarmEphemeral       WarmStrategy = "EphemeralWarm"
	WarmReusePool       WarmStrategy = "ReusePool"
	WarmProbeOnly       WarmStrategy = "ProbeOnly"
)

type BillingModel string

const (
	BillPullFreeUntilRunning BillingModel = "pull_free_until_running" // 共绩
	BillFromPull             BillingModel = "bill_from_pull"          // PPIO
	BillFromPowerOn          BillingModel = "bill_from_power_on"      // AutoDL
	BillDeployFreeRunBills   BillingModel = "deploy_free_run_bills"   // 仙宫
)

type PreheatRequest struct {
	Digest          string
	VendorRef       string
	PhysicalRegion  string
	GPUSku          string
	Purpose         string // 恒为 "preheat"
	MaxBillableSec  int
	CostCapCents    int
}

type PreheatHandle struct {
	ProviderJobID string
	Raw           map[string]any
}

type PreheatStatus struct {
	Completed bool
	Ready     bool
	Message   string
	RegionCache []RegionCacheInfo // 共绩 region_cache_info
}

type RegionCacheInfo struct {
	Region string
	Status string // Completed | …
}

// WarmCapability 由国内 Provider 可选实现；未实现则 WarmPlanner 仅 ProbeOnly / 跳过。
type WarmCapability interface {
	BillingModel() BillingModel
	PreferredWarmStrategy() WarmStrategy

	// 官方预热（共绩 ImagePreHeat、PPIO 镜像预热）
	Preheat(ctx context.Context, req PreheatRequest) (PreheatHandle, error)
	GetPreheatStatus(ctx context.Context, handle PreheatHandle) (PreheatStatus, error)

	// 短生命周期：Deploy min → wait Running/image-on-node → destroy；标签 purpose=preheat
	EphemeralWarm(ctx context.Context, req PreheatRequest) error

	// AutoDL reuse_container 保池
	EnsureReusePool(ctx context.Context, req PreheatRequest) error

	// 就绪探针（防 CDN/GC 假阳性）
	ProbeImageReady(ctx context.Context, digest, physicalRegion string) (bool, error)
}
```

各厂默认策略（与 §10.16 表一致，实现时写死在 adapter + 可被 `provider_billing_profile` 覆盖）：

| 厂商 | BillingModel | PreferredWarmStrategy | 备注 |
|------|--------------|----------------------|------|
| 共绩 gongji | pull_free_until_running | OfficialPreheat | `/api/task/image_preheat/*`；Ephemeral 仅探针补强，Running 后立刻停 |
| PPIO ppio | bill_from_pull | OfficialPreheat | **禁止**长 EphemeralWarm；官方预热文档 API |
| AutoDL autodl | bill_from_power_on | ReusePool | `reuse_container≤~7d`；必要时短窗 Ephemeral |
| 仙宫 xiangongyun | deploy_free_run_bills | EphemeralWarm | deploy→Running→`shutdown_release_gpu`/`destroy` |

#### 10.17.5 状态机

**1. image_bindings.status**

```
unknown
  → materializing          # ImageMaterializer 写入 vendor_ref 中
  → unbound_ready_false    # 已有 vendor_ref，ready=0（默认）
  → warming                # warm_job running/verifying
  → ready                  # ready=1，写 ready_at + ttl_expires_at
  → expired / gc           # ttl 过期或厂商 GC / 冷启 P95 恶化
  → warming                # 续热
  → error                  # 物化或暖机连续失败（可人工/退避重试）
```

**2. warm_jobs.state**

```
pending → running → verifying → succeeded
                              → failed   # 指数退避后可再入 pending（attempts++）
                              → aborted  # 成本 cap / 人工 / 策略禁用（如 PPIO ephemeral）
```

成功：事务内 `UPDATE image_bindings SET ready=1, ready_at=NOW(), ttl_expires_at=…, status='ready'`。  
失败：`ready` 保持 false；`last_error` 入库；退避 `min(2^attempts * base, max_backoff)`。

**3. 业务 Deploy**

```
if ImageReady(digest, provider, region):
    capacity_class = hot
    允许进入 90s failover / R_hot
else:
    可选：
      a) cold 路径 Deploy（capacity_class=cold，不占 90s 预算；记 cold_start）
      b) 排队等 warm_job succeeded 再 Deploy
    禁止：90s failover 唯一落点选 !ready
```

#### 10.17.6 核心流程（分步骤伪代码）

**A. Endpoint 创建 / 改镜像**

```
on EndpointUpsert(logical_ref or digest):
  ensure image_artifacts(digest)
  for pref in endpoint.preferred_regions:  # (provider, physical_region, gpu_sku)
    binding = ImageBindingStore.Get(digest, pref.provider, pref.region)
    if binding == nil:
      ImageMaterializer.Enqueue(digest, pref.provider, pref.region)  # 异步；写 status=materializing
    upsert warm_targets(digest, pref…, enabled=true)
  WarmPlanner.Kick(digest)  # 立即 tick 一次，不等周期
```

**B. WarmPlanner 周期 tick（扇出 preferred 区）**

```
every warm_planner_interval (e.g. 60s):
  for t in warm_targets WHERE enabled:
    b = bindings.Get(t.digest, t.provider, t.region)
    if b == nil or b.status == materializing: continue
    if b.ready and b.ttl_expires_at > now()+renew_skew: continue
    adapter = factory.Warm(t.provider)
    strategy = override or adapter.PreferredWarmStrategy()
    if strategy == EphemeralWarm and adapter.BillingModel() == bill_from_pull:
      strategy = OfficialPreheat  # PPIO 护栏：禁止长 pull 暖机
      if !adapter.SupportsOfficialPreheat(): mark skipped_alert; continue
    tryAcquireLock(job_key):
      insert warm_job(pending, strategy, cost_cap, max_billable_seconds)
      WarmWorker.Submit(job)
```

映射 Runpod 教训：无全球 ImagePreHeat → **按 `(provider, physical_region, digest)` 扇出**；locality-aware + defer-until-ready。

**C. Failover / CapacityPlanner 选目标**

```
R_needed = …
R_hot = Σ inventory(provider, region, sku)
        WHERE ImageReady(digest, provider, region)
R_cold = 其余库存

# 90s 路径
candidates = filter(R_hot, sort_by price_asc, prefer_existing_deployment)
if candidates 能满足缺口: 分配并 ScaleApp
else:
  并行 WarmPlanner.Kick(缺口区)
  可选 cold 并行（暴露排队，failover_to_cold_total++）
  绝不把 !ready 标成 90s_eligible
```

**D. 换区（例：河北 → 北京）**

```
src = cn-hebei-az1 → gongji/hebeif-1
dst = cn-beijing-az1 → gongji/beijing-jxq-p1
if !ImageReady(digest, gongji, beijing-jxq-p1):
  WarmPlanner.Ensure(digest, gongji, beijing-jxq-p1, sku)
  90s failover 不得以北京为唯一落点；可继续用河北 hot 或其它 ready 厂
drain 河北 business workers 仅在北京 R_hot 接住之后
```

**E. EphemeralWarm 详细步骤（计费护栏）**

```
EphemeralWarm(req):
  assert purpose == "preheat"
  assert billing_model != bill_from_pull  # PPIO：直接 aborted
  assert max_billable_seconds > 0
  dep = Deploy(min=1, image=vendor_ref, region, sku, labels={purpose:preheat, endpoint_internal:…})
  worker_map.purpose = preheat  # 不注册 Redis 拉任务、不进 LB
  deadline = now() + max_billable_seconds
  wait until Running or image-on-node or deadline:
    if deadline: TerminateWorker/destroy; fail "billable_cap"
  # Ready 即杀
  stop = cheapest_stop(provider)  # Scale(0)|destroy|shutdown_release_gpu
  stop(dep)
  verifying: ProbeImageReady or 同区短业务试拉（仍 purpose=preheat 或不接队列）
  if ok: bindings.ready=true, ttl=…
```

**F. 共绩 ImagePreHeat**

```
Gongji.Preheat:
  regions = GET /api/task/image_preheat/get_regions
  handle  = POST /api/task/image_preheat/create { image, regions: [physical_region], … }
  loop:
    st = GET status / poll region_cache_info
    if region_cache_info[physical_region].status == "Completed":
      return Ready
  timeout → failed（退避）
# 节点预热为可选加强；P0 以集群预热为准
# pull 阶段不收费；若偶发 Ephemeral 探针，Running 后立刻停
```

**G. PPIO 官方预热适配**

```
PPIO.Preheat:
  调用官方「镜像预热」能力（控制台/API，按区域/卡型；以当时文档为准）
  poll until region warmed
  bindings.ready=true
PPIO.EphemeralWarm:
  return ErrStrategyDisabled  # 硬拒绝；WarmPlanner 不得降级成长 pull 暖机
```

**H. AutoDL reuse_container 保池**

```
AutoDL.EnsureReusePool:
  Ensure deployment with reuse_container=true, replica 按温池配置（可 0 开机副本语义以文档为准）
  控制开机时长；跨区首创私有镜像勿假设「创建中不计费」套到弹性路径
  定期 Probe；容器复用窗口 ≤~7d，临近则续期或短窗 Ephemeral
```

**I. 仙宫 deploy → Running → shutdown_release_gpu / destroy**

```
Xiangongyun.EphemeralWarm:
  create instance (deploy 阶段倾向不收算力费)
  wait Running
  shutdown_release_gpu 或 destroy  # 避免 shutdown 保卡继续收 GPU 费
  盘费若仍计：计入 cost_cap 评估；窗口尽量短
  bindings.ready=true
```

#### 10.17.7 与 Autoscaler / 统一入口隔离

1. **preheat workers**：`purpose=preheat`；**禁止**写入该 Endpoint 的 Redis 拉任务消费者集合；**禁止**进入统一入口 `/v1/:endpoint/run` 的 LB / 路由表。
2. **Autoscaler**：目标副本与 `pendingTasks` / `WaitingTime` 决策 **只统计 `purpose=business`**；preheat 副本数不计入 `ScaleApp` 目标。
3. **TerminateWorker**：平台可对 preheat **强制杀**（成本 cap、TTL 续热前清理、策略 aborted）；不走租户优雅下线语义。
4. **语义**：暖机成功 ≠ 业务容量；仅 `ready=true` 后业务 `ScaleApp` 扩出的副本接流量。
5. **厂商弹性**：共绩 `dynamic_pod_strategy.switch=false`；PPIO 不依赖其 queue/concurrency policy；AutoDL 仅平台改 `replica_num`。

#### 10.17.8 配置草样（完整 YAML）

```yaml
image_warm:
  planner_interval: 60s
  default_ttl: 12h
  renew_skew: 1h
  ready_timeout: 10m
  kill_grace: 30s
  max_concurrent_jobs_global: 32
  lock_ttl: 15m
  retry:
    base: 30s
    max_backoff: 30m
    max_attempts: 8

  # 策略可按厂覆盖；默认跟 billing_profiles.preferred_strategy
  strategy_overrides: {}
  #  ppio: OfficialPreheat

  cost_caps:
    default_cents: 200          # 单次 warm_job
    max_billable_seconds: 120   # Ephemeral 硬上限
    ppio_ephemeral_disabled: true

  targets:                      # 白名单：卡型×区×digest
    - digest: "sha256:…"
      provider: gongji
      physical_region: hebeif-1
      gpu_sku: RTX4090
      ttl: 12h
    - digest: "sha256:…"
      provider: gongji
      physical_region: beijing-jxq-p1
      gpu_sku: RTX4090
      ttl: 12h
    - digest: "sha256:…"
      provider: xiangongyun
      physical_region: <data_center>
      gpu_sku: RTX4090
      ttl: 8h

billing_profiles:
  gongji:
    billing_model: pull_free_until_running
    preferred_strategy: OfficialPreheat
  ppio:
    billing_model: bill_from_pull
    preferred_strategy: OfficialPreheat
  autodl:
    billing_model: bill_from_power_on
    preferred_strategy: ReusePool
    reuse_container_max_days: 7
  xiangongyun:
    billing_model: deploy_free_run_bills
    preferred_strategy: EphemeralWarm
    stop_mode: shutdown_release_gpu   # 或 destroy

image_bindings:
  ttl_default: 12h
  probe_interval: 6h
  cold_start_degrade_threshold_ms: 180000  # 超则 ready=false 触发续热

scheduler:
  switch_slo_seconds: 90
  require_image_ready_for_90s: true
  allow_cold_parallel: true
```

#### 10.17.9 指标与告警

| 指标 | 类型 | 说明 |
|------|------|------|
| `image_ready_ratio` | gauge | 按 `(provider, region)` 或全局：ready bindings / 应保热 targets |
| `preheat_latency` | histogram | warm_job 从 running→succeeded |
| `warm_job_cost_estimate` | histogram/counter | 估算卡时费用（分） |
| `cold_start_p95` | histogram | `capacity_class=cold` 的启动秒数 |
| `failover_to_cold_total` | counter | 90s 路径被迫落到 cold |
| `warm_job_failures` | counter | 按 provider/strategy/reason |
| `binding_ttl_expiry` | counter | ttl 过期导致 ready→false |
| `warm_job_aborted_billing_guard` | counter | PPIO ephemeral 禁用等护栏触发 |
| `active_warm_jobs` | gauge | 按 provider |

告警建议（**预热启动后**）：`image_ready_ratio < 0.8`（保热白名单）持续 15m；`failover_to_cold_total` 突增；单租户/全局 `warm_job_cost_estimate` 超日预算；`warm_job_failures` 同 key 连续 ≥3。**一期无预热，不验收本表。**

#### 10.17.10 分阶段交付与验收

| 阶段 | 内容 | 验收 |
|------|------|------|
| **P0（主流程，无预热）** | `pkg/provider/gongji`（Deploy/Scale/Terminate）+ Region Registry + 平台 Autoscaler（队列 **或** 真实 wait-age；**不依赖 K8s.Enabled**）+ 统一入口 + gpus 鉴权终止；计费两账入口。镜像可直传 URL 部署 | **不含** WarmPlanner / ImagePreHeat / `90s_eligible` 强制过滤；对外不承诺 90s/R_hot；冷启走队列等待 |
| **流程后 / P0.5（预热启动）** | 最小 `image_bindings` + 共绩 `WarmCapability`（ImagePreHeat）+ 基础 WarmPlanner（OfficialPreheat）+ Scheduler 过滤 `90s_eligible=ready` | 北京未预热 **不算** 90s 落点；预热 Completed 后可切；与 §10.18「先流程后预热」一致 |
| **P1** | EphemeralWarm（仙宫等计费友好厂）+ TTL/互斥/`cost_cap`；AutoDL reuse；PPIO **仅** OfficialPreheat（禁 ephemeral）；CapacityPlanner `R_hot`；**拼池** | PPIO 无法提交 EphemeralWarm；9×4090 拼池先填 R_hot |
| **P2** | 多区扇出规模化、成本归因到租户「保热区域」、可选常驻暖池 | 指标面板齐全；租户白名单加收可用 |

#### 10.17.11 工程目录建议

```
pkg/image/
  registry.go          # ImageRegistry
  materializer.go      # ImageMaterializer
  binding_store.go     # ImageBindingStore（MySQL）
  ready.go             # ImageReady() 查询
pkg/warm/
  planner.go           # WarmPlanner tick / Kick / 扇出
  worker.go            # WarmWorker
  job_store.go         # warm_jobs DAO + 互斥
  strategy/
    official_preheat.go
    ephemeral.go
    reuse_pool.go
    probe_only.go
  billing.go           # billing_model → strategy 解析 + 护栏
pkg/provider/
  warm.go              # WarmCapability 接口（或放 interfaces）
  gongji/warm.go       # ImagePreHeat
  autodl/warm.go       # reuse_container
  ppio/warm.go         # OfficialPreheat；Ephemeral 返回 disabled
  xiangongyun/warm.go  # Ephemeral + shutdown_release_gpu
pkg/autoscaler/        # 现有；过滤 purpose=business
pkg/scheduler/         # 90s_eligible = ready
configs/
  image_warm.yaml      # §10.17.8
  regions.yaml         # Region Registry
```

#### 10.17.12 风险与护栏

| 风险 | 护栏 |
|------|------|
| **PPIO 误用 ephemeral** | `ppio_ephemeral_disabled=true`；`EphemeralWarm` 直接 `ErrStrategyDisabled`；Planner 强制 OfficialPreheat |
| **假阳性 ready** | TTL + 定期 `ProbeImageReady`；冷启 P95 超阈降级 `ready=false`；CDN URL 禁止跨区推断 |
| **并发暖机烧钱** | `job_key` 互斥 + 全局 `max_concurrent_jobs` + `cost_cap` + 指数退避 |
| **厂商 GC** | ttl 续热；监听/推断 GC 后立刻 `expired→warming` |
| **跨合规边界** | Region Registry 与调度禁止把数据面副本调度到租户不允许的物理区；暖机 targets 受同一白名单约束 |
| **preheat 漏进业务** | `purpose` 强制检查于注册 Redis / LB / Autoscaler 三处 |
| **紧耦合 N-GPU 误拼池** | CapacityPlanner 在任务属性 `coupled=true` 时拒绝跨 provider 拆分（§10.14） |

### 10.18 2026-10-17 产品拍板

权威全文见同目录 `waverless-product-decisions-2026-10-17.md`。摘要：

| # | 议题 | 结论 |
|---|------|------|
| 1 | 镜像预热 / WarmPlanner / ImagePreHeat / ephemeral warm | **一期不做实现**；目标能力可保留 |
| 2 | WaitingTime | 文档改为「待实现 / 决策引擎未读」；**真实 wait-age → P0**；验收 = 队列深度 **OR** wait-age（解耦方案 §C.2） |
| 3 | `apps/waverless` | 独立仓 `gpurun/waverless` 的 **checkout 联调路径**；非 monorepo 永久合并（§9） |
| 4 | 双入口 | **先实现 waverless 路径**；cloud/gpus + waverless 共担弹性/LB/账单/成本/预热（预热一期不做） |
| 5 | 暖机 | **= 镜像预热**；先主流程，再决定预热；一期不实现 |
| 6 | Autoscaler ↔ K8s / Provider | Gongji = **独立 CoreDeploymentProvider**（对齐 RunPod/Novita，非 K8s、非仅 SkyPilot）；P0 按 [`waverless-autoscaler-provider-decoupling-2026-10-17.md`](./waverless-autoscaler-provider-decoupling-2026-10-17.md) 解耦，使 Gongji **不依赖 `K8s.Enabled`** 也能跑 Autoscaler |
| 7 | 9×4090 多厂拼池 | **对用户无厂感知的多厂自动选址 = M1（§10.19）**；**同 Endpoint 跨厂拆副本**仍属 **M2 / §10.14**；一期不对外承诺 90s failover |
| 8 | 计费两账 + 旧 stop/cron | **纳入 P0**（旁路或修复后方可上线 Waverless 计费） |
| 9 | 租户终止 | gpus ownership + service identity；drain 默认「失败可重试 + 事件可见」；preheat worker 不对租户暴露 |
| 10 | PPIO ephemeral YAML | **删除/FORBIDDEN**；与 billing 护栏一致 |
| 11 | 一期 purchaseType | **按量 + 时长包**商用；预约保留只建契约，不自动保证容量 |

---

### 10.19 M1：多 Provider 自动 Placement（接口与表结构定稿，2026-10-17）

> **状态**：**拼池目标版**见 [`waverless-provider-hub-placement-final-2026-10-17.md`](./waverless-provider-hub-placement-final-2026-10-17.md)（含 §待确认）；下文 M1 单 slice 描述 **已被该文档 supersede**。  
> **背景**：用户不关心资源在哪厂/哪区；须 **自动拼池**（§10.14 + 共绩多区）。  
> **与 §10.14 关系**：**M2 = 本节产品目标**（非仅「后续可选」）。

#### 10.19.1 产品语义

| 用户输入 | 必填 | 说明 |
|----------|------|------|
| 卡型 `gpuType` | 是 | 如 `rtx4090` |
| 每 worker 卡数 `gpuCount` | 是 | 可配置选项，不写死 |
| `minReplicas` / `maxReplicas` | 是 | 弹性区间 |
| `billingMode` | 是 | `on_demand` / `spot` / …（可配枚举） |
| 逻辑镜像 `logicalImage` | 是 | digest 引用；不对客暴露厂 UUID |
| **区域 `regionAllowlist`** | **否** | **逻辑区多选**；空 / 省略 = 不限区；有值则 Placement **只**在选定逻辑区内；**用户可随时 PATCH 修改** |
| Provider / 物理 AZ | 否 | 默认不暴露；运维可用 `placementMode=pin` |

#### 10.19.2 M1 范围 / 非目标

**做**：

- `ProviderHub`：config `providers.deployments: []` 同时注册多个 `CoreDeploymentProvider`（废弃唯一生效的单值；单值仅作 deprecated alias）。
- `PlacementService`：按价升序 + 库存上限 + 镜像物化 `open_cost` 选一家；尊重 `regionAllowlist`。
- 每 Endpoint **至多 1 个 `active` slice**；Autoscaler 仍对 `active_slice` 调 `ScaleApp`。
- `regionAllowlist` 变更：区外 slice → `draining`（M1：停升、缩到 0 后 `retired`）；若 desired>0 且当前非法 → 再 Placement 开新 slice（drain 旧 + 建新）。
- apps/gpus：默认 `placementMode=auto`；区域多选可选。

**不做（M2+）**：同 Endpoint 多 active slice 拆分；WarmPlanner / 预热；PPIO/AutoDL/仙宫新 adapter（可先只挂已有 Gongji/Novita）。

#### 10.19.3 Config（全部可配）

```yaml
providers:
  deployments: [gongji, novita]   # 或 env PROVIDERS_DEPLOYMENTS
  # deployment: gongji            # DEPRECATED → 视为单元素列表
  metadata: postgres

placement:
  strategy: greedy_cost
  image_not_ready_penalty: 1.0
  allow_cold_start: true
  candidate_providers: []         # 空 = deployments 全集

gongji: { enabled: true, ... }
novita: { enabled: true, ... }
```

`enabled=false` 不进 Hub。报价/库存不进二进制常量。

#### 10.19.4 接口草案

保留现有 `CoreDeploymentProvider`（Create / ScaleApp / Terminate / ListWorkers…）。新增：

```text
ProviderHub
  Get(providerID) CoreDeploymentProvider
  List() []ProviderInfo
  CreateSlice(ctx, endpoint, PlacementDecision, CreateReq) (slice, error)
  ScaleSlice(ctx, sliceID, replicas) error

PlacementService
  Select(ctx, PlacementRequest) (PlacementDecision, error)

PlacementRequest
  gpuType, gpuCountPerWorker, desiredReplicas
  imageDigest, billingMode
  regionAllowlist []string          # 逻辑区；空 = 全域
  constraints?                      # 运维 pin / exclude_providers

PlacementDecision
  providerID, physicalRegion, providerSkuID
  unitCost, openCost, score
  imageBindingID? | need_materialize

InventoryQuote                       # 来自 provider_offers 或 adapter.ListOffers
  providerID, skuID, gpuType, gpuCount, region
  unitPrice, currency, billingMode, availableCap
  imagePullBillingModel
```

逻辑区 → `(provider_id, physical_region)` 映射由 **平台 Region Registry** 提供（waverless 侧可读配置/表；与 Gongji CRM 无区号映射的既有结论一致）。

#### 10.19.5 表结构（PostgreSQL）

**`endpoints` 增量**

| 列 | 类型 | 说明 |
|----|------|------|
| `gpu_type` | varchar(64) | 用户卡型 |
| `placement_mode` | varchar(32) | `auto`（默认）/ `pin` |
| `billing_mode` | varchar(32) | |
| `logical_image` | varchar(512) | 平台逻辑镜像 |
| `region_allowlist` | jsonb | 逻辑区 ID 数组；`[]`/null = 不限 |
| `active_slice_id` | bigint null | M1 当前唯一活跃 slice |

**`endpoint_provider_slices`（新）**

| 列 | 说明 |
|----|------|
| `id`, `endpoint` | |
| `provider_id` | `gongji` / `novita` / … |
| `provider_ref` | 厂侧资源 id |
| `provider_sku_id` | |
| `physical_region` | |
| `desired_replicas`, `ready_replicas` | |
| `status` | `active` / `draining` / `failed` / `retired` |
| `unit_cost_snapshot`, `currency` | |
| `image_binding_id` | |
| `last_scale_at`, `created_at`, `updated_at` | |

M1 约束：partial unique `(endpoint) WHERE status = 'active'`（M2 放宽）。

**`image_bindings`（新）** — 键 `(digest, provider_id, physical_region)` + `ready` / `materialize_state` / `vendor_ref`（与 §10.15/10.17 一致）。

**`provider_offers`（新，推荐）** — Placement 读库存与价；adapter/cron 刷新。若后续改为纯实时 `ListOffers`，本表可降级为缓存。

**`workers` 增量**：`provider_id`, `slice_id`（任务队列仍按 `endpoint`，不按厂拆）。

#### 10.19.6 控制面 API（对 apps/gpus）

创建 / 更新示例：

```json
{
  endpoint: …,
  gpuType: rtx4090,
  gpuCount: 2,
  minReplicas: 0,
  maxReplicas: 10,
  billingMode: on_demand,
  logicalImage: cr.example/tenant/app@sha256:…,
  placementMode: auto,
  regionAllowlist: [cn-north-hebei, cn-east-shanghai],
  scaleUpWaitSeconds: 90
}
```

- `regionAllowlist` 省略或 `[]` = 不限区。  
- `PATCH` 可随时改 `regionAllowlist`（及弹性/计费等）；生效规则见 §10.19.2。  
- 响应可带 `activeSlice: { providerId, region, skuId }`（产品 UI 可折叠）。  
- **禁止**把必选 Provider/共绩 AZ 作为主创建路径。

#### 10.19.7 apps/gpus

- 表单：卡型、卡数选项、min/max、计费、可选区域多选、超时 → 全部 `SERVERLESS_DEPLOY_CONFIG` / Region Registry，**不写死**。  
- `orchestratorType=waverless` + `placementMode=auto`。  
- 售价快照：`gpuType + billingMode`；成本账：`provider_id + slice_id`。

#### 10.19.8 兼容与迁移

- 旧 `providers.deployment: X` → `deployments: [X]`。  
- 已有 Endpoint：回填一行 `endpoint_provider_slices`（从 `runtime_state`/labels 取 `provider_ref`），`region_allowlist = []`。  
- 元数据存储：PostgreSQL（见 waverless PG 迁移）。

#### 10.19.9 分期提醒

| 里程碑 | 内容 |
|--------|------|
| **M1（本节）** | Hub + Placement 选单厂 + regionAllowlist + 单 active slice |
| **M2** | 多 active slice；Autoscaler 拆分多厂 `ScaleApp`；统一队列（§10.14） |
| **M3** | 更多 CN adapter；暖机/预热按 `billing_model`；ImageReady 切换 SLO |

