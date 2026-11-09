# 好时运 ERP 控制台左侧菜单设计（IA 合并稿）

| 项 | 内容 |
|----|------|
| 文档范围 | `apps/shop` `/console` 左侧菜单（一级分组 + 二级页面）、设置区导航、页面与数据表展示路径 |
| 输入 | Excel「菜单模块蓝图」（10 个一级 / 37 个二级，用户建议）× 现有 `console-nav.ts` 6 组导航 × 权威 [haoshiyun-erp-database-schema.md](haoshiyun-erp-database-schema.md) 域 A–K 表清单 |
| 约束 | 设置页面保持现有布局与交互（SectionSidebar 垂直 Tab 替换主侧栏）；每个数据表都要有展示路径 |
| 状态 | 设计稿（IA 定稿供 D1→D2 实施）；确认决策见 §1.2 |
| 日期 | 2026-10-29 |

## 1. 输入与确认决策

### 1.1 输入来源

1. **Excel「菜单模块蓝图」**（`好时运ERP运营需求清单_V1.1_现有ERP整改版.xlsx`）：10 个一级菜单、37 个二级页面，含页面目的/主要功能/核心数据对象/权限/阶段（P0/P1/P2）。原始口径：「在现有左侧菜单基础上按业务闭环重组；第一阶段先完成 P0，再建设利润与 AI 功能」。
2. **现有导航**（`apps/shop/src/lib/console-nav.ts`）：6 个分组（workbench/masterData/procurement/fulfillment/analytics/administration）+ footer 设置；平铺渲染、无二级折叠。
3. **现有路由**：`/console` 下 44 个 page（D1 原型/mock；**2026-11-08 更新**：多数已接 tRPC，见 shop-module1–14），设置区 8 Tab。
4. **权威 schema**：域 A–K 约 75 表——菜单必须保证每表有展示路径（§4）。
5. **IA 既有建议**：[haoshiyun-erp-ued-catalog.md](haoshiyun-erp-ued-catalog.md) §1 六组分法。

### 1.2 已确认决策

| # | 决策 | 结论 |
|---|------|------|
| D1 | 一级分组 | **9 组**：Excel 的「AI辅助」仅 1 项且 P2，并入「工作台」；其余按 Excel 业务闭环拆分 |
| D2 | 系统设置落位 | Excel「系统设置」4 项**全部移入设置区**（SectionSidebar 加 Tab）；主侧栏移除 `administration` 组 |
| D3 | 页面粒度 | **按 Excel 拆独立二级路由**：采购 4 页、售后 2 页、商品 SPU/SKU 2 页、财务 2 页、发货 3 页 |
| D4 | 域 J/K 入口 | 评论口碑（J）→ 商品中心「商品评论」；运费测算（K）→ 成本财务「运费测算」 |
| D5 | 属性字典 | 商品中心主入口（新 `/console/dictionaries` 路由）+ **设置区原 Tab 保留**（双侧可达，同一页面） |
| D6 | 旧路由处置 | **一律删除不建 redirect**；功能不一致的合并页与拆分页**双路由并存**并标记 `[并存]`（§5.3：删 4 条、并存 5 条） |

### 1.3 设计原则

- **按业务闭环分组**（Excel 口径）：工作台 → 商品 → 刊登 → 采购 → 仓库 → 订单履约 → 售后 → 成本财务 → 报表，导航顺序即业务流顺序。
- **每表有路径**：表 → 列表页 / 详情页 / 设置 Tab（线表随详情、配置表进设置），见 §4 全量映射。
- **设置区保持现状**：SectionSidebar 垂直 Tab + 三种既有交互（shops 向导 / platform-basics 水平 Tab / dictionaries 左右两栏）不改；仅按 D2 增补 Tab。
- **沿用导航数据结构**：`ConsoleNavGroupConfig` / `ConsoleNavItemConfig`（url + titleKey + badgeKey），扩展 `groupKey` 联合与图标映射即可，不改渲染层形态。
- **旧路由处置**：功能一致的旧路径一律删除不建 redirect；功能不一致的双路由并存（§5.3），D1 原型内容复用。

---

## 2. 线框图

### 2.1 主侧栏（(ops) 壳，9 组 + footer 设置）

```text
┌──────────────────────┐
│ 🏠 Open Shop         │  ← 品牌区（现状）
├──────────────────────┤
│ 工作台               │  ← 分组小标题（现状平铺，无折叠）
│  · 运营仪表盘        │    /console/dashboard
│  · 我的待办    (3)   │    /console/pending      badge: pendingCount
│  · AI选品      [P2]  │    /console/candidates
│                      │
│ 商品中心             │
│  · 商品库SPU         │    /console/master-products
│  · 内部SKU           │    /console/master-skus
│  · 供应商货号        │    /console/supplier-skus
│  · 属性字典          │    /console/dictionaries
│  · 商品评论          │    /console/reviews
│                      │
│ 刊登中心             │
│  · Listing列表       │    /console/listings
│  · 变体映射          │    /console/mappings
│  · 发布与同步任务    │    /console/sync-tasks
│                      │
│ 采购中心             │
│  · 采购申请          │    /console/purchase-requests
│  · 采购审核    (2)   │    /console/purchase-approvals
│  · 采购单            │    /console/purchase-orders
│  · 到货质检入库      │    /console/purchase-receipts
│  · 供应商管理        │    /console/suppliers
│                      │
│ 仓库中心             │
│  · 库存汇总          │    /console/inventory-balances
│  · 仓库与库位        │    /console/warehouse
│  · 入库单            │    /console/stock-inbounds
│  · 出库单            │    /console/stock-outbounds
│  · 库存流水          │    /console/inventory-ledger
│  · 盘点与调整        │    /console/stock-adjustments
│  · 库存预警    (5)   │    /console/inventory     badge: inventoryAlerts
│                      │
│ 订单履约             │
│  · 订单列表          │    /console/orders
│  · 订单异常    (4)   │    /console/order-exceptions
│  · 拣货打包发货      │    /console/picking
│  · LGS物流           │    /console/logistics-lgs
│  · JSB与TH物流       │    /console/logistics-jsb
│                      │
│ 售后中心             │
│  · 取消与退款        │    /console/aftersale-cancels
│  · 退货质检与回库    │    /console/aftersale-returns
│                      │
│ 成本财务             │
│  · SKU成本           │    /console/costs
│  · 平台结算对账      │    /console/settlements
│  · 订单与SKU利润     │    /console/profits
│  · 运费测算          │    /console/freight
│                      │
│ 报表中心             │
│  · 经营报表          │    /console/reports
├──────────────────────┤
│ ⚙ 设置               │  ← footer 钉底（现状不变）
└──────────────────────┘
```

分组数 9、二级项 35；badge 沿用 `pendingCount` / `inventoryAlerts`，新增 `approvalPending`（采购审核）/ `orderExceptions`（订单异常）示例计数（D2 接真数据）。P2 项（AI选品）常显不隐藏——权限不足时置灰而非移除。

### 2.2 内容区（(ops) 壳，现状不变）

```text
┌────────────────────────────────────────────────────────┐
│ Topbar: 面包屑/页面标题 · 搜索 · 通知 · 头像(Profile)   │
├────────────────────────────────────────────────────────┤
│                                                        │
│  [筛选条 ConsoleFilterBar]                             │
│  ┌──────────────────────────────────────────────┐      │
│  │ 列表 Table / 详情 / 工作台卡片                 │      │
│  │ （数据库级分页：items/total/page/pageSize）     │      │
│  └──────────────────────────────────────────────┘      │
│  详情页：列表 → 详情（[id]/[sku] 子路由，现状模式）      │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### 2.3 设置区（SectionSidebar 垂直 Tab，布局与交互保持现状）

```text
┌──────────────────────┐  ┌────────────────────────────────────┐
│ ← 返回工作台         │  │ Topbar                             │
│ 设置                 │  ├────────────────────────────────────┤
│                      │  │                                    │
│  · 店铺连接        ◀ │  │  主区域（三种既有交互模式）：        │
│  · 平台应用配置      │  │  ① 列表+分步向导   （店铺连接）      │
│  · 平台基础资料      │  │  ② 页内水平Tab+弹窗（平台基础资料）  │
│  · 基础数据字典      │  │  ③ 左右 master-detail（字典）        │
│  · 数据导入   [新]   │  │                                    │
│  · 接口日志   [新]   │  │  新增 Tab 复用现有页面内容：         │
│  · 角色权限         │  │  ④ 批次列表+错误行 （数据导入）       │
│  · 组织成员          │  │  ⑤ 日志表+重试     （接口日志）       │
│  · 通知钉钉          │  │  ⑥ 角色矩阵表格    （角色权限）       │
│  · 偏好              │  │                                    │
└──────────────────────┘  └────────────────────────────────────┘
```

- 现有 8 Tab 保留；**新增**「数据导入」「接口日志」2 个 Tab（D2：主侧栏 `administration` 组的 `/console/imports`、`/console/system-log` 内容迁入，D6 旧路由删除）。
- 「角色权限」Tab 沿用现有 `settings/erp-access`（re-export 角色矩阵）；「组织成员」负责账号启停，与角色权限合并覆盖 Excel「人员角色权限」。
- 「平台店铺与授权」收口到「店铺连接」：店铺主档、OAuth 授权、到期与健康同页；组织级 App Key/Secret 放在「平台应用配置」。独立「平台凭证」页已删除。
- 「基础数据字典」Tab 保留（D5）：与商品中心「商品评论」外的属性字典入口同页。

---

## 3. 菜单功能明细（主功能 + 子功能）

> 阶段列沿用 Excel；「来源」：现有=沿用路由，拆分=现单页拆出，新增=全新页面。
> 每个列表页默认具备的通用能力（筛选/排序/分页/导出/详情下钻）不逐页重复。

### 3.1 工作台

| 二级页 | 主要功能（子功能） | 核心数据表 | 权限 | 阶段 | 来源 |
|---|---|---|---|---|---|
| 运营仪表盘 | 指标筛选（日期/平台/站点/店铺）、KPI 卡、趋势、排行、预警、下钻、导出 | 报表聚合 + orders/inventory/finance 摘要 | 按角色与负责店铺；蔡值全业务只读 | P0 | 现有（扩充） |
| 我的待办 | **统一收口**：采购审核、刊登审核、库存调整审批、订单异常、接口异常、催办；按类型/来源单过滤；认领与处理 | pending 类任务、approval_instances、audit 指引 | 仅本人可处理/可查看任务 | P0 | 现有 `/pending` 重构 |
| AI选品 | 候选列表、证据查看、成本试算、人工决策（GO/HOLD/NO-GO）、任务触发 | product_candidates 等域 P2 表 | 杨洁、运营、采购 | P2 | 现有 |

### 3.2 商品中心

| 二级页 | 主要功能（子功能） | 核心数据表 | 权限 | 阶段 | 来源 |
|---|---|---|---|---|---|
| 商品库SPU | 建档、编辑、停用、导入导出、重复校验、款式规格矩阵、编码规则展示 | products（SPU 主档）、commerce_sku_sequences | 编码不可修改删除 | P0 | 拆分（master-products） |
| 内部SKU | 生成 SKU、维护规格/条码/重量尺寸、停用、与变体联动 | product_variants、属性字典值 | 编码不可修改删除 | P0 | 拆分 |
| 供应商货号 | SKU↔供应商映射、价格、起订量、交期、首选标记 | supplier_skus | 采购可维护，普通运营只读 | P0 | 新增（从 suppliers 页拆出） |
| 属性字典 | 标准值、代码、**别名归一**、排序、启停（左右两栏交互，见 §2.3③） | commerce_dictionaries / _values / _aliases | 普通人员只选不增 | P0 | 新增主入口（设置区同页保留） |
| 商品评论 | 评论列表（原文/翻译/情感）、分析报告（KPI/评分分布/关键发现）、抓取运行状态 | product_reviews(+media/replies/analyses)、review_reports(+items)、review_fetch_runs | 按负责店铺 | P1 | 新增（域 J，D4） |

### 3.3 刊登中心

| 二级页 | 主要功能（子功能） | 核心数据表 | 权限 | 阶段 | 来源 |
|---|---|---|---|---|---|
| Listing列表 | 草稿/发布/暂停/改价/同步、状态与错误、平台原始值查看 | listings | 按负责平台店铺 | P0 | 现有 |
| 变体映射 | 批量映射（Seller SKU↔内部SKU）、冲突校验、解绑、历史、**异常队列**（页内 Tab） | seller_sku_mappings、mapping_exceptions | 唯一性强校验 | P0 | 现有 `/mappings` |
| 发布与同步任务 | 发布/库存/价格/状态同步任务列表、进度、错误重试、关联接口日志 | 同步任务 + integration_logs（action 视角） | 外部IT可排查不可改业务审批 | P0 | 新增 |

### 3.4 采购中心

| 二级页 | 主要功能（子功能） | 核心数据表 | 权限 | 阶段 | 来源 |
|---|---|---|---|---|---|
| 采购申请 | 新建、提交、撤回、关联补货建议与 AI 选品、行明细 | purchase_requests(+lines) | 全员可提交 | P0 | 拆分（purchases） |
| 采购审核 | 审核队列、自动分配审核人、通过/驳回、意见记录、**互审规则展示**（禁自审） | approval_rules / approval_instances / approval_events | 杨洁、黄发聪（PUR-001~003） | P0 | 拆分 |
| 采购单 | 由已审核申请生成、价格数量、预计到货、状态推进 | purchase_orders(+lines) | 仅审核后生成 | P0 | 拆分 |
| 到货质检入库 | 分批到货、质检（合格/残次/短缺）、部分入库、退供应商 | purchase_receipts(+lines)、qc_inspections(+lines) | 合格数量才进可用库存 | P0 | 拆分 |
| 供应商管理 | 联系人、结算、交期、质量、附件、启停 | suppliers | 停用不影响历史 | P0 | 现有（移入本组） |

### 3.5 仓库中心

| 二级页 | 主要功能（子功能） | 核心数据表 | 权限 | 阶段 | 来源 |
|---|---|---|---|---|---|
| 库存汇总 | 按仓库/库位/SKU 查实际、可用、锁定、在途、残次；五国共享池视图 | inventory_balances（+inventory_reservations 摘要） | 共享池只读+权限 | P0 | 新增（与预警分离） |
| 仓库与库位 | 建仓库/库位、SKU 绑定与解绑、停用、**绑定履历（只读，禁物理删除）** | commerce_warehouses、commerce_bins、commerce_bin_bindings、bin_binding_history | 一库位一启用 SKU（C1/C2） | P0 | 现有 |
| 入库单 | 采购收货、质检结果确认、上架库位、触发流水 | purchase_receipts 视角 + inventory_ledger（in） | 必须关联来源单据 | P0 | 新增 |
| 出库单 | 拣货、复核、打包、称重、出库交接 | stock out 单据 + inventory_ledger（out） | 出库与流水一致 | P0 | 新增 |
| 库存流水 | 全类型查询（采购入库/锁定/释放/出库/盘点/售后/报损）、按幂等键追溯 | inventory_ledger | 历史不可删除 | P0 | 现有（剥离调整） |
| 盘点与调整 | 盘点任务、差异、审批、调整、报损 | stock_adjustments(+lines) | 保留前后数量与原因 | P0 | 新增（从 ledger 拆出） |
| 库存预警 | 安全库存、可售天数、交期、建议采购量 | stock_alerts | 按内部 SKU 计算 | P0 | 现有（重构） |

### 3.6 订单履约

| 二级页 | 主要功能（子功能） | 核心数据表 | 权限 | 阶段 | 来源 |
|---|---|---|---|---|---|
| 订单列表 | 同步、去重、筛选、导出、状态更新；未映射订单进异常入口 | orders(+order_lines) | 未映射不占库 | P0 | 现有 |
| 订单异常 | 分配、修复映射、补锁库存、重试、关闭；技术/业务异常分开 | order_exceptions | 杨洁、外部IT | P0 | 现有 |
| 拣货打包发货 | 拣货单、面单、复核、称重、出库、防重复出库 | packages(+package_items) | 出库与流水一致 | P0 | 拆分（shipments） |
| LGS物流 | 交接批次、轨迹、签收、异常（MY/PH/SG/VN 四国站点视图） | fulfillment_batches(+packages)、logistics_events | Lazada 运营 | P0 | 拆分 |
| JSB与TH物流 | 自营仓出库、JSB 交接、清关、官方尾程、费用与异常、节点时间线 | fulfillment_batch 系 + logistics_events（TH 链路） | 每节点完整记录 | P0 | 拆分 |

### 3.7 售后中心

| 二级页 | 主要功能（子功能） | 核心数据表 | 权限 | 阶段 | 来源 |
|---|---|---|---|---|---|
| 取消与退款 | 平台同步、审核、退款、**释放锁定库存** | aftersale_orders（取消/退款类） | 关联原订单 | P1 | 拆分（aftersales） |
| 退货质检与回库 | 收货、质检、可售回库、残次报损 | aftersale_return_items + 质检/入库流水 | 质检后才增加可用 | P1 | 拆分 |

### 3.8 成本财务

> **导航方案 B（#64–#68，已落地）**：成本财务组保留 costs / fee-templates / settlements / profits / freight-rate-cards / freight；**承运商、箱规迁至仓库中心**。详见 [cost-finance-production-closure.md](cost-finance-production-closure.md)。

| 二级页 | 主要功能（子功能） | 核心数据表 | 权限 | 阶段 | 来源 |
|---|---|---|---|---|---|
| SKU成本 | 测算（LK 工作台）、柜次成本写 `sku_costs`；汇率选自设置·fx-rates；费用模板 resolve | sku_costs、fx_rates、fee_templates(+versions)、ocean_shipments | 正式成本禁 localStorage | P1 | `/costs`（#64 闭环） |
| 费用模板 | import_tax / platform_fee / ocean_freight；版本审核与 resolve | fee_templates、fee_template_versions | 审核状态机 | P1 | `/fee-templates` |
| 平台结算对账 | CSV/JSON 导入、Lazop 同步、状态确认 | settlements(+settlement_lines)、sync_tasks | 确认后改状态 | P1 | `/settlements` |
| 订单与SKU利润 | 营收−成本−结算/物流费；下钻 | orders、sku_costs、settlement_lines | 只读派生 | P1 | `/profits` |
| 运价卡 | 空运/LCL/FCL 牌价 CRUD；可选承运商 | commerce_freight_rate_cards、commerce_carriers | 组织主档 | P1 | `/freight-rate-cards`（#64/#65） |
| 运费测算 | 只读拼盘：运价卡 + ocean_freight 模板 + ocean packing | commerce_freight_rate_cards、fee_templates、ocean_* | 只读 | P1 | `/freight` |
| （迁出）承运商 | 主档 CRUD → **仓库中心** | commerce_carriers | — | P1 | `/carriers` |
| （迁出）箱规 | 主档 CRUD → **仓库中心**；海运装箱引用 code | commerce_carton_specs | — | P1 | `/carton-specs` |

### 3.9 报表中心

| 二级页 | 主要功能（子功能） | 核心数据表 | 权限 | 阶段 | 来源 |
|---|---|---|---|---|---|
| 经营报表 | 页内报表 Tab：**销售 / 库存 / 采购 / 利润**；按日期/平台/站点/店铺/SPU/SKU/负责人筛选、下钻到明细、导出 | report_metrics（口径元数据）+ 各域聚合视图 | 可下钻到明细 | P0/P1 | 现有 `/reports`（扩充 Tab） |

### 3.10 设置区（footer 进入，布局交互保持现状，D2 增补）

| 设置 Tab | 主要功能（子功能） | 核心数据表 | 来源 |
|---|---|---|---|
| 店铺连接 | 列表 + 分步向导（平台→站点→资料→多选仓库→唯一默认仓）、详情、停用 | shops、shop_warehouses、integration_states（同步健康） | 现有 |
| 平台应用配置 | 组织级 App Key/App Secret、默认/独立回调、最近验证与错误 | marketplace_app_credentials | 现有 |
| 平台基础资料 | 页内 4 Tab：平台/国家站点/仓库/币种 CRUD、启停 | commerce_platforms、commerce_countries、platform_marketplaces、commerce_currencies、commerce_warehouses | 现有 |
| 基础数据字典 | 左右两栏字典维护（同商品中心入口） | commerce_dictionaries 系 | 现有 |
| 数据导入 | 模板下载、上传校验、错误行报告、批次回滚（双通道 file/platform_api） | import_batches、import_rows | **新增 Tab**（迁自 /console/imports） |
| 接口日志 | 调用流水、成功失败、错误码、重试、告警（与 audit 关联跳转） | integration_logs、audit_events | **新增 Tab**（迁自 /console/system-log） |
| 角色权限 | 角色 CRUD、模块操作、店铺范围矩阵（现角色矩阵页） | erp_roles(_permissions)、erp_member_roles(_scopes) | 现有（主侧栏项移入） |
| 组织成员 | 成员列表、邀请、启停 | auth member + erp_member_roles | 现有 |
| 通知钉钉 | 告警渠道、Webhook | （占位） | 现有 |
| 偏好 | 默认店铺/时区/币种 | — | 现有 |

---

## 4. 数据表 → 菜单展示路径（域 A–K 全量）

> 「列表=独立二级页；详情=列表下钻子路由；设置=设置区 Tab；并入=在某页的 Tab/区块展示」——线表与配置表不单设菜单项。

### 4.1 域 A 平台与主数据（12）

| 表 | 展示路径 |
|---|---|
| commerce_platforms | 设置·平台基础资料（平台 Tab） |
| commerce_countries / platform_marketplaces | 设置·平台基础资料（国家站点 Tab） |
| commerce_currencies | 设置·平台基础资料（币种 Tab） |
| commerce_warehouses | 设置·平台基础资料（仓库 Tab）+ 仓库中心·仓库与库位 |
| commerce_bins | 仓库中心·仓库与库位（库位 Tab/明细） |
| inventory_pools | 仓库中心·仓库与库位（库存池配置区块） |
| shops | 设置·店铺连接（列表+向导+详情） |
| shop_warehouses | 设置·店铺连接（向导第 4 步）+ 仓库中心·仓库与库位（关联店铺列） |
| commerce_dictionaries / _values / _aliases | 商品中心·属性字典 = 设置·基础数据字典（同页双入口，D5） |

### 4.2 域 B 商品与供应商（5）

| 表 | 展示路径 |
|---|---|
| products | 商品中心·商品库SPU（列表+详情） |
| product_variants | 商品中心·内部SKU（列表+规格矩阵详情） |
| commerce_sku_sequences | 商品中心·商品库SPU（编码规则说明区块） |
| suppliers | 采购中心·供应商管理（列表+详情） |
| supplier_skus | 商品中心·供应商货号（映射列表，行下钻 SKU/供应商） |

### 4.3 域 C 刊登与映射（3）

| 表 | 展示路径 |
|---|---|
| listings | 刊登中心·Listing列表（+详情） |
| seller_sku_mappings | 刊登中心·变体映射 |
| mapping_exceptions | 刊登中心·变体映射（异常 Tab）；流向订单异常的入口 |

### 4.4 域 D 采购与审批（11）

| 表 | 展示路径 |
|---|---|
| purchase_requests(+lines) | 采购中心·采购申请（+详情） |
| approval_rules | 采购中心·采购审核（互审规则展示）+ 设置·角色权限（关联） |
| approval_instances / approval_events | 采购中心·采购审核（实例详情时间线）+ 工作台·我的待办 |
| purchase_orders(+lines) | 采购中心·采购单（+详情） |
| purchase_receipts(+lines) | 采购中心·到货质检入库（到货 Tab）+ 仓库中心·入库单（作业视角） |
| qc_inspections(+lines) | 采购中心·到货质检入库（质检 Tab） |

### 4.5 域 E 仓储与库存（6）

| 表 | 展示路径 |
|---|---|
| inventory_balances | 仓库中心·库存汇总（+SKU 详情） |
| inventory_reservations | 库存汇总（锁定列/预留明细）+ 订单详情（占用行） |
| inventory_ledger | 仓库中心·库存流水（全类型查询） |
| stock_adjustments(+lines) | 仓库中心·盘点与调整 |
| stock_alerts | 仓库中心·库存预警（badge: inventoryAlerts） |

### 4.6 域 F 订单与履约（8）

| 表 | 展示路径 |
|---|---|
| orders(+order_lines) | 订单履约·订单列表（+详情含映射检查） |
| order_exceptions | 订单履约·订单异常（badge 候选） |
| packages(+package_items) | 订单履约·拣货打包发货（+包裹详情） |
| logistics_events | LGS物流 / JSB与TH物流（轨迹时间线） |
| fulfillment_batches(+packages) | LGS物流 / JSB与TH物流（交接批次列表） |

### 4.7 域 G 售后（2）

| 表 | 展示路径 |
|---|---|
| aftersale_orders | 售后中心·取消与退款 |
| aftersale_return_items | 售后中心·退货质检与回库 |

### 4.8 域 H 成本财务（8）

> 生产闭环补充表：`commerce_freight_rate_cards`（历史 0012，现于 `0002_glamorous_bruce_banner.sql`）；承运商/箱规展示路径改为仓库中心（导航 B）。详见 [cost-finance-production-closure.md](cost-finance-production-closure.md)。

| 表 | 展示路径 |
|---|---|
| fx_rates | 成本财务·SKU成本（汇率快照选择器）+ 运费测算（fx 引用展示） |
| cost_templates(+versions) | 成本财务·SKU成本（模板/版本 Tab） |
| sku_costs | 成本财务·SKU成本（成本卡列表+详情） |
| order_fees | 成本财务·订单与SKU利润（费用明细）+ 订单详情（费用 Tab） |
| settlements(+settlement_lines) | 成本财务·平台结算对账（+单据详情） |
| order_profit_snapshots | 成本财务·订单与SKU利润（利润快照） |

### 4.9 域 I 系统/权限/审计/导入（11）

| 表 | 展示路径 |
|---|---|
| erp_roles(_permissions)、erp_member_roles(_scopes) | 设置·角色权限（矩阵页） |
| audit_events | 设置·接口日志（操作审计 Tab/关联跳转） |
| import_batches / import_rows | 设置·数据导入（批次列表+行错误报告） |
| report_metrics | 报表中心·经营报表（指标口径说明） |
| integration_credentials | 设置·店铺连接（授权状态/到期/健康） |
| integration_states | 设置·店铺连接（详情同步健康）+ 发布与同步任务（游标摘要） |
| integration_logs | 设置·接口日志 + 刊登中心·发布与同步任务（action 过滤视图） |

### 4.10 域 J 评论口碑（7）

| 表 | 展示路径 |
|---|---|
| product_reviews(+media/replies/analyses) | 商品中心·商品评论（列表+分析 Tab） |
| review_reports(+items) | 商品中心·商品评论（报告 Tab，HTML 快照下载） |
| review_fetch_runs | 商品中心·商品评论（抓取运行 Tab） |

### 4.11 域 K 运费测算（16）

| 表 | 展示路径 |
|---|---|
| freight_estimates | 成本财务·运费测算（测算列表+快照详情） |
| freight_quotes(+quote_lines) | 运费测算·报价比较（Tab） |
| freight_rate_cards(+versions/_tiers) | 运费测算·牌价维护（Tab） |
| freight_carriers / freight_lanes / freight_charge_item_defs | 运费测算·参考数据（Tab） |
| hs_codes / hs_tariff_versions / hs_match_rules | 运费测算·HS 税率维护（Tab） |
| freight_config_versions / packaging_specs | 运费测算·平台配置/箱规（Tab） |
| freight_estimate_comparisons | 运费测算·比较组（P2 Tab） |

**覆盖结论**：约 75 表全部有展示路径；无一表缺入口。进货/出库单的表级落点在 §5.2 待确认项。

---

## 5. 合并与迁移

### 5.1 一级分组对照（Excel → 最终 9 组）

| Excel 一级 | 最终分组 | 变化 |
|---|---|---|
| 工作台 | **工作台** | 并入「AI辅助/AI选品」（D1） |
| 商品中心 | **商品中心** | 属性字典上提（D5）、商品评论新增（D4） |
| 刊登中心 | **刊登中心** | 独立成组（原散在 fulfillment） |
| 采购中心 | **采购中心** | 供应商管理从基础资料移入 |
| 仓库中心 | **仓库中心** | 独立成组（原归「采购与库存」） |
| 订单履约 | **订单履约** | 发货/物流按 Excel 拆 3 页 |
| 售后中心 | **售后中心** | 独立成组（原平铺 fulfillment） |
| 成本财务 | **成本财务** | 独立成组 + 运费测算 + 运价卡；承运商/箱规迁仓库中心（方案 B，#64） |
| 报表中心 | **报表中心** | 4 报表为页内 Tab（Excel 单页口径） |
| AI辅助 | → 工作台 | D1 |
| 系统设置 | → 设置区 | D2（主侧栏 administration 组移除） |
| （现有无） | footer·设置 | 保持现状 |

### 5.2 旧导航 → 新导航（`console-nav.ts` 改造点）

**旧路由处置原则（确认后更新）**：旧路由**一律删除**（不建 redirect）；仅当旧页功能与新页**不一致**（合并/单页视图无法被拆分页 1:1 替代）时，**保留旧路由与新路由并存**，并在下表与 §5.3 标记 `[并存]`——并存路由不在新菜单展示，仅直达可达，收敛（下线）时机待并存页使用反馈后确认。

| 现有项 | 去向 | 处置 |
|---|---|---|
| workbench/dashboard、pending、candidates | 保留（pending 文案改「我的待办」，范围扩大） | 原路由沿用 |
| masterData/master-products | 保留为「商品库SPU」；SKU 拆出 → master-skus | 原路由沿用（页内拆 Tab→路由） |
| masterData/suppliers | → 采购中心·供应商管理；映射部分拆出 → supplier-skus | 原路由沿用（映射内容迁出） |
| masterData/mappings | → 刊登中心·变体映射 | 原路由沿用（仅换组） |
| masterData/warehouse | → 仓库中心 | 原路由沿用（仅换组） |
| procurement/purchases | 拆为采购中心 4 页 | **`[并存]`** 单页全流程状态流 ≠ 4 拆页 1:1 |
| procurement/inventory-ledger | → 仓库中心（剥离调整） | 原路由沿用（调整内容迁 stock-adjustments；ledger 页保留流水+入口） |
| procurement/inventory | → 仓库中心·库存预警 | 原路由沿用（仅换组） |
| fulfillment/products（商品与刊登合并页） | 商品部分 → 商品中心，刊登部分 → 刊登中心 | **`[并存]`** 合并视图 ≠ 拆分页 1:1（含子路由 `[sku]`） |
| fulfillment/listings、order-exceptions、orders | 分组改挂 | 原路由沿用 |
| fulfillment/shipments | 拆为 picking / logistics-lgs / logistics-jsb | **`[并存]`** 全物流合页 ≠ 3 拆页 1:1 |
| fulfillment/aftersales | 拆为 aftersale-cancels / aftersale-returns | **`[并存]`** 取消+退货合页 ≠ 2 拆页 1:1 |
| analytics/costs、reports | 原路由沿用（换组；reports 扩 Tab） | 原路由沿用 |
| analytics/finance | 拆为 settlements / profits | **`[并存]`** 财务中心合页 ≠ 2 拆页 1:1 |
| administration/imports | → 设置·数据导入 | **删除**（功能一致，仅换壳） |
| administration/system-log | → 设置·接口日志 | **删除**（功能一致，仅换壳） |
| administration/access-control | → 设置·角色权限（settings/erp-access 同页 re-export） | **删除**（同页二入口合一） |
| settings/dictionaries | → 商品中心·`/console/dictionaries`（同页换壳） | **删除**旧路由；设置 Tab 变导航链接 |
| `groupKey` 联合类型 | `workbench`\|`products`\|`listings`\|`procurement`\|`warehouse`\|`fulfillment`\|`aftersales`\|`finance`\|`reports` | — |
| footer settings、SETTINGS_NAV | footer 不变；SETTINGS_NAV 插入 marketplace-apps、imports、integration-log；删除 credentials | — |
| 图标映射 NAV_ICONS | 按新组补 lucide 图标（如 Boxes/Factory/Truck/BadgePercent/ChartNoAxesCombined） | — |

### 5.3 旧路由处置清单

**① 删除（功能一致的纯迁移/换壳，4 条）——路由与菜单入口一并移除，访问 404：**

| 旧路由 | 对应新路由 |
|---|---|
| /console/imports | /console/settings/imports |
| /console/system-log | /console/settings/integration-log |
| /console/access-control | /console/settings/erp-access（原 re-export 同页） |
| /console/settings/dictionaries | /console/dictionaries（设置 Tab 链接跳转，非路由别名） |

**② `[并存]` 保留（功能不一致，旧合页与新拆页同时存在，5 条）——旧路由不在菜单展示、直达到达；设计标记收敛待定：**

| 旧路由（并存，不在菜单） | 新路由（新菜单） | 功能差异标记 |
|---|---|---|
| /console/products（+`[sku]`） | /console/master-products、/console/master-skus、/console/listings | 合并「商品与刊登」列表视图 vs 商品中心/刊登中心拆分页；并存期间合并视图作跨域总览用 |
| /console/purchases | /console/purchase-requests、/console/purchase-approvals、/console/purchase-orders、/console/purchase-receipts | 单页申请→审核→下单→收货质检状态流 vs 4 拆页；并存期间作采购全流程驾驶舱 |
| /console/shipments | /console/picking、/console/logistics-lgs、/console/logistics-jsb | 包裹+全物流一页 vs 作业/LGS/JSB 拆页 |
| /console/aftersales | /console/aftersale-cancels、/console/aftersale-returns | 取消退款+退货质检合页 vs 2 拆页 |
| /console/finance | /console/settlements、/console/profits | 财务中心（结算+利润）合页 vs 2 拆页 |

**③ 不变（URL 原样，仅分组改挂，10+ 条）**：dashboard / pending / candidates / master-products / suppliers / mappings / warehouse / inventory / inventory-ledger / listings / orders / order-exceptions / costs / reports；设置区现有 8 Tab 路径均不变。

---

## 6. 实施与验收要点

1. **D1 原型页复用**：33 个二级页中 24+ 已有 D1 原型；拆分页（采购 4、售后 2、发货 3、财务 2、SKU）从现单页拆 Tab 为路由，UedWorkspace 状态按页切分；`[并存]` 5 条旧合页原样保留（不在新菜单挂载）。
2. **导航先行**：`console-nav.ts` 分组/类型扩展 + `console-sidebar.tsx` 图标 + i18n titleKey 是最高优先级改造，可独立验收（菜单与路由一一对应、badge 通）。
3. **设置区**：仅增 2 Tab（数据导入/接口日志），布局交互零改动；`(ops)/access-control` 删除后，`settings/erp-access` 由 re-export 改为正向持有页面实现（源组件上提共享）。
4. **验收标准**：① 菜单结构与本文 §2 逐项一致；② §4 表清单抽查每表可从菜单到达；③ 删除的 4 条旧路由不可访问（404），并存的 5 条旧路由与新拆页同时可用且菜单不展示旧入口；④ 设置区三交互模式（向导/水平Tab/左右栏）不回归；⑤ 权限用例（杨洁/仓库/外部IT/蔡值只读）按各页权限列验证。
5. **不改**：Profile 区、Copilot/知识执行入口（crossborder UED 既有决议）、落地页营销导航。

## 7. 待确认事项（不阻塞本文）

| # | 事项 | 现取值 |
|---|---|---|
| Q1 | 入库单/出库单是独立单据页还是「到货质检入库/拣货打包发货」的作业视角（避免采购收货与仓库上架两处重复录入） | 暂按独立菜单项（Excel 口径），D2 实施时用同一单据双视角验证 |
| Q2 | 「经营报表」4 类是否需要 4 个独立路由（Excel 为单页） | 暂按单页 + 页内 Tab |
| Q3 | 发布与同步任务与设置·接口日志的数据视角分工（业务任务 vs 技术流水） | 本文已按「任务视角 / HTTP 流水」分层，实施时校验查询条件互导 |

## 关联

- 权威表结构：[haoshiyun-erp-database-schema.md](haoshiyun-erp-database-schema.md)（§14 表清单）
- 页面与交互规格：[haoshiyun-erp-ued-catalog.md](haoshiyun-erp-ued-catalog.md)、[haoshiyun-erp-target-function-matrix.md](haoshiyun-erp-target-function-matrix.md)
- 现有导航代码：`apps/shop/src/lib/console-nav.ts`、`apps/shop/src/components/console-sidebar.tsx`
- 设置页设计：[haoshiyun-platform-basics-ued.md](haoshiyun-platform-basics-ued.md)
- 需求源：`apps/shop/content/design/好时运ERP运营需求清单_V1.1_现有ERP整改版.xlsx`（菜单模块蓝图）
