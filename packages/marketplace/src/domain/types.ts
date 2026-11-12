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

export interface DomainPriceQuantitySku {
  sellerSku: string
  platformSkuId?: string
  /** 平台售价；仅改价回写时必填。 */
  price?: string
  /** 可售数量（绝对值）；仅库存推送时必填。 */
  quantity?: number
}

export interface DomainPriceQuantityItem {
  externalItemId: string
  skus: DomainPriceQuantitySku[]
}

export interface DomainPriceQuantityResult {
  ok: boolean
  error?: string
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

/**
 * Batch ship request — LGS / JSB 交接批次提交交运时按包裹逐单调用平台 OpenAPI。
 * 一个批次通常单店铺；多店铺时由调用方按 shopId 分组后分别调用。
 */
export interface DomainBatchShipPackage {
  externalOrderId: string
  externalPackageId: string
  /** 已 pack 时平台返回的 package_id；缺省时 connector 会先调 pack。 */
  platformPackageId?: string
  /** /order/fulfill/pack 必填；缺省时 connector 尝试从订单行解析。 */
  orderItemIds?: string[]
  trackingNumber?: string
  shipmentProviderCode?: string
}

export interface DomainBatchShipInput {
  batchId: string
  packages: DomainBatchShipPackage[]
}

export interface DomainBatchShipFailure {
  externalPackageId: string
  message: string
}

export interface DomainBatchShipResult {
  ok: boolean
  shippedCount: number
  failures: DomainBatchShipFailure[]
  raw?: Record<string, unknown>
}

export interface DomainCancelOrderInput {
  externalOrderId: string
  orderItemIds?: string[]
  /** From `/order/reverse/cancel/validate`; resolved automatically when omitted. */
  reasonId?: string
  reason?: string
}

/** 售后逆向单类型 @see docs/design/platform-apis/lazada/lazada-aftersales-api.md */
export type DomainReverseRequestType = "CANCEL" | "RETURN" | "ONLY_REFUND"

export interface DomainReverseOrder {
  externalReverseOrderId: string
  externalTradeOrderId?: string
  requestType: DomainReverseRequestType
  /** 退回卖家 (RTM) 还是平台仓 (RTW)。 */
  returnToType?: "RTM" | "RTW"
  shippingType?: "PICK_UP" | "DROP_OFF"
  isRtm?: boolean
  /** 逆向行摘要；详情接口才含金额。 */
  lines?: DomainReverseOrderLine[]
  raw?: Record<string, unknown>
}

export interface DomainReverseOrderLine {
  externalReverseLineId: string
  externalOrderLineId?: string
  reverseStatus?: string
  fulfillmentStatus?: string
  reasonCode?: string
  reasonText?: string
  /** 退款金额（major 单位，已按站点归一化）。 */
  refundAmount?: string
  currency?: string
  /** 商品单价（major 单位）。 */
  itemUnitPrice?: string
  qcDecision?: string
  trackingNumber?: string
  sellerSku?: string
  slaAt?: string | null
  isDispute?: boolean
  isNeedRefund?: boolean
  raw?: Record<string, unknown>
}

export interface DomainReverseOrderDetail extends DomainReverseOrder {
  platformCreatedAt?: string | null
  platformUpdatedAt?: string | null
  disputeInProgress?: boolean
  lines: DomainReverseOrderLine[]
}

export interface ReverseListFilter {
  cursor?: string | null
  pageSize?: number
  /** 增量下界（毫秒时间戳或 ISO）。 */
  updatedAfter?: string
  updatedBefore?: string
  requestTypeList?: DomainReverseRequestType[]
  reverseStatusList?: string[]
}

export interface DomainReverseDecideInput {
  externalReverseOrderId: string
  requestType: DomainReverseRequestType
  /** 同意或拒绝。 */
  agree: boolean
  /** 拒绝原因码（来自 GetReverseOrderReasonList；拒绝时必填）。 */
  reasonCode?: string
  comment?: string
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

/**
 * 平台 IM 能力标记。参见 docs/design/platform-apis 下各平台 IM 章节。
 * - ready：API 已知且 adapter 已实现 listMessages
 * - known_unimplemented：平台 API 文档已确认存在 IM 接口，adapter 未实现
 * - unknown：文档未确认是否存在 IM API
 * - unsupported：明确不存在 IM API
 */
export type MarketplaceImCapability =
  | "ready"
  | "known_unimplemented"
  | "unknown"
  | "unsupported"

/** 平台 IM 会话/消息领域模型（只读拉取）。 */
export interface DomainImMessage {
  externalMessageId: string
  externalSessionId?: string
  customer?: string
  customerExternalId?: string
  subject?: string
  preview?: string
  body?: string
  sku?: string
  status?: "unread" | "read"
  receivedAt?: string | null
  raw?: Record<string, unknown>
}

export interface ImMessageListFilter {
  /** 上一页游标；Lazop IM 用 start_time + last_message_id 双游标。 */
  cursor?: string | null
  startTime?: string
  endTime?: string
  pageSize?: number
}

export interface DomainImCapabilityInfo {
  capability: MarketplaceImCapability
  /** 文档依据，例如 docs/design/platform-apis/lazada/lazada-promotion-im-review-api.md。 */
  docRef?: string
  /** 人类可读说明，展示给控制台用户。 */
  note?: string
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
