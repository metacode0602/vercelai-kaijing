# Daraz LK ERP · P0/P1 原型与架构差分

> 状态：设计稿（原「控制台 localStorage 原型、无 tRPC」为当时口径；**2026-11-08 更新**：主路径已接 tRPC/真实 DB，`createDemoStore` 已删，见 shop-module1–14 与 cost-finance §9）  
> 范围：**当前仅 Daraz Sri Lanka**；平台/站点/仓类型/税模板配置可扩展。  
> 审批人（相关流程）：杨洁 / 黄发聪  
> @see docs/design/haoshiyun-erp-database-schema.md  
> @see apps/shop/content/design/cost-calculator-sl-landed-ued.md  
> @see apps/shop/content/design/erp-console-ued-plan.md
> @see docs/design/platform-apis/ — 官方 Open API 能力（Q38 客服 / Q43 字段 / Q44 券；编号与下文 P2 旧 Q36/Q38/Q44 不同）

## 1. 架构冲突决议（必须）

| 议题 | 旧叙述（冲突） | **决议（本版生效）** |
| --- | --- | --- |
| Daraz 与厦门现货池 | 「Lazada 五站 + Daraz 共用 `WH-CN-XMN-001`」 | **作废对 Daraz 的共享池表述**。Daraz LK **不**共享厦门现货池。 |
| Daraz 履约路径 | 与 Lazada 共用 CN 仓直发 | Daraz LK = **海运 45–60 天 → Colombo 本地仓 → last mile**。库存状态含在途 / 清关中 / 本地仓可用 / 残次，并以**柜次**为批次单位。 |
| Lazada | — | Lazada 五站可继续独立采用「共享厦门仓 / LGS·JSB」模型；与 Daraz LK **分池、分仓、分履约模式**。 |
| 配置扩展 | 硬编码 Daraz | Platform / Marketplace / Warehouse type / Tax template / FX 均配置化；本阶段 UI 与种子数据只启用 Daraz LK。 |

## 2. P0 能力（本 PR 落地原型）

### F22 · 海运柜次与库存状态

- **实体**：`ocean_shipments`（柜次头）+ `ocean_shipment_lines`（柜次行：SKU × 数量）。
- **柜次状态**：`in_transit`（在途）→ `customs_clearing`（清关中）→ `received_local`（已入本地仓）。
- **ETA**：ETA 港 / ETA 仓（Colombo WH）。
- **库存桶**（投影到 `inventory_balances` / 汇总页）：
  - `in_transit` 在途
  - `customs_clearing` 清关中（**新增**，不计入 available）
  - `available` 本地仓可用（= on_hand − reserved − qc_hold − damaged）
  - `damaged` 残次
- **仓类型**：`origin_pool`（如 XMN，Lazada） / `destination_local`（如 Colombo，Daraz）/ `3pl` / `supplier` — 可配置，不写死。
- **页面**：仓库中心 →「海运柜次」；详情可维护行与状态推进；汇总滚入库存汇总 KPI。

### F33 · 汇率配置

- **实体**：`fx_rates`：`platform`（或 marketplace）+ `base/quote` + `rate` + `effective_date` + `source`。
- 消费方保留 **原币 / 汇率 / 折算金额** 三元组；历史不覆盖（新行=新版本）。
- **页面**：设置 →「汇率」CRUD（已接 `trpc.fxRates.*`，2026-11-08）。

### F32 · 到仓成本按柜次版本

- 成本计算器（既有 FCL/LCL/空运 + PAL/CESS/VAT/SSCL 瀑布）结果可 **保存为 `sku_costs` 版本**。
- 版本键：`variant/SKU` + **`container_lot_id`（柜次）** + `version_no`；含税模板快照。
- 税模板可配置（本阶段种子：LK PAL/CESS/VAT/SSCL 级联）。
- **页面**：成本计算工作台「保存为柜次成本版本」；成本页可按 SKU 列出版本。

## 3. P1 页面意图（可用壳 + 公式/mock）

| ID | 页面 | 意图 |
| --- | --- | --- |
| F20 | 动销率 | 7/30/90 天；**新品满 7 天进分母**；按 SKU/店铺。 |
| F21 | 滞销 / 断货预警 | 滞销=90 天零动销；断货；**可售天数含在途 ETA**（本地可用 + 在途/清关按 ETA 折算）。 |
| F30 | 差评/退货归因看板 | 按 SKU；五类原因；下钻 stub。 |
| F31 | HS + SLSI | HS 查询；SLSI 强制认证清单导入；命中则**阻断建档**。 |
| F28 | 客服工作台 | **只读**多店消息收件箱；不可发送；注明每店 token/auth。 |

## 4. P2 明确推迟（仅文档/stub）

以下 **不实现**（超出 stub/注释）：

- 平台评论/优惠券 **抓取**（Q36）
- 优惠券运营自动化（Q38）
- 未确认的外部数据源/合规库接口（Q44）

控制台可留「P2 · 待 Q36/Q38/Q44」提示条，无爬虫、无真实发券。

## 5. 非功能约束

- 中文控制台；侧栏 IA 基本稳定，新项挂入既有分组（仓库 / 报表 / 财务 / 设置 / 客服）。
- ~~**无 tRPC / 无真实 DB 读写**；`createDemoStore` + localStorage 即可~~（本 PR 当时边界；**2026-11-08** 已接 tRPC，`createDemoStore` 已删）。
- `commerce-schema.ts` 仅轻量对齐列/表，不做 75 表全量迁移。

## 6. 导航落点

| 能力 | 分组 | 路由 |
| --- | --- | --- |
| F22 海运柜次 | 仓库中心 | `/console/ocean-containers` |
| F33 汇率 | 设置 | `/settings/fx-rates` |
| F32 成本版本 | 成本财务（成本页/工作台） | `/console/costs` + workbench 保存 |
| F20 动销率 | 报表 | `/console/reports/sell-through` |
| F21 滞销断货 | 报表 | `/console/reports/stock-risk` |
| F30 归因看板 | 报表 | `/console/reports/attribution` |
| F31 HS+SLSI | 商品中心 | `/console/compliance-hs-slsi` |
| F28 客服收件箱 | 售后中心（只读） | `/console/cs-inbox` |

## 7. 官方 API 能力指针

业务侧关于「店铺授权 API 之后能拉哪些字段 / 客服能否发消息 / 有没有券接口」的**证据文档**（勿猜测）见：

- 索引与 Q38/Q43/Q44 总表：[`docs/design/platform-apis/README.md`](../../../../docs/design/platform-apis/README.md)
- Daraz（优先）：[`docs/design/platform-apis/daraz.md`](../../../../docs/design/platform-apis/daraz.md)

**编号对照**：本文 §4 P2 的 Q36/Q38/Q44（评论抓取 / 券运营 / 外部合规源）≠ 上述调研的 **Q38=IM、Q43=字段、Q44=券 API**。F28 只读与 Daraz IM path「官方未说明 / 未找到」一致。

