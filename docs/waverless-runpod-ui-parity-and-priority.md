# Runpod 功能对照 & 实现优先级（waverless / gpurun）

> **日期**: 2026-10-17（Asia/Shanghai）；同日清理回写。  
> **范围**: waverless 独立仓（联调路径 `apps/waverless`）、本仓库 gpus/web、推荐文 §9–§10.18；**产品拍板**见 `waverless-product-decisions-2026-10-17.md`  
> **问题**: (1) 当前页面/产品设计是否对齐 Runpod；(2) 先做「镜像模板预发布到各 GPU 厂商」还是「Serverless/Endpoint 优先」  
> **权威分层**: 一期范围以拍板 + 实施计划为准；推荐文 §10.13+ 为目标架构（非一期必做预热）；本文管 UI 信息架构与优先级

---

## 1. 结论（两句话）

**当前对客 UI 是「Runpod 形似的壳」：cloud 控制台有创建 Endpoint / 模板 / GPU·区域 / min·max Workers / 磁盘·卷 的向导与详情页，waverless 自带运维型 Web UI（Endpoints/Workers/Autoscaler/Tasks），但缺少 Active/Flex、Flashboot、Model Cache、多机房就绪、逻辑镜像 binding 等 Runpod 核心深度能力；目标架构仍主要在推荐 MD §10，**一期范围以拍板 + 实施计划为准**，而非完整 UED。**  

**实现优先级锁定为 waverless Serverless/Endpoint 路径优先（统一入口 + Autoscaler-only ScaleApp + P0 Gongji Provider；**一期不做镜像预热/WarmPlanner**），禁止把「镜像模板预发布到全部厂商」当作 MVP 前置；模板预热/多厂物化/拼池为 **目标能力（P1+）**，在主流程之后按 preferred 与 SLA 启动。范围以实施计划 + `waverless-product-decisions-2026-10-17.md` 为准。**

---

## 2. Runpod 功能 vs 当前设计/页面对照表

### 2.1 「当前页面设计」盘点（诚实版）

| 来源 | 形态 | 与 Runpod 关系 | 后端落地 |
|------|------|----------------|----------|
| **cloud console** `apps/gpus/.../console/serverless/` | 对客控制台：`deploy` 四步（GPU·区域 / 模板·镜像 / Worker 配置 / 存储）、`instances` 列表、`instances/[id]` 概览+Workers/Pods+配置 | **刻意对齐** Runpod Serverless 控制台信息架构（Endpoint、min/max Workers、模板、卷） | `createServerless` 写 DB + **SkyPilot 异步**；**未接 waverless / Gongji**；商业化 gap 文档仍标后端缺口 |
| **waverless `web-ui/`** | 运维/平台 UI：Dashboard、Serverless 创建向导、Endpoints、Endpoint Detail（Workers/Autoscaler/Tasks/Image digest）、Tasks、Specs | 对齐 Runpod **运维面**（队列任务、副本、扩缩参数、Worker 列表），非完整商业控制台 | 直连 waverless API；Provider 仅 k8s/novita/docker，**无 gongji** |
| **营销页** `(marketing)/serverless` | 卖点页，非控制台 | 产品叙事 | — |
| **设计文档** `serverless-*.md`、`image-and-template-management.md` | 方案/差距/镜像模板表结构 | 设计意图对齐「模板商店 + 预加载」 | 实现不完整；与 §10「逻辑镜像+物化」尚未统一 |
| **推荐 MD §10** | 多厂 Region、逻辑镜像、WarmPlanner、拼池、90s SLO | **目标架构**；范围以实施计划 + 拍板为准（一期无预热/无 90s 承诺） | 代码未实现（无 `pkg/provider/gongji`；WarmPlanner 一期不做） |
| **UED / Figma / 高保真** | **未发现**独立 UED 仓库或稿 | — | 设计「活在」console 壳 + §10 文字 |

**一句话**：UI **不薄到零**，但 **商业闭环与多厂 Serverless 深度能力仍薄**；若问「是否匹配 Runpod 功能设计」，答案是 **信息架构部分匹配，能力深度与供给路径未匹配**。

### 2.2 对照矩阵

| Runpod 能力 | 我们当前设计/UI | 覆盖 | 缺口说明 |
|-------------|-----------------|------|----------|
| **Serverless Endpoints**（队列 + 统一 URL） | waverless V1 `/run`/`runsync`/`status`；cloud 展示 endpoint URL + cURL | **partial** | API 在 waverless；cloud 壳接 SkyPilot 叙事，**未切到 waverless 统一入口** |
| **请求队列 / LB** | waverless Redis 队列 + pull Worker | **partial**（引擎有，对客不可见） | 控制台缺少队列深度、等待时长、按厂拆分容量的运营视图 |
| **Workers 生命周期**（Initializing / Idle / Running / Scaled down） | waverless Workers Tab；cloud PodList/PodLogs | **partial** | 无 Runpod 级状态机文案；无「缩容后 host 预拉不计费」产品化 |
| **Active vs Flex Workers** | 仅有 **minWorkers / maxWorkers**（cloud）或 min/maxReplicas（waverless） | **no** | 未建模 Active（常驻计费）与 Flex（弹性）双轨；MVP 可用 min/max + idleTimeout 近似，不必先抄名词 |
| **创建 Endpoint 向导** | 云：GPU→模板→Worker→存储；waverless：Spec→image→autoscaler | **partial** | 缺逻辑 AZ / preferred Provider / 合规域 / 逻辑镜像 digest 选择 |
| **Templates / Docker 镜像导入** | 云：preset 应用模板 + 平台仓/自定义仓；waverless：自由 image 字段；设计文档有模板表 | **partial** | **无** `image_artifacts`/`image_bindings` UI；**无**「对客只见逻辑 ref」；**禁止**的「创建时同步全厂」也未做（正确） |
| **GPU 选型** | 云 `gpu-data` + 区域；waverless Specs | **partial** | 未接 Gongji inventory/price；区域是展示级，非逻辑 AZ Registry |
| **Pods（整机/开发机）** | cloud 另有 instances/产品线；waverless 不做 | **n/a（MVP 外）** | 与 Serverless 分流（§9）；不阻塞 Endpoint MVP |
| **Flash / Flashboot** | 无页面、无字段 | **no** | 用 §10 WarmPlanner + `ImageReady` + 可选 minReplicas 近似；勿先做 Flash 品牌能力 |
| **Network Volumes** | 云 StorageStep 可选 volume；设计有 S3/网络卷文档 | **partial** | 多 DC 钉死单机房、跨区不自动同步等 Runpod 语义未产品化 |
| **Model Caching / Model Store** | 无 | **no** | §10.17 明确 **P0 不做**模型权重 Store；镜像层优先 |
| **多 Datacenter / 跨区调度** | §10 Region Registry + failover≤90s（**P1+ 目标设计**）；UI 仅单区域下拉 | **partial（设计）/ no（UI）** | 一期不承诺 failover/90s；调度只认 `ImageReady` 为后续能力 |
| **Billing / 按秒** | 云有价格展示与计费设计；gap 文档标未闭环 | **partial** | 外采科目、暖机成本归属（§10.16）未进 UI |
| **Console：Worker 定点终止** | waverless 具备 Terminate 接口语义；云 Pod 面板偏展示 | **partial** | §10.7 租户/运维权限 + 审计 UI 未做 |
| **Autoscaler 单一真相** | waverless Autoscaler；§10.6 锁定关厂商原生弹性 | **yes（设计/引擎）** | Gongji Provider 未落地前无法验收；UI 需避免暴露厂商侧 queue policy |

**覆盖统计（粗）**：yes ≈ 1 · partial ≈ 10 · no ≈ 4 · n/a ≈ 1 → **形似 Runpod Serverless 主路径，深度与供给未齐**。

### 2.3 「核心深度能力」术语校准（2026-10-17）

> Runpod 的精确定义以其 Endpoint settings、Worker lifecycle、Cached models 文档为准；以下不把内部技术实现假设成每个国内 Provider 都具备的 API 能力。

| Runpod 能力 | 用户实际获得什么 | 与我们已有概念的区别 | 国内厂商 API 的实现判断 |
|---|---|---|---|
| **Active workers** | 固定数量 Worker 始终处于 running/ready；没有请求时也持续计费；用容量换低延迟、避开 scale-from-zero 冷启动 | 不是简单 `minWorkers` 字段：得有保底容量/服务 ready 语义和明确空闲计费 | **容易由平台编排近似**：Autoscaler 维持 `minReplicas >= activeCount`，用 Provider scale API 部署；但无法保证厂商库存永不抢占，需承诺 best-effort 或签容量合同。计费起点/空闲计费需 Cloud 定义 |
| **Flex workers** | 按请求/队列动态增减、可缩到零；空闲窗口仍 running 并计费，scale-down 后为非计费状态；支持 Max Workers 限额 | 与 Active 共同组成 Endpoint 的两个容量池；原 Waverless `min/max + idleTimeout` 是基础近似，缺池别/按池状态/独立计量 | **可在平台实现主要语义**：Autoscaler 统一决定 Flex 目标副本，Provider 负责 Scale；对外部 API 的异步创建/Ready/限额需适配。Runpod 式宿主机 idle cache 状态未必能拿到 |
| **FlashBoot** | Worker 停机后保留宿主机/运行环境状态，使再次启动比全新机器启动快；与单纯缓存容器镜像不同 | 不是 FlashAttention，也不是普通镜像预热；是 Provider/平台宿主机生命周期和状态保留能力 | **不能仅靠一般 GPU 云 API 复制**。需厂商公开“同宿主机复用/暂停态恢复/保留时长”能力；否则可用常驻 Active、宿主机暖池或模型/镜像缓存降低冷启，但应称平台 Warm Pool/预热，不叫 FlashBoot，SLO 单独测 |
| **Model Cache（Cached models）** | 模型权重与容器镜像分离，模型缓存到 GPU Host 的本地盘；调度优先选择已有目标模型缓存的 Host；缓存 miss 时先准备模型，且按 Runpod 文档该下载阶段不收 Worker 运行费；同 Host 多 Worker 可共享缓存 | 不是 image layer cache：镜像可包含 runtime，Model Cache 是大型权重的数据面缓存；也不是挂载网络盘 | **可通过平台+存储服务实现产品级等价，但依赖不只是部署 API**：模型制品登记/digest、区域缓存节点或 S3/NAS/本地盘 Agent、cache inventory、缓存亲和调度、缺失回填及成本归属。国内厂商若只给 Serverless endpoint API 且隐藏宿主机，就不能实现宿主机共享/命中优先，只能用共享对象存储/卷由应用自行加载 |
| **Multi-datacenter readiness / 多机房就绪** | Endpoint 限定/选择多个 DC；目标区容量、镜像、模型缓存可用时能在多个 DC 启动 Worker；按 GPU 优先级回退；跨区迁移受卷、网络和合规约束 | 不只是 region 下拉列表，也不等于“API 支持多个 region”；要有按 DC/SKU 的容量状态、调度/故障域、迁移及就绪状态 | **可做控制面能力，厂商 API 只能提供基础信号**：Region Registry + inventory poll + 各区子 deployment + readiness probe + quotas 可形成多 DC；API 未提供库存时，只能用尝试部署/历史成功率做弱信号，不能承诺可立即就绪或固定 failover SLO |
| **Logical image binding** | 用户使用稳定的平台镜像逻辑引用/digest，不因底层厂商、私有镜像 ID、区域变化改配置；平台知道制品在何处可用、是否 ready | 与“Docker image 字符串透传”不同，也与创建 Endpoint 时复制到所有厂商不同 | **平台可完全实现，不需要厂商提供同名能力**：Image Artifact + `(digest, provider, physicalRegion, sku/runtime)` Binding，binding miss 按需 materialize/preheat，Ready 校验后才调度；厂商需支持 pull 私有仓/导入/查询或至少在 Deploy 失败时能识别错误。不能直拉且无导入 API 的厂商会成为不支持该镜像的候选 |

#### 对产品/系统边界的关键解释

1. **Active/Flex 是容量策略和计费策略的组合**：Active 保底容量无任务也收费；Flex 是按需容量，仅 worker `Running` 时收费、缩到下线停止计费。可先用两个池目标数做产品抽象，底层仍由 Waverless Autoscaler 控制，不能把两套 Autoscaler 同时打开。
2. **FlashBoot、镜像预热、Model Cache 三个加速层不同**：镜像预热缩短 container image pull；Model Cache 缩短下载模型权重并可做 cache-aware placement；FlashBoot 缩短 Worker 所在机器/环境从 scaled-down 回到 running 的时间。预热 `Completed` 不代表 Worker Ready，也不代表模型成功加载。
3. **「多机房就绪」须拆成 inventory、artifact readiness、model readiness、capacity readiness、application readiness**；应分别记录，不能把 Provider API 返回 `accepted` 或镜像预热完成标成 Endpoint Ready。
4. **逻辑镜像 binding 是平台所有权**：保存逻辑 digest 到厂商镜像引用的映射，并带出错/版本/物化时间。镜像 tag 可变，binding key 必须以不可变 digest 为主；不同 GPU 架构/驱动 ABI/runtime 可能要多个 variant，不可只按 `(digest, region)` 简化。

#### 国内厂商 API 证据及限制

- 当前仓库推荐文档 §10 对共绩描述的 `task/create`、`change_points`、`task/points`、`delete_pod` 提供部署、副本调整、Worker 枚举和定点删点基础；文档提及 `dynamic_pod_strategy`，但项目已锁定关闭厂商原生弹性，Autoscaler 由 Waverless 持有。
- 共绩公开《镜像预热功能说明》描述：可把指定镜像预热至集群 Harbor 分站或节点本地缓存；可选“预热到集群/节点”、选择集群/GPU 卡型、设置期望节点数，并有已用/可用/期望数状态；页面同时说明该功能处于邀测，且预热镜像并不代表模型已加载/服务已 Ready。它是最接近 Host image cache 的能力，但公开资料不能证明稳定通用的生产 API、与每个物理 Region/SKU 的完整映射、保留策略或运行中 cache placement API。
- 共绩公开目录另列对象存储加速、跨区域调度、共享卷持久模型缓存等能力；这支持“可拼出产品能力”的判断，但**不能据文档标题推断底层实现的 API 覆盖范围、可编程性、SLA 或所有 AZ 均可用**。接入前必须逐项取得 API schema、限额/计费、状态查询、幂等/重试、数据复制和故障边界，并在沙箱验证。
- 对 Runpod Model Cache / FlashBoot 的内部机制不应作为国内厂商能力对标结论；厂商实现可能是不同技术。对客定义为可测的产品目标（例如 cache-hit cold-start P95、ready capacity P95、缓存命中率），由平台服务达成，而不是要求供应商复制品牌功能。

#### 能力落地优先级建议

| 优先级 | 建议实现 | 验收口径 |
|---|---|---|
| P0 | Flex 基础模式；Active 用 minReplicas 保底近似；Region Registry（至少 1 个逻辑 AZ）；**镜像 URL 直传 Gongji**（可记录 digest，**不强制** binding.ready / 预热）；单 ProviderBinding；Provider worker/扩容状态监测 | 队列长度 **或** 真实 wait-age 驱动扩容、scale-to-zero；一个国内 AZ 可部署且 desired/observed/ready 真实；**不承诺** 90s/R_hot |
| P0.5 | 共绩官方镜像预热 Provider capability + WarmPlanner；区/SKU 级镜像缓存状态 | 预热任务可追踪到 `Ready/Failed/Unknown`，预热完成与 Worker Ready 分离；成本 owner 清楚 |
| P1 | 第二国内 Provider 同逻辑 AZ；多 DC inventory/容量健康；preferred Provider/AZ 与有界 failover；按 digest/variant 自动物化 | 故障注入验证 failover；只有目标区 binding/capacity 可用才列入 eligible；测得 SLA 后才对外承诺 |
| P2 | 模型独立制品/权重 Cache、模型/镜像双层 cache-aware 调度、主动暖池；若供应商支持再整合宿主机快速恢复 | 指定 digest + model digest 的 cache hit 能降低已定义的 P95 冷启；成本、TTL、回收和跨区合规完整 |

**结论**：国内厂商 API 能支撑 Runpod 深度能力的**基础供给操作**（创建、扩缩、删 Worker、镜像预热、区域/对象存储的部分能力），但 Active/Flex 的产品语义、区域间路由、逻辑镜像 binding、缓存就绪判断和策略编排应由平台补齐。Model Cache 要有节点/共享缓存与 placement 信号；FlashBoot 需要宿主机状态复用能力，通常不能通过普通 Serverless Open API 自行补出来。没有供应商 API 能力时仍可实现“同等用户体验的降级方案”，但不能承诺等同 Runpod 的加速实现/SLO。

---

## 3. 缺口与是否阻塞 MVP

| 缺口 | 阻塞 MVP？ | 理由 |
|------|------------|------|
| cloud ↔ waverless 薄门面未接通（仍走 SkyPilot 注释路径） | **是** | 拍板 #4：先走 waverless 路径；MVP 验收靠「统一入口 + ScaleApp + Gongji」 |
| `pkg/provider/gongji` 不存在 | **是** | P0 国内厂商已锁定 |
| 真实 wait-age 扩容（决策引擎未读 WaitingTime） | **是（P0）** | 拍板 #2；文档不得再称「已具备」 |
| Autoscaler 依赖 `K8s.Enabled` | **是（P0）** | 拍板 #6：Gongji 须在无 K8s 时仍可弹性 |
| 计费两账 + 旧 `billServerlessStop`/cron | **是（P0）** | 拍板 #8；旁路或修复后方可上线 |
| 租户终止 ownership / drain 语义 / preheat 不暴露 | **是（契约 P0）** | 拍板 #9 |
| 逻辑镜像 + `image_bindings` + 按需物化 | **软阻塞** | 可用「平台仓 URL 直传 Gongji」先跑通；**一期不要求 ImageReady/预热** |
| WarmPlanner / ImageReady / 90s 过滤 | **否（一期不做；流程后/P1）** | 拍板 #1/#5；冷启走队列；**不承诺 90s failover** |
| Active/Flex、Flashboot、Model Cache | **否** | 非 MVP；min/max + idle 足够 |
| 镜像模板预发布到 **全部** GPU 厂商 | **否，且禁止作前置** | §10.13 成本红线 #1 |
| Network Volume / Pods 产品线 | **否** | 与 Serverless 分流 |
| 高保真 UED | **否** | 沿用现有 console 壳 + 最小信息架构即可开干 |
| 多厂拼池 / AutoDL / PPIO | **否（目标/P1+）** | 拍板 #7：保留目标，一期不做、不承诺 90s |

---

## 4. 实现优先级建议（分阶段）

### 4.1 默认推荐（与 §9–§10.17 一致）

**Serverless / Endpoint 路径优先**，一期镜像采用 **平台仓/BYO URL 直传 Gongji**（拍板 #1）；目标架构才是「平台逻辑引用 + 懒物化」。**不要**先做「模板预发布到各 GPU 厂商」。

依赖顺序：

```
P0   Gongji Provider（Deploy/ScaleApp/Terminate，关 dynamic_pod_strategy）
  →  统一入口（waverless V1）+ Autoscaler-only（**不依赖 K8s.Enabled**）
  →  真实 wait-age OR 队列长度扩容
  →  Cloud 薄门面：创建 Endpoint / API Key / 逻辑 AZ / 计费两账（+ 旧 stop/cron 旁路或修复）
  →  对客逻辑镜像（平台仓或 BYO）→ 首次 Deploy 直拉 Gongji（**不做预热**）
  →  租户终止：gpus ownership + drain「失败可重试+事件可见」

流程后/P0.5  WarmPlanner（共绩 ImagePreHeat）+ bindings.ready + 终止权限 UI（主流程之后）
P1   第二厂（AutoDL 优先）+ preferred 预热/物化 + **拼池** R_hot（目标能力）
P2   RunPod 海外 Provider、Model Store、Flash 级体验、闲时合流
```

### 4.2 为何不「模板先发全厂」

| 维度 | 先 Serverless + 懒物化 | 先全厂预发布模板 |
|------|------------------------|------------------|
| MVP 路径 | 立刻验收 G3/G4/G5（队列弹性、统一入口、定点终止） | 卡在仓库同步、AutoDL uuid、多区 CDN，**无流量可验** |
| 成本 | 一层真相源 + 首次命中付一次（§10.13 B） | 存储×N + 持续同步（策略 A，已否决） |
| 风险若反转 | — | 违反红线「禁止创建 Endpoint 时同步全部厂商」；拖垮 P0；假 `ready` 导致 90s 穿帮 |
| 与锁定决策 | Autoscaler-only、P0 Gongji、pull-workers 统一入口；**WarmPlanner 一期不做**（拍板 #1） | 无锁定依据；与 §10.13/10.17/10.18 冲突 |

### 4.3 何时「模板/镜像预热提前」升为 P1

在下列信号出现时，把 **preferred（digest, provider, physical_region）预热/物化** 升为 P1（仍不是「全厂全量」）：

1. **第二厂接入**（尤其 AutoDL 必须 import uuid）且 failover/拼池需要 `R_hot`；
2. **冷启 P95** 主导客诉或队列等待不可接受；
3. Endpoint **preferred 列表**稳定，预热集合可白名单化（有 `cost_cap`）；
4. 共绩 `ImagePreHeat` 已跑通，可复制策略到 PPIO 官方预热等。

**仍不做**：创建时扇出到所有启用厂商；把 DockerHub 当国内默认源；P0 上 Model Store。

---

## 5. 建议的页面信息架构（最小清单，对齐 Runpod 核心）

> 无高保真；在现有 cloud `console/serverless` 壳上改语义，waverless web-ui 可保留为内部运维。

| # | 页面 | 最小字段/模块 | MVP |
|---|------|---------------|-----|
| 1 | **Endpoints 列表** | 名称、状态、逻辑 AZ、GPU、min–max、队列积压、小时费用 | P0 |
| 2 | **创建 Endpoint 向导** | ① 镜像（平台仓 URL / BYO；有 digest 则展示，无则后补）② GPU + 逻辑 AZ（隐藏厂商）③ min/max Workers + idleTimeout + 最长排队等待触发扩容（勿强推 Active/Flex 文案）④ 环境变量/端口/命令 | P0 |
| 3 | **Endpoint 详情 · 概览** | 统一 URL、cURL、副本、队列/等待、计费 | P0 |
| 4 | **Endpoint 详情 · Workers** | worker_id、状态、GPU、区、**终止**（租户自有）、日志入口 | P0.5 |
| 5 | **Endpoint 详情 · 扩缩** | min/max、阈值、冷却；文案写明「平台自动扩缩」 | P0 |
| 6 | **镜像**（可后置独立页） | 逻辑制品列表、digest、各厂 binding 状态（ready/未物化）— **只读为主** | P0.5 只读 / P1 预热操作 |
| 7 | **运维（内部）** | Region Registry、WarmPlanner 任务、审计（终止原因） | P0.5–P1 |
| — | 暂缓 | Active/Flex 双轨、Flashboot 开关、Model Cache、多 Volume 跨区、Pods 混排 | ≥P2 |

**文案护栏（对齐 §10.15 + 拍板 #7）**：**一期不对外承诺 90s failover**。若提及切换，仅「故障切换决策 ≤90s（P1+）；**已预热区域** 新副本通常 X 秒 Ready」——禁止「任意新区 90s 必起」。

---

## 6. 证据索引（便于复核）

| 断言 | 路径 |
|------|------|
| 锁定：Gongji P0、Autoscaler-only、逻辑镜像；WarmPlanner 一期不做 | 推荐文 §10.6–10.18；`waverless-product-decisions-2026-10-17.md` |
| 禁止创建时同步全厂 | 同文档 §10.13 成本红线 |
| cloud Serverless 壳 | `repos/cloud/apps/gpus/src/app/[locale]/console/serverless/**` |
| createServerless → DB + SkyPilot | `.../routers/compute.ts`、`dataaccess/compute/serverless.ts` |
| waverless UI 页面 | `repos/waverless/web-ui/src/{App.tsx,pages/**}` |
| Provider 现状无 gongji | `repos/waverless/pkg/provider/{docker,k8s,novita}` |
| 商业化 UI/后端 gap | `repos/cloud/apps/docs/content/design/cloud/serverless-commercialization-gap.md` |

### 外部术语核对来源

| 能力 | 文档 |
|------|------|
| Active/Flex、Worker lifecycle、FlashBoot、Endpoint settings | [Runpod Endpoint settings](https://docs.runpod.io/serverless/endpoints/endpoint-configurations)、[Runpod Worker overview](https://docs.runpod.io/serverless/workers/overview) |
| Host cached models 与 cache-aware placement | [Runpod Cached models](https://docs.runpod.io/serverless/endpoints/model-caching) |
| 共绩 Region/Provider API 方案依据 | [现有集成推荐文档 §10](waverless-cloud-skypilot-integration-recommendation.md)；共绩公开《镜像预热功能说明》《跨区域调度功能说明》《对象存储加速》须在接入时复核当前 API/SLA |

---

## 文档元信息

- **作者**: Grok Bot（executor；同日清理回写 P0 镜像口径）  
- **受众**: gpurun / waverless 工程与产品
