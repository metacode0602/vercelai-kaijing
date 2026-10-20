# Waverless 产品拍板记录（2026-10-17）

> **日期**: 2026-10-17（Asia/Shanghai）；同日清理回写增补 #11。  
> **性质**: 产品锁定决策日志；覆盖推荐文 / 实施计划 / parity / 设计逻辑评审中的开放项。  
> **范围**: 仅文档；不改应用代码。  
> **权威**: 本文件为一期范围与表述的**人类可读权威源**；与下文冲突时以本文件为准并回写相关设计文。

### 文档权威分层（2026-10-17 清理后）

| 层级 | 文档 | 用途 |
|------|------|------|
| 一期范围 | **本文件** | 做什么 / 不做什么 / 对外话术 |
| Autoscaler / Gongji Provider 实现 | `waverless-autoscaler-provider-decoupling-2026-10-17.md` | 扩缩决策、ScaleApp、挂载条件 |
| P0 任务拆分 | `waverless-cn-provider-implementation-plan.md` | 工程师清单与计费两账落地 |
| 目标架构 | `waverless-cloud-skypilot-integration-recommendation.md` **§9–§10** | 多厂/预热/拼池等后续设计；**§1–§8 为早期可行性分析，已被本节+本拍板取代** |
| UI / 优先级 | `waverless-runpod-ui-parity-and-priority.md` | 控制台信息架构与 MVP 阻塞项 |
| 评审快照 | `waverless-design-logic-review-2026-10-17.md`、`waverless-cn-provider-code-design-review.md` | 证据与当时发现；**不作为现行范围** |

---

## 拍板清单（1–11）

### 1. 镜像预热一期不做

**决策**: Image preheat / WarmPlanner / ImagePreHeat / ephemeral warm **一期（P0）不做实现**。

- 目标能力清单里仍可保留「镜像预热 / 暖机」。
- 先完成整体流程：Endpoint 创建 → Deploy → Scale → 账单/成本，再决定预热怎么做。
- 推荐文 §10.17、实施计划、parity 的 P0 表不得再把 WarmPlanner / ImagePreHeat 列为 P0 必做。

### 2. WaitingTime：文档纠偏 + 实现列为 P0

**决策**: 本期文档任务**不**改应用代码；但文档必须停止声称「已参与决策」，且 **P0 必做真实 wait-age**。

- 现状表述改为：**待实现 / 决策引擎未读 WaitingTime**（`FirstPendingTime` 仅为观测，≠ 最老 pending 年龄）。
- **验收（已锁定）**：扩容触发 = `pendingCount >= scaleUpThreshold` **OR** `oldestPendingAge >= scaleUpWaitSeconds`（二者任一满足即可，在 min/max/cooldown/配额门禁内）。
- 真实 wait-age 须来自任务入队 / `pending_since`，控制面重启后年龄连续；单条长等待在 `minReplicas=0` 时也必须能唤醒。
- 权威设计与伪代码见 [`waverless-autoscaler-provider-decoupling-2026-10-17.md`](./waverless-autoscaler-provider-decoupling-2026-10-17.md) §C.2。
- 对用户的中文说明由 Parent 另行解释。

### 3. `apps/waverless` 仓库落位

**决策**:

- 工程上 waverless 是**独立 Git 仓库** `gpurun/waverless`。
- 开发联调时 **clone 到 cloud 工作区路径 `apps/waverless`**。
- **不是**把 waverless 源码永久 monorepo 合并进 cloud。
- 推荐文 §9「独立服务」与实施计划路径统一为上述表述。

### 4. 双入口：先做 waverless 路径

**决策**: 先实现 **waverless 路径**——用户用第三方算力部署镜像。

在 **本应用（cloud/gpus）+ waverless** 共同实现目标能力：弹性扩缩容、负载均衡、用户账单、供应商成本、镜像预热等。  
其中**镜像预热功能列在目标能力里，但一期不做实现**（与 #1、#5 一致）。

### 5. 暖机 = 镜像预热；一期不实现

**决策**: 「暖机」与「镜像预热」为同一能力族。先跑通主流程，再设计预热/暖机；**一期不实现**。

### 6. Autoscaler 不得依赖 K8s.Enabled；Gongji = 独立 Provider（对齐 RunPod/Novita）

**决策（2026-10-17 澄清）**:

1. **Gongji（及后续 AutoDL / PPIO / 仙宫）是独立的 `CoreDeploymentProvider` 对等体**，对齐 RunPod / Novita 适配器模型——**不是** Kubernetes 云后端，也**不是**「仅挂在 SkyPilot clouds 里」。
2. 现状：平台不少路径仍走 SkyPilot；Autoscaler 初始化与 `K8s.Enabled` / K8s SpecManager **耦合**（见代码评审）。P0 必须交付**可落地的解耦方案并按方案实现**：Gongji Endpoint 在 `K8s.Enabled=false` 时仍有 scale loop，且只通过 `ScaleApp` 调厂商 OpenAPI。
3. **所有权**：waverless 拥有 waverless 路径的扩缩容循环（cloud/gpus 只设 min/max/阈值并读摘要）；SkyPilot legacy 路径保留自有弹性，**禁止共用一把 `K8s.Enabled` 总闸**同时禁用两边。
4. 权威方案全文：[`waverless-autoscaler-provider-decoupling-2026-10-17.md`](./waverless-autoscaler-provider-decoupling-2026-10-17.md)。

对用户的中文说明由 Parent 另行解释。

### 7. 9×4090 多厂 / 多区拼池是实现目标

**决策（2026-10-17 原）**: 无厂感知选址 = M1（创建选一家）；同 Endpoint 跨厂拆副本 = M2 / §10.14。

**决策（2026-10-17 晚，已锁定）**: 同 Endpoint **拼池**（先 **M2a 共绩多区**，再 M2b 跨厂）。权威见 [`waverless-provider-hub-placement-final-2026-10-17.md`](./waverless-provider-hub-placement-final-2026-10-17.md) **§0、§4、§8**。

- **M1（已落地）**: Hub + 单 slice；`pooling.enabled` **默认 false**。
- **M2a（下一实现）**: Worker 粒度拼池；**一 task 一区**；`maxReplicas` = Worker 数；**多卡同机**；缩容 **价高先缩**；**禁止混合规域**；CN 池 **不含 Novita**。
- **入口**: **Traefik 直打 Worker HTTP**；Worker 生命周期后 **更新 Traefik**（Waverless 直写或 Controller 事件，**两种均可**）；`endpoint_mode=http_service` 默认。
- **映射**: gpus 传 **`externalEndpointId` + `name`**；共绩 **一 task 一区**；衍生 task 名 **waverless 内部生成并持久化**，用户无感。
- **90s failover**: **不对外承诺**。

### 8. 计费两账 + 旧缺陷旁路/修复 → P0

**决策**:

- 客户收入账 ≠ 供应商成本账（两账）纳入 **P0**。
- 旧 `billServerlessStop` / cron 缺陷须 **旁路或修复** 后，Waverless 计费方可上线（纳入 **P0**）。

### 9. 完善租户终止设计

**决策**:

- 终止必须经 **gpus ownership + service identity**；禁止租户凭全局 API Key 越权。
- drain 后在途任务语义写死：**默认 = 标记失败可重试 + 事件可见**；禁止静默丢结果。
- **preheat worker 不对租户暴露**（即使一期无 preheat 也写入契约）。

### 10. PPIO ephemeral YAML 样例

**决策**: 删除或加醒目 **FORBIDDEN** 备注；与 billing 护栏一致——禁止把 PPIO 配成长 ephemeral pull 暖机。

### 11. 一期 purchaseType：按量 + 时长包；预约只建契约

**决策（2026-10-17 清理确认）**:

- **一期商用**：`on_demand`（按量）+ `duration_pack`（连续使用时长包）。
- **预约保留**（`capacity_reservation`）：只建产品/数据契约与状态机字段；**一期不商用、不自动保证容量**。无 hold 能力时不得标成「已预留」。
- 三个模式不可互相静默降级（包时到期不得悄悄转按量；预付包时不得冒充容量 reservation）。
- 旧 `commitment=hour/daily/weekly/monthly` 只表示结算周期，迁移为 `duration_pack`；`capacity_reservation` 仅显式新建。

---

## 一期（P0）范围一句话

单逻辑 AZ + 共绩作为**独立 CoreDeploymentProvider**（非 K8s/非仅 SkyPilot）+ 平台 Autoscaler（队列 **或** 真实 wait-age，挂载不依赖 K8s.Enabled）+ 统一 queue 入口 + gpus 鉴权终止（含 drain 语义）+ 客户/供应商两账（含旧 stop/cron 旁路或修复）+ **按量与时长包商用**（预约只建契约）。

**明确排除一期实现**: WarmPlanner / ImagePreHeat / ephemeral warm、多厂拼池对外履约、90s failover 对外承诺、预约锁池/自动保证容量。

**明确保留为目标**: 镜像预热/暖机、9×4090 多厂拼池、有界 failover（含 90s 控制面指标，仅对 ImageReady 目标，P1+）、预约保留商用。

---

## 关联文档

| 文档 | 用途 |
|------|------|
| `waverless-autoscaler-provider-decoupling-2026-10-17.md` | **Autoscaler↔Provider 解耦 + Gongji 独立 Provider 权威方案**（拍板 #2/#6） |
| `waverless-cloud-skypilot-integration-recommendation.md` §9 / §10.18 / **§10.19** | 架构推荐 + 拍板摘要 + **M1 Placement 定稿** |
| `waverless-cn-provider-implementation-plan.md` | P0 实施范围与任务 |
| `waverless-cn-provider-code-design-review.md` | 代码证据：K8s 耦合 / WaitingTime 未入决策 |
| `waverless-runpod-ui-parity-and-priority.md` | UI / MVP 优先级 |
| `waverless-design-logic-review-2026-10-17.md` §拍板回应 | 评审快照 → 决策映射（不作为现行范围） |

---

## 文档元信息

- **作者**: Grok Bot（按用户 2026-10-17 锁定决策落文档；同日 follow-up 澄清 #2/#6；同日清理回写 #11）
