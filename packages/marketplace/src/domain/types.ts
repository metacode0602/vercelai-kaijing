/**
 * Lean domain types mapped onto commerce tables.
 * Volatile platform payloads live in `raw` / `payload` jsonb columns.
 */

export type MarketplacePlatform = "daraz" | "lazada" | "tiktok_shop"

export interface DomainShop {
  externalShopId: string
  name: string
  region?: string
  currency?: string
  status?: string
  raw?: Record<string, unknown>
}

export interface DomainBrand {
  externalId: string
  name: string
  raw?: Record<string, unknown>
}

export interface DomainCategory {
  externalId: string
  name: string
  parentExternalId?: string | null
  leaf?: boolean
  raw?: Record<string, unknown>
}

export interface DomainProduct {
  externalId: string
  title: string
  status?: string
  skus?: DomainProductSku[]
  raw?: Record<string, unknown>
}

export interface DomainProductSku {
  externalSkuId?: string
  sellerSku?: string
  priceAmount?: string
  priceCurrency?: string
  quantity?: number
  raw?: Record<string, unknown>
}

export interface DomainListingInput {
  title: string
  categoryExternalId: string
  priceAmount: string
  priceCurrency: string
  /** Platform-specific attributes / images / description go here. */
  payload?: Record<string, unknown>
}

export interface DomainListingResult {
  externalId: string
  status: string
  raw?: Record<string, unknown>
}

export interface DomainOrder {
  externalOrderId: string
  status: string
  currency?: string
  totalAmount?: string
  placedAt?: string | null
  paidAt?: string | null
  lines?: DomainOrderLine[]
  raw?: Record<string, unknown>
}

export interface DomainOrderLine {
  externalLineId?: string
  sku?: string
  title?: string
  qty?: number
  unitPrice?: string
  raw?: Record<string, unknown>
}

export interface DomainShipmentInput {
  externalOrderId: string
  trackingNumber?: string
  shippingProvider?: string
  payload?: Record<string, unknown>
}

export interface DomainShipmentResult {
  ok: boolean
  trackingNumber?: string
  raw?: Record<string, unknown>
}

export interface PageCursor {
  cursor?: string | null
  pageSize?: number
}

export interface PagedResult<T> {
  items: T[]
  nextCursor?: string | null
  raw?: Record<string, unknown>
}

export interface OAuthTokenSet {
  accessToken: string
  refreshToken?: string
  expiresAt?: Date | null
  refreshExpiresAt?: Date | null
  /** Platform extras (e.g. shop_id, seller_id, country). */
  meta?: Record<string, unknown>
  raw?: Record<string, unknown>
}
