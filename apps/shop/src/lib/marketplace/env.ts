import type { MarketplacePlatform } from '@workspace/marketplace'

export interface MarketplaceAppEnv {
  platform: MarketplacePlatform
  appKey: string
  appSecret: string
  callbackUrl: string
  defaultRegion: string
}

function baseUrl() {
  return (
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_URL ||
    'http://localhost:3000'
  ).replace(/\/+$/, '')
}

function defaultCallback() {
  return `${baseUrl()}/api/marketplace/oauth/callback`
}

export function getMarketplaceAppEnv(platform: MarketplacePlatform): MarketplaceAppEnv {
  if (platform === 'daraz') {
    return {
      platform,
      appKey: process.env.DARAZ_APP_KEY ?? '',
      appSecret: process.env.DARAZ_APP_SECRET ?? '',
      callbackUrl: process.env.DARAZ_CALLBACK_URL || defaultCallback(),
      defaultRegion: process.env.DARAZ_DEFAULT_REGION || 'lk',
    }
  }
  if (platform === 'lazada') {
    return {
      platform,
      appKey: process.env.LAZADA_APP_KEY ?? '',
      appSecret: process.env.LAZADA_APP_SECRET ?? '',
      callbackUrl: process.env.LAZADA_CALLBACK_URL || defaultCallback(),
      defaultRegion: process.env.LAZADA_DEFAULT_REGION || 'sg',
    }
  }
  return {
    platform: 'tiktok_shop',
    appKey: process.env.TIKTOK_APP_KEY ?? '',
    appSecret: process.env.TIKTOK_APP_SECRET ?? '',
    callbackUrl: process.env.TIKTOK_CALLBACK_URL || defaultCallback(),
    defaultRegion: process.env.TIKTOK_DEFAULT_REGION || 'global',
  }
}

export function assertMarketplaceAppConfigured(env: MarketplaceAppEnv) {
  if (!env.appKey || !env.appSecret) {
    throw new Error(`Missing app credentials for platform ${env.platform}`)
  }
}
