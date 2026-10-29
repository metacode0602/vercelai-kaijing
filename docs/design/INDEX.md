# 设计文档索引

> Open Shop 当前只维护跨境运营域的设计文档。跨模块设计在本目录，模块内设计就地存放在 `<app>/content/design/`。

## 1. 跨模块设计（`docs/design/`）

| 文档 | 状态 | 定位 |
| --- | --- | --- |
| [crossborder-mvp-overview.md](crossborder-mvp-overview.md) | **生效** | 改造总览：模块边界、组织角色、Desktop/OKF 商业闭环与实施顺序 |
| [crossborder-database-design.md](crossborder-database-design.md) | **现状基线（目标演进见 haoshiyun-erp-database-schema.md）** | 跨境运营域 Drizzle / PostgreSQL schema 现状记录；含业务输入、Skill execution 与 OKF 知识索引、权限和运营 lineage；库存/成本/映射写路径已由权威 schema 重定义 |
| [crossborder-api-mcp-design.md](crossborder-api-mcp-design.md) | **设计稿** | `apps/api` OpenAPI + MCP 资源与 tools（待实现） |
| [marketplace-connectors.md](marketplace-connectors.md) | **生效** | `packages/marketplace`：Daraz / Lazada / TikTok OAuth、签名与同步 worker |
| [haoshiyun-erp-gap-analysis-and-remediation.md](haoshiyun-erp-gap-analysis-and-remediation.md) | **初步设计，待业务/IT确认** | 好时运 ERP 需求 Excel（9 张表）覆盖分析、当前仓库证据、目标模型与分阶段整改方案 |
| [haoshiyun-erp-open-mercato-reuse-plan.md](haoshiyun-erp-open-mercato-reuse-plan.md) | **调研结论，待业务/IT确认** | 好时运 ERP 需求 × Open Shop 现状 × Open Mercato 复用评估：推荐「概念参考 + 自研 Drizzle schema」，含差距表、三类复用建议与 S1–S7 优先级 |
| [haoshiyun-erp-database-schema.md](haoshiyun-erp-database-schema.md) | **设计稿，待业务/IT确认后 db:generate** | 好时运 ERP 完整数据库表结构（约 75 表）：平台主数据、商品供应商、Seller SKU 映射、采购互审、共享库存流水（借鉴 OM wms）、订单履约 LGS/JSB、售后、成本汇率利润、RBAC/审计/导入、评论口碑（product_reviews / 分析 / HTML 报告快照）、运费测算（freight_estimates 快照 + 货代报价/牌价/HS 税率版本，对齐 freight-estimation-design）；含现有表迁移与业务不变量 |
| [haoshiyun-platform-basics-ued.md](haoshiyun-platform-basics-ued.md) | **UED 初版，待评审** | 平台/国家站点/仓库/币种主数据及可复用基础字典交互与数据库落地边界 |
| [haoshiyun-erp-ued-catalog.md](haoshiyun-erp-ued-catalog.md) | **D1 UED 原型，部分交互待深化** | 好时运 ERP 页面 IA 与交互状态：店铺多仓、商品、供应商、采购、库存、订单履约、售后、报表、导入、日志和权限 |
| [haoshiyun-erp-target-function-matrix.md](haoshiyun-erp-target-function-matrix.md) | **目标功能基线，D1 原型** | 按 P0/P1 域追踪 D0 规格、D1 原型、D2 业务接入、D3 验收上线及后端依赖/验收证据 |
| [haoshiyun-erp-console-menu-ia.md](haoshiyun-erp-console-menu-ia.md) | **IA 设计稿** | 控制台左侧菜单合并稿（Excel 菜单蓝图 × 现有导航）：9 组 33 页线框、功能明细、域 A–K 全表展示路径、设置区 Tab 与旧路由迁移 |
| [freight-estimation-design.md](freight-estimation-design.md) | **设计稿** | 独立运费测算：先做可交互 UED 并确认使用习惯，再接业务 API/tRPC；覆盖空运 DDP、海运 LCL/FCL；按有效报价和规则计算、展示费用边界/数据来源/历史快照；HS/税率/规则/费率/汇率版本化维护与消费方解耦 |
| [ai-candidates/AI选品实现方案.md](ai-candidates/AI选品实现方案.md) | **设计稿** | AI 选品两阶段方案：先用可交互 UED 验证，再接业务 tRPC/持久化；显式区分已核实/估算/假设；统一 PPS；完整比较空运 DDP、海运 LCL/FCL；中间证据、报价和成本快照可追溯与复用 |
| [comment-scraping-and-report-design.md](comment-scraping-and-report-design.md) | **设计稿** | 评论抓取与入口设计：API 优先（Lazop Review）、AI 辅助兜底，统一 DomainReview，生成 HTML 报告（涵盖 KPI/评分分布/关键发现/负向中性/全部评价；规划输出目录 `docs/comments/`，样例在 `docs/design/comments/`） |

## 2. 模块内设计

### `apps/shop` — 租户端（`apps/shop/content/design/`）

| 文档 | 状态 | 定位 |
| --- | --- | --- |
| [crossborder-shop-ued-product-design.md](../../apps/shop/content/design/crossborder-shop-ued-product-design.md) | **生效** | 租户端 IA、动态 Skill execution/OKF 知识复核与 Desktop 商业闭环 UED |
| [cost-calculator-sl-landed-ued.md](../../apps/shop/content/design/cost-calculator-sl-landed-ued.md) | **生效** | 斯里兰卡成本计算工作台：先交互 UED 再接业务；空运 DDP / LCL / FCL 成本情景、税项与建议售价 |
| [comment-review-ued.md](../../apps/shop/content/design/comment-review-ued.md) | **UED 初版** | 评论分析报告 UED：KPI、评分分布、关键发现、负向中性与全部评价区块规格 |
| [openwork-desktop-workbench-plan.md](../../apps/shop/content/design/openwork-desktop-workbench-plan.md) | **设计稿** | OpenWork Desktop 工作台集成计划：Skill 能力索引、S1–S5 分步与读写路径 |
| [console-inbox-sheet.md](../../apps/shop/content/design/console-inbox-sheet.md) | Demo | 控制台站内信 Sheet 交互 |

### `apps/web` — 平台运营后台

当前无独立设计文档；租户/店铺审核、同步健康、待审抽检见总览中的模块边界。

## 3. 撰写约定

- 流程图用 mermaid，线框图保持原格式。
- 文档只描述跨境运营域，不再新增历史业务域内容。
- 代码里用 `@see <仓库根相对路径> §章节号` 指向设计文档。
