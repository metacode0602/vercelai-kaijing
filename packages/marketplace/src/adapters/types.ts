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

export interface MarketplaceConnectorConfig {
  platform: MarketplacePlatform
  region?: string
  appKey: string
  appSecret: string
  accessToken?: string
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
    input: Partial<DomainListingInput>,
  ): Promise<DomainListingResult>

  deactivateListing(externalId: string): Promise<DomainListingResult>

  getOrder(externalOrderId: string): Promise<DomainOrder>

  listOrders(
    cursor?: PageCursor & { createdAfter?: string; createdBefore?: string },
  ): Promise<PagedResult<DomainOrder>>

  packOrder?(input: DomainShipmentInput): Promise<DomainShipmentResult>

  readyToShip?(input: DomainShipmentInput): Promise<DomainShipmentResult>

  shipOrder(input: DomainShipmentInput): Promise<DomainShipmentResult>

  cancelOrder?(
    externalOrderId: string,
    reason?: string,
  ): Promise<{ ok: boolean; raw?: Record<string, unknown> }>
}
