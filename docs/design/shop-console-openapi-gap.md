# Shop Console · 站内 ERP 已完成 vs 平台 OpenAPI 缺口

> 模块16 收口 + **本轮 marketplace OpenAPI 读同步接线**。  
> **Seed 是演示/联调数据，不是 mock 主路径**；生产页面读 tRPC → dataaccess → PostgreSQL。  
> 平台 I/O 集中在 `apps/api` + `packages/marketplace`；Console 经内部鉴权触发，不本地造单/造轨迹。

## 站内 ERP 已完成

| 能力 | 入口 / 表 | 说明 |
| --- | --- | --- |
| SPU/SKU 主档 | `products.*` / products, product_variants | CRUD + 列表 |
| 商品+刊登列表 | `products.listCatalog` | SKU 聚合 listings |
| 刊登 / 映射 | listings / mappings | 本地记录 + **平台刊登读同步** + **发布/更新/下架写**（`resource=listing_write`，Daraz/Lazada connector） |
| 采购→收货→质检→入库 | purchase / WMS | 过账流水 |
| 订单→占库→拣货→出库 | order / wms | 销售履约；**映射确认后自动占库** |
| LGS/JSB 履约壳 | logistics | 站内状态机 + **平台轨迹拉取** |
| 费用模板 | feeTemplates | 解析试算 |
| 海运柜次 / 在途 / 清关 | ocean | 余额列 + 过账 |
| WMS 仓库/库位/余额/非订单出库/调整 | wms | 禁止无流水改余额 |
| 供应商 + 供应商货号价目 | suppliers | 商品详情供应商子表读此 |
| 订单异常 | orderExceptions | 占库失败/缺映射进异常队列 |
| 同步任务 | sync | **真实驱动 apps/api runs**；状态/进度/报错回写 |
| 结算 / 成本 / 利润 / 运费估算 | finance | **结算单/交易明细拉取 upsert** |
| Dashboard KPI / 趋势 / 角标 | dashboard | 缺数据为 0 |
| 候选审核 / 站内信 | candidates / notifications | 不外发 |
| 评论列表 / 手工回复 | reviews | **评论拉取**；平台回复仍 stub_queued |
| 承运商 / 品类 / 字典 / 导入模板 | carriers 等 | 轻量主数据 |
| 待审队列 | pending | 确认/拒绝；`listing_submit` 确认创建本地刊登 / 放行发布，`complete` 补全字段 |
| 箱规主数据 | cartonSpecs / commerce_carton_specs | 独立于 ocean_shipment_boxes |
| 动销 / 滞销断货报表 | reports.* | orders + balances；无假图 |

## 本轮已接通的平台读同步（需真实 integration_credentials）

| 能力 | OpenAPI / 适配器 | 入库 |
| --- | --- | --- |
| 订单 + 订单行（Daraz/Lazada） | `/orders/get` + `/order/items/get`（单位行 qty=1） | orders / order_lines / order_status_events |
| 订单 + 订单行（TikTok） | `/order/202309/orders/search` + `.../detail/query` | 同上；取消态自动释放未发货占库 |
| 刊登 / 商品（Daraz/Lazada） | `/products/get` | listings + pending seller_sku_mappings（不自动确认） |
| 刊登 / 商品（TikTok） | `/product/202309/products/search` | 同上（需 shop_cipher） |
| 物流轨迹（仅 Lazop） | `/logistic/order/trace` | shipments / tracking_events |
| 评论（仅 Lazop） | review seller history/list | product_reviews / media |
| 结算（仅 Lazop） | `/finance/payout/status/get` + `/finance/transaction/details/get` | settlements / settlement_lines；无 statement 的交易入 `__unassigned__` 桶并写 integration_logs，不假造 order FK |

无凭证：任务失败并写 integration_logs / sync_job_runs，**不显示成功**。  
OAuth 换票 / 回调本轮不实现；沿用库内加密凭证（授权由并行 agent / 设计文档负责，本 PR 不改）。  

### TikTok Shop 读同步边界（本轮）

| 能力 | 本轮 | 说明 |
| --- | --- | --- |
| 订单 + 行 | ✅ | `orders/search` + `orders/detail/query`（adapter 已有 path）；取消态触发自动释放未发货占库 |
| 刊登 / 商品 | ✅ | `products/search` + product get；需 `shop_cipher`（`shops.meta`） |
| 物流轨迹 | ❌ | Partner 文档有 Fulfillment 分区，但公开 path/字段本仓未收录可靠规格 → **不编造 getOrderTrace** |
| 评论 | ❌ | `docs/design/platform-apis/tiktok-shop.md`：**未找到**独立 Review API → 不接线 |
| 结算 | ❌ | Finance 分区存在但字段级样例公开匿名未找到 → **不编造 listSettlements path** |
| 售后列表 | ❌ | 站内手工/取消审核保留；禁止伪同步写演示逆向单 |

平台取消（未发货）：`maybeAutoReleaseCancelledOrder` 仅释放 `active` 占库、`qtyDelta=0` 不虚增 onHand；已发货走售后。

## 仍需后续联调 / 明确不在本轮

| 能力 | 现状 | 需要 |
| --- | --- | --- |
| 店铺 OAuth 授权与刷新 | 凭证表可存；无换票 UI/回调 | Daraz/Lazada/TikTok OAuth |
| 库存推送平台 | pending `inventory_push` 仅站内 | 平台库存写 API |
| 刊登写（TikTok） | adapter `createListing` payload 简化、未联调，本轮不调用 | TikTok 商品写 API 官方字段联调；**不编造字段** |
| 商品上架 activate | 上架仅本地状态（平台只公开 `/product/deactivate`） | 平台上架端点（若官方提供） |
| 价格同步 | pending `price_change` | 平台改价 API |
| 评论官方回复 | `stub_queued`，未发往平台 | 评论回复 OpenAPI |
| 售后平台工单闭环 | 站内售后流水 | 平台 reverse/refund API |
| 真实店铺联调验证 | 代码路径已接 | 生产店铺 token |

## 明确不是 mock 主路径的本地能力

- **成本测算工作台**：允许本地试算；落库以 `sku_costs` / 柜次版本为准。
- **封面图**：`product-image-store` 走 `POST /api/upload/image` 上传对象存储（OSS/S3/local），URI 落库，GET 代理读取（2026-11-08）。
- **废弃 demo store 文件**：可留档，生产 console 主路径不得 import。

## 环境

- `MARKETPLACE_API_BASE_URL` + `INTERNAL_SYNC_API_KEY`：shop → api 内部同步。
- `CRON_SECRET`：cron 触发。
- 迁移：`0021_commerce_marketplace_sync_settlements`（settlements cursor/state）。
