import { resolveTiktokEndpoints } from "../regions/endpoints"
import { signTiktokRequest } from "../signing/tiktok"
import type { OAuthTokenSet } from "../domain/types"

export interface TiktokOAuthAppConfig {
  appKey: string
  appSecret: string
  region?: string
  callbackUrl?: string
  fetchImpl?: typeof fetch
}

export function buildTiktokAuthorizeUrl(input: {
  appKey: string
  redirectUri: string
  state: string
  region?: string
}): string {
  const { authBase } = resolveTiktokEndpoints(input.region)
  const url = new URL(`${authBase}/oauth/authorize`)
  url.searchParams.set("app_key", input.appKey)
  url.searchParams.set("state", input.state)
  url.searchParams.set("redirect_uri", input.redirectUri)
  return url.toString()
}

function mapTokenPayload(data: Record<string, unknown>): OAuthTokenSet {
  const accessToken = String(data.access_token ?? "")
  const refreshToken = data.refresh_token ? String(data.refresh_token) : undefined
  const expiresIn = Number(data.access_token_expire_in ?? data.expires_in ?? 0)
  const refreshExpiresIn = Number(data.refresh_token_expire_in ?? 0)
  const now = Date.now()
  return {
    accessToken,
    refreshToken,
    expiresAt: expiresIn ? new Date(now + expiresIn * 1000) : null,
    refreshExpiresAt: refreshExpiresIn ? new Date(now + refreshExpiresIn * 1000) : null,
    meta: {
      open_id: data.open_id,
      seller_name: data.seller_name,
      seller_base_region: data.seller_base_region,
      user_type: data.user_type,
      granted_scopes: data.granted_scopes,
    },
    raw: data,
  }
}

async function postToken(
  cfg: TiktokOAuthAppConfig,
  path: string,
  body: Record<string, string>,
): Promise<OAuthTokenSet> {
  const { authBase } = resolveTiktokEndpoints(cfg.region)
  const fetchImpl = cfg.fetchImpl ?? fetch
  const timestamp = String(Math.floor(Date.now() / 1000))
  const query: Record<string, string> = {
    app_key: cfg.appKey,
    timestamp,
  }
  const bodyStr = JSON.stringify(body)
  // Auth token endpoints also require sign on some TikTok deployments;
  // include both query sign and JSON body for compatibility.
  query.sign = signTiktokRequest(path, query, cfg.appSecret, bodyStr)

  const url = `${authBase}${path}?${new URLSearchParams(query).toString()}`
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: bodyStr,
  })
  const json = (await res.json()) as {
    code?: number
    message?: string
    data?: Record<string, unknown>
  }
  if (!res.ok || (json.code !== undefined && json.code !== 0)) {
    throw new Error(json.message ?? `TikTok token error ${json.code ?? res.status}`)
  }
  const data = json.data ?? (json as unknown as Record<string, unknown>)
  if (!data.access_token) {
    throw new Error("TikTok token exchange returned no access_token")
  }
  return mapTokenPayload(data)
}

export function exchangeTiktokCode(
  cfg: TiktokOAuthAppConfig,
  code: string,
): Promise<OAuthTokenSet> {
  return postToken(cfg, "/api/v2/token/get", {
    app_key: cfg.appKey,
    app_secret: cfg.appSecret,
    auth_code: code,
    grant_type: "authorized_code",
  })
}

export function refreshTiktokToken(
  cfg: TiktokOAuthAppConfig,
  refreshToken: string,
): Promise<OAuthTokenSet> {
  return postToken(cfg, "/api/v2/token/refresh", {
    app_key: cfg.appKey,
    app_secret: cfg.appSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  })
}
