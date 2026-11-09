# Lazada 促销、客服 IM 与评价 API

> 核验日期：2026-11-05。来源：Lazada 官方 API Reference：
> Flexicombo `cid=25`、Seller Voucher `cid=30`、Free Shipping `cid=31`、
> Early Bird `cid=69`、Store Flash Sale `cid=70`、Instant Messaging `cid=29`、Product Review `cid=33`。
> 官方入口：<https://open.lazada.com/doc/api.htm>
> 通用签名、host、分页约定见 `lazada-common-conventions.md`。

## 1. 促销接口清单

### 1.1 Flexicombo（cid=25，9 个）

| 接口 | 方法 | 路径 | 用途 |
|---|---|---|---|
| CreateFlexiCombo | POST | `/promotion/flexicombo/create` | 创建多件多折/满减 |
| UpdateFlexiCombo | POST | `/promotion/flexicombo/update` | 更新 |
| ActivateFlexiCombo | POST | `/promotion/flexicombo/activate` | 启用 |
| DeactivateFlexiCombo | POST | `/promotion/flexicombo/deactivate` | 停用 |
| GetFlexiComboDetails | GET | `/promotion/flexicombo/details` | 详情 |
| ListFlexiCombo | GET | `/promotion/flexicombo/list` | 列表 |
| AddFlexiComboProducts | POST | `/promotion/flexicombo/products/add` | 加商品 |
| DeleteFlexiComboProducts | POST | `/promotion/flexicombo/products/delete` | 移除商品 |
| ListFlexiComboProducts | GET | `/promotion/flexicombo/products/list` | 商品列表 |

### 1.2 Seller Voucher（cid=30，9 个）

| 接口 | 方法 | 路径 | 用途 |
|---|---|---|---|
| SellerVoucherCreate | POST | `/promotion/voucher/create` | 创建优惠券 |
| SellerVoucherUpdate | POST | `/promotion/voucher/update` | 更新 |
| SellerVoucherActivate | POST | `/promotion/voucher/activate` | 启用 |
| SellerVoucherDeactivate | POST | `/promotion/voucher/deactivate` | 停用 |
| SellerVoucherDetailQuery | GET | `/promotion/voucher/get` | 详情 |
| SellerVoucherList | GET | `/promotion/vouchers/get` | 列表 |
| SellerVoucherAddSelectedProductSKU | POST | `/promotion/voucher/product/sku/add` | 加 SKU |
| SellerVoucheDeleteSelectedProductSKU | POST | `/promotion/voucher/product/sku/remove` | 移除 SKU |
| SellerVoucherSelectedProductList | GET | `/promotion/voucher/products/get` | 商品列表 |

### 1.3 Free Shipping（cid=31，11 个）

| 接口 | 方法 | 路径 | 用途 |
|---|---|---|---|
| FreeShippingCreate | POST | `/promotion/freeshipping/create` | 创建包邮 |
| FreeShippingUpdate | POST | `/promotion/freeshipping/update` | 更新 |
| FreeShippingActivate | POST | `/promotion/freeshipping/activate` | 启用 |
| FreeShippingDeactivate | POST | `/promotion/freeshipping/deactivate` | 停用 |
| FreeShippingGet | GET | `/promotion/freeshipping/get` | 详情 |
| FreeShippingList | GET | `/promotion/freeshippings/get` | 列表 |
| FreeShippingDeliveryOptionsQuery | GET | `/promotion/freeshipping/deliveryoptions/get` | 可选配送方式 |
| FreeShippingRegionsQuery | GET | `/promotion/freeshipping/regions/get` | 可选区域 |
| FreeShippingAddSelectedProductSKU | POST | `/promotion/freeshipping/product/sku/add` | 加 SKU |
| FreeShippingDeleteSelectedProductSKU | POST | `/promotion/freeshipping/product/sku/remove` | 移除 SKU |
| FreeShippingSelectedProductList | GET | `/promotion/freeshipping/products/get` | 商品列表 |

### 1.4 Early Bird（cid=69，4 个）

| 接口 | 方法 | 路径 | 用途 |
|---|---|---|---|
| CreateEarlyBirdActivityV2 | POST | `/activity/early/bird/create/v2` | 创建早鸟活动 |
| EarlyBirdActivityAddSkusV2 | POST | `/activity/early/bird/addSkus/v2` | 加 SKU |
| EarlyBirdActivityDeactivateSkusV2 | POST | `/activity/early/bird/deactivateSkus/v2` | 停用 SKU |
| EarlyBirdActivityIsWhitelistSeller | POST | `/activity/early/bird/isWhitelistSeller` | 是否白名单卖家 |

### 1.5 Store Flash Sale（cid=70，6 个）

| 接口 | 方法 | 路径 | 用途 |
|---|---|---|---|
| CreateStoreFlashSale | POST | `/promotion/storeflashsale/create` | 创建店铺闪购 |
| UpdateStoreFlashSale | POST | `/promotion/storeflashsale/update` | 更新 |
| ActivateStoreFlashSale | POST | `/promotion/storeflashsale/activate` | 启用 |
| DeactivateStoreFlashSale | POST | `/promotion/storeflashsale/deactivate` | 停用 |
| getStoreFlashSale | GET | `/promotion/storeflashsale/get` | 详情 |
| ListStoreFlashSale | GET | `/promotion/storeflashsale/list` | 列表 |

## 2. 促销关键字段

### 2.1 Flexicombo — CreateFlexiCombo

| 字段 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| apply | String | 是 | 适用范围 | `ENTIRE_STORE` / `SPECIFIC_PRODUCTS` |
| name | String | 是 | 活动名 | |
| start_time / end_time | Number | 是 | 起止时间 | 毫秒 |
| criteria_type | String | 是 | 条件类型 | `AMOUNT` / `QUANTITY` |
| criteria_value | String[] | 是 | 条件值 | 与 `discount_value` 对应 |
| order_numbers | Number | 是 | 可用订单数 | |
| discount_type | String | 是 | 优惠类型 | `money` / `discount` / `freeGift` / `freeSample` / 组合类型 |
| discount_value | String[] | 是 | 优惠值 | |
| stackable | String | 否 | 是否可叠加 | `true`/`false` 字符串 |
| sample_skus[] | Object[] | 否 | 赠品/样品 | `productId`、`skuId` |
| gift_skus[] | Object[] | 否 | 赠品 | `productId`、`skuId` |
| gift_buy_limit_value | String[] | 否 | 赠品限购 | |
| platform_channel | String | 否 | 渠道 | 默认 `1` |

### 2.2 Voucher — SellerVoucherCreate

| 字段 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| voucher_name | String | 是 | 券名 | |
| voucher_type | String | 是 | 券类型 | 固定 `COLLECTIBLE_VOUCHER` |
| apply | String | 是 | 适用范围 | `ENTIRE_SHOP` / `SPECIFIC_PRODUCTS` |
| display_area | String | 是 | 展示渠道 | `REGULAR_CHANNEL` / `STORE_FOLLOWER` / `OFFLINE` / `LIVE_STREAM` / `CEM_SELLER` |
| period_start_time / period_end_time | Number | 是 | 可用起止 | 毫秒 |
| collect_start | Number | 否 | 可领取时间 | 毫秒 |
| voucher_discount_type | String | 是 | 优惠类型 | `MONEY_VALUE_OFF` / `PERCENTAGE_DISCOUNT_OFF` |
| criteria_over_money | String | 是 | 门槛金额 | |
| offering_money_value_off | String | 条件 | 固定金额优惠 | `MONEY_VALUE_OFF` 时用 |
| offering_percentage_discount_off | Number | 条件 | 百分比优惠 | `PERCENTAGE_DISCOUNT_OFF` 时用 |
| max_discount_offering_money_value | String | 否 | 百分比券最高优惠 | 仅百分比类型 |
| limit | Number | 是 | 每人限领 | |
| issued | Number | 是 | 发行量 | 更新时需大于当前值 |

> 注意范围枚举差异：Voucher 用 `ENTIRE_SHOP`，Flexicombo 用 `ENTIRE_STORE`。

### 2.3 Free Shipping — FreeShippingCreate

| 字段 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| promotion_name | String | 是 | 活动名 | |
| apply | String | 是 | 适用范围 | `ENTIRE_SHOP` / `SPECIFIC_PRODUCTS` / `CAMPAIGN_PRODUCTS` |
| period_type | String | 是 | 周期类型 | `LONG_TERM` / `SPECIAL_PERIOD` |
| period_start_time / period_end_time | Number | 条件 | 起止 | `SPECIAL_PERIOD` |
| budget_type | String | 是 | 预算类型 | `UNLIMITED_BUDGET` / `LIMITED_BUDGET` |
| budget_value | String | 条件 | 预算金额 | `LIMITED_BUDGET` |
| region_type | String | 是 | 区域类型 | `ALL_REGIONS` / `SPECIAL_REGIONS` |
| region_value | String[] | 条件 | 区域 | 来自 regions 接口 |
| delivery_option | String | 是 | 配送方式 | 来自 delivery options 接口，如 `STANDARD` |
| deal_criteria | String | 是 | 包邮门槛 | `MONEY_VALUE_FROM_X` / `ITEM_QUANTITY_FROM_X` / `NO_CONDITION` |
| discount_type | String | 是 | 补贴类型 | `FULL_SUBSIDY` / `PARTIAL_SUBSIDY` |
| tiers[].filter | String | 是 | 门槛值 | |
| tiers[].result | String | 条件 | 补贴值 | `PARTIAL_SUBSIDY` |
| template_type | String | 否 | 模板类型 | `MANUALLY` / `CAMPAIGN` / `TEMPLATE` |
| template_code / category_name / campaign_tag | String | 条件 | 模板/类目/活动 | |

### 2.4 Store Flash Sale — CreateStoreFlashSale

| 字段 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| period_start_time / period_end_time | String | 是 | 起止时间，毫秒字符串 |
| sku_model_list[].item_id | Number | 是 | 商品 ID |
| ...sku_id | Number | 是 | SKU ID |
| ...sku_quantity | Number | 是 | 活动库存 |
| ...price | String | 是 | 活动价，标准货币单位 |

- 闪购价是标准货币单位，不是 cent。
- 活动库存独立于商品可售库存；超卖由平台校验。

### 2.5 Early Bird — CreateEarlyBirdActivityV2

| 字段 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| sku_list[].product_id | Number | 是 | 商品 ID |
| ...sku_id | Number | 是 | SKU ID |
| ...order_total_budget | Number | 是 | 活动库存/预算 |
| ...discount_price | String | 是 | 折扣价 |
| name | String | 否 | 活动名 |
| source | String | 否 | 来源，OPEN API 填 `OPENAPI` |

- 先调 `EarlyBirdActivityIsWhitelistSeller` 确认资格。

## 3. Instant Messaging（cid=29，7 个）

### 3.1 接口

| 接口 | 方法 | 路径 | 用途 |
|---|---|---|---|
| GetSessionList | GET | `/im/session/list` | 会话列表（游标） |
| GetSessionDetail | GET | `/im/session/get` | 会话详情 |
| GetMessages | GET | `/im/message/list` | 消息列表（游标） |
| SendMessage | POST | `/im/message/send` | 发消息 |
| MessageRecall | GET/POST | `/im/message/recall` | 撤回消息 |
| OpenSession | GET/POST | `/im/session/open` | 打开会话 |
| ReadSession | POST | `/im/session/read` | 标记已读 |

### 3.2 GetSessionList

| 字段 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| start_time | String | 是 | 下一页起点 | 首页传当前毫秒时间戳；后续传 `next_start_time` |
| last_session_id | String | 否 | 上一页最后会话 | 翻页必须回传 |
| page_size | String | 是 | 每页数量 | |

响应：

| 字段 | 类型 | 含义 |
|---|---|---|
| data.has_more | Boolean | 是否还有下一页 |
| data.next_start_time | Number | 下一页 `start_time` |
| data.last_session_id | String | 下一页 `last_session_id` |
| data.session_list[].session_id | String | 会话 ID |
| ...buyer_id | Number | 买家 ID |
| ...title | String | 买家昵称 |
| ...summary | String | 最后消息摘要 |
| ...unread_count | Number | 未读数 |
| ...last_message_time | Number | 最后消息时间（毫秒） |
| ...last_message_id | String | 最后消息 ID |
| ...self_position / to_position | String | 双方已读位置 |
| ...head_url | String | 头像 |
| ...site_id | String | 站点 |
| ...tags | String[] | 标签 |

### 3.3 GetMessages

请求：`session_id`、`start_time`、`last_message_id`、`page_size`。

响应 `data.message_list[]`：

| 字段 | 类型 | 含义 |
|---|---|---|
| message_id | String | 消息 ID |
| session_id | String | 会话 ID |
| from_account_type / to_account_type | Number | `1` 买家，`2` 卖家 |
| from_account_id / to_account_id | String | 账号 ID |
| template_id | Number | 消息模板 |
| type | Number | `1` 用户发送，`2` 系统发送 |
| content | String | 模板卡片 JSON |
| send_time | Number | 毫秒 |
| status | Number | `0` 正常，`1` 已撤回 |
| process_msg | String | 安全拦截提示；非空表示仅卖家可见 |
| auto_reply | Boolean | 是否自动回复 |
| site_id | String | 站点 |

`template_id`：

| 值 | 类型 |
|---|---|
| 1 | 文本 |
| 3 | 图片 |
| 4 | 表情 |
| 6 | 视频（3s–180s） |
| 10006 | 商品卡片 |
| 10007 | 订单卡片 |
| 10008 | 优惠券卡片 |
| 10010 | 邀请关注店铺 |

### 3.4 SendMessage

| 字段 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| session_id | String | 是 | 会话 ID |
| template_id | String | 是 | 模板 ID |
| txt | String | 条件 | 文本消息 |
| img_url | String | 条件 | 图片 URL |
| width / height | Number | 条件 | 图片/视频尺寸 |
| item_id | String | 条件 | 商品卡片 |
| order_id | String | 条件 | 订单卡片 |
| promotion_id | String | 条件 | 优惠券卡片 |
| video_id | String | 条件 | 视频 ID |

- `process_msg` 非空表示消息被安全策略拦截，必须展示给卖家。
- 消息分页用 `next_start_time` + `last_message_id` 双游标，不要用页码。

## 4. Product Review（cid=33，3 个）

| 接口 | 方法 | 路径 | 用途 |
|---|---|---|---|
| GetHistoryReviewIdList | GET/POST | `/review/seller/history/list` | 按商品/时间查评价 ID |
| GetReviewListByIdList | GET | `/review/seller/list/v2` | 按 ID 批量查评价 |
| SubmitSellerReply | GET | `/review/seller/reply/add` | 卖家回复 |

### 4.1 GetHistoryReviewIdList

| 字段 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| item_id | String | 是 | 商品 ID | |
| order_id | Number | 否 | 订单 ID | |
| start_time | Number | 是 | 开始时间 | 毫秒；与 `create_time` 一致 |
| end_time | Number | 是 | 结束时间 | 毫秒；**时间范围不能超过 7 天** |
| current | Number | 是 | 页码 | 从 1 开始，最大 50 |

响应：`data.id_list[]`、`data.current`、`data.total`、`data.page_size`。

### 4.2 GetReviewListByIdList

请求：`id_list`（Number[]，必填，**最多 10 个**）。

响应字段以实际接口为准，核心包括评价 ID、商品、评分、内容、图片、时间、卖家回复。

### 4.3 SubmitSellerReply

| 字段 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| id | Number | 是 | 评价 ID | 来自 list 接口 |
| content | String | 是 | 回复内容 | 纯文本，最大 500 字符 |

- 回复只能文本；不能带图片/HTML。
- 回复前先查评价是否存在、是否已回复。

## 5. 促销落库建议

| 平台实体 | 建议表 | 键 |
|---|---|---|
| Voucher | `promotions` + `promotion_rules` | `shop_id + promotion_id` |
| Free Shipping | `promotions` | `shop_id + promotion_id` |
| Flexicombo | `promotions` | `shop_id + promotion_id` |
| Flash Sale | `promotions` + `promotion_items` | `shop_id + promotion_id + sku_id` |
| Early Bird | `promotions` + `promotion_items` | 同上 |
| 促销商品 | `promotion_items` | `promotion_id + item_id + sku_id` |
| IM 会话 | `im_sessions` | `shop_id + session_id` |
| IM 消息 | `im_messages` | `session_id + message_id` |
| 评价 | `product_reviews` | `shop_id + review_id` |
| 评价回复 | `review_replies` | `review_id` |

## 6. 官方来源

| 资源 | URL |
|---|---|
| Flexicombo | <https://open.lazada.com/handler/share/apidoc/getApiCategory.json?cid=25&language=en> |
| Seller Voucher | <https://open.lazada.com/handler/share/apidoc/getApiCategory.json?cid=30&language=en> |
| Free Shipping | <https://open.lazada.com/handler/share/apidoc/getApiCategory.json?cid=31&language=en> |
| Early Bird | <https://open.lazada.com/handler/share/apidoc/getApiCategory.json?cid=69&language=en> |
| Store Flash Sale | <https://open.lazada.com/handler/share/apidoc/getApiCategory.json?cid=70&language=en> |
| Instant Messaging | <https://open.lazada.com/handler/share/apidoc/getApiCategory.json?cid=29&language=en> |
| Product Review | <https://open.lazada.com/handler/share/apidoc/getApiCategory.json?cid=33&language=en> |
