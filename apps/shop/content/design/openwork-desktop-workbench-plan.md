# open-shop × OpenWork Desktop 工作台：商业可行性与产品方案

| 项 | 内容 |
|----|------|
| 文档类型 | 产品 + 商业可行性 + **架构/知识库技术实现**（只写文档，不改应用代码） |
| 撰写时间 | 2026-10-25（Asia/Shanghai） |
| 修订 | **v1.4** — 推荐 **OKF 开源工具栈**（canonical SPEC + okfctl + okf-ingest + 可选 W4G1/okf），**禁止 P0 自研 SPEC 解析器**；其余沿用 v1.3（OKF SoR + OSS 次级索引；否决 Vertex）与 v1.2（Den 标准 API + openmcp） |
| 证据基线 | `openroute-ai/open-shop` @ **`973392b`**（`main`）；`different-ai/openwork` @ **`fcb64641d`**；`/workspace/repos/openmcp`；`/workspace/docs/OPENMCP_*`；OKF：**[GoogleCloudPlatform/open-knowledge-format](https://github.com/GoogleCloudPlatform/open-knowledge-format)**（SPEC v0.2；旧 `knowledge-catalog/okf` 为冻结快照，勿再跟） |
| 定价参考 | [openworklabs.com/pricing](https://openworklabs.com/pricing)（2026-10-25 抓取） |
| 关联既有设计 | `apps/web/content/design/crossborder-mvp-overview.md`、`crossborder-shop-ued-product-design.md`、`crossborder-api-mcp-design.md`；飞书相关设计（供应域，见缺口）；`/workspace/docs/OPENWORK_MODULES_AND_FAST_LAUNCH.md`、`OPENMCP_*` |
| 硬约束 | **仍不实现 tRPC 业务路由**；本文不发 GitHub PR |
| 用户已拍板（权威，覆盖旧稿冲突） | ① Desktop↔控制面：**Den 标准 API**；② 服务端与 MCP/AI 网关：**openmcp 重建（Den-compatible）**；③ 知识库：**使用 OKF 标准的开源方案**，**不是** Vertex AI Search（Agent Search）+ RAG Engine（见 §10）；④ **v1.4：采用现成 OKF OSS 工具栈**（SPEC/参考工具 + `okfctl` + `okf-ingest` 等），**避免从 0 实现 OKF**；历史 v1.2 Vertex 选型仅作废稿记录 |

---

## 1. 背景与目标

### 1.1 一句话目标

把 **OpenWork Desktop**（MIT 桌面执行面）定位为 **open-shop 运营员的日常 AI 工作台**：用 **Automations** 自动收集客户关注的商品与市场信息并 **写入 shop 知识库**；用 **Dashboard** 自动把用户关注内容铺到工作台；用桌面 **IM 连接**（飞书 / 钉钉 / 企微 / Slack 等）接通知与协作；**订单 / 商品 / 运营交易主数据仍只在 shop**——与现有 `apps/shop` Web `/console` **并存、分工协作**，不是用桌面替换整套 SaaS 控制台。

**控制面约定（v1.2）：** Desktop 继续作为 OpenWork MIT 客户端，**只通过 OpenWork Den 的标准 HTTP API**（`/v1/me*`、`/v1/org*`、`/v1/automations*`、`/v1/mcp-*`、Dashboard Apps 等）与控制面交互；该 API 表面由 **openmcp 实现的 Den-compatible 网关**承载，背后接 open-shop MCP/API、知识库与平台 LLM/MCP 网关——**不另造平行私有桌面协议**。

### 1.2 为什么现在做

| 驱动 | 事实依据 |
|------|----------|
| open-shop 已定「薄数据中枢 + Agent 选品」边界 | `crossborder-mvp-overview.md`：选品推理在 OpenWork skills；平台存数据并暴露 MCP/OpenAPI |
| Web 控制台壳已成型 | `/console` 中文 IA：仪表盘 / 选品 / 待审 / 商品 / 刊登 / 订单 / 库存 / 成本 / 财务；CopilotKit 右侧列仍为本地 mock；inbox Sheet 为 DEMO |
| 连接器与 schema 已落地 | `@workspace/marketplace`（Daraz/Lazada/TikTok）、`commerce-schema` + 迁移 `0005–0007`；**Shopee 与生产 cron 仍不在范围** |
| OpenWork 桌面就是「本地 Agent 干活」产品 | Electron + `apps/app` + `openwork-server` + OpenCode；skills / MCP / computer-use；**automations / dashboard / Slack** 上游能力存在，客户端经 `apps/app/src/app/lib/den.ts` 调 Den `/v1/*` |
| openmcp 已有控制面/网关商业与技术决策 | `OPENMCP_COMMERCIAL_PLAN.md`：中国区 **不托管 Den EE**；LLM+MCP+A2A 走 OpenMCP 平台网关（LiteLLM 实现）；企业控制面自研 |
| 新需求把「工作台」从会话工具升级为运营情报面 | Automations→KB、IM、Dashboard 关注流，使 Desktop 成为晨间入口而非纯聊天窗 |

### 1.3 成功标准（可验收，非虚指标）

1. **角色清晰**：运营员「结构化看数 / 点确认 / 交易主数据」仍在 Web `/console` + shop DB；「长链路推理、批量选品、自动采情、关注看板、IM 协作」在 Desktop。  
2. **四条可演示闭环**（可对 mock，真写库按路线图）：  
   - Skill/MCP → `product_candidates` / `pending_actions` → Web 待审确认；  
   - **Automation → 采集市场/商品情报 → 写入 shop 知识库**（MCP `kb.*`）；  
   - **关注订阅 → Dashboard 卡片自动刷新**；  
   - **IM（至少一路）收发运营摘要 / 待办提醒**（不写交易主数据）。  
3. **数据边界不可破**：订单 / 商品 / 库存 / 刊登 / 结算等 **系统 of record = shop**；知识库只存情报、摘要、关注元数据与引用，不复制第二套交易库。  
4. **许可证与实现可控**：生产路径默认只用 OpenWork **MIT** 桌面客户端；控制面 **API 兼容 Den 标准**，但中国区交付 **不绑死、不分发、不长期依赖 upstream `ee/` Den EE 二进制**（实现落在 openmcp）；与既有 OpenMCP 商业决策一致。  
5. **不阻塞现网**：不重写 `/console`；不提前实现 tRPC。

---

## 2. 两边现状摘要（基于真实代码/文档）

### 2.1 open-shop @ `973392b`

**定位演进（设计 vs README）：**  
根 `README.md` / 部分 app README 仍写 GPURun Cloud；跨境产品真相源在 `apps/web/content/design/crossborder-*.md` 与 `apps/shop` 实现。仓库是 **GPU 云 monorepo 改造中的跨境运营中枢**。

| 模块 | 现状（tip） |
|------|-------------|
| `apps/shop` | Next.js 租户端；`/console/*` 跨境 lean 侧栏（含 **listings**）；中文文案端到端（#17）；成本计算器 Dialog + 重算页；CopilotKit 依赖已引入，无 runtime URL 时走 **本地 mock 对话**；**inbox Sheet DEMO**（`console-inbox-sheet.md`，无真实 `site_messages`） |
| `apps/web` | 平台运营后台；跨境设计文档与部分 `/crossborder` 页；另有大量 **供应域飞书** 设计（工单/Webhook/Bitable），**非 shop 知识库** |
| `apps/api` | Hono OpenAPI 骨架；**尚无 MCP 实现**（仅有设计 `crossborder-api-mcp-design.md`） |
| `packages/db` | `commerce-schema.ts`：shops、credentials、products、listings、orders、inventory、cost、settlements、pending_actions、product_candidates 等；另有遗留 `feishu-schema.ts`（供应/飞书侧）；**无独立「知识库」表/包** |
| `packages/marketplace` | Daraz / Lazada（LAZOP）/ TikTok Shop：签名、OAuth、适配器、sync worker **骨架**；明确 **Out of scope: tRPC、OpenAPI/MCP、Shopee、生产 cron** |
| Auth | Better Auth + organization 角色模型；`apps/shop` 含 email/phone **OTP 插件与 stub 发送** |
| tRPC | **业务路由仍延期**（设计与用户约束一致） |

**明确缺口（与本修订直接相关）：**

| 缺口 | 证据 | 产品含义 |
|------|------|----------|
| **无 shop 知识库** | `packages/db` 无 KB/OKF/文档块 schema；commerce 仅有候选/商品等交易与选品表 | Automations「写入知识库」需 **接入 OKF OSS 工具栈 + bundle SoR + MCP `kb.*` + 次级检索索引**（§10 / §10.12），**非从 0 写解析器** |
| **飞书设计属供应域** | `feishu-integration-design.md` 等面向工单/批次，非跨境运营台 | 桌面 IM 矩阵需 **另开 shop/Desktop 集成方案**；可复用 Open API 经验，不可直接当已交付 |
| **inbox 非关注流** | `feat/shop-console-inbox-sheet` / DEMO Sheet | Web 铃铛 ≠ Desktop Dashboard；关注订阅需新模型 |

近期相关提交链（摘录）：marketplace 连接器 (#13) → 成本计算器 UED/实现 (#7–#12) → OTP 与登录页调整 (#11) → 中文 console (#17)。

### 2.2 OpenWork @ `fcb64641d`

| 层 | 现状 |
|----|------|
| 产品 | 「Claude Cowork / Codex 的开源替代」：macOS/Windows/Linux **Electron** 桌面；任意模型（自带 key / Ollama 等）；本地文件优先 |
| `apps/desktop` | `@openwork/desktop`：Electron 壳、sidecar、workspace、updater、browser panel、**computer-use**、**`automation-runner.mjs`（Den 调度的桌面执行器）**；默认 Den base `https://app.openworklabs.com` |
| `apps/app` | React/Vite UI：会话、Connections、Settings、workspace、**automations / dashboard**；**`src/app/lib/den.ts` 为 Den 标准 API 客户端**（`/v1/me`、`/v1/org`、`/v1/automations*`、`/v1/mcp-*`、`/v1/mcp-apps`、Dashboard Apps 等） |
| `apps/server` | `openwork-server`：本地 FS API + **OpenCode 引擎宿主**；skills / MCP / plugins / 审批 / MCP Apps host |
| `packages/automations` | 纯领域包：日程（once/daily/weekly）、生命周期、幂等、ports；README：**Desktop 只是 Den client，不是调度/执行宿主**；调度与持久化在 Den |
| Dashboard | 官方文档：侧栏 **Dashboard** 页放 live MCP Apps；经 Den `/v1/mcp-apps`、`/v1/apps/:id/dashboard` 等；上游路径常需 Cloud 登录 |
| Slack | 文档区 `packages/docs/slack/*`：**Private alpha**；与 Den/Cloud 路径强相关 |
| 飞书 / 钉钉 / 企微 | **上游 OpenWork tip 未见对等一等公民集成** |
| 许可 | **`ee/` 外 MIT**；**`ee/` = OpenWork Den = EE License**（`ee/apps/den-api` 等） |

**Desktop 调用的 Den 标准 API 表面（证据摘录，非完整清单）：**

| 族 | 路径示例（`den.ts` / `den-api`） | 用途 |
|----|----------------------------------|------|
| 身份 / 组织 | `GET /v1/me`、`/v1/me/orgs`、`/v1/me/active-organization`、`GET /v1/org`、`/v1/me/desktop-config` | 登录态、org、桌面配置 |
| Automations | `GET/POST /v1/automations`、`…/:id/activate|deactivate|run`、`/v1/automation-runs*`、`/v1/automation-runners*` | 调度定义、认领、心跳、完成 |
| MCP / Connections | `/v1/mcp/token`、`/v1/mcp-connections*`、`/v1/mcp-apps`、`/v1/apps/:id/dashboard` | 企业 MCP、Dashboard 卡片 |
| 其它 | `/v1/me/library`、`/v1/org/inventory-revision`、plugins、inference-providers… | 库、清单修订、能力目录 |

运行时关系（简化，**v1.2 控制面改为 openmcp 实现**）：

```text
Electron (apps/desktop)  [MIT]
  └─ 加载 UI (apps/app)  ← Dashboard / Connections / Automations UI
  └─ 拉起 / 嵌入 openwork-server
        └─ OpenCode 引擎
              ├─ Skills（本地 / 分配）
              └─ MCP（本地 stdio / 远端 HTTP → open-shop）
  └─ den.ts / automation-runner
        └─ HTTP ──Den 标准 /v1/*──▶  openmcp Den-compatible 网关
                                      （契约对齐 den-api；实现非长期依赖 ee/）
```

Desktop **不是** Tauri；打包与策略体系围绕 Electron +（可选）Den desktop policies。

### 2.3 openmcp（服务端重建基线）

| 资源 | 要点 |
|------|------|
| `/workspace/repos/openmcp` | Studio monorepo：`apps/api`（Hono）、dashboard、doc；Better Auth + Drizzle |
| `/workspace/repos/openmcp-buddy*` | 渠道/品牌相关资产（buddy remote；本工作台默认不绑） |
| `OPENMCP_COMMERCIAL_PLAN.md` | **决策锁定**：中国区不提供 OpenWork Den 独立托管；LLM+A2A+MCP 走 OpenMCP 平台网关（LiteLLM）；企业控制面自研 `apps/enterprise`；**不把 OpenMCP 并入 `ee/apps/den-api`** |
| `OPENMCP_TECHNICAL_IMPLEMENTATION.md` | 网站 UI vs `apps/api` 集成契约；平台网关与控制面分离 |
| `OPENWORK_OPENMCP_LITELLM_INTEGRATION.md` | Desktop = 执行面；Den EE = 上游控制面（本方案用兼容实现替代）；LiteLLM = 实现层网关 |

**与本方案衔接：** openmcp 重建「服务端 + MCP/AI 网关」时，对外对 Desktop **暴露 Den-compatible `/v1/*`**；对内用 openmcp 组织/策略/调度/网关实现，并把 **open-shop** 作为跨境业务 SoR 与 **OKF 知识 SoR** 后端。

### 2.4 两边差距（集成前必须认清）

| 能力 | open-shop | OpenWork | 集成含义 |
|------|-----------|----------|----------|
| 结构化跨境运营 UI | `/console` 已有 | 无电商域 UI | Desktop **不应**重做订单/商品主表 |
| 知识库 | **缺失** | 无 open-shop 域 KB | **须在 shop 接入 OKF OSS 栈并以 bundle 为 SoR 新建**（§10.12；次级索引 OSS）；Desktop 经 MCP `kb.*` |
| Agent 长任务 / Skill | 设计指向 OpenWork | 原生强项 | 选品、采情、摘要放 Desktop |
| Automations 调度 | 无对等产品 | 领域包 + Den 调度 + Desktop runner | **CN：openmcp 实现 Den `/v1/automations*` 兼容面**（非托管 upstream ee） |
| Dashboard 关注流 | Web dashboard 为运营 KPI mock | Cloud Dashboard + MCP Apps（经 Den API） | openmcp 实现 `/v1/mcp-apps` 等 + shop `follow.feed` |
| IM | 供应域飞书设计；无钉钉/企微/Slack 商用包 | Slack alpha（Den）；无飞书/钉钉/企微 | Desktop 侧建 **连接器矩阵**；优先飞书（国内）、Slack（出海协作） |
| MCP 业务 tools | **仅设计** | 客户端成熟 | 卡点在 open-shop `apps/api`（含新增 `kb.*`）+ openmcp 网关挂载 |
| 团队策略 / 共享 Skill | 自有 Better Auth org | Den EE 或自建 | **openmcp 企业控制面**承接；中国区避免硬依赖 Den EE 二进制 |

---

## 3. 「Desktop = open-shop 工作台」产品定义

### 3.1 用户是谁

| 角色 | 典型场景 | 主入口 |
|------|----------|--------|
| **店长 / 跨境运营**（主用户） | 晨间看 Dashboard 关注卡与待审；白天 Automations 采情入库；IM 收摘要；选品在 Desktop；确认与订单在 Web | Desktop（干活 + 关注面）+ Web（确认与交易） |
| **助理运营** | HITL 确认、改价核对；订阅老板圈定的类目/竞品 | Web `/console/pending`；Desktop Dashboard 只读可选 |
| **平台管理员**（open-shop `apps/web`） | 租户、连接健康、抽检 | **仍用 Web**；不进 Desktop 工作台范围 |
| **技术实施 / 代理商** | 装桌面、配 MCP、IM OAuth、发 Skill/Automation 包；指向 openmcp 控制面 URL | Desktop + 文档 |

### 3.2 一天怎么用（目标体验）

1. **打开 OpenWork Desktop**，进入「open-shop」workspace（预装跨境 skills + MCP + 已订阅关注源）；控制面 base URL 指向 **openmcp Den-compatible 网关**（非必须 openworklabs.com）。  
2. **Dashboard**：自动展示「我关注的」——类目增速、竞品价变、库存告警摘要、待审条数、昨夜 Automation 写入的 KB 新条目。  
3. 对话或点卡片：「把昨夜 KB 里 Daraz LK 美妆增速 Top 落成 5 个候选并推待审」。  
4. Skill 调 MCP：`cb.*` / `kb.*`（写交易相关默认进 **pending**，模式 B；写 KB 按策略可自动或待审）。  
5. 运营在 **Web `/console/pending`** 或 Desktop 确认卡上点确认。  
6. **Automations**（定时）：按关注列表拉公开/授权市场源与店铺只读指标 → 结构化写入 **shop 知识库** → 触发 Dashboard 刷新 / IM 摘要。  
7. 看订单、成本税项、多店表时，**深链回 Web `/console`**（browser panel 打开受控 URL）。  
8. 飞书/钉钉/企微/Slack：收晨报、@机器人问「待审还有几条」；**机器人答复只读或引导回 Desktop/Web，不直改订单主数据**。

### 3.3 与现有 `/console` Web 的关系

| | Web `/console` | OpenWork Desktop 工作台 |
|--|----------------|-------------------------|
| 定位 | **系统 of record 的可视化操作台** | **Agent 执行 + 自动采情 + 关注 Dashboard + IM 协作面** |
| 强项 | 列表、筛选、详情、成本计算器、财务粗览、成员/店铺设置 | 多步推理、本地文件、Skill、Automations、MCP Apps 卡片、跨 IM |
| AI | CopilotKit 短问答 / 页内辅助（可逐步降级为「打开 Desktop」） | OpenCode 主对话（LLM 经 openmcp 平台网关或 BYOK） |
| 权威数据 | PostgreSQL（**commerce 交易主数据 + KB 注册表**）+ **OKF Bundle（知识 SoR）** + OSS 次级索引 | **不落第二套交易库**；经 MCP/API 读写；本地仅会话/缓存与导出 |
| 控制面 | Better Auth（shop） | **Den 标准 API → openmcp 兼容网关** |

**产品口号（对内）：**  
「Web 管状态与确认；Desktop 管思考、采情与关注面；**主数据只在 shop**；**桌面协议只认 Den 标准 API，实现交给 openmcp**。」

**明确不做：** 用 Desktop 重做完整 ERP；用 Webview 套壳冒充工作台却不接 Skill/MCP/KB；把订单全量镜像进桌面或上游 Den Cloud；**另造一套与 `den.ts` 不兼容的私有桌面 RPC**。

### 3.4 产品支柱

| 支柱 | 一句话 | 权威落点 |
|------|--------|----------|
| **Den 标准 API × openmcp 实现** | Desktop 不改协议；CN 生产不绑 ee/ | openmcp Den-compatible 网关 |
| **Automations → 知识库** | 定时/事件自动收集客户关注的商品与市场信息，写入 shop KB | **OKF bundle 为知识 SoR** + **OSS 工具栈（§10.12）**；次级检索 = pgvector/Meilisearch；调度经兼容 `/v1/automations*` |
| **数据边界** | 订单/商品/库存/刊登/结算等交易与运营主数据只在 shop | commerce schema = SoR |
| **桌面 IM 集成** | Desktop 连接飞书/钉钉/企微/Slack 等 | OAuth/机器人凭证策略见 §5.6；交易写仍走 shop |
| **Dashboard 工作台** | 自动把用户关注/订阅内容铺成卡片 | 订阅源在 shop；渲染经 Den-compatible Dashboard / MCP Apps API |

---

## 4. 商业可行性

### 4.1 市场与切入

- **赛道**：东南亚跨境卖家（MVP：Daraz LK）的「运营中枢 + AI 选品 + 市场情报工作台」，不是再做一个多平台 ERP。  
- **付费意愿锚点**：节省选品与算成本人力、降低错价/断货；**自动采情入库 + 关注 Dashboard** 把「早会材料」产品化；桌面 Agent + IM 是差异化交付形态（竞品多为纯 Web SaaS 或飞书表格）。  
- **证据边界**：本文**不编造** GMV/转化率；以现有设计与代码成熟度为准评估可行性。

### 4.2 差异化

| 差异点 | 说明 |
|--------|------|
| 数据中枢自建 | 店铺/订单/成本/待审/**知识库**在 open-shop；不被桌面厂商锁定数据 |
| Desktop = 执行面 + 关注面 | 借力 OpenWork MIT 桌面与 Skill 生态；**协议兼容 Den**，**实现自有（openmcp）** |
| AI 三级 A/B/C | 与 HITL 待审表对齐；可售「自动化等级」SKU |
| IM 进工作流 | 国内飞书/钉钉/企微 + 出海 Slack，通知与问答不离开运营习惯工具 |
| 可与 OpenMCP 叙事衔接 | 桌面免费分发；变现在 SaaS 订阅 / 连接器 / 用量 / KB 容量；**不强制**客户买 OpenWork Team / 上游 Den |

### 4.3 收费建议（open-shop 侧，草案）

| SKU | 内容 | 备注 |
|-----|------|------|
| **SaaS 基础** | Web `/console` + 店铺连接 + 同步 + 待审 | 主收入 |
| **工作台加装** | 官方 Skill 包 + open-shop MCP（含 `kb.*`）+ Desktop 配置/安装器 + openmcp 控制面接入 | 可含在 Pro；或按席位 |
| **情报 / KB** | 知识库容量（bundle/概念数）、Automation 任务数、关注源额度、embedding/检索用量 | 可单独计量 |
| **IM 连接包** | 飞书 / 钉钉 / 企微 / Slack 机器人与 OAuth | 按连接数或企业应用 |
| **AI 用量** | 选品/采情/摘要调用（OpenMCP 平台网关或客户 BYOK） | 与 OpenWork「自带 key」兼容 |
| **实施** | 代理商打包 Desktop + Skill + IM 私有化 | 服务收入 |

OpenWork 上游定价仅作**成本/竞品参照**：Team **$10/user/mo**；本方案 **不把「客户必须买 Team」当默认 COGS**。

### 4.4 许可证与合规风险

| 风险 | 等级 | 应对 |
|------|------|------|
| 误用 / 再分发 **`ee/` Den** 而无订阅 | **高** | 中国区交付 **不上、不分发 upstream `ee/`**；用 openmcp **兼容实现** Den 标准 API；合同与镜像清单明确排除 `ee/` |
| 「兼容 API」被误认为「再许可 Den」 | 中 | 对外文案区分：**API 契约兼容** vs **运行时二进制**；法务审 EE License 边界（只读参考契约，不复制受保护资产若许可禁止） |
| 二次包装 OpenWork 商标 | 中 | 可 OEM 壳，遵守 MIT 与商标条款 |
| 商户凭证与订单数据出境 | 高（业务） | 凭证只存 open-shop；Desktop 经 MCP；**默认不在本地落库明文 token**；IM 机器人只用最小权限 |
| IM 应用合规 | 高（国内） | 飞书/钉钉/企微企业自建应用、权限清单、数据出境评估；Slack workspace 策略单独审 |
| 知识库内容版权 / 抓取合规 | 高 | Automation 源白名单；禁止未授权整站爬取；保留来源 URL 与采集时间 |
| ~~Google Vertex 数据驻留 / 中国区可达~~ | ~~高~~ | **v1.3 已否决 Vertex 主路径**；驻留改为自托管 OKF + PG（见 §10.8） |
| computer-use 操作卖家后台 | 中 | MVP **不依赖**；优先官方 API |
| 依赖 upstream 节奏 | 中 | MIT 可 fork；**薄集成**（配置 + Skill + MCP + 兼容控制面），避免深 fork Electron |

### 4.5 自建 vs 依赖 upstream（v1.2 修订）

| 方案 | 优点 | 缺点 | 建议 |
|------|------|------|------|
| **A. MIT Desktop + Den 标准 API + openmcp 兼容网关 + shop KB（推荐）** | 协议不分裂；许可清晰；CN 可控；复用 `den.ts` | 需实现/维护兼容面与契约测试 | **P0–P3 默认** |
| B. 全量依赖 upstream Den Cloud / `ee/` | 上游现成 | EE + 中国区托管冲突；飞书/钉钉/企微仍缺 | **不作 CN 默认**；可选「出海客户自购 Team」 |
| C. 另造私有桌面协议 | 看似自由 | 与上游 Desktop 持续分叉；违反用户已拍板 | **否决** |
| D. Fork Desktop 换皮 OEM | 品牌统一 | 跟版本成本高 | 仅大客户品牌包 |
| E. 自研桌面 | 完全可控 | 重复造轮子 | **否决**（短期） |

### 4.6 成本与投入（量级，非报价）

| 项 | 说明 |
|----|------|
| 工程 | 主成本：① openmcp **Den-compatible 网关**（automations/org/mcp-apps 子集）；② open-shop **MCP/OpenAPI + OKF KB domain**；③ **接入 OKF OSS（okfctl / okf-ingest）** + 对象存储 SoR + OSS 次级索引（pgvector/Meilisearch）；④ IM OAuth；⑤ 官方 Skill；⑥ Desktop onboarding（改 base URL） |
| 许可 | MIT Desktop：**$0**；**不采购 Den EE 作为 CN SaaS 依赖** |
| 模型 / 检索 | OpenMCP 平台网关用量 + embedding（经 openmcp）+ 自建检索算力；**无 Vertex Search/RAG 账单** |
| 运维 | 商户交易 + OKF bundle + 次级索引在 open-shop/自托管；Desktop 本地组件由用户机器承担 |
| 风险缓冲 | marketplace 真连、**OKF OSS 工具接入（okfctl/okf-ingest）与契约测试**、兼容面契约测试、IM 企业应用审核均需单独排期（**不**把「自研解析器」排进 P0） |

**商业结论：** 在「不重做桌面、**协议兼容 Den、实现用 openmcp、先打通 MCP+Skill+KB、IM 自建**」前提下，**商业上可行**；不可行情形是：未建 KB/MCP 就承诺「自动采情入库」，或把 upstream Den Cloud/`ee/` 当作中国区唯一生产路径，或另造私有桌面协议导致客户端分叉。

---

## 5. 产品方案

### 5.1 信息架构（工作台）

```text
OpenWork Desktop (MIT)
├── Workspace: open-shop（每租户或每实施一套）
│   ├── Skills
│   │   ├── 选品分析 / 竞品剔除
│   │   ├── 成本与定价建议
│   │   ├── 待审摘要与确认引导
│   │   ├── 市场采情 → 写 KB
│   │   └── 关注日报 / IM 播报文案
│   ├── Automations（经 Den 标准 /v1/automations* → openmcp 实现）
│   │   ├── 按关注源定时采情
│   │   └── 写 shop KB + 刷新 Dashboard 卡片数据
│   ├── MCP: open-shop（远端 Streamable HTTP，可经 openmcp 网关挂载）
│   │   ├── cb.*（commerce / pending）
│   │   └── kb.* / follow.*（知识库与关注订阅）
│   ├── Dashboard（关注工作台；经 /v1/mcp-apps 等）
│   │   └── MCP Apps / 卡片：订阅源驱动
│   ├── Connections
│   │   ├── 模型 provider（OpenMCP 平台网关 / BYOK）
│   │   └── IM：飞书 / 钉钉 / 企微 / Slack（§5.6）
│   └── （可选）本地导出：选品报告 Markdown/CSV
├── 深链 / Browser panel → https://{shop-host}/console/...
└── IM 入站 → 只读问答 / 深链，不写交易 SoR
```

Web `/console` IA **保持**现有 `console-nav.ts`，不因 Desktop 改侧栏；后续可在 Web dashboard 增加「打开 Desktop 关注台」入口，**不把 KB 主交互锁死在 Web**。

### 5.2 核心场景 MVP

| ID | 场景 | Desktop | Web | 数据 |
|----|------|---------|-----|------|
| S1 | 选品候选写入待审 | Skill + MCP upsert candidate | `/console/candidates`、`/pending` | candidates / pending_actions |
| S2 | 待审确认 | 确认卡或「请到 Web 确认」 | `/console/pending` | pending B 模式 |
| S3 | 成本解读 | Skill 读成本字段 | `/console/costs` + 计算器 | cost_components |
| S4 | 订单/库存问答 | MCP list_orders / get_inventory | 详情页深链 | **orders / inventory（SoR）** |
| S5 | **Automations 采情入库** | 定时任务 + Skill（经兼容 Automations API） | KB 管理页（可后置） | **shop OKF bundle + OSS 次级索引** |
| S6 | **Dashboard 关注流** | 订阅源 → 卡片 | 可选对照 KPI | follow_* + KB 摘要 + 只读聚合 |
| S7 | **IM 晨报 / 待办** | 连接器推送或 @机器人 | 深链确认 | 通知载荷；**不改订单主数据** |

### 5.3 Automations → 知识库闭环

**目标：** 自动收集客户关注的商品与市场信息，**写入 shop 知识库**，供选品 Skill、Dashboard、IM 摘要复用。

```text
关注订阅（follow sources）
    │ 类目 / 竞品店铺 / 关键词 / 平台榜单 / 人工 URL 白名单
    ▼
Automation 运行（once/daily/weekly 或手动）
    │ 定义与调度：Den 标准 /v1/automations*（openmcp 实现）
    │ 执行：Desktop automation-runner 认领 / 或兼容 runner
    │ Skill：采集 → 清洗 → 结构化
    ▼
MCP kb.upsert_concept  ──▶  open-shop OKF Bundle SoR（对象存储/git）
    │                     ├─▶ okfctl / okf-ingest / W4G1/okf 校验与编目（§10.12）
    │                     ├─▶ shop 注册表（kb_concepts…）
    │                     └─▶ 异步次级索引 → Postgres/pgvector（+ 可选 Meilisearch；由 OKF 导出喂养）
    ├─▶ Dashboard 卡片刷新（读 follow + 新 concept）
    ├─▶ 可选：生成 product_candidates（仍走 pending）
    └─▶ 可选：IM 摘要推送（只读）
```

| 写入 OKF 的内容（示例 concept `type`） | 不写入 KB（仍只在 commerce） |
|----------------------------------------|------------------------------|
| `MarketSnapshot`、`CompetitorPriceNote`、`CategoryTrend`、`Playbook`、带 `sources`/`resource` 的采情笔记；与 shop/SKU 的 **引用**（`resource` 或 markdown 链到实体概念） | 订单行、库存余额、刊登状态、结算、凭证、待审动作本身 |

**HITL：**  
- 默认：OKF concept 写入可自动（模式 A/C 偏情报；`generated.by` 记 automation actor）；  
- 若 Automation 同时创建候选/改价建议 → **必须**走 `pending_actions`（模式 B）。

**缺口声明：** tip @ `973392b` **尚无 KB/OKF schema**；需在路线图中新增 bundle 存储 + 注册表 + 次级索引流水线（见 §7 / §10）。

### 5.4 数据边界（知识库 vs 交易主数据）

| 域 | 权威系统 | Desktop / Automation / IM 权限 |
|----|----------|--------------------------------|
| 店铺、凭证、商品、变体、刊登 | **shop commerce DB** | 读：MCP；写：默认 pending |
| 订单、库存、成本、结算 | **shop commerce DB** | **读为主**；写极少数受控且 pending |
| 选品候选、待审 | **shop** | Skill/MCP 可写 pending |
| **知识库（情报/笔记/关注元数据）** | **shop OKF Bundle（知识 SoR）+ OSS 次级索引** | Automation/Skill **主写路径**（经 `kb.*`） |
| 本地 Desktop 文件 / 对话日志 | 用户磁盘 | 披露 + 可关；**禁止**落明文平台 token |
| 上游 Den Cloud / `ee/` | **非 CN 默认运行时** | 可选出海自购；不镜像订单 |

**硬规则：**  
1. Automations **可以**写 KB，**不可以**把 shop 交易库「搬」到桌面。  
2. IM 与 Dashboard **消费** KB + 只读聚合，**确认类写操作**回 Web 或 pending。  
3. marketplace sync 仍是平台交易真源入口；Desktop **不直连** Daraz 签名（凭证不落桌面）。

### 5.5 Dashboard 工作台（关注流驱动卡片）

**产品定义：** Desktop 启用 **Dashboard 工作台**，自动将用户关注的内容显示为卡片（非手工每次聊天）。

**订阅源（follow）模型（逻辑，待建表）：**

| 源类型 | 示例 | 卡片表现 |
|--------|------|----------|
| 类目 / 关键词 | 「美妆-面霜 Daraz LK」 | 增速、热词、KB 新摘要条数 |
| 竞品 / 店铺 | 指定 seller | 价变、上新 |
| 本店实体 | 某 SKU / 库存预警 | 断货风险、待审相关 |
| Automation 产出 | 某任务的最新 run | 昨夜采情入库条数、失败 |
| 待审队列 | org 级 | 待确认条数（只读角标） |

**驱动链路：**

```text
用户设置「关注」 → shop follow_* 持久化
       ↓
Automation / sync / 事件更新 KB 或只读聚合
       ↓
Dashboard 经 Den-compatible /v1/mcp-apps（或 MCP App）拉取 follow feed
       ↓
点击卡片 → 打开会话 / 深链 Web / 触发二次 Skill
```

**与上游 OpenWork Dashboard 的关系：**  
上游文档要求 Cloud 登录且部署打开 Dashboards，卡片多为 MCP Apps。本方案：

| 路径 | 说明 | 优先级 |
|------|------|--------|
| **P-兼容 API（推荐）** | openmcp 实现 Desktop 已调用的 Dashboard/MCP Apps 相关 `/v1/*`；数据源接 shop `follow.feed` | P1–P2 |
| P-上游 Cloud | 客户自购 OpenWork Team/Cloud | 可选，非 CN 默认 |
| Web 对照 | `/console/dashboard` 继续做 KPI；不替代 Desktop 关注台 | 并存 |

### 5.6 桌面 IM 集成矩阵

**目标：** Desktop **必须能集成**飞书、钉钉、企业微信、Slack 等，用于通知、摘要、轻问答与深链，而不是在 IM 里再造一套 ERP。

| 平台 | 上游 OpenWork 现状 | open-shop / 仓内现状 | 目标能力（工作台） | 建议优先级 | 合规要点 |
|------|--------------------|----------------------|--------------------|------------|----------|
| **飞书** | 无一等公民包 | 供应域飞书设计 + `feishu-schema`（**非 shop KB**） | 机器人群摘要、卡片消息、可选审批待办深链 | **P1（国内默认）** | 企业自建应用；权限最小化；不落订单明文到群 |
| **钉钉** | 无 | 无 | 同飞书：机器人 + 工作通知 | **P2** | 企业内部应用审核；事件订阅 |
| **企业微信** | 无 | 无 | 同：应用消息 / 群机器人 | **P2** | 客户企微主体、IP 白名单、消息加密 |
| **Slack** | **Private alpha**（Den/Cloud 路径） | 无 | 出海团队：频道摘要、mention 问答 | **P1（出海）/ P3（若绑上游 alpha 则 CN 慎用）** | CN 默认走 **自建 Slack Bot → open-shop MCP** |

**能力分层（所有 IM 共用）：**

| 层级 | 能力 | 是否改 SoR |
|------|------|------------|
| L1 出站通知 | 晨报、告警、Automation 完成、待审数 | 否 |
| L2 入站只读 | 「待审几条」「KB 昨夜新增」→ MCP 只读 | 否 |
| L3 深链行动 | 回 Desktop / Web 确认 | 写在 shop pending/Web |
| L4 群内直接改价/改库存 | **不做（MVP）** | — |

**凭证：** IM App Secret / 机器人 token 存 **open-shop**（加密），Desktop Connections 只持会话级或设备级授权，与 marketplace 凭证隔离。

### 5.7 与 marketplace / 成本 / 选品 / 订单的闭环

```text
平台 API (Daraz…)
    │ packages/marketplace sync
    ▼
open-shop DB
    ├── commerce（交易 SoR）
    └── knowledge（KB 元数据 + follow）  ← Automations / Skills 主写情报
            │
            └─▶ OKF Bundle 写入 + 次级索引（pgvector / Meilisearch）
    │
    │ OpenAPI + MCP（待建）← openmcp 网关可挂载
    ▼
┌───────────────────┬────────────────────────────────────┐
│ Web /console      │ OpenWork Desktop                   │
│ 看表、确认、设置   │ Skill + Automations + Dashboard    │
│                   │ + IM；控制面 = Den 标准 API        │
└───────────────────┴────────────────────────────────────┘
```

### 5.8 AI 模式落位

| 模式 | 工作台行为 |
|------|------------|
| **A 自动** | sync worker、**采情写 KB**、Dashboard 刷新、IM 出站摘要；Desktop 少介入 |
| **B 人审** | 涉及候选/调价/刊登等 → `pending_actions`；Web 或 Desktop 确认 |
| **C 辅助** | 只读分析、KB 问答、解释成本；不改平台状态 |

---

## 6. 技术集成方案（v1.4 架构）

### 6.1 推荐架构（权威）

```text
┌─ OpenWork Desktop (MIT) ──────────────────────────────────────────┐
│  Agent (OpenCode) │ Automations runner │ Dashboard │ IM / Browser │
│  Skills + MCP client                                                 │
└───────────────┬───────────────────────────┬───────────────────────────┘
                │ Den 标准 HTTP API         │ Streamable HTTP MCP
                │ (/v1/me|/v1/org|          │ (cb.* / kb.* / follow.*)
                │  /v1/automations*|        │
                │  /v1/mcp-*|apps…)         │
                ▼                           ▼
┌─ openmcp：Den-compatible 控制面 + 平台网关 ─────────────────────────┐
│  • 兼容实现 Desktop 所需 /v1/* 子集（契约对齐 den-api，非长期跑 ee/） │
│  • OpenMCP 平台网关（LiteLLM）：LLM + embedding + A2A + MCP 热路径 │
│  • 企业 org/策略/目录（apps/enterprise 方向）                        │
└───────────────┬───────────────────────────┬───────────────────────────┘
                │                           │
                ▼                           ▼
        open-shop apps/api            OKF Bundle Store
        (OpenAPI + MCP domain)        (对象存储 / git：知识 SoR)
                │                           │
        ┌───────┴────────┐                  ▼
        ▼                ▼           okfctl / okf-ingest / W4G1/okf
  kb registry +      Commerce DB     （校验·编目；DuckDB 侧车可选）
  follow_*           (交易 SoR)              │
                                            ▼
                                     次级索引（非 SoR）
                                     Postgres/pgvector
                                     (+ 可选 Meilisearch)
```

**一句话拆分：**

| 层 | 是什么 | 不是什么 |
|----|--------|----------|
| **Den 标准 API** | Desktop↔控制面的 **契约**（路径、鉴权、automations/dashboard/mcp 客户端已写死在 `den.ts`） | 不等于必须部署 upstream `ee/apps/den-api` |
| **openmcp 实现** | CN/本产品的 **控制面 + AI/MCP 网关运行时**（含 embedding） | 不是另造私有桌面协议；不是把 OpenMCP 塞进 `ee/` |
| **open-shop** | 跨境 **业务 SoR + OKF 知识 SoR + `cb.*`/`kb.*`** | 不是 Desktop 壳；**不是** Vertex AI Search / RAG Engine 宿主 |
| **OKF** | 知识 **交换/持久格式**（markdown + YAML）；bundle = 分发单元；**工具用现成 OSS（§10.12）** | 不是检索引擎；不规定运行时（见 SPEC §1 Non-goals）；**不是**「从 0 写解析器」 |

### 6.2 许可证 / 运维澄清（必读）

1. **API 兼容 ≠ 运输 EE 二进制**：允许对照 `ee/apps/den-api` 的公开路由形状与 Desktop 客户端行为做 **兼容子集**；中国区 SaaS **默认镜像与依赖清单不含 `ee/`**。  
2. **契约测试**：对 `den.ts` 调用的关键路径建立兼容套件（至少：`/v1/me*`、`/v1/org`、`/v1/automations*` + runner claim/heartbeat/complete、`/v1/mcp/token`、`/v1/mcp-apps` / dashboard 相关）。上游增删字段时以 **Desktop tip 行为** 为准做适配。  
3. **缺口声明**：上游 Den 路由面极大（billing、SCIM、Google Workspace、cloud workers…）；本产品 **只保证工作台所需子集**，其余返回明确未实现/功能开关，避免「假全量 Den」。  
4. **与既有 OpenMCP 决策对齐**：中国区不托管 Den；LLM 不经 Den Gateway；Provider 分成不经 Den（见 `OPENMCP_COMMERCIAL_PLAN.md` 决策 #1–#8、#13）。

### 6.3 推荐路径（P0）：**MIT Desktop + 兼容网关 + MCP + Skills + KB**

1. 冻结 **Den-compatible 最小路由集**（对照 `den.ts` + `automation-runner`）。  
2. openmcp 落地兼容网关骨架 + 平台网关（LiteLLM）对接 OpenCode。  
3. open-shop `apps/api` 实现 Streamable HTTP MCP（`cb.*` + **`kb.*` / `follow.*`**），与未来 domain/OpenAPI **共用服务层**。  
4. 设计并迁移 **OKF bundle + follow** schema；**接入 okfctl / okf-ingest**（§10.12）；接 OSS 次级索引流水线（pgvector 等）。  
5. 官方 Skill：选品 / 待审 / 成本解读 / **采情写 KB**。  
6. Desktop onboarding：配置控制面 base URL → openmcp；导入 MCP 与示例 Automation。  
7. **不**把整站 `/console` 嵌进 Electron 当唯一 UI；**不**另造私有桌面协议。

### 6.4 备选路径

| 路径 | 做法 | 何时用 |
|------|------|--------|
| 备选 1：browser panel 嵌 Web | 一窗聊天+看表 | 增强，**不能替代** MCP/KB |
| 备选 2：Webview 壳 | 定制 Electron 只嵌站 | 仅 OEM；**不推荐**主路径 |
| 备选 3：全量 upstream Den Cloud | 用上游 Automations+Dashboard+Slack | 出海已购 Team；**非 CN 默认** |
| 备选 4：无 Desktop | 仅 CopilotKit + Web | 放弃工作台差异化 |
| ~~备选 5：私有桌面协议~~ | — | **已否决（用户拍板）** |

### 6.5 Auth / SSO / IM OAuth

| 议题 | 建议 |
|------|------|
| 商户登录 Web | Better Auth（密码 + OTP 插件；发送仍 stub） |
| Desktop → 控制面 | **沿用 Den 桌面鉴权手势**（handoff / token；由 openmcp 实现）；base URL 可配 |
| Desktop → open-shop MCP | **API Key（org + scopes）** 优先；亦可经网关签发的短时 MCP token（对齐 `/v1/mcp/token` 形态） |
| IM | 各平台企业应用 OAuth / 机器人；回调在 open-shop |
| SSO | 不与上游 Den SSO 强绑；企业 SSO 落 openmcp enterprise |
| 会话 | Desktop **不**复用 Web cookie 存商户密码 |

### 6.6 MCP / Skills / 同步 / KB tools（初版草案）

**既有设计向（commerce）：**  
`cb.list_shops`、`cb.upsert_product_candidate`、`cb.list_product_candidates`、`cb.list_pending_actions`、`cb.confirm_pending_action`、`cb.reject_pending_action`、`cb.create_listing_draft`、`cb.list_orders`、`cb.get_inventory`、`cb.request_sync`。

**本方案新增（KB / 关注，对齐 OKF）：**

| Tool（名可评审） | 作用 |
|------------------|------|
| `kb.upsert_concept` | 写入/更新 OKF concept（path=id；写 bundle + 注册表 + 索引队列） |
| `kb.get` / `kb.read` | 按 **concept path（id）** 读 frontmatter+body |
| `kb.list` / `kb.navigate` | 列目录 / 跟随 `index.md` 渐进披露；支持 `type`/`tags` 过滤 |
| `kb.search` | 在次级索引上语义/关键词检索（**索引非 SoR**） |
| `kb.link` / `kb.follow_links` | 解析 markdown 关系边；可选写 `resource`/`sources` |
| `kb.delete` / `kb.reindex` | 删 concept + 次级索引；运维重建索引 |
| `follow.list` / `follow.upsert` / `follow.delete` | 关注源 CRUD |
| `follow.feed` | Dashboard 卡片数据 |

- **Skills**：版本化；交易写默认 B；KB 写策略可配置。  
- **同步**：继续 `packages/marketplace` worker；`cb.request_sync` 只触发任务。

### 6.7 打包与分发

- 短期：官方 OpenWork 构建 + 导入 open-shop / openmcp 配置（控制面 URL、MCP、示例 Automation、IM 说明）。  
- 中期：OEM 基于 `apps/desktop` MIT，**勿打包 `ee/`**。  
- 非 Tauri。

### 6.8 数据驻留

- 交易 + KB 元数据 + IM 密钥：**open-shop 控制面（商户约定区域）**。  
- 知识与索引：OKF bundle 与 PG/pgvector **默认同区自托管**（§10.8）；无 Vertex 区域依赖。  
- Desktop：对话与本地 workspace 在用户磁盘；禁止默认缓存平台/IM 长期密钥。  
- 不把订单全量镜像进上游 Den Cloud 或 IM 群历史作为 SoR。

### 6.9 Automations / Dashboard：兼容面范围

| 能力 | 上游事实（`fcb64641d`） | 本产品默认（v1.2） |
|------|------------------------|---------------------|
| Automations 调度 | `@openwork/automations` + Den 持久化；Desktop = runner client | **openmcp 实现 `/v1/automations*` + runner 协议**；持久化自有；契约对齐便于可选接上游 |
| Dashboard | 需 Cloud 登录（上游） | **兼容 `/v1/mcp-apps` 等 + shop follow 数据源** |
| Slack | Private alpha + Den 生态 | **自建 Bot → MCP**；或客户自购上游 alpha |
| 飞书/钉钉/企微 | 上游无 | **open-shop 集成包 + Desktop Connections 配置** |

### 6.10 分阶段技术里程碑（摘要）

| 阶段 | 交付 |
|------|------|
| T0 | 本文 **v1.4** + Den-compatible 路由子集冻结 + **OKF OSS 栈选型冻结（§10.12）** + **OKF/kb.*/follow** 契约 + Skill 对 mock |
| T1 | openmcp 兼容网关骨架（me/org/automations 最小集）+ MCP 只读 `cb.*` + `kb.get`/`kb.list`/`kb.search`/`follow.feed`；**CI/`okfctl validate` + okf-ingest 编目通路打通** |
| T2 | Automation → **okfctl/参考工具写入** → OKF SoR → **okf-ingest** → shop 注册表 + 次级索引；pending 写闭环；Dashboard 卡片 v1 |
| T3 | 飞书 L1/L2；官方安装配置；可选 browser 深链 |
| T4 | 钉钉/企微；Slack 自建；OEM；更多 Automation 源；兼容面扩容 |

---

## 7. 路线图与里程碑（P0–P3）

| 阶段 | 目标 | 主要交付 | 依赖 / 不做 |
|------|------|----------|-------------|
| **P0** | 说清产品 + 假闭环 + 架构冻结 | 本方案 **v1.4**；**Den-compatible 路由子集**清单；**OKF OSS 栈（§10.12）+ bundle/follow 契约评审**；Skill 对 mock；MCP 契约含 OKF 向 `kb.*`/`follow.*`；Automation 源白名单草案；IM 矩阵确认 | **不实现 tRPC**；不打包 `ee/`；不宣称已有 KB；**不接 Vertex Search**；**不自研 OKF 解析器** |
| **P1** | 真只读 + 兼容网关骨架 + OKF 初写 | openmcp：`/v1/me*` `/v1/org` `/v1/automations*` 最小集；MCP 只读 commerce + **`kb.upsert_concept`/`kb.get`/`kb.list`/`kb.search`**；API Key；Desktop 指向兼容网关；**follow 表 + feed**；Dashboard 卡片原型；飞书出站 L1 设计；**单租户 OKF bundle（okfctl scaffold/validate）+ okf-ingest 编目 + 关键词索引** | domain 可先于 tRPC；Web 仍可 mock 写；Node 仅 CLI 薄封装 |
| **P2** | 采情闭环 + HITL + IM + 多租户 ACL | Automation 定时采情→**okfctl/校验**→OKF SoR→**okf-ingest**→shop 注册表→次级索引；MCP confirm/reject；Dashboard 订阅驱动刷新；**飞书 L1/L2**；选品 Skill 读 KB；租户隔离；**pgvector 语义检索**；评价集 | marketplace 生产 cron 可并行；钉钉/企微可后置 |
| **P3** | 可售卖包 | Skill/Automation 包；钉钉/企微；Slack 自建 Bot；安装器/OEM；CopilotKit 降级为入口；A 模式告警；Meilisearch/归档/配额 SKU（若需） | 上游 Den 仅可选；Shopee 仍可后置 |

建议门禁：

- **P1 未完成不得对外承诺「Desktop 工作台已上市」。**  
- **OKF 读写 + 至少一种检索通路未通前不得承诺「自动采情已入库可问」。**  
- **未完成 IM 合规清单前不得对国内客户默认开通群内机器人写操作（MVP 本就无 L4）。**  
- **兼容面未通过 `den.ts` 契约测试前不得默认切换生产控制面 base URL。**  
- **不得把 Vertex AI Search / RAG Engine 作为默认交付依赖重新引入（用户已否决）。**  
- **不得以「自研 OKF SPEC 解析器」作为 P0/P1 交付；默认调用 §10.12 OSS 工具。**

---

## 8. 风险与决策点

### 8.1 已拍板（用户权威，写入方案）

| # | 决策 | 结论 |
|---|------|------|
| D1 | Desktop↔控制面协议 | **采用 OpenWork Den 标准 API**；不另造私有桌面协议 |
| D2 | 服务端与 MCP/AI 网关 | **用 openmcp 重建**；实现 **Den-compatible**；**非**长期以 upstream `ee/` 为 CN SaaS 依赖 |
| D3 | 知识库技术路线 | **v1.3：OKF 开源格式 + OSS 次级检索**；**否决** Vertex；**v1.4：默认采用 OKF OSS 工具栈（open-knowledge-format + okfctl + okf-ingest ± W4G1/okf）**，**禁止 P0 自研解析器**（§10 / §10.12） |
| D4 | 交易 SoR | 订单/商品等仍在 shop（既有约束） |
| D5 | Automations→KB、IM 矩阵、Dashboard 关注流 | 产品要求仍生效（v1.1 起） |
| D6 | 本任务范围 | **不实现 tRPC**；不要求 GitHub PR |

### 8.2 仍待拍板（真开放问题）

1. **Den-compatible 子集边界**：P1 是否只保证 automations + me/org + mcp-apps，其它 Den 能力一律 feature-flag 关闭？  
2. **KB 一阶段检索深度**：先 `type`/`tags`/path 导航 + 关键词，还是 P1 就上 pgvector 语义？（建议：P1 OKF 读写 + `okfctl`/`okf-ingest` + `index.md` 导航 + 关键词，P2 pgvector 语义）  
2b. **运行时嵌入方式**：Node 服务长期 shell 出 CLI，还是后续再评估轻量 WASM/FFI？（建议：P1–P2 坚持 CLI 薄封装）  
3. **Automation 数据源白名单**：首批允许哪些源？是否禁止通用网页爬取？（建议禁止）  
4. **IM 优先级确认**：国内飞书 P1、钉钉/企微 P2；Slack 仅出海？  
5. **IM OAuth 首版**：只做出站机器人，还是必须成员级 OAuth？  
6. **OEM 品牌**：对外「OpenWork」还是「Open Shop 工作台（基于 OpenWork）」？  
7. **MCP 鉴权首版**：仅 API Key，还是必须对齐 `/v1/mcp/token` Device/OAuth 形态？  
8. **与 CopilotKit 关系**：P1 后并存还是 Web 只做跳转 Desktop？  
9. **computer-use**：是否 **P3 后评估**（建议是）？  
10. **数据驻留与本地日志**：是否要求企业策略关闭 transcript 持久化？  
11. **tRPC 时机**：MCP/domain/KB 是否允许 **先于** tRPC？（推荐：允许，共用 domain。）  
12. **marketplace 生产化**：工作台售卖是否必须绑定「已生产级 Daraz 同步」？  
13. **openmcp-buddy**：是否纳入渠道包？（建议默认 **忽略**，除非明确做渠道。）  
14. ~~Vertex 区域与 CN 替代~~：**已否决 Vertex 主路径**；残留问题改为「是否另开 Meilisearch 还是仅 PG+pgvector」与 embedding 模型选型。  
15. **兼容面开源策略**：Den-compatible 网关代码放 openmcp 公开仓还是私有企业模块？

---

## 9. 结论与建议

1. **架构已按用户拍板收敛**：OpenWork Desktop（MIT）= 工作台执行面；**只讲 Den 标准 API**；**openmcp 实现兼容控制面 + AI/MCP 网关**；open-shop = 交易 SoR + **OKF 知识 SoR** + `cb.*`/`kb.*`。  
2. **知识库（v1.3→v1.4）**：采用 **OKF v0.2**（[canonical SPEC](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md)）作知识交换/持久格式；**默认工具栈 = okfctl（作者/CI）+ okf-ingest→DuckDB（编目）± W4G1/okf（Rust 校验）**，**不从 0 写解析器**；**pgvector（+可选 Meilisearch）仅作由 OKF 导出喂养的次级索引**；embedding 走 **openmcp 平台网关**。**已否决** Vertex 主路径。Automations 经 MCP 写 OKF；Dashboard/IM/Skill 消费（详见 §10 / §10.12）。  
3. **商业可行前提**：不默认托管/分发 `ee/`；收费落在 SaaS + KB/Automation 额度 + IM 连接包 + 网关/embedding 用量；**无 Vertex Search 账单依赖**。  
4. **下一工程优先级**：冻结 Den-compatible 子集 → openmcp 网关骨架 → MCP（含 OKF 向 `kb.*`）→ **接入 okfctl/okf-ingest** → OKF bundle 存储 + shop 注册表 + 次级索引 → Automation 写库 → Dashboard feed → 飞书 L1 → pending 闭环 → 官方 Skill；**继续不实现 tRPC**。  
5. **硬缺口仍在**：open-shop **尚无知识库/OKF 接入**（OSS 工具已选定，集成未做）；兼容网关 **尚未实现**；上游 Automations/Dashboard/Slack **偏 Den/Cloud**；飞书仓内设计 **属供应域**；钉钉/企微 **从零**。

---

## 10. 知识库技术实现方案（OKF 开源标准）

### 10.0 命名澄清：本文「OKF」指什么

| 候选解读 | 结论 |
|----------|------|
| **Open Knowledge Format**（[GoogleCloudPlatform/open-knowledge-format `SPEC.md` v0.2](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md)） | **采用**。厂商中立的 markdown 目录 + YAML frontmatter 知识格式；**不是** Vertex AI Search。官方博文：[How OKF can improve data sharing](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing)、[OKF v0.2 trust signals](https://cloud.google.com/blog/products/data-analytics/okf-v0-2-adds-trust-signals)。旧 [`knowledge-catalog/okf`](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf) 已冻结，请改跟本仓 |
| Open Knowledge Foundation（Frictionless / CKAN / datapackage） | **不采用**为本 KB 主格式（偏开放数据打包，非 agent 可读 concept 语料） |
| OpenKF（开源智能客服框架） | **不采用**（客服机器人框架，非知识交换标准） |
| Google Knowledge Catalog 托管目录 | **可选消费面，非本方案必需**；OKF SPEC 明确 **不规定** storage/serving（Non-goals）。本产品用自托管 OSS 服务 |

> **历史注记：** v1.2 曾选定 Vertex AI Search（Agent Search）+ RAG Engine（+ Grounding）为主检索栈——**用户已否决**（v1.3）。v1.4 在 OKF SoR 之上明确 **推荐现成 OSS 工具栈**，避免自研 SPEC 解析器。

### 10.1 选型结论（先给答案）

| 项 | 选择 |
|----|------|
| **知识 SoR / 交换格式** | **OKF v0.2 Knowledge Bundle**：目录树 `.md` + YAML frontmatter；concept id = **去掉 `.md` 的路径**；必填仅 `type`；推荐 `title` / `description` / `resource` / `tags`；可选 `sources` / `generated` / `verified` / `status` / `stale_after`；`index.md` / `log.md` 为保留名；关系用 **markdown 链接** |
| **权威 SPEC + 参考工具** | **[GoogleCloudPlatform/open-knowledge-format](https://github.com/GoogleCloudPlatform/open-knowledge-format)**（Apache-2.0）：SPEC v0.2、参考 Python/HTML/JS 工具、样例 bundle、可视化器。**勿再跟**冻结的 `knowledge-catalog/okf` |
| **默认推荐工具栈（v1.4，避免从 0）** | 见 **§10.12**：**SoR = OKF bundles（对象存储 ± git）**；**作者/CI = [`okfctl`](https://github.com/cwest/okfctl)**（或参考 Python）；**运行时校验/编目 = [`okf-ingest`](https://github.com/travisjakel/okf-ingest) → DuckDB**（或 shell 出 [`W4G1/okf`](https://github.com/W4G1/okf) / `okfctl`）；Node 侧 **先薄封装 CLI，禁止 P0 自研 SPEC 解析器**；pgvector/Meilisearch = **由 OKF/okf-ingest 导出喂养的次级索引** |
| **持久化** | 每 org（或每 `kb_space`）一个 bundle：**对象存储**（S3 兼容 / MinIO / GCS）为主，**git 镜像**可选（diff/审计友好，尤其 curated org playbooks）；Postgres 存 **注册表 + ACL + follow + ingest 审计**（非正文权威副本，可缓存摘要）；可选侧车 **DuckDB catalog**（okf-ingest 产出）作查询加速 |
| **次级检索索引（非 SoR）** | **默认：Postgres + [pgvector](https://github.com/pgvector/pgvector)**；embedding 经 **openmcp 平台网关（LiteLLM）**；**可选：[Meilisearch](https://github.com/meilisearch/meilisearch)** 做关键词/typo；索引可随时从 OKF / okf-ingest 导出 **全量重建**——**不是**从零实现的 OKF |
| **Agent 编排** | Desktop / Skill 经 MCP `kb.*` 在 **已校验 bundle** 上按 path id、`type`/`tags`、`index.md` 渐进披露导航；**不**引入 Vertex RAG Engine `retrieveContexts` / Grounding datastore |
| **明确否决（主路径）** | **Vertex AI Search（Agent Search）Data Store**、**Vertex AI RAG Engine**、**Grounding with Agent Search**、把 Google Knowledge Catalog 托管目录当作唯一 SoR、**P0 自研 OKF SPEC 解析器 / 自写校验器** |

**为什么 OKF 拟合 shop「商品 & 市场情报」KB：**

1. Automations **持续机写**情报——OKF v0.2 把 provenance / trust / freshness 做成 frontmatter 一等公民（`sources`、`generated`、`verified`、`stale_after`），适合「昨夜采情」可审计。  
2. 格式 **可读、可 diff、可 `git clone` 交换**（SPEC 动机），不绑专有检索引擎；CN 自托管友好。  
3. SPEC **Non-goals** 明确不规定 serving——本产品自由选 pgvector/Meilisearch，契约仍是 OKF + MCP。  
4. **交易 SoR 仍在 Postgres commerce**；OKF 只存情报、摘要、playbook 与对商品/店铺的 **引用**（`resource` URI 或链接到实体 concept）。

### 10.2 逻辑架构

```text
Automations / Skills
        │  MCP kb.upsert_concept（path、type、frontmatter、body）
        ▼
open-shop Knowledge Domain
        ├── OKF Bundle Store（对象存储 / 可选 git）←── 知识 SoR
        │     org-{id}/bundle/
        │       index.md
        │       log.md
        │       market/.../*.md
        │       competitors/.../*.md
        │       entities/shop-*.md | product-*.md   # 引用壳，非交易行副本
        ├── Postgres：kb_spaces / kb_concepts / kb_ingest_runs / follow_*
        │     （path→id 注册、ACL、审计、幂等 hash、索引状态）
        └── Indexer Worker（可从 bundle 重建）
              │  解析 YAML + markdown → chunk
              │  embedding ← openmcp 平台网关
              ▼
     次级索引：pgvector（语义）± Meilisearch（关键词）
              │
              ├─ kb.get / kb.list / kb.navigate  → 直读 OKF（SoR）
              ├─ kb.search                      → 次级索引，命中回 path
              ├─ Skill 问答                     → search + get，自带引用
              └─ follow.feed                    → Postgres follow + 新 concept 列表
```

### 10.3 OKF Bundle 约定（shop 域）

**Bundle 根（示例）：**

```text
kb/{organization_id}/{space_slug}/
  index.md                 # 可含 okf_version: "0.2"
  log.md
  market/
    index.md
    daraz-lk-beauty-2026-10-25.md
  competitors/
    seller-acme-price-moves.md
  playbooks/
    morning-brief.md
  entities/
    shop-{shop_id}.md      # type: ShopRef；resource → 内部 URI
    product-{product_id}.md
  references/              # 可选：镜像外部材料（SPEC §6.3 约定）
```

**Concept frontmatter 最低集（符合 SPEC）：**

```yaml
---
type: MarketSnapshot          # REQUIRED
title: Daraz LK 美妆面霜周快照
description: 关注类目价带与热词摘要
resource: https://example.com/source-page   # 或 shop 内部 URI
tags: [daraz, lk, beauty, automation]
generated: { by: automation/market-intel-daily, at: 2026-10-25T02:00:00+08:00 }
status: stable
stale_after: 2026-11-01T00:00:00+08:00
sources:
  - id: src-1
    resource: https://example.com/source-page
    title: 公开榜单页
    last_modified: 2026-10-24T00:00:00Z
---
```

**Shop 建议 `type` 词汇（非中央注册；消费者须容忍未知 type）：**  
`MarketSnapshot`、`CompetitorPriceNote`、`CategoryTrend`、`Playbook`、`ShopRef`、`ProductRef`、`ListingRef`、`Reference`、`Attested Computation`（若未来做可验证指标）。

**Postgres 注册表（草案，tip 尚未建表）：**

| 表 | 关键字段 | 说明 |
|----|----------|------|
| `kb_spaces` | `id`, `organization_id`, `slug`, `bundle_uri`, `okf_version`, `status` | 逻辑空间 ↔ bundle 根 |
| `kb_concepts` | `id`, `space_id`, `path`（= concept id）, `type`, `title`, `tags[]`, `content_hash`, `status`, `stale_after`, `index_status`, `generated_by`, `generated_at` | 注册与过滤；正文以 bundle 文件为准 |
| `kb_entity_links` | `concept_path`, `entity_type`, `entity_id` | 快速反查；与 body 内链接双写可选 |
| `kb_ingest_runs` | `automation_id`, `run_id`, `stats`, `errors` | 与 Automations run 对齐 |
| `kb_embeddings` / chunks | `concept_path`, `ordinal`, `embedding`, `text` | **次级**；可 truncate 重建 |
| `follow_sources` / `follow_feed_cache` | 同 v1.2 语义 | Dashboard 关注 |

**不入库 / 不进 bundle：** 平台 API 原始凭证、完整订单行、结算明细、买家 PII。

### 10.4 Automations 写入路径

1. Runner 执行 Skill 按 `follow_sources` 拉白名单源。  
2. 规范化为 OKF concept draft：选定 `path`（稳定 id）、`type`、frontmatter、markdown body、`sources`（可用 **`okfctl` scaffold/move** 或参考 Python 工具生成合规节点）。  
3. 调用 `kb.upsert_concept`：  
   - 幂等键：`(space_id, path)` + `content_hash`；  
   - 写 bundle 对象（原子 put / git commit）；  
   - **流水线校验**：`okfctl validate` 和/或 **`okf-ingest`（validate + concept graph → DuckDB）** / `W4G1/okf`；失败则拒写或标 degraded；  
   - upsert `kb_concepts`（shop 注册表）；`index_status=pending`。  
4. Indexer：从 OKF / okf-ingest 导出切块 → openmcp embedding → 写 pgvector（± Meilisearch）；成功后 `index_status=ready`。  
5. 更新目录 `index.md` 条目与 `log.md`（按 SPEC；**优先 `okfctl` 维护 index/log**，避免手工漂移）。  
6. 索引失败 **不**回滚「已采情」审计（标记 degraded）；可 `kb.reindex`。  
7. 若同时产出候选/改价 → **另写** `pending_actions`，与 OKF 写入解耦。

### 10.5 索引与检索

| 能力 | 实现 |
|------|------|
| 按 id 精确读 | `kb.get(path)` → 读 OKF 文件（SoR） |
| 渐进浏览 | `kb.navigate` / `kb.list` → 解析 `index.md`；`type`/`tags`/`status` 过滤走注册表 |
| 关键词 | Meilisearch **或** Postgres `tsvector` / ILIKE（P1 可先 PG） |
| 语义检索 | pgvector + openmcp embedding；`kb.search` 返回 path + snippet + score |
| 关系遍历 | 解析 body markdown 链接（绝对 `/…` 或相对）；`kb.follow_links` |
| 结构化 feed | **Postgres `follow_*` 为主**；检索只补充「相关新 concept」 |
| Trust 展示 | 派生 trust tier（无 verified / machine / human，见 SPEC §5.3）；过期看 `stale_after` |

**过滤 / ACL：**  
- **强制**：所有 `kb.*` 在服务端绑定 `organization_id` / `space_id`；bundle URI 不可被客户端改指向他租户。  
- **多租户：** **每租户独立 bundle 前缀**（推荐）；注册表行级 RLS 或等价 org 过滤。  
- 次级索引行必须带 `organization_id`；重建索引时从 bundle 重放，防止「索引漂成第二 SoR」。

### 10.6 与 follow / Dashboard / MCP 同步

| 消费者 | 读什么 |
|--------|--------|
| `follow.feed` | Postgres 关注源 + 最近 `kb_concepts` / ingest_runs |
| Dashboard（Den-compatible） | `follow.feed` 或 MCP App |
| Skill 选品 | `kb.search` + `kb.get` + `cb.*` 只读 commerce |
| IM L2 | 同一 search/get 摘要，限长、去敏；可附 concept path |

### 10.7 MCP tools `kb.*`（契约级，OKF 对齐）

| Tool | 输入要点 | 副作用 |
|------|----------|--------|
| `kb.upsert_concept` | `path`, `type`, frontmatter fields, `body`, `links[]?` | 写 bundle + 注册表 + 索引队列 |
| `kb.get` / `kb.read` | `path`（concept id） | 只读 SoR |
| `kb.list` | `prefix?`, `type?`, `tags?`, `status?` | 只读注册表 |
| `kb.navigate` | `dir_path?`（读该层 `index.md`） | 只读 |
| `kb.search` | `query`, `filters`, `top_k` | 只读次级索引；返回 path + snippet |
| `kb.follow_links` | `path` | 只读解析出边 |
| `kb.link_entity` | `path`, `entity_type`, `entity_id` | 写链接表；可选补 `resource` |
| `kb.delete` | `path` | 删文件 + 注册表 + 索引 |
| `kb.reindex` | `path` \| `space_id` | 运维；从 OKF 重建次级索引 |

鉴权：API Key scopes（`kb:read` / `kb:write`）；写操作审计 actor（`automation/…` 或 `human:…`，写入 `generated.by`）。

### 10.8 部署、成本、数据驻留

**部署拓扑（默认 CN 友好）：**

| 组件 | 建议 |
|------|------|
| OKF 对象存储 | 与 shop 同区的 S3 兼容存储 / MinIO；备份可冷存 |
| Postgres + pgvector | 复用/旁路 shop DB 实例（扩展启用）；大租户可拆只读索引库 |
| Meilisearch | 可选旁路容器；非必须 |
| Embedding / LLM | **openmcp 平台网关**；模型可按租户切国内/国际 Provider |
| git 镜像 | 企业客户可选只读 mirror，便于人工审阅与 PR 式修订 |

**成本驱动：** 对象存储容量、embedding 调用、pgvector 存储与 ANN 查询、Automation 频次。对策：`stale_after` + 归档冷路径、按关注源限频、卡片路径尽量走注册表而非每次语义搜。

**相对 v1.2 的成本变化：** **去掉** Agent Search / RAG Engine / Grounding 托管检索账单；换为自托管存储 + embedding。运维责任上移到 shop/openmcp。

### 10.9 安全与合规要点

- 源白名单；`sources[].resource` + `generated.at` / `captured` 可追溯；禁止未授权整站爬取。  
- Bundle 不含平台密钥、买家 PII、完整订单。  
- 删除权：删 OKF 对象 + 注册表 + 次级索引（可证明「索引可重建、可销毁」）。  
- Automation vs 人工：`generated.by` / `verified` 分 actor；管理员审计 `kb_ingest_runs` 与 `log.md`。

### 10.10 落地阶段（对齐总路线图）

| 阶段 | KB 交付 |
|------|---------|
| P0 | OKF 约定 + **OSS 栈选型冻结（§10.12）** + MCP 契约冻结；选定存储后端；明确 **不**接 Vertex、**不**自研解析器 |
| P1 | `kb_spaces`/`kb_concepts` 迁移；bundle CRUD；**接入 okfctl validate + okf-ingest**；`upsert`/`get`/`list`/`navigate`；关键词 search；mock Automation 写入；Node **CLI 薄封装** |
| P2 | 真 Automation→okfctl/校验→OKF→okf-ingest→注册表→pgvector；多租户 ACL；评价集；Dashboard/IM 消费 |
| P3 | Meilisearch（若需要）；归档/配额 SKU；可选 Attested Computation；git mirror 企业包；再评估是否嵌入 Rust/Go 库 |

### 10.11 开源组件与引用

| 组件 | URL | 角色 | 许可（已知） |
|------|-----|------|--------------|
| **OKF canonical**（SPEC v0.2 + 参考 Python/HTML/JS + 样例 bundle + visualizer） | https://github.com/GoogleCloudPlatform/open-knowledge-format | 格式权威 + 参考工具 | **Apache-2.0** |
| （冻结快照，勿再跟）`knowledge-catalog/okf` | https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf | 历史路径；官方注明已迁出 | — |
| **okfctl**（Go CLI；scaffold / move / index·log / validate / graph health） | https://github.com/cwest/okfctl · [okfctl.dev](https://okfctl.dev) | 作者与 CI 默认 | **Apache-2.0** |
| **okf-ingest**（validate + concept graph → DuckDB；Python/R；wikilink） | https://github.com/travisjakel/okf-ingest | 编目 / 查询侧车 / 导出喂次级索引 | **Apache-2.0** |
| **W4G1/okf**（Rust lib/CLI；parse/validate/graph；零依赖） | https://github.com/W4G1/okf | 高性能校验备选 / CI | **Apache-2.0** |
| **ex_okf**（Elixir；parse/validate/query；可选） | https://github.com/thanos/ex_okf → 现重定向 [SinAnima/ex_okf](https://github.com/SinAnima/ex_okf) | 非 Node 主栈；低优先 | **Apache-2.0** |
| OKF 介绍博文 | https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing | 背景 | — |
| OKF v0.2 博文 | https://cloud.google.com/blog/products/data-analytics/okf-v0-2-adds-trust-signals | trust 信号 | — |
| pgvector | https://github.com/pgvector/pgvector | 语义次级索引（由 OKF 导出喂养） | PostgreSQL License |
| Meilisearch | https://github.com/meilisearch/meilisearch | 可选关键词索引 | MIT |
| openmcp 平台网关 | `/workspace/repos/openmcp` + `OPENMCP_*` 文档 | LLM/embedding/MCP | 仓内约定 |

### 10.12 推荐 OKF 开源工具栈（权威产品建议 · v1.4）

> **一句话：** open-shop（TS/Node monorepo + openmcp）**不要从 0 实现 OKF**——以 **对象存储上的 OKF bundles 为 SoR**，用 **`okfctl` 做作者/CI**，用 **`okf-ingest → DuckDB`（或 shell 出 `okfctl`/`W4G1/okf`）做运行时校验与编目**，用 **pgvector/Meilisearch 仅作由 OKF 导出喂养的次级索引**；MCP `kb.*` 在已校验 bundle 上导航；**拒绝把自研 SPEC 解析器当 P0**。

#### 10.12.1 默认路径（TS/Node + openmcp）

| 层 | 推荐 | 说明 |
|----|------|------|
| **SoR / 交换** | OKF bundles 落 **对象存储**（+ 可选 **git** 托管 curated org playbooks） | 正文权威在 bundle 文件；与 SPEC Non-goals（不规定 serving）一致 |
| **作者 / CI** | **[`okfctl`](https://github.com/cwest/okfctl)**（或 [open-knowledge-format](https://github.com/GoogleCloudPlatform/open-knowledge-format) 参考 Python） | scaffold、move 节点、维护 `index.md`/`log.md`、validate、graph health；挂 Automations 流水线与 PR/CI |
| **运行时 parse / validate** | 优先 **[`okf-ingest`](https://github.com/travisjakel/okf-ingest) → DuckDB catalog**；或 shell 出 **`okfctl` / [`W4G1/okf`](https://github.com/W4G1/okf)** | 服务内 **先 CLI 薄封装**（child_process / 容器 sidecar），**避免重写 SPEC 解析器** |
| **次级检索** | 保留 **pgvector / Meilisearch** 为可选索引，**从 OKF / okf-ingest 导出喂养** | 索引可重建；**不是**从零 OKF 实现 |
| **MCP `kb.*`** | 在 **已校验** bundles 上按 path id、`type`/`tags`、`index.md` 渐进披露导航 | 写路径仍走 `kb.upsert_concept` → SoR → 校验 → 注册表 → 索引队列 |
| **明确拒绝** | **P0 自研 OKF 解析器 / 自写 YAML+链接图校验核心** | 差异化应在 shop 域（commerce 引用、follow、ACL、Automation），不在 SPEC 兼容层 |

#### 10.12.2 生态对比表

| 项目 | 成熟度（相对） | 语言 | 角色 | 许可 | open-shop 用法 |
|------|----------------|------|------|------|----------------|
| [GoogleCloudPlatform/open-knowledge-format](https://github.com/GoogleCloudPlatform/open-knowledge-format) | **规范权威**；样例与参考工具活跃 | Python / HTML / JS | SPEC v0.2、参考工具、样例 bundle、visualizer | Apache-2.0 | **契约与样例真相源**；CI 可对照参考工具；**勿跟**冻结的 `knowledge-catalog/okf` |
| [cwest/okfctl](https://github.com/cwest/okfctl) | 实用 CLI；有站点 okfctl.dev 与 release | **Go** | 作者运维：scaffold / move / index·log / validate / graph health | Apache-2.0 | **默认作者 + Automations/CI validate** |
| [travisjakel/okf-ingest](https://github.com/travisjakel/okf-ingest) | 稳定·轻维护（自述）；R/Python 双绑定；DuckDB | **R / Python** | validate、concept graph、**DuckDB catalog**、语义/RAG 可选、wikilink | Apache-2.0 | **默认编目 / 查询侧车**；导出喂 pgvector；服务可调 Python API 或 CLI |
| [W4G1/okf](https://github.com/W4G1/okf) | 较新；纯 Rust 零依赖移植参考行为 | **Rust** | parse / validate / graph lib+CLI | Apache-2.0 | **CI/sidecar 高性能校验备选**；与 okfctl 二选一或并联 |
| [thanos/ex_okf](https://github.com/thanos/ex_okf)（→ [SinAnima/ex_okf](https://github.com/SinAnima/ex_okf)） | 早期 / 星少 | **Elixir** | parse / validate / query / agent context | Apache-2.0 | **可选**；与 Node/TS monorepo **低优先**，不作默认依赖 |
| pgvector / Meilisearch | 生产成熟 | C / Rust 等 | **次级**向量 / 关键词索引 | PG License / MIT | **索引层 only**；数据来自 OKF 导出 |

**许可注意（摘要）：** 上表所列 OKF 相关核心仓目前均为 **Apache-2.0**（2026-10-25 GitHub `license.spdx_id`）。集成时仍须：保留 NOTICE/归属、关注各仓后续许可变更、容器镜像第三方依赖（DuckDB 等）单独审 SBOM；**Apache-2.0 专利条款与 NOTICE 要求**对再分发二进制/镜像适用——法务做一次清单即可，**不构成「不能用」**。

#### 10.12.3 集成顺序（Automations → 工具 → shop → Dashboard/Desktop）

```text
1. 冻结契约
   SPEC v0.2（open-knowledge-format）+ shop concept type 词汇 + MCP kb.*/follow.*
        │
2. 作者 / CI 底座
   引入 okfctl（或参考 Python）→ bundle scaffold
   CI：okfctl validate（和/或 W4G1/okf）门禁
        │
3. Automations 采情写草稿
   Skill 产出 concept.md → okfctl 维护 index/log → 对象存储 put（SoR）
        │
4. 编目与校验
   okf-ingest：validate + concept graph → DuckDB catalog（侧车或作业产物）
        │
5. shop 注册表
   upsert kb_spaces / kb_concepts / ingest_runs（ACL、hash、index_status）
        │
6. 次级索引（可选并行）
   从 OKF 或 okf-ingest 导出 → chunk → openmcp embedding → pgvector
   （可选 Meilisearch 关键词）
        │
7. 消费面
   MCP kb.get/list/navigate/search  → Desktop Skill / Dashboard follow.feed / IM L2
```

**Node/TS 落地约束：** P1–P2 **禁止**在 `apps/api` 内手写完整 OKF frontmatter+链接图解析核心；允许：① shell/sidecar 调 CLI；② 极薄适配层（路径、租户前缀、把 stdout 映射到 `kb.*` DTO）；③ 自有 **注册表/ACL/follow** 与 commerce 引用逻辑。

---

## 附录 A · 关键路径速查

| 资源 | 路径 / URL |
|------|------------|
| 本文 | `/workspace/open-shop-openwork-desktop-workbench-plan.md` |
| open-shop tip | `/workspace/repos/open-shop` @ `973392b` |
| openwork tip | `/workspace/repos/openwork` @ `fcb64641d` |
| openmcp | `/workspace/repos/openmcp` |
| Den API | `ee/apps/den-api`（参考契约；CN 不默认部署） |
| Desktop Den 客户端 | `apps/app/src/app/lib/den.ts` |
| Automations 领域包 | `packages/automations/README.md` |
| Desktop automation-runner | `apps/desktop/electron/automation-runner.mjs` |
| 跨境 MVP / UED / MCP 设计 | `apps/web/content/design/crossborder-*.md` |
| commerce schema | `packages/db/src/commerce-schema.ts` |
| OpenMCP 商业/技术 | `/workspace/docs/OPENMCP_COMMERCIAL_PLAN.md`、`OPENMCP_TECHNICAL_IMPLEMENTATION.md`、`OPENWORK_OPENMCP_LITELLM_INTEGRATION.md` |
| **OKF canonical（SPEC v0.2）** | https://github.com/GoogleCloudPlatform/open-knowledge-format |
| OKF SPEC.md | https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md |
| okfctl | https://github.com/cwest/okfctl · https://okfctl.dev |
| okf-ingest | https://github.com/travisjakel/okf-ingest |
| W4G1/okf（Rust） | https://github.com/W4G1/okf |
| ex_okf（可选 Elixir） | https://github.com/thanos/ex_okf → https://github.com/SinAnima/ex_okf |
| OKF 介绍（Google Cloud Blog） | https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing |
| OKF v0.2 trust signals | https://cloud.google.com/blog/products/data-analytics/okf-v0-2-adds-trust-signals |
| pgvector | https://github.com/pgvector/pgvector |
| Meilisearch | https://github.com/meilisearch/meilisearch |
| OpenWork 定价 | https://openworklabs.com/pricing |
| ~~Vertex Agent Search / RAG（已否决主路径）~~ | 仅历史：v1.2 曾引用；**v1.3+ 不作为交付依赖** |

## 附录 B · 本文证据声明

- 未引用未在仓库或官网出现的收入/用户量数字。  
- OTP「已实现插件 + stub 发送」以 git 历史与 `apps/shop` auth 为准。  
- marketplace「无 Shopee / 无生产 cron」以包 README 为准。  
- tRPC 未接入业务以跨境设计与当前约束为准。  
- **知识库不存在**以 `packages/db` 现有 schema 清单为准。  
- Automations「Desktop 非调度宿主」以 `@openwork/automations` README 原文为准。  
- Desktop 调用 Den `/v1/*` 以 `apps/app/src/app/lib/den.ts` 与 `ee/apps/den-api` 路由为准。  
- OpenMCP「中国区不托管 Den、网关走 LiteLLM、控制面自研」以 `/workspace/docs/OPENMCP_*.md` 决策表为准。  
- **OKF** 以 [GoogleCloudPlatform/open-knowledge-format](https://github.com/GoogleCloudPlatform/open-knowledge-format) **SPEC.md v0.2**（2026-10-25）与 Google Cloud Blog 为准；旧 `knowledge-catalog/okf` 为冻结快照；Knowledge Catalog **托管目录**是可选扩展，**不是**本方案 SoR。  
- **OKF OSS 工具**许可与角色以各仓 README / GitHub `license` 字段为准（2026-10-25：上表核心仓均为 Apache-2.0）；`thanos/ex_okf` 重定向至 `SinAnima/ex_okf`。  
- 飞书/钉钉/企微在 OpenWork tip **无对等产品包**以仓内检索为准。  
- **Vertex AI Search / RAG Engine 主路径已按用户决策否决**（v1.3）；**自研 OKF 解析器不作 P0**（v1.4）。

## 附录 C · 变更摘要

### C.1 v1.1 相对 v1.0

- 产品一句话与成功标准纳入 **Automations→KB、数据边界、IM、Dashboard 关注流**。  
- 新增支柱、Automations/KB/IM/Dashboard 专节、Den 替代讨论、MCP `kb.*`/`follow.*`。  
- 路线图与决策列表扩展；商业 SKU 增加情报/KB 与 IM 连接包。

### C.2 v1.2 相对 v1.1

- **用户拍板写入**：Desktop↔控制面 = **Den 标准 API**；服务端与 MCP/AI 网关 = **openmcp 重建（Den-compatible）**；知识库曾给 **Google Vertex Search/RAG 技术实现方案**（已被 v1.3 否决）。  
- **架构重写 §6**：`Desktop --Den API--> openmcp 兼容网关 --> shop MCP/API + KB + commerce`。  
- **新增 §10（v1.2）**：Vertex AI Search + RAG Engine（现仅作废稿历史）。  
- 决策表拆分：已拍板 vs 仍开放。

### C.3 v1.3 相对 v1.2

- **用户拍板**：知识库改用 **OKF（Open Knowledge Format）开源标准方案**；**明确否决** Vertex AI Search（Agent Search）+ RAG Engine（+ Grounding）作主设计。  
- **§10 全量重写**：OKF bundle = 知识 SoR；Postgres 注册表 + ACL；**pgvector（主）/ Meilisearch（可选）= 次级索引**；embedding 经 **openmcp**；MCP `kb.*` 按 path=id、`type`/`tags`、`index.md` 导航对齐 OKF。  
- **架构图 / Automations 闭环 / 路线图 / 风险 / 附录**同步去掉 Vertex 主依赖；D3 更新；附录增加 OKF SPEC 与博文 URL。  
- 命名歧义表（§10.0）：排除 Open Knowledge Foundation / OpenKF 客服框架误读。

### C.4 v1.4 相对 v1.3（本修订）

- **用户要求**：推荐 OKF **开源方案**，避免从 0 开始。  
- **新增 §10.12**：默认栈 = **open-knowledge-format（SPEC）+ okfctl（作者/CI）+ okf-ingest→DuckDB（编目）± W4G1/okf（Rust 校验）**；pgvector/Meilisearch 仅次级索引；MCP `kb.*` 导航已校验 bundle；**拒绝 P0 自研解析器**。  
- **对比表 + 集成顺序**（Automations → okfctl/okf-ingest → shop 注册表 → Dashboard/Desktop）；许可注记（核心仓 Apache-2.0；ex_okf 仓名重定向）。  
- 证据基线与附录改为 **canonical `open-knowledge-format`**；同步 §6/§7/§9/§10.1/10.4/10.10/10.11。  
- 保持：Den 标准 API + openmcp；Vertex 否决；不写 tRPC；不发 PR。

