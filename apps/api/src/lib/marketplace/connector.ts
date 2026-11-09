import {
  createDbCredentialStore,
  createMarketplaceConnector,
  createTokenProvider,
  refreshLazopToken,
  refreshTiktokToken,
  resolveMarketplaceAppCredential,
  type MarketplaceConnector,
} from "@workspace/marketplace"
import { db } from "../db"
import {
  isLazopPlatform,
  type MarketplaceSyncPlatform,
} from "./app-env"

export interface MarketplaceShopConnection {
  id: string
  organizationId: string
  platform: string
  region: string | null
  /** TikTok shop_cipher from shops.meta when present. */
  shopCipher?: string | null
}

export async function createShopConnector(
  shop: MarketplaceShopConnection
): Promise<MarketplaceConnector> {
  if (
    shop.platform !== "daraz" &&
    shop.platform !== "lazada" &&
    shop.platform !== "tiktok_shop"
  ) {
    throw new Error(`Unsupported marketplace platform: ${shop.platform}`)
  }
  const platform = shop.platform as MarketplaceSyncPlatform
  const app = await resolveMarketplaceAppCredential(db, {
    organizationId: shop.organizationId,
    platform,
    region: shop.region ?? "",
  })
  if (!app) {
    throw new Error(
      `Missing ${platform} app credentials for organization ${shop.organizationId}`
    )
  }

  const region = shop.region?.trim() || app.region
  const tokenProvider = createTokenProvider({
    shopId: shop.id,
    platform,
    store: createDbCredentialStore(db),
    refreshToken: (refreshToken) => {
      if (isLazopPlatform(platform)) {
        return refreshLazopToken(
          {
            family: platform,
            appKey: app.appKey,
            appSecret: app.appSecret,
            region,
          },
          refreshToken
        )
      }
      return refreshTiktokToken(
        {
          appKey: app.appKey,
          appSecret: app.appSecret,
          region,
        },
        refreshToken
      )
    },
  })

  return createMarketplaceConnector({
    platform,
    region,
    appKey: app.appKey,
    appSecret: app.appSecret,
    tokenProvider,
    shopCipher: shop.shopCipher ?? undefined,
  })
}
