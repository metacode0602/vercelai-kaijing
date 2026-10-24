import { LazopHttpClient, type LazopFamily } from "../clients/lazop-http"
import type { MarketplaceConnector, MarketplaceConnectorConfig } from "./types"
import type {
  DomainBrand,
  DomainCategory,
  DomainListingInput,
  DomainListingResult,
  DomainOrder,
  DomainProduct,
  DomainShipmentInput,
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
      fetchImpl: cfg.fetchImpl,
    })
  }

  buildAuthorizeUrl(input: {
    state: string
    redirectUri: string
    country?: string
  }): string {
    return buildLazopAuthorizeUrl({
      appKey: this.cfg.appKey,
      redirectUri: input.redirectUri,
      state: input.state,
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
    const json = await this.http.call<Json>({
      path: "/brands/get",
      params: {
        offset: cursor?.cursor ?? "0",
        limit: cursor?.pageSize ?? 100,
      },
    })
    const data = asRecord(json.data ?? json)
    const module = (data.module ?? data.brand_list ?? data.brands ?? []) as Json[]
    const items = (Array.isArray(module) ? module : []).map((b) => ({
      externalId: String(b.brand_id ?? b.id ?? ""),
      name: String(b.name ?? b.brand_name ?? ""),
      raw: b,
    }))
    const nextOffset =
      data.start_row !== undefined
        ? String(Number(data.start_row) + items.length)
        : undefined
    return { items, nextCursor: nextOffset, raw: data }
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
    const json = await this.http.call<Json>({
      path: "/products/get",
      params: {
        offset: cursor?.cursor ?? "0",
        limit: cursor?.pageSize ?? 50,
        filter: JSON.stringify({}),
      },
    })
    const data = asRecord(json.data ?? json)
    const products = (data.products ?? data.items ?? []) as Json[]
    return {
      items: products.map((p) => this.mapProduct(p)),
      nextCursor: data.next_offset ? String(data.next_offset) : null,
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

  async listOrders(
    cursor?: PageCursor & { createdAfter?: string; createdBefore?: string },
  ): Promise<PagedResult<DomainOrder>> {
    const json = await this.http.call<Json>({
      path: "/orders/get",
      params: {
        offset: cursor?.cursor ?? "0",
        limit: cursor?.pageSize ?? 50,
        created_after: cursor?.createdAfter,
        created_before: cursor?.createdBefore,
      },
    })
    const data = asRecord(json.data ?? json)
    const orders = (data.orders ?? data.order_list ?? []) as Json[]
    return {
      items: orders.map((o) => this.mapOrder(o)),
      nextCursor: data.next_offset ? String(data.next_offset) : null,
      raw: data,
    }
  }

  async packOrder(input: DomainShipmentInput): Promise<DomainShipmentResult> {
    const json = await this.http.call<Json>({
      method: "POST",
      path: "/order/pack",
      bodyParams: {
        pack_req: JSON.stringify({
          pack_order_list: [
            {
              order_id: input.externalOrderId,
              ...(input.payload ?? {}),
            },
          ],
        }),
      },
    })
    return { ok: true, raw: asRecord(json.data ?? json) }
  }

  async readyToShip(input: DomainShipmentInput): Promise<DomainShipmentResult> {
    const json = await this.http.call<Json>({
      method: "POST",
      path: "/order/rts",
      bodyParams: {
        ready_to_ship_req: JSON.stringify({
          order_id: input.externalOrderId,
          ...(input.payload ?? {}),
        }),
      },
    })
    return { ok: true, raw: asRecord(json.data ?? json) }
  }

  async shipOrder(input: DomainShipmentInput): Promise<DomainShipmentResult> {
    // Prefer pack → rts sequence helpers; shipment/get for tracking read-back.
    if (input.trackingNumber || input.shippingProvider) {
      const json = await this.http.call<Json>({
        method: "POST",
        path: "/order/fulfill",
        bodyParams: {
          order_id: input.externalOrderId,
          tracking_number: input.trackingNumber,
          shipment_provider: input.shippingProvider,
          ...(input.payload ?? {}),
        },
      })
      return {
        ok: true,
        trackingNumber: input.trackingNumber,
        raw: asRecord(json.data ?? json),
      }
    }
    await this.packOrder(input)
    return this.readyToShip(input)
  }

  async cancelOrder(
    externalOrderId: string,
    reason?: string,
  ): Promise<{ ok: boolean; raw?: Record<string, unknown> }> {
    const json = await this.http.call<Json>({
      method: "POST",
      path: "/order/cancel",
      bodyParams: {
        order_id: externalOrderId,
        reason_id: reason ?? "seller_cancel",
      },
    })
    return { ok: true, raw: asRecord(json.data ?? json) }
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
