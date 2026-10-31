# Lazada Open Platform — 授权后店铺可访问能力

> 检索日期：**2026-10-31**（Asia/Shanghai）  
> 官方门户：https://open.lazada.com/  
> 业务编号对齐：Q38 客服 · Q43 字段 · Q44 券

## 1. Official portal links

| 资源 | URL |
| --- | --- |
| Lazada Open Platform | https://open.lazada.com/ |
| Seller authorization（OAuth） | https://developer.alibaba.com/docs/doc.htm?articleId=108260&docType=1&treeId=499 |
| API 名映射 | https://developer.alibaba.com/docs/doc.htm?articleId=118555&docType=1&treeId=405 |
| Auth 中心（六站） | `https://auth.lazada.com/oauth/authorize` · token 网关常用 `https://api.lazada.com/rest` |

站点 REST 示例（官方文档/SDK 常用）：`api.lazada.sg` / `.com.my` / `.co.th` / `.vn` / `.co.id` / `.com.ph` 等。

## 2. Auth & shop binding

| 项 | 官方说明 |
| --- | --- |
| 模式 | OAuth2 code → `/auth/token/create`；刷新 `/auth/token/refresh` |
| 授权 URL | `https://auth.lazada.com/oauth/authorize?response_type=code&force_auth=true&redirect_uri=...&client_id=<appkey>` |
| 国家参数 | `country=sg,my,th,vn,ph,id,cb`（可选，限制下拉） |
| Crossborder | 选 Crossborder，用 MY 卖家账密授权一次 → token 可用于六站；`country_user_info` 含多国 `seller_id` |
| Token | `access_token` + `refresh_token`；Online：access ≈ 30 天，refresh ≈ 180 天；Test 更短 |
| 绑定粒度 | **每个卖家授权一次应用**；CB 一次多站；本地卖家按站点账号 |
| Scopes | 授权页列出应用申请的权限；细表以控制台 App 权限为准 |

来源：Seller authorization introduction（上表 URL），2026-10-31。

## 3. Capability matrix

| 域 | 读 | 写 | API 名称 / path（官方或官方映射） | 备注 |
| --- | --- | --- | --- | --- |
| Orders | ✅ | ✅（履约状态） | `/orders/get`, `/order/get`, `/order/items/get`；SetStatusToPacked/ReadyToShip 等 | 映射文档 |
| Products | ✅ | ✅ | `/products/get`, `/product/item/get`, `/product/create`, `/product/update`, `/product/price_quantity/update` | 同上 |
| Inventory | ✅ | ✅ | 经 price_quantity / 商品接口 | 无独立 WMS |
| Logistics | ✅ | ✅ | `/shipment/providers/get` + 交运/面单类 | 同上 |
| Finance | ✅ | — | `/finance/transaction/details/get`, `/finance/payout/status/get` | 同上 |
| Reviews | ✅（有 Product Review 能力文档分区） | 有限 | 以 open.lazada.com 当前 Review API 名为准；实现前再打开控制台核对 | 见 comment-scraping 设计 |
| IM / CS | ✅ | ✅ | `/im/session/list`, `/im/message/list`, `/im/message/send` 等（open.lazada.com Instant Messaging） | **Q38 明确可读写**（Lazada） |
| Voucher | ✅ | ✅ | `/promotion/voucher/get`, `/promotion/voucher/create`, activate/deactivate 等 | **Q44 有官方创建** |
| Auth | ✅ | — | `/auth/token/create`, `/auth/token/refresh` | — |

> 注：部分 IM/Voucher 明细页在无登录 SPA 下 WebFetch 不完整；path 名称亦见于社区维护的官方 SDK 镜像与历史开放文档。**上线前以 open.lazada.com 登录后的 API Reference 终核。**

## 4. Q43 — 字段级表（摘要）

### Orders / Products / Finance / Logistics

与 [daraz.md](daraz.md) §4 同协议字段族；Lazada 六站文档更完整。可获取：订单头/行、商品属性与价格库存、交易与打款、物流商与交运结果。

| 可获取 | 不可获取或未文档化 | 需人工导入 |
| --- | --- | --- |
| 订单、行、买家物流地址字段（以 Get 响应为准） | 平台内部排名分 | 公司成本、头程 |
| 商品、SKU、图片、类目属性 | 其他卖家商品 | 供应商与 HS |
| finance transaction / payout | 银行卡全号 | 内部账套 |
| shipment providers + 面单 | 骑手实时位置 | 自有仓操作 |

### Reviews

| 可获取 | 未文档化 / 限制 | 人工 |
| --- | --- | --- |
| Product Review 相关拉取（以当前官方名为准） | 速率、历史窗口、是否含图 | 导出补洞 |

## 5. Q38 — Messaging

| 能力 | 结论 | API |
| --- | --- | --- |
| 列会话 | ✅ | `/im/session/list`（及官方列出的 session 类） |
| 读消息 | ✅ | `/im/message/list` |
| 发消息 | ✅ | `/im/message/send` |
| 前提 | App 须具备 IM 权限并通过审核；卖家完成授权 | open.lazada.com |

**相对 Daraz**：Lazada 公开文档对 IM **明确**；不可自动外推到 `api.daraz.lk`。

## 6. Q44 — Vouchers

| 能力 | 结论 | API（Lazada Promotion / Seller Voucher） |
| --- | --- | --- |
| 查询 | ✅ | `/promotion/voucher/get` 等 |
| 创建 | ✅ | `/promotion/voucher/create` |
| 启用/停用 | ✅ | activate / deactivate 类 path |
| 核销 API | **官方未说明 / 未找到**独立 redeem；随订单优惠体现 | — |

## 7. Gaps vs open-shop

- Lazada 五站可接 IM 读写与卖家券 CRUD（权限齐全时）。  
- 与 Daraz LK **分池**：厦门共享仓模型仅适用于 Lazada 决策，不套用 Daraz。  
- 成本/柜次仍非平台 API 范围。

## 8. Sources

| URL | Retrieved |
| --- | --- |
| https://open.lazada.com/ | 2026-10-31 |
| https://developer.alibaba.com/docs/doc.htm?articleId=108260&docType=1&treeId=499 | 2026-10-31 |
| https://developer.alibaba.com/docs/doc.htm?articleId=118555&docType=1&treeId=405 | 2026-10-31 |
