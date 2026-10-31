# TikTok Shop Open API — 授权后店铺可访问能力

> 检索日期：**2026-10-31**（Asia/Shanghai）  
> 官方门户：https://partner.tiktokshop.com/

## 1. Official portal links

| 资源 | URL |
| --- | --- |
| TikTok Shop Partner Center | https://partner.tiktokshop.com/ |
| 文档（docv2） | https://partner.tiktokshop.com/docv2/ |
| Promotion API overview（本轮成功抓取正文） | https://partner.tiktokshop.com/docv2/page/promotion-api-overview |
| Customer Service / Send Message 等 | 文档树有对应 page；匿名 WebFetch 常返回 SPA 壳 |

另：developers.tiktok.com 偏登录/内容 API，**店铺卖家履约以 Partner Center 为准**。

## 2. Auth & shop binding

| 项 | 官方模型（Partner Center 公开描述） |
| --- | --- |
| 应用 | Partner 创建 App，申请 scopes |
| 卖家授权 | OAuth；授权后调用需 **shop 级凭证**（文档常用 `shop_cipher` / access token 组合，以当前文档为准） |
| 粒度 | **按店铺**；多店铺分别授权 |
| 区域 | US / SE Asia / UK 等市场规则与 API 可用性可能不同（文档按 market 标注） |

> 精确 token 字段与 refresh：本轮多数 Auth 页为 SPA → **细节「实现前登录 Partner Center 终核」**；不在此猜测。

## 3. Capability matrix

| 域 | 读 | 写 | 官方线索 | 备注 |
| --- | --- | --- | --- | --- |
| Products | ✅ | ✅ | Product APIs（Partner 文档分区） | 登录后核对 |
| Orders | ✅ | 部分履约 | Order APIs | 同上 |
| Fulfillment / logistics | ✅ | ✅ | Fulfillment APIs | 同上 |
| Finance | ✅ | — | Finance / settlements 分区 | 同上 |
| Customer service | ⚠️ 文档树有 | ⚠️ 有 Send Message 页 | Customer Service API overview / Send Message | **公开正文未抓到 → path 级「官方未说明 / 未找到」** |
| Promotion | ✅ | ✅（折扣/秒杀） | Create/Search/Get/Update/Deactivate Activity 等 | 见 §6 |
| Coupon / Voucher | ✅ 查 | ❌ 创建 | Search Coupons / Get Coupons；**不可用 OpenAPI 创建** | 官方 overview 原文 |
| Reviews | ⚠️ | — | **本轮未找到**独立公开 Review 拉取说明 | — |

## 4. Q43 — 字段级表（摘要）

| 域 | 可获取（文档承诺的能力级） | 不可获取或未文档化 | 需人工导入 |
| --- | --- | --- | --- |
| Orders / Products / Fulfillment / Finance | Partner API 覆盖的标准电商对象 | 未申请到的 scope 下字段 | 头程、成本、认证 |
| Coupons | 已有活动的 Search/Get | **创建字段 N/A（禁止 OpenAPI 创建）** | Seller Center 建券 |
| CS 消息 | 文档暗示有 CS API | **字段表本轮未找到** | — |
| Reviews | **未找到** | — | 人工/其他渠道 |

## 5. Q38 — Messaging

| 问题 | 结论 |
| --- | --- |
| 是否有 Customer Service API？ | Partner Center 文档树存在 **Customer Service API** 与 **Send Message** 页面。 |
| 读/发 path 与字段？ | 本轮 WebFetch 未返回可用正文（SPA/登录墙）→ **「官方未说明 / 未找到」（公开可引用级）**。 |
| 工程建议 | 持 Partner 账号打开文档，摘录官方 path 后再写入 connector；在此之前不在 open-shop 承诺 TikTok 客服读写。 |

## 6. Q44 — Vouchers / Coupons

来源：https://partner.tiktokshop.com/docv2/page/promotion-api-overview （2026-10-31 正文）：

> You can use coupon activities in the US, or seller voucher activities in other districts… **You cannot set this up using OpenAPI**, but you can search for and get the details of the existing coupon activities.

| 能力 | 结论 | API（overview 列出） |
| --- | --- | --- |
| 创建 Product Discount / Flash Deal | ✅ | Create / Search / Get / Update / Deactivate Activity；Update/Remove Activity Product |
| 创建 Coupon / Seller Voucher | ❌ | 官方明确 **不能**用 OpenAPI 创建 |
| 查询已有 Coupon | ✅ | Search Coupons；Get Coupons |

## 7. Gaps vs open-shop

- 券：**与业务「自动发券」冲突** — OpenAPI 不能创建 coupon/voucher。  
- 客服：有文档入口但公开细节不足 → 同 Daraz，先不承诺。  
- 促销折扣/秒杀 API 可用于部分运营，不能替代券。

## 8. Sources

| URL | Retrieved |
| --- | --- |
| https://partner.tiktokshop.com/ | 2026-10-31 |
| https://partner.tiktokshop.com/docv2/page/promotion-api-overview | 2026-10-31 |
| https://partner.tiktokshop.com/docv2/page/customer-service-api-overview | 2026-10-31（几乎无正文） |
| https://partner.tiktokshop.com/docv2/page/send-message-202606 | 2026-10-31（SPA 壳） |

**未找到**：CS 读写 path/字段表、完整 scope 枚举、Review API、Finance 字段级样例（公开匿名）。
