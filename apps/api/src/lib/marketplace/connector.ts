import {
  createDbCredentialStore,
  createMarketplaceConnector,
  createTokenProvider,
  refreshLazopToken,
  type MarketplaceConnector,
} from "@workspace/marketplace"
import { db } from "../db"
import { getMarketplaceAppCredentials, type LazopPlatform } from "./app-env"

export interface MarketplaceShopConnection {
  id: string
  platform: string
  region: string | null
}

export function createShopConnector(
  shop: MarketplaceShopConnection
): MarketplaceConnector {
  const platform = shop.platform as LazopPlatform
  const app = getMarketplaceAppCredentials(platform)
  if (!app.appKey || !app.appSecret) {
    throw new Error(`Missing ${platform} app credentials`)
  }

  const region = shop.region ?? app.defaultRegion
  const tokenProvider = createTokenProvider({
    shopId: shop.id,
    platform,
    store: createDbCredentialStore(db),
    refreshToken: (refreshToken) =>
      refreshLazopToken(
        {
          family: platform,
          appKey: app.appKey,
          appSecret: app.appSecret,
          region,
        },
        refreshToken
      ),
  })

  return createMarketplaceConnector({
    platform,
    region,
    appKey: app.appKey,
    appSecret: app.appSecret,
    tokenProvider,
  })
}
