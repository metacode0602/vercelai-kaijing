# Waverless 设计逻辑评审（漏洞 / 矛盾 / 未陈述假设 / 不安全默认 / MVP 阻塞）

> **日期**: 2026-10-17（Asia/Shanghai）；同日清理回写。  
> **性质**: **快照评审**（评审当时的文档/代码证据）。**现行一期范围以** [`waverless-product-decisions-2026-10-17.md`](./waverless-product-decisions-2026-10-17.md) **+ 实施计划为准**；本文不作为开工范围。  
> **范围**: 设计文档逻辑评审；**无应用代码改动**。  
> **Checkout（评审当时）**: `develop-gpus` tip `edeb28d3`。  
> **对照**: `waverless-cn-provider-code-design-review.md`。  
> **拍板映射**: 见文末「拍板回应」。

---

## 1. 结论摘要（评审当时 → 现行状态）

| 评审当时发现 | 现行状态 |
|--------------|----------|
| P0 范围在文档间不一致（WarmPlanner 有的标 P0、有的不做） | **已关闭**（拍板 #1/#5）：一期不做预热/暖机；推荐文 §10.17.10 已改为「主流程、无预热」 |
| 「WaitingTime 已参与决策」是错误现状 | **已关闭（文档）/ P0 待实现（代码）**（拍板 #2）：文档改为待实现；真实 wait-age 入 P0 |
| 仓库落位未裁决（独立仓 vs `apps/waverless`） | **已关闭**（拍板 #3）：独立仓 `gpurun/waverless`，clone 到 `apps/waverless` 联调，非 monorepo 合并 |
| 统一入口仍是 SkyPilot + Waverless 双路径 | **部分关闭**（拍板 #4）：先做 waverless 路径，旧实例 `orchestratorType` 分流。**用户入口最终形态、旧 SkyPilot 迁移策略仍开放** |
| 90s / 拼池 / 9×4090 叙事超前于 P0 | **已关闭**（拍板 #7）：保留为目标/P1+；一期不承诺 90s failover |
| 计费两账 vs 推荐文「先粗后细」 | **已关闭**（拍板 #8/#11）：两账 + 旧 cron 旁路/修复为 P0；一期商用按量+时长包；推荐文 §6.2 已标取代 |
| 镜像 ready / 90s 与「P0 可不做预热」互斥 | **已关闭**（拍板 #1+#7）：P0 选直拉、不承诺 90s/R_hot |
| 租户终止 + drain 超时任务语义开放 | **已关闭**（拍板 #9）：gpus ownership；默认失败可重试+事件可见；preheat 不对租户暴露 |

---

## 2. 文档集合与权威源冲突（评审当时快照）

> 下表记录 **2026-10-17 评审当时** 的文档互斥。清理后的现行权威见拍板记录「文档权威分层」。建议列多数已落地；未落地的剩余项见 §6 / §7。

| 议题 | 文档 A（说法） | 文档 B（说法） | 建议真相源（设计层） |
|------|----------------|----------------|----------------------|
| **MVP / P0 范围** | 推荐文 §10.11 / §10.17.10：Gongji + Region + ImagePreHeat/WarmPlanner(P0) | 实施计划 §1.2：不做拼池/failover、不做 WarmPlanner/Materializer；parity §3：WarmPlanner 不阻塞 | **以实施计划 + parity 的「单厂闭环」为 P0 真相**；推荐文 §10.13–10.17 降为 P0.5/P1 目标架构，并修订 §10.17 P0 表 |
| **等待时长扩容现状** | 推荐文 §10.2：「✅ 已有 WaitingTime … 参与决策路径」 | code-design-review §1/§3.2：未实现策略；实施计划 W2：要做真实 wait-age | **以 code-design-review / 实施计划为准**；推荐文必须改「待实现」 |
| **仓库形态** | 推荐文 §9：「独立部署…不要把 Waverless 源码 monorepo 进 cloud」 | 实施计划 / gateway / cost：模块路径 `apps/waverless`；cloud `apps/` 无此目录 | **产品拍板二选一**：① 独立仓库服务（推荐文）+ Cloud HTTP 客户端；或 ② 迁入 monorepo `apps/waverless`。拍板前禁止并行 Agent 按错误路径改代码 |
| **编排权威（任务型推理）** | 推荐文 §6 / §9：Waverless；实施计划：Waverless 运行时真相 | `serverless-implementation.md`（SkyServe）、`serverless-inference.md`（Traefik+SkyServe+OpenMeter）、console 仍 SkyPilot | **新国内 Serverless/任务推理：Waverless**；旧 SkyPilot 实例保留并 `orchestratorType` 分流。在 `serverless-*.md` 顶栏加「外采任务型以 waverless 文档为准」以免两队并行 |
| **产品 UI / 优先级** | parity：推荐文 §10 为产品锁定真相源 | 实施计划更严的「本期不做」列表 | **范围以实施计划为准；信息架构/文案护栏以 parity 为准；目标架构细节以推荐文 §10.13+ 为准（非 P0）** |
| **计费权威** | cost 文档 + 实施计划 D 章：gpus 钱包权威、Waverless 只发 usage facts、supplier 成本另账 | 推荐文 §6.2「先粗后细」；inference 设计仍提 OpenMeter | **以 cost 文档 + 实施计划 D 为计费真相**；OpenMeter 仅作历史/可选用量管道，启用前必须与两账边界对齐（cost §11 已提示） |
| **统一网关** | gateway §7：单一 hostname；§7.8 区分 `queue_worker` / `http_service` | 推荐文主叙事是 `/v1/.../run` 队列；parity 对齐 Runpod Serverless 队列 | **MVP 只锁定 `queue_worker`**；`http_service` + 动态 backend pool 标为 P1+，避免与「薄门面」抢带宽 |
| **Region Registry 归属** | 推荐文 §10.5、实施计划 §2、gateway §4：均 Waverless 拥有 | — | **一致：Waverless 拥有**；gpus/web 只读 API。无冲突 |
| **Autoscaler 单一真相** | 推荐文 §10.6、实施计划 W1、gateway §6.3：关厂商原生弹性 | — | **一致**；但须补「代码仍 K8s 耦合」为 P0 工程前置（见 code-design-review） |
| **多厂拼池 / 90s** | 推荐文 §10.8/§10.14/§10.15 大段设计 | 实施计划 §1.2 / gateway §2 / code-design-review §4.2：P0 不做、勿对外宣称 | **P0 禁止对外承诺**；设计保留在推荐文但标注「P1 前置：child deployment 模型」 |

---

## 3. 按主题的漏洞表

| 主题 | 严重度 | 问题 | 为何危险 | 建议（仅设计层） |
|------|--------|------|----------|------------------|
| **统一入口 vs cloud/SkyPilot 双路径** | **P0** | Console `createServerless` 仍写 DB + SkyPilot 异步（parity §2.1）；推荐文/实施计划要求 Waverless；`serverless-commercialization-gap.md` 仍以 SkyPilot 为 MVP 阻塞项 | 用户同一「Serverless」入口可能落到两套编排与两套计费 cutoff；灰度时旧实例被新规则误结算 | 产品定义：`orchestratorType=waverless\|skypilot` 为创建时不可变；UI 国内 AZ 只出 waverless；文档将 gap 文中「SkyPilot 阻塞」对国内外采线标注为「已改走 Waverless」 |
| **统一入口 vs cloud/SkyPilot 双路径** | **P1** | gateway §7.8 引入 `http_service`（Worker URL 进 Traefik pool），与推荐文主路径 `queue_worker` 并行 | MVP 范围膨胀：需 Gateway Controller、SSRF allowlist、routeVersion ack；与「薄门面」冲突 | 明确 MVP = `queue_worker` only；`http_service` 单独产品线/阶段，验收与队列 Endpoint 分开 |
| **Region Registry / AZ 映射** | **P1** | 推荐文 §10.3 原则「逻辑 AZ 1:N 物理区」假设同名 GPU 可互换调度；gateway §4.3 / code-design-review §3.5 强调 capability 归一（驱动/CUDA/拓扑） | 调度把「库存有 4090」当成可部署，Deploy 因镜像/驱动失败；failover 在错误厂空转 | P0 即使单厂也要在 binding 上存 `capabilitySet`；跨厂候选必须以 capability ⊆ 任务约束过滤，不能只比 price×inventory |
| **Region Registry / AZ 映射** | **P1** | 库存 `available` 非预留（实施计划 §3.1、gateway §5.3）；推荐文 §10.14 贪心按 inventory 切片 | 并发 Endpoint 超卖；90s/拼池计划纸面可行、Deploy 失败 | CapacityPlanner 设计必须含 platform quota / inflight lease；失败回退排队，禁止把 snapshot 当 reserved |
| **Region Registry / AZ 映射** | **P2** | P0 可用 YAML（实施计划 §3.1），但 lifecycle（draft→retired）、revision、compliance 快照在 gateway §4.2 才完整 | 运维改 YAML 与运行中 Endpoint 合规快照漂移 | P0 约定：创建时冻结 `policyRevision`；维护模式默认只禁新建不杀存量（gateway 已有，推荐文未强调） |
| **镜像逻辑 ref / bindings / ready / TTL / 假阳性** | **P0** | 推荐文 §10.15 硬规则「90s_eligible = ready」；parity §3 / 实施计划 §1.2 允许 P0 无 WarmPlanner、直传 URL | 若产品对外沿用 90s/已预热话术，而工程无 ready 位，必然穿帮或阻塞上线 | **二选一写进 MVP 验收**：(A) P0 不承诺 90s/R_hot，只承诺队列等待+冷启；(B) 把最小 `image_bindings(ready)` + 共绩预热或「同区成功启动 TTL」纳入 P0。禁止混用 |
| **镜像逻辑 ref / bindings / ready / TTL / 假阳性** | **P1** | ready 可来自「最近成功启动 + TTL」（§10.15），厂商 GC/CDN 分站会导致假阳性；共绩 ImagePreHeat 文档称邀测（parity §2.3） | 调度以为 hot，实际长 pull；计费窗口拉长；客诉 | 设计要求：`source=vendor_cdn` 禁止跨区推断；冷启 P95 超阈强制 `ready=false`；ImagePreHeat 未确认生产 API 前不得作为唯一 ready 来源 |
| **镜像逻辑 ref / bindings / ready / TTL / 假阳性** | **P1** | BYO 镜像「无法拉取则跳过该厂」（§10.13 红线 #4）与拼池「凑满 R」目标冲突时，用户只见排队 | 无明确错误码/可售厂列表，用户以为平台坏了 | Endpoint 详情暴露「镜像在该 AZ 不可物化」原因码；创建时 preflight 校验 preferred 厂能否拉 |
| **WarmPlanner vs 计费模型（PPIO pull 等）** | **P0** | §10.16 正确指出 PPIO **从 pull 开始计费**、禁止长 ephemeral；但同节配置草样仍出现 `provider: ppio` + `mode: ephemeral_restart` 示例目标 | 实现按 YAML 抄会直接烧钱 | 配置样例删除 PPIO ephemeral 目标；`billing_profiles.ppio` 只允许 OfficialPreheat；评审清单加「样例与护栏一致」 |
| **WarmPlanner vs 计费模型（PPIO pull 等）** | **P1** | 暖机成本默认「平台承担 P0 保热集合」（§10.16）；cost 文档要求 platform cost center 与客户账分离 | 无日预算/cost_cap 运营流程时，WarmPlanner 可成为无主成本黑洞 | MVP 若不上 WarmPlanner 则无此风险；一旦上 P0.5，必须同时上 `cost_cap`、日预算告警、cost owner（platform vs tenant）——与 cost 文档 CUSTOMER-EXTRAS 对齐 |
| **WarmPlanner vs 计费模型（PPIO pull 等）** | **P1** | 客户 billable 从 Ready 起、供应商可能更早收费（cost §5.3 双 cutoff）——设计正确；推荐文 §6.2「粗闭环」未要求记 `provider_cost_interval` | 毛利假象；财务无法解释「为何有成本无收入」 | 即使客户侧先 shadow 扣款，Waverless usage event 也应同时带 providerBilling* 与 customerBilling* 字段（实施计划/cost 已写，推荐文 P0 验收应引用） |
| **Autoscaler 单一真相 vs 厂商弹性** | **P0** | 设计锁定关 `dynamic_pod_strategy`（§10.4/§10.6）正确；但 code-design-review：`initAutoScaler` 依赖 `K8s.Enabled`，Executor 耦 K8s drain | Gongji Provider 注册后**弹性仍可能不起**；双真相风险被「厂商关了」掩盖，实际是平台 Autoscaler 未挂上 | P0 验收显式：**K8s 未启用时 Gongji Endpoint 仍可 Autoscaler**（实施计划 W2 已有）；推荐文 §10.2 现状表补「Autoscaler 初始化耦合待拆」 |
| **Autoscaler 单一真相 vs 厂商弹性** | **P0** | 「WaitingTime 已参与决策」错误（见 §2） | 国内 G3「队列**或**等待时长」验收会造假 | 修订推荐文；P0 必含真实 `pending_since` + `scaleUpWaitSeconds` OR 条件（实施计划 W2） |
| **Autoscaler 单一真相 vs 厂商弹性** | **P1** | 扩容目标默认「每副本一任务」（code-design-review §3.2）；实施计划 W2 要求显式 concurrency | 多并发 Worker 过扩，空烧 GPU 秒（客户与成本双侧） | Endpoint runtime 显式 `concurrencyPerWorker`；决策用 ceil(pending/concurrency) |
| **多厂拼池 / 9×4090 / 紧耦合不可拆** | **P0** | 推荐文 §10.14 描述同一 endpoint 下 3 条 provider deployment + CapacityPlanner；实施计划 §1.2 / code-design-review §4.3：当前单 deployment 假设，P0 不做拼池 | 若 UI/销售按「可拼满 9 卡」承诺，无法履约 | P0 文案与创建校验：单 ProviderBinding；`coupled=true` 或 `gpuCount>1` 单机需求在 create 时校验单厂库存，不足则拒绝；拼池仅 P1 且先落地 child shard 模型 |
| **多厂拼池 / 9×4090 / 紧耦合不可拆** | **P1** | 「不可拆」依赖任务属性 `coupled`（§10.17.12），但创建向导/API 契约未规定用户如何声明 NVLink/单机 N 卡 | 默认可拆会把训练作业拆到多厂导致运行失败或静默错误 | 产品：部署时必选「独立 Worker」vs「单机多卡」；单机多卡强制单厂且拓扑 capability |
| **90s SLO 话术与容量会计** | **P0** | §10.15 拆 T_switch≤90s 与 T_ready 不承诺——设计好；但 P0 无第二厂时「failover≤90s」无意义；parity 仍引用话术护栏 | 市场/销售提前使用 90s 导致合规与客诉风险 | **P0 对外删除 failover/90s 承诺**；仅保留「队列扩容 + 冷启可能数分钟」。90s 作为 P1 指标，且仅对 `ImageReady` 目标统计 |
| **90s SLO 话术与容量会计** | **P1** | `R_hot = inventory ∩ ImageReady`（§10.15）在 inventory stale 时仍可能算 hot | 过期库存 × ready TTL = 双重虚假容量 | R_hot 过滤条件加 `inventoryStatus=fresh`；stale 时降级为 unknown，不得计入 90s 容量 |
| **成本/客户账单 vs provider 账单** | **P0** | cost 文档正确要求两套账；推荐文 §6.2「对账后扣款（先粗后细）」易被理解成「用供应商成本当售价」或「无 snapshot 先扣」 | 错账、无法审计、与 `@workspace/billing` 不变量冲突 | MVP 最小计费也必须：immutable `priceSnapshotId` + Worker 区间 usage event + 幂等 window；允许 shadow 模式不真实扣款（cost §10.1），不允许「无快照商用」 |
| **成本/客户账单 vs provider 账单** | **P0** | 实施计划 D3.3：现有 `billServerlessStop` 用 `consumeReserved(min(...,0.01))` 却返回全额；cron 无 cursor | 切 Waverless 前若不修，新旧逻辑交织会重复/少扣 | 设计门禁：Waverless 计费上线前必须先修或旁路旧 cron（仅 `orchestratorType=waverless` 走新路径） |
| **成本/客户账单 vs provider 账单** | **P1** | `commitment` 过载（时长包 vs 预约）在 cost/实施计划已拆 `purchaseType`；旧 taxonomy / serverless-implementation 仍用 commitment 列表 | 静默把「月包」当容量保留销售 | 迁移表写进产品：旧 hour/daily/weekly/monthly → `duration_pack`；`capacity_reservation` 仅显式新建；禁止 UI 用同一下拉表示两种权益 |
| **成本/客户账单 vs provider 账单** | **P2** | inference 设计 OpenMeter vs 新 Customer Usage Ledger | 第三条计量管道 | 决策：任务型 GPU 秒走 Cloud ledger；Token 计量若保留 OpenMeter，需映射同一 computeBase，避免双扣 |
| **区域网关设计 vs Region Registry** | **P1** | 归属一致（Waverless）；但 gateway 把证书/`*.apps.run`/动态 backend 与 Registry 绑在同一 P0 叙事（gateway §11 P0 含 subdomain TLS） | 网络与证书工作量绑架 Provider 闭环 | 拆分里程碑：P0a Region+Gongji+queue 入口（可临时固定 URL）；P0b 通配证书与服务子域；二者解耦验收 |
| **区域网关设计 vs Region Registry** | **P1** | Worker outbound 到同一 `api.../v2`（gateway §7.2）假设厂商网络出网可达、无强制代理 | Gongji 节点若限制出网，pull 模型失败 | 接入前供应商确认：Worker 出网白名单、DNS、TLS；失败则需厂商侧代理/专线设计，不能默认「跟 Runpod 一样」 |
| **租户终止权限 / 审计** | **P0** | 推荐文 §10.7 锁定租户可终止自有 Endpoint；实施计划安全规则正确（服务端 ownership、禁客户端传 tenantId） | 若按推荐文「暴露 API」而用 waverless 全局 API Key，会越权 | 设计强制：租户终止只经 gpus（session→ownership→service claim）；Waverless 只信 service identity（实施计划已写，推荐文 §10.7 应交叉引用） |
| **租户终止权限 / 审计** | **P0** | drain deadline 到期后在途任务：重试 vs 失败未锁定（实施计划 §3.4） | 用户点终止后任务「成功」实为重复执行副作用；或静默丢结果 | 产品拍板并写入契约：默认「标记失败可重试 + 事件可见」或「at-most-once 失败」；禁止静默 |
| **租户终止权限 / 审计** | **P1** | preheat `purpose=preheat` 终止与租户终止共用 TerminateWorker（§10.17.7） | 租户 API 若能看到/杀 preheat worker，会破坏暖池或误计费 | preheat worker 不对租户列表暴露；运维终止走独立 reasonCode/scope |
| **UI 与后端真相源（parity）** | **P0** | 对客 UI 形似 Runpod，后端 SkyPilot；waverless web-ui 另有运维面（parity §2.1） | 「页面有了」被当成「能力有了」；验收扯皮 | 验收以 control API / runtime DTO 为准，不以 console 壳为准；parity 已警告，需写进 INT 清单 |
| **UI 与后端真相源（parity）** | **P1** | Active/Flex 未做，用 min/max 近似；空闲计费话术未定（parity §2.3） | 用户以为 scale-to-zero 立即停计费，实际 idleTimeout 窗口仍可能 Running 计费 | UI 明确：「缩容冷却期内仍按 Running 计费」；与 cost 客户 billable cutoff 一致 |
| **UI 与后端真相源（parity）** | **P2** | 无高保真 UED；逻辑 AZ / digest / wait-age 字段未进向导（parity §5） | 上线后补字段成本高 | P0 向导最小字段按 parity §5 冻结，避免先做 SkyPilot 旧字段再翻译 |
| **实现计划 vs recommendation 是否打架** | **P0** | 见 §2：P0 范围、WaitingTime 现状、`apps/waverless` 路径、WarmPlanner、拼池/90s、计费粗细 | 并行 Agent 按不同文档开工会互相覆盖或重复建设 | **发一页「权威源优先级」**：实施计划（范围）> parity（UI/优先级）> cost/gateway（专题）> 推荐文 §10（目标架构，修订现状错误） |
| **实现计划 vs recommendation 是否打架** | **P1** | 推荐文 §9「独立服务」vs 实施计划 monorepo 路径 | CI、Secret、迁移、Agent 工作区全错 | 24h 内架构拍板仓库形态（见开放问题） |
| **旧 serverless 文档内部矛盾（相关 skim）** | **P2** | `serverless-implementation.md` §2.1 表默认 `fault_tolerance=non_interruptible`，§2.3/§2.4 又写默认 interruptible / UI 默认勾选跨区 | 旧产品线自身不一致；与 waverless「合规域禁止跨海外」叠加更乱 | 修旧文档默认值；外采 domestic Endpoint 强制 `compliance=domestic`，与 fault_tolerance 正交说明 |

---

## 4. 与已有 code-design-review 的差异

### 4.1 同意并重申（不重复展开论据）

| 已有结论（code-design-review） | 本评审态度 |
|--------------------------------|------------|
| WaitingTime 非扩容条件；FirstPendingTime ≠ 最老任务年龄 | **同意**；升级为跨文档权威冲突（推荐文必须改） |
| 全局单 Provider factory；拼池/failover 是另一阶段 | **同意**；并指出推荐文 §10.14 叙事仍易被当成 P0 |
| Worker 终止缺路由/租户鉴权/审计；全局 API Key 不够 | **同意**；补充与实施计划 service-identity 模型对齐，推荐文应改引用 |
| Autoscaler 初始化/Executor K8s 耦合 | **同意**；列为 P0 弹性验收前置 |
| P0 = 单厂单 AZ 闭环；90s failover 勿写进 P0 能力 | **同意**；本评审从「话术/容量会计」再加 R_hot∩fresh 条件 |

### 4.2 本评审新增（code-design-review 未覆盖或仅点到）

1. **文档权威源矩阵**（实施计划 vs 推荐文 vs parity vs 旧 serverless vs cost vs gateway）。
2. **`apps/waverless` 路径 vs §9 独立服务 vs cloud `apps/` 实际无该目录**——落位级 P0。
3. **WarmPlanner / ImageReady / 90s 与「P0 可不做预热」的验收口径互斥**。
4. **PPIO 计费护栏 vs 配置样例自相矛盾**（§10.16 YAML）。
5. **计费两账 + 旧 `billServerlessStop`/cron 缺陷 + OpenMeter 第三管道 + commitment→purchaseType 迁移**。
6. **gateway `http_service` 动态 backend / 证书子域对 MVP 范围的膨胀**。
7. **inventory 非预留 + R_hot 容量会计的虚假热容量**。
8. **紧耦合 N 卡的产品声明入口缺失**（不仅是调度禁令）。
9. **drain 超时在途任务语义未拍板**（实施计划提出、推荐文未闭合）。
10. **旧 `serverless-implementation.md` 默认 fault_tolerance 自相矛盾**（与 waverless 合规正交）。

### 4.3 分歧

| 点 | code-design-review | 本评审 | 说明 |
|----|--------------------|--------|------|
| 推荐文是否仍作「产品锁定真相源」 | 建议修订 §10 现状判断与阶段边界 | **进一步降级**：范围类以实施计划为准；推荐文 §10.13–17 作为目标架构，避免 parity 继续写「§10 为锁定真相」而不标范围例外 | 非否定推荐文技术方向，是否定「整份 §10 无差别锁定」 |
| P0.5 是否含 Region 运维 UI | 建议 P0.5 Registry 运维只读 | **同意**；但强调与 gateway 证书/http_service 解耦，避免 P0.5 变成「大网关」 | 补充依赖切割 |

---

## 5. MVP 最小可验收切片（设计口径）

**一句话**：单逻辑 AZ + 共绩单 Provider + 平台 Autoscaler（队列 **或** 真实 wait-age）+ 统一 `queue_worker` 入口 + Worker 映射与鉴权终止 + 可影子/可幂等的客户 GPU 秒计费；**不**含多厂拼池、90s failover 承诺、WarmPlanner 全量、http_service 动态池。

| # | 切片 | 设计验收口径 | 明确排除 |
|---|------|--------------|----------|
| 1 | 供给 | Gongji v1：create / change_points / points / delete_pod；`dynamic_pod_strategy` 关闭；desired≠observed≠ready | 第二厂、拼池、跨合规 |
| 2 | 区域 | 至少 1 个 `logicalAzId`↔物理区；租户只见逻辑 AZ；Registry 单一 API 源 | 多 AZ failover、售「保证库存」 |
| 3 | 弹性 | `pending≥阈` **或** `oldestPendingAge≥wait`；K8s 未启用亦可；cooldown/min/max/scale-to-zero | 厂商原生弹性、WaitingTime 观测冒充策略 |
| 4 | 入口 | 用户：平台稳定 URL + endpoint-scoped key → `/v1/.../run\|runsync\|status`；模式=`queue_worker` | 厂商控制台、Worker IP、http_service backend pool |
| 5 | 生命周期 | drain→terminate；gpus 租户 ownership；web 运维；幂等 command + 不可变审计 | 租户杀 preheat；无审计终止 |
| 6 | 镜像 | P0 可选：(A) 平台仓/BYO URL 直拉 Gongji，**对外不承诺 90s/R_hot**；或 (B) 最小 binding+ready | 全厂预发布、Model Store、未验证即 ready |
| 7 | 计费 | Worker 确认 Running 区间 → usage event；immutable sell snapshot；5min 幂等 window（可先 shadow）；成本侧至少能记 provisional provider interval | 用成本价当售价；按 `compute_base.createdAt` 估费；无 snapshot 商用扣款 |
| 8 | 控制面 | Cloud↔Waverless service auth；浏览器不碰 control/厂商 API；`orchestratorType` 分流旧 SkyPilot | 全局 API Key 给租户；双 UI 双真相 |

---

## 6. 开放问题清单（需产品拍板）

1. ~~**仓库形态**~~ → **已拍板 #3**：独立 `gpurun/waverless` + clone 到 `apps/waverless` 联调。
2. ~~**MVP 是否对外承诺 failover / 90s / R_hot**~~ → **已拍板 #7**：一期不承诺；对外「队列扩容 + 冷启可能延长」。
3. ~~**P0 镜像策略 A vs B**~~ → **已拍板 #1**：一期选 A（直拉、无强制 ImageReady）；预热留流程后。
4. **用户入口最终形态**：仅 Cloud 反代、还是也可下发 Waverless public URL（推荐文开放问题 #1 / 实施计划 G1）？
5. **产品线枚举**：外采挂 `inference`、`serverless` 子集，还是 taxonomy 新码（推荐文 §7 Q2）？
6. ~~**drain 超时在途任务**~~ → **已拍板 #9**：默认标记失败可重试 + 事件可见。
7. ~~**`purchaseType` 首发**~~ → **已拍板 #11**：一期商用按量 + 时长包；预约只建契约，不自动保证容量。
8. **空闲 / minReplicas 计费话术**：idleTimeout 内是否向客户收费？与 Active 近似如何展示？（parity 暂用：「缩容冷却期内仍按 Running 计费」，未升为对外锁定话术）
9. **`http_service`（OpenAI 兼容长连接反代）是否进入近半年路线图**？若是，与队列 Serverless 分产品还是同 Endpoint 双 mode？
10. **共绩 ImagePreHeat 生产可用性 / 计费**：~~一期不做预热（拍板 #1）~~；流程后再确认邀测可用性与费用归属（平台 vs 租户）。
11. **旧 SkyPilot Serverless 实例**：冻结只读、迁移工具，还是双轨长期？计费 cutoff 规则如何向用户说明？
12. **OpenMeter**：任务型 GPU 秒是否彻底不走 OpenMeter，仅 Token 场景保留？

---

## 7. 文档修订建议（仍不写代码）

| # | 建议 | 状态（2026-10-17 清理） |
|---|------|-------------------------|
| 1 | 推荐文 §10.2 / §10.6：WaitingTime 改为「待实现」；补 Autoscaler K8s 耦合 | **已落地** |
| 2 | 推荐文 §10.17.10 P0 表：WarmPlanner/ImagePreHeat 移出 P0 | **已落地** |
| 3 | 推荐文 §10.16：PPIO ephemeral 样例 FORBIDDEN | **已落地** |
| 4 | parity：范围以实施计划+拍板为准，§10 为目标架构 | **已落地** |
| 5 | 实施计划文首注明 `apps/waverless` = 独立仓 checkout | **已落地** |
| 6 | `serverless-implementation.md` fault_tolerance 默认值 + 外采以 waverless 文档为准 | **仍待**（旧 serverless 文档，不在本次七份清理范围） |
| 7 | `serverless-inference.md` 标注与 Waverless 队列路径关系 | **仍待**（同上） |

---

## 8. 拍板回应（2026-10-17）

权威决策日志：`waverless-product-decisions-2026-10-17.md`。下表将本评审发现映射到产品拍板。

| 评审发现 | 拍板 | 落地位置 |
|----------|------|----------|
| P0 范围含 WarmPlanner/ImagePreHeat 与实施计划冲突 | **#1/#5**：一期不做预热/暖机；先主流程 | 推荐文 §10.11 / §10.17.10 / §10.18；实施计划 §1.2；parity §3–§4 |
| WaitingTime「已参与决策」错误 | **#2**：文档改「待实现」；真实 wait-age → P0 | 推荐文 §10.2 / §10.6；实施计划 §1.3；parity MVP blockers |
| `apps/waverless` vs §9 独立服务未裁决 | **#3**：独立仓 `gpurun/waverless`；clone 到 `apps/waverless` 联调；非 monorepo 合并 | 推荐文 §9.1；实施计划文首；决策日志 #3 |
| 双路径 SkyPilot vs Waverless | **#4**：先实现 waverless 路径；gpus+waverless 共担能力 | 推荐文 §9.6；实施计划 §1.1#8 |
| 90s/拼池/9×4090 超前于 P0 | **#7**：保留为目标/P1+；一期不承诺 90s failover | 推荐文 §10.8/§10.14/§10.15；parity 文案护栏 |
| 计费两账 + billServerlessStop/cron | **#8**：纳入 P0；旁路或修复后上线 | 实施计划 §1.3 / D3.3；parity blockers |
| 租户终止 + drain 语义开放 | **#9**：gpus ownership + service identity；默认失败可重试+事件可见；preheat 不对租户暴露 | 推荐文 §10.7；实施计划 §3.4 |
| PPIO ephemeral YAML 与护栏矛盾 | **#10**：样例 FORBIDDEN / 删除 | 推荐文 §10.16 |
| Autoscaler 耦 K8s.Enabled | **#6**：P0 必须无 K8s 亦可 | 推荐文 §10.2/§10.6；实施计划 §1.3 / W2；parity blockers |
| 镜像 ready vs P0 无预热验收互斥 | **#1 + #7**：P0 选「直拉 + 不承诺 90s/R_hot」 | 推荐文 §10.17.10 P0 行；parity |
| purchaseType 首发未锁 | **#11**：按量 + 时长包商用；预约只建契约 | 实施计划 D1；推荐文 §10.18 |

### 仍开放（拍板未覆盖，保持评审 §6）

用户入口最终形态（仅 Cloud 反代 vs 也可下发 Waverless URL）、产品线 taxonomy 码、idleTimeout 对外计费话术、`http_service` 路线图、ImagePreHeat 生产可用性与费用归属、旧 SkyPilot 实例迁移策略、OpenMeter 边界——仍待后续产品确认。

---

## 文档元信息

- **作者**: Grok Bot（executor 子代理，设计逻辑评审 + 拍板回应；同日清理回写状态表）  
- **依据 checkout（评审当时）**: `edeb28d3` @ `develop-gpus`
