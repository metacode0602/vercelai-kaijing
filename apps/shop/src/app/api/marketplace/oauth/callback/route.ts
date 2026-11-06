import { NextRequest, NextResponse } from 'next/server'
import {
  createMarketplaceConnector,
  isMarketplacePlatform,
  type CredentialPayload,
} from '@workspace/marketplace'
import {
  assertMarketplaceAppConfigured,
  getMarketplaceAppEnv,
} from '@/lib/marketplace/env'
import {
  consumeOAuthNonce,
  decodeOAuthState,
  OAUTH_STATE_COOKIE,
  oauthStateCookieOptions,
} from '@/lib/marketplace/oauth-state'
import { persistOAuthCredentials } from '@/lib/marketplace/persist-credentials'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { resolveOrganizationContext } from '@/lib/server/context'
import {
  getOnboardingState,
  isShopBindingAllowed,
} from '@/lib/server/dataaccess/onboarding'

export const runtime = 'nodejs'

function consoleRedirect(
  request: NextRequest,
  locale: string,
  shopId: string,
  query?: Record<string, string>,
) {
  const base =
    process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_URL || request.nextUrl.origin
  const prefix = locale && locale !== 'zh' ? `/${locale}` : ''
  const url = new URL(`${base.replace(/\/+$/, '')}${prefix}/console/settings/shops/${shopId}`)
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  }
  return url
}

/**
 * Platform OAuth callback. Locale-aware redirect back to console shop detail.
 * Query: code, state (and optional error from platform).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const error = searchParams.get('error') || searchParams.get('error_description')
  const code = searchParams.get('code') || searchParams.get('auth_code')
  const stateParam = searchParams.get('state') ?? ''
  const cookieState = request.cookies.get(OAUTH_STATE_COOKIE)?.value

  const decodedState = decodeOAuthState(stateParam)
  const decodedCookie = cookieState ? decodeOAuthState(cookieState) : null
  const state =
    decodedState && decodedCookie && stateParam === cookieState ? decodedState : null

  if (error) {
    const fallbackShop = state?.shopId ?? 'unknown'
    const locale = state?.locale ?? 'zh'
    const res = NextResponse.redirect(
      consoleRedirect(request, locale, fallbackShop, { oauth: 'error', message: error }),
    )
    res.cookies.set(OAUTH_STATE_COOKIE, '', { ...oauthStateCookieOptions(0), maxAge: 0 })
    return res
  }

  if (!state || !code) {
    return NextResponse.json({ error: 'invalid oauth callback' }, { status: 400 })
  }

  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const activeOrganizationId =
    (session as { session?: { activeOrganizationId?: string | null } }).session
      ?.activeOrganizationId ?? null
  const { organizationId, organizationRole } = await resolveOrganizationContext({
    userId: session.user.id,
    activeOrganizationId,
  })
  if (
    organizationId !== state.organizationId ||
    (organizationRole !== 'tenant_owner' && organizationRole !== 'tenant_engineer')
  ) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  if (!(await consumeOAuthNonce(state.nonce))) {
    return NextResponse.json({ error: 'oauth state expired' }, { status: 400 })
  }

  const onboarding = await getOnboardingState(db, session.user.id, state.organizationId)
  if (!isShopBindingAllowed(onboarding)) {
    return NextResponse.json({ error: 'onboarding not approved' }, { status: 403 })
  }

  if (!isMarketplacePlatform(state.platform)) {
    return NextResponse.json({ error: 'unsupported platform' }, { status: 400 })
  }

  const env = getMarketplaceAppEnv(state.platform)
  try {
    assertMarketplaceAppConfigured(env)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'app not configured' },
      { status: 500 },
    )
  }

  const region = state.region || env.defaultRegion

  try {
    const connector = createMarketplaceConnector({
      platform: state.platform,
      appKey: env.appKey,
      appSecret: env.appSecret,
      region,
      callbackUrl: env.callbackUrl,
    })

    const tokens = await connector.exchangeCode({
      code,
      redirectUri: env.callbackUrl,
    })

    let shopCipher =
      typeof tokens.meta?.cipher === 'string'
        ? tokens.meta.cipher
        : typeof tokens.meta?.shopCipher === 'string'
          ? tokens.meta.shopCipher
          : undefined

    const authed = createMarketplaceConnector({
      platform: state.platform,
      appKey: env.appKey,
      appSecret: env.appSecret,
      region,
      accessToken: tokens.accessToken,
      shopCipher,
    })

    let externalShopId: string | undefined
    let shopMeta: Record<string, unknown> | undefined
    try {
      const shop = await authed.getShop()
      externalShopId = shop.externalShopId || undefined
      if (typeof shop.raw?.cipher === 'string') shopCipher = shop.raw.cipher
      shopMeta = { ...(shop.raw ?? {}), connector: state.platform }
    } catch {
      shopMeta = { ...(tokens.meta ?? {}) }
    }

    const credential: CredentialPayload = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt?.toISOString() ?? null,
      refreshExpiresAt: tokens.refreshExpiresAt?.toISOString() ?? null,
      meta: {
        ...(tokens.meta ?? {}),
        ...(shopCipher ? { shopCipher } : {}),
      },
    }

    const persisted = await persistOAuthCredentials({
      organizationId: state.organizationId,
      shopId: state.shopId,
      platform: state.platform,
      tokens: credential,
      externalShopId,
      region,
      shopMeta,
    })

    const res = NextResponse.redirect(
      consoleRedirect(request, state.locale, persisted.shopId, {
        oauth: 'success',
        ...(persisted.duplicate ? { duplicate: '1' } : {}),
        mode: state.mode,
      }),
    )
    res.cookies.set(OAUTH_STATE_COOKIE, '', { ...oauthStateCookieOptions(0), maxAge: 0 })
    return res
  } catch (err) {
    const message = err instanceof Error ? err.message : 'oauth_failed'
    const res = NextResponse.redirect(
      consoleRedirect(request, state.locale, state.shopId, { oauth: 'error', message }),
    )
    res.cookies.set(OAUTH_STATE_COOKIE, '', { ...oauthStateCookieOptions(0), maxAge: 0 })
    return res
  }
}
