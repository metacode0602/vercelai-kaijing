# 好时运 ERP × Open Shop × Open Mercato 复用评估与方案

> 状态：**调研结论，待业务/IT确认**
> 日期：2026-10-28
> 输入：`apps/shop/content/design/好时运ERP运营需求清单_V1.1_现有ERP整改版.xlsx`（9 张 sheet）
> 参考：[Open Mercato](https://github.com/open-mercato/open-mercato)（MIT Core / Enterprise 商业许可）
> 关联：[haoshiyun-erp-gap-analysis-and-remediation.md](haoshiyun-erp-gap-analysis-and-remediation.md)、[haoshiyun-erp-target-function-matrix.md](haoshiyun-erp-target-function-matrix.md)、[crossborder-mvp-overview.md](crossborder-mvp-overview.md)

## 1. 结论摘要

1. **不建议代码级集成 Open Mercato**。OM 基于 MikroORM + 模块级迁移 + REST CRUD factory + 自研 auth，与 Open Shop 的 Drizzle 单 schema + tRPC + better-auth 分层冲突；Enterprise 模块为商业许可，禁止生产使用与派生。
2. **推荐「概念参考 + 自研 Drizzle schema」落地**：借鉴 OM 的 WMS 流水事件、workflows/business_rules 审批、audit_logs/events 审计、sync_excel 批次导入、字典与仪表盘组织方式；不搬运代码、不引入第二套 ORM/API/认证。
3. **好时运最核心的 5 项诉求 OM 均不提供**：跨境平台连接器（Daraz/Lazada/TikTok）、Seller SKU 映射、Lazada 五站共享库存池（Daraz LK 另走 Colombo/柜次）、平台结算对账、采购审批。这些必须在 Open Shop 现有架构上全新开发。
4. **Open Shop 现状为 P0「UED 原型 + 基建」阶段**：19 个功能点中 0 项达到业务闭环（D2），9 项部分覆盖（有表/页面/mock），10 项未覆盖；仅平台 OAuth 授权落库是真实业务写路径。
5. **复用比例判断**：约 70% 工作量应基于 Open Shop 现有架构扩展；OM 贡献约 20% 的"设计形状"借鉴；约 10%（采购域、LGS/JSB 履约）OM 与 Open Shop 均无、需全新设计。

## 2. 需求清单概览（Excel 解析）

文件位于 `apps/shop/content/design/好时运ERP运营需求清单_V1.1_现有ERP整改版.xlsx`，V1.1（2026-10-28），当前平台 Lazada（MY/PH/SG/TH/VN）+ Daraz。**历史 Excel 默认仓写「好时运厦门自营仓 WH-CN-XMN-001、五国共享库存」——该表述仅适用于 Lazada 五站；Daraz LK 已决议改为海运→Colombo 本地仓，不共享厦门现货池**（见 [daraz-lk-erp-p0-ued.md](../../apps/shop/content/design/daraz-lk-erp-p0-ued.md)）。

| Sheet | 规模 | 内容 |
| --- | --- | --- |
| 需求总览 | 80 行 | 项目目标、12 条硬规则 R01–R12、P0/P1/P2 阶段建议 |
| 现有ERP整改总表 | 15 行 | R01–R10 十个现有页面的保留/重构/新增结论 |
| 页面功能字段 | 42 行 | PF01–PF37 页面区域级规格 |
| 菜单模块蓝图 | 42 行 | 11 个一级菜单 × 37 个二级页面 |
| 功能需求清单 | 24 行 | **F01–F19 十九条功能需求**（主需求） |
| 字段明细 | 207 行 | 202 条字段定义（P0 177 / P1 25） |
| 核心流程 | 55 行 | 5 条端到端流程 |
| 角色权限 | 59 行 | 8 人主档 + PUR-001~003 互审规则 + 11 行权限矩阵 |
| 待IT确认 | 40 行 | Q01–Q35，回复栏全部留白 |

### 2.1 硬规则要点（R01–R12）

- **编码**：SPU = `HSY` + 6 位流水（HSY000001）；内部 SKU = SPU + 3 位规格流水；自动生成、永久唯一、只停用不删除不复用（R01/R02/R06）。
- **映射**：品牌/品类/平台/国家/店铺/供应商/仓库/库位不写入编码（R03）；所有 Seller SKU 必须走正式映射表回到内部 SKU，禁止拆码识别（R04/R05）。
- **归集**：订单/库存/采购/售后/成本/利润统一按内部 SKU 归集（R08）。
- **库位**：同仓唯一，一个库位只能绑定一个启用 SKU（R07）。
- **审批**：采购全员可提交，杨洁/黄发聪互审、禁止自审（R09/R10）。
- **权限/审计**：蔡值全公司只读；外部 IT 用可停用技术账号（R11）；重要修改保留前后值、操作人、时间，历史不可物理删除（R12）。

### 2.2 功能需求 F01–F19 与优先级

| 编号 | 板块 | 功能 | 优先级 | Open Shop 覆盖 | OM 可借鉴 |
| --- | --- | --- | --- | --- | --- |
| F01 | 工作台 | 经营总览与待办 | P0 | 部分（mock 仪表盘/待办页） | workflows、dashboards、widgets |
| F02 | 平台店铺 | 平台与店铺主档 | P0 | 部分（shops 表 + OAuth 真实落库） | integrations、configs |
| F03 | 人员权限 | 人员、角色和账号 | P0 | 部分（better-auth org/member，无业务 scope） | feature-based RBAC、audit_logs |
| F04 | 商品库 | SPU 商品主档 | P0 | 部分（products 表，缺 HSY 编码规则） | catalog（products/prices/offers） |
| F05 | SKU规格 | 内部SKU管理 | P0 | 部分（product_variants 有 (org,sku) 唯一） | catalog variants |
| F06 | 属性字典 | 颜色尺码品牌品类 | P0 | 未覆盖 | **dictionaries + JSONB 混合索引** |
| F07 | 刊登映射 | 平台 Seller SKU 映射 | P0 | 部分（listings + externalIdMappings，唯一键语义冲突） | 无对应（需自研） |
| F08 | 供应商 | 供应商与货号映射 | P0 | 未覆盖 | customers 单据模式（仅形状） |
| F09 | 采购管理 | 申请-审核-采购-入库 | P0 | 未覆盖 | **OM 官方明示无 purchasing 模块** |
| F10 | 仓库库位 | 仓库与库位绑定 | P0 | 未覆盖 | **wms locations** |
| F11 | 库存汇总 | SKU 库存查询（共享池） | P0 | 部分（inventory_balances 按 shop 拆分，与共享池冲突） | wms inventory lots |
| F12 | 库存流水 | 出入库与调整记录 | P0 | 未覆盖 | **wms movements 事件模型** |
| F13 | 订单管理 | 平台订单与明细 | P0 | 部分（orders/orderLines + 去重键已具备） | sales orders |
| F14 | 发货物流 | LGS 与 JSB 履约 | P0 | 部分（字段有，无包裹/轨迹链路） | sales shipments、shipping_carriers |
| F15 | 售后管理 | 取消/退款/退货 | P1 | 未覆盖（取消释放库存建议提前为 P0） | warranty_claims |
| F16 | 成本利润 | 订单级和 SKU 级利润 | P1 | 部分（costComponents/settlements 基础） | sales invoices、currencies |
| F17 | 报表中心 | 销售/库存/采购报表 | P0 | 未覆盖（UED 示例页） | **dashboards、perspectives** |
| F18 | 系统接口日志 | API 同步与操作日志 | P0 | 部分（integration_logs 表有，sync 落库为 stub） | **audit_logs、events 订阅者** |
| F19 | 历史数据迁移 | Excel 导入与迁移校验 | P0 | 未覆盖 | **sync_excel、data_sync 批次模式** |

### 2.3 业务特征（方案设计约束）

- 以**内部 SKU 为唯一主轴**，所有单据/统计禁止按 Seller SKU 归集。
- **五国共享一个库存池**（与现有 `inventory_balances` 唯一键 `(shop_id, variant_id)` 直接冲突）。
- Seller SKU 强映射 + 未映射订单必须阻断。
- 采购互审禁自审（PUR-001~003）。
- 库存不可无痕修改；多币种金额禁止直接相加。

## 3. Open Shop 现状

### 3.1 技术底座

| 层 | 现状 |
| --- | --- |
| DB | `packages/db/src/commerce-schema.ts` 19 张业务表（店铺/商品/变体/刊登/映射/订单/库存余额/成本/结算/待办/候选/同步日志）+ 迁移 0005–0007 |
| tRPC | 仅注册 `apiKeys` router；`dataaccess/`、`mappers/` 目录不存在 |
| 租户端 | `apps/shop` console 页面齐全，但业务数据来自 `mock-data.ts`（1442 行）与 `erp-ued-data.ts`（171 行 UED 示例） |
| 运营后台 | `apps/web` 三页全 mock |
| 真实业务写 | **仅 OAuth 授权 + 凭据加密落库**（`persist-credentials.ts`） |
| 连接器 | `packages/marketplace` 支持 Daraz/Lazada/TikTok 的 OAuth、签名、同步 worker；**persist hooks 为 stdout stub，同步未落库** |
| 认证 | better-auth（org/member、session.activeOrganizationId）；`permissions.ts` 角色仍是历史域资源，无业务模块 scope |

### 3.2 关键差距（需求 P0 视角）

**缺失实体**（代码层面）：仓库、库位、库位绑定、库存流水、供应商、供应商-SKU 映射、采购申请/审批/采购单/收货/质检、包裹与物流事件、售后单、属性字典、业务角色/权限范围、导入批次/错误行、审计事件、成本版本/汇率。**上述实体的目标数据模型已由 [haoshiyun-erp-database-schema.md](./haoshiyun-erp-database-schema.md) 完成设计**（域 A–K），代码未实现。

**两处 schema 语义冲突（必须先修）**：

1. `inventory_balances` 唯一键 `(shop_id, variant_id)` → 需求为 `(organization_id, warehouse_id, bin_id?, sku)` 级共享池。
2. `externalIdMappings` 唯一键 `(shop, entity_type, internal_id)` 隐含"一个内部 ID 对应一条外部记录" → 需求允许一个内部 SKU 映射多条 Listing，且需 `(shop, seller_sku)` 专用唯一约束与冲突异常队列。

官方阶段口径（`crossborder-mvp-overview.md` §6）：P0 = 设计 + UED/mock Demo，暂不接 tRPC 业务；P1 才接 domain/dataaccess + tRPC。本方案即为 P1 落地的复用评估输入。

## 4. Open Mercato 能力概览

- **定位**：AI-Engineering Foundation Framework for business apps；Next.js App Router + TypeScript + PostgreSQL + **MikroORM** + zod + Awilix。Core MIT，`packages/enterprise/**` 商业许可（禁止生产与派生）。
- **模块规模**：`packages/core/src/modules/` 下 48 个模块（catalog、sales、wms、customers、workflows、business_rules、audit_logs、sync_excel、dictionaries、dashboards 等），模块自动发现、可覆盖、可 npm 化。
- **关键机制**：per-module 实体与迁移（no global schema）、Awilix DI、domain events + 持久化订阅者、租户级 feature RBAC、CRUD factory 生成 REST + OpenAPI、动态自定义实体/字段（JSONB 混合索引）。
- **官方边界**：**无 manufacturing / purchasing 模块**；无跨境电商平台连接器（Daraz/Lazada/Shopee/TikTok）。

### 4.1 与 Open Shop 技术栈差异

| 维度 | Open Shop | Open Mercato | 复用影响 |
| --- | --- | --- | --- |
| ORM/迁移 | Drizzle 单 schema + drizzle-kit | MikroORM per-module 实体/迁移 | 不可混用 |
| API | tRPC + Hono OpenAPI | 模块 REST CRUD factory | 分层冲突，禁引入第二套写路径 |
| 前端 | shadcn/ui + Tailwind v4 + next-intl | 自有 design_system | 页面不可直接复用 |
| 认证 | better-auth | 自研 auth + JWT | 认证不可替换，仅借鉴 RBAC |
| 数据库 | PostgreSQL | PostgreSQL（+ pgvector/Redis/Meilisearch） | 同为 PG，概念可平移 |
| 许可 | 私有 | Core MIT / Enterprise 商业 | Enterprise 禁用；Core 参考需保留版权声明 |

## 5. 差距与映射总表

### 5.1 需求 vs Open Shop 覆盖结论

按"schema + 服务 + 页面闭环可用"口径：**0 项已覆盖，9 项部分覆盖，10 项未覆盖**。页面存在 ≠ 业务可用（UED 层不调业务 API）。

### 5.2 需求 vs Open Mercato 复用判定

| 判定 | 需求功能点 | OM 来源 |
| --- | --- | --- |
| 可直接借鉴概念/设计 | F06 字典、F12 库存流水、F01/F03 审批工作流、F17 报表组织、F18 审计/事件、F19 导入批次 | dictionaries、wms movements、workflows + business_rules、dashboards/perspectives、audit_logs + events、sync_excel/data_sync |
| 仅借鉴数据模型/形状 | F04/F05 商品、F13/F14 订单履约、F15 售后、F16 成本结算、F02 店铺主档、F03 RBAC | catalog、sales、warranty_claims、sales invoices/currencies、integrations、feature RBAC |
| 不适合复用 | F07 刊登映射（无 listing 概念）、F08/F09 采购（官方无）、Enterprise 包（许可） | — |
| 不适用（需求外） | 自营店面/CRM/门户、人员排班、EUDR | ecommerce、cart、checkout、portal、customers、staff、planner、eudr |

## 6. 复用建议（三类）

### A. 基于 Open Shop 现有架构扩展（主路径，约 70% 工作量）

1. **演进而非重建** `packages/db/src/commerce-schema.ts`：沿用 [haoshiyun-erp-gap-analysis-and-remediation.md](haoshiyun-erp-gap-analysis-and-remediation.md) 的目标 ER，新增平台/国家站点/币种/仓库/库存池/字典等表，再补供应商、采购单据、库位、库存流水、包裹事件、售后单、导入批次、审计事件。
2. **硬改造两处冲突**：`inventory_balances` 唯一键改为仓库级/池级；`externalIdMappings` 唯一键改为 `(org, shop, seller_sku)` 并支持一 SKU 多 Listing + 异常队列。
3. **按 AGENTS 分层补齐** `apps/web/src/lib/server/{routers,mappers,dataaccess}`：先做 F09 采购审批、F11/F12 库存与流水的 tRPC + dataaccess 事务，页面逐步摘掉 mock。
4. **复用已有真实能力**：OAuth 凭据加密落库、三平台 `MarketplaceConnector`、`runMarketplaceSync` 游标与日志——把 stub persist hooks 实现为 dataaccess 写入（保留幂等键，对应 Q06）。

### B. 参考 Open Mercato 设计（概念层，不搬代码）

| OM 概念 | 映射到需求 |
| --- | --- |
| wms `movements`（来源单、前后量、幂等键） | F12 库存流水、F09 到货入库 |
| `workflows` + `business_rules`（租户级生命周期与规则） | F03/F09 审批中心（PUR-001~003 作为规则配置） |
| `audit_logs` + domain events 持久化订阅者 | F18 审计与接口日志、同步失败告警 |
| `sync_excel` / `data_sync`（批次-行级错误-补偿） | F19 导入迁移 |
| `dictionaries` + JSONB 混合索引 | F06 属性字典、F01 指标元数据 |
| `dashboards` / `widgets` / `perspectives` | F01/F17 报表与仪表盘 |
| 模块目录约定（components/api/services/events/acl） | 作为 `lib/server/<domain>` 组织参考 |

**禁止引入**：MikroORM 实体/迁移、Awilix DI、REST CRUD factory 写路径、better-auth 替代品、`packages/enterprise/**` 代码。

### C. 必须全新开发（双方均无）

1. **采购域全套**：申请 → 自动指派审核人 → 互审禁自审 → 采购单 → 分批到货 → 质检 → 部分入库。
2. **跨境映射与订单安全闭环**：Seller SKU 唯一约束、未映射订单阻断、共享库存池原子预留/释放/出库（幂等 + 行锁）。
3. **LGS / TH-JSB 履约链路**：包裹、交接、清关、尾程事件（Q17 无接口时先人工批量录入）。
4. **平台结算对账与多币种成本版本**：原币 + 汇率日期来源、成本版本不可覆盖历史订单。
5. **业务 RBAC scope**：平台/国家/店铺 × 查/增/改/审/导出，叠加在 better-auth 之上。

## 7. 推荐技术方案

**「概念参考 + 自研 Drizzle schema」，不做代码级集成。**

理由：

1. ORM 迁移体系不兼容，混用会破坏 `packages/db/drizzle/` 单一事实来源。
2. AGENTS 规定 UI → tRPC → mappers → dataaccess → Drizzle；引入 OM 服务层等于第二套写路径，违反 `apps/api` "OpenAPI 与 MCP 共用同一套 domain 服务"约束。
3. better-auth 是现有多租户底座，不可替换。
4. Enterprise 许可禁止生产使用；Core 价值在"形状与流程"，抄设计收益高于抄代码。
5. OM 缺失的恰是需求 P0 核心（连接器/采购/共享库存/平台对账），复用比例本身有限。

### 7.1 落地动作

- 文档引用 OM 时仅以 `@see` 记录"参考设计"；若复制 Core 代码片段须保留 MIT 版权声明。
- 每个域按固定顺序交付：**schema → dataaccess 事务 → tRPC router → 单测（唯一性/幂等/并发）→ 页面切流**。
- 分页统一 `PaginatedResult` + 数据库级 `count/limit/offset`（AGENTS 强制）。
- 平台同步走既有 worker，persist hooks 实现为 dataaccess upsert，日志写 `integration_logs`。

### 7.2 模块优先级（S1–S7）

| 批次 | 模块 | 对应需求 | 说明 |
| --- | --- | --- | --- |
| S1（P0 底座） | 平台/国家站点/店铺/多仓主档、组织权限 scope、字典 | F02/F03/F06 | 解锁后续所有模块 |
| S2（P0 商品） | SPU/SKU 编码生成与停用、供应商映射、Seller SKU 映射 + 异常队列 | F04/F05/F07/F08 | 先修 externalIdMappings 语义（Q05/Q28） |
| S3（P0 库存采购） | 仓库/库位/库存池、余额重构、流水、采购互审闭环 | F09/F10/F11/F12 | 风险最高、价值最大；事务与并发测试必写；参考 OM wms movements |
| S4（P0 订单履约） | 订单同步落库、映射校验阻断、锁库/释放/出库、LGS/JSB 事件、异常队列 | F13/F14 | 依赖 S3；补 persist hooks |
| S5（P0 工作台系统） | 待办审批中心、仪表盘真实聚合、接口日志重试、导入迁移、报表导出 | F01/F17/F18/F19 | 汇聚层，业务表落库之后 |
| S6（P1 财务售后） | 售后单 + 退货质检回库、成本版本、汇率、结算对账、利润 | F15/F16 | 待 Q14–Q16、Q29/Q30 确认 |
| S7（P2 扩展） | Daraz 详细接入、Shopee/TikTok、订单采购/一件代发、AI 选品 | 需求 P2 | AI 选品仅做人工候选评审（Q35） |

节奏与 [haoshiyun-erp-gap-analysis-and-remediation.md](haoshiyun-erp-gap-analysis-and-remediation.md) §5 阶段 0–5 对齐：业务冻结 → 主数据底座 → 采购库存闭环 → 订单物流工作台 → 售后利润 → 迁移验收。

## 8. 待确认事项（衔接 Q01–Q35）

Excel"待IT确认"35 项全部留白，复用评估中以下项直接影响 schema 定稿：

| 问题 | 影响批次 |
| --- | --- |
| Q05/Q28 Seller SKU 映射唯一性与冲突处理 | S2 |
| Q06 同步频率与幂等 | S4 |
| Q07/Q09 锁库/扣库状态节点、并发超卖 | S3/S4 |
| Q10 库位 DB 强约束（R07 落地方式） | S3 |
| Q12 采购审批自动化（互审指派规则） | S3 |
| Q14–Q16 成本算法、汇率、平台费用获取 | S6 |
| Q17 JSB 接口可用性 | S4（不可用则人工批量录入） |
| Q19 迁移回滚 | S5 |
| Q23 权限粒度（scope 维度） | S1 |

## 9. 调研证据索引

| 项 | 位置 |
| --- | --- |
| 需求 Excel | `apps/shop/content/design/好时运ERP运营需求清单_V1.1_现有ERP整改版.xlsx` |
| 仓内差距分析 | `docs/design/haoshiyun-erp-gap-analysis-and-remediation.md` 等 3 篇好时运文档 |
| 阶段口径 | `docs/design/crossborder-mvp-overview.md` §6 |
| Schema | `packages/db/src/commerce-schema.ts`（19 张业务表）、迁移 `packages/db/drizzle/0005–0007` |
| tRPC | `apps/web/src/lib/server/routers/index.ts`（仅 apiKeys） |
| 页面数据源 | `apps/shop/src/lib/crossborder/{mock-data.ts, erp-ued-data.ts, platform-basics-data.ts}` |
| 真实业务写 | `apps/shop/src/lib/marketplace/persist-credentials.ts`、OAuth route |
| 连接器 | `packages/marketplace/src/{adapters,signing,oauth,workers}/`、`apps/shop/src/workers/marketplace-sync.ts`（persist stub） |
| 认证/权限 | `packages/auth/src/{permissions,realm-organization}.ts`、`packages/db/src/auth-schema.ts` |
| Open Mercato | GitHub README、`packages/core/src/modules/`（48 模块）、`packages/enterprise/{LICENSE,TERMS}.md` |
