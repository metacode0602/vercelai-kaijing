# Daraz Open Platform API 字段级文档（中文）

> 核验日期：2026-11-03。依据 Daraz 官方 API Reference 页面公开渲染内容整理。各接口有地区、应用权限、授权店铺及版本差异；“必填”严格按官方参数表填写。响应参数页通常不声明 required，故标为“官方未标”，不从响应示例推断。金额等接口声明为 String 的字段保留 String 类型。
>
> **2026-11-05 补充**：已按官方目录重新核验并拆分为分域文档（通用约定、商品、订单、物流、售后、财务、广告结论、状态映射、Schema 覆盖）。分域文档优先；本文保留为总览。索引见 [`../README.md`](../README.md)。官方目录当前无 Advertising 分类，本文广告字段不能视为官方 API 字段。
>
> 范围说明：用户提供的 Alibaba 文档链接当前显示 ICBU（阿里巴巴国际站）API，不是 Lazada/Daraz Seller API。本文件覆盖 Daraz 官方目录可核对的对象；不把 ICBU 接口并入 Daraz。

### 系统 API 标记说明

- **[系统必需]**：调用任何业务 API 的签名/鉴权基础设施参数，通常由 SDK/网关自动注入；不是业务对象字段。
- **[系统同步]**：适合支撑本地系统定时同步、分页水位或增量拉取的只读 API。
- **[系统动作]**：系统可以在明确业务规则及幂等保护下发起的写操作；需人工审批/审计。
- **[人工/运营]**：平台运营或人工操作接口，不建议后台无条件自动触发。
- **[系统可选]**：视店铺授权、区域、业务线而定。

此标记描述集成建议，不代表 Daraz 授权已开通，也不替代权限审查。

## 0. 通用调用参数

Daraz 文档对查询 API 通常列出以下公共参数；所有字段均为必填。

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| app_key | String | 是 | Daraz Open Platform 应用 ID | 在开放平台申请应用类别后取得 |
| timestamp | String | 是 | 请求时间戳 | 毫秒时间戳；示例说明与 UTC 时间差小于 7200 秒 |
| access_token | String | 是 | API 调用凭证 | 由店铺授权流程取得 |
| sign_method | String | 是 | 签名算法 | HMAC 签名算法标识 |
| sign | String | 是 | 请求签名 | 依官方签名规则由请求参数和应用密钥计算；不要把真实签名/密钥放入文档或 CSV |

本文所列业务参数不重复列公共参数。响应中的 `request_id`、`code` 等通用字段按各接口官方示例说明。

## 1. 商品

### 1.1 GetProducts — `GET /products/get` **[系统同步]**

用于按状态/时间/Seller SKU 分页获取商品。`limit` 最大 50；官方建议使用时间条件滚动查询，`offset` 已弃用且最大 10000。

**请求参数**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| filter | String | 是 | 商品状态过滤 | `all`、`live`、`inactive`、`deleted`、`image-missing`、`pending`、`rejected`、`sold-out` |
| update_before | String | 否 | 更新时间上界 | ISO 8601 日期时间；包含指定时刻之前/当时更新的商品 |
| create_before | String | 否 | 创建时间上界 | ISO 8601 |
| create_after | String | 否 | 创建时间下界 | ISO 8601 |
| update_after | String | 否 | 更新时间下界 | ISO 8601 |
| limit | String | 否 | 每页商品数 | 最大 50；接口以 String 接收 |
| options | String | 否 | 扩展库存信息开关 | 示例值 `1` 会附带 ReservedStock、RtsStock、PendingStock、RealTimeStock、FulfillmentBySellable 等库存信息 |
| sku_seller_list | String | 否 | Seller SKU 过滤列表 | 内容为 JSON 数组字符串；精确匹配；最多返回 100 个 SKU |
| offset | String | 否 | 跳过条数 | 已弃用；建议用时间条件滚动；最大 10000 |

**响应字段**（`data`）

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| total_products | Number | 否 | 商品总数 | 文档说明按 item 级计数 |
| products | Object[] | 否 | 商品列表 | 数组元素为商品对象 |
| products[].primary_category | Number | 否 | 主类目 ID | 商品类目 |
| products[].attributes | Object | 否 | 商品属性 | 属性键由类目决定，如 name、brand、description 等 |
| products[].skus | Object[] | 否 | SKU 列表 | 文档示例含 SKU 状态、库存、价格、图片、SellerSku 等；当前 schema 将内部结构定义为开放对象，见下表示例字段 |
| products[].item_id | Number | 否 | 商品 ID | 平台商品标识 |
| products[].created_time | String | 否 | 创建时间 | 示例为毫秒时间戳字符串 |
| products[].updated_time | String | 否 | 更新时间 | 示例为毫秒时间戳字符串 |
| products[].images | String[] | 否 | 商品图片 URL 列表 | 商品级图片 |
| products[].status | String | 否 | 商品状态 | 商品审核/销售状态 |

**SKU 示例中出现的字段**（官方输出示例；文档没有为每个 SKU 子字段给出 required 标记，因此统一记为“未标必填”）

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| Status | String | 未标 | SKU 状态 | 示例 `active` |
| quantity | Number | 未标 | 库存数量 | 可为 0 |
| product_weight | String | 未标 | 商品重量 | 示例字符串小数 |
| Images | String[] | 未标 | SKU 图片 | 空字符串也可能出现在数组中 |
| SellerSku | String | 未标 | 卖家 SKU | 商家定义 |
| ShopSku | String | 未标 | 店铺 SKU | 平台 SKU 标识 |
| Url | String | 未标 | 商品页面 URL | 站点 URL |
| package_width | String | 未标 | 包裹宽度 | 示例为小数文本 |
| package_height | String | 未标 | 包裹高度 | 示例为小数文本 |
| package_length | String | 未标 | 包裹长度 | 示例为小数文本 |
| package_weight | String | 未标 | 包裹重量 | 示例为小数文本 |
| special_price | Number | 未标 | 特价 | 示例数字 |
| special_from_time | String | 未标 | 特价开始时间 | 示例格式由接口返回 |
| special_to_time | String | 未标 | 特价结束时间 | 示例格式由接口返回 |
| special_to_date | String | 未标 | 特价结束日期 | 日期字符串 |
| price | Number | 未标 | 售价 | 示例数字 |
| Available | Number | 未标 | 可售库存 | 示例数字 |
| SkuId | Number | 未标 | 平台 SKU ID | 系统生成 |
| multiWarehouseInventories | Object[] | 未标 | 多仓库存 | 示例包含 `warehouseCode`、`quantity`；具体可用性受站点配置影响 |

### 1.2 GetProductItem — `GET /product/item/get` **[系统同步]**

通过 ItemId 或 SellerSku 获取单个商品。官方未要求二选一参数至少填写一个，但空值会报错。

**请求参数**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| item_id | Number | 否 | 商品 ID | 与 seller_sku 至少提供一个；无效 ID 返回 Item not exist |
| seller_sku | String | 否 | 卖家 SKU | 与 item_id 至少提供一个；找不到 SKU 返回 SKU not exist |

**响应字段**（`data`，文档标记对象必需；成员字段均标可选）

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| subStatus | String | 否 | 商品子状态 | 如 Lock、Reject、Live_Reject、Admin |
| suspendedSkus | Object[] | 否 | 暂停销售 SKU | 文档仅定义为对象数组，未展开成员字段 |
| variation | Object | 否 | 变体定义 | 变体对象可含 variation1 至 variation4 |
| variation*.name | String | 否 | 变体名称 | 示例 color_family、Size 等 |
| variation*.has_image | Boolean/String | 否 | 变体是否有图片 | 官方示例存在布尔/字符串混用，按原始响应处理 |
| variation*.customize | Boolean/String | 否 | 是否自定义属性 | 官方示例存在类型差异 |
| variation*.options | String[] | 否 | 变体选项 | 选项列表 |
| variation*.label | String | 否 | 变体标签 | 示例 color |
| primary_category | Number | 否 | 主类目 ID | 商品类目 |
| attributes | Object | 否 | 商品属性 | 类目属性键值对象 |
| skus | Object[] | 否 | SKU 列表 | 字段参见 GetProducts 的 SKU 示例表；以实际响应为准 |
| item_id | Number | 否 | 商品 ID | 平台标识 |
| created_time | String | 否 | 创建时间 | 示例为毫秒时间戳字符串 |
| updated_time | String | 否 | 更新时间 | 示例为毫秒时间戳字符串 |
| images | String | 否 | 商品图片列表 | 官方 schema 类型为 String，示例内容是 JSON 数组文本；不要擅自按数组解析而不兼容旧响应 |
| marketImages | String | 否 | 市场图片列表 | schema 为 String，示例为 JSON 数组文本 |
| status | String | 否 | 商品状态 | 示例描述含 Active、InActive、Pending QC、Suspended、Deleted |
| invisible | Object | 否 | 买家侧不可见信息 | 可能含 invisible 标志和 invisibleReasons；常见原因涉及 OVL/履约率 |

### 1.3 CreateProduct — `POST /product/create` **[系统动作/需审批]**

请求正文业务参数为 `payload`，XML 格式；单次创建一个商品。创建字段由类目决定，必须先查类目属性。官方详情可核对示例字段如下，**示例未声明 required，故不把示例中的字段误标成必填规则**。

**请求参数**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| payload | String（XML） | 是 | 商品创建 XML | 根节点 Request/Product；官方示例包含类目、属性、图片和 SKU |
| Product.PrimaryCategory | Number | 示例有 | 主类目 ID | 应使用平台类目树中的有效 ID |
| Product.SPUId | String | 示例有 | SPU ID | 示例为空；具体是否需要取决于类目/站点 |
| Product.AssociatedSku | String | 示例有 | 关联 SKU | 示例为空 |
| Product.Images.Image | String | 示例有 | 商品图片 URL | 可重复节点；图片必须满足平台规范 |
| Product.Attributes.name | String | 示例有 | 商品名称 | 属性节点；字段取决于类目 |
| Product.Attributes.short_description | String | 示例有 | 简短描述 | HTML/文本限制以类目规范为准 |
| Product.Attributes.brand | String | 示例有 | 品牌 | 需品牌授权/有效品牌值 |
| Product.Attributes.model | String | 示例有 | 型号 | 示例属性 |
| Product.Attributes.delivery_option_sof | String | 示例有 | 卖家自配送选项 | 示例备注：仅卖家履约商品设置 Yes |
| Product.Attributes.* | 类目定义 | 示例有 | 其他类目属性 | 如示例 `kid_years`；应读取 GetCategoryAttributes 获取类目 schema |
| Product.Skus.Sku.SellerSku | String | 示例有 | 卖家 SKU | 商家自定义 SKU |
| Product.Skus.Sku.* | 类目定义 | 示例有 | SKU 销售属性 | 示例 `color_family`、`size` |
| Product.Skus.Sku.quantity | Number | 示例有 | 库存数量 | 示例值 1 |
| Product.Skus.Sku.price | Number | 示例有 | 售价 | 示例值 388.50；价格精度受站点规则限制 |
| Product.Skus.Sku.package_length | Number | 示例有 | 包裹长度 | 示例单位依站点商品规范 |
| Product.Skus.Sku.package_height | Number | 示例有 | 包裹高度 | 同上 |
| Product.Skus.Sku.package_width | Number | 示例有 | 包裹宽度 | 同上 |
| Product.Skus.Sku.package_weight | Number | 示例有 | 包裹重量 | 同上 |
| Product.Skus.Sku.package_content | String | 示例有 | 包裹内容描述 | 示例为文本 |
| Product.Skus.Sku.Images.Image | String | 示例有 | SKU 图片 URL | 可重复节点 |

**响应参数**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| code | String | 是（响应示例） | 结果码 | `0` 表示成功 |
| data | Object | 否 | 响应数据 | 创建成功时返回商品和 SKU 标识 |
| data.item_id | Number | 否 | 商品 ID | 新商品平台 ID |
| data.sku_list | Object[] | 否 | SKU 标识列表 | 按输入 SKU 返回生成/确认的 ID |
| data.sku_list[].seller_sku | String | 否 | 卖家 SKU | 输入的商家 SKU |
| data.sku_list[].shop_sku | String | 否 | 店铺 SKU | 系统生成 |
| data.sku_list[].sku_id | Number | 否 | SKU ID | 系统生成 |
| request_id | String | 否 | 请求追踪 ID | 用于平台支持/日志排查 |

### 1.4 本次目录可见的其他商品接口（详情尚未逐个抓取）

官方类别目录还列出以下接口。本轮尚未逐个打开其 API Reference 详情；以下仅记录目录可见用途和系统集成标记，未虚构参数或响应字段：

| 接口 | 方法 | 用途摘要 |
|---|---|---|
| `/product/update` | POST | 更新商品属性或 SKU | **[系统动作/需审批]** |
| `/product/price_quantity/update` | POST | 更新价格和数量；最多 50，建议 20 | **[系统动作/需价格库存校验]** |
| `/product/deactivate` | GET/POST | 停用商品或 SKU | **[系统动作/高风险]** |
| `/product/remove` | POST | 删除商品/SKU；每次最多 50 SellerSku | **[人工/运营，高风险]** |
| `/category/brands/query` | GET | 分页获取品牌 | **[系统同步/可选]** |
| `/category/attributes/get` | GET | 获取类目属性 | **[系统元数据同步]** |
| `/category/tree/get` | GET/POST | 获取类目树 | **[系统元数据同步]** |
| `/product/qc/status/get` | GET | 查询商品质检/审核状态 | **[系统同步]** |
| `/image/upload`、`/image/migrate`、`/images/migrate`、`/image/response/get`、`/images/set` | 多种 | 上传/迁移/查询/设置图片；迁移接口有 JPG/PNG、单图 1MB，多图最多 8 张限制 | 查询接口 **[系统同步]**，上传/设置 **[系统动作]** |

## 2. 财务与结算

### 2.1 QueryTransactionDetails — `GET /finance/transaction/details/get` **[系统同步]**

查询指定时间范围内交易明细。结束时间减开始时间须小于 180 天；limit 最大 500。

**请求参数**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| offset | String | 否 | 起始偏移行数 | 跳过列表开头的交易行数 |
| trans_type | String | 否 | 交易类型 ID | 类型值需按平台定义；无效值可能报错 |
| trade_order_id | String | 否 | 订单 ID | 过滤订单 |
| limit | String | 否 | 返回交易行数 | 最大 500 |
| start_time | String | 是 | 开始日期 | 示例格式 `YYYY-MM-DD` |
| end_time | String | 是 | 结束日期 | 示例格式 `YYYY-MM-DD`；区间小于 180 天 |
| trade_order_line_id | String | 否 | 订单项 ID | 过滤子订单/订单行 |

**响应参数**（`data` 为 Object[]；字段均为 String 且 schema 未标必填）

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| fee_type | String | 否 | 费用/交易类型 ID | 官方描述 Transaction type ID |
| details | String | 否 | 交易详情 | 明细文本 |
| seller_sku | String | 否 | 卖家 SKU | 商品标识 |
| lazada_sku | String | 否 | Lazada SKU | 平台 SKU |
| amount | String | 否 | 交易总额 | 可能为负值；币种依站点/账单约定 |
| VAT_in_amount | String | 否 | 金额中的 VAT | 税额 |
| WHT_amount | String | 否 | WHT 金额 | 预扣税金额 |
| WHT_included_in_amount | String | 否 | WHT 是否已计入金额 | 示例 Yes |
| statement | String | 否 | 账单/结算单标识 | 示例为日期区间文本 |
| paid_status | String | 否 | 是否已支付 | 描述为 Yes / No |
| order_no | String | 否 | 订单 ID | 交易关联订单 |
| orderItem_no | String | 否 | 订单项编号 | 子订单标识 |
| orderItem_status | String | 否 | 订单项状态 | 平台订单行状态 |
| shipping_provider | String | 否 | 物流服务商 | 示例 LEX |
| shipping_speed | String | 否 | 配送速度 | 平台定义 |
| shipment_type | String | 否 | 发货类型 | 示例 Dropshipping |
| reference | String | 否 | 参考 ID | 文档说明为订单项 ID/子订单 ID |
| comment | String | 否 | 财务备注 | 区域财务团队备注 |
| payment_ref_id | String | 否 | 支付参考 ID | 银行或支付服务商参考号 |
| fee_name | String | 否 | 费用名称 | 费用类型显示名称 |
| transaction_date | String | 否 | 交易日期 | 示例 `17 May 2016` |
| transaction_type | String | 否 | 交易类型 | 或费用名称 |
| transaction_number | String | 否 | 交易唯一编号 | 格式示例 Seller code-xxxxxxx |

### 2.2 GetPayoutStatus — `GET /finance/payout/status/get` **[系统同步]**

按创建时间下界查询结算单/付款状态。

**请求参数**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| created_after | String | 是 | 结算单创建时间下界 | 示例 `2018-01-01` |

**响应参数**（`data` 为 Object[]；下列字段官方标为必填，原类型均为 String）

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| shipment_fee | String | 是 | 运费成本 | 费用金额 |
| subtotal2 | String | 是 | 小计 2 | subtotal1 减退款 |
| subtotal1 | String | 是 | 小计 1 | 商品收入与其他收入之和 |
| other_revenue_total | String | 是 | 其他收入合计 | 其他收入金额 |
| payout | String | 是 | 应付卖家金额 | 示例可能带币种文本，如 `0.00 PKR` |
| closing_balance | String | 是 | 期末余额 | 结算期末余额 |
| refunds | String | 是 | 退款合计 | 所有退款金额之和 |
| created_at | String | 是 | 创建时间 | 结算单创建时间 |
| item_revenue | String | 是 | 商品收入 | 商品产生收入 |
| shipment_fee_credit | String | 是 | 运费抵扣/补贴 | 如有 |
| fees_total | String | 是 | 费用合计 | 支付手续费与退货相关费用之和 |
| paid | String | 是 | 结算单付款状态 | `1` 已付款，`0` 未付款 |
| fees_on_refunds_total | String | 是 | 退款相关费用合计 | 已发出退款的累计费用 |
| guarantee_deposit | String | 是 | 保证金 | 保证金金额 |
| statement_number | String | 是 | 结算单编号 | 结算单唯一标识 |
| opening_balance | String | 是 | 期初余额 | 结算期初余额 |
| updated_at | String | 是 | 更新时间 | 结算单最近更新时间 |

## 3. 售后 / 逆向订单

### 3.1 GetReverseOrdersForSeller — `GET/POST /reverse/getreverseordersforseller` **[系统同步]**

按状态、订单号、时间范围等查询逆向订单。字段名大小写按官方文档原样保留。

**请求参数**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| ofc_status_list | String[] | 否 | OFC 状态筛选 | 字符串数组；示例 `RETURN_CANCELED` |
| reverse_order_id | Number | 否 | 逆向订单 ID | 指定逆向单 |
| trade_order_id | Number | 否 | 正向交易订单 ID | 原始订单 |
| page_size | Number | 是 | 每页条数 | 文档备注默认 10 |
| reverse_status_list | String[] | 否 | 逆向状态筛选 | 枚举数组；示例 `REQUEST_INITIATE` |
| page_no | Number | 是 | 页码 | 示例从 1 开始 |
| return_to_type | String | 否 | 退回目的地类型 | 文档列出 RTW（退回 Daraz 仓库） |
| dispute_in_progress | Boolean | 否 | 是否争议处理中 | true/false |
| TradeOrderLineCreatedTimeRangeStart | Number | 否 | 原订单行创建时间范围起点 | 毫秒时间戳 |
| TradeOrderLineCreatedTimeRangeEnd | Number | 否 | 原订单行创建时间范围终点 | 毫秒时间戳 |
| ReverseOrderLineTimeRangeStart | Number | 否 | 逆向订单行时间范围起点 | 毫秒时间戳 |
| ReverseOrderLineTimeRangeEnd | Number | 否 | 逆向订单行时间范围终点 | 毫秒时间戳 |
| ReverseOrderLineModifiedTimeRangeStart | Number | 否 | 逆向单修改时间起点 | 毫秒时间戳 |
| ReverseOrderLineModifiedTimeRangeEnd | Number | 否 | 逆向单修改时间终点 | 毫秒时间戳 |
| QC_Decision | String | 否 | 仓库质检决策 | 枚举：scrap、return_to_merchant、return_to_merchant_cb、return_to_customer、return_to_warehouse、not_returned |

**响应参数**（根对象 `result` 为必需）

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| result.total | Number | 是 | 总记录数 | 全部匹配数据量 |
| result.items | Object[] | 是 | 逆向订单列表 | 列表项见下方 |
| result.items[].reverse_order_id | Number | 否 | 逆向订单 ID | 逆向单标识 |
| result.items[].trade_order_id | Number | 否 | 原交易订单 ID | 正向订单标识 |
| result.items[].request_type | String | 否 | 售后申请类型 | CANCEL、RETURN、ONLY_REFUND |
| result.items[].is_rtm | Boolean | 否 | 是否退回商家 | 官方描述 true=RTM，false=RTW |
| result.items[].shipping_type | String | 否 | 物流类型 | 平台定义；示例 DEFAULT |
| result.page_no | Number | 是 | 当前页码 | 分页信息 |
| result.page_size | Number | 是 | 页大小 | 分页信息 |
| result.success | Boolean | 是 | 调用成功标志 | true/false |
| code | String | 示例有 | 通用结果码 | 成功示例为 `0` |
| request_id | String | 示例有 | 请求追踪 ID | 平台请求标识 |

### 3.2 GetReverseOrderDetail — `GET /order/reverse/return/detail/list` **[系统同步]**

**请求参数**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| reverse_order_id | Number | 是 | 逆向订单 ID | 官方描述显示示例 0 |

**响应参数**：`data` Object。响应成员字段在官方参数表没有逐项列 required；以下来自响应示例。

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---|---|---|
| data.reverse_order_id | String | 官方未标 | 逆向订单 ID | 示例字符串 |
| data.request_type | String | 官方未标 | 申请类型 | 示例 CANCEL |
| data.reverseOrderLineDTOList | Object[] | 官方未标 | 逆向订单行列表 | 子字段见下方 |
| reverseOrderLineDTOList[].platform_sku_id | String | 官方未标 | 平台 SKU ID | 商品 SKU 标识 |
| reverseOrderLineDTOList[].return_order_line_gmt_create | String | 官方未标 | 逆向行创建时间 | 示例毫秒字符串 |
| reverseOrderLineDTOList[].is_need_refund | String | 官方未标 | 是否需要退款 | 示例 true |
| reverseOrderLineDTOList[].trade_order_gmt_create | String | 官方未标 | 正向订单创建时间 | 示例毫秒字符串 |
| reverseOrderLineDTOList[].reason_text | String | 官方未标 | 原因文本 | 示例 Out of stock |
| reverseOrderLineDTOList[].item_unit_price | String | 官方未标 | 商品单价 | 示例 0 |
| reverseOrderLineDTOList[].return_order_line_gmt_modified | String | 官方未标 | 逆向行修改时间 | 示例毫秒字符串 |
| reverseOrderLineDTOList[].trade_order_line_id | String | 官方未标 | 正向订单行 ID | 订单项标识 |
| reverseOrderLineDTOList[].seller_sku_id | String | 官方未标 | 卖家 SKU ID | 示例 th-123 |
| reverseOrderLineDTOList[].ofc_status | String | 官方未标 | OFC 状态 | 示例 INITIAL |
| reverseOrderLineDTOList[].productDTO | Object | 官方未标 | 商品信息 | 示例包含 product_id、sku |
| productDTO.product_id | String | 官方未标 | 商品 ID | 示例字符串 0 |
| productDTO.sku | String | 官方未标 | SKU | 示例字符串 0 |
| reverseOrderLineDTOList[].refund_payment_method | String | 官方未标 | 退款方式 | 示例 Alipay |
| reverseOrderLineDTOList[].buyer | Object | 官方未标 | 买家信息 | 示例含 user_id |
| buyer.user_id | String | 官方未标 | 买家用户 ID | 示例字符串 0 |
| reverseOrderLineDTOList[].reason_code | String | 官方未标 | 原因代码 | 示例 123 |
| reverseOrderLineDTOList[].whqc_decision | String | 官方未标 | 仓库质检决定 | 示例 scrap |
| reverseOrderLineDTOList[].reverse_status | String | 官方未标 | 逆向状态 | 示例 REQUEST_INITIATE |
| reverseOrderLineDTOList[].refund_amount | String | 官方未标 | 退款金额 | 示例 0 |
| reverseOrderLineDTOList[].tracking_number | String | 官方未标 | 退货物流单号 | 示例 NLRSGZ10444515 |
| reverseOrderLineDTOList[].is_dispute | String | 官方未标 | 是否争议 | 示例 true |
| reverseOrderLineDTOList[].reverse_order_line_id | String | 官方未标 | 逆向订单行 ID | 逆向 item 标识 |
| data.shipping_type | String | 官方未标 | 物流类型 | 示例 PICK_UP |
| data.is_rtm | String | 官方未标 | 是否退回商家 | 示例 true |
| data.trade_order_id | String | 官方未标 | 原交易订单 ID | 正向订单标识 |

**错误码**：105 逆向订单 ID 为空/无效；106 ROC 内部错误；116 缺少 seller id；117 缺少 user id；118 缺少 user email。

### 3.3 GetReverseOrderHistoryList — `GET /order/reverse/return/history/list` **[系统同步]**

**请求参数**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| reverse_order_line_id | Number | 是 | 逆向订单行 ID | |
| page_size | Number | 否 | 每页条数 | 默认 10 |
| page_number | Number | 否 | 页码 | 默认 1 |

**响应参数**：`data` Object。官方响应参数表只声明空对象，示例字段如下。

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---|---|---|
| data.page_info | Object | 示例可见 | 分页信息 | |
| page_info.total | String | 示例可见 | 总记录数 | |
| page_info.page_size | String | 示例可见 | 页大小 | |
| page_info.current_page_number | String | 示例可见 | 当前页码 | |
| data.list | Object[] | 示例可见 | 沟通历史列表 | 示例条目有 time/operator/picture |
| list[].time | String | 示例可见 | 消息时间 | 时间戳 |
| list[].operator | String | 示例可见 | 操作人 | 示例 Jason |
| list[].picture | Object[] | 示例可见 | 图片附件 | 示例空数组，子项未展开 |

**错误码**：103 逆向订单行 ID 为空（查询拒绝原因时）；106 ROC 内部错误；116 缺少 seller id；117 缺少 user id；118 缺少 user email；120 page size 无效；121 page number 无效。

### 3.4 GetReverseOrderReasonList — `GET /order/reverse/reason/list` **[系统元数据同步]**

| 方向 | 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---|---:|---|---|
| 请求 | reverse_order_line_id | Number | 是 | 逆向订单行 ID | 用于获取拒绝/取消原因 |
| 响应 | data | Object[] | 官方未标 | 原因列表 | |
| 响应 | data[].muti_language_text | String | 示例可见 | 多语言原因文本 | 官方字段拼写为 muti_language_text |
| 响应 | data[].text | String | 示例可见 | 原因文本 | 示例 out of stock |
| 响应 | data[].reason_id | String | 示例可见 | 原因 ID | 示例 1000017 |

**错误码**：103、106、116、117、118、119（找不到可用 cancel reasons）。

### 3.5 InitReverseOrderCancel — `GET /order/reverse/cancel/create` **[系统动作/需审批]**

| 方向 | 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---|---:|---|---|
| 请求 | order_id | Number | 是 | 订单 ID | |
| 请求 | reason_id | String | 是 | 取消原因 ID | 应先查询原因列表 |
| 请求 | order_item_id_list | String[] | 是 | 要取消的订单项 ID 列表 | 官方类型为 String[] |
| 响应 | data.tip_content | String | 示例可见 | 提示内容 | 示例库存将设为 0 |
| 响应 | data.tip_type | String | 示例可见 | 提示类型 | 示例 error |

**错误码**：102 订单行 ID 为空/无效；104 reason 无效；106 ROC 内部错误；115 订单 ID 空；116/117/118 缺少 seller/user/email；122 交易订单无效；123 交易订单行无效；124 订单行不属于该 seller。

### 3.6 OrderCancelValidate — `GET /order/reverse/cancel/validate` **[系统预校验]**

| 方向 | 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---|---:|---|---|
| 请求 | order_item_id_list | String[] | 是 | 待校验的订单项 ID | |
| 请求 | order_id | String | 是 | 订单 ID | |
| 响应 | data.tip_content | String | 示例可见 | 校验提示 | 示例 stock will be set as 0 |
| 响应 | data.reason_options | Object[] | 示例可见 | 可选原因 | 子字段 reason_name、reason_id |
| 响应 | reason_options[].reason_name | String | 示例可见 | 原因名称 | 如 out of stock |
| 响应 | reason_options[].reason_id | String | 示例可见 | 原因 ID | 如 1000017 |
| 响应 | data.tip_type | String | 示例可见 | 提示级别 | 示例 warn |

**错误码**：102、106、115、116、117、118、122、123、124，含义同 InitReverseOrderCancel。

## 4. IM / 会话与消息

### 4.1 GetSessionList — `GET /im/session/list` **[系统同步]**

**请求参数**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| last_session_id | String | 否 | 上一页最后一个会话 ID | 首页可不传；翻页传上一页响应中的 last_session_id |
| start_time | String（Long） | 是 | 分页起始时间 | 首页传当前时间戳；后续页传上一页 next_start_time |
| page_size | String（Integer） | 是 | 每页数量 | 示例 20；字段声明为 String，业务类型为整数 |

**响应参数**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| err_code | String | 是 | 错误码 | `0` 表示成功 |
| data.session_list | Object[] | 是 | 会话列表 | 元素字段见下方 |
| session_list[].summary | String | 是 | 会话摘要 | 会话摘要文本 |
| session_list[].self_position | Number | 是 | 商家已读位置 | 时间戳/读取位置 |
| session_list[].to_position | Number | 是 | 对方已读位置 | 对方读取时间/位置 |
| session_list[].head_url | String | 是 | 买家头像 URL | 头像资源链接 |
| session_list[].unread_count | Number | 是 | 未读数量 | 未读消息数 |
| session_list[].site_id | String | 是 | 站点代码 | 如 BD、PK、NP、MM、LK |
| session_list[].last_message_time | Number | 是 | 最后消息时间 | 时间戳 |
| session_list[].session_id | String | 是 | 会话 ID | IM 会话标识 |
| session_list[].last_message_id | String | 是 | 最后消息 ID | 最新消息标识 |
| session_list[].title | String | 是 | 买家昵称 | 文档描述 buyer nick name |
| session_list[].buyer_id | Number | 是 | 买家 ID | buyerUserId |
| session_list[].tags | Object[] | 是 | 会话标签 | 示例 `official`；schema 为对象数组但示例为字符串标签 |
| data.has_more | Boolean | 是 | 是否有下一页 | true/false |
| data.next_start_time | Number | 是 | 下一页起始时间 | 下一页作为 start_time 输入 |
| data.last_session_id | String | 是 | 当前页最后会话 ID | 下一页作为 last_session_id 输入；首页边界可能为空 |
| success | Boolean | 是 | 成功标志 | true/false |
| err_message | String | 是 | 错误信息 | 成功示例 SUCCESS |

### 4.2 GetSessionDetail — `GET /im/session/get` **[系统同步]**

**请求参数**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| session_id | String | 是 | 会话 ID | 会话唯一标识 |

**响应参数**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| err_code | String | 是 | 错误码 | `0` 表示成功 |
| data.summary | String | 是 | 会话摘要 | 会话摘要文本 |
| data.self_position | Number | 是 | 商家已读时间/位置 | Long 时间戳 |
| data.to_position | Number | 是 | 对方已读时间/位置 | Long 时间戳 |
| data.head_url | String | 是 | 用户头像 URL | 图片地址 |
| data.unread_count | Number | 是 | 未读数量 | 未读消息数 |
| data.site_id | String | 是 | 站点代码 | 国家/站点标识 |
| data.last_message_time | Number | 是 | 最近消息时间 | Long 时间戳 |
| data.session_id | String | 是 | 会话 ID | 会话唯一标识 |
| data.last_message_id | String | 是 | 最近消息 ID | 最新消息唯一标识 |
| data.title | String | 是 | 买家昵称 | 昵称 |
| data.buyer_id | Number | 是 | 买家 ID | 平台用户 ID |
| data.tags | Object[] | 是 | 会话标签 | 官方类型为对象数组，示例为字符串数组 `official`；按原始响应兼容 |
| success | Boolean | 是 | 调用成功标志 | true/false |
| err_message | String | 是 | 错误信息 | 成功示例为 SUCCESS |

### 4.3 SendMessage — `POST /im/message/send` **[系统动作/需内容审查]**

**请求参数**（除公共鉴权参数外）

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| session_id | String | 是 | 目标会话 ID | 会话 ID |
| template_id | String | 是 | 消息模板 ID | 1 文本、3 图片、4 表情、10006 商品、10007 订单、10008 优惠券、10010 邀请关注店铺；详情中的视频 template 6 暂不支持/字段另注 |
| txt | String | 条件必填 | 文本内容 | `template_id=1` 时必需 |
| img_url | String | 条件必填 | 图片 URL | `template_id=3` 时必需 |
| width | String（Integer） | 条件必填 | 媒体宽度 | `template_id=3/6` 时必需；文档视频暂不支持 |
| height | String（Integer） | 条件必填 | 媒体高度 | `template_id=3/6` 时必需；文档视频暂不支持 |
| item_id | String | 条件必填 | 商品 ID | `template_id=10006` 时必需 |
| order_id | String | 条件必填 | 订单 ID | `template_id=10007` 时必需 |
| promotion_id | String | 条件必填 | 促销 ID | `template_id=10008` 时必需 |
| video_id | String | 否/暂不支持 | 视频 ID | 官方备注 Temporarily not supported |

**响应参数**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| err_code | String | 是 | 错误码 | `0` 表示成功 |
| data.current_time | Number | 是 | 发送时间 | Long 时间戳 |
| data.message_id | String | 是 | 消息 ID | 已发送消息标识 |
| data.template_id | Number | 是 | 模板 ID | 返回实际消息模板 |
| success | Boolean | 是 | 成功标志 | true/false |
| err_message | String | 否 | 错误消息 | 示例 SUCCESS |

### 4.4 ReadSession — `POST /im/session/read` **[系统动作]**

| 方向 | 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---|---:|---|---|
| 请求 | session_id | String | 是 | 会话 ID | 唯一会话标识 |
| 请求 | last_read_message_id | String | 是 | 最后已读消息 ID | 推进会话已读位置 |
| 响应 | err_code | String | 是 | 错误码 | 0 表示成功 |
| 响应 | success | Boolean | 是 | 成功标志 | true/false |
| 响应 | err_message | String | 是 | 错误信息 | 成功示例 SUCCESS |

### 4.5 MessageRecall — `GET/POST /im/message/recall` **[系统动作/高风险]**

| 方向 | 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---|---:|---|---|
| 请求 | session_id | String | 是 | 会话 ID | 会话唯一标识 |
| 请求 | message_id | String | 是 | 要撤回的消息 ID | 消息发送超过 2 分钟不可撤回；系统消息不可撤回 |
| 响应 | err_code | String | 是 | 错误码 | 0 表示成功 |
| 响应 | success | Boolean | 是 | 成功标志 | true/false |
| 响应 | err_message | String | 是 | 错误信息 | 成功示例 SUCCESS |

### 4.6 OpenSession — `GET/POST /im/session/open` **[系统动作]**

| 方向 | 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---|---:|---|---|
| 请求 | order_id | Number | 是 | 订单 ID | 据官方说明开启新会话 |
| 响应 | session_id | String | 否 | 会话 ID | 成功响应示例直接返回 session_id；详情 schema 将其标为 data |
| 响应 | code | String | 示例有 | 结果码 | `0` 表示成功 |
| 响应 | request_id | String | 示例有 | 请求追踪 ID | 平台追踪标识 |

### 4.7 GetMessages — `GET /im/message/list` **[系统同步]**

**请求参数**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| session_id | String | 是 | 会话 ID | 查询目标会话 |
| start_time | Number | 是 | 分页起始时间 | 首页传当前时间戳，后续页用上一页 next_start_time |
| page_size | Number | 是 | 每页数量 | 示例 20 |
| last_message_id | String | 否 | 上一页最后消息 ID | 首页可空；翻页传上一页响应值 |

**响应参数**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| err_code | String | 是 | 错误码 | 成功示例 0 |
| data.message_list | Object[] | 是 | 消息列表 | 元素字段见下方 |
| message_list[].to_account_type | Number | 是 | 接收方账号类型 | 1 买家，2 卖家 |
| message_list[].message_id | String | 是 | 消息 ID | 唯一消息标识 |
| message_list[].to_account_id | String | 是 | 接收方账号 ID | 账号标识 |
| message_list[].session_id | String | 是 | 会话 ID | 所属会话 |
| message_list[].template_id | Number | 是 | 消息模板类型 | 1 文本、3 图片、4 表情、10006 商品、10007 订单、10008 优惠券、10010 邀请关注店铺、6 视频（文档注明视频时长大于 3 秒且小于 180 秒） |
| message_list[].type | Number | 是 | 消息来源类型 | 1 用户发送，2 系统发送 |
| message_list[].content | String | 是 | 消息内容 | 模板卡片 JSON/会话摘要；不同 template_id 结构不同 |
| message_list[].send_time | Number | 是 | 发送时间 | 时间戳 |
| message_list[].from_account_type | Number | 是 | 发送方账号类型 | 1 买家，2 卖家 |
| message_list[].from_account_id | String | 是 | 发送方账号 ID | 账号标识 |
| message_list[].site_id | String | 是 | 站点代码 | PK/BD/NP/MM/LK |
| message_list[].auto_reply | Boolean | 是 | 是否自动回复 | true/false |
| message_list[].status | Number | 是 | 消息状态 | 0 正常，1 已撤回 |
| message_list[].processMsg | String | 否 | 安全拦截提示 | 非空表示消息未通过安全校验，消息仅卖家可见；ISV 应展示提示 |
| data.has_more | Boolean | 是 | 是否有下一页 | true/false |
| data.next_start_time | Number | 是 | 下一页起始时间 | 翻页输入 |
| data.last_message_id | String | 是 | 当前页最后消息 ID | 翻页输入 |
| success | Boolean | 是 | 成功标志 | true/false |
| err_message | String | 否 | 错误信息 | 错误描述 |

### 4.8 IM 其他说明

会话/消息列表支持游标式分页：请求下一页时传入上一页响应的 `next_start_time` 与 `last_session_id` / `last_message_id`。发消息、读状态、撤回和开会话均是写操作，应记录操作人、请求 ID、目标会话及发送内容摘要。

## 5. 订单与物流

官方 API Reference 左侧菜单可逐端点切换。通过浏览器页面已读取订单详情与订单项详情；页面参数树可展开显示请求/响应字段。之前匿名 HTTP 返回空是 SPA 数据加载方式导致，不是需要登录。

| 对象 | 接口 | 方法 | 官方用途 |
|---|---|---|---|
| 订单 | `/orders/get` | GET | 查询一段范围内的订单项 | **[系统同步]** schema 见 5.1.4 |
| 订单 | `/order/get` | GET/POST | 查询单个订单及其订单项 | **[系统同步]** schema 见 5.1.1 |
| 订单项 | `/orders/items/get` | GET | 获取一个或多个订单的商品项信息 | **[系统同步]** schema 见 5.1.3 |
| 订单项 | `/order/items/get` | GET | 获取订单商品项信息 | **[系统同步]** schema 见 5.1.2 |
| 订单文件 | `/order/document/get` | GET | 获取发票、运输标签等订单文件 | **[系统动作/按需下载]** schema 见 5.1.5 |
| 发票 | `/order/invoice_number/set` | POST | 设置订单发票号 | **[系统动作/需校验]** schema 见 5.1.5 |
| 物流 | `/order/logistic/get` | GET/POST | 查询物流详情；仅 Ready to Ship 之后可用 | **[系统同步]** schema 见 5.1.5 |
| 物流轨迹 | `/logistic/order/trace` | GET/POST | 查询订单物流轨迹；仅 Ready to Ship 之后可用 | **[系统同步]** schema 见 5.1.5 |
| 履约 | `/order/fulfill/pack` | POST | 标记订单项已打包 | **[系统动作/状态推进]** schema 见 5.2.1 |
| 履约 | `/order/package/rts` | POST | 标记包裹 Ready to Ship | **[系统动作/高影响]** schema 见 5.2.1 |
| 运单 | `/order/package/document/get` | GET/POST | 获取运输标签 | **[系统动作/按需下载]** schema 见 5.2.1 |
| 配送商 | `/order/shipment/providers/get` | GET/POST | 查询可用配送商 | **[系统元数据同步]** schema 见 5.2.1 |

### 5.1.1 GetOrder — `GET/POST /order/get` **[系统同步]**

用途：获取单个订单的商品项列表。以下 schema 来自用户粘贴的官方详情页内容。响应参数区显示 `data` 对象及其子字段；注意响应表中未显示 required 标志，因此响应字段必填状态均标为“官方未标”。

**服务端点**：Myanmar `https://api.shop.com.mm/rest`；Bangladesh `https://api.daraz.com.bd/rest`；Pakistan `https://api.daraz.pk/rest`；Sri Lanka `https://api.daraz.lk/rest`；Nepal `https://api.daraz.com.np/rest`。

**公共请求参数**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| app_key | String | 是 | 应用 ID | 在 Daraz Open Platform 申请应用类别时签发 |
| timestamp | String | 是 | 请求时间戳 | 示例为毫秒时间戳；与 UTC 时间差小于 7200 秒 |
| access_token | String | 是 | API 调用凭证 | 店铺授权后取得 |
| sign_method | String | 是 | 签名算法 | 用于 HMAC 签名 |
| sign | String | 是 | 请求签名 | 身份验证与请求完整性校验 |

**业务请求参数**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| order_id | Number | 是 | 订单 ID | Seller Center 分配给订单的标识 |

**响应参数**（`data` 为 Object）

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| data.address_shipping | Object | 官方未标 | 收货地址对象 | 官方描述包含 FirstName、LastName、Phone、Phone2、Address1、Address2、City、PostCode、Country 等节点；展开字段见下表 |
| data.address_shipping.address5 | String | 官方未标 | 三级地址 | Third-level address |
| data.address_shipping.post_code | String | 官方未标 | 邮编 | Lazada ID 站点说明此值不使用 |
| data.address_shipping.address4 | String | 官方未标 | 城市名 | City name |
| data.address_shipping.last_name | String | 官方未标 | 买家姓 | Customer last name |
| data.address_shipping.country | String | 官方未标 | 国家 | Country |
| data.address_shipping.address3 | String | 官方未标 | 州/省名 | State name |
| data.address_shipping.address2 | String | 官方未标 | 地址行 2 | 当前未使用 |
| data.address_shipping.city | String | 官方未标 | 城市名 | City name |
| data.address_shipping.address1 | String | 官方未标 | 详细地址 | Detailed address |
| data.address_shipping.phone2 | String | 官方未标 | 备用电话 | Backup phone number |
| data.address_shipping.first_name | String | 官方未标 | 买家名 | Customer first name |
| data.address_shipping.phone | String | 官方未标 | 电话 | Phone number；属于个人信息，按最小化原则处理 |
| data.address_billing | Object | 官方未标 | 账单地址对象 | 官方描述列出与地址相关的子节点；字段见下方，重复字段语义同 shipping 地址 |
| data.address_billing.address3 | String | 官方未标 | 州/省名 | State name |
| data.address_billing.address2 | String | 官方未标 | 地址行 2 | 当前未使用 |
| data.address_billing.city | String | 官方未标 | 城市名 | City name |
| data.address_billing.address1 | String | 官方未标 | 详细地址 | Detailed address |
| data.address_billing.phone2 | String | 官方未标 | 备用电话 | Backup phone number |
| data.address_billing.first_name | String | 官方未标 | 买家名 | Customer first name |
| data.address_billing.phone | String | 官方未标 | 电话 | Phone number；属于个人信息 |
| data.address_billing.address5 | String | 官方未标 | 三级地址 | Third-level address |
| data.address_billing.post_code | String | 官方未标 | 邮编 | Lazada ID 站点说明此值不使用 |
| data.address_billing.address4 | String | 官方未标 | 城市名 | City name |
| data.address_billing.last_name | String | 官方未标 | 买家姓 | Customer last name |
| data.address_billing.country | String | 官方未标 | 国家 | Country |
| data.warehouse_code | String | 官方未标 | 仓库代码 | 多仓卖家仓库代码 |
| data.shipping_fee_original | String | 官方未标 | 原始运费 | Shipping fee original |
| data.shipping_fee_discount_seller | String | 官方未标 | 卖家承担运费折扣 | Seller shipping discount |
| data.shipping_fee_discount_platform | String | 官方未标 | 平台承担运费折扣 | Platform shipping discount |
| data.customer_last_name | String | 官方未标 | 买家姓 | Customer last name |
| data.gift_option | Boolean | 官方未标 | 是否礼品 | 1 表示礼品，0 表示非礼品（官方字段类型标 Boolean） |
| data.voucher_code | String | 官方未标 | 优惠券代码 | Voucher code |
| data.updated_at | String | 官方未标 | 订单更新时间 | 日期时间；格式未在该字段说明内限定 |
| data.delivery_info | String | 官方未标 | 订单配送信息 | Order delivery information |
| data.gift_message | String | 官方未标 | 礼品留言 | 买家填写的留言 |
| data.branch_number | String | 官方未标 | 税务分支代码 | 仅泰国；企业客户下单时提供 |
| data.tax_code | String | 官方未标 | VAT 税号 | 仅泰国和越南；买家下单时提供 |
| data.extra_attributes | String | 官方未标 | 扩展属性 | 来自 getMarketPlaceOrders 传入 Seller Center 的额外属性 |
| data.shipping_fee | String | 官方未标 | 运费 | Shipping fee |
| data.customer_first_name | String | 官方未标 | 买家名 | Customer first name |
| data.payment_method | String | 官方未标 | 支付方式 | The method of payment |
| data.statuses | String[] | 官方未标 | 订单商品项状态集合 | 订单中各 item 的唯一状态 |
| data.remarks | String | 官方未标 | 备注 | 面向人的可读备注 |
| data.order_number | Number | 官方未标 | 订单编号 | The order number |
| data.order_id | Number | 官方未标 | 订单 ID | Seller Center 分配的订单标识 |
| data.voucher | String | 官方未标 | 优惠金额 | Voucher amount |
| data.national_registration_number | String | 官方未标 | 国家注册号码 | 某些国家需要 |
| data.promised_shipping_times | String | 官方未标 | 承诺发货时间 | 官方字段名为复数 |
| data.items_count | Number | 官方未标 | 商品实例/件数 | Number of items in the order；应与去重 order_item_id 数一致 |
| data.created_at | String | 官方未标 | 下单时间 | 订单创建日期时间 |
| data.price | String | 官方未标 | 订单总金额 | Total amount for this order |
| data.buyer_note | String | 官方未标 | 买家备注 | Buyer note |
| data.cash_payment_fee | String | 官方未标 | 现金支付费用 | Cash payment fee |

**错误码**

| 错误码 | 错误信息 | 含义/处理 |
|---|---|---|
| 16 | E016: Invalid Order ID | 指定订单 ID 无效；检查订单 ID 和所属店铺 |
| 6 | E006: System Error | 系统错误；记录 request_id 后按重试策略处理，避免无节制重试 |

### 5.1.2 GetOrderItems — `GET /order/items/get` **[系统同步]**

用途：获取一个订单的 item 信息。字段来自用户粘贴的官方详情页；响应 `data` 为 Object[]，响应表未显示子字段 required 标记，故均标记“官方未标”。

**服务端点**：Myanmar `https://api.shop.com.mm/rest`；Bangladesh `https://api.daraz.com.bd/rest`；Pakistan `https://api.daraz.pk/rest`；Sri Lanka `https://api.daraz.lk/rest`；Nepal `https://api.daraz.com.np/rest`。

**公共请求参数**：与 GetOrder 相同，即 app_key、timestamp、access_token、sign_method、sign，均 String 且必填，含义见第 0 节。

**业务请求参数**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| order_id | Number | 是 | 订单 ID | Seller Center 分配给订单的标识 |

**响应参数**（`data` 为 Object[]；下列字段为 `data[]` 子字段。官方详情中响应参数表只列出了 `data`，未展开数组子字段；此处字段来自官方 Streamlined Return 示例，因此类型是按示例值和参数定义记录，必填性为“官方未标”。）

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| data[].sku | String | 官方未标 | 商品 SKU | Product SKU |
| data[].voucher_code | String | 官方未标 | 优惠券代码 | 官方注明 Not used |
| data[].wallet_credits | String | 官方未标 | 钱包抵扣 | Wallet credit |
| data[].updated_at | String | 官方未标 | 更新时间 | feed 最近更新时间，ISO 8601 |
| data[].is_digital | Number | 官方未标 | 是否数字商品 | Is digital goods or not |
| data[].tracking_code_pre | String | 官方未标 | 预置追踪码 | 官方注明 Not used |
| data[].order_item_id | Number | 官方未标 | 订单项 ID | Order item ID |
| data[].package_id | String | 官方未标 | 包裹来源 ID | Package source ID |
| data[].tracking_code | String | 官方未标 | 物流追踪号 | 从 3PL 配送商取得 |
| data[].shipping_service_cost | Number | 官方未标 | 配送服务成本 | Shipping service cost |
| data[].extra_attributes | String | 官方未标 | 扩展属性 | JSON 编码字符串 |
| data[].paid_price | String | 官方未标 | 实付价格 | Paid price |
| data[].shipping_provider_type | String | 官方未标 | 配送服务类型 | EXPRESS、STANDARD、ECONOMY、INSTANT、SELLER_OWN_FLEET、PICKUP_IN_STORE、DIGITAL |
| data[].product_detail_url | String | 官方未标 | 商品详情 URL | Product detail URL |
| data[].shop_sku | String | 官方未标 | 店铺商品外部 ID | Product outer ID |
| data[].reason_detail | String | 官方未标 | 原因详情 | Reason detail |
| data[].purchase_order_id | String | 官方未标 | 采购订单 ID | 调用 SetPackedByMarketPlace 时返回 |
| data[].purchase_order_number | String | 官方未标 | 采购订单编号 | 调用 SetPackedByMarketPlace 时返回 |
| data[].name | String | 官方未标 | 商品名称 | Product name |
| data[].product_main_image | String | 官方未标 | 商品主图 URL | Product main image URL |
| data[].item_price | String | 官方未标 | 商品价格 | Product price |
| data[].tax_amount | String | 官方未标 | 税额 | Tax amount |
| data[].status | String | 官方未标 | 订单项状态 | Status |
| data[].cancel_return_initiator | String | 官方未标 | 取消/退货发起方 | cancellation-internal、cancellation-customer、cancellation-failed Delivery、cancellation-seller、return-customer、refund-internal |
| data[].voucher_platform | String | 官方未标 | 平台优惠券 | Lazada 发放的优惠券 |
| data[].voucher_seller | String | 官方未标 | 卖家优惠券 | 卖家发放的优惠券 |
| data[].order_type | String | 官方未标 | 订单类型 | Normal、PreSale、Coupon、O2O 或 InStoreO2O |
| data[].stage_pay_status | String | 官方未标 | 预售阶段支付状态 | 可能为 null、unpaid、unpaid final payment；含义见官方说明 |
| data[].warehouse_code | String | 官方未标 | 仓库代码 | 多仓卖家仓库代码 |
| data[].voucher_seller_lpi | String | 官方未标 | 卖家赞助 Lazada Bonus | The Lazada Bonus sponsored by seller |
| data[].voucher_platform_lpi | String | 官方未标 | 平台赞助 Lazada Bonus | The Lazada Bonus sponsored by Lazada |
| data[].buyer_id | String | 官方未标 | 买家 ID | Buyer ID |
| data[].shipping_fee_original | String | 官方未标 | 原始运费 | Shipping fee original |
| data[].shipping_fee_discount_seller | String | 官方未标 | 卖家运费折扣 | Seller shipping fee discount |
| data[].shipping_fee_discount_platform | String | 官方未标 | 平台运费折扣 | Platform shipping fee discount |
| data[].voucher_code_seller | String | 官方未标 | 卖家优惠券代码 | Voucher code from seller |
| data[].voucher_code_platform | String | 官方未标 | 平台优惠券代码 | Voucher code from platform |
| data[].delivery_option_sof | String | 官方未标 | 是否卖家自有车队配送 | 值包含 1 和 0 |
| data[].is_fbl | String | 官方未标 | 是否 Lazada 履约 | 值包含 1 和 0 |
| data[].is_reroute | String | 官方未标 | 是否二次销售/转售 | 值包含 1 和 0 |
| data[].reason | String | 官方未标 | 取消/退货原因 | Cancel、Return 或其他原因；定义于 sales_order_reason |
| data[].digital_delivery_info | String | 官方未标 | 数字商品配送信息 | Digital delivery information |
| data[].promised_shipping_time | String | 官方未标 | 承诺发货时间 | Promised shipping time |
| data[].order_id | String | 官方未标 | 订单 ID | Order ID |
| data[].voucher_amount | String | 官方未标 | 优惠金额 | Voucher amount |
| data[].return_status | String | 官方未标 | 退货状态 | Return status |
| data[].shipping_type | String | 官方未标 | 发货类型 | Drop-shipping 或 Warehouse |
| data[].shipment_provider | String | 官方未标 | 3PL 配送商 | 例如 LEX |
| data[].variation | String | 官方未标 | 商品变体 | Variation |
| data[].created_at | String | 官方未标 | 创建时间 | feed 创建时间，ISO 8601 |
| data[].invoice_number | String | 官方未标 | 发票号码 | Invoice number |
| data[].shipping_amount | String | 官方未标 | 运费金额 | Shipping fee |
| data[].currency | String | 官方未标 | 币种 | ISO 4217 兼容币种代码 |
| data[].order_flag | String | 官方未标 | 订单标记 | GUARANTEE、NORMAL、GLOBAL_COLLECTION；带特定标记的订单履约 SLA 较短 |
| data[].shop_id | String | 官方未标 | 店铺名称 | 官方描述 Seller name |
| data[].sla_time_stamp | String | 官方未标 | 发货 SLA 时间 | ISO 8601：yyyy-MM-dd'T'HH:mm:ssXXX |
| data[].sku_id | String | 官方未标 | SKU ID | Sku ID |
| data[].product_id | String | 官方未标 | 商品 ID | Product ID |
| data[].fulfillment_sla | String | 官方未标 | 履约 SLA 信息 | fulfillment SLA info |
| data[].priority_fulfillment_tag | String | 官方未标 | 优先履约标签 | priority fulfillment tag |
| data[].gift_wrapping | String | 官方未标 | 礼品包装文案 | 包装上的自定义显示文案 |
| data[].show_giftwrapping_tag | Boolean | 官方未标 | 是否显示礼品标签 | 是否显示礼品标签 |
| data[].personalization | String | 官方未标 | 个性化/刻字内容 | Engraving service custom copywriting |
| data[].show_personalization_tag | Boolean | 官方未标 | 是否显示刻字服务标签 | 是否展示个性化服务标识 |
| data[].payment_time | Number | 官方未标 | 支付时间 | 毫秒时间戳，站点本地时间 |
| data[].supply_price | String | 官方未标 | 供货价 | MP3 订单供货价 |
| data[].supply_price_currency | String | 官方未标 | 供货价币种 | MP3 订单供货价币种 |
| data[].mp3_order | Boolean | 官方未标 | 是否 MP3 订单 | is mp3 order or not |
| data[].semi_managed | Boolean | 官方未标 | 是否半托管订单 | is semiManaged order or not |
| data[].biz_group | Number | 官方未标 | 业务组 | 70100=MP（JIT 商家自行履约）；70020=仓库发货（JIT PO 备货） |
| data[].pick_up_store_info | Object | 官方未标 | 门店自提信息 | 子字段见下表 |
| data[].pick_up_store_info.pick_up_store_name | String | 官方未标 | 自提门店名称 | Pick-up Store name |
| data[].pick_up_store_info.pick_up_store_address | String | 官方未标 | 自提门店地址 | Pick-up Store address |
| data[].pick_up_store_info.pick_up_store_code | String | 官方未标 | 自提门店 ID | Pick-up Store id |
| data[].pick_up_store_info.pick_up_store_open_hour | String[] | 官方未标 | 自提门店营业时间 | Pick-up Store business hours |

### 5.1.3 GetMultipleOrderItems — `GET /orders/items/get` **[系统同步]**

**请求参数**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| order_ids | Number[] | 是 | 订单 ID 列表 | 逗号分隔 ID 放在方括号内，如 `[42922,32793]`；超出平台批量上限会报错 |

**响应参数**：`data` Object[]。官方响应表只显示父对象；以下子字段来自官方响应示例，非 required 声明。

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---|---|---|
| data[].order_number | String | 示例字段 | 订单编号 | |
| data[].order_id | String | 示例字段 | 订单 ID | |
| data[].order_items | Object[] | 示例字段 | 订单项列表 | 每项子字段与 GetOrderItems `data[]` 字段相同，见 5.1.2；该批量接口示例个别字段集略有差异 |

**错误码**：37 列表中订单 ID 无效；38 请求订单数超过限制；39 未找到订单；56 `order_ids` 格式无效，必须使用 `[1,2]` 数组格式。

### 5.1.4 GetOrders — `GET /orders/get` **[系统同步]**

**请求参数**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| update_before | String | 否 | 更新时间上界 | ISO 8601；在指定时间或之前更新 |
| sort_direction | String | 否 | 排序方向 | ASC 或 DESC |
| offset | Number | 否 | 分页偏移 | 起始处跳过的订单数 |
| limt | Number | 否 | 返回数量 | 官方字段原拼写 `limt`；最大 100 |
| update_after | String | 否* | 更新时间下界 | ISO 8601；与 created_after 至少提供其一；文档原文 Either UpdatedAfter or CreatedAfter is mandatory |
| sort_by | String | 否 | 排序字段 | created_at 或 updated_at |
| created_before | String | 否 | 创建时间上界 | 官方描述文本误写 updated；参数名为 created_before；ISO 8601 |
| created_after | String | 否* | 创建时间下界 | ISO 8601；与 update_after 至少提供其一 |
| status | String | 否 | 订单状态过滤 | unpaid、pending、canceled、ready_to_ship、delivered、returned、shipped、failed；白名单卖家另有 topack、toship |
| mp3_Order | Number | 否 | MP3 订单筛选 | 1 MP3 订单；2 非 MP3 订单 |

**响应参数**：`data` Object；`orders` 为订单数组。字段以下均为示例字段，参数表的响应树只声明 data Object。

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---|---|---|
| data.count | String | 示例字段 | 本页数量 | |
| data.countTotal | String | 示例字段 | 总记录数量 | |
| data.orders[] | Object[] | 示例字段 | 订单列表 | 订单头字段见下表 |
| orders[].voucher_platform | String | 示例字段 | 平台优惠额 | |
| orders[].voucher | String | 示例字段 | 优惠额 | |
| orders[].warehouse_code | String | 示例字段 | 仓库代码 | |
| orders[].order_number | String | 示例字段 | 订单编号 | |
| orders[].voucher_seller | String | 示例字段 | 卖家优惠额 | |
| orders[].cash_payment_fee | String | 示例字段 | 现金支付手续费 | |
| orders[].created_at | String | 示例字段 | 创建时间 | 示例 ISO 8601 |
| orders[].voucher_code | String | 示例字段 | 优惠券代码 | |
| orders[].gift_option | String | 示例字段 | 是否礼品 | 示例为字符串 false |
| orders[].shipping_fee_discount_platform | String | 示例字段 | 平台运费折扣 | |
| orders[].customer_last_name | String | 示例字段 | 买家姓 | PII |
| orders[].promised_shipping_times | String | 示例字段 | 承诺发货时间 | |
| orders[].updated_at | String | 示例字段 | 更新时间 | ISO 8601 |
| orders[].price | String | 示例字段 | 总价 | |
| orders[].shipping_fee_original | String | 示例字段 | 原始运费 | |
| orders[].payment_method | String | 示例字段 | 支付方式 | |
| orders[].address_updated_at | String | 示例字段 | 地址更新时间 | 可为 null 文本 |
| orders[].buyer_note | String | 示例字段 | 买家备注 | |
| orders[].customer_first_name | String | 示例字段 | 买家名 | PII |
| orders[].shipping_fee_discount_seller | String | 示例字段 | 卖家运费折扣 | |
| orders[].shipping_fee | String | 示例字段 | 运费 | |
| orders[].national_registration_number1 | String | 示例字段 | 国家注册信息 | 页面示例字段原样保留 |
| orders[].branch_number | String | 示例字段 | 税务分支代码 | 区域字段 |
| orders[].tax_code | String | 示例字段 | VAT 税号 | 区域字段 |
| orders[].items_count | String | 示例字段 | 商品实例/件数 | 示例为字符串；与去重 order_item_id 数校验 |
| orders[].delivery_info | String | 示例字段 | 配送信息 | |
| orders[].statuses | String[] | 示例字段 | 状态列表 | |
| orders[].address_billing | Object | 示例字段 | 账单地址 | 子字段结构参考 GetOrder 的 address_billing |
| orders[].address_shipping | Object | 示例字段 | 收货地址 | 子字段结构参考 GetOrder 的 address_shipping |
| orders[].extra_attributes | String | 示例字段 | 扩展属性 | JSON 字符串或 null 文本 |
| orders[].order_id | String | 示例字段 | 订单 ID | |
| orders[].remarks | String | 示例字段 | 备注 | |
| orders[].gift_message | String | 示例字段 | 礼品留言 | |

**错误码**：14 offset 无效；17 日期格式无效；19 limit 无效；36 status filter 无效；74 sort direction 无效；75 sort filter 无效。注意官方参数名拼写 `limt`，描述错误信息使用 limit。

### 5.1.5 订单履约与物流写入/读取接口

下列接口来自官方 Order 菜单。GetDocument、GetOrderLogisticDetail、GetOrderTrace、SetInvoiceNumber 已抓取官方页面；其中复杂请求体/响应对象有未展开字段时按示例字段单独标记。

| 接口 | 路径 | 方法 | 用途 | 标记 |
|---|---|---|---|---|
| GetDocument | `/order/document/get` | GET | 获取订单相关文件，如发票和运输标签 | **[系统动作/按需下载]**；见 5.1.5 |
| GetOrderLogisticDetail | `/order/logistic/get` | GET/POST | 查询订单物流详情；仅 Ready to Ship 后可用 | **[系统同步]**；见 5.1.5 |
| GetOrderTrace | `/logistic/order/trace` | GET/POST | 查询物流轨迹；仅 Ready to Ship 后可用 | **[系统同步]**；见 5.1.5 |
| SetInvoiceNumber | `/order/invoice_number/set` | POST | 设置订单发票号 | **[系统动作/需校验]**；见 5.1.5 |

#### GetDocument — `GET /order/document/get` **[系统动作/按需下载]**

| 方向 | 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---|---:|---|---|
| 请求 | doc_type | String | 是 | 文件类型 | `invoice`、`shippingLabel`、`carrierManifest` |
| 请求 | order_item_ids | String | 是 | 订单项 ID | 文档说明可用方括号形式的订单项 ID 列表，如 `[279709,279710]` |
| 响应 | data | Object | 官方未标 | 文件响应对象 | 示例未展开其 Response Parameters 子字段 |
| 响应示例 | data.document.file | String | 示例字段 | 文件数据 | 编码后的内容 |
| 响应示例 | data.document.mime_type | String | 示例字段 | MIME 类型 | 如 text/html |
| 响应示例 | data.document.document_type | String | 示例字段 | 返回文件类型 | 如 shippingLabel |

错误码：20 无效订单项 ID；21 OMS API 错误；32 document type 无效；34 订单项必须先打包/Ready to Ship；35 找不到订单项；30012 RTS 包裹不存在或状态不为 packed/ready to ship。

#### GetOrderLogisticDetail — `GET/POST /order/logistic/get` **[系统同步]**

此接口仅在订单状态达到 Ready to Ship 后可用。

| 方向 | 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---|---:|---|---|
| 请求 | order_id | String | 是 | 订单 ID | |
| 请求 | package_id_list | String[] | 是 | 包裹 ID 列表 | 官方字段小写 package_id_list |
| 请求 | locale | String | 是 | 本地化语言 | 示例 en |
| 响应 | data | Object | 官方未标 | 物流详情响应 | 示例 `data.module[]` |
| 响应示例 | data.module[].warehouse_detail_info | String | 示例字段 | 仓库详情 | 示例文本 null |
| 响应示例 | data.module[].ofc_order_id | String | 示例字段 | OFC 订单 ID | |
| 响应示例 | module[].package_detail_info_list[] | Object[] | 示例字段 | 包裹详情 | |
| 响应示例 | package_detail_info_list[].order_line_info_list | String/Object[] | 示例字段 | 订单行信息 | 示例为字符串 null；schema 未展开 |
| 响应示例 | package_detail_info_list[].ofc_package_id | String | 示例字段 | OFC 包裹 ID | |
| 响应示例 | package_detail_info_list[].tracking_number | String | 示例字段 | 物流追踪号 | |
| 响应示例 | package_detail_info_list[].logistic_detail_info_list[] | Object[] | 示例字段 | 物流事件列表 | |
| 响应示例 | logistic_detail_info_list[].package_location_name | String | 示例字段 | 包裹位置 | |
| 响应示例 | logistic_detail_info_list[].status_code | String | 示例字段 | 物流状态码 | |
| 响应示例 | logistic_detail_info_list[].proof_images | String[] | 示例字段 | 证明图片 | |
| 响应示例 | logistic_detail_info_list[].detail_type | String | 示例字段 | 事件类型 | 如 ready_to |
| 响应示例 | logistic_detail_info_list[].event_date | String | 示例字段 | 事件日期 | |
| 响应示例 | logistic_detail_info_list[].receive_time | String | 示例字段 | 收件时间 | |
| 响应示例 | logistic_detail_info_list[].icon | String | 示例字段 | 状态图标 | |
| 响应示例 | logistic_detail_info_list[].description | String | 示例字段 | 事件描述 | |
| 响应示例 | logistic_detail_info_list[].title | String | 示例字段 | 事件标题 | |
| 响应示例 | logistic_detail_info_list[].event_time | String | 示例字段 | 事件时间 | 毫秒时间戳文本 |

官方响应参数表只声明 data Object，未逐一列出 module 子结构；以上是 Streamlined Return 示例字段。

#### GetOrderTrace — `GET/POST /logistic/order/trace` **[系统同步]**

仅订单达到 Ready to Ship 后可查。

| 方向 | 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---|---:|---|---|
| 请求 | order_id | String | 是 | 订单 ID | |
| 请求 | locale | String | 否 | 本地化语言 | 示例 en |
| 请求 | ofcPackageIdList | String[] | 否 | OFC 包裹 ID 列表 | 原字段驼峰形式 |
| 响应 | result | Object | 官方未标 | 物流追踪结果 | |
| 响应示例 | result.not_success | String | 示例字段 | 非成功标志 | 示例 false |
| 响应示例 | result.data[] | Object[] | 示例字段 | 订单物流结果 | |
| 响应示例 | data[].warehouse_detail_info | String | 示例字段 | 仓库详情 | |
| 响应示例 | data[].ofc_order_id | String | 示例字段 | OFC 订单 ID | |
| 响应示例 | data[].package_detail_info_list[] | Object[] | 示例字段 | 包裹物流信息 | 包含 order_line_info_list、ofc_package_id、tracking_number、logistic_detail_info_list |
| 响应示例 | logistic_detail_info_list[].package_location_name | String | 示例字段 | 物流位置 | |
| 响应示例 | logistic_detail_info_list[].status_code | String | 示例字段 | 状态码 | |
| 响应示例 | logistic_detail_info_list[].proof_images | String[] | 示例字段 | 证明图片 | |
| 响应示例 | logistic_detail_info_list[].detail_type | String | 示例字段 | 事件类型 | |
| 响应示例 | logistic_detail_info_list[].event_date | String | 示例字段 | 事件日期 | |
| 响应示例 | logistic_detail_info_list[].receive_time | String | 示例字段 | 收件时间 | |
| 响应示例 | logistic_detail_info_list[].icon | String | 示例字段 | 状态图标 | |
| 响应示例 | logistic_detail_info_list[].description | String | 示例字段 | 描述 | |
| 响应示例 | logistic_detail_info_list[].title | String | 示例字段 | 标题 | |
| 响应示例 | logistic_detail_info_list[].event_time | String | 示例字段 | 事件时间 | 毫秒时间戳文本 |
| 响应示例 | result.success | String | 示例字段 | 成功标志 | 字符串 |
| 响应示例 | result.error_code.display_message | String | 示例字段 | 面向用户的错误文本 | |
| 响应示例 | result.repeated | String | 示例字段 | 是否重复 | |
| 响应示例 | result.retry | String | 示例字段 | 是否可重试 | |

#### SetInvoiceNumber — `POST /order/invoice_number/set` **[系统动作/需校验]**

| 方向 | 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---|---:|---|---|
| 请求 | order_item_id | Number | 是 | 订单项 ID | |
| 请求 | invoice_number | String | 是 | 发票号码 | |
| 响应 | data | Object | 官方未标 | 返回数据 | |
| 响应示例 | data.order_item_id | String | 示例字段 | 订单项 ID | |
| 响应示例 | data.invoice_number | String | 示例字段 | 发票号码 | |
| 响应示例 | code | String | 示例字段 | 调用结果码 | 成功示例 0 |
| 响应示例 | request_id | String | 示例字段 | 请求追踪 ID | |

### 5.1.6 订单错误码和同步建议

GetOrder 与 GetOrderItems 官方均列出错误码 16（无效订单 ID）及 6（系统错误）；GetOrders 另列分页、日期、状态和排序相关错误。订单详情可通过单笔接口读取；生产同步优先使用 GetOrders 按分页/时间窗拉取，再用 GetOrder/GetOrderItems 补全。订单字段含地址和电话时应严格限制访问、避免写入普通日志，并按站点隐私规则控制留存。

**错误码**

| 错误码 | 错误信息 | 含义/处理 |
|---|---|---|
| 16 | E016: Invalid Order ID | 指定订单 ID 无效；检查订单 ID 与店铺授权 |
| 6 | E006: System Error | 系统错误；记录 request_id 并使用受控重试 |

### 5.1.7 订单数据处理注意事项

- 两个接口均为订单读取，可标记 **[系统同步]**；按订单 ID 查询，适合先拉订单头/商品项，再保存原始响应与规范化记录。
- GetOrder 返回完整订单上下文并含收货/账单地址及电话；这些是个人信息，须最小化访问、加密存储、设保留期限，不应无目的复制到日志或人工导入表。
- 官方响应字段表没有提供子字段 required 标识，因此本节没有把可选性猜成必填；字段可能因站点、订单类型、履约方式而缺省或为空。
- `data` 在 GetOrder 中为 Object，在 GetOrderItems 中为 Object[]；字段名大小写和拼写按官方 schema 保留（包括 `pick_up_store_open_hour` 等）。

| 接口 | 官方详情链接 | 目录确认 | 请求参数 schema | 响应参数 schema | 系统使用标记 |
|---|---|---|---|---|---|
| GetOrder `/order/get` | [官方详情](https://open.daraz.com/doc/api.htm?spm=a2o9m.11193487.0.0.782e1a9ab5Gun6#/api?cid=2&path=/order/get&methodType=GET/POST) | GET/POST；获取单订单商品项列表 | 见 5.1.1 | 见 5.1.1 | **[系统同步]** |
| GetOrderItems `/order/items/get` | [官方详情](https://open.daraz.com/doc/api.htm?spm=a2o9m.11193487.0.0.782e1a9ab5Gun6#/api?cid=2&path=/order/items/get&methodType=GET) | GET；获取某订单 item 信息 | 见 5.1.2 | 见 5.1.2（示例字段） | **[系统同步]** |

> 浏览器渲染的官方详情页已读取两接口的请求参数、响应树与示例。请求 required 明确；响应字段未逐项声明 required。GetOrderItems 子字段基于官方 Streamlined Return 示例，非穷尽 schema。

### 5.2 履约类可见接口补充清单

| 接口 | 方法 | 官方用途 | 系统标记 | 字段 schema |
|---|---|---|---|---|
| `/order/package/sof/delivered` | POST | 标记 SOF 订单项已送达 | **[系统动作/状态推进]** | 见 5.2.1 |
| `/order/digital/delivered` | POST | 标记数字商品已交付 | **[系统动作/状态推进]** | 见 5.2.1 |
| `/order/package/sof/failed_delivery` | POST | 标记 SOF 配送失败 | **[系统动作/状态推进]** | 见 5.2.1 |
| `/order/shipment/providers/get` | GET/POST | 获取有效配送商 | **[系统元数据同步]** | 见 5.2.1 |
| `/order/fulfill/pack` | POST | 标记已打包 | **[系统动作]** | 见 5.2.1 |
| `/order/package/document/get` | GET/POST | 取得运单/标签 | **[系统动作/按需]** | 见 5.2.1 |
| `/order/package/rts` | POST | Ready to Ship | **[系统动作/高影响]** | 见 5.2.1 |
| `/order/package/repack` | GET/POST | 重建包裹 | **[系统动作/高影响]** | 见 5.2.1 |

### 5.2.1 Fulfillment API 请求/响应 schema

以下 DBS/履约请求体在官方参数表中只声明为 Object；下级属性来自该页面的官方示例，不代表穷尽 schema，标记“示例字段”。

#### ConfirmDeliveryForDBS — `POST /order/package/sof/delivered` **[系统动作/DBS 专用]**

| 方向 | 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---|---:|---|---|
| 请求 | dbsDeliveryReq | Object | 是 | DBS 配送确认请求体 | 官方参数表只定义 Object |
| 请求 | dbsDeliveryReq.packages | Object[] | 示例字段 | 包裹集合 | 示例有此数组 |
| 请求 | dbsDeliveryReq.packages[].package_id | String | 示例字段 | 包裹 ID | |
| 响应 | result | Object | 官方未标 | 响应体 | |
| 响应 | result.error_msg | String | 示例字段 | 错误消息 | 非 DBS 订单时提示不支持 |
| 响应 | result.data.packages[] | Object[] | 示例字段 | 分包结果 | |
| 响应 | packages[].msg | String | 示例字段 | 结果消息 | |
| 响应 | packages[].item_err_code | String | 示例字段 | 项目错误码 | 示例 700009 |
| 响应 | packages[].package_id | String | 示例字段 | 包裹 ID | |
| 响应 | packages[].retry | String | 示例字段 | 是否可重试 | 字符串 true/false |
| 响应 | result.success | String | 示例字段 | 成功标志 | 字符串 true/false |
| 响应 | result.error_code | String | 示例字段 | 错误码 | |
| 响应 | code | String | 示例字段 | API 结果码 | 成功包装示例为 0 |
| 响应 | request_id | String | 示例字段 | 请求 ID | |

#### DeliverDigital — `POST /order/digital/delivered` **[系统动作/数字订单]**

| 方向 | 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---|---:|---|---|
| 请求 | digitalDeliveryReq | Object | 是 | 数字商品交付请求体 | 官方表未展开成员 |
| 请求 | digitalDeliveryReq.orders[] | Object[] | 示例字段 | 订单集合 | 示例字段 |
| 请求 | orders[].order_id | String | 示例字段 | 订单 ID | |
| 请求 | orders[].order_item_list | String[]/嵌套列表 | 示例字段 | 订单项 ID 列表 | 示例表现为 JSON 字符串列表；具体编码须依 API Tester 验证 |
| 响应 | result.error_msg | String | 示例字段 | 错误消息 | 示例 order can't be null |
| 响应 | result.data.orders[] | Object[] | 示例字段 | 订单处理结果 | |
| 响应 | orders[].order_id | String | 示例字段 | 订单 ID | |
| 响应 | orders[].order_item_list[] | Object[] | 示例字段 | 订单项处理结果 | |
| 响应 | order_item_list[].msg | String | 示例字段 | 处理消息 | |
| 响应 | order_item_list[].order_item_id | String | 示例字段 | 订单项 ID | |
| 响应 | order_item_list[].item_err_code | String | 示例字段 | 订单项错误码 | 示例 700020 |
| 响应 | order_item_list[].retry | String | 示例字段 | 是否可重试 | 字符串 true/false |
| 响应 | result.success | String | 示例字段 | 成功标志 | 字符串 |
| 响应 | result.error_code | String | 示例字段 | 错误码 | 示例 700019 |

#### FailedDeliveryForDBS — `POST /order/package/sof/failed_delivery` **[系统动作/DBS 专用]**

| 方向 | 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---|---:|---|---|
| 请求 | dbsFailedDeliveryReq | Object | 是 | DBS 派送失败请求体 | 官方参数表只定义 Object |
| 请求 | dbsFailedDeliveryReq.packages[].package_id | String | 示例字段 | 包裹 ID | 示例 packages 数组 |
| 响应 | result.error_msg | String | 示例字段 | 错误消息 | 非 DBS 订单不支持 |
| 响应 | result.data.packages[] | Object[] | 示例字段 | 分包结果 | 含 msg、item_err_code、package_id、retry |
| 响应 | result.success | String | 示例字段 | 成功标志 | 字符串 |
| 响应 | result.error_code | String | 示例字段 | 错误码 | 示例 700009 |

#### GetShipmentProvider — `GET/POST /order/shipment/providers/get` **[系统同步/履约元数据]**

| 方向 | 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---|---:|---|---|
| 请求 | getShipmentProvidersReq | Object | 是 | 配送商查询请求体 | 官方只声明 Object |
| 请求 | getShipmentProvidersReq.orders[] | Object[] | 示例字段 | 订单列表 | |
| 请求 | orders[].order_id | String | 示例字段 | 订单 ID | |
| 请求 | orders[].order_item_ids | String[] | 示例字段 | 订单项 ID | 示例以字符串化数组提供 |
| 响应 | result.error_msg | String | 示例字段 | 错误消息 | 示例 seller not found |
| 响应 | result.data.platform_default | String | 示例字段 | 是否平台默认 | 示例 1 |
| 响应 | result.data.shipment_providers[] | Object[] | 示例字段 | 配送商列表 | |
| 响应 | shipment_providers[].name | String | 示例字段 | 配送商名称 | 如 Cainiao |
| 响应 | shipment_providers[].provider_code | String | 示例字段 | 配送商代码 | |
| 响应 | result.data.shipping_allocate_type | String | 示例字段 | 配送分配类型 | 示例 TFS |

#### Pack — `POST /order/fulfill/pack` **[系统动作/状态推进]**

| 方向 | 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---|---:|---|---|
| 请求 | packReq | Object | 是 | 打包请求体 | 官方参数表只定义 Object |
| 请求 | packReq.pack_order_list[] | Object[] | 示例字段 | 待打包订单 | |
| 请求 | pack_order_list[].order_id | String | 示例字段 | 订单 ID | |
| 请求 | pack_order_list[].order_item_list | String[]/嵌套列表 | 示例字段 | 订单项列表 | 示例为 JSON 编码字符串数组 |
| 请求 | packReq.delivery_type | String | 示例字段 | 配送类型 | 示例 dropship |
| 请求 | packReq.shipment_provider_code | String | 示例字段 | 配送商代码 | 示例 FM49 |
| 请求 | packReq.shipping_allocate_type | String | 示例字段 | 配送分配类型 | 示例 TFS |
| 响应 | result.error_msg | String | 示例字段 | 汇总消息 | 示例 order not found |
| 响应 | result.data.pack_order_list[] | Object[] | 示例字段 | 订单处理结果 | |
| 响应 | pack_order_list[].order_id | String | 示例字段 | 订单 ID | |
| 响应 | pack_order_list[].order_item_list[] | Object[] | 示例字段 | 订单项处理结果 | |
| 响应 | order_item_list[].order_item_id | String | 示例字段 | 订单项 ID | |
| 响应 | order_item_list[].msg | String | 示例字段 | 处理消息 | |
| 响应 | order_item_list[].item_err_code | String | 示例字段 | 订单项错误码 | `0` 示例表示成功 |
| 响应 | order_item_list[].tracking_number | String | 示例字段 | 物流追踪号 | |
| 响应 | order_item_list[].shipment_provider | String | 示例字段 | 配送商 | |
| 响应 | order_item_list[].package_id | String | 示例字段 | 包裹 ID | |
| 响应 | order_item_list[].retry | String | 示例字段 | 是否可重试 | 字符串 |
| 响应 | result.success | String | 示例字段 | 调用处理标志 | 仍需检查逐项错误码 |

#### PrintAWB — `GET/POST /order/package/document/get` **[系统动作/按需下载]**

| 方向 | 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---|---:|---|---|
| 请求 | getDocumentReq | Object | 是 | 运单请求体 | 该接口仅获取 shipping label |
| 请求 | getDocumentReq.doc_type | String | 示例字段 | 文档类型 | 示例 PDF |
| 请求 | getDocumentReq.print_item_list | String | 示例字段 | 是否打印 item 清单 | 示例 false |
| 请求 | getDocumentReq.packages[].package_id | String | 示例字段 | 包裹 ID | 请求示例 packages 数组 |
| 响应 | result.error_msg | String | 示例字段 | 错误消息 | |
| 响应 | result.data.file | String | 示例字段 | 文件数据 | 示例为编码内容 |
| 响应 | result.data.pdf_url | String | 示例字段 | PDF URL | |
| 响应 | result.data.doc_type | String | 示例字段 | 文档类型 | 示例 PDF |
| 响应 | result.success | String | 示例字段 | 成功标志 | |

#### ReadyToShip — `POST /order/package/rts` **[系统动作/高影响]**

| 方向 | 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---|---:|---|---|
| 请求 | readyToShipReq | Object | 是 | RTS 请求体 | 官方只声明 Object |
| 请求 | readyToShipReq.packages[].package_id | String | 示例字段 | 包裹 ID | |
| 响应 | result.error_msg | String | 示例字段 | 错误消息 | |
| 响应 | result.data.packages[] | Object[] | 示例字段 | 分包结果 | |
| 响应 | packages[].msg | String | 示例字段 | 处理消息 | |
| 响应 | packages[].item_err_code | String | 示例字段 | 结果码 | |
| 响应 | packages[].package_id | String | 示例字段 | 包裹 ID | |
| 响应 | packages[].retry | String | 示例字段 | 是否可重试 | |
| 响应 | result.success | String | 示例字段 | 成功标志 | |
| 响应 | result.error_code | String | 示例字段 | 业务错误码 | |

#### RecreatePackage — `GET/POST /order/package/repack` **[系统动作/高影响]**

| 方向 | 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---|---:|---|---|
| 请求 | rePackReq | Object | 是 | 重建包裹请求体 | 官方只声明 Object |
| 请求 | rePackReq.packages[].package_id | String | 示例字段 | 包裹 ID | |
| 响应 | result.error_msg | String | 示例字段 | 错误消息 | |
| 响应 | result.data.packages[] | Object[] | 示例字段 | 分包结果 | 含 msg、item_err_code、package_id、retry |
| 响应 | result.success | String | 示例字段 | 成功标志 | |
| 响应 | result.error_code | String | 示例字段 | 业务错误码 | |

### 5.3 Logistics API（EPIS）

本分类的 EPIS 端点面向外部物流合作方，普通 Seller App 是否能调用取决于资格/授权。区域端点为 Myanmar `https://api.shop.com.mm/rest`、Bangladesh `https://api.daraz.com.bd/rest`、Pakistan `https://api.daraz.pk/rest`、Sri Lanka `https://api.daraz.lk/rest`、Nepal `https://api.daraz.com.np/rest`。

多数 EPIS 端点公共参数为 app_key:String 必填、timestamp:String 必填（与 UTC 差小于 7200 秒）、access_token:String 可选、sign_method:String 必填、sign:String 必填。具体以单端点“Common Parameters”为准。

### 5.3.1 EPIS 通用响应对象

多个 EPIS 端点重复的响应字段（单端点出现与否以该页为准）：retryable:Boolean、traceId:String、success:Boolean/String、errorMessage:String、errorCode:String、errors:Object[]、data:Object、code:String、request_id:String。errors 示例对象通常含 field、errorMessage、可选 errorCode。

### 5.3.2 CreateCustomerAccountRelationshipByOTP — `GET/POST /logistics/epis/customers/external_relationships_bundle` **[系统动作/合作方授权]**

**业务请求参数**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| externalSellerId | String | 是 | 外部卖家 ID | |
| platformName | String | 是 | 平台名称 | |
| otp | String | 是 | OTP/BUNDLE code | Lazada Logistics Website 生成 |

**响应参数**：success:Boolean、retryable:Boolean、traceId:String、errorMessage:String、errorCode:String、errors:Object[]。

### 5.3.3 CreateOrUpdateCustomerWarehouse — `GET/POST /logistics/epis/customers/warehouses` **[系统动作/仓库配置]**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| configuration | Object | 否 | 仓库配置 | 示例含 deliveryNote:String、services:Object[]；服务项示例 enable:String、serviceName:String、properties:String(JSON)；未提供递归 schema |
| dropshippingInfo | Object | 否 | Dropshipping 配置 | 示例 originPlatformName、originPartnerName |
| externalSellerId | String | 是 | 外部卖家 ID | |
| platformName | String | 是 | 平台名称 | Daraz 提供的值 |
| warehouseCode | String | 是 | 仓库代码 | |
| warehouseName | String | 是 | 仓库名称 | |
| contactName | String | 是 | 仓库联系人 | |
| phone | String | 是 | 联系电话 | PII |
| email | String | 否 | 联系邮箱 | PII |
| type | String | 是 | 仓库类型 | NORMAL / RETURN |
| address | Object | 是 | 仓库地址 | 示例 details:String、id:String；对象未展开完整约束 |
| solutionCodes | String[] | 是 | Daraz 解决方案代码 | 可用值须联系支持 |

响应：retryable:Boolean、traceId:String、success:Boolean、errorMessage:String、errorCode:String、errors:Object[]、data:Object；示例 `data.convertedAddress` 含 details:String、id:String。

### 5.3.4 EpisPackageCancellation — `POST /logistics/epis/packages/cancel` **[系统动作/高风险]**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| packageCode | String | 是 | EPIS 包裹唯一代码 | EPIS 与外部系统间标识 |
| reason | String | 是 | 取消原因 | 自由文本 |

响应：retryable:Boolean、traceId:String、success:Boolean、errorMessage:String、errorCode:String、errors:Object[]。

### 5.3.5 EpisPackageCreation / EpisPackageConsignment — `POST /logistics/epis/packages`、`POST /logistics/epis/packages/consign` **[系统动作/物流创建]**

两接口官方详情页列出相同主体参数；consignment 用途说明会创建/交运并取得 tracking number。除表中 Required 状态外，Object 子项来自官方请求示例，标作示例字段。

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| packageType | String | 否 | 包裹类型 | Sales_order / Customer_return |
| externalOrderId | String | 是 | 外部订单 ID | 唯一幂等键；同值重复提交只记录首次请求，不能用后续请求修改已处理订单 |
| platformOrderCreationTime | Number | 否 | 平台订单创建时间 | Unix 毫秒；默认 EPIS 接收时间 |
| dangerousGood | Boolean | 是 | 是否危险品 | true/false |
| items | Object[] | 是 | 商品项 | 示例字段见下 |
| items[].unitPrice | String | 示例字段 | 单价 | |
| items[].quantity | String | 示例字段 | 数量 | |
| items[].dimWeight | Object | 示例字段 | 商品尺寸重量 | length、width、weight、height 示例为字符串 |
| items[].name | String | 示例字段 | 商品名称 | 错误示例表明 name 不可空，但请求 schema 未单列该子项 required |
| items[].id | String | 示例字段 | 商品项 ID | |
| items[].sku | String | 示例字段 | SKU | |
| items[].category | String | 示例字段 | 商品类别 | |
| items[].paidPrice | String | 示例字段 | 实付价 | |
| shipper | Object | 是 | 发货方信息 | 示例 externalSellerId、platformName、warehouseName、externalWarehouseCode |
| origin | Object | 是 | 始发联系人/地址 | 示例 address、phone、geoLocation(latitude/longitude)、name、email |
| destination | Object | 是 | 收件人/地址 | 示例同 origin 的 address、phone、geoLocation、name、email |
| payment | Object | 是 | 支付信息 | 示例 totalAmount、insuranceAmount、currency、paymentType |
| dimWeight | Object | 是 | 包裹尺寸重量 | 示例 length、width、weight、height |
| options | Object | 否 | 包裹附加选项 | 示例 orderSource、openBox、deliveryNote、partnerOrderId、VAS 选项等；子 schema 未展开 |
| deliveryOption | String | 是 | 配送服务 | standard / economy |

响应：retryable:Boolean、traceId:String、success:Boolean、errorMessage:String、errorCode:String、errors:Object[]、data:Object。示例 data 含 routeCode、maxEta、minEta、portCode、packageCode、trackingNumber、firstMileShippingProvider/lastMileShippingProvider（tplSlug、tplName、tplCode）、options.promotionCode、appliedVas。注意幂等性与不可覆盖约束。

### 5.3.6 EpisPackageInfoUpdate — `POST /logistics/epis/packages/update` **[系统动作/个人信息变更]**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| packageCode | String | 是 | 包裹代码 | |
| receiverName | String | 是 | 收件人姓名 | PII |
| receiverPhone | String | 是 | 收件人电话 | PII |
| totalAmount | String | 否 | 支付总金额 | |
| insuranceAmount | String | 否 | 保价金额 | |
| deliveryNote | String | 否 | 配送备注 | |
| receiverAddress | Object | 否 | 收件地址 | 示例 details、id、type；完整子 schema 未展开 |

响应：retryable:Boolean、traceId:String、success:Boolean、errorMessage:String、errorCode:String、errors:Object[]。

### 5.3.7 EpisPackagePrintAwb — `GET /logistics/epis/packages/awb` **[系统动作/按需下载]**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| packageCode | String | 是 | EPIS 包裹代码 | |
| type | String | 是 | 运单格式 | pdf / zpl |

响应：retryable:Boolean、traceId:String、success:Boolean、errorMessage:String、errorCode:String、errors:Object[]、data:Object；示例 `data.url:String`。

### 5.3.8 EpisPackageReadyToBeShipped — `POST /logistics/epis/packages/rts` **[系统动作/高影响]**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---|---|---|
| trackingNumber | String | 是 | 物流追踪号 | consignment 后产生 |
| paidEstimatedShippingFee | String | 否 | 已付预估运费 | |

响应：retryable:Boolean、traceId:String、success:Boolean、errorMessage:String、errorCode:String、errors:Object[]、data:Object；示例 data 含包裹代码、ETA、承运商、路由和 VAS 字段。

### 5.3.9 EpisPackageReAttempt — `POST /logistics/epis/packages/reattempt` **[系统动作/需确认]**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---|---|---|
| packageCode | String | 是 | 包裹代码 | |
| reAttemptDateTime | Number | 否 | 再派送时间 | 示例毫秒时间戳 |
| sellerNote | String | 否 | 卖家备注 | |
| feedbackType | String | 否 | 反馈类型 | REATTEMPT / RETURN |

响应：retryable:Boolean、traceId:String、success:String、errorMessage:String、errorCode:String。

### 5.3.10 EpisQueryPackageHistory — `GET /logistics/epis/packages/history` **[系统同步/敏感信息受控]**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| includeTimeline | Boolean | 是 | 是否包含轨迹 | 描述 default false，但参数必填为 Yes |
| trackingNumber | String | 是 | 物流追踪号 | |
| includeShippingFee | Boolean | 否 | 是否返回运费 | |
| secret | String | 否 | 敏感字段访问校验 | 买家或卖家手机号后四位；不要写入日志或文档样例 |

响应：retryable:Boolean、traceId:String、data:Object、success:Boolean、errorMessage:String、errorCode:String、errors:Object[]。示例 data 字段含 chargeableDimWeight、shippingFee、packageCode、timeline[]、first/last mile provider、trackingNumber、destinationCountry、status、notifyVasFdStorage；timeline 示例字段含 shippingProvider、recipientType、trackingUrl、vehicleNumber、location、driverName、reasonCode、photos、processTime、status、epod、driverContact。示例类型以 String 为主，详情页未展开子 schema。

### 5.3.11 EpisXspaceCreate — `POST /logistics/epis/xspace/create` **[系统动作/售后工单]**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| caseTemplateId | Number | 否 | 工单模板 ID | |
| categoryId | String | 否 | 工单类别 ID | |
| subject | String | 是 | 主题 | |
| description | String | 是 | 描述 | |
| sellerName | String | 否 | 卖家名称 | |
| sellerEmail | String | 否 | 卖家邮箱 | PII |
| sellerPhoneNo | String | 否 | 卖家电话 | PII |
| buyerName | String | 否 | 买家名称 | PII |
| buyerEmail | String | 否 | 买家邮箱 | PII |
| trackingNumber | String | 否 | 追踪号 | |
| orderId | String | 否 | 订单 ID | |
| casePriority | String | 否 | 优先级 | |
| attachments | String | 否 | 附件 | 内部格式未展开 |
| attributes | String | 否 | 扩展属性 | 内部格式未展开 |
| platformName | String | 否 | 平台名称 | |
| externalSellerId | String | 否 | 外部卖家 ID | |

响应：retryable:Boolean、success:Boolean、traceId:String、errorMessage:String、errorCode:String、data:Object；示例 `data.caseId:String`。

### 5.3.12 EpisXspaceGetDetail — `POST /logistics/epis/xspace/detail` **[系统同步/售后工单]**

请求：caseId:Number（否）、platformName:String（否）、externalSellerId:String（否）。响应顶层 success:Boolean、errorMessage:String、errorCode:String、errors:Object[]、retryable:Boolean、traceId:String、data:Object。示例 data 含 gmtModified、attachments、orderId、buyerEmail、subject、sellerName、description、externalSellerId、sellerId、ratingRemark、caseId、id、platformName、trackingNumber、ratingReasons:String[]、contactName、buyerName、gmtCreate、sellerEmail、ratingStar、mails:Object[]、gmtDeleted、caseTemplateId、sellerPhoneNo、attributes、actions:Object[]、categoryId、status；多数示例为字符串或 null 文本，内部对象未展开。

### 5.3.13 EpisXspaceQuery — `GET/POST /logistics/epis/xspace/query` **[系统同步/售后工单]**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| caseIds | String[] | 否 | 工单 ID 列表 | |
| trackingNumbers | String[] | 否 | 追踪号列表 | |
| createTimeFrom | Number | 否 | 创建时间起点 | 毫秒时间戳 |
| createTimeTo | Number | 否 | 创建时间终点 | 毫秒时间戳 |
| pageSize | Number | 否 | 页大小 | |
| pageNo | Number | 否 | 页码 | |
| sortBy | String | 否 | 排序字段 | 示例 createdTime |
| sortOrder | String | 否 | 排序方向 | 示例 DESC |
| statuses | String[] | 否 | 状态过滤 | 示例 New |
| platformName | String | 否 | 平台名称 | |
| externalSellerId | String | 否 | 外部卖家 ID | |

响应 retryable:Boolean、traceId（参数表标 Boolean，但示例为字符串）、data:Object、success:String、errorMessage:String、errorCode:String、errors:Object[]。示例 data.page 含 totalRecords/pageNo/pageSize；data.content[] 与工单详情结构相似。

### 5.3.14 EpisXspaceRateTicket — `GET/POST /logistics/epis/xspace/rate` **[系统动作/评价]**

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| caseId | Number | 是 | 工单 ID | |
| platformName | String | 是 | 平台名称 | |
| externalSellerId | String | 是 | 外部卖家 ID | |
| ratingStar | Number | 是 | 星级评分 | |
| ratingReasons | String[] | 否 | 评分原因 | |
| ratingRemark | String | 否 | 评分备注 | |

响应 retryable:Boolean、traceId:String、success:Boolean、errorMessage:String、errorCode:String、errors:Object[]。

> EPIS 页面常将 access_token 标为可选，且需要独立合作方授权。创建包裹、取消、RTS、改收件地址、重派均改变外部业务状态，应加审批、审计及重试/幂等保护。第三方及买家姓名、电话、邮箱属 PII，严格控制留存。

## 6. 广告与营销促销

### 6.1 广告 API 状态

本次官方 Daraz API 类目目录快照没有找到 Sponsored Ads / 广告投放报表字段级接口。以下促销 API 不是广告表现报告，不应据此假设可以读取曝光、点击、花费、ROAS。

### 6.2 已核实目录中的营销促销 API（详情尚未逐端点抓取）

| 业务 | 路径示例 | 目录用途 |
|---|---|---|
| Seller Voucher | `/promotion/voucher/create`、`/promotion/voucher/update`、`/promotion/vouchers/get`、`/promotion/voucher/get`、`/promotion/voucher/activate`、`/promotion/voucher/deactivate`、SKU add/remove | 创建、修改、查询、启停优惠券及关联商品 |
| Free Shipping | `/promotion/freeshipping/create`、`/promotion/freeshipping/update`、`/promotion/freeshippings/get`、`/promotion/freeshipping/get`、启停、地区/配送选项和 SKU 管理 | 创建、修改、查询、启停免运费促销 |
| Flexicombo | `/promotion/flexicombo/create`、`/promotion/flexicombo/update`、`/promotion/flexicombo/list`、`/promotion/flexicombo/details`、启停及商品管理 | 创建/维护 Flexicombo 促销 |

**系统标记：** 查询/列表/详情接口 **[系统同步]**；create/update/activate/deactivate、SKU 关联/移除接口 **[系统动作/需审批]**。本轮尚未逐页抓取促销端点 schema，需后续按官方左侧目录逐个读取。

**字段表状态：** 本轮尚未逐项打开促销 API 详情；需后续按官方左侧目录逐端点补齐参数与响应字段。广告人工报表模板见第 8.2 节。

## 7. 其余目录分类与字段状态

左侧菜单还列出 System、Seller Voucher、Free Shipping、Product Review、Flexicombo、3PV Seller 等分类。本轮已完成用户指定的 Finance、Logistics、Fulfillment、Return/Refund、Seller；其他类别仍列为待补范围。

### 7.1 Seller API

| 路径 | 方法 | 用途 | 字段级状态 |
|---|---|---|---|
| `/seller/metrics/get` | GET | 获取卖家指标，如好评率、准时发货率 | **[系统同步]** 字段见下方 |
| `/rc/warehouse/get` | GET/POST | 按卖家查询仓库 | **[系统同步]** Response result 有示例，业务参数无 |
| `/rc/warehouse/detail/get` | GET | 按卖家查询仓库详情 | **[系统同步]** Response module 有示例，业务参数无 |

### 7.2 Seller API 字段级详情

### GetSellerMetricsById — `GET /seller/metrics/get` **[系统同步/卖家健康指标]**

官方页面未列业务请求参数（Parameter 区显示 No Data），仅 common auth 参数。响应 `data` 为 Object，响应示例可见以下成员；响应字段未逐项声明 required。

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---|---|---|
| ship_on_time | String | 官方未标 | 准时发货率 | 示例百分比数值字符串 |
| main_category_name | String | 官方未标 | 主营类目名称 | 示例 Furniture & Décor |
| positive_seller_rating | String | 官方未标 | 正向卖家评分 | 示例百分比字符串 |
| response_time | String | 官方未标 | 响应时长 | 示例十进制字符串 |
| main_category_id | String | 官方未标 | 主营类目 ID | 类目标识 |
| seller_id | String | 官方未标 | 卖家 ID | 平台卖家标识 |
| response_rate | String | 官方未标 | 响应率 | 示例小数字符串 |

错误码：`IllegalAccessToken`（access token 无效或过期）。

#### GetWarehouseBySellerId — `GET/POST /rc/warehouse/get` **[系统同步/仓库基础信息]**

- 业务请求参数：官方 Parameter 区显示 No Data。
- 响应参数：`result:Object`；schema 没有展开成员。
- 响应示例可见：`result.not_success:String`、`result.success:String`、`result.module:Object`、`result.error_code:String`；示例 module 为空对象，故不可据此建立仓库子字段模型。

#### QueryWarehouseDetailInfoBySellerId — `GET /rc/warehouse/detail/get` **[系统同步/仓库详情]**

- 业务请求参数：官方 Parameter 区显示 No Data。
- 响应参数：`result:Object`；错误码 `IllegalAccessToken` 表示 token 无效或过期。
- 响应示例字段（页面未逐项定义）：`result.not_success:String`、`result.success:String`、`result.module:Object`、`result.error_code:String`、`result.class_name:String`。

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---|---|---|
| result.module.country | String | 示例字段 | 国家 | |
| result.module.default_address | String | 示例字段 | 是否默认地址 | 示例 true |
| result.module.province | String | 示例字段 | 省/州 | |
| result.module.city | String | 示例字段 | 城市 | |
| result.module.detail_address | String | 示例字段 | 详细地址 | |
| result.module.warehouse_code | String | 示例字段 | 仓库代码 | |
| result.module.district | String | 示例字段 | 区县/区域代码 | |
| result.module.post_code | String | 示例字段 | 邮政编码 | |
| result.module.name | String | 示例字段 | 仓库名称 | |
| result.module.status | String | 示例字段 | 仓库状态 | 示例 ACTIVE |

### 7.3 其他官方菜单类别（已发现，待逐端点抓取）

| 官方分类 | 目录确认的接口范围 | 系统使用建议 | 当前 schema 状态 |
|---|---|---|---|
| System | Token create/refresh、Seller get | **[系统必需]** 认证与店铺元信息 | 本文此前抓过目录，详细字段未纳入本轮指定分类 |
| Seller Voucher API | Voucher create/update/list/detail/activate/deactivate、SKU add/remove | 查询 **[系统同步]**；写操作 **[系统动作/审批]** | 需逐端点抓字段 |
| Free Shipping API | 活动 create/update/list/detail/activate/deactivate、区域/配送选项、SKU 管理 | 查询同步，变更审批 | 需逐端点抓字段 |
| Product Review API | Review ID/list/reply | 读取同步；回复为系统动作 | 需逐端点抓字段 |
| Flexicombo API | 活动 create/update/list/detail/activate/deactivate、商品管理 | 查询同步，写入审批 | 需逐端点抓字段 |
| 3PV Seller API | 当前目录列表为空 | 不适用/待平台开放 | 没有目录端点 |

### 7.4 本轮抓取覆盖与 schema 边界

- **本轮指定范围已逐页读取**：Finance 2 个；Order 8 个；Fulfillment 8 个；Return and Refund 6 个；Seller API 3 个；Logistics API/EPIS 14 个。商品与 IM 的已整理接口见前文。
- **嵌套对象完整度**：官方某些接口只把请求/响应列为 `Object`，示例才暴露内部属性。文档将此类标成“示例字段”，并不声称是平台内部对象全部属性或 JSON Schema 中的 required 定义。
- **尚待逐页补齐**：商品写接口其余详情、IM 类别其余端点、广告/促销全端点、System 端点。相应目录表保留待抓取说明。
- **系统调用标记**：只读查询建议作为系统同步；写入/履约状态推进需要授权、校验、幂等处理和审计；EPIS 物流合作方接口与普通 Seller API 的权限边界不同。
- **官方文档日期**：页面更新时间从 2023 至 2025 不等。接入前应对照当前店铺站点、应用权限和实际 API Tester 响应验证。

## 8. 人工导入模板（CSV）

这些模板用于平台没有可用 API、权限尚未开通，或需导入控制台导出报表时。保持原字段，不要把空值补成猜测值。

### 8.1 售后 `after_sales_import.csv`

```csv
platform,site,seller_id,reverse_order_id,trade_order_id,request_type,reverse_status,ofc_status,return_to_type,shipping_type,dispute_in_progress,reason_code,reason_text,created_at,modified_at,refund_amount,currency,buyer_message,seller_reply,attachment_reference,source_file,imported_at,notes
```

### 8.2 广告 `ads_import.csv`

```csv
platform,site,seller_id,report_date,campaign_id,campaign_name,ad_group_id,ad_group_name,ad_type,product_id,seller_sku,keyword_or_target,placement,status,budget,bid,impressions,clicks,spend,currency,orders,units_sold,attributed_sales,roas,attribution_window,source_file,imported_at,notes
```

### 8.3 IM `im_import.csv`

```csv
platform,site,seller_id,session_id,message_id,order_id,buyer_id,buyer_display_name,from_account_type,from_account_id,to_account_type,to_account_id,template_id,message_type,content,send_time,auto_reply,status,process_msg,attachment_reference,source_file,imported_at,retention_until,notes
```

## 9. 限制与待补齐项

- 本轮通过官方浏览器详情页逐端点读取：Order 8 个、Finance 2 个、Fulfillment 8 个、Return/Refund 6 个、Seller 3 个、Logistics API/EPIS 14 个；商品和 IM 已整理接口见前文。
- 仍待逐页抓取：商品写接口其余端点、IM 类别其余端点、System、Seller Voucher、Free Shipping、Review、Flexicombo 促销接口。订单及本轮指定的 Finance、Logistics/EPIS、Fulfillment、Return/Refund、Seller 类别已访问官方详情。
- 对官方参数树只显示 Object 的请求/响应成员，本文件忠实记录页面明确声明与响应示例字段；不能把示例字段误当成穷尽 JSON Schema 或 Required 约束。此类字段已标“示例字段/官方未标”。
- 系统集成推荐优先级：①[系统必需]鉴权/签名；②[系统同步]商品、订单、物流轨迹、售后、财务和 IM 拉取；③[系统动作]价格库存、履约、售后取消及消息发送。写操作需权限最小化、幂等键/重复请求保护（平台支持时）、操作日志、人工确认和失败补偿。
- 创建/更新商品中类目属性动态变化，任何静态表都不能取代 `/category/attributes/get` 的实时类目 schema。

## 10. 官方来源

- Daraz API Reference：<https://open.daraz.com/doc/api.htm>
- 官方 API 类目目录：<https://open.daraz.com/handler/share/apidoc/getApiCategory.json?cid=1>（将 cid 替换为类别 ID）
- GetProducts 官方详情：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Fproducts%2Fget&methodType=GET&categoryId=1>
- GetProductItem 官方详情：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Fproduct%2Fitem%2Fget&categoryId=1>
- CreateProduct 官方详情：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Fproduct%2Fcreate&methodType=POST&categoryId=1>
- QueryTransactionDetails 官方详情：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Ffinance%2Ftransaction%2Fdetails%2Fget&categoryId=4>
- GetPayoutStatus 官方详情：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Ffinance%2Fpayout%2Fstatus%2Fget&categoryId=4>
- GetReverseOrdersForSeller 官方详情：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Freverse%2Fgetreverseordersforseller&categoryId=23>
- GetSessionList 官方详情：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Fim%2Fsession%2Flist&categoryId=21>
- GetMessages 官方详情：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Fim%2Fmessage%2Flist&categoryId=21>
- Alibaba ICBU 目录（非 Daraz API）：<https://developer.alibaba.com/docs/api_list.htm?spm=a219a.7629065.1.21.647d75feEWRbJ3>
