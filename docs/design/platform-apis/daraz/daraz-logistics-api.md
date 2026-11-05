# Daraz 物流与履约（Logistics / Fulfillment）API 字段说明与使用方法

> 核验日期：2026-11-05。来源：Daraz 官方 API Reference（Fulfillment `cid=22`、Logistics API `cid=18`、Order 分类中的物流接口）。
> 官方入口：<https://open.daraz.com/doc/api.htm>
>
> 两套体系要区分：
> 1. **平台订单履约**：`/order/fulfill/pack`、`/order/package/rts`，操作 Daraz 订单包，卖家自发货（DBS）主流程。
> 2. **EPIS 物流**：`/logistics/epis/*`，外部伙伴/ERP 直接向 Daraz Logistics 建包、交运、打面单，适合自有仓或三方仓。

## 1. 接口清单

### 1.1 订单履约（Fulfillment）

| 接口 | 方法 | 路径 | 用途 | 集成标记 |
|---|---|---|---|---|
| Pack | POST | `/order/fulfill/pack` | 将订单项标记为已打包 | 系统动作/高风险 |
| ReadyToShip | POST | `/order/package/rts` | 将包裹标记为可发货（RTS） | 系统动作/高风险 |
| RecreatePackage | GET/POST | `/order/package/repack` | 重新建包 | 人工/运营 |
| PrintAWB | GET/POST | `/order/package/document/get` | 打印包裹面单（HTML/PDF） | 系统动作 |
| ConfirmDeliveryForDBS | POST | `/order/package/sof/delivered` | DBS/SOF 订单确认送达 | 系统动作 |
| FailedDeliveryForDBS | POST | `/order/package/sof/failed_delivery` | DBS/SOF 订单确认配送失败 | 系统动作 |
| GetOrderLogisticDetail | GET/POST | `/order/logistic/get` | 查询包裹物流详情（RTS 后） | 系统同步 |
| GetOrderTrace | GET/POST | `/logistic/order/trace` | 查询物流轨迹（RTS 后） | 系统同步 |

### 1.2 EPIS 物流

| 接口 | 方法 | 路径 | 用途 |
|---|---|---|---|
| EpisPackageCreation | POST | `/logistics/epis/packages` | 创建物流包 |
| EpisPackageConsignment | POST | `/logistics/epis/packages/consign` | 交运并取得 tracking number |
| EpisPackageReadyToBeShipped | POST | `/logistics/epis/packages/rts` | 标记包裹 RTS |
| EpisPackagePrintAwb | GET | `/logistics/epis/packages/awb` | 打印 AWB（pdf/zpl） |
| EpisPackageCancellation | POST | `/logistics/epis/packages/cancel` | 取消包裹 |
| EpisPackageReAttempt | POST | `/logistics/epis/packages/reattempt` | 重派/退回 |
| EpisPackageInfoUpdate | POST | `/logistics/epis/packages/update` | RTS 后更新收件信息 |
| EpisQueryPackageHistory | GET | `/logistics/epis/packages/history` | 按 tracking number 查物流历史 |
| CreateOrUpdateCustomerWarehouse | GET/POST | `/logistics/epis/customers/warehouses` | 创建/更新仓库 |
| CreateCustomerAccountRelationshipByOTP | GET/POST | `/logistics/epis/customers/external_relationships_bundle` | OTP 绑定外部卖家 |
| EpisXspaceCreate | POST | `/logistics/epis/xspace/create` | 创建物流工单 |
| EpisXspaceQuery | GET/POST | `/logistics/epis/xspace/query` | 查询物流工单 |
| EpisXspaceGetDetail | POST | `/logistics/epis/xspace/detail` | 工单详情 |
| EpisXspaceRateTicket | GET/POST | `/logistics/epis/xspace/rate` | 工单评价 |

## 2. 订单履约主流程（DBS）

```text
订单支付
  → 卖家打包：POST /order/fulfill/pack
      返回每个 order_item 的 package_id / tracking_number / shipment_provider
  → 打印面单：GET/POST /order/package/document/get
  → 标记可发货：POST /order/package/rts
  → 物流商揽收
  → 轨迹同步：GET/POST /logistic/order/trace
  → 妥投/失败：平台回传；SOF 场景可调用 delivered / failed_delivery
```

关键规则：

- `pack` 和 `rts` 单批最多 20 个订单/包裹。
- `result.success = true` **不代表全部成功**；必须逐个检查 `item_err_code = 0`。
- 相同订单的多个子订单会一起处理；不要并发对同一订单打包。
- `pack` 的 `delivery_type` 必填，官方示例为 `dropship`。
- `shipment_provider_code`：本地店（TFS）不能传；跨境店（NTFS）必须传；DBS 订单不能传。
- `shipping_allocate_type` 固定传 `TFS`。
- RTS 只接受 `package_id`，所以必须先成功打包取得 `package_id`。

## 3. Pack — `POST /order/fulfill/pack`

### 3.1 请求

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| packReq | Object | 是 | 请求体 | |
| packReq.pack_order_list | Object[] | 是 | 待打包列表 | 最多 20；同订单子单会一起处理 |
| packReq.pack_order_list.order_id | Number | 是 | 订单 ID | |
| packReq.pack_order_list.order_item_list | Number[] | 是 | 待打包订单项 ID | 同一订单的子订单项 |
| packReq.delivery_type | String | 是 | 配送类型 | 官方示例 `dropship` |
| packReq.shipment_provider_code | String | 条件 | 物流商代码 | 跨境店必传；本地店/DBS 不能传 |
| packReq.shipping_allocate_type | String | 是 | 发货分配类型 | 固定 `TFS` |

### 3.2 响应

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| result.success | Boolean | 是 | 批次是否受理 | `true` 仍需检查 item 级结果 |
| result.error_code | String | 是 | 批次错误码 | `success=false` 时存在 |
| result.error_msg | String | 是 | 批次错误信息 | |
| result.data.pack_order_list | Object[] | 官方未标 | 打包结果列表 | |
| result.data.pack_order_list.order_id | Number | 官方未标 | 订单 ID | |
| result.data.pack_order_list.order_item_list | Object[] | 官方未标 | 订单项结果 | |
| result.data.pack_order_list.order_item_list.order_item_id | Number | 官方未标 | 订单项 ID | |
| result.data.pack_order_list.order_item_list.item_err_code | String | 官方未标 | `0` 成功，其他失败 | |
| result.data.pack_order_list.order_item_list.msg | String | 官方未标 | 失败原因 | |
| result.data.pack_order_list.order_item_list.tracking_number | String | 官方未标 | 追踪号 | |
| result.data.pack_order_list.order_item_list.shipment_provider | String | 官方未标 | 物流商 | |
| result.data.pack_order_list.order_item_list.package_id | String | 官方未标 | 包裹 ID | RTS 必填 |
| result.data.pack_order_list.order_item_list.retry | Boolean | 官方未标 | 是否可重试 | |

## 4. ReadyToShip — `POST /order/package/rts`

| 方向 | 字段名 | 类型 | 必填 | 含义 |
|---|---|---|---:|---|
| 请求 | readyToShipReq | Object | 是 | 请求体 |
| 请求 | readyToShipReq.packages | Object[] | 是 | 包裹列表，最多 20 |
| 请求 | readyToShipReq.packages.package_id | String | 是 | 打包返回的包裹 ID |
| 响应 | result.success | Boolean | 是 | 批次是否受理 |
| 响应 | result.data.packages[].package_id | String | 官方未标 | 包裹 ID |
| 响应 | result.data.packages[].item_err_code | String | 官方未标 | `0` 成功 |
| 响应 | result.data.packages[].msg | String | 官方未标 | 失败原因 |
| 响应 | result.data.packages[].retry | String | 官方未标 | 是否可重试 |

> 官方把 `retry` 声明为 String；不要当 Boolean 解析。

## 5. 面单与文档

### 5.1 PrintAWB — `GET/POST /order/package/document/get`

| 方向 | 字段名 | 类型 | 必填 | 含义 |
|---|---|---|---:|---|
| 请求 | getDocumentReq | Object | 是 | 请求体 |
| 请求 | getDocumentReq.doc_type | String | 是 | `HTML` / `PDF` |
| 请求 | getDocumentReq.packages | Object[] | 是 | 包裹列表，最多 20 |
| 请求 | getDocumentReq.packages.package_id | String | 是 | 包裹 ID |
| 请求 | getDocumentReq.print_item_list | Boolean | 否 | 是否打印包裹内商品信息 |
| 响应 | result.data.file | String | 官方未标 | PDF/HTML 内容 |
| 响应 | result.data.doc_type | String | 官方未标 | 文档类型 |
| 响应 | result.data.pdf_url | String | 官方未标 | PDF URL，仅 PDF 类型 |

### 5.2 GetDocument（订单维度）

见 `daraz-orders-api.md`；支持 `invoice`、`shippingLabel`、`carrierManifest`，按 `order_item_ids` 获取。

## 6. 物流详情与轨迹（RTS 后）

### 6.1 GetOrderLogisticDetail — `GET/POST /order/logistic/get`

请求：

| 字段名 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| order_id | String | 是 | 订单 ID |
| package_id_list | String[] | 是 | 包裹 ID 列表 |
| locale | String | 是 | 语言/地区 |

响应：

| 字段名 | 类型 | 含义 |
|---|---|---|
| data.module | Object[] | 物流模块列表 |
| data.module.ofc_order_id | String | OFC 订单 ID |
| data.module.warehouse_detail_info | String | 仓库详情 |
| data.module.package_detail_info_list | Object[] | 包裹详情 |
| data.module.package_detail_info_list.ofc_package_id | String | OFC 包裹 ID |
| data.module.package_detail_info_list.tracking_number | String | 追踪号 |
| data.module.package_detail_info_list.order_line_info_list | String | 订单行信息 |
| data.module.package_detail_info_list.logistic_detail_info_list | Object[] | 轨迹事件 |
| ...logistic_detail_info_list.status_code | String | 状态码 |
| ...logistic_detail_info_list.detail_type | String | 事件类型 |
| ...logistic_detail_info_list.title | String | 事件标题 |
| ...logistic_detail_info_list.description | String | 事件描述 |
| ...logistic_detail_info_list.event_time | Number | 事件时间（毫秒） |
| ...logistic_detail_info_list.event_date | String | 事件日期 |
| ...logistic_detail_info_list.receive_time | Number | 接收时间 |
| ...logistic_detail_info_list.package_location_name | String | 包裹位置 |
| ...logistic_detail_info_list.proof_images | Object[] | 凭证图片 |

### 6.2 GetOrderTrace — `GET/POST /logistic/order/trace`

请求：

| 字段名 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| order_id | String | 是 | 订单 ID |
| locale | String | 否 | 语言/地区 |
| ofcPackageIdList | String[] | 否 | 包裹 ID 列表 |

响应是 `result` 包裹：

| 字段名 | 类型 | 含义 |
|---|---|---|
| result.success | Boolean | 是否成功 |
| result.data | Object[] | 包裹轨迹列表 |
| result.data.package_detail_info_list | Object[] | 包裹详情 |
| ...tracking_number | String | 追踪号 |
| ...ofc_package_id | String | OFC 包裹 ID |
| ...logistic_detail_info_list | Object[] | 轨迹事件（字段同 6.1） |
| result.error_code.display_message | String | 错误展示信息 |

> 两个接口都要求订单已 RTS；未 RTS 时返回错误。轨迹事件不是实时推送，需要定时轮询。

## 7. DBS/SOF 妥投确认

| 接口 | 请求 | 响应 | 用途 |
|---|---|---|---|
| ConfirmDeliveryForDBS | `dbsDeliveryReq.packages[].package_id`（必填，最多 20） | `result.data.packages[].item_err_code` | 卖家自配送确认送达 |
| FailedDeliveryForDBS | `dbsFailedDeliveryReq.packages[].package_id`（必填，最多 20） | `result.data.packages[].item_err_code` | 卖家自配送确认失败 |

两者都要求逐包裹检查 `item_err_code = 0`。

## 8. EPIS 建包与交运

### 8.1 创建/交运请求核心字段

`/logistics/epis/packages` 与 `/logistics/epis/packages/consign` 请求体基本一致；`consign` 额外返回可打印 AWB 的 tracking number。

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| packageType | String | 否 | 包裹类型 | `Sales_order` / `Customer_return` |
| externalOrderId | String | 是 | 外部订单 ID | **幂等键**；重复提交只认第一次，之后视为重复，不能改单 |
| platformOrderCreationTime | Number | 否 | 平台下单时间 | 毫秒时间戳，默认当前 |
| dangerousGood | Boolean | 是 | 是否危险品 | |
| items | Object[] | 是 | 商品列表 | 见下 |
| shipper | Object | 是 | 发货人/卖家 | `externalSellerId` 必填 |
| origin | Object | 是 | 发货地联系人 | 姓名、电话必填，地址 `details` 必填 |
| destination | Object | 是 | 收件地联系人 | 同上 |
| payment | Object | 是 | 支付信息 | `totalAmount`、`currency`、`paymentType`（`COD`/`NON-COD`）必填 |
| dimWeight | Object | 是 | 包裹尺寸重量 | 厘米/克 |
| options | Object | 否 | 增值服务 | 开箱、部分配送、退回等 |
| deliveryOption | String | 是 | 配送服务 | `standard` / `economy` |

`items[]`：

| 字段名 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| unitPrice | String | 是 | 商品单价（不含券/折扣），用于丢损理赔 |
| paidPrice | String | 是 | 实付单价（含折扣/券） |
| quantity | Number | 是 | 数量 |
| name | String | 是 | 商品名 |
| id | String | 否 | 外部商品 ID |
| sku | String | 否 | SKU |
| category | String | 否 | 类目 |
| dimWeight | Object | 否 | 单品尺寸重量（厘米/克） |

`origin` / `destination`：

| 字段名 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| name | String | 是 | 联系人 |
| phone | String | 是 | 电话 |
| email | String | 否 | 邮箱 |
| address.details | String | 是 | 详细地址 |
| address.city | String | 否 | 城市 |
| address.id | String | 否 | Daraz 四级地址 ID |
| address.type | String | 否 | `home` / `work` |
| geoLocation.latitude / longitude | String | 条件 | 坐标，使用 geoLocation 时必填 |

### 8.2 EPIS 响应

| 字段名 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| success | Boolean | 是 | 是否成功 |
| retryable | Boolean | 是 | 是否可重试 |
| traceId | String | 是 | 排查用 trace |
| errorCode / errorMessage | String | 是 | 错误码/信息 |
| errors[].field | String | 是 | 校验失败字段，`$.` 开头 |
| data.packageCode | String | 否 | EPIS 包裹唯一标识 |
| data.trackingNumber | String | 否 | EPIS 追踪号 |
| data.portCode / routeCode | String | 否 | 口岸/路由 |
| data.firstMileShippingProvider / lastMileShippingProvider | Object | 否 | 头程/尾程物流商 |
| data.minEta / maxEta | Number | 否 | 预计到达区间 |
| data.appliedVas.* | Boolean | 否 | 实际生效的增值服务 |

### 8.3 RTS / AWB / 取消 / 重派

| 接口 | 必填请求字段 | 关键响应 |
|---|---|---|
| `/logistics/epis/packages/rts` | `trackingNumber` | `data.packageCode`、`trackingNumber` |
| `/logistics/epis/packages/awb` | `packageCode`、`type`（`pdf`/`zpl`） | `data.url`，有效期 5 分钟 |
| `/logistics/epis/packages/cancel` | `packageCode`、`reason` | `success`、`errorCode` |
| `/logistics/epis/packages/reattempt` | `packageCode`；`reAttemptDateTime`、`sellerNote`、`feedbackType`（`REATTEMPT`/`RETURN`）可选 | `success` |
| `/logistics/epis/packages/update` | `packageCode`、`receiverName`、`receiverPhone` | `success` |

## 9. EPIS 物流查询

`GET /logistics/epis/packages/history`：

| 字段名 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| trackingNumber | String | 是 | 追踪号 |
| includeTimeline | Boolean | 是 | 是否返回轨迹 |
| includeShippingFee | Boolean | 否 | 是否返回运费 |
| secret | String | 否 | 买家/卖家手机后 4 位，查看敏感数据 |

响应 `data`：

| 字段名 | 类型 | 含义 |
|---|---|---|
| packageCode | String | 包裹码 |
| trackingNumber | String | 追踪号 |
| status | String | 最新状态 |
| firstMileShippingProvider / lastMileShippingProvider | String | 头程/尾程物流商 |
| destinationCountry | String | 目的国 ISO 代码 |
| timeline[].status | String | 状态 |
| timeline[].processTime | Number | 毫秒时间戳 |
| timeline[].shippingProvider | String | 状态提供方 |
| timeline[].reasonCode | String | 失败原因码 |
| timeline[].recipientType | String | 收件人类型 |
| timeline[].location | String | 网点位置 |
| timeline[].epod | String | 电子签收凭证 URL，逗号分隔 |
| timeline[].trackingUrl | String | 追踪 URL |
| timeline[].driverName / driverContact | String | 司机信息（敏感） |
| timeline[].photos | String | 送达照片 URL，逗号分隔 |
| timeline[].vehicleNumber | String | 车牌 |
| chargeableDimWeight | String | 计费体积重 |
| shippingFee | String | 运费 |
| notifyVasFdStorage | Boolean | 是否需要卖家介入重派 |

## 10. 仓库与工单

### 10.1 创建/更新仓库 — `GET/POST /logistics/epis/customers/warehouses`

| 字段名 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| externalSellerId | String | 是 | 外部卖家 ID |
| platformName | String | 是 | 平台名（Daraz 分配） |
| warehouseCode | String | 是 | 仓库代码 |
| warehouseName | String | 是 | 仓库名 |
| contactName / phone | String | 是 | 联系人/电话 |
| email | String | 否 | 邮箱 |
| type | String | 是 | `NORMAL` / `RETURN` |
| address.details | String | 是 | 详细地址 |
| address.id | String | 是 | Daraz 末级地址 ID |
| solutionCodes | String[] | 是 | Daraz 方案代码，需向平台获取 |
| configuration.services | Object[] | 否 | VAS 配置 |

响应 `data.convertedAddress.id/details` 为 Daraz 转换后的地址。

### 10.2 Xspace 工单

| 接口 | 关键字段 |
|---|---|
| create | `subject`、`description` 必填；`trackingNumber`、`orderId`、`attachments` 可选 |
| query | `caseIds`、`trackingNumbers`、`createTimeFrom/To`、`statuses`、`pageNo/pageSize` |
| detail | `caseId`（或 `trackingNumber`） |
| rate | `caseId`、`ratingStar` 必填 |

工单响应含 `caseId`、`status`、`mails`、`actions`、`gmtCreate`、`gmtModified`。

## 11. 使用方法与对账

### 11.1 包裹主数据

```text
pack 成功
  → 新增 package（package_id, tracking_number, shipment_provider, shop_id）
  → 绑定 order_lines（order_item_id）
  → 记录 pack 事件与请求响应 raw
rts 成功
  → package.status = ready_to_ship
  → 启动轨迹轮询
trace/history 返回事件
  → 追加 tracking_events（幂等：package_id + status_code + event_time）
  → 派生 package.status / 订单履约状态
```

### 11.2 幂等与重试

- `externalOrderId` 是 EPIS 创建包的幂等键；重复提交不会更新已处理订单。
- `package_id` / `packageCode` / `tracking_number` 都要建唯一索引。
- `item_err_code != 0` 时按 `retry` / `retryable` 决定是否重试；不要整批盲目重试。
- 面单 URL（EPIS AWB）TTL 只有 5 分钟，下载后转存对象存储。

### 11.3 常见失败原因

| 现象 | 可能原因 | 处理 |
|---|---|---|
| pack 返回 `item_err_code != 0` | 订单未支付/状态不允许/物流商不匹配 | 重新拉订单状态；检查 `shipment_provider_code` |
| RTS 失败 | `package_id` 无效或包裹未打包 | 先确认 pack 成功 |
| 物流详情为空 | 订单未 RTS | RTS 后再查 |
| EPIS `externalOrderId` 重复 | 之前已建包 | 用返回的 packageCode/trackingNumber 继续，不要改单 |
| 面单下载 403/过期 | URL TTL 5 分钟 | 重新请求 AWB |

## 12. 字段与 ERP 映射建议

| API 字段 | ERP 表/字段 | 说明 |
|---|---|---|
| package_id | 新增 `shipments.package_id` | 平台包裹主键 |
| tracking_number | 新增 `shipments.tracking_number` | 唯一索引 |
| shipment_provider | 新增 `shipments.carrier_code` | |
| packageCode | 新增 `shipments.external_package_code` | EPIS 包裹码 |
| order_item_id | 新增 `shipment_items.order_line_id` | 包裹-订单行关联 |
| tracking events | 新增 `tracking_events` | 幂等键 `package_id + status_code + event_time` |
| status_code / detail_type / title | `tracking_events.status_code` / `event_type` / `title` | |
| event_time | `tracking_events.occurred_at` | 毫秒转 timestamptz |
| proof_images / photos / epod | 新增 `shipment_proofs` | 敏感附件 |
| shippingFee / chargeableDimWeight | 新增 `shipment_costs` | 对账用 |
| EPIS items.unitPrice / paidPrice | 新增 `shipment_items.declared_value` / `paid_value` | 理赔依据 |
| EPIS origin/destination | 新增 `shipment_addresses` | 加密存储 |

## 13. 官方来源

- Fulfillment 分类：<https://open.daraz.com/handler/share/apidoc/getApiCategory.json?cid=22>
- Logistics API 分类：<https://open.daraz.com/handler/share/apidoc/getApiCategory.json?cid=18>
- Pack：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Forder%2Ffulfill%2Fpack&methodType=POST&categoryId=22>
- ReadyToShip：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Forder%2Fpackage%2Frts&methodType=POST&categoryId=22>
- PrintAWB：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Forder%2Fpackage%2Fdocument%2Fget&methodType=GET%2FPOST&categoryId=22>
- GetOrderLogisticDetail：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Forder%2Flogistic%2Fget&methodType=GET%2FPOST&categoryId=2>
- GetOrderTrace：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Flogistic%2Forder%2Ftrace&methodType=GET%2FPOST&categoryId=2>
- EPIS Packages：<https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Flogistics%2Fepis%2Fpackages&methodType=POST&categoryId=18>
