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
import { ShopBindingConflictError } from '@/lib/marketplace/errors'
import { logMarketplaceOAuth } from '@/lib/marketplace/audit'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { resolveOrganizationContext } from '@/lib/server/context'
import {
  getOnboardingState,
  isShopBindingAllowed,
} from '@/lib/server/dataaccess/onboarding'
import { and, eq, isNull } from 'drizzle-orm'
import { integrationStates, shops } from '@workspace/db/schema'

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
    const message = oauthErrorMessage(error)
    if (state) {
      await db
        .update(shops)
        .set({ status: 'error', updatedAt: new Date() })
        .where(
          and(
            eq(shops.id, state.shopId),
            eq(shops.organizationId, state.organizationId),
            isNull(shops.deletedAt),
          ),
        )
      await logMarketplaceOAuth({
        shopId: state.shopId,
        action: 'oauth_callback',
        status: 'error',
        message: `authorization cancelled or rejected: ${state.platform}`,
        detail: { reason: 'authorization_rejected', mode: state.mode },
      })
    }
    const res = NextResponse.redirect(
      consoleRedirect(request, locale, fallbackShop, {
        oauth: 'error',
        reason: 'authorization_rejected',
        message,
      }),
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
  if (boundShop.platform !== state.platform) {
    return NextResponse.json({ error: 'shop_platform_mismatch' }, { status: 400 })
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
    const conflict = err instanceof ShopBindingConflictError
    const internalMessage = err instanceof Error ? err.message : 'oauth_failed'
    const reason = conflict ? 'shop_bound_other_org' : 'token_exchange_failed'
    if (!conflict) {
      await db
        .update(shops)
        .set({
          status: 'error',
          meta: {
            ...(typeof boundShop.meta === 'object' && boundShop.meta
              ? boundShop.meta
              : {}),
            lastError: internalMessage.slice(0, 500),
          },
          updatedAt: new Date(),
        })
        .where(eq(shops.id, state.shopId))
      await db
        .insert(integrationStates)
        .values({
          shopId: state.shopId,
          health: 'error',
          lastError: internalMessage.slice(0, 1000),
        })
        .onConflictDoUpdate({
          target: integrationStates.shopId,
          set: { health: 'error', lastError: internalMessage.slice(0, 1000) },
        })
      await logMarketplaceOAuth({
        shopId: state.shopId,
        action: 'oauth_callback',
        status: 'error',
        message: internalMessage,
        detail: { reason, mode: state.mode },
      })
    }
    const res = NextResponse.redirect(
      consoleRedirect(request, state.locale, state.shopId, {
        oauth: conflict ? 'conflict' : 'error',
        reason,
        message: conflict ? internalMessage : '平台授权失败，请重试',
      }),
    )
    res.cookies.set(OAUTH_STATE_COOKIE, '', { ...oauthStateCookieOptions(0), maxAge: 0 })
    return res
  }
}
