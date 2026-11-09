import type { TokenProvider } from "../tokens/types"
import type {
  DomainBrand,
  DomainCancelOrderInput,
  DomainCategory,
  DomainImCapabilityInfo,
  DomainImMessage,
  DomainListingInput,
  DomainListingResult,
  DomainOrder,
  DomainOrderLine,
  DomainOrderTrace,
  DomainProduct,
  DomainReverseDecideInput,
  DomainReverseOrder,
  DomainReverseOrderDetail,
  DomainReview,
  DomainSettlement,
  DomainSettlementLine,
  DomainShipmentInput,
  DomainShipmentResult,
  DomainShop,
  ImMessageListFilter,
  MarketplacePlatform,
  OAuthTokenSet,
  PageCursor,
  PagedResult,
  ReverseListFilter,
  ReviewListFilter,
  SettlementPayoutFilter,
  SettlementTransactionFilter,
} from "../domain/types"

export interface MarketplaceConnectorConfig {
  platform: MarketplacePlatform
  region?: string
  appKey: string
  appSecret: string
  accessToken?: string
  /** Lazily resolves access tokens and force-refreshes on auth errors. */
  tokenProvider?: TokenProvider
  /** TikTok shop_cipher when required. */
  shopCipher?: string
  /** Optional absolute callback URL override. */
  callbackUrl?: string
  fetchImpl?: typeof fetch
}

/**
 * Shared surface for shop / brand / category / product / listing / order / logistics.
 * Implementations adapt platform payloads into lean domain types.
 */
export interface MarketplaceConnector {
  readonly platform: MarketplacePlatform

  /** Build merchant authorize URL (state should be CSRF-safe). */
  buildAuthorizeUrl(input: {
    state: string
    redirectUri: string
    /** Country / region hint for Lazop authorize. */
    country?: string
  }): string

  exchangeCode(input: {
    code: string
    redirectUri?: string
  }): Promise<OAuthTokenSet>

  refreshToken(input: { refreshToken: string }): Promise<OAuthTokenSet>

  getShop(): Promise<DomainShop>

  listBrands(cursor?: PageCursor): Promise<PagedResult<DomainBrand>>

  getCategoryTree(): Promise<DomainCategory[]>

  getProduct(externalId: string): Promise<DomainProduct>

  listProducts(cursor?: PageCursor): Promise<PagedResult<DomainProduct>>

  createListing(input: DomainListingInput): Promise<DomainListingResult>

  updateListing(
    externalId: string,
    input: Partial<DomainListingInput>
  ): Promise<DomainListingResult>

  deactivateListing(externalId: string): Promise<DomainListingResult>

  getOrder(externalOrderId: string): Promise<DomainOrder>

  /** Lazop GetOrderItems — one DomainOrderLine per order_item_id (qty=1). */
  getOrderItems?(externalOrderId: string): Promise<DomainOrderLine[]>

  listOrders(cursor?: PageCursor): Promise<PagedResult<DomainOrder>>

  /** Settlement / payout statements (Lazop finance payout status). */
  listSettlements?(
    filter: SettlementPayoutFilter
  ): Promise<PagedResult<DomainSettlement>>

  /** Order-level finance transaction details. */
  listSettlementTransactions?(
    filter: SettlementTransactionFilter
  ): Promise<PagedResult<DomainSettlementLine>>

  /** Seller review list (Lazada/Daraz review APIs). */
  listReviews?(filter: ReviewListFilter): Promise<PagedResult<DomainReview>>

  /**
   * 平台 IM 能力。默认 'unknown'；adapter 应在文档确认后覆盖。
   * 见 docs/design/platform-apis/lazada/lazada-promotion-im-review-api.md。
   */
  imCapability?: DomainImCapabilityInfo

  /** 拉取店铺 IM 消息（只读）。仅 imCapability.capability === 'ready' 时实现。 */
  listMessages?(
    filter: ImMessageListFilter
  ): Promise<PagedResult<DomainImMessage>>

  /** Package-level logistics trace, available after RTS on Lazop. */
  getOrderTrace?(externalOrderId: string): Promise<DomainOrderTrace>

  packOrder?(input: DomainShipmentInput): Promise<DomainShipmentResult>

  readyToShip?(input: DomainShipmentInput): Promise<DomainShipmentResult>

  shipOrder(input: DomainShipmentInput): Promise<DomainShipmentResult>

  cancelOrder?(
    input: DomainCancelOrderInput
  ): Promise<{ ok: boolean; raw?: Record<string, unknown>; reasonId?: string }>

  /** 售后逆向单列表（Lazop GetReverseOrdersForSeller）。 */
  listReverseOrders?(filter: ReverseListFilter): Promise<PagedResult<DomainReverseOrder>>

  /** 售后逆向单详情（Lazop GetReverseOrderDetail）。 */
  getReverseOrderDetail?(
    reverseOrderId: string
  ): Promise<DomainReverseOrderDetail>

  /**
   * 卖家同意/拒绝退款决定。
   * Lazada: /order/reverse/cancel/seller/decide、/order/reverse/onlyrefund/seller/decide。
   * Daraz 公开文档未提供，adapter 不实现即可（capability 由 listReverseOrders 存在性推断）。
   */
  decideReverse?(input: DomainReverseDecideInput): Promise<{ ok: boolean; raw?: Record<string, unknown> }>
}
