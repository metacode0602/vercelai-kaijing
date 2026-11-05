import { LazopHttpClient, type LazopFamily } from "../clients/lazop-http"
import type { MarketplaceConnector, MarketplaceConnectorConfig } from "./types"
import type {
  DomainBrand,
  DomainCancelOrderInput,
  DomainCategory,
  DomainListingInput,
  DomainListingResult,
  DomainOrder,
  DomainProduct,
  DomainShipmentInput,
  DomainShipmentItemResult,
  DomainShipmentResult,
  DomainShop,
  MarketplacePlatform,
  OAuthTokenSet,
  PageCursor,
  PagedResult,
} from "../domain/types"
import {
  buildLazopAuthorizeUrl,
  exchangeLazopCode,
  refreshLazopToken,
} from "../oauth/lazop"

type Json = Record<string, unknown>

function asRecord(value: unknown): Json {
  return value && typeof value === "object" ? (value as Json) : {}
}

function mapOrderStatus(raw: string | undefined): string {
  const s = (raw ?? "").toLowerCase()
  if (!s) return "unknown"
  if (s.includes("cancel")) return "cancelled"
  if (s.includes("deliver")) return "delivered"
  if (s.includes("ship") && !s.includes("ready")) return "shipped"
  if (s.includes("ready") || s.includes("packed") || s.includes("repacked"))
    return "ready_to_ship"
  if (s.includes("paid") || s.includes("pending")) return "paid"
  if (s.includes("unpaid") || s.includes("create")) return "created"
  return "unknown"
}

function mapListingStatus(raw: string | undefined): string {
  const s = (raw ?? "").toLowerCase()
  if (s.includes("live") || s === "active") return "live"
  if (s.includes("pending") || s.includes("audit")) return "pending_review"
  if (s.includes("reject") || s.includes("fail")) return "failed"
  if (s.includes("inactive") || s.includes("delete") || s.includes("suspend"))
    return "archived"
  return "draft"
}

export abstract class LazopConnectorBase implements MarketplaceConnector {
  abstract readonly platform: MarketplacePlatform
  protected readonly family: LazopFamily
  protected readonly cfg: MarketplaceConnectorConfig
  protected readonly http: LazopHttpClient

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
      input.code,
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
      input.refreshToken,
    )
  }

  async getShop(): Promise<DomainShop> {
    const json = await this.http.call<Json>({ path: "/seller/get" })
    const data = asRecord(json.data ?? json)
    return {
      externalShopId: String(data.seller_id ?? data.shop_id ?? data.short_code ?? ""),
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
    const module = (data.module ?? data.brand_list ?? data.brands ?? []) as Json[]
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
    const roots = Array.isArray(data) ? data : (asRecord(data).category_list as Json[]) ?? []
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
    const total = Number(data.total_products ?? data.totalProducts ?? Number.NaN)
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
    const payload = {
      ...input.payload,
      name: input.title,
      primary_category: input.categoryExternalId,
      price: input.priceAmount,
      currency: input.priceCurrency,
    }
    const json = await this.http.call<Json>({
      method: "POST",
      path: "/product/create",
      bodyParams: { payload: JSON.stringify(payload) },
    })
    const data = asRecord(json.data ?? json)
    return {
      externalId: String(data.item_id ?? data.product_id ?? ""),
      status: mapListingStatus(String(data.status ?? "submitted")),
      raw: data,
    }
  }

  async updateListing(
    externalId: string,
    input: Partial<DomainListingInput>,
  ): Promise<DomainListingResult> {
    const payload = {
      ...input.payload,
      item_id: externalId,
      name: input.title,
      primary_category: input.categoryExternalId,
      price: input.priceAmount,
      currency: input.priceCurrency,
    }
    const json = await this.http.call<Json>({
      method: "POST",
      path: "/product/update",
      bodyParams: { payload: JSON.stringify(payload) },
    })
    const data = asRecord(json.data ?? json)
    return {
      externalId: String(data.item_id ?? externalId),
      status: mapListingStatus(String(data.status ?? "submitted")),
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

  async getOrder(externalOrderId: string): Promise<DomainOrder> {
    const json = await this.http.call<Json>({
      path: "/order/get",
      params: { order_id: externalOrderId },
    })
    return this.mapOrder(asRecord(json.data ?? json))
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
    return {
      items: orders.map((o) => this.mapOrder(o)),
      nextCursor: hasMore ? String(offset + orders.length) : null,
      raw: data,
    }
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
        pkg.retry != null ? String(pkg.retry).toLowerCase() === "true" : undefined,
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

    const rts = await this.readyToShip({ ...input, packageId: packed.packageId })
    return {
      ...rts,
      trackingNumber: rts.trackingNumber ?? packed.trackingNumber,
      itemResults: [...(packed.itemResults ?? []), ...(rts.itemResults ?? [])],
      raw: { pack: packed.raw, rts: rts.raw },
    }
  }

  async cancelOrder(
    input: DomainCancelOrderInput,
  ): Promise<{ ok: boolean; raw?: Record<string, unknown>; reasonId?: string }> {
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
            item.order_item_id != null
              ? String(item.order_item_id)
              : undefined,
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

  protected mapProduct(data: Json): DomainProduct {
    const skus = (data.skus ?? data.sku_list ?? []) as Json[]
    return {
      externalId: String(data.item_id ?? data.product_id ?? data.id ?? ""),
      title: String(data.attributes
        ? (asRecord(data.attributes).name ?? data.name ?? "")
        : (data.name ?? data.title ?? "")),
      status: mapListingStatus(String(data.status ?? "")),
      skus: skus.map((sku) => ({
        externalSkuId: String(sku.sku_id ?? sku.ShopSku ?? ""),
        sellerSku: String(sku.SellerSku ?? sku.seller_sku ?? ""),
        priceAmount: sku.price != null ? String(sku.price) : undefined,
        quantity: sku.quantity != null ? Number(sku.quantity) : undefined,
        raw: sku,
      })),
      raw: data,
    }
  }

  protected mapOrder(data: Json): DomainOrder {
    const items = (data.order_items ?? data.items ?? data.order_line ?? []) as Json[]
    return {
      externalOrderId: String(data.order_id ?? data.order_number ?? ""),
      status: mapOrderStatus(
        String(
          (Array.isArray(data.statuses) ? data.statuses[0] : undefined) ??
            data.status ??
            "",
        ),
      ),
      currency: data.price_unit ? String(data.price_unit) : undefined,
      totalAmount:
        data.price != null
          ? String(data.price)
          : data.order_total != null
            ? String(data.order_total)
            : undefined,
      placedAt: data.created_at ? String(data.created_at) : null,
      paidAt: data.payment_time ? String(data.payment_time) : null,
      lines: items.map((line) => ({
        externalLineId: String(line.order_item_id ?? line.order_line_id ?? ""),
        sku: String(line.sku ?? line.seller_sku ?? ""),
        title: String(line.name ?? line.product_name ?? ""),
        qty: line.quantity != null ? Number(line.quantity) : 1,
        unitPrice: line.item_price != null ? String(line.item_price) : undefined,
        raw: line,
      })),
      raw: data,
    }
  }
}
