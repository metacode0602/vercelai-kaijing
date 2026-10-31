# Shopee Open Platform — 授权后店铺可访问能力

> 检索日期：**2026-10-31**（Asia/Shanghai）  
> 官方门户：https://open.shopee.com/

## 1. Official portal links

| 资源 | URL |
| --- | --- |
| Shopee Open Platform | https://open.shopee.com/ |
| 开发者文档（需登录看全量 API Reference） | open.shopee.com → Documentation |
| 官方 FAQ 镜像（Customer Service App 权限列表，指向官方原文） | 例：Shopee FAQ「API permission list for Customer Service App Type」（第三方镜像页声明来源为 Shopee Open Platform FAQ） |

> 本轮对 open.shopee.com 深度 API 页的匿名 WebFetch 多不完整；下列 API **名称**来自 Shopee 官方 FAQ 权限清单（v2）及 Open Platform 公开命名惯例。上线前必须在已登录的 open.shopee.com API Reference 终核 path 与参数。

## 2. Auth & shop binding

| 项 | 说明（Open Platform 公开模型） |
| --- | --- |
| 凭证 | `partner_id` + `partner_key`（应用级） |
| 店铺令牌 | 卖家授权后 `shop_id` + `access_token`；`v2.public.get_access_token` / `v2.public.refresh_access_token` |
| 粒度 | **按 shop**（及 merchant 主子账号模型，视区域） |
| 签名 | 对 path + timestamp + partner_id + … 做 HMAC-SHA256 |
| 区域 | 各站点 host 不同（SG/MY/TH/VN/PH/ID/TW/BR 等）；文档按 region 区分 |
| App 类型 | 权限随 App Type 变；**Customer Service** 类型有明确 API 白名单 |

## 3. Capability matrix

| 域 | 读 | 写 | API 名称（v2） | 备注 |
| --- | --- | --- | --- | --- |
| Shop | ✅ | — | `v2.shop.get_shop_info` | CS App 权限列表含 |
| Orders | ✅ | 部分 | `v2.order.get_order_list`, `get_order_detail`, `set_note`, `handle_buyer_cancellation` | 同上 |
| Products | ✅ | （完整卖家 App 另有写接口） | `v2.product.get_item_list`, `get_item_base_info`, `get_item_extra_info`, `get_model_list` | CS 类型偏读 |
| Logistics | ✅ | — | `v2.logistics.get_tracking_info`, `get_tracking_number` | — |
| Payment | ✅ | — | `v2.payment.get_escrow_detail` | — |
| Returns | ✅ | ✅ | `v2.returns.get_return_list`, `confirm`, `dispute`, … | — |
| Chat / CS | ✅ | ✅ | 见 §5 | **Q38 明确** |
| Voucher | ✅ | ✅（完整权限 App） | `v2.voucher.get_voucher_list`；另有 add/update 等（非 CS 精简列表全收录时需查 Reference） | **Q44** |
| Push | ✅ | 配置 | `v2.push.*` | — |

## 4. Q43 — 字段级表（摘要）

| 域 | 可获取 | 不可获取或未文档化 | 需人工导入 |
| --- | --- | --- | --- |
| Orders | 列表/详情标准字段、备注 | 平台隐藏处罚分 | 头程成本 |
| Products | item/model 基础与扩展信息 | 竞品 | 供应链字段 |
| Logistics | tracking number / tracking info | — | 头程 |
| Payment | escrow detail | — | 公司入账 |
| Chat | 消息内容（sellerchat） | — | — |
| Voucher | voucher list（及管理接口视权限） | 平台券（非卖家券）策略 | 营销日历 |

## 5. Q38 — Messaging（Seller Chat）

官方 FAQ「API permission list for Customer Service App Type」列出（v2），其中包括：

**读**

- `v2.sellerchat.get_message`
- `v2.sellerchat.get_conversation_list`
- `v2.sellerchat.get_one_conversation`
- `v2.sellerchat.get_unread_conversation_count`
- …

**写 / 操作**

- `v2.sellerchat.send_message`
- `v2.sellerchat.send_autoreply_message`
- `v2.sellerchat.read_conversation` / `unread_conversation`
- `v2.sellerchat.upload_image`
- mute/pin/delete conversation、offer 相关等

**结论**：**可以读且可以发**（在 App 类型与授权具备 Chat 权限时）。

## 6. Q44 — Vouchers

| 能力 | 结论 |
| --- | --- |
| 列表 | ✅ `v2.voucher.get_voucher_list`（CS App 权限清单含） |
| 创建 / 更新 | ✅ 存在 `v2.voucher` 管理类 API（完整列表以 open.shopee.com Voucher 文档为准；本轮匿名页未展开全部 path → 实现前终核） |
| 平台代发券 / redeem 专用 | 以官方 Voucher 文档为准；未在本轮 FAQ 清单展开的标 **「实现前核对 / 部分未找到」** |

## 7. Gaps vs open-shop Daraz LK

- Shopee 非当前 P0 站点，但 IM/券能力 **强于** 已证实的 Daraz 公开文档。  
- 若未来接 Shopee：可做读写客服与卖家券（权限齐时）；库存仍要自建多仓模型。

## 8. Sources

| URL / 来源 | Retrieved |
| --- | --- |
| https://open.shopee.com/ | 2026-10-31 |
| Shopee Open Platform FAQ — API permission list for Customer Service App Type（经声明源自官方的文档库页核对名称） | 2026-10-31 |

**未找到 / 须登录终核**：各 API 完整 query/body 字段表、全部区域 host 表、非 CS App 的 voucher add 精确 path 正文（匿名抓取）。
