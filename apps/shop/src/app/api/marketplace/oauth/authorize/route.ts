import { NextRequest, NextResponse } from 'next/server'
import {
  createMarketplaceConnector,
  isMarketplacePlatform,
  resolveMarketplaceAppCredential,
} from '@workspace/marketplace'
import { and, eq, isNull } from 'drizzle-orm'
import { shops } from '@workspace/db/schema'
import { db } from '@/lib/db'
import { getSession } from '@/lib/server/auth-utils'
import { resolveMarketplaceCallbackUrl } from '@/lib/marketplace/env'
import {
  decodeOAuthState,
  encodeOAuthState,
  oauthStateCookieOptions,
  OAUTH_STATE_COOKIE,
  storeOAuthNonce,
  type OAuthStateMode,
} from '@/lib/marketplace/oauth-state'
import { resolveOrganizationContext } from '@/lib/server/context'
import {
  getOnboardingState,
  isShopBindingAllowed,
} from '@/lib/server/dataaccess/onboarding'
import { logMarketplaceOAuth } from '@/lib/marketplace/audit'
import { allowRateLimited } from '@/lib/server/rate-limit'

export const runtime = 'nodejs'

/**
 * Start marketplace OAuth.
 * Query: platform=daraz|lazada|tiktok_shop&shopId=…&locale=zh&region=lk
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const platformRaw = searchParams.get('platform') ?? ''
  const shopId = searchParams.get('shopId') ?? ''
  const locale = searchParams.get('locale') || 'zh'
  const regionOverride = searchParams.get('region') ?? undefined
  const modeParam = searchParams.get('mode')
  const mode: OAuthStateMode = modeParam === 'reauth' ? 'reauth' : 'bind'

  if (!isMarketplacePlatform(platformRaw) || !shopId) {
    return NextResponse.json(
      { error: 'platform and shopId are required' },
      { status: 400 },
    )
  }

  const activeOrganizationId =
    (session as { session?: { activeOrganizationId?: string | null } }).session
      ?.activeOrganizationId ??
    (session as { user?: { activeOrganizationId?: string | null } }).user
      ?.activeOrganizationId ??
    null
  const { organizationId, organizationRole } = await resolveOrganizationContext({
    userId: session.user.id,
    activeOrganizationId,
  })

  if (!organizationId) {
    return NextResponse.json({ error: 'active organization required' }, { status: 400 })
  }
  if (organizationRole !== 'tenant_owner' && organizationRole !== 'tenant_engineer') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const onboarding = await getOnboardingState(db, session.user.id, organizationId)
  if (!isShopBindingAllowed(onboarding)) {
    return NextResponse.json(
      { error: '请先完成入驻并通过审核后再绑定店铺' },
      { status: 403 },
    )
  }
  if (!(await allowRateLimited(`oauth.authorize:${organizationId}`, 20, 3600))) {
    return NextResponse.json({ error: 'too_many_requests' }, { status: 429 })
  }

  const [shop] = await db
    .select()
    .from(shops)
    .where(and(eq(shops.id, shopId), isNull(shops.deletedAt)))
    .limit(1)

  if (!shop || shop.organizationId !== organizationId) {
    return NextResponse.json({ error: 'shop not found' }, { status: 404 })
  }

  if (shop.platform !== platformRaw) {
    return NextResponse.json({ error: 'platform mismatch' }, { status: 400 })
  }

  const region = regionOverride || shop.region || ''
  const appCredential = await resolveMarketplaceAppCredential(db, {
    organizationId,
    platform: platformRaw,
    region,
  })
  if (!appCredential) {
    return NextResponse.json(
      { error: '平台应用未配置，请先在「设置 → 平台应用配置」完成配置' },
      { status: 412 },
    )
  }

  const callbackUrl = resolveMarketplaceCallbackUrl(
    platformRaw,
    appCredential.callbackKey,
  )
  const state = encodeOAuthState({
    mode,
    platform: platformRaw,
    shopId,
    organizationId,
    appCredentialId: appCredential.id,
    locale,
    region: appCredential.region || region,
  })
  const payload = decodeOAuthState(state)
  if (payload) await storeOAuthNonce(payload.nonce)

  const connector = createMarketplaceConnector({
    platform: platformRaw,
    appKey: appCredential.appKey,
    appSecret: appCredential.appSecret,
    region: appCredential.region || region,
    callbackUrl,
  })

  const authorizeUrl = connector.buildAuthorizeUrl({
    state,
    redirectUri: callbackUrl,
    country: appCredential.region || region,
  })

  // Mark shop as connecting before redirect.
  await db
    .update(shops)
    .set({ status: 'connecting', updatedAt: new Date() })
    .where(eq(shops.id, shopId))

  await logMarketplaceOAuth({
    shopId,
    action: 'oauth_authorize',
    status: 'success',
    message: `${platformRaw} oauth authorize started`,
    detail: { mode, region, userId: session.user.id },
  })

  const response = NextResponse.redirect(authorizeUrl)
  const cookie = oauthStateCookieOptions()
  response.cookies.set(OAUTH_STATE_COOKIE, state, cookie)
  return response
}
