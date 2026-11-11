import { NextRequest, NextResponse } from 'next/server'
import {
  createMarketplaceConnector,
  isMarketplacePlatform,
  resolveMarketplaceAppCredential,
  type CredentialPayload,
} from '@workspace/marketplace'
import { resolveMarketplaceCallbackUrl } from '@/lib/marketplace/env'
import {
  consumeOAuthNonce,
  decodeOAuthState,
  OAUTH_STATE_COOKIE,
  oauthStateCookieOptions,
} from '@/lib/marketplace/oauth-state'
import { persistOAuthCredentials } from '@/lib/marketplace/persist-credentials'
import { persistOAuthCallbackFailure } from '@/lib/marketplace/persist-oauth-failure'
import { classifyOAuthFailureCode } from '@/lib/marketplace/oauth-failure'
import {
  ShopBindingConflictError,
  ShopIdentityUnavailableError,
} from '@/lib/marketplace/errors'
import {
  recordMarketplaceAppCredentialError,
  touchMarketplaceAppCredentialVerification,
} from '@/lib/server/dataaccess/marketplace-app-credentials'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { resolveOrganizationContext } from '@/lib/server/context'
import {
  getOnboardingState,
  isShopBindingAllowed,
} from '@/lib/server/dataaccess/onboarding'
import { and, eq, isNull } from 'drizzle-orm'
import { shops } from '@workspace/db/schema'

export const runtime = 'nodejs'

function oauthErrorMessage(raw: string): string {
  const value = raw.toLowerCase()
  if (value.includes('access_denied') || value.includes('cancel')) {
    return '已取消授权'
  }
  return '平台授权失败，请重试'
}

function consoleRedirect(
  request: NextRequest,
  locale: string,
  shopId: string,
  query?: Record<string, string>,
) {
  const base =
    process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_URL || request.nextUrl.origin
  const prefix = locale && locale !== 'zh' ? `/${locale}` : ''
  const url = new URL(`${base.replace(/\/+$/, '')}${prefix}/settings/shops/${shopId}`)
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  }
  return url
}

/**
 * Platform OAuth callback. Locale-aware redirect back to console shop detail.
 * Query: code, state (and optional error from platform).
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ platform: string; callbackKey?: string }> },
) {
  const { platform: pathPlatform, callbackKey } = await context.params
  if (!isMarketplacePlatform(pathPlatform)) {
    return NextResponse.json({ error: 'unsupported platform' }, { status: 404 })
  }
  const { searchParams } = request.nextUrl
  const error = searchParams.get('error') || searchParams.get('error_description')
  const code = searchParams.get('code') || searchParams.get('auth_code')
  const stateParam = searchParams.get('state') ?? ''
  const cookieState = request.cookies.get(OAUTH_STATE_COOKIE)?.value

  const decodedState = decodeOAuthState(stateParam)
  const decodedCookie = cookieState ? decodeOAuthState(cookieState) : null
  const state =
    decodedState && decodedCookie && stateParam === cookieState ? decodedState : null
  const stateHint =
    state ??
    decodedState ??
    decodeOAuthState(stateParam, { ignoreExp: true }) ??
    (cookieState ? decodeOAuthState(cookieState, { ignoreExp: true }) : null)

  if (error) {
    const fallbackShop = stateHint?.shopId ?? 'unknown'
    const locale = stateHint?.locale ?? 'zh'
    const classified = stateHint
      ? await persistOAuthCallbackFailure({
          shopId: stateHint.shopId,
          organizationId: stateHint.organizationId,
          platform: stateHint.platform,
          reason: 'authorization_rejected',
          queryError: error,
          detail: { mode: stateHint.mode },
        })
      : classifyOAuthFailureCode({
          reason: 'authorization_rejected',
          queryError: error,
        })
    const res = NextResponse.redirect(
      consoleRedirect(request, locale, fallbackShop, {
        oauth: 'error',
        reason: classified.code,
        message: classified.message || oauthErrorMessage(error),
      }),
    )
    res.cookies.set(OAUTH_STATE_COOKIE, '', { ...oauthStateCookieOptions(0), maxAge: 0 })
    return res
  }

  if (!state || !code) {
    if (stateHint) {
      await persistOAuthCallbackFailure({
        shopId: stateHint.shopId,
        organizationId: stateHint.organizationId,
        platform: stateHint.platform,
        reason: !code ? 'invalid_callback' : 'state_expired',
        message: !code ? 'invalid oauth callback' : 'oauth state expired',
        detail: { mode: stateHint.mode, hasCode: Boolean(code) },
      })
    }
    return NextResponse.json({ error: 'invalid oauth callback' }, { status: 400 })
  }
  if (state.platform !== pathPlatform) {
    return NextResponse.json({ error: 'platform mismatch' }, { status: 400 })
  }
  const platform = pathPlatform

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
    await persistOAuthCallbackFailure({
      shopId: state.shopId,
      organizationId: state.organizationId,
      platform: state.platform,
      reason: 'state_expired',
      message: 'oauth state expired',
      detail: { mode: state.mode },
    })
    return NextResponse.json({ error: 'oauth state expired' }, { status: 400 })
  }

  const onboarding = await getOnboardingState(db, session.user.id, state.organizationId)
  if (!isShopBindingAllowed(onboarding)) {
    await persistOAuthCallbackFailure({
      shopId: state.shopId,
      organizationId: state.organizationId,
      platform: state.platform,
      reason: 'onboarding_not_approved',
      message: 'onboarding not approved',
      detail: { mode: state.mode },
    })
    return NextResponse.json({ error: 'onboarding not approved' }, { status: 403 })
  }

  const [boundShop] = await db
    .select({ id: shops.id, platform: shops.platform, meta: shops.meta })
    .from(shops)
    .where(
      and(
        eq(shops.id, state.shopId),
        eq(shops.organizationId, state.organizationId),
        isNull(shops.deletedAt),
      ),
    )
    .limit(1)
  if (!boundShop) {
    return NextResponse.json({ error: 'shop_not_found' }, { status: 404 })
  }
  if (boundShop.platform !== platform) {
    await persistOAuthCallbackFailure({
      shopId: state.shopId,
      organizationId: state.organizationId,
      platform,
      reason: 'shop_platform_mismatch',
      message: 'shop_platform_mismatch',
      detail: { mode: state.mode },
    })
    return NextResponse.json({ error: 'shop_platform_mismatch' }, { status: 400 })
  }

  const appCredential = await resolveMarketplaceAppCredential(db, {
    organizationId: state.organizationId,
    platform,
    region: state.region ?? '',
    credentialId: state.appCredentialId,
  })
  if (!appCredential) {
    await persistOAuthCallbackFailure({
      shopId: state.shopId,
      organizationId: state.organizationId,
      platform,
      reason: 'app_credential_invalid',
      message: 'app_credential_not_found',
      detail: { mode: state.mode },
    })
    return NextResponse.json({ error: 'app_credential_not_found' }, { status: 412 })
  }
  if (callbackKey && appCredential.callbackKey !== callbackKey) {
    await persistOAuthCallbackFailure({
      shopId: state.shopId,
      organizationId: state.organizationId,
      platform,
      reason: 'callback_key_mismatch',
      message: 'callback_key_mismatch',
      detail: { mode: state.mode },
    })
    return NextResponse.json({ error: 'callback_key_mismatch' }, { status: 400 })
  }

  const callbackUrl = resolveMarketplaceCallbackUrl(
    platform,
    appCredential.callbackKey,
  )
  const region = state.region || appCredential.region

  try {
    const connector = createMarketplaceConnector({
      platform,
      appKey: appCredential.appKey,
      appSecret: appCredential.appSecret,
      region,
      callbackUrl,
    })

    const tokens = await connector.exchangeCode({
      code,
      redirectUri: callbackUrl,
    })

    let shopCipher =
      typeof tokens.meta?.cipher === 'string'
        ? tokens.meta.cipher
        : typeof tokens.meta?.shopCipher === 'string'
          ? tokens.meta.shopCipher
          : undefined

    const authed = createMarketplaceConnector({
      platform,
      appKey: appCredential.appKey,
      appSecret: appCredential.appSecret,
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
      shopMeta = { ...(shop.raw ?? {}), connector: platform }
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
      platform,
      appCredentialId: appCredential.id,
      tokens: credential,
      externalShopId,
      region,
      shopMeta,
      actorUserId: session.user.id,
    })

    await touchMarketplaceAppCredentialVerification(db, {
      id: appCredential.id,
      organizationId: state.organizationId,
      actorUserId: session.user.id,
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
    const conflict = err instanceof ShopBindingConflictError
    const identityUnavailable = err instanceof ShopIdentityUnavailableError
    const internalMessage = err instanceof Error ? err.message : 'oauth_failed'
    const classified = classifyOAuthFailureCode({
      reason: conflict
        ? 'shop_bound_other_org'
        : identityUnavailable
          ? 'shop_identity_unavailable'
          : 'token_exchange_failed',
      message: internalMessage,
    })
    const reason = classified.code
    await recordMarketplaceAppCredentialError(db, {
      id: appCredential.id,
      organizationId: state.organizationId,
      message: reason,
    })
    if (!conflict && !identityUnavailable) {
      await persistOAuthCallbackFailure({
        shopId: state.shopId,
        organizationId: state.organizationId,
        platform,
        reason,
        message: internalMessage,
        detail: { mode: state.mode, appCredentialId: appCredential.id },
      })
    }
    const res = NextResponse.redirect(
      consoleRedirect(request, state.locale, state.shopId, {
        oauth: conflict ? 'conflict' : 'error',
        reason,
        message: conflict || identityUnavailable ? internalMessage : classified.message,
      }),
    )
    res.cookies.set(OAUTH_STATE_COOKIE, '', { ...oauthStateCookieOptions(0), maxAge: 0 })
    return res
  }
}
