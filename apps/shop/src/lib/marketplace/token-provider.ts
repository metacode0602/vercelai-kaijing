import {
  createTokenProvider,
  refreshLazopToken,
  refreshTiktokToken,
  type FetchLike,
  type MarketplacePlatform,
  type TokenProvider,
} from '@workspace/marketplace'
import { createDbCredentialStore } from './credential-store'

export { loadCredentialMeta } from './credential-store'

export function createShopTokenProvider(input: {
  shopId: string
  platform: MarketplacePlatform
  region?: string
  appKey: string
  appSecret: string
  fetchImpl?: FetchLike
}): TokenProvider {
  const store = createDbCredentialStore()

  if (input.platform === 'tiktok_shop') {
    return createTokenProvider({
      shopId: input.shopId,
      platform: input.platform,
      store,
      refreshToken: (refreshToken) =>
        refreshTiktokToken(
          {
            appKey: input.appKey,
            appSecret: input.appSecret,
            region: input.region,
            fetchImpl: input.fetchImpl,
          },
          refreshToken,
        ),
    })
  }

  const family = input.platform

  return createTokenProvider({
    shopId: input.shopId,
    platform: input.platform,
    store,
    refreshToken: (refreshToken) =>
      refreshLazopToken(
        {
          family,
          appKey: input.appKey,
          appSecret: input.appSecret,
          region: input.region,
          fetchImpl: input.fetchImpl,
        },
        refreshToken,
      ),
  })
}
