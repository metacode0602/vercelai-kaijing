# Daraz Open Platform — 授权后店铺可访问能力

> 检索日期：**2026-10-31**（Asia/Shanghai）  
> 证据规则：只引用官方门户 / 阿里开发者中心官方文档；公开页读不到的标 **「官方未说明 / 未找到」**。  
> 业务编号：**Q38** 客服 IM · **Q43** 字段 · **Q44** 券。

## 1. Official portal links

| 资源 | URL | 备注 |
| --- | --- | --- |
| Daraz Open Platform | https://open.daraz.com/ | 卖家应用 / API 文档入口（前端多为 SPA，无 JS 时 WebFetch 常为空壳） |
| Daraz 授权说明（阿里开发者中心·官方） | https://developer.alibaba.com/docs/doc.htm?articleId=121263&docType=1&treeId=754 | 「Daraz Open Platform」Seller authorization；含各国 auth/API host |
| API 名映射（Lazada→新名，含 Daraz 共用协议） | https://developer.alibaba.com/docs/doc.htm?articleId=118555&docType=1&treeId=405 | 列出 REST path（如 `/orders/get`） |
| Lazada Open Platform（同 Lazop 家族对照） | https://open.lazada.com/ | IM / Voucher 等完整 path 多在此公开 |

**与 Lazada 关系（官方事实）**

- Daraz 与 Lazada 使用同一套 **Lazop** 签名协议（`app_key` / `timestamp` / `sign` HMAC-SHA256 / `access_token`）及相近 REST path。  
- **国家 host 不同**：Daraz 站点使用 `api.daraz.*`，不是 `api.lazada.*`。  
- **不得**仅因 Lazada 有某 API 就断言 Daraz LK 已开通同一 path；须 Daraz 门户列出、或联调/`api.daraz.lk` 实测。本文对 IM/券采用「导航有 / path 未找到」分级。

## 2. Auth & shop binding

### 2.1 模型

| 项 | 官方说明 | 来源 |
| --- | --- | --- |
| 协议 | OAuth 2.0「code → token」 | Daraz Seller authorization intro |
| 授权 URL 形态 | `https://api.daraz.<tld>/oauth/authorize?response_type=code&force_auth=true&redirect_uri=...&client_id=<app_key>` | 同上 |
| 换 token | `/auth/token/create`（参数 `code`） | 与 Lazada 同 path 名；Daraz 文档同族 |
| 刷新 | `/auth/token/refresh`（参数 `refresh_token`） | 同上 |
| Token 粒度 | **按卖家授权**得到 `access_token` / `refresh_token`；响应含 `country`、`country_user_info[].seller_id` | Lazada 官方 token 样例结构；Daraz 授权文同流程 |
| Scope | 授权页展示应用权限列表；**细粒度 scope 名称表在公开 Daraz 页「官方未说明 / 未找到」** | — |
| 有效期 | Lazada 文档：Online App access ≈ 30 天，refresh ≈ 180 天；Test 更短。**Daraz 数值是否完全一致「官方未说明 / 未找到」**（流程相同） | Lazada Seller authorization |

### 2.2 Daraz 国家 API / Auth Host（官方表）

来源：https://developer.alibaba.com/docs/doc.htm?articleId=121263&docType=1&treeId=754 （2026-10-31 检索）

| 站点 | API host | Auth 相关 |
| --- | --- | --- |
| Sri Lanka (LK) | `https://api.daraz.lk/rest` | Authorize：`https://api.daraz.lk/oauth/authorize` |
| Pakistan | `https://api.daraz.pk/rest` | 对应 `api.daraz.pk` |
| Bangladesh | `https://api.daraz.com.bd/rest` | 对应域 |
| Myanmar | `https://api.shop.com.mm/rest` | 注意品牌域不同 |
| Nepal | `https://api.daraz.com.np/rest` | — |

**区域差异**：每个国家独立 seller 账号与 **独立授权**；LK 店铺 token **不能**直接当 MY Lazada token 用（host + 账号体系分离）。Cross-border 行为以各国 Seller Center / Open Platform 为准；公开文未把 Daraz LK 并入 Lazada CB 六站。

### 2.3 调用约定（协议族）

公共查询参数（Lazop）：`app_key`、`timestamp`、`access_token`、`sign_method=sha256`、`sign`。  
业务 path 示例：`GET https://api.daraz.lk/rest/orders/get?...`

## 3. Capability matrix

图例：✅ 有官方 path/名称 · ⚠️ 门户导航有、公开 endpoint 正文未找到 · ❌ 公开资料表明无 / 不可 · **「未找到」** = 本轮未在官方可读页确认

| 域 | 读 | 写 | API 名称 / path（证据） | 备注 |
| --- | --- | --- | --- | --- |
| Auth | ✅ | — | `/auth/token/create`, `/auth/token/refresh` | 官方授权文 |
| Orders | ✅ | 部分履约相关（见映射） | `/orders/get`, `/order/get`, `/order/items/get`；另有 document/pack/ready_to_ship 等名在映射表 | API 名映射文档 |
| Products / listings | ✅ | ✅（创建/更新类） | `/products/get`, `/product/item/get`, `/product/create`, `/product/update`, `/product/price_quantity/update` 等 | 映射文档；以 App 审核权限为准 |
| Inventory / 可售量 | ✅/写 | ✅ | 常通过 `/product/price_quantity/update` 与商品接口；**独立「库存中心」API 名「官方未说明 / 未找到」** | — |
| Logistics / tracking | ✅ | ✅（交运类） | `/shipment/providers/get`；订单履约相关 `SetStatusTo*` / pack 等（映射表） | tracking 号字段以 order/shipment 响应为准 |
| Settlements / finance | ✅ | — | `/finance/transaction/details/get`, `/finance/payout/status/get` | 映射文档 |
| Reviews / ratings | ⚠️ | — | Daraz 导航是否含 Review：**公开完整 path「官方未说明 / 未找到」**；Lazada 侧有 Product Review 能力需对照 open.lazada.com | 评论抓取设计另文 |
| Customer service / IM | ⚠️ | ⚠️ | 门户导航：**Instant Messaging API**；**Daraz path 列表「官方未说明 / 未找到」** | 见 §5 Q38 |
| Vouchers / coupons | ⚠️ | ⚠️ | 门户导航：**Seller Voucher API**；**Daraz path「官方未说明 / 未找到」** | 见 §6 Q44 |
| Webhooks / Push | ⚠️ | — | Lazada 有推送配置；**Daraz 推送完整说明「官方未说明 / 未找到」** | — |

## 4. Q43 — 字段级表

说明：下列「可获取」= 官方 API 名存在且响应面向该域；**具体 JSON 字段以各 API 在线文档 / SDK 样例为准**。公开映射文档主要给 **API 名**，不总是展开每个字段 → 未在官方样例出现的标第三列。

### 4.1 Orders

| 可获取（官方 API 覆盖） | 不可获取或未文档化 | 需人工导入（open-shop / 业务侧） |
| --- | --- | --- |
| 订单列表与详情：`/orders/get`, `/order/get` | 平台未暴露的内部风控分、客服私聊全文（若无 IM） | 柜次 / 清关状态、本地仓位 |
| 订单行：`/order/items/get`（SKU、数量、状态等） | 买家完整身份证/敏感支付卡号（通常不开放） | 头程运费分摊、采购成本 |
| 订单状态流转相关 SetStatus / 面单类 API（映射表有名） | LK 特有税明细是否在 order payload：**官方未说明 / 未找到** | PAL/CESS/VAT 落地成本 |

### 4.2 Products / listings

| 可获取 | 不可获取或未文档化 | 需人工导入 |
| --- | --- | --- |
| 商品列表/详情：`/products/get`, `/product/item/get` | 竞品数据、平台流量分 | HS 码、SLSI 认证、供应商 |
| 价格与可售量更新：`/product/price_quantity/update` | 推荐位质量分算法 | 中文品名、采购链接 |
| 创建/更新：`/product/create`, `/product/update` | — | 类目人工映射表 |

### 4.3 Inventory

| 可获取 | 不可获取或未文档化 | 需人工导入 |
| --- | --- | --- |
| 店铺前台可售量（经商品/price_quantity 接口） | **多物理仓 / 在途 / 清关桶** 的平台侧库存视图：**官方未说明 / 未找到** | F22 柜次在途、清关中、残次 |
| — | WMS 级批次/效期 | open-shop `inventory_balances` |

### 4.4 Logistics / tracking

| 可获取 | 不可获取或未文档化 | 需人工导入 |
| --- | --- | --- |
| 物流商列表：`/shipment/providers/get` | 末端小哥实时 GPS | 海运柜 ETA、船司 |
| 订单交运 / 面单相关 API（映射表） | — | 头程轨迹（非 Daraz last-mile） |
| 追踪号：通常在订单/包裹接口字段中 — **字段名以在线文档为准；本轮未抓到完整字段表则对「全量轨迹节点」标未找到** | 完整轨迹节点数组是否开放：**部分「官方未说明 / 未找到」** | — |

### 4.5 Settlements / finance

| 可获取 | 不可获取或未文档化 | 需人工导入 |
| --- | --- | --- |
| 交易明细：`/finance/transaction/details/get` | 银行内部清算流水 | 公司账套科目 |
| 打款状态：`/finance/payout/status/get` | — | 汇率版本（F33）、柜次成本（F32） |

### 4.6 Reviews / ratings

| 可获取 | 不可获取或未文档化 | 需人工导入 |
| --- | --- | --- |
| **Daraz 专用 Review API path：官方未说明 / 未找到**（本轮） | 全量历史评论文本、图片 CDN 长期链接策略 | 人工导出 / 合规允许的抓取兜底（见 comment-scraping 设计） |
| 若联调确认与 Lazada Review 同 path — **须另开证据，本文不假设** | 买家联系方式 | — |

## 5. Q38 — Customer service / IM

| 问题 | 结论 | 证据 |
| --- | --- | --- |
| 授权后能否 **读** 买家消息？ | **Daraz：官方未说明 / 未找到（无公开 path 正文）**。门户导航存在 **Instant Messaging API** 分区（open.daraz.com 文档树），但本轮无法抓取 session/message list 的 path 与字段。 | open.daraz.com（导航）；无可用的 Daraz IM 参考页 URL 正文 |
| 授权后能否 **发** 消息？ | **同上：官方未说明 / 未找到**。不得承诺 F28 可发送。 | 同上 |
| 同协议族对照（非 Daraz 承诺） | Lazada 官方文档含 `/im/session/list`、`/im/message/list`（读）、`/im/message/send`（发）等 | 见 [lazada.md](lazada.md)；open.lazada.com |
| open-shop 建议 | P0 **F28 只读 stub** 与「未找到」一致；若要做发送，须：① Daraz 控制台文档截图/联调返回码 ② 或官方补齐 path | UED F28 |

## 6. Q44 — Vouchers / coupons

| 问题 | 结论 | 证据 |
| --- | --- | --- |
| 是否有官方 **创建 / 发行** 券 API？ | **Daraz path：官方未说明 / 未找到**。导航有 **Seller Voucher API**。 | open.daraz.com 导航 |
| 是否有 **查询 / 停用**？ | 同左；Lazada 对照有 `/promotion/voucher/get|create|activate|deactivate|…` | [lazada.md](lazada.md) |
| 是否有 **核销 redeem** OpenAPI？ | **官方未说明 / 未找到**（卖家券一般为买家下单自动占用，未必有独立 redeem API） | — |
| open-shop 建议 | P2 优惠券自动化 **不可**依赖未证实的 Daraz OpenAPI；Seller Center 人工或等官方确认 | — |

## 7. Gaps vs open-shop Daraz LK 需求

| 需求（UED / ERP） | API 侧现状 |
| --- | --- |
| F28 多店客服收件箱 | 无公开 Daraz IM path → 只读/mock；发送阻断 |
| F22 柜次在途/清关库存 | 平台 API **不覆盖** 头程柜次 → 必须自建 |
| F32/F33 柜次成本与汇率 | finance API ≠ 成本版本；自建 |
| 评论分析 | Daraz Review path 未找到 → API 优先策略对 Daraz 需降级或人工 |
| 发券运营（业务 Q44） | Daraz voucher path 未找到 → 不可做自动发券 |
| 字段同步（业务 Q43） | 订单/商品/财务可拉；仓内/成本/认证类人工 |

## 8. Sources

| URL | 用途 | Retrieved |
| --- | --- | --- |
| https://open.daraz.com/ | 门户；IM / Seller Voucher 导航存在性 | 2026-10-31 |
| https://developer.alibaba.com/docs/doc.htm?articleId=121263&docType=1&treeId=754 | Daraz 授权、各国 host | 2026-10-31 |
| https://developer.alibaba.com/docs/doc.htm?articleId=118555&docType=1&treeId=405 | API 名 / path 映射 | 2026-10-31 |
| https://open.lazada.com/ | 同族 IM/Voucher 对照（**非** Daraz 本身） | 2026-10-31 |
| https://developer.alibaba.com/docs/doc.htm?articleId=108260&docType=1&treeId=499 | Lazada OAuth 细节（流程对照） | 2026-10-31 |

**本轮明确未找到（Daraz 专用）**

- Instant Messaging 各 path 与请求/响应字段表  
- Seller Voucher 各 path 与是否支持 create  
- Product Review 完整 path  
- Webhook/Push 订阅字段表  
- OAuth scope 枚举清单与 token 精确秒数（Daraz 专用）
