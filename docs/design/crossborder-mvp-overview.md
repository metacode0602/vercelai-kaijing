# Open Shop 跨境运营中枢：改造方案

**仓库：** `openroute-ai/open-shop`（私有）  
**日期：** 2026-10-20（Asia/Shanghai），2026-10-25 修订  
**定位：** 多租户跨境电商运营数据中枢（Open Shop），复用 monorepo 基建与分层约定。

---

## 1. 现状

| 项 | 现状 |
|----|------|
| 根 README / AGENTS | 已按 Open Shop 跨境定位改写 |
| `apps/web` | 平台运营后台（Next 16 + tRPC + Better Auth），跨租户审核与同步健康 |
| `apps/shop` | 租户端（营销页 + `/console` 运营台），包名 `shop` |
| `apps/api` | Hono + `@hono/zod-openapi`；当前仅 `health`/`hello`，`/api/auth` 为占位；**尚无 MCP** |
| `apps/docs` | 文档站（内容待补充） |
| `packages/db` | Drizzle；`schema.ts` 聚合 `auth-schema` + `feishu-schema` + `commerce-schema` |
| `packages/auth` | `apps/web` 使用的共享 better-auth 配置；schema 在 `packages/db/src/auth-schema.ts` |
| 已有多租户概念 | `orgTypes = platform \| supplier \| merchant \| tenant`，session.`activeOrganizationId` |
| 分层约定 | UI → tRPC → mappers → dataaccess → `@workspace/db` → Postgres；列表 DB 级分页 |

**结论：** 基建（Turbo/pnpm、Next、Drizzle、Better Auth、Hono OpenAPI、UI）可复用；业务域为跨境运营。

---

## 2. 目标架构（对齐 v2 + 本仓模块）

```
apps/web     平台运营后台（管理员）：租户/店铺审核、全局仪表盘、待审队列抽检、连接器健康
apps/shop    租户 Web：选品候选、刊登、订单、库存、成本/结算、待审确认（运营工作流）
apps/api     第三方交互口：OpenAPI（REST）+ MCP（Agent/OpenWork）
apps/docs    产品与 API 文档（待补充）
packages/db  唯一 schema / 迁移
packages/marketplace  Daraz / Lazada / TikTok 连接器
packages/ui  共享组件
```

选品推理与策略由 **OpenWork skills** 动态定义；Open Shop 提供业务输入数据接口，通过 MCP 接收 Skill execution、过程事件和结果，并将完整知识内容写入 LLM Wiki（Open Knowledge Format，OKF）电商知识库。PostgreSQL 只保留组织隔离、运行/知识对象索引、同步/复核状态和业务 lineage；不固定研究步骤，也不存知识正文。Desktop 与租户台通过 execution/OKF 引用及候选/商品关联协作。  
交易全部来自第三方平台 API（MVP：Daraz）。

**交付边界：** 成本计算与 AI 选品等用户可见能力按两步走：先实现可交互 UED，用明确标记的示例数据让用户确认流程和习惯；确认后再接入 tRPC/domain/dataaccess、真实来源和持久化。UED mock 不得声称是生产计算或数据库保存。完整四平台、自营结账不在当前 MVP。

**知识闭环设计已扩展：** execution/OKF 索引 schema 见 `crossborder-database-design.md` §3.15-3.16；租户知识与执行索引、复核和运营结果 UED 见 `apps/shop/content/design/crossborder-shop-ued-product-design.md` §5.2A-5.2E、附录 C。Skill 自定义内容保存在 OKF；数据库与 UED 为设计目标，需完成知识库 adapter、MCP、授权和业务 API 后方可宣称可用。

---

## 3. 组织角色映射

| Better Auth orgType | 跨境含义 | 主要入口 |
|---------------------|----------|----------|
| `platform` | 平台运营 | `apps/web` |
| `tenant` / `merchant` | 卖家主体（租户） | `apps/shop` |
| `supplier` | MVP 可保留字段，暂不建门户 | — |

店铺 `shops` 挂在卖家 `organization_id` 下，表达多店多平台。

---

## 4. 模块边界

### apps/web（管理后台）

- 租户列表 / 启停  
- 全平台同步健康、失败任务  
- 待审动作抽检（跨租户只读或受限）  
- Demo：仪表盘 + 租户表 + 同步健康（mock）

### apps/shop（租户端）

- 店铺连接状态  
- 选品候选、待审队列  
- 商品/刊登、订单、库存预警  
- 落地成本、结算粗览  
- Demo：侧栏工作流 + 各页 mock 表

### apps/api

- 保持 OpenAPI 习惯（`/api/v1/*` + Scalar `/docs`）  
- 新增 MCP（Streamable HTTP），tools 与将来 domain 共用  
- Demo/设计阶段：文档化 tools；实现可后置到确认后与 tRPC 同批

### packages/db

- 保留 `auth-schema`（用户/会话/组织）与 `feishu-schema`  
- 跨境域 schema 在 `commerce-schema.ts`（见 `crossborder-database-design.md`）  
- 新功能只依赖 `commerce-schema`，不再扩展历史业务表

---

## 5. AI 三级（落入本仓）

| 级别 | 落点 |
|------|------|
| A | worker / cron：拉单、推库存 |
| B | `pending_actions` + shop/web 待审页；MCP `confirm` |
| C | OpenWork Skill 只读 + MCP 只读 tools |

对齐双产品闭环后，C 级是 Skill 决策辅助；MCP/API 可读业务输入并写入 execution/OKF 知识内容，具体 Skill 流程不由 Shop schema 固定。高影响业务动作仍走 `pending_actions` 和组织角色审批，不能因 Agent 拥有知识写权限而获得刊登/改价/库存执行权限。

---

## 6. 实施顺序

| 阶段 | 内容 | tRPC |
|------|------|------|
| **P0（当前阶段）** | 设计 MD 入库；Drizzle 跨境 schema + 迁移草案；web/shop Demo 页（mock，不接业务 tRPC） | 不接 |
| **P1（确认后）** | domain/dataaccess + tRPC routers；api OpenAPI 资源；MCP server | 接入 |
| **P2** | Daraz connector + worker | — |
| **P3** | OpenWork 选品 Skill + 端到端 | — |
| **P4（新增设计目标）** | 动态 Skill execution/OKF 索引与知识库 adapter；MCP 完整业务输入读写、组织角色/知识 ACL；Desktop 关联；候选→商品→listing→平台结果复盘 | 共用 domain |

---

## 7. 与文档/代码债

- 根 `README.md` / `AGENTS.md` / `apps/shop/README.md` 已按跨境定位改写。  
- `apps/docs` 内容替换不阻塞 P0。  
- 跨模块设计：`docs/design/`；租户端设计：`apps/shop/content/design/`。

---

## 8. 无阻塞确认项（已按默认推进）

| 议题 | 默认 |
|------|------|
| 基线仓 | `openroute-ai/open-shop` |
| 模块划分 | web=管理后台，shop=租户端，api=OpenAPI+MCP |
| 数据 | 新跨境表；auth 复用；历史业务表不再扩展 |
| 本阶段 | Demo + DB 设计；**暂不接 tRPC 业务** |
| 选品 | OpenWork skills → 平台 MCP |

若以上默认需改，请在评审 PR 时指出。
