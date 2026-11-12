# 设计文档索引

> Open Shop 当前只维护跨境运营域的设计文档。跨模块设计在本目录，模块内设计就地存放在 `<app>/content/design/`。

## 1. 跨模块设计（`docs/design/`）

| 文档 | 状态 | 定位 |
| --- | --- | --- |
| [crossborder-mvp-overview.md](crossborder-mvp-overview.md) | **生效** | 改造总览：模块边界、组织角色、Desktop/OKF 商业闭环与实施顺序 |
| [crossborder-database-design.md](crossborder-database-design.md) | **现状基线（目标演进见 haoshiyun-erp-database-schema.md）** | 跨境运营域 Drizzle / PostgreSQL schema 现状记录；含业务输入、Skill execution 与 OKF 知识索引、权限和运营 lineage；库存/成本/映射写路径已由权威 schema 重定义 |
| [crossborder-api-mcp-design.md](crossborder-api-mcp-design.md) | **设计稿（早期草稿）** | `apps/api` OpenAPI + MCP 资源与 tools（待实现）。**当前升级计划**见 [open-shop-desktop-mcp-upgrade-2026-11-12.md](open-shop-desktop-mcp-upgrade-2026-11-12.md) |
| [open-shop-desktop-mcp-upgrade-2026-11-12.md](open-shop-desktop-mcp-upgrade-2026-11-12.md) | **设计稿（2026-11-12，当前 MCP/OAuth/Desktop 升级计划）** | open-shop 侧改造合同：扩展 `@workspace/auth` 作为 Better Auth OAuth 授权服务器、新建 `@workspace/commerce-domain`、独立 `/mcp` 宿主、写路径双轨（MCP 只进待审，确认在 `/console/pending`）；纠正 buddy v1.1 中与 `20b3824` 不符的现状。2026-10-25 OpenWork 工作台文档已过时。 |
| [marketplace-connectors.md](marketplace-connectors.md) | **生效** | `packages/marketplace`：Daraz / Lazada / TikTok OAuth、签名与同步 worker |
| [marketplace-multitenant-app-credentials.md](marketplace-multitenant-app-credentials.md) | **已确认，待实现** | 租户级 Marketplace 应用凭据：`marketplace_app_credentials`、`/api/marketplace/{platform}/oauth/callback`、控制台配置页、`apps/api` 同步/webhook 按租户解析 |
| [marketplace-inapp-cron-and-push.md](marketplace-inapp-cron-and-push.md) | **生效（2026-11-06）** | `apps/api` 应用内 cron（订单/物流/评论）+ LAZOP Push 验签接收；含签名规则、落库幂等键与 Daraz Push 待实测说明 |
| [aftersale-cancel-ingest-and-policy.md](aftersale-cancel-ingest-and-policy.md) | **设计稿（2026-11-07）** | 取消/仅退款：定时拉取建档，占库释放与店铺退款分策略；释放只有手动/自动，退款另有等待天数且受平台 decide 能力限制 |
| [platform-apis/](platform-apis/README.md) | **证据基线（Daraz 2026-10-31；Lazada 分域 2026-11-05）** | 各平台官方 Open API：授权后可读/可写范围；Daraz/Lazada 分域字段、状态映射与统一设计；Shopee/TikTok；Q38 客服 / Q43 字段 / Q44 券 |
| [erp-requirements-q01-q35-dev-replies.md](erp-requirements-q01-q35-dev-replies.md) | **开发答复 · 第二轮（2026-10-31，`a51b142`）** | Q01–Q35 客户可读开发答复；本轮已定 Q04/Q09/Q10/Q12/Q15/Q17/Q30/Q33；仍待确认见文末清单；含 #36 费用模板 |
| [erp-rectification-2026-11-03.md](erp-rectification-2026-11-03.md) | **整改设计响应（2026-11-03）** | 好时运 ERP 开发人员整改清单 26 项逐条设计响应：Q10 库位绑定禁删+履历表、Q23 RBAC country scope+六动作+测试账号演示、Q30 费用模板审核状态机+历史快照、Q07/Q08 库存状态机、Q29 报表口径等；C1–C30 确认清单（19 已拍板 / 10 待确认 / 5 待填细节） |
| [haoshiyun-erp-gap-analysis-and-remediation.md](haoshiyun-erp-gap-analysis-and-remediation.md) | **初步设计，待业务/IT确认** | 好时运 ERP 需求 Excel（9 张表）覆盖分析、当前仓库证据、目标模型与分阶段整改方案 |
| [haoshiyun-erp-open-mercato-reuse-plan.md](haoshiyun-erp-open-mercato-reuse-plan.md) | **调研结论，待业务/IT确认** | 好时运 ERP 需求 × Open Shop 现状 × Open Mercato 复用评估：推荐「概念参考 + 自研 Drizzle schema」，含差距表、三类复用建议与 S1–S7 优先级 |
| [haoshiyun-erp-database-schema.md](haoshiyun-erp-database-schema.md) | **设计稿，待业务/IT确认后 db:generate** | 好时运 ERP 完整数据库表结构（约 75 表）：平台主数据、商品供应商、Seller SKU 映射、采购互审、共享库存流水（借鉴 OM wms）、订单履约 LGS/JSB、售后、成本汇率利润、RBAC/审计/导入、评论口碑（product_reviews / 分析 / HTML 报告快照）、运费测算（freight_estimates 快照 + 货代报价/牌价/HS 税率版本，对齐 freight-estimation-design）；含现有表迁移与业务不变量 |
| [haoshiyun-platform-basics-ued.md](haoshiyun-platform-basics-ued.md) | **UED 初版；平台/国家站点/币种双层 CRUD 已实现（2026-11-10，见 §7）** | 平台/国家站点/仓库/币种主数据及可复用基础字典交互与数据库落地边界；§7 记录 `platform_basics_catalog` 全局目录 + `commerce_platform_basics` 组织副本的 2 表模型、审核通过时幂等初始化与组织内隔离 CRUD |
| [haoshiyun-erp-ued-catalog.md](haoshiyun-erp-ued-catalog.md) | **D1 UED 原型，部分交互待深化** | 好时运 ERP 页面 IA 与交互状态：店铺多仓、商品、供应商、采购、库存、订单履约、售后、报表、导入、日志和权限 |
| [haoshiyun-erp-target-function-matrix.md](haoshiyun-erp-target-function-matrix.md) | **目标功能基线，D1 原型** | 按 P0/P1 域追踪 D0 规格、D1 原型、D2 业务接入、D3 验收上线及后端依赖/验收证据 |
| [haoshiyun-erp-console-menu-ia.md](haoshiyun-erp-console-menu-ia.md) | **IA 设计稿** | 控制台左侧菜单合并稿（Excel 菜单蓝图 × 现有导航）：9 组 35 页线框、功能明细、域 A–K 全表展示路径、设置区 Tab 与旧路由迁移 |
| [console-dropdown-data-maintenance.md](console-dropdown-data-maintenance.md) | **调研清单，待业务确认** | 控制台下拉框数据维护审计：已有维护入口但原型硬编码的数据、缺少维护入口的枚举清单、建议菜单位置与待确认项；确认后再生成维护页面 |
| [freight-estimation-design.md](freight-estimation-design.md) | **设计稿** | 独立运费测算：先做可交互 UED 并确认使用习惯，再接业务 API/tRPC；覆盖空运 DDP、海运 LCL/FCL；按有效报价和规则计算、展示费用边界/数据来源/历史快照；HS/税率/规则/费率/汇率版本化维护与消费方解耦 |
| [multi-platform-pricing-calculator-ux-2026-11-11.md](multi-platform-pricing-calculator-ux-2026-11-11.md) | **生效（第一期实施合同，2026-11-11）** | 多平台定价建议计算器：最少操作路径、线框 §7、分期 §10、默认口径 §11、商品/SKU 与相关表字段结论 §12；升级现有成本计算器，不新开顶层菜单 |
| [ai-candidates/AI选品实现方案.md](ai-candidates/AI选品实现方案.md) | **设计稿** | AI 选品两阶段方案：先用可交互 UED 验证，再接业务 tRPC/持久化；显式区分已核实/估算/假设；统一 PPS；完整比较空运 DDP、海运 LCL/FCL；中间证据、报价和成本快照可追溯与复用 |
| [comment-scraping-and-report-design.md](comment-scraping-and-report-design.md) | **设计稿** | 评论抓取与入口设计：API 优先（Lazop Review）、AI 辅助兜底，统一 DomainReview，生成 HTML 报告（涵盖 KPI/评分分布/关键发现/负向中性/全部评价；规划输出目录 `docs/comments/`，样例在 `docs/design/comments/`） |
| [console-sync-confirm-dialog.md](console-sync-confirm-dialog.md) | **已实现（`sync-confirm-dialog.tsx`，12 处入口）** | 控制台同步 / 提交交运 / 重试入口确认对话框：17 处入口分级（A 真实调平台 / B 本地写 / C 纯本地），按操作差异化文案，明确作用店铺与不可逆影响 |
| [cost-finance-production-closure.md](cost-finance-production-closure.md) | **生效（2026-11-07，#64–#68；2026-11-08 复审 G1–G9）** | 成本财务生产闭环：页面关联（costs/fee-templates/settlements/profits/freight/freight-rate-cards）、导航方案 B（承运商/箱规迁仓储）、迁移重生成为 `0000`/`0001`/`0002_glamorous_bruce_banner`（原 0012/0013 并入，`db:check` 通过）、费用→测算→`sku_costs`→利润与结算导入/Lazop 同步、正式成本 `blockReasons` 阻断与服务端强制校验、去 mock 规则；§9 含 G1–G9 复审状态与 G9 已知遗留 |

## 2. 模块内设计

### `apps/shop` — 租户端（`apps/shop/content/design/`）

| 文档 | 状态 | 定位 |
| --- | --- | --- |
| [tenant-onboarding-and-store-binding.md](../../apps/shop/content/design/tenant-onboarding-and-store-binding.md) | **设计稿，待评审（2026-11-08：G1–G7 已修，G8 部分）** | 租户入驻向导、主体审核、组织创建、首店/多店创建、Daraz/Lazada OAuth 绑定与重新授权；含状态机、权限、接口、线框图和实施计划；§2.2 差距表已按实现标注 |
| [multi-organization-ued.md](../../apps/shop/content/design/multi-organization-ued.md) | **已确认并完成 P0（2026-11-11；Q1/Q2/Q3/Q5/Q8 已定，Q4/Q6/Q7 按推荐实现）** | 一个手机号/邮箱属于多个组织时的登录入口、组织选择页、Topbar 切换器、按组织入驻门槛、邀请确认与多标签页同步；含服务端契约、验收标准与决策记录 |
| [crossborder-shop-ued-product-design.md](../../apps/shop/content/design/crossborder-shop-ued-product-design.md) | **生效** | 租户端 IA、动态 Skill execution/OKF 知识复核与 Desktop 商业闭环 UED |
| [cost-calculator-sl-landed-ued.md](../../apps/shop/content/design/cost-calculator-sl-landed-ued.md) | **生效（已接 `trpc.costs.*`，2026-11-08）** | 斯里兰卡成本计算工作台：先交互 UED 再接业务；空运 DDP / LCL / FCL 成本情景、税项与建议售价 |
| [fee-templates-ued.md](../../apps/shop/content/design/fee-templates-ued.md) | **UED 初版，已接库** | 费用模板（import_tax / platform_fee / ocean_freight）：履约两级、优先级解析、tRPC 列表/详情（localStorage 主路径停用）；成本测算按平台+国家+履约+asOf 命中版本并快照；未命中由 `blockReasons` 阻断 |
| [comment-review-ued.md](../../apps/shop/content/design/comment-review-ued.md) | **UED 初版** | 评论分析报告 UED：KPI、评分分布、关键发现、负向中性与全部评价区块规格 |
| [openwork-desktop-workbench-plan.md](../../apps/shop/content/design/openwork-desktop-workbench-plan.md) | **设计稿（2026-10-25，已过时）** | OpenWork Desktop 工作台集成计划：Skill 能力索引、S1–S5 分步与读写路径。**当前 MCP/OAuth/Desktop 升级计划**见 [open-shop-desktop-mcp-upgrade-2026-11-12.md](open-shop-desktop-mcp-upgrade-2026-11-12.md) |
| [console-inbox-sheet.md](../../apps/shop/content/design/console-inbox-sheet.md) | **已实现（`trpc.notifications`，2026-11-08）** | 控制台站内信 Sheet 交互（读写 `console_notifications`；`site_messages` 外传为后续项） |
| [daraz-lk-erp-p0-ued.md](../../apps/shop/content/design/daraz-lk-erp-p0-ued.md) | **生效（P0 原型）** | Daraz LK 架构差分（非厦门共享池）、F22 柜次/清关库存、F33 汇率、F32 柜次成本版本；P1 壳；P2 推迟；官方 API 能力见 [platform-apis/](platform-apis/README.md) |

### `apps/shop` — 操作手册（`apps/shop/content/guide/`）

| 文档 | 状态 | 定位 |
| --- | --- | --- |
| [marketplace-oauth-admin-setup.md](../../apps/shop/content/guide/marketplace-oauth-admin-setup.md) | **生效** | 租户级平台应用配置：控制台录入 App Key/Secret、回调地址登记、OAuth 验证与排错；部署侧仅保留加密密钥与对外域名 |

### `apps/web` — 平台运营后台（`apps/web/content/design/`）

| 文档 | 状态 | 定位 |
| --- | --- | --- |
| [platform-ops-review-and-management.md](../../apps/web/content/design/platform-ops-review-and-management.md) | **生效（2026-11-10）** | 入驻审核闭环补齐（统计/国家筛选/关联店铺）、店铺管理（停用/恢复）、用户管理（封禁/解封）；页面路由、tRPC 与风控动作语义 |

## 3. 撰写约定

- 流程图用 mermaid，线框图保持原格式。
- 文档只描述跨境运营域，不再新增历史业务域内容。
- 代码里用 `@see <仓库根相对路径> §章节号` 指向设计文档。

## 4. 模块实现文档（`docs/design/shop-module*.md`）

| 文档 | 状态 | 定位 |
| --- | --- | --- |
| [shop-module1-spu-sku-trpc.md](./shop-module1-spu-sku-trpc.md) | 生效 | 模块1 SPU/内部 SKU 主数据 tRPC → DB |
| [shop-module2-purchase-to-inbound-trpc.md](./shop-module2-purchase-to-inbound-trpc.md) | 生效 | 模块2 采购申请→入库 tRPC → DB |
| [shop-module3-order-to-outbound-trpc.md](./shop-module3-order-to-outbound-trpc.md) | 生效 | 模块3 订单→出库 tRPC → DB |
| [shop-module4-lgs-fulfillment-trpc.md](./shop-module4-lgs-fulfillment-trpc.md) | 生效 | 模块4 LGS/物流履约 tRPC → DB |
| [shop-module5-fee-templates-trpc.md](./shop-module5-fee-templates-trpc.md) | 生效 | 模块5 费用模板 tRPC → DB（类型含 `ocean_freight`） |
| [shop-module6-aftersale-trpc.md](./shop-module6-aftersale-trpc.md) | 生效 | 模块6 售后（取消释放/退货质检）tRPC → DB |
| [shop-module7-ocean-trpc.md](./shop-module7-ocean-trpc.md) | 生效 | 模块7 海运柜次/在途库存 tRPC → DB |
| [shop-module8-wms-trpc.md](./shop-module8-wms-trpc.md) | 生效（2026-11-08 补 §3.5 库存预警） | 模块8 WMS 余额/台账/非订单出库/库存预警 tRPC → DB |
| [shop-module9-zones-stabilize.md](./shop-module9-zones-stabilize.md) | 生效 | 模块9 库区真实表稳定化 |
| [shop-module10-related-info-real-data.md](./shop-module10-related-info-real-data.md) | 生效 | 模块10 详情关联信息真实数据 |
| [shop-module11-listing-mapping-trpc.md](./shop-module11-listing-mapping-trpc.md) | 生效 | 模块11 刊登/映射 tRPC → DB |
| [shop-module12-supplier-order-exceptions-trpc.md](./shop-module12-supplier-order-exceptions-trpc.md) | 生效 | 模块12 供应商/订单异常 tRPC → DB |
| [shop-module13-finance-sync-dashboard-trpc.md](./shop-module13-finance-sync-dashboard-trpc.md) | 生效 | 模块13 同步任务/财务成本主路径/Dashboard 去 mock |
| [shop-module14-candidates-notifications-trpc.md](./shop-module14-candidates-notifications-trpc.md) | 生效 | 模块14 候选选品·站内信·Dashboard 残余 |
| [shop-module15-console-ops-cleanup.md](./shop-module15-console-ops-cleanup.md) | 生效 | 模块15 控制台 ops 清理 |
| [shop-module16-real-data-final.md](./shop-module16-real-data-final.md) | 生效 | 模块16 真实数据收尾 |
| [shop-org-rbac-phase-ab.md](./shop-org-rbac-phase-ab.md) | 生效（2026-11-10） | 组织级 RBAC 阶段 A+B：`roles` 四表、设置页、侧栏过滤与敏感写强制 |
