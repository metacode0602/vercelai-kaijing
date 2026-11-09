import type { MarketplacePlatform } from '@workspace/marketplace'

export function marketplaceBaseUrl() {
  return (
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  ).replace(/\/+$/, '')
}

/**
 * Default callback: `{base}/api/marketplace/{platform}/oauth/callback`
 * Optional per-app callback: append `/{callbackKey}`.
 */
export function resolveMarketplaceCallbackUrl(
  platform: MarketplacePlatform,
  callbackKey?: string | null,
) {
  const base = `${marketplaceBaseUrl()}/api/marketplace/${platform}/oauth/callback`
  const key = callbackKey?.trim()
  return key ? `${base}/${encodeURIComponent(key)}` : base
}
