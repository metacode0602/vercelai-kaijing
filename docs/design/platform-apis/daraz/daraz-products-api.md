# Daraz 商品（Product）API 字段说明与使用方法

> 核验日期：2026-11-05。来源：Daraz 官方 API Reference（Product 分类 `cid=1`）。
> 官方入口：<https://open.daraz.com/doc/api.htm>
>
> 说明：官方响应参数表通常不声明子字段 required，因此响应字段统一标为“官方未标”。
> 商品类目属性是动态 schema，必须以 `/category/attributes/get` 的实时结果为准。

## 1. 接口清单

| 接口 | 方法 | 路径 | 用途 | 集成标记 |
|---|---|---|---|---|
| CreateProduct | POST | `/product/create` | 创建单个商品 | 系统动作/需审批 |
| DeactivateProduct | GET/POST | `/product/deactivate` | 停用商品或指定 SKU | 系统动作/高风险 |
| GetBrandByPages | GET | `/category/brands/query` | 分页查询品牌 | 系统同步 |
| GetCategoryAttributes | GET | `/category/attributes/get` | 查询类目属性 schema | 系统元数据同步 |
| GetCategoryTree | GET/POST | `/category/tree/get` | 查询类目树 | 系统元数据同步 |
| GetProductItem | GET | `/product/item/get` | 按 ItemId 或 SellerSku 查询单个商品 | 系统同步 |
| GetProducts | GET | `/products/get` | 分页查询商品 | 系统同步 |
| GetQcStatus | GET | `/product/qc/status/get` | 查询商品质检/审核状态 | 系统同步 |
| GetResponse | GET | `/image/response/get` | 查询批量图片迁移结果 | 系统同步 |
| MigrateImage | POST | `/image/migrate` | 迁移单张外站图片 | 系统动作 |
| MigrateImages | POST | `/images/migrate` | 批量迁移外站图片 | 系统动作 |
| RemoveProduct | POST | `/product/remove` | 删除商品或 SKU | 人工/运营，高风险 |
| SetImages | POST | `/images/set` | 设置商品图片 | 系统动作 |
| UpdatePriceQuantity | POST | `/product/price_quantity/update` | 更新价格与库存 | 系统动作/需校验 |
| UpdateProduct | POST | `/product/update` | 更新商品属性或 SKU | 系统动作/需审批 |
| UploadImage | POST | `/image/upload` | 上传单张图片 | 系统动作 |

## 2. GetProducts — `GET /products/get`

### 2.1 请求参数

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| filter | String | 是 | 商品状态过滤 | `all`、`live`、`inactive`、`deleted`、`image-missing`、`pending`、`rejected`、`sold-out` |
| update_before | String | 否 | 更新时间上界 | ISO 8601；含指定时刻 |
| create_before | String | 否 | 创建时间上界 | ISO 8601 |
| create_after | String | 否 | 创建时间下界 | ISO 8601 |
| update_after | String | 否 | 更新时间下界 | ISO 8601；增量同步首选 |
| limit | String | 否 | 每页数量 | 最大 50；接口以 String 接收 |
| options | String | 否 | 扩展库存信息 | `options=1` 返回 `ReservedStock`、`RtsStock`、`PendingStock`、`RealTimeStock`、`FulfillmentBySellable` |
| sku_seller_list | String | 否 | Seller SKU 过滤 | JSON 数组字符串，如 `["SKU-A","SKU-B"]`；整词匹配；最多 100 个 |
| offset | String | 否 | 跳过条数 | 已弃用；建议用时间条件滚动；最大 10000 |

### 2.2 响应字段

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| data.total_products | Number | 官方未标 | 商品总数 | 按 item 级计数 |
| data.products | Object[] | 官方未标 | 商品列表 | 元素字段见下 |
| data.products.primary_category | Number | 官方未标 | 主类目 ID | 平台类目 |
| data.products.attributes | Object | 官方未标 | 商品属性 | 键由类目决定，如 `name`、`brand`、`description` |
| data.products.skus | Object[] | 官方未标 | SKU 列表 | 子字段见 2.3 |
| data.products.item_id | Number | 官方未标 | 商品 ID | 平台商品标识 |
| data.products.created_time | String | 官方未标 | 创建时间 | 毫秒时间戳字符串 |
| data.products.updated_time | String | 官方未标 | 更新时间 | 毫秒时间戳字符串 |
| data.products.images | String[] | 官方未标 | 商品图片 URL | 商品级图片 |
| data.products.status | String | 官方未标 | 商品状态 | 审核/销售状态 |

### 2.3 SKU 字段（官方响应示例可见）

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| Status | String | 官方未标 | SKU 状态 | 示例 `active` |
| quantity | Number | 官方未标 | 库存数量 | 可为 0 |
| Available | Number | 官方未标 | 可售库存 | 平台可售量 |
| ReservedStock | Number | 官方未标 | 锁定库存 | `options=1` 时出现 |
| RtsStock | Number | 官方未标 | 可发货库存 | `options=1` 时出现 |
| PendingStock | Number | 官方未标 | 待处理库存 | `options=1` 时出现 |
| RealTimeStock | Number | 官方未标 | 实时库存 | `options=1` 时出现 |
| FulfillmentBySellable | Number | 官方未标 | 可履约量 | `options=1` 时出现 |
| product_weight | String | 官方未标 | 商品重量 | 字符串小数 |
| Images | String[] | 官方未标 | SKU 图片 | 可能含空字符串 |
| SellerSku | String | 官方未标 | 卖家 SKU | 商家定义 |
| ShopSku | String | 官方未标 | 店铺 SKU | 平台生成 |
| SkuId | Number | 官方未标 | 平台 SKU ID | 系统生成 |
| Url | String | 官方未标 | 商品页 URL | 站点 URL |
| package_width / package_height / package_length / package_weight | String | 官方未标 | 包裹尺寸重量 | 字符串小数 |
| price | Number | 官方未标 | 售价 | 站点币种 |
| special_price | Number | 官方未标 | 特价 | 可为空 |
| special_from_time / special_to_time / special_to_date | String | 官方未标 | 特价时间 | 格式以响应为准 |
| multiWarehouseInventories | Object[] | 官方未标 | 多仓库存 | 含 `warehouseCode`、`quantity` |

## 3. GetProductItem — `GET /product/item/get`

### 3.1 请求参数

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| item_id | Number | 否 | 商品 ID | 与 `seller_sku` 至少提供一个 |
| seller_sku | String | 否 | 卖家 SKU | 与 `item_id` 至少提供一个 |

### 3.2 响应字段

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| data.subStatus | String | 官方未标 | 商品子状态 | 如 `Lock`、`Reject`、`Live_Reject`、`Admin` |
| data.suspendedSkus | Object[] | 官方未标 | 被暂停 SKU | 官方未展开子字段 |
| data.variation | Object | 官方未标 | 变体定义 | 可含 `variation1` 至 `variation4` |
| data.variation.variationN.name | String | 官方未标 | 变体名称 | 如 `color_family`、`Size` |
| data.variation.variationN.has_image | Boolean | 官方未标 | 变体是否有图 | 个别响应可能为字符串 |
| data.variation.variationN.customize | Boolean | 官方未标 | 是否自定义 | 个别响应可能为字符串 |
| data.variation.variationN.options | String[] | 官方未标 | 变体选项 | 选项值列表 |
| data.variation.variationN.label | String | 官方未标 | 变体标签 | 展示名 |
| data.primary_category | Number | 官方未标 | 主类目 ID | |
| data.attributes | Object | 官方未标 | 商品属性 | 类目属性键值 |
| data.skus | Object[] | 官方未标 | SKU 列表 | 字段同 2.3 |
| data.item_id | Number | 官方未标 | 商品 ID | |
| data.created_time | String | 官方未标 | 创建时间 | |
| data.updated_time | String | 官方未标 | 更新时间 | |
| data.images | String | 官方未标 | 商品图片 | schema 为 String，内容常为 JSON 数组文本 |
| data.marketImages | String | 官方未标 | 市场图片 | 同上 |
| data.status | String | 官方未标 | 商品状态 | `Active`、`InActive`、`Pending QC`、`Suspended`、`Deleted` 等 |
| data.invisible | Object | 官方未标 | 买家侧不可见原因 | 可能含 OVL/履约率原因 |

## 4. CreateProduct — `POST /product/create`

### 4.1 请求

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| payload | String（XML） | 是 | 商品创建 XML | 根节点 `Request/Product` |

`payload` 中可核对的结构（官方示例字段，是否必填由类目决定）：

| 字段名 | 类型 | 含义 | 说明 |
|---|---|---|---|
| Product.PrimaryCategory | Number | 主类目 ID | 必须来自有效类目树 |
| Product.SPUId | String | SPU ID | 可为空，是否必需取决于站点/类目 |
| Product.AssociatedSku | String | 关联 SKU | 可为空 |
| Product.Images.Image | String | 商品图片 | 可重复节点 |
| Product.Attributes.name | String | 商品名称 | |
| Product.Attributes.short_description | String | 简短描述 | HTML/文本限制以类目规范为准 |
| Product.Attributes.brand | String | 品牌 | 需有效品牌值/授权 |
| Product.Attributes.model | String | 型号 | 类目属性示例 |
| Product.Attributes.delivery_option_sof | String | 卖家自配送 | 仅卖家履约商品设 `Yes` |
| Product.Attributes.* | 类目定义 | 其他类目属性 | 必须先调 `/category/attributes/get` |
| Product.Skus.Sku.SellerSku | String | 卖家 SKU | 商家自定义，需唯一 |
| Product.Skus.Sku.quantity | Number | 库存数量 | |
| Product.Skus.Sku.price | Number | 售价 | 精度受站点规则限制 |
| Product.Skus.Sku.package_length / height / width / weight | Number | 包裹尺寸重量 | 单位依站点规范 |
| Product.Skus.Sku.package_content | String | 包裹内容描述 | |
| Product.Skus.Sku.Images.Image | String | SKU 图片 | 可重复节点 |
| Product.Skus.Sku.* | 类目定义 | SKU 销售属性 | 如 `color_family`、`size` |

### 4.2 响应

| 字段名 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| data.item_id | Number | 官方未标 | 新商品 ID |
| data.sku_list | Object[] | 官方未标 | SKU 标识列表 |
| data.sku_list.seller_sku | String | 官方未标 | 输入卖家 SKU |
| data.sku_list.shop_sku | String | 官方未标 | 平台生成店铺 SKU |
| data.sku_list.sku_id | Number | 官方未标 | 平台 SKU ID |

## 5. UpdateProduct — `POST /product/update`

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| payload | String（XML） | 是 | 更新 XML | 结构参考 `/product/create`；官方页面注明 2020-06-25 为 DBS 变更更新 |

响应 `data.variation` 可返回 `Variation1` 至 `Variation4`，每项含 `name`、`has_image`、`customize`、`options`。
更新时只提交需要变更的字段；SKU 的增删改要结合 `SellerSku` / `SkuId`，避免误改其他变体。

## 6. UpdatePriceQuantity — `POST /product/price_quantity/update`

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| payload | Payload（XML/JSON 字符串） | 是 | 价格库存更新体 | 单次最多 50，建议 20 |

官方详情页只把 `payload` 声明为 `Payload`，未展开成员。已知约束：

- 单次最多更新 50 个商品，官方建议 20 个。
- 只更新价格/数量，不触发商品审核；但会直接影响平台可售量。
- 必须用本地库存版本号或幂等键防止重复扣减/覆盖。
- 价格精度、币种、最小库存单位以站点规则为准。

> 未确认：Daraz 页面未展开 `payload` 的 XML 字段清单。接入前必须用官方 API Tester 验证 `ItemId`、`SkuId`/`SellerSku`、`Price`、`Quantity` 的实际字段名。不要直接照搬其他平台字段。

## 7. 商品状态与质检

### 7.1 GetQcStatus — `GET /product/qc/status/get`

| 方向 | 字段名 | 类型 | 必填 | 含义 |
|---|---|---|---:|---|
| 请求 | offset | Number | 是 | 跳过条数 |
| 请求 | limit | Number | 是 | 返回条数，默认 100 |
| 请求 | seller_skus | String[] | 是 | 指定 SKU 列表 |
| 响应 | data[].seller_sku | String | 官方未标 | 卖家 SKU |
| 响应 | data[].data_changed | String | 官方未标 | `1` 数据变化，`0` 未变化 |
| 响应 | data[].status | String | 官方未标 | `PASS=1`、`REJECT=0`、`PENDING=-1`、`APPROVING=-2`、`LIVE_REJECT=-3`、`LOCK=-4` |
| 响应 | data[].reason | String | 官方未标 | 原因 |

### 7.2 商品/Listing 状态

| 来源 | 取值 | 含义 |
|---|---|---|
| GetProducts.filter | `all` / `live` / `inactive` / `deleted` / `image-missing` / `pending` / `rejected` / `sold-out` | 查询过滤 |
| GetProductItem.status | `Active` / `InActive` / `Pending QC` / `Suspended` / `Deleted` | 商品状态 |
| GetProductItem.subStatus | `Lock` / `Reject` / `Live_Reject` / `Admin` | 子状态 |
| GetQcStatus.status | `PASS` / `REJECT` / `PENDING` / `APPROVING` / `LIVE_REJECT` / `LOCK` | 质检状态 |

## 8. 类目与品牌

### 8.1 GetCategoryTree — `GET/POST /category/tree/get`

无业务请求参数；响应 `data` 为类目数组。类目节点通常含类目 ID、名称、父子关系、是否叶子；以实际响应为准。

### 8.2 GetCategoryAttributes — `GET /category/attributes/get`

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| primary_category_id | String | 是 | 类目 ID | 要查询的类目 |
| language_code | String | 否 | 语言 | 默认 `en_US`；支持 `en_SG`、`th_TH`、`id_ID`、`vi_VN`、`fil_PH`、`ms_MY` |

| 响应字段 | 类型 | 含义 | 说明 |
|---|---|---|---|
| data[].id | Number | 属性 ID | |
| data[].name | String | 属性名 | 提交时使用 |
| data[].label | String | 展示名 | 人类可读 |
| data[].is_mandatory | Number | 是否必填 | `1` 必填 |
| data[].attribute_type | String | 属性类型 | 官方定义 |
| data[].input_type | String | 输入类型 | `text`、`date`、`numeric`、`img`、`rich text`、`singleSelect`、`multiSelect`、`enumInput`、`multiEnumInput` |
| data[].options | Object[] | 可选值 | 含 `name` |
| data[].is_sale_prop | Number | 是否销售属性 | 用于变体 |
| data[].advanced | Object | 高级配置 | `is_key_prop` 等 |

### 8.3 GetBrandByPages — `GET /category/brands/query`

| 字段名 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| startRow | String | 是 | 跳过条数 |
| pageSize | String | 是 | 每页数量，默认 40，最大 200 |

响应 `data.module[]` 含 `brand_id`、`name`、`name_en`、`global_identifier`；另有 `total_record`、`page_size` 等分页字段。

## 9. 图片

| 接口 | 请求字段 | 响应字段 | 说明 |
|---|---|---|---|
| UploadImage `POST /image/upload` | `image`：byte[]，必填 | `data.image.url`、`data.image.hash_code` | JPG/PNG，单图 ≤ 1MB |
| MigrateImage `POST /image/migrate` | `payload`：String，必填 | `data.image.url`、`data.image.hash_code` | 迁移外站单图 |
| MigrateImages `POST /images/migrate` | `payload`：String，必填 | `batch_id` | 单次最多 8 张 |
| GetResponse `GET /image/response/get` | `batch_id`：String，必填 | `data.images[]`、`data.errors[]` | 查询批量迁移结果 |
| SetImages `POST /images/set` | `payload`：Payload，必填 | `data` | 绑定图片 URL 到商品 |

## 10. 使用方法

### 10.1 商品同步

```text
定时任务
  → GET /products/get?filter=all&update_after=<上次水位>&limit=50
  → 按 item_id upsert listings/products
  → 按 SellerSku / SkuId upsert seller_sku_mappings
  → options=1 时同步 ReservedStock / RtsStock / PendingStock / RealTimeStock
  → 对 sold-out / rejected / pending 商品进入运营告警
```

### 10.2 创建/更新商品

1. 先调 `/category/tree/get` 找到叶子类目。
2. 调 `/category/attributes/get` 获取该叶子类目的必填属性和可选值。
3. 校验品牌：`/category/brands/query`。
4. 上传图片：`/image/upload` 或 `/image/migrate`。
5. 组装 XML `payload`，提交 `/product/create` 或 `/product/update`。
6. 用 `/product/item/get` 或 `/product/qc/status/get` 轮询审核结果。
7. 任何写操作进入 `pending_actions`，记录操作人、幂等键、请求摘要。

### 10.3 价格库存更新

- 只允许更新已映射的 `SellerSku` / `SkuId`。
- 更新前读取平台可售量与本地库存，计算目标值；不要用增量覆盖未知基线。
- 更新后回读 `GetProducts(options=1)` 校验 `quantity`、`Available`、`ReservedStock`。
- 失败时按错误码区分可重试/不可重试；不要无限重试。

## 11. 字段与 ERP 映射建议

| API 字段 | ERP 表/字段 | 说明 |
|---|---|---|
| item_id | `listings.external_item_id` | 平台商品 ID |
| SellerSku | `seller_sku_mappings.seller_sku` | 平台卖家 SKU |
| SkuId | `seller_sku_mappings.platform_sku_id` | 平台 SKU ID |
| primary_category | `listings.category_external_id` | 类目 |
| attributes | `listings.attributes`（jsonb） | 类目属性快照 |
| images | `listings.payload` / 新增图片表 | 建议新增 `listing_images` |
| status / subStatus | `listings.status` + 新增 `platform_status` | 需区分平台原值 |
| quantity / Available | `inventory_balances` 或新增平台库存快照表 | 平台库存不等于本地库存 |
| ReservedStock / RtsStock / PendingStock / RealTimeStock | 新增 `listing_stock_snapshots` | 用于对账与锁库校验 |
| QC status / reason | 新增 `product_qc_statuses` | 审核轨迹 |

## 12. 官方来源

- 分类目录：<https://open.daraz.com/handler/share/apidoc/getApiCategory.json?cid=1>
- GetProducts：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Fproducts%2Fget&methodType=GET&categoryId=1>
- GetProductItem：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Fproduct%2Fitem%2Fget&methodType=GET&categoryId=1>
- CreateProduct：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Fproduct%2Fcreate&methodType=POST&categoryId=1>
- UpdateProduct：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Fproduct%2Fupdate&methodType=POST&categoryId=1>
- UpdatePriceQuantity：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Fproduct%2Fprice_quantity%2Fupdate&methodType=POST&categoryId=1>
