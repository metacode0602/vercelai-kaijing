# Shop Console · 站内 ERP 已完成 vs 平台 OpenAPI 缺口

> 模块16（`feat/shop-console-real-data-final`）收口说明。  
> **Seed 是演示/联调数据，不是 mock 主路径**；生产页面读 tRPC → dataaccess → PostgreSQL。

## 站内 ERP 已完成（本栈 44–52 + 本 PR）

| 能力 | 入口 / 表 | 说明 |
| --- | --- | --- |
| SPU/SKU 主档 | `products.*` / products, product_variants | CRUD + 列表 |
| 商品+刊登列表 | `products.listCatalog` | SKU 聚合 listings |
| 刊登 / 映射 | listings / mappings | 本地记录；平台同步 stub |
| 采购→收货→质检→入库 | purchase / WMS | 过账流水 |
| 订单→占库→拣货→出库 | order / wms | 销售履约 |
| LGS/JSB 履约壳 | logistics | 站内状态机 |
| 费用模板 | feeTemplates | 解析试算 |
| 海运柜次 / 在途 / 清关 | ocean | 余额列 + 过账 |
| WMS 仓库/库位/余额/非订单出库/调整 | wms | 禁止无流水改余额 |
| 供应商 + 供应商货号价目 | suppliers | 商品详情供应商子表读此 |
| 订单异常 | orderExceptions | 按真实订单/拣货生成 |
| 同步任务 | sync | 请求记录；平台调用 stub |
| 结算 / 成本 / 利润 / 运费估算 | finance | 按行汇总，不写死税费 |
| Dashboard KPI / 趋势 / 角标 | dashboard | 缺数据为 0 |
| 候选审核 / 站内信 | candidates / notifications | 不外发 |
| 评论列表 / 手工回复 | reviews | 平台回复 OpenAPI stub |
| 承运商 / 品类 / 字典 / 导入模板 | carriers 等 | 轻量主数据 |
| 待审队列 | pending | 确认/拒绝站内状态 |
| 箱规主数据 | cartonSpecs / commerce_carton_specs | 独立于 ocean_shipment_boxes |
| 动销 / 滞销断货报表 | reports.* | orders + balances；无假图 |

## 仍需真实平台凭证 / OpenAPI 联调

| 能力 | 现状 | 需要 |
| --- | --- | --- |
| 店铺 OAuth 授权与刷新 | 连接状态可存库；无真实换票 | Daraz/Lazada/TikTok 凭证与回调 |
| 订单拉取 / 增量同步 | sync 任务壳 + stub | 平台订单 OpenAPI |
| 库存推送平台 | pending `inventory_push` 仅站内确认 | 平台库存 API |
| 刊登创建 / 上下架推送 | listings 本地；`requestPlatformSyncStub` | 平台商品/刊登 API |
| 价格同步 | pending `price_change` | 平台改价 API |
| 结算单拉取 | settlements 可手工/种子 | 平台财务/结算 API |
| 评论抓取与官方回复 | 列表读库；回复 stub | 评论 OpenAPI 或合规抓取 |
| 物流轨迹回传 | shipments 壳 | LGS/承运商轨迹 API |
| 售后平台工单闭环 | 站内售后流水（#43 未合） | 平台 reverse/refund API |

## 明确不是 mock 主路径的本地能力

- **成本测算工作台**：允许本地试算（可继续读预设做表单草稿）；落库以 `sku_costs` / 柜次版本为准。
- **封面图会话编辑**：`product-image-store` 本地会话，不冒充 CDN 主档。
- **废弃 demo store 文件**：`*-store.ts` / `erp-ued-data.ts` / `mock-data.ts` 可留档，但 **生产 console 页面不得 import**（本 PR 已清主路径）。

## 箱规 vs 海运装箱

- `commerce_carton_specs`：运输包装**主数据**（长宽高/毛重/每箱件数）。
- `ocean_shipment_boxes`：某柜次的**装箱行**（箱号/铅封/CBM）。
- 二者不合并；柜次可按 `code` 引用箱规，但不复用同一张表。

## 报表口径（本 PR）

- **动销率**：区间销量（`order_lines.qty`，`orders.placedAt`）÷ 期末可用库存；无日快照时用期末可用近似平均库存；新品未满 7 天不计 7 日分母。
- **滞销**：90 天销量 = 0 且可用 > 0（排除新品 14 天）。
- **断货风险**：日均销(30d)>0 且本地可售天 = 可用/日均销 < 7；含在途可售天 = (可用+在途+清关)/日均销。
