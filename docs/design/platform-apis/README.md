# 平台官方 Open API 能力调研（授权后店铺可访问范围）

> 状态：**证据基线**（只引用官方开发者门户 / 官方镜像文档；不猜测）  
> 检索日期：**2026-10-31**（Asia/Shanghai）；Lazada 分域文档补充核验：**2026-11-05**
> 分支用途：回答业务 Q38（客服/IM）、Q43（字段级可拉范围）、Q44（券/优惠券 API），并作为 connector 设计依据。  
> 编号说明：本文 **Q38 = 客服收发消息**、**Q43 = 字段可获取性**、**Q44 = 券接口**（与 `daraz-lk-erp-p0-ued.md` 中旧编号 Q36/Q38/Q44 含义不同，后者见该文 P2 段）。

## 1. 怎么读

| 文件 | 内容 |
| --- | --- |
| [daraz/daraz.md](daraz/daraz.md) | **优先**：Daraz Open Platform（LK 等）及与 Lazada Lazop 家族关系 |
| [daraz/daraz-common-conventions.md](daraz/daraz-common-conventions.md) | Daraz 通用约定：host、OAuth、签名、分页、错误码、安全 |
| [daraz/daraz-products-api.md](daraz/daraz-products-api.md) | 商品域 16 个接口的字段、请求/响应与使用方法 |
| [daraz/daraz-orders-api.md](daraz/daraz-orders-api.md) | 订单域 8 个接口的字段、状态枚举与同步方法 |
| [daraz/daraz-logistics-api.md](daraz/daraz-logistics-api.md) | 履约（pack/RTS/面单/轨迹）与 EPIS 物流接口 |
| [daraz/daraz-aftersales-api.md](daraz/daraz-aftersales-api.md) | 逆向单、退款、退货、卖家取消接口 |
| [daraz/daraz-finance-api.md](daraz/daraz-finance-api.md) | 结算单与交易明细字段、对账方法 |
| [daraz/daraz-advertising-api.md](daraz/daraz-advertising-api.md) | 官方无广告 API 的核验结论与手工导入模型 |
| [daraz/daraz-order-status-erp-mapping.md](daraz/daraz-order-status-erp-mapping.md) | 订单状态→ERP 锁库/释放/扣减节点的设计建议 |
| [daraz/daraz-erp-schema-coverage.md](daraz/daraz-erp-schema-coverage.md) | 现有 schema 对六大数据域的覆盖评估与补表清单 |
| [lazada/lazada.md](lazada/lazada.md) | Lazada Open Platform（六站）总览 |
| [lazada/lazada-common-conventions.md](lazada/lazada-common-conventions.md) | Lazada 通用约定：host、Auth、签名、分页、错误码 |
| [lazada/lazada-auth-seller-api.md](lazada/lazada-auth-seller-api.md) | Lazada 授权、token 刷新与卖家信息字段 |
| [lazada/lazada-products-api.md](lazada/lazada-products-api.md) | 商品域 28 个接口、类目属性、多仓库存与写接口 |
| [lazada/lazada-orders-api.md](lazada/lazada-orders-api.md) | 订单域 8 个接口、状态枚举与同步方法 |
| [lazada/lazada-logistics-api.md](lazada/lazada-logistics-api.md) | 履约、物流、EPIS、Logistics Station 接口 |
| [lazada/lazada-aftersales-api.md](lazada/lazada-aftersales-api.md) | 逆向单、退款、退货、QC 与库存回补 |
| [lazada/lazada-finance-api.md](lazada/lazada-finance-api.md) | 结算单、账户流水、交易明细、物流费对账 |
| [lazada/lazada-advertising-api.md](lazada/lazada-advertising-api.md) | Sponsored Solutions 38 个接口与 SMAX |
| [lazada/lazada-promotion-im-review-api.md](lazada/lazada-promotion-im-review-api.md) | Voucher、包邮、闪购、IM、评价接口 |
| [lazada/lazada-order-status-erp-mapping.md](lazada/lazada-order-status-erp-mapping.md) | Lazada 状态→ERP 锁库/扣减/释放/回补建议 |
| [lazada/lazada-erp-schema-coverage.md](lazada/lazada-erp-schema-coverage.md) | 现有 schema 覆盖度与缺口、建议新增表 |
| [lazada/lazada-daraz-unified-design.md](lazada/lazada-daraz-unified-design.md) | Daraz + Lazada 统一表、状态机与实施阶段 |
| [shopee.md](shopee.md) | Shopee Open Platform v2 |
| [tiktok-shop.md](tiktok-shop.md) | TikTok Shop Partner Center / Open API |
| [others.md](others.md) | Temu / SHEIN：是否存在官方公开卖家 API |

早期平台总览文结构（Daraz/Lazada 分域文档按域组织，不强制此结构）：

1. 官方门户链接  
2. Auth & 店铺绑定  
3. 能力矩阵（域 → 读/写 / API 名 / 备注）  
4. Q43 字段表（可获取 / 不可获取或未文档化 / 需人工导入）  
5. Q38 消息  
6. Q44 券  
7. 相对 open-shop Daraz LK 需求的缺口  
8. Sources（URL + 检索日）

**标记约定**

- 凡写「可 / 有」：必须附官方 URL 或官方文档中的 API path / 名称。  
- 公开页抓不到、登录墙、SPA 空壳：标 **「官方未说明 / 未找到」**，不得用第三方博客填空当结论。  
- Lazada 与 Daraz 同属 Lazop 协议族时：在 Daraz 文中单独区分「Daraz 门户已列出导航」vs「仅 Lazada 门户有完整 path 文档」。

## 2. Q38 / Q43 / Q44 总览（按平台）

| 平台 | Q38 客服 IM 读 | Q38 客服 IM 发 | Q44 券 create/issue | Q43 订单/商品/库存/物流/财务/评价（摘要） |
| --- | --- | --- | --- | --- |
| **Daraz** | 门户导航有 Instant Messaging API；**Daraz 站点可读的 endpoint 明细「官方未说明 / 未找到」** | 同上；**不可据此断言 LK 可发** | 门户导航有 Seller Voucher API；**endpoint 明细「官方未说明 / 未找到」** | 订单/商品/财务/运力等 path 有官方 API 名映射（见 daraz.md）；评价字段级「部分未找到」 |
| **Lazada** | 有：`/im/message/list` 等 | 有：`/im/message/send` 等 | 有：`/promotion/voucher/create` 等完整卖家券 CRUD | 订单/商品/库存/物流/财务文档完整；评价见 Product Review 相关 API |
| **Shopee** | 有：`v2.sellerchat.get_message` 等 | 有：`v2.sellerchat.send_message` 等 | 有：`v2.voucher.*`（含 add；CS App 类型权限列表含 get_voucher_list） | 订单/商品/物流/支付/退货等 v2 API 齐全 |
| **TikTok Shop** | Partner Center 有 Customer Service API 分区；公开 fetch 多页为空壳，**读消息明细需登录后核对** | 文档树存在 Send Message 页；**公开 fetch 未拿到 path 正文 → 标未找到细节** | **不可用 OpenAPI 创建 coupon/voucher**；仅 Search/Get Coupons（官方 Promotion overview） | Product / Order / Fulfillment / Finance 等需 Partner Center 登录后对照；公开页多为 SPA |
| **Temu / SHEIN** | 见 [others.md](others.md)：存在官方 Partner/Developer 门户，细则需账号 | 同左 | 同左 | 非「无官方文档」；但本轮未登录抓全量 path |

## 3. Daraz 一句话答案（业务直读）

- **Q38**：Daraz 开放平台文档导航包含 Instant Messaging；**公开可抓的 Daraz endpoint 列表未找到**。同协议族 Lazada 官方有读/发消息 API。**在未拿到 Daraz/LK 正式 path 或联调确认前，不得承诺客服可发消息**；P0 F28 只读策略与「官方未说明」一致。  
- **Q43**：授权后可走 Lazop：`/orders/get`、`/order/get`、`/order/items/get`、`/products/get`、`/product/item/get`、`/finance/transaction/details/get`、`/finance/payout/status/get`、`/shipment/providers/get` 及部分商品写接口（官方 API 名映射文档）。**字段级以各 Get 响应为准**；客户隐私字段、完整评价原始文本、本地仓成本等 **未在公开映射中列出的 → 需人工导入或标未文档化**。  
- **Q44**：导航有 Seller Voucher；**Daraz 公开 voucher path 未找到**。Lazada 有完整 `/promotion/voucher/*`。**不得假设 Daraz LK 已开通发券 OpenAPI**。

## 4. 相关仓库文档

- Connector 实现草案：[`../marketplace-connectors.md`](../marketplace-connectors.md)  
- Daraz LK ERP UED（F28 只读客服）：[`../../../apps/shop/content/design/daraz-lk-erp-p0-ued.md`](../../../apps/shop/content/design/daraz-lk-erp-p0-ued.md)
- 评论抓取设计（API 优先）：[`../comment-scraping-and-report-design.md`](../comment-scraping-and-report-design.md)
