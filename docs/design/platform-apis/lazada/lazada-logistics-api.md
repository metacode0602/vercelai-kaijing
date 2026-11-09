# Lazada 履约与物流（Fulfillment / Logistics）API

> 核验日期：2026-11-05。来源：Lazada 官方 API Reference：
> Fulfillment `cid=44`、Logistics `cid=6`、Lazada Logistics `cid=42`、Logistics Station `cid=54`。
> 官方入口：<https://open.lazada.com/doc/api.htm>
> 通用签名、host、分页约定见 `lazada-common-conventions.md`。
> 订单状态与库存扣减见 `lazada-order-status-erp-mapping.md`。

## 1. 履约模式

| 模式 | 说明 | 关键 API |
|---|---|---|
| 卖家自履约（Dropship / SOF） | 卖家打包、RTS、交物流商 | Pack / RTS / PrintAWB / GetOrderTrace |
| DBS（Delivery by Seller） | 卖家自有车队/指定物流 | `/order/package/sof/*`、`/order/package/rts` |
| FBL / 平台仓 | Lazada 履约 | 商品 `is_fbl=1`；FBL 仓库存字段；履约动作由平台完成 |
| EPIS | 外部伙伴/自有仓直接向 Lazada Logistics 建包 | `/logistics/epis/*` |
| 数字商品 | 无需物流 | `/order/digital/delivered` |

## 2. Fulfillment 接口清单（cid=44）

| 接口 | 方法 | 路径 | 用途 |
|---|---|---|---|
| GetShipmentProvider | GET/POST | `/order/shipment/providers/get` | 查可用物流商与分配方式 |
| Pack | POST | `/order/fulfill/pack` | 打包订单项，生成 package/tracking |
| ReadyToShip | POST | `/order/package/rts` | 包裹 RTS |
| RecreatePackage | GET/POST | `/order/package/repack` | 重新打包 |
| PrintAWB | GET/POST | `/order/package/document/get` | 打印面单 |
| DeliverDigital | POST | `/order/digital/delivered` | 数字商品交付 |
| ConfirmCollectForDBS | POST | `/order/package/sof/collect` | DBS 揽收确认 |
| ConfirmDeliveryForDBS | POST | `/order/package/sof/delivered` | DBS 妥投确认 |
| FailedDeliveryForDBS | POST | `/order/package/sof/failed_delivery` | DBS 妥投失败 |
| PackageStatusUpdateForDBS | POST | `/order/package/sof/status/update` | DBS 包裹轨迹更新；仅部分店铺开放 |

## 3. Pack — `POST /order/fulfill/pack`

### 3.1 请求字段

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| packReq.pack_order_list | Object[] | 是 | 待打包订单 | 批量 ≤20 |
| packReq.pack_order_list.order_id | Number | 是 | 订单 ID | |
| packReq.pack_order_list.order_item_list | Number[] | 是 | 订单项 ID | |
| packReq.delivery_type | String | 是 | 配送类型 | 官方示例 `dropship` |
| packReq.shipment_provider_code | String | 否 | 物流商代码 | 本地店不传；跨境店必须传 `NTFS`；DBS 不传 |
| packReq.shipping_allocate_type | String | 是 | 分配方式 | `NTFS` / `TFS`；由 GetShipmentProvider 返回 |

### 3.2 响应字段

| 字段名 | 类型 | 含义 | 说明 |
|---|---|---|---|
| result.success | Boolean | 批次结果 | `true` 不代表每项成功 |
| result.data.pack_order_list[].order_id | Number | 订单 ID | |
| result.data.pack_order_list[].order_item_list[].order_item_id | Number | 订单项 ID | |
| ...item_err_code | String | 单项结果 | `0` 成功 |
| ...msg | String | 错误信息 | |
| ...tracking_number | String | 追踪号 | |
| ...shipment_provider | String | 物流商名称 | |
| ...package_id | String | 包裹 ID | 后续 RTS/面单键 |
| ...retry | Boolean | 是否可重试 | |

- 必须逐项检查 `item_err_code = 0`；批次 `success=true` 仍可能部分失败。
- `package_id` 是后续 RTS、PrintAWB、轨迹查询的主键。
- 打包前先调 `GetShipmentProvider`，不要硬编码物流商。

## 4. GetShipmentProvider — `/order/shipment/providers/get`

请求：`getShipmentProvidersReq.orders[]`（`order_id`、`order_item_ids[]`，批量 ≤20）。

响应：

| 字段 | 类型 | 含义 |
|---|---|---|
| result.data.platform_default | Number | `1` 卖家无需/不能选仓；`0` 必须选 |
| result.data.shipment_providers[].name | String | 物流商名称 |
| ...provider_code | String | 物流商代码 |
| result.data.shipping_allocate_type | String | `NTFS` / `TFS`，直接传给 Pack |

## 5. ReadyToShip — `POST /order/package/rts`

请求：

```json
{ "packages": [{ "package_id": "FP038524014" }] }
```

| 字段 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| readyToShipReq.packages | Object[] | 是 | 批量 ≤20 |
| readyToShipReq.packages.package_id | String | 是 | 包裹 ID |

响应：`result.data.packages[]`，逐项检查 `item_err_code=0`、`retry`。

- RTS 后订单进入 `ready_to_ship` / `shipped` 流程；库存扣减节点见状态映射文档。
- RTS 失败不要重复盲目重试；先看 `retry` 与 `msg`。

## 6. PrintAWB — `/order/package/document/get`

| 字段 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| getDocumentReq.doc_type | String | 是 | `HTML` / `PDF` |
| getDocumentReq.packages | Object[] | 是 | 批量 ≤20 |
| getDocumentReq.packages.package_id | String | 是 | 包裹 ID |
| getDocumentReq.print_item_list | Boolean | 否 | 是否打印包裹商品信息 |

响应：`result.data.file`（Base64）、`doc_type`、`pdf_url`（PDF 时）。

- 面单含收件人 PII；不要放入公共对象存储。
- PDF URL 可能有时效；下载后转存受控存储。

## 7. 轨迹与 3PL 接口（cid=6）

| 接口 | 方法 | 路径 | 用途 |
|---|---|---|---|
| GetOrderTrace | GET/POST | `/logistic/order/trace` | RTS 后查订单轨迹 |
| AddOrUpdatePickupStop | POST | `/logistics/tps/runsheets/stops` | 3PL 揽收点 |
| Create3PLStation | POST | `/logistics/tps/stations/create` | 创建 3PL 站点 |
| Update3PLStation | POST | `/logistics/tps/stations/update` | 更新 3PL 站点 |
| UpdatePickupTimeSlot | POST | `/logistics/tps/sellers/pickup_timeslot` | 更新揽收时段 |
| createConsolidationService | POST | `/logistics/ldp/createConsolidationService` | 创建集运服务 |
| updateLastMile | POST | `/logistics/ldp/updateLastmile` | 更新末端配送 |
| ScanParcel | GET/POST | `/dop/scan` | DOP 扫描 |
| StationDopScan | GET/POST | `/stations/dop/scan` | 站点 DOP 扫描 |

### 7.1 GetOrderTrace

请求：`order_id`（String，必填）、`locale`（可选）、`ofcPackageIdList`（可选）。

响应 `result.module[]`：

| 字段 | 类型 | 含义 |
|---|---|---|
| package_detail_info_list[].tracking_number | String | 追踪号 |
| ...ofc_package_id | String | 平台包裹 ID |
| ...order_line_info_list | String | 订单行信息（官方标 String） |
| ...logistic_detail_info_list[].status_code | String | 状态码 |
| ...detail_type | String | 明细类型 |
| ...title | String | 状态标题 |
| ...description | String | 描述 |
| ...event_time | Number | 事件时间（毫秒） |
| ...event_date | String | 事件日期 |
| ...package_location_name | String | 位置 |
| ...proof_images | String[] | 证明图片 |
| ...receive_time | Number | 接收时间 |

- 官方限制：仅 RTS 后可用。
- 轨迹事件按 `event_time` 去重；不要用 `status_code` 当唯一键。
- `order_line_info_list` 官方标 String，实际可能是 JSON 字符串，需兼容解析。

## 8. Lazada Logistics / EPIS（cid=42，20 个接口）

| 接口 | 方法 | 路径 | 用途 |
|---|---|---|---|
| CreateCustomerAccountRelationshipByOTP | GET/POST | `/logistics/epis/customers/external_relationships_bundle` | OTP 绑定客户 |
| CreateCustomerAccountRelationshipForExternal | POST | `/logistics/epis/customers/external_relationships` | 外部客户关系 |
| CreateOrUpdateCustomerWarehouse | POST | `/logistics/epis/customers/warehouses` | 客户仓 |
| EpisGetDeliveryOptions | GET | `/logistics/epis/service/delivery_options` | 可选配送服务 |
| EpisPackageCreation | POST | `/logistics/epis/packages` | 建包 |
| EpisPackageConsignment | POST | `/logistics/epis/packages/consign` | 交运 |
| EpisPackageConsignmentV2 | POST | `/logistics/epis/packages/consign/v2` | 交运 v2 |
| EpisPackageCancellation | POST | `/logistics/epis/packages/cancel` | 取消包裹 |
| EpisPackageCancellationV3 | POST | `/logistics/epis/packages/cancel/v3` | 取消 v3 |
| EpisPackageInfoUpdate | POST | `/logistics/epis/packages/update` | 更新包裹 |
| EpisPackagePrintAwb | GET | `/logistics/epis/packages/awb` | 打印 AWB |
| EpisPackageReadyToBeShipped | POST | `/logistics/epis/packages/rts` | EPIS RTS |
| EpisPackageReAttempt | POST | `/logistics/epis/packages/reattempt` | 重投 |
| EpisUploadAwbFulfillment | POST | `/logistics/epis/fulfillment/upload_awb` | 上传 AWB |
| EpisXspaceCreate | POST | `/logistics/epis/xspace/create` | 创建 Xspace 工单 |
| EpisXspaceGetDetail | POST | `/logistics/epis/xspace/detail` | 工单详情 |
| EpisXspaceQuery | GET/POST | `/logistics/epis/xspace/query` | 工单查询 |
| EpisXspaceRateTicket | GET/POST | `/logistics/epis/xspace/rate` | 工单评价 |
| EstimateShippingFee | GET/POST | `/logistics/epis/estimate_shipping_fee` | 预估运费 |
| GetShippingFee | GET/POST | `/logistics/epis/get_shipping_fee` | 查询运费 |

### 8.1 EpisPackageCreation — `POST /logistics/epis/packages`

核心字段：

| 字段 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| externalOrderId | String | 是 | 外部订单号；重复请求只保留首次 |
| shipper.externalSellerId | String | 是 | 外部卖家 ID |
| origin / destination | Object | 是 | 发件/收件信息 |
| origin.address.details | String | 是 | 地址详情 |
| origin.phone / name | String | 是 | 联系人 |
| destination.address.details | String | 是 | 地址详情 |
| destination.phone / name | String | 是 | 联系人 |
| dimWeight | Object | 是 | `length/width/height`（cm）、`weight`（g） |
| payment.totalAmount | String | 是 | 订单金额 |
| payment.currency | String | 是 | 币种 |
| payment.paymentType | String | 是 | `COD` / `NON-COD` |
| items | Object[] | 是 | 商品项 |
| items.quantity | Number | 是 | 件数 |
| items.unitPrice / paidPrice | String | 是 | 单价/实付 |
| items.name | String | 是 | 商品名 |
| packageType | String | 否 | `Sales_order` / `Customer_return` 等 |
| deliveryOption | String | 否 | `express` / `standard` / `economy` / `sameday` / `nextday` / `digital` / `point_to_point` |
| multiParcel | Object | 否 | 多包裹：`uniqueKey`、`sequenceNumber`、`totalParcel`、`sameTimeDelivery` |

响应：`data.packageCode`、`data.trackingNumber`、`success`、`errorCode`、`errors[]`。

- `externalOrderId` 是幂等键；重复提交不会修改已处理订单。
- EPIS 建包成功后再交运/RTS/打 AWB。
- 取消、重投、工单都是独立状态机；不要只改本地状态。

## 9. Logistics Station（cid=54，18 个接口）

用于 Lazada 物流站点/揽收站扫描与入库，不是普通卖家 ERP 必接。接口包括：

- 站点/元数据：`/logistics/station/list`、`/logistics/station/v1/metadata`
- 扫描包裹：`/logistics/station/v1/scanned-parcels/create|delete|list`、`/logistics/station/dop/scanned-parcels*`
- 入库：`/logistics/station/v1/confirm-inbound`、`/logistics/station/dop/confirm-inbound`
- 集货笼：`/logistics/station/cages/validate`、`/logistics/station/v1/cages/validate`
- 揽收：`/logistics/station/v1/cp/confirm-parcel-collection`、`/logistics/station/v1/cp/scheduled-pu-parcels/list`
- 退货包裹：`/logistics/station/v1/dop/cr-parcels/search`
- OTP：`/logistics/station/v1/cp/validate-otp`

## 10. 履约落库建议

| 平台实体 | 建议表 | 键 |
|---|---|---|
| package | `shipments` | `shop_id + package_id` |
| package item | `shipment_items` | `shipment_id + order_item_id` |
| tracking event | `tracking_events` | `package_id + event_time + status_code` |
| fulfillment attempt | `fulfillment_attempts` | `package_id + action + attempt_no` |
| AWB / invoice | `shipment_documents` | `package_id + doc_type` |
| EPIS package | 复用 `shipments` + `epis_package_code` | `external_order_id` 幂等 |
| 物流工单 | `logistics_cases` | `xspace_id` |

## 11. 官方来源

| 资源 | URL |
|---|---|
| Fulfillment 分类 | <https://open.lazada.com/handler/share/apidoc/getApiCategory.json?cid=44&language=en> |
| Pack | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Forder%2Ffulfill%2Fpack&methodType=POST&categoryId=44> |
| ReadyToShip | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Forder%2Fpackage%2Frts&methodType=POST&categoryId=44> |
| PrintAWB | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Forder%2Fpackage%2Fdocument%2Fget&methodType=GET%2FPOST&categoryId=44> |
| GetOrderTrace | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Flogistic%2Forder%2Ftrace&methodType=GET%2FPOST&categoryId=6> |
| EpisPackageCreation | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Flogistics%2Fepis%2Fpackages&methodType=POST&categoryId=42> |
