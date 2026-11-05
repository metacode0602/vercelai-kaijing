# Lazada 商品（Product）API 字段说明与使用方法

> 核验日期：2026-11-05。来源：Lazada 官方 API Reference（Product `cid=5`，28 个接口）。
> 官方入口：<https://open.lazada.com/doc/api.htm>
> 通用签名、host、分页约定见 `lazada-common-conventions.md`。
> 库存与订单的扣减关系见 `lazada-order-status-erp-mapping.md`。

## 1. 接口清单

### 1.1 查询与类目

| 接口 | 方法 | 路径 | 用途 | 集成标记 |
|---|---|---|---|---|
| GetProducts | GET | `/products/get` | 分页查询商品 | 系统同步 |
| GetProductItem | GET | `/product/item/get` | 按 item_id 查单个商品 | 系统同步 |
| GetCategoryTree | GET | `/category/tree/get` | 全量类目树 | 缓存/同步 |
| GetCategoryAttributes | GET | `/category/attributes/get` | 类目属性 schema | 发布前实时查 |
| GetBrandByPages | GET/POST | `/category/brands/query` | 品牌分页查询 | 发布前查 |
| GetCategorySuggestion | GET | `/product/category/suggestion/get` | 类目推荐 | 可选 |
| GetNextCascadeProp | GET/POST | `/category/cascade/getNextCascadeProp` | 级联属性 | 可选 |
| GetSellerItemLimit | GET | `/product/seller/item/limit` | 卖家商品额度 | 发布前校验 |
| GetPreQcRules | GET/POST | `/product/seller/item/getPreQcRules` | 预 QC 规则 | 发布前校验 |
| GetProductContentScore | GET/POST | `/product/content/score/get` | 内容分 | 可选 |
| GetQCAlertProducts | GET | `/product/qc/alert/list` | QC 风险商品 | 运营巡检 |
| GetUnfilledAttributeItem | GET/POST | `/product/unfilled/attribute/get` | 缺失属性商品 | 运营巡检 |
| ProductCheck | GET/POST | `/product/pre/check` | 发布前检查 | 发布前 |

### 1.2 写入与媒体

| 接口 | 方法 | 路径 | 用途 | 集成标记 |
|---|---|---|---|---|
| CreateProduct | POST | `/product/create` | 创建商品 | 待审后写 |
| UpdateProduct | POST | `/product/update` | 更新属性/SKU | 待审后写 |
| UpdatePriceQuantity | POST | `/product/price_quantity/update` | 批量改价/库存 | 待审后写 |
| UpdateSellableQuantity | GET/POST | `/product/stock/sellable/update` | 设置可售库存（绝对值） | 待审后写 |
| AdjustSellableQuantity | POST | `/product/stock/sellable/adjust` | 增减可售库存（增量） | 待审后写 |
| DeactivateProduct | POST | `/product/deactivate` | 下架商品/SKU | 待审后写 |
| RemoveProduct | POST | `/product/remove` | 删除商品/SKU | 高危，人工 |
| RemoveSku | POST | `/product/sku/remove` | 删除 SKU | 高危，人工 |
| UploadImage | POST | `/image/upload` | 上传图片 | 系统动作 |
| MigrateImage | POST | `/image/migrate` | 迁移单图 | 系统动作 |
| MigrateImages | POST | `/images/migrate` | 迁移多图 | 系统动作 |
| SetImages | POST | `/images/set` | 设置图片 | 待审后写 |
| GetResponse | GET | `/image/response/get` | 查询图片处理结果 | 系统轮询 |
| GetSizeChartTemplate | GET | `/size/chart/template/get` | 尺码表模板 | 可选 |
| BatchUpdateSizeChart | POST | `/size/chart/batch/update` | 批量更新尺码表 | 可选 |

## 2. 商品与 SKU 主键

| 平台字段 | 含义 | 内部落点 | 注意 |
|---|---|---|---|
| `item_id` / `ItemId` | 平台商品 ID | `listings.external_item_id` | 不同国家不保证唯一 |
| `SellerSku` / `seller_sku` | 卖家 SKU | `seller_sku_mappings.seller_sku` | 店铺内唯一 |
| `ShopSku` / `shop_sku` | 平台生成的店铺 SKU | `seller_sku_mappings.meta` 或独立列 | 平台侧唯一 |
| `SkuId` / `sku_id` | 平台 SKU ID | `seller_sku_mappings.platform_sku_id` | 与 item_id、SellerSku 独立 |
| `primary_category` | 主类目 ID | `listings.category_external_id` | 发布前实时校验 |
| `warehouseCode` | 仓库代码 | 库存快照维度 | 多仓卖家必须保留 |

> 官方字段表把部分数值字段标成 String（如 `sku.sku_id`），接入时按实际 JSON 解析，不要强依赖官方类型列。

## 3. GetProducts — `GET /products/get`

### 3.1 请求参数

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| filter | String | 否（官方描述称 Mandatory） | 状态过滤 | `all` / `live` / `inactive` / `deleted` / `pending` / `rejected` / `sold-out` |
| update_after | String | 否 | 更新时间下界 | ISO 8601，增量同步首选 |
| update_before | String | 否 | 更新时间上界 | ISO 8601 |
| create_after | String | 否 | 创建时间下界 | ISO 8601 |
| create_before | String | 否 | 创建时间上界 | ISO 8601 |
| offset | String | 否 | 跳过条数 | 官方已弃用，最大 10000 |
| limit | String | 否 | 返回条数 | 最大 50 |
| options | String | 否 | 返回库存明细 | `Options=1` 时包含 Reserved/Rts/Pending/RealTime/FulfillmentBySellable |
| sku_seller_list | String | 否 | 按 SellerSku 过滤 | JSON 数组字符串，最多 100 个 |

### 3.2 响应字段

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| data.total_products | Number | 否 | 商品总数 | item 级 |
| data.products | Object[] | 否 | 商品列表 | |
| data.products.item_id | Number | 否 | 商品 ID | |
| data.products.primary_category | Number | 否 | 主类目 ID | |
| data.products.status | String | 否 | 平台状态 | `Active` / `InActive` / `Pending QC` / `Suspended` / `Deleted` |
| data.products.subStatus | String | 否 | 审核子状态 | `Lock` / `Reject` / `Live Reject` / `Admin` |
| data.products.created_time | String | 否 | 创建时间 | 毫秒时间戳字符串 |
| data.products.updated_time | String | 否 | 更新时间 | 毫秒时间戳字符串 |
| data.products.images | String[] | 否 | 商品图 | |
| data.products.marketImages | String[] | 否 | 市场图 | |
| data.products.attributes | Object | 否 | 类目属性 | 动态 key，必须按 schema 解析 |
| data.products.skus | Object[] | 否 | SKU 列表 | 见 3.3 |
| data.products.trialProduct | Boolean | 否 | 是否试用商品 | |
| data.products.suspendedSkus | Object[] | 否 | 被暂停 SKU | 含 `SellerSku`、`SkuId`、`rejectReason` |
| data.products.rejectReason | Object[] | 否 | 拒绝原因 | `suggestion` / `violationDetail` |
| data.products.hiddenReason | String | 否 | 隐藏原因 | |
| data.products.hiddenStatus | String | 否 | 隐藏端 | 如 `Android & IOS` |

### 3.3 SKU 字段

| 字段名 | 类型 | 含义 | 说明 |
|---|---|---|---|
| SellerSku | String | 卖家 SKU | 映射键 |
| ShopSku | String | 平台店铺 SKU | |
| SkuId | Number | 平台 SKU ID | |
| Status | String | SKU 状态 | 示例 `active` |
| quantity | Number | 总库存 | 官方示例 |
| Available | Number | 可售库存 | 建议与 `quantity` 区分 |
| price | Number | 售价 | |
| special_price | Number | 特价 | |
| special_from_date / special_to_date | String | 特价区间 | |
| package_length / package_width / package_height | String | 包装尺寸 | 单位以类目/站点为准 |
| package_weight | String | 包装重量 | |
| Url | String | 商品链接 | |
| multiWarehouseInventories | Object[] | 多仓库存 | 见 3.4 |
| fblWarehouseInventories | Object[] | FBL 仓库存 | 仅 FBL |
| channelInventories | Object[] | 渠道库存 | `channelName`、`startTime`、`endTime`、`sellableQuantity` |

### 3.4 多仓库存字段

| 字段名 | 类型 | 含义 | ERP 用法 |
|---|---|---|---|
| warehouseCode | String | 仓库代码 | 库存快照维度 |
| quantity | Number | 总库存 | 平台仓总库存 |
| totalQuantity | Number | 总库存（含占用/保留） | 与 `quantity` 关系以实际响应为准 |
| sellableQuantity | Number | 可售库存 | 推送/对账主字段 |
| occupyQuantity | Number | 已占用 | 订单占用参考 |
| withholdQuantity | Number | 保留/扣留 | 风控/审核保留 |

> 官方 `options=1` 描述提到 `ReservedStock`、`RtsStock`、`PendingStock`、`RealTimeStock`、`FulfillmentBySellable`，但实际字段以响应 JSON 为准；不能只按字段名猜语义。

### 3.5 使用方法

```text
首次全量：filter=all&limit=50&offset=0...
增量：filter=all&update_after=<上次水位>&limit=50
库存对账：filter=all&options=1&limit=50
```

- 单页最大 50；`offset` 已弃用且最大 10000，长期同步应使用时间窗。
- `attributes` 是动态对象，不能映射为固定列；值存 `listings.attributes`，原始响应存 `raw`。
- SKU 映射以 `SellerSku` + `SkuId` 双键校验；不要只用 `ShopSku`。
- 平台库存分解必须落快照表；不要用 `listings.stock_on_hand` 覆盖所有仓库。

## 4. GetProductItem — `GET /product/item/get`

| 字段名 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| item_id | Number | 是 | 商品 ID |
| seller_sku | String | 否 | 已废弃，2023-11-15 后不再支持 |

响应与 `GetProducts` 的单个 product 基本一致，但字段名有差异：`itemId`、`primaryCategory`、`createdTime`、`updatedTime`、`productImageList`、`marketImageList`、`skus`。

- 适合详情页/单商品修复；批量同步仍用 `/products/get`。
- `variation` 结构为 `variation1..4`，含 `name`、`options`、`has_image`、`customize`、`label`。
- `bizSupplement` 是跨境/全球商品扩展，不能丢弃。

## 5. 类目与属性

### 5.1 GetCategoryTree — `GET /category/tree/get`

| 字段名 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| language_code | String | 否 | 语言，默认 `en_US`；支持 `en_SG`、`th_TH`、`id_ID`、`vi_VN`、`fil_PH`、`ms_MY` |

响应节点：`category_id`、`name`、`leaf`、`var`、`children[]`。

- 类目树按站点不同；不要跨站复用 `category_id`。
- 只允许叶子类目发布商品；`leaf=true` 才是可发布类目。

### 5.2 GetCategoryAttributes — `GET /category/attributes/get`

| 字段名 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| primary_category_id | String | 是 | 叶子类目 ID |
| language_code | String | 否 | 语言 |

响应字段：

| 字段名 | 类型 | 含义 | 说明 |
|---|---|---|---|
| data.name | String | 属性名 | 提交时使用 |
| data.label | String | 展示名 | |
| data.is_mandatory | Number | 是否必填 | `1` 必填 |
| data.attribute_type | String | 属性类型 | `normal` 等 |
| data.input_type | String | 输入类型 | `text` / `date` / `numeric` / `img` / `rich text` / `singleSelect` / `multiSelect` / `enumInput` / `multiEnumInput` |
| data.options | Object[] | 选项 | `name` / `en_name` / `id` |
| data.unit | Object | 单位 | `type[]`、`numericMin`、`numericMax`、`precision` |
| data.is_sale_prop | Number | 是否销售属性 | 影响变体 |
| data.advanced.is_key_prop | Number | 是否关键属性 | |

- 发布前必须实时拉取；属性会随类目规则变化。
- `input_type` 决定校验逻辑；`multiEnumInput` 支持自定义值。
- 属性值直接放 `Attributes`；不要自行拼中文 label。

### 5.3 GetBrandByPages — `GET/POST /category/brands/query`

| 字段名 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| startRow | String | 是 | 跳过条数 |
| pageSize | String | 是 | 每页数量，最大 200 |

响应：`brand_id`、`name`、`name_en`、`global_identifier`、`total_record`、`page_size`。

## 6. CreateProduct — `POST /product/create`

### 6.1 请求结构

官方把业务主体放在 `payload`，示例为 JSON；也支持 XML 风格字段名。核心结构：

```json
{
  "Request": {
    "Product": {
      "PrimaryCategory": "10002019",
      "Images": { "Image": ["https://..."] },
      "Attributes": {
        "name": "商品名",
        "description": "描述",
        "brand": "No Brand",
        "model": "model",
        "short_description": "短描述"
      },
      "Skus": {
        "Sku": [
          {
            "SellerSku": "seller-sku-1",
            "quantity": "3",
            "price": "35",
            "special_price": "33",
            "special_from_date": "2026-01-01 00:00:00",
            "special_to_date": "2026-01-31 23:59:59",
            "package_length": "10",
            "package_width": "10",
            "package_height": "10",
            "package_weight": "0.5",
            "package_content": "box",
            "Images": { "Image": ["https://..."] }
          }
        ]
      }
    }
  }
}
```

| 字段 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| PrimaryCategory | String | 是 | 叶子类目 | 必须先验证 |
| Images.Image | String[] | 是 | 商品图 | |
| Attributes | Object | 是 | 类目属性 | 含 name/description/brand 等 |
| Skus.Sku | Object[] | 是 | SKU 列表 | |
| SellerSku | String | 是 | 卖家 SKU | 店铺内唯一 |
| quantity | String/Number | 是 | 初始库存 | |
| price | String/Number | 是 | 售价 | |
| special_price | String/Number | 否 | 特价 | |
| special_from_date / special_to_date | String | 否 | 特价区间 | |
| package_length/width/height/weight | String | 是 | 包装尺寸重量 | |
| package_content | String | 否 | 包装内容 | |
| coming_soon | String | 否 | 预售时间 | |
| delay_delivery_days | Number | 否 | 延迟发货天数 | |
| Images.Image | String[] | 否 | SKU 图 | |

### 6.2 响应

| 字段名 | 类型 | 含义 | 说明 |
|---|---|---|---|
| data.item_id | Number | 商品 ID | 不同国家不唯一 |
| data.item_status | String | 创建后状态 | `Active` / `InActive` / `Pending QC` |
| data.sku_list | Object[] | SKU 结果 | |
| data.sku_list.seller_sku | String | 卖家 SKU | |
| data.sku_list.shop_sku | String | 平台店铺 SKU | |
| data.sku_list.sku_id | Number | 平台 SKU ID | |

- `Pending QC` 需要平台审核，通常 24 小时内处理；不要立即重复提交。
- 创建成功以 `item_id` 为准，不以 HTTP 200 为准。

## 7. UpdateProduct — `POST /product/update`

- 官方明确：**改库存、下架、价格不建议用此接口**；分别用库存/价格接口。
- `payload` 为 XML 字符串；核心字段：`ItemId`、`Attributes`、`Skus.Sku[]`（`SkuId`、`SellerSku`、`quantity`、`price`、包装尺寸、`Images`、`trialProduct`）。
- 响应 `data.item_status`、`data.variation`。
- 更新属性时只传需要变更的字段；但部分类目要求全量属性，发布前用 `ProductCheck` 校验。
- 修改前后都拉取 `GetProductItem` 做差异审计。

## 8. 价格与库存

### 8.1 UpdatePriceQuantity — `POST /product/price_quantity/update`

- 单次最多 50 个商品，官方建议 20 个以内。
- `payload` XML，SKU 字段：`ItemId`、`SkuId`、`SellerSku`、`Price`、`SalePrice`、`SaleStartDate`、`SaleEndDate`、`MultiWarehouseInventories`。
- 多仓库存用 `MultiWarehouseInventory.WarehouseCode` + `Quantity`。
- 响应仅 `data`；必须回查 `GetProductItem` 确认落库。

### 8.2 UpdateSellableQuantity — `/product/stock/sellable/update`

- **绝对值**设置可售库存。
- 支持单仓 `SellableQuantity` 或多仓 `MultiWarehouseInventories`。
- 单次最多 50 个商品，建议 20 个以内。

### 8.3 AdjustSellableQuantity — `/product/stock/sellable/adjust`

- **增量**调整可售库存。
- 预库存（pre-inventory）字段：`BizType=2`、`BizCode`、`ShipTime`、`WarehouseCode`、`SellableQuantity`。
- 删除预库存用 `SellableQuantity = -99999999999`（官方示例中的哨兵值；实现前确认站点支持）。

> ERP 推库存必须选择一种模式并固定：全量对账用 `update`，事件驱动用 `adjust`。混用会导致重复扣减。

## 9. 状态、图片与删除

- 商品状态：`Active`、`InActive`、`Pending QC`、`Suspended`、`Deleted`。
- 审核子状态：`Lock`、`Reject`、`Live Reject`、`Admin`。
- `DeactivateProduct`：下架商品或指定 SKU；请求含 `ItemId`，可选 `Skus.SkuId` / `SellerSku`。
- `RemoveProduct`：最多 50 个 SellerSku；`sku_id_list` 优先级最高，格式 `SkuId_<itemId>_<skuId>`。
- 删除是不可逆高危操作，必须人工确认并保留删除前快照。

## 10. 官方来源

| 资源 | URL |
|---|---|
| Product 分类 | <https://open.lazada.com/handler/share/apidoc/getApiCategory.json?cid=5&language=en> |
| GetProducts | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Fproducts%2Fget&methodType=GET&categoryId=5> |
| GetProductItem | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Fproduct%2Fitem%2Fget&methodType=GET&categoryId=5> |
| CreateProduct | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Fproduct%2Fcreate&methodType=POST&categoryId=5> |
| UpdatePriceQuantity | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Fproduct%2Fprice_quantity%2Fupdate&methodType=POST&categoryId=5> |
| UpdateSellableQuantity | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Fproduct%2Fstock%2Fsellable%2Fupdate&methodType=GET%2FPOST&categoryId=5> |
| AdjustSellableQuantity | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Fproduct%2Fstock%2Fsellable%2Fadjust&methodType=POST&categoryId=5> |
