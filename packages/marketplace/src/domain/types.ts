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
  /**
   * Set when /order/items/get failed after a successful header fetch.
   * Empty lines without this field means the platform returned zero items.
   */
  itemsFetchError?: string
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
  /** Required by `/order/fulfill/pack`; one entry per order item unit. */
  orderItemIds?: string[]
  /** Returned by pack; required by `/order/package/rts`. */
  packageId?: string
  deliveryType?: string
  shippingAllocateType?: string
  shipmentProviderCode?: string
  trackingNumber?: string
  shippingProvider?: string
  payload?: Record<string, unknown>
}

export interface DomainShipmentItemResult {
  orderItemId?: string
  packageId?: string
  code?: string
  message?: string
  retry?: boolean
}

export interface DomainShipmentResult {
  ok: boolean
  trackingNumber?: string
  packageId?: string
  itemResults?: DomainShipmentItemResult[]
  raw?: Record<string, unknown>
}

export interface DomainCancelOrderInput {
  externalOrderId: string
  orderItemIds?: string[]
  /** From `/order/reverse/cancel/validate`; resolved automatically when omitted. */
  reasonId?: string
  reason?: string
}

export interface DomainReview {
  externalReviewId: string
  externalItemId: string
  rating?: number
  title?: string
  content?: string
  reviewAt?: string | null
  purchasedAt?: string | null
  buyerDisplayName?: string
  buyerExternalId?: string
  externalOrderId?: string
  sellerSku?: string
  skuAttrs?: Record<string, unknown>
  images?: string[]
  helpfulCount?: number
  raw?: Record<string, unknown>
}

export interface ReviewListFilter {
  itemId: string
  /** Inclusive lower bound (ISO or epoch milliseconds). */
  startTime?: string
  /** Exclusive upper bound (ISO or epoch milliseconds). */
  endTime?: string
  /** Opaque page cursor; Lazop uses 1-based page numbers. */
  cursor?: string | null
  pageSize?: number
}

export interface DomainTrackingEvent {
  statusCode: string
  title?: string
  description?: string
  location?: string
  eventTime: string
  raw?: Record<string, unknown>
}

export interface DomainTracePackage {
  externalPackageId: string
  trackingNumber?: string
  providerName?: string
  events: DomainTrackingEvent[]
  raw?: Record<string, unknown>
}

export interface DomainOrderTrace {
  externalOrderId: string
  packages: DomainTracePackage[]
  raw?: Record<string, unknown>
}

export interface PageCursor {
  cursor?: string | null
  pageSize?: number
  updatedAfter?: string
  updatedBefore?: string
  createdAfter?: string
  createdBefore?: string
  status?: string
  sortBy?: "created_at" | "updated_at"
  sortDirection?: "ASC" | "DESC"
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

export interface DomainSettlement {
  externalSettlementId: string
  /** Platform payout status raw, e.g. paid / unpaid / "1" / "0". */
  payoutStatus?: string
  paid?: boolean | null
  currency?: string
  payoutAmount?: string
  openingBalance?: string
  closingBalance?: string
  guaranteeDeposit?: string
  itemRevenue?: string
  otherRevenueTotal?: string
  subtotal1?: string
  subtotal2?: string
  refundsAmount?: string
  feesOnRefundsTotal?: string
  shipmentFee?: string
  shipmentFeeCredit?: string
  feesTotal?: string
  billAmount?: string
  createdAt?: string | null
  updatedAt?: string | null
  lines?: DomainSettlementLine[]
  raw?: Record<string, unknown>
}

export interface DomainSettlementLine {
  externalTransactionId: string
  transactionType?: string
  feeType?: string
  feeName?: string
  feeKind?: string
  amount?: string
  taxAmount?: string
  whtAmount?: string
  whtIncludedInAmount?: boolean
  currency?: string
  paidStatus?: string
  paymentReference?: string
  externalOrderNo?: string
  externalOrderItemNo?: string
  sellerSku?: string
  platformSkuId?: string
  shippingProvider?: string
  shippingSpeed?: string
  shipmentType?: string
  statement?: string
  note?: string
  transactionDate?: string | null
  raw?: Record<string, unknown>
}

export interface SettlementPayoutFilter {
  /** Inclusive lower bound date (yyyy-MM-dd or ISO). */
  createdAfter: string
  cursor?: string | null
  pageSize?: number
}

export interface SettlementTransactionFilter {
  startTime: string
  endTime: string
  cursor?: string | null
  pageSize?: number
  tradeOrderId?: string
  transType?: string
}
