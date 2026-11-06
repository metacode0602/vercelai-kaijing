import { TiktokHttpClient } from "../clients/tiktok-http"
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
import { mapTiktokOrder, mapTiktokProduct } from "../mappers/tiktok"

type Json = Record<string, unknown>

function asRecord(value: unknown): Json {
  return value && typeof value === "object" ? (value as Json) : {}
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
      tokenProvider: cfg.tokenProvider,
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
    return mapTiktokProduct(asRecord(json.data))
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
      items: products.map((p) => mapTiktokProduct(p)),
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
    return mapTiktokOrder(orders[0] ?? asRecord(json.data))
  }

  async listOrders(cursor?: PageCursor): Promise<PagedResult<DomainOrder>> {
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
        update_time_ge: cursor?.updatedAfter
          ? Math.floor(Date.parse(cursor.updatedAfter) / 1000)
          : undefined,
        update_time_lt: cursor?.updatedBefore
          ? Math.floor(Date.parse(cursor.updatedBefore) / 1000)
          : undefined,
        order_status: cursor?.status,
        sort_order: cursor?.sortDirection,
      },
    })
    const data = asRecord(json.data)
    const orders = (data.orders ?? []) as Json[]
    return {
      items: orders.map((o) => mapTiktokOrder(o)),
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
    input: DomainCancelOrderInput,
  ): Promise<{ ok: boolean; raw?: Record<string, unknown> }> {
    const json = await this.http.call<Json>({
      method: "POST",
      path: "/order/202309/orders/cancel",
      body: {
        order_id: input.externalOrderId,
        ...(input.orderItemIds?.length
          ? { order_item_ids: input.orderItemIds }
          : {}),
        cancel_reason: input.reason ?? input.reasonId ?? "seller_cancel",
      },
    })
    return { ok: true, raw: asRecord(json.data) }
  }

}

export function createTiktokConnector(cfg: Omit<MarketplaceConnectorConfig, "platform">) {
  return new TiktokConnector({ ...cfg, platform: "tiktok_shop" })
}
