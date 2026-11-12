import { LazopHttpClient, type LazopFamily } from "../clients/lazop-http"
import type { MarketplaceConnector, MarketplaceConnectorConfig } from "./types"
import {
  buildCreateProductPayload,
  buildPriceQuantityPayload,
  buildUpdateProductPayload,
} from "./listing-payload"
import type {
  DomainBrand,
  DomainCancelOrderInput,
  DomainCategory,
  DomainImCapabilityInfo,
  DomainListingInput,
  DomainListingResult,
  DomainPriceQuantityItem,
  DomainPriceQuantityResult,
  DomainOrder,
  DomainOrderLine,
  DomainOrderTrace,
  DomainProduct,
  DomainReverseOrder,
  DomainReverseOrderDetail,
  DomainReverseOrderLine,
  DomainReview,
  DomainSettlement,
  DomainSettlementLine,
  DomainShipmentInput,
  DomainShipmentItemResult,
  DomainShipmentResult,
  DomainShop,
  DomainTracePackage,
  DomainTrackingEvent,
  MarketplacePlatform,
  OAuthTokenSet,
  PageCursor,
  PagedResult,
  ReverseListFilter,
  ReviewListFilter,
  SettlementPayoutFilter,
  SettlementTransactionFilter,
} from "../domain/types"
import {
  mapLazopListingStatus,
  mapLazopOrder,
  mapLazopOrderItems,
  mapLazopOrderStatus,
  mapLazopPayoutList,
  mapLazopProduct,
  mapLazopTransactionDetails,
} from "../mappers/lazop"
import {
  buildLazopAuthorizeUrl,
  exchangeLazopCode,
  refreshLazopToken,
} from "../oauth/lazop"

type Json = Record<string, unknown>

function asRecord(value: unknown): Json {
  return value && typeof value === "object" ? (value as Json) : {}
}

function toIso(value: unknown): string | null {
  if (value == null || value === "") return null
  const numeric = typeof value === "number" ? value : Number(value)
  if (Number.isFinite(numeric) && numeric > 0) {
    const ms = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric
    const date = new Date(ms)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function toEpochMs(value: string | undefined, fallback: number): string {
  if (!value) return String(fallback)
  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) {
    return String(numeric < 1_000_000_000_000 ? numeric * 1000 : numeric)
  }
  const parsed = new Date(value).getTime()
  return String(Number.isNaN(parsed) ? fallback : parsed)
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (value != null && value !== "") return String(value)
  }
  return undefined
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (value == null || value === "") continue
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

const mapOrderStatus = mapLazopOrderStatus
const mapListingStatus = mapLazopListingStatus

export abstract class LazopConnectorBase implements MarketplaceConnector {
  abstract readonly platform: MarketplacePlatform
  protected readonly family: LazopFamily
  protected readonly cfg: MarketplaceConnectorConfig
  protected readonly http: LazopHttpClient

  /**
   * Lazada/Daraz IM 能力。Lazada 已确认存在 IM API（cid=29，7 个接口，
   * 见 docs/design/platform-apis/lazada/lazada-promotion-im-review-api.md），
   * 但 adapter 未实现 listMessages。Daraz 复用 Lazop 体系但 daraz 目录未独立确认，
   * 子类 DarazConnector 覆盖为 'unknown'。
   */
  imCapability: DomainImCapabilityInfo = {
    capability: 'known_unimplemented',
    docRef:
      'docs/design/platform-apis/lazada/lazada-promotion-im-review-api.md §3 Instant Messaging',
    note: 'Lazada IM API 已确认（/im/session/list、/im/message/list 等），adapter 未实现拉取。',
  }

  constructor(family: LazopFamily, cfg: MarketplaceConnectorConfig) {
    this.family = family
    this.cfg = cfg
    this.http = new LazopHttpClient({
      family,
      region: cfg.region,
      appKey: cfg.appKey,
      appSecret: cfg.appSecret,
      accessToken: cfg.accessToken,
      tokenProvider: cfg.tokenProvider,
      fetchImpl: cfg.fetchImpl,
    })
  }

  buildAuthorizeUrl(input: {
    state: string
    redirectUri: string
    country?: string
  }): string {
    return buildLazopAuthorizeUrl({
      family: this.family,
      appKey: this.cfg.appKey,
      redirectUri: input.redirectUri,
      state: input.state,
      region: this.cfg.region,
      country: input.country ?? this.cfg.region,
    })
  }

  exchangeCode(input: { code: string }): Promise<OAuthTokenSet> {
    return exchangeLazopCode(
      {
        family: this.family,
        appKey: this.cfg.appKey,
        appSecret: this.cfg.appSecret,
        region: this.cfg.region,
        fetchImpl: this.cfg.fetchImpl,
      },
      input.code
    )
  }

  refreshToken(input: { refreshToken: string }): Promise<OAuthTokenSet> {
    return refreshLazopToken(
      {
        family: this.family,
        appKey: this.cfg.appKey,
        appSecret: this.cfg.appSecret,
        region: this.cfg.region,
        fetchImpl: this.cfg.fetchImpl,
      },
      input.refreshToken
    )
  }

  async getShop(): Promise<DomainShop> {
    const json = await this.http.call<Json>({ path: "/seller/get" })
    const data = asRecord(json.data ?? json)
    return {
      externalShopId: String(
        data.seller_id ?? data.shop_id ?? data.short_code ?? ""
      ),
      name: String(data.name ?? data.shop_name ?? data.company_name ?? "shop"),
      region: String(data.country ?? this.cfg.region ?? ""),
      currency: data.currency_code ? String(data.currency_code) : undefined,
      status: "active",
      raw: data,
    }
  }

  async listBrands(cursor?: PageCursor): Promise<PagedResult<DomainBrand>> {
    const startRow = Number(cursor?.cursor ?? 0) || 0
    const pageSize = Math.min(cursor?.pageSize ?? 40, 200)
    const json = await this.http.call<Json>({
      path: "/category/brands/query",
      params: {
        startRow: String(startRow),
        pageSize: String(pageSize),
      },
    })
    const data = asRecord(json.data ?? json)
    const module = (data.module ??
      data.brand_list ??
      data.brands ??
      []) as Json[]
    const items = (Array.isArray(module) ? module : []).map((b) => ({
      externalId: String(b.brand_id ?? b.id ?? ""),
      name: String(b.name ?? b.brand_name ?? ""),
      raw: b,
    }))
    const total = Number(data.total_record ?? data.totalRecord ?? Number.NaN)
    const hasMore = Number.isFinite(total)
      ? startRow + items.length < total
      : items.length >= pageSize
    const nextCursor = hasMore ? String(startRow + items.length) : null
    return { items, nextCursor, raw: data }
  }

  async getCategoryTree(): Promise<DomainCategory[]> {
    const json = await this.http.call<Json>({ path: "/category/tree/get" })
    const data = json.data ?? json
    const roots = Array.isArray(data)
      ? data
      : ((asRecord(data).category_list as Json[]) ?? [])
    const out: DomainCategory[] = []
    const walk = (nodes: Json[], parent: string | null) => {
      for (const node of nodes) {
        const id = String(node.category_id ?? node.id ?? "")
        out.push({
          externalId: id,
          name: String(node.name ?? node.category_name ?? ""),
          parentExternalId: parent,
          leaf: Boolean(node.leaf ?? node.is_leaf),
          raw: node,
        })
        const children = (node.children ?? node.child ?? []) as Json[]
        if (Array.isArray(children) && children.length) walk(children, id)
      }
    }
    walk(roots as Json[], null)
    return out
  }

  async getProduct(externalId: string): Promise<DomainProduct> {
    const json = await this.http.call<Json>({
      path: "/product/item/get",
      params: { item_id: externalId },
    })
    return this.mapProduct(asRecord(json.data ?? json))
  }

  async listProducts(cursor?: PageCursor): Promise<PagedResult<DomainProduct>> {
    const offset = Number(cursor?.cursor ?? 0) || 0
    const limit = Math.min(cursor?.pageSize ?? 50, 50)
    const params: Record<string, string> = {
      filter: "all",
      offset: String(offset),
      limit: String(limit),
    }
    if (cursor?.updatedAfter) params.update_after = cursor.updatedAfter
    if (cursor?.updatedBefore) params.update_before = cursor.updatedBefore
    if (cursor?.createdAfter) params.create_after = cursor.createdAfter
    if (cursor?.createdBefore) params.create_before = cursor.createdBefore

    const json = await this.http.call<Json>({ path: "/products/get", params })
    const data = asRecord(json.data ?? json)
    const products = (data.products ?? data.items ?? []) as Json[]
    const total = Number(
      data.total_products ?? data.totalProducts ?? Number.NaN
    )
    const hasMore = Number.isFinite(total)
      ? offset + products.length < total
      : products.length >= limit
    return {
      items: products.map((p) => this.mapProduct(p)),
      nextCursor: hasMore ? String(offset + products.length) : null,
      raw: data,
    }
  }

  async createListing(input: DomainListingInput): Promise<DomainListingResult> {
    // 官方结构 { Request: { Product: {…} } }，见 lazada-products-api.md §6.1 / daraz-products-api.md §4.1。
    const payload = buildCreateProductPayload(input)
    const json = await this.http.call<Json>({
      method: "POST",
      path: "/product/create",
      bodyParams: { payload: JSON.stringify(payload) },
    })
    const data = asRecord(json.data ?? json)
    return {
      externalId: String(data.item_id ?? data.product_id ?? ""),
      status: mapListingStatus(
        String(data.item_status ?? data.status ?? "submitted")
      ),
      raw: data,
    }
  }

  async updateListing(
    externalId: string,
    input: Partial<DomainListingInput>
  ): Promise<DomainListingResult> {
    const payload = buildUpdateProductPayload(externalId, input)
    const json = await this.http.call<Json>({
      method: "POST",
      path: "/product/update",
      bodyParams: { payload: JSON.stringify(payload) },
    })
    const data = asRecord(json.data ?? json)
    return {
      externalId: String(data.item_id ?? externalId),
      status: mapListingStatus(
        String(data.item_status ?? data.status ?? "submitted")
      ),
      raw: data,
    }
  }

  async deactivateListing(externalId: string): Promise<DomainListingResult> {
    const json = await this.http.call<Json>({
      method: "POST",
      path: "/product/deactivate",
      bodyParams: { item_id: externalId },
    })
    const data = asRecord(json.data ?? json)
    return {
      externalId,
      status: "archived",
      raw: data,
    }
  }

  async updatePriceQuantity(
    items: DomainPriceQuantityItem[],
  ): Promise<DomainPriceQuantityResult> {
    if (items.length === 0) {
      return { ok: false, error: "没有可推送的刊登价格或库存" }
    }
    const payload = buildPriceQuantityPayload(items)
    const products = (asRecord(payload.Request).Product ?? []) as unknown[]
    if (!Array.isArray(products) || products.length === 0) {
      return { ok: false, error: "没有可推送的刊登价格或库存" }
    }
    try {
      const json = await this.http.call<Json>({
        method: "POST",
        path: "/product/price_quantity/update",
        bodyParams: { payload: JSON.stringify(payload) },
      })
      return { ok: true, raw: asRecord(json.data ?? json) }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async getOrderItems(externalOrderId: string): Promise<DomainOrderLine[]> {
    const json = await this.http.call<Json>({
      path: "/order/items/get",
      params: { order_id: externalOrderId },
    })
    return mapLazopOrderItems(json)
  }

  async getOrder(externalOrderId: string): Promise<DomainOrder> {
    const json = await this.http.call<Json>({
      path: "/order/get",
      params: { order_id: externalOrderId },
    })
    const order = this.mapOrder(asRecord(json.data ?? json))
    try {
      const lines = await this.getOrderItems(externalOrderId)
      // Empty array is a valid platform response; only failures set itemsFetchError.
      return { ...order, lines, itemsFetchError: undefined }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ...order, itemsFetchError: message }
    }
  }

  async listOrders(cursor?: PageCursor): Promise<PagedResult<DomainOrder>> {
    const offset = Number(cursor?.cursor ?? 0) || 0
    const limit = Math.min(cursor?.pageSize ?? 50, 100)
    const params: Record<string, string> = {
      offset: String(offset),
      [this.family === "daraz" ? "limt" : "limit"]: String(limit),
    }
    if (cursor?.updatedAfter) params.update_after = cursor.updatedAfter
    if (cursor?.updatedBefore) params.update_before = cursor.updatedBefore
    if (cursor?.createdAfter) params.created_after = cursor.createdAfter
    if (cursor?.createdBefore) params.created_before = cursor.createdBefore
    if (cursor?.status) params.status = cursor.status
    if (cursor?.sortBy) params.sort_by = cursor.sortBy
    if (cursor?.sortDirection) params.sort_direction = cursor.sortDirection

    const json = await this.http.call<Json>({ path: "/orders/get", params })
    const data = asRecord(json.data ?? json)
    const orders = (data.orders ?? data.order_list ?? []) as Json[]
    const total = Number(data.countTotal ?? data.count_total ?? Number.NaN)
    const hasMore = Number.isFinite(total)
      ? offset + orders.length < total
      : orders.length >= limit
    const items: DomainOrder[] = []
    for (const row of orders) {
      const mapped = this.mapOrder(row)
      if (!mapped.externalOrderId) continue
      if (mapped.lines?.length) {
        items.push(mapped)
        continue
      }
      try {
        const lines = await this.getOrderItems(mapped.externalOrderId)
        items.push({ ...mapped, lines })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        items.push({ ...mapped, itemsFetchError: message })
      }
    }
    return {
      items,
      nextCursor: hasMore ? String(offset + orders.length) : null,
      raw: data,
    }
  }

  async listSettlements(
    filter: SettlementPayoutFilter
  ): Promise<PagedResult<DomainSettlement>> {
    const json = await this.http.call<Json>({
      path: "/finance/payout/status/get",
      params: { created_after: filter.createdAfter.slice(0, 10) },
    })
    const items = mapLazopPayoutList(json)
    return { items, nextCursor: null, raw: asRecord(json.data ?? json) }
  }

  async listSettlementTransactions(
    filter: SettlementTransactionFilter
  ): Promise<PagedResult<DomainSettlementLine>> {
    const offset = Number(filter.cursor ?? 0) || 0
    const limit = Math.min(filter.pageSize ?? 100, 500)
    const params: Record<string, string> = {
      start_time: filter.startTime.slice(0, 10),
      end_time: filter.endTime.slice(0, 10),
      offset: String(offset),
      limit: String(limit),
      trans_type: filter.transType ?? "-1",
    }
    if (filter.tradeOrderId) params.trade_order_id = filter.tradeOrderId
    const json = await this.http.call<Json>({
      path: "/finance/transaction/details/get",
      params,
    })
    const items = mapLazopTransactionDetails(json)
    const hasMore = items.length >= limit
    return {
      items,
      nextCursor: hasMore ? String(offset + items.length) : null,
      raw: asRecord(json.data ?? json),
    }
  }

  async listReviews(
    filter: ReviewListFilter
  ): Promise<PagedResult<DomainReview>> {
    const page = Math.max(1, Number(filter.cursor ?? 1) || 1)
    const pageSize = Math.min(filter.pageSize ?? 50, 50)
    const now = Date.now()
    const startTime = toEpochMs(filter.startTime, now - 7 * 24 * 60 * 60 * 1000)
    const endTime = toEpochMs(filter.endTime, now)

    const history = await this.http.call<Json>({
      path: "/review/seller/history/list",
      params: {
        item_id: filter.itemId,
        start_time: startTime,
        end_time: endTime,
        current: String(page),
      },
    })
    const data = asRecord(history.data ?? history)
    const rawIds = (data.id_list ??
      data.ids ??
      data.review_id_list ??
      []) as unknown[]
    const ids = rawIds
      .map((id) => (id == null ? "" : String(id)))
      .filter((id) => id.length > 0)

    if (!ids.length) {
      return { items: [], nextCursor: null, raw: data }
    }

    const reviews: DomainReview[] = []
    for (let offset = 0; offset < ids.length; offset += 10) {
      const chunk = ids.slice(offset, offset + 10)
      const json = await this.http.call<Json>({
        path: "/review/seller/list/v2",
        params: { id_list: JSON.stringify(chunk) },
      })
      const listData = asRecord(json.data ?? json)
      const rows = (listData.review_list ??
        listData.reviews ??
        listData.module ??
        listData.list ??
        []) as Json[]
      for (const row of Array.isArray(rows) ? rows : []) {
        reviews.push(this.mapReview(row, filter.itemId))
      }
    }

    const total = firstNumber(data.total)
    const hasMore = Number.isFinite(total)
      ? page * pageSize < (total ?? 0)
      : ids.length >= pageSize
    return {
      items: reviews,
      nextCursor: hasMore && page < 50 ? String(page + 1) : null,
      raw: data,
    }
  }

  async getOrderTrace(externalOrderId: string): Promise<DomainOrderTrace> {
    const json = await this.http.call<Json>({
      path: "/logistic/order/trace",
      params: { order_id: externalOrderId },
    })
    const result = asRecord(json.result ?? json)
    const data = asRecord(result.data ?? json.data)
    const modules = (data.module ??
      result.module ??
      data.package_list ??
      []) as Json[]
    const packages: DomainTracePackage[] = []

    for (const [index, module] of (Array.isArray(modules)
      ? modules
      : []
    ).entries()) {
      const moduleRecord = asRecord(module)
      const details = (moduleRecord.package_detail_info_list ??
        moduleRecord.package_list ?? [moduleRecord]) as Json[]
      for (const [detailIndex, detail] of (Array.isArray(details)
        ? details
        : []
      ).entries()) {
        const pkg = asRecord(detail)
        const rawEvents = (pkg.logistic_detail_info_list ??
          pkg.logistics_detail_info_list ??
          pkg.event_list ??
          []) as Json[]
        const events: DomainTrackingEvent[] = []
        for (const event of Array.isArray(rawEvents) ? rawEvents : []) {
          const record = asRecord(event)
          const eventTime = toIso(
            record.event_time ??
              record.event_date ??
              record.create_time ??
              record.time
          )
          if (!eventTime) continue
          events.push({
            statusCode: String(
              record.status_code ??
                record.status ??
                record.detail_type ??
                "UNKNOWN"
            ),
            title: firstString(record.title, record.status_name),
            description: firstString(record.description, record.detail),
            location: firstString(
              record.package_location_name,
              record.location
            ),
            eventTime,
            raw: record,
          })
        }
        events.sort((a, b) => a.eventTime.localeCompare(b.eventTime))

        const externalPackageId = firstString(
          pkg.ofc_package_id,
          pkg.package_id,
          pkg.tracking_number,
          `${externalOrderId}-${index + 1}-${detailIndex + 1}`
        )
        if (!externalPackageId) continue
        packages.push({
          externalPackageId,
          trackingNumber: firstString(pkg.tracking_number, pkg.tracking_no),
          providerName: firstString(
            pkg.shipment_provider,
            pkg.logistics_provider_name
          ),
          events,
          raw: pkg,
        })
      }
    }

    return { externalOrderId, packages, raw: data }
  }

  async packOrder(input: DomainShipmentInput): Promise<DomainShipmentResult> {
    const orderItemIds = input.orderItemIds ?? []
    if (!orderItemIds.length) {
      throw new Error("orderItemIds is required to pack an order")
    }

    const packReq = {
      pack_order_list: [
        {
          order_id: input.externalOrderId,
          order_item_list: orderItemIds,
        },
      ],
      delivery_type: input.deliveryType ?? "dropship",
      shipping_allocate_type: input.shippingAllocateType ?? "TFS",
      ...(input.shipmentProviderCode
        ? { shipment_provider_code: input.shipmentProviderCode }
        : {}),
      ...(input.payload ?? {}),
    }

    const json = await this.http.call<Json>({
      method: "POST",
      path: "/order/fulfill/pack",
      bodyParams: { packReq: JSON.stringify(packReq) },
    })
    return this.mapPackResult(json)
  }

  async readyToShip(input: DomainShipmentInput): Promise<DomainShipmentResult> {
    if (!input.packageId) {
      throw new Error("packageId is required to mark an order ready to ship")
    }

    const json = await this.http.call<Json>({
      method: "POST",
      path: "/order/package/rts",
      bodyParams: {
        readyToShipReq: JSON.stringify({
          packages: [{ package_id: input.packageId }],
          ...(input.payload ?? {}),
        }),
      },
    })

    const result = asRecord(json.result ?? json)
    const data = asRecord(result.data ?? json.data)
    const packages = (data.packages ?? []) as Json[]
    const itemResults: DomainShipmentItemResult[] = packages.map((pkg) => ({
      packageId: pkg.package_id != null ? String(pkg.package_id) : undefined,
      code: pkg.item_err_code != null ? String(pkg.item_err_code) : undefined,
      message: pkg.msg != null ? String(pkg.msg) : undefined,
      retry:
        pkg.retry != null
          ? String(pkg.retry).toLowerCase() === "true"
          : undefined,
    }))
    const ok =
      result.success !== false &&
      itemResults.every((item) => !item.code || item.code === "0")

    return {
      ok,
      packageId: input.packageId,
      itemResults,
      raw: asRecord(json),
    }
  }

  async shipOrder(input: DomainShipmentInput): Promise<DomainShipmentResult> {
    if (input.packageId) {
      return this.readyToShip(input)
    }

    const packed = await this.packOrder(input)
    if (!packed.ok || !packed.packageId) {
      return packed
    }

    const rts = await this.readyToShip({
      ...input,
      packageId: packed.packageId,
    })
    return {
      ...rts,
      trackingNumber: rts.trackingNumber ?? packed.trackingNumber,
      itemResults: [...(packed.itemResults ?? []), ...(rts.itemResults ?? [])],
      raw: { pack: packed.raw, rts: rts.raw },
    }
  }

  async cancelOrder(
    input: DomainCancelOrderInput
  ): Promise<{
    ok: boolean
    raw?: Record<string, unknown>
    reasonId?: string
  }> {
    const orderItemIds = input.orderItemIds ?? []
    if (!orderItemIds.length) {
      throw new Error("orderItemIds is required to cancel an order")
    }

    let reasonId = input.reasonId
    if (!reasonId) {
      const validate = await this.http.call<Json>({
        path: "/order/reverse/cancel/validate",
        params: {
          order_id: input.externalOrderId,
          order_item_id_list: JSON.stringify(orderItemIds),
        },
      })
      const data = asRecord(validate.data ?? validate)
      const options = (data.reason_options ?? []) as Json[]
      const first = options.find((option) => option.reason_id != null)
      reasonId = first ? String(first.reason_id) : undefined
      if (!reasonId) {
        throw new Error("No cancel reason options returned by platform")
      }
    }

    const json = await this.http.call<Json>({
      path: "/order/reverse/cancel/create",
      params: {
        order_id: input.externalOrderId,
        order_item_id_list: JSON.stringify(orderItemIds),
        reason_id: reasonId,
      },
    })
    return { ok: true, reasonId, raw: asRecord(json.data ?? json) }
  }

  /**
   * GetReverseOrdersForSeller — `/reverse/getreverseordersforseller`。
   * 列表只给摘要；金额/SKU/数量需再调 getReverseOrderDetail。
   * @see docs/design/platform-apis/lazada/lazada-aftersales-api.md §4
   */
  async listReverseOrders(
    filter: ReverseListFilter
  ): Promise<PagedResult<DomainReverseOrder>> {
    const pageNo = Math.max(1, Number(filter.cursor ?? 1) || 1)
    const pageSize = Math.min(filter.pageSize ?? 50, 100)
    const params: Record<string, string | number | boolean | undefined> = {
      page_no: pageNo,
      page_size: pageSize,
    }
    if (filter.updatedAfter) {
      params.ReverseOrderLineModifiedTimeRangeStart = toEpochMs(
        filter.updatedAfter,
        Date.now() - 7 * 24 * 60 * 60 * 1000
      )
    }
    if (filter.updatedBefore) {
      params.ReverseOrderLineModifiedTimeRangeEnd = toEpochMs(
        filter.updatedBefore,
        Date.now()
      )
    }
    if (filter.requestTypeList?.length) {
      params.request_type_list = JSON.stringify(filter.requestTypeList)
    }
    if (filter.reverseStatusList?.length) {
      params.reverse_status_list = JSON.stringify(filter.reverseStatusList)
    }

    const json = await this.http.call<Json>({
      path: "/reverse/getreverseordersforseller",
      params,
    })
    const result = asRecord(json.result ?? json)
    const itemsRaw = (result.items ?? result.order_list ?? []) as Json[]
    const total = firstNumber(result.total)
    const items: DomainReverseOrder[] = []
    for (const row of Array.isArray(itemsRaw) ? itemsRaw : []) {
      const rec = asRecord(row)
      const linesRaw = (rec.reverse_order_lines ??
        rec.reverseOrderLineDTOList ??
        []) as Json[]
      const lines: DomainReverseOrderLine[] = (Array.isArray(linesRaw) ? linesRaw : []).map(
        (line) => this.mapReverseLine(asRecord(line)),
      )
      items.push({
        externalReverseOrderId: String(
          rec.reverse_order_id ?? rec.reverseOrderId ?? ""
        ),
        externalTradeOrderId: firstString(
          rec.trade_order_id,
          rec.tradeOrderId
        ),
        requestType: this.mapReverseRequestType(
          firstString(rec.request_type, rec.requestType)
        ),
        returnToType: this.mapReturnToType(rec.is_rtm),
        shippingType: firstString(rec.shipping_type, rec.shippingType) as
          | "PICK_UP"
          | "DROP_OFF"
          | undefined,
        isRtm: rec.is_rtm === true || rec.is_rtm === "true",
        lines,
        raw: rec,
      })
    }
    const hasMore = Number.isFinite(total ?? NaN)
      ? pageNo * pageSize < (total ?? 0)
      : items.length >= pageSize
    return {
      items,
      nextCursor: hasMore ? String(pageNo + 1) : null,
      raw: result,
    }
  }

  /**
   * GetReverseOrderDetail — `/order/reverse/return/detail/list`。
   * 金额单位按站点归一化：非 VN 按 cent/100；VN 原值。
   * @see docs/design/platform-apis/lazada/lazada-aftersales-api.md §5
   */
  async getReverseOrderDetail(
    reverseOrderId: string
  ): Promise<DomainReverseOrderDetail> {
    const json = await this.http.call<Json>({
      path: "/order/reverse/return/detail/list",
      params: { reverse_order_id: reverseOrderId },
    })
    const data = asRecord(json.data ?? json)
    const linesRaw = (data.reverseOrderLineDTOList ??
      data.reverse_order_line_list ??
      []) as Json[]
    const lines: DomainReverseOrderLine[] = (Array.isArray(linesRaw) ? linesRaw : []).map(
      (line) => this.mapReverseLine(asRecord(line)),
    )
    return {
      externalReverseOrderId: String(
        data.reverse_order_id ?? data.reverseOrderId ?? reverseOrderId
      ),
      externalTradeOrderId: firstString(
        data.trade_order_id,
        data.tradeOrderId
      ),
      requestType: this.mapReverseRequestType(
        firstString(data.request_type, data.requestType)
      ),
      returnToType: this.mapReturnToType(data.is_rtm),
      shippingType: firstString(data.shipping_type, data.shippingType) as
        | "PICK_UP"
        | "DROP_OFF"
        | undefined,
      isRtm: data.is_rtm === true || data.is_rtm === "true",
      platformCreatedAt: toIso(
        data.return_order_line_gmt_create ??
          data.gmt_create ??
          data.create_time
      ),
      platformUpdatedAt: toIso(
        data.return_order_line_gmt_modified ??
          data.gmt_modified ??
          data.update_time
      ),
      disputeInProgress: data.dispute_in_progress === true,
      lines,
      raw: data,
    }
  }

  protected mapReverseRequestType(
    raw: string | undefined
  ): DomainReverseOrder["requestType"] {
    const t = (raw || "").toUpperCase()
    if (t === "CANCEL") return "CANCEL"
    if (t === "ONLY_REFUND" || t === "ONLYREFUND") return "ONLY_REFUND"
    return "RETURN"
  }

  protected mapReturnToType(
    isRtm: unknown
  ): "RTM" | "RTW" | undefined {
    if (isRtm === true || isRtm === "true") return "RTM"
    if (isRtm === false || isRtm === "false") return "RTW"
    return undefined
  }

  /** 金额归一化：VN 站原值，其它站点 cent/100。 */
  protected normalizeReverseAmount(
    raw: unknown,
    currency: string | undefined
  ): string | undefined {
    if (raw == null || raw === "") return undefined
    const n = Number(raw)
    if (!Number.isFinite(n)) return undefined
    const isVnd = (currency || "").toUpperCase() === "VND"
    return isVnd ? String(n) : String(n / 100)
  }

  protected mapReverseLine(line: Json): DomainReverseOrderLine {
    const currency = firstString(line.currency, line.Currency)
    return {
      externalReverseLineId: String(
        line.reverse_order_line_id ?? line.reverseOrderLineId ?? ""
      ),
      externalOrderLineId: firstString(
        line.trade_order_line_id,
        line.tradeOrderLineId
      ),
      reverseStatus: firstString(line.reverse_status, line.reverseStatus),
      fulfillmentStatus: firstString(line.ofc_status, line.fulfillmentStatus),
      reasonCode: firstString(line.reason_code, line.reasonCode),
      reasonText: firstString(line.reason_text, line.reasonText),
      refundAmount: this.normalizeReverseAmount(
        line.refund_amount ?? line.refundAmount,
        currency
      ),
      currency,
      itemUnitPrice: this.normalizeReverseAmount(
        line.item_unit_price ?? line.itemUnitPrice,
        currency
      ),
      qcDecision: firstString(line.whqc_decision, line.QC_Decision, line.qcDecision),
      trackingNumber: firstString(line.tracking_number, line.trackingNumber),
      sellerSku: firstString(line.seller_sku_id, line.sellerSku, line.seller_sku),
      slaAt: toIso(line.sla),
      isDispute: line.is_dispute === true || line.isDispute === true,
      isNeedRefund: line.is_need_refund === true || line.isNeedRefund === true,
      raw: line,
    }
  }

  private mapPackResult(json: Json): DomainShipmentResult {
    const result = asRecord(json.result ?? json)
    const data = asRecord(result.data ?? json.data)
    const packOrders = (data.pack_order_list ?? []) as Json[]

    const itemResults: DomainShipmentItemResult[] = []
    let packageId: string | undefined
    let trackingNumber: string | undefined
    let ok = result.success !== false

    for (const order of packOrders) {
      const items = (order.order_item_list ?? []) as Json[]
      for (const item of items) {
        const code =
          item.item_err_code != null ? String(item.item_err_code) : undefined
        if (code && code !== "0") ok = false
        if (item.package_id != null) packageId = String(item.package_id)
        if (item.tracking_number != null) {
          trackingNumber = String(item.tracking_number)
        }
        itemResults.push({
          orderItemId:
            item.order_item_id != null ? String(item.order_item_id) : undefined,
          packageId:
            item.package_id != null ? String(item.package_id) : undefined,
          code,
          message: item.msg != null ? String(item.msg) : undefined,
          retry: item.retry != null ? Boolean(item.retry) : undefined,
        })
      }
    }

    return { ok, packageId, trackingNumber, itemResults, raw: asRecord(json) }
  }

  protected mapReview(data: Json, fallbackItemId: string): DomainReview {
    const item = asRecord(data.item ?? data.product ?? data.item_info)
    const order = asRecord(data.order_info ?? data.order)
    const sku = asRecord(data.sku_info ?? data.sku)
    const rawImages =
      data.images ??
      data.image_list ??
      data.review_images ??
      data.media_list ??
      []
    const images = (Array.isArray(rawImages) ? rawImages : [])
      .map((image) => {
        if (typeof image === "string") return image
        const record = asRecord(image)
        return firstString(record.url, record.image_url, record.media_url)
      })
      .filter((url): url is string => Boolean(url))

    return {
      externalReviewId: String(
        data.review_id ?? data.reviewId ?? data.id ?? ""
      ),
      externalItemId: String(
        data.item_id ?? item.item_id ?? item.id ?? fallbackItemId
      ),
      rating: firstNumber(data.rating, data.rate, data.star, data.score),
      title: firstString(data.title, data.review_title),
      content: firstString(
        data.review_content,
        data.content,
        data.comment,
        data.review_text
      ),
      reviewAt: toIso(
        data.review_time ??
          data.create_time ??
          data.created_at ??
          data.gmt_create
      ),
      purchasedAt: toIso(
        data.purchased_at ?? data.order_time ?? order.create_time
      ),
      buyerDisplayName: firstString(
        data.buyer_name,
        data.reviewer_name,
        data.user_name,
        data.buyer_nick
      ),
      buyerExternalId: firstString(
        data.buyer_id,
        data.user_id,
        data.reviewer_id
      ),
      externalOrderId: firstString(
        data.order_id,
        order.order_id,
        order.trade_order_id
      ),
      sellerSku: firstString(
        data.seller_sku,
        data.sku,
        sku.seller_sku,
        sku.SellerSku
      ),
      skuAttrs: asRecord(data.sku_attrs ?? sku.attributes),
      images,
      helpfulCount: firstNumber(data.useful_count, data.helpful_count),
      raw: data,
    }
  }

  protected mapProduct(data: Json): DomainProduct {
    return mapLazopProduct(data)
  }

  protected mapOrder(data: Json): DomainOrder {
    return mapLazopOrder(data)
  }
}
