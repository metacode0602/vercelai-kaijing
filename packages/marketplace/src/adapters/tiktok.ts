import { TiktokHttpClient } from "../clients/tiktok-http"
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
  OAuthTokenSet,
  PageCursor,
  PagedResult,
} from "../domain/types"
import {
  buildTiktokAuthorizeUrl,
  exchangeTiktokCode,
  refreshTiktokToken,
} from "../oauth/tiktok"
import { DEFAULT_TIKTOK_REGION } from "../regions/endpoints"

type Json = Record<string, unknown>

function asRecord(value: unknown): Json {
  return value && typeof value === "object" ? (value as Json) : {}
}

function mapOrderStatus(raw: string | undefined): string {
  const s = (raw ?? "").toUpperCase()
  if (!s) return "unknown"
  if (s.includes("CANCEL")) return "cancelled"
  if (s.includes("DELIVER")) return "delivered"
  if (s.includes("AWAITING_COLLECTION") || s.includes("IN_TRANSIT") || s.includes("SHIPPED"))
    return "shipped"
  if (s.includes("AWAITING_SHIPMENT") || s.includes("READY")) return "ready_to_ship"
  if (s.includes("UNPAID")) return "created"
  if (s.includes("ON_HOLD") || s.includes("PARTIALLY")) return "paid"
  return "unknown"
}

export class TiktokConnector implements MarketplaceConnector {
  readonly platform = "tiktok_shop" as const
  private readonly cfg: MarketplaceConnectorConfig
  private readonly http: TiktokHttpClient

  constructor(cfg: MarketplaceConnectorConfig) {
    this.cfg = {
      ...cfg,
      region: cfg.region ?? DEFAULT_TIKTOK_REGION,
      platform: "tiktok_shop",
    }
    this.http = new TiktokHttpClient({
      region: this.cfg.region,
      appKey: cfg.appKey,
      appSecret: cfg.appSecret,
      accessToken: cfg.accessToken,
      shopCipher: cfg.shopCipher,
      fetchImpl: cfg.fetchImpl,
    })
  }

  buildAuthorizeUrl(input: {
    state: string
    redirectUri: string
    country?: string
  }): string {
    return buildTiktokAuthorizeUrl({
      appKey: this.cfg.appKey,
      redirectUri: input.redirectUri,
      state: input.state,
      region: this.cfg.region,
    })
  }

  exchangeCode(input: { code: string }): Promise<OAuthTokenSet> {
    return exchangeTiktokCode(
      {
        appKey: this.cfg.appKey,
        appSecret: this.cfg.appSecret,
        region: this.cfg.region,
        fetchImpl: this.cfg.fetchImpl,
      },
      input.code,
    )
  }

  refreshToken(input: { refreshToken: string }): Promise<OAuthTokenSet> {
    return refreshTiktokToken(
      {
        appKey: this.cfg.appKey,
        appSecret: this.cfg.appSecret,
        region: this.cfg.region,
        fetchImpl: this.cfg.fetchImpl,
      },
      input.refreshToken,
    )
  }

  async getShop(): Promise<DomainShop> {
    const json = await this.http.call<Json>({
      path: "/authorization/202309/shops",
    })
    const shops = (asRecord(json.data).shops ?? []) as Json[]
    const shop = shops[0] ?? asRecord(json.data)
    if (shop.cipher) {
      this.http.setShopCipher(String(shop.cipher))
    }
    return {
      externalShopId: String(shop.id ?? shop.shop_id ?? ""),
      name: String(shop.name ?? shop.shop_name ?? "tiktok_shop"),
      region: String(shop.region ?? shop.seller_type ?? this.cfg.region ?? ""),
      status: "active",
      raw: shop,
    }
  }

  async listBrands(cursor?: PageCursor): Promise<PagedResult<DomainBrand>> {
    const json = await this.http.call<Json>({
      method: "GET",
      path: "/product/202309/brands",
      query: {
        page_size: cursor?.pageSize ?? 50,
        page_token: cursor?.cursor ?? undefined,
      },
    })
    const data = asRecord(json.data)
    const brands = (data.brands ?? []) as Json[]
    return {
      items: brands.map((b) => ({
        externalId: String(b.id ?? b.brand_id ?? ""),
        name: String(b.name ?? ""),
        raw: b,
      })),
      nextCursor: data.next_page_token ? String(data.next_page_token) : null,
      raw: data,
    }
  }

  async getCategoryTree(): Promise<DomainCategory[]> {
    const json = await this.http.call<Json>({
      path: "/product/202309/categories",
    })
    const categories = (asRecord(json.data).categories ?? []) as Json[]
    return categories.map((c) => ({
      externalId: String(c.id ?? c.category_id ?? ""),
      name: String(c.local_name ?? c.name ?? ""),
      parentExternalId: c.parent_id != null ? String(c.parent_id) : null,
      leaf: Boolean(c.is_leaf),
      raw: c,
    }))
  }

  async getProduct(externalId: string): Promise<DomainProduct> {
    const json = await this.http.call<Json>({
      path: `/product/202309/products/${externalId}`,
    })
    return this.mapProduct(asRecord(json.data))
  }

  async listProducts(cursor?: PageCursor): Promise<PagedResult<DomainProduct>> {
    const json = await this.http.call<Json>({
      method: "POST",
      path: "/product/202309/products/search",
      query: {
        page_size: cursor?.pageSize ?? 50,
        page_token: cursor?.cursor ?? undefined,
      },
      body: { status: "ALL" },
    })
    const data = asRecord(json.data)
    const products = (data.products ?? []) as Json[]
    return {
      items: products.map((p) => this.mapProduct(p)),
      nextCursor: data.next_page_token ? String(data.next_page_token) : null,
      raw: data,
    }
  }

  async createListing(input: DomainListingInput): Promise<DomainListingResult> {
    const body = {
      title: input.title,
      category_id: input.categoryExternalId,
      skus: [
        {
          price: { amount: input.priceAmount, currency: input.priceCurrency },
        },
      ],
      ...(input.payload ?? {}),
    }
    const json = await this.http.call<Json>({
      method: "POST",
      path: "/product/202309/products",
      body,
    })
    const data = asRecord(json.data)
    return {
      externalId: String(data.product_id ?? data.id ?? ""),
      status: "submitted",
      raw: data,
    }
  }

  async updateListing(
    externalId: string,
    input: Partial<DomainListingInput>,
  ): Promise<DomainListingResult> {
    const body = {
      title: input.title,
      category_id: input.categoryExternalId,
      ...(input.payload ?? {}),
    }
    const json = await this.http.call<Json>({
      method: "PUT",
      path: `/product/202309/products/${externalId}`,
      body,
    })
    return {
      externalId,
      status: "submitted",
      raw: asRecord(json.data),
    }
  }

  async deactivateListing(externalId: string): Promise<DomainListingResult> {
    const json = await this.http.call<Json>({
      method: "POST",
      path: "/product/202309/products/deactivate",
      body: { product_ids: [externalId] },
    })
    return { externalId, status: "archived", raw: asRecord(json.data) }
  }

  async getOrder(externalOrderId: string): Promise<DomainOrder> {
    const json = await this.http.call<Json>({
      method: "POST",
      path: "/order/202309/orders/detail/query",
      body: { ids: [externalOrderId] },
    })
    const orders = (asRecord(json.data).orders ?? []) as Json[]
    return this.mapOrder(orders[0] ?? asRecord(json.data))
  }

  async listOrders(
    cursor?: PageCursor & { createdAfter?: string; createdBefore?: string },
  ): Promise<PagedResult<DomainOrder>> {
    const json = await this.http.call<Json>({
      method: "POST",
      path: "/order/202309/orders/search",
      query: {
        page_size: cursor?.pageSize ?? 50,
        page_token: cursor?.cursor ?? undefined,
      },
      body: {
        create_time_ge: cursor?.createdAfter
          ? Math.floor(Date.parse(cursor.createdAfter) / 1000)
          : undefined,
        create_time_lt: cursor?.createdBefore
          ? Math.floor(Date.parse(cursor.createdBefore) / 1000)
          : undefined,
      },
    })
    const data = asRecord(json.data)
    const orders = (data.orders ?? []) as Json[]
    return {
      items: orders.map((o) => this.mapOrder(o)),
      nextCursor: data.next_page_token ? String(data.next_page_token) : null,
      raw: data,
    }
  }

  async shipOrder(input: DomainShipmentInput): Promise<DomainShipmentResult> {
    const json = await this.http.call<Json>({
      method: "POST",
      path: "/fulfillment/202309/orders/ship",
      body: {
        order_id: input.externalOrderId,
        tracking_number: input.trackingNumber,
        shipping_provider_id: input.shippingProvider,
        ...(input.payload ?? {}),
      },
    })
    return {
      ok: true,
      trackingNumber: input.trackingNumber,
      raw: asRecord(json.data),
    }
  }

  async cancelOrder(
    externalOrderId: string,
    reason?: string,
  ): Promise<{ ok: boolean; raw?: Record<string, unknown> }> {
    const json = await this.http.call<Json>({
      method: "POST",
      path: "/order/202309/orders/cancel",
      body: {
        order_id: externalOrderId,
        cancel_reason: reason ?? "seller_cancel",
      },
    })
    return { ok: true, raw: asRecord(json.data) }
  }

  private mapProduct(data: Json): DomainProduct {
    const skus = (data.skus ?? []) as Json[]
    return {
      externalId: String(data.id ?? data.product_id ?? ""),
      title: String(data.title ?? data.product_name ?? ""),
      status: String(data.status ?? ""),
      skus: skus.map((sku) => ({
        externalSkuId: String(sku.id ?? ""),
        sellerSku: String(sku.seller_sku ?? ""),
        priceAmount: asRecord(sku.price).amount
          ? String(asRecord(sku.price).amount)
          : undefined,
        priceCurrency: asRecord(sku.price).currency
          ? String(asRecord(sku.price).currency)
          : undefined,
        quantity: sku.inventory != null ? Number(asRecord(sku.inventory as Json).quantity ?? sku.inventory) : undefined,
        raw: sku,
      })),
      raw: data,
    }
  }

  private mapOrder(data: Json): DomainOrder {
    const lines = (data.line_items ?? data.item_list ?? []) as Json[]
    const payment = asRecord(data.payment)
    return {
      externalOrderId: String(data.id ?? data.order_id ?? ""),
      status: mapOrderStatus(String(data.status ?? "")),
      currency: payment.currency ? String(payment.currency) : undefined,
      totalAmount: payment.total_amount != null ? String(payment.total_amount) : undefined,
      placedAt: data.create_time
        ? new Date(Number(data.create_time) * 1000).toISOString()
        : null,
      paidAt: data.paid_time
        ? new Date(Number(data.paid_time) * 1000).toISOString()
        : null,
      lines: lines.map((line) => ({
        externalLineId: String(line.id ?? ""),
        sku: String(line.seller_sku ?? line.sku_id ?? ""),
        title: String(line.product_name ?? line.sku_name ?? ""),
        qty: line.quantity != null ? Number(line.quantity) : 1,
        unitPrice: line.sale_price != null ? String(line.sale_price) : undefined,
        raw: line,
      })),
      raw: data,
    }
  }
}

export function createTiktokConnector(cfg: Omit<MarketplaceConnectorConfig, "platform">) {
  return new TiktokConnector({ ...cfg, platform: "tiktok_shop" })
}
