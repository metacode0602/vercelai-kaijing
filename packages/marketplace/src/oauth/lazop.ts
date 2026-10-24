import { LazopHttpClient, type LazopFamily } from "../clients/lazop-http"
import { LAZOP_AUTH } from "../regions/endpoints"
import type { OAuthTokenSet } from "../domain/types"

export interface LazopOAuthAppConfig {
  family: LazopFamily
  appKey: string
  appSecret: string
  region?: string
  callbackUrl?: string
  fetchImpl?: typeof fetch
}

export function buildLazopAuthorizeUrl(input: {
  appKey: string
  redirectUri: string
  state: string
  /** ISO country for authorize page, e.g. lk / my. */
  country?: string
}): string {
  const url = new URL(LAZOP_AUTH.authorizeUrl)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("force_auth", "true")
  url.searchParams.set("redirect_uri", input.redirectUri)
  url.searchParams.set("client_id", input.appKey)
  url.searchParams.set("state", input.state)
  if (input.country) {
    url.searchParams.set("country", input.country.toLowerCase())
  }
  return url.toString()
}

function mapTokenPayload(data: Record<string, unknown>): OAuthTokenSet {
  const accessToken = String(data.access_token ?? "")
  const refreshToken = data.refresh_token ? String(data.refresh_token) : undefined
  const expiresIn = Number(data.expires_in ?? 0)
  const refreshExpiresIn = Number(data.refresh_expires_in ?? 0)
  const now = Date.now()
  return {
    accessToken,
    refreshToken,
    expiresAt: expiresIn ? new Date(now + expiresIn * 1000) : null,
    refreshExpiresAt: refreshExpiresIn ? new Date(now + refreshExpiresIn * 1000) : null,
    meta: {
      account: data.account,
      country: data.country,
      account_platform: data.account_platform,
      refresh_expires_in: data.refresh_expires_in,
      expires_in: data.expires_in,
    },
    raw: data,
  }
}

export async function exchangeLazopCode(
  cfg: LazopOAuthAppConfig,
  code: string,
): Promise<OAuthTokenSet> {
  const client = new LazopHttpClient({
    family: cfg.family,
    region: cfg.region,
    appKey: cfg.appKey,
    appSecret: cfg.appSecret,
    fetchImpl: cfg.fetchImpl,
  })
  const json = await client.call<{
    code?: string
    data?: Record<string, unknown>
    access_token?: string
  }>({
    method: "GET",
    path: LAZOP_AUTH.tokenPathCreate,
    params: { code },
  })
  const data = (json.data ?? json) as Record<string, unknown>
  if (!data.access_token && !json.access_token) {
    throw new Error("LAZOP token exchange returned no access_token")
  }
  return mapTokenPayload({ ...data, access_token: data.access_token ?? json.access_token })
}

export async function refreshLazopToken(
  cfg: LazopOAuthAppConfig,
  refreshToken: string,
): Promise<OAuthTokenSet> {
  const client = new LazopHttpClient({
    family: cfg.family,
    region: cfg.region,
    appKey: cfg.appKey,
    appSecret: cfg.appSecret,
    fetchImpl: cfg.fetchImpl,
  })
  const json = await client.call<{
    data?: Record<string, unknown>
    access_token?: string
  }>({
    method: "GET",
    path: LAZOP_AUTH.tokenPathRefresh,
    params: { refresh_token: refreshToken },
  })
  const data = (json.data ?? json) as Record<string, unknown>
  return mapTokenPayload({ ...data, access_token: data.access_token ?? json.access_token })
}
