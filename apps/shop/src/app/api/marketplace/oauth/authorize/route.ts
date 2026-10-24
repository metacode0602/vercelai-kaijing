import { NextRequest, NextResponse } from 'next/server'
import {
  createMarketplaceConnector,
  isMarketplacePlatform,
} from '@workspace/marketplace'
import { eq } from 'drizzle-orm'
import { shops } from '@workspace/db/schema'
import { db } from '@/lib/db'
import { getSession } from '@/lib/server/auth-utils'
import {
  assertMarketplaceAppConfigured,
  getMarketplaceAppEnv,
} from '@/lib/marketplace/env'
import {
  encodeOAuthState,
  oauthStateCookieOptions,
  OAUTH_STATE_COOKIE,
} from '@/lib/marketplace/oauth-state'

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

  if (!isMarketplacePlatform(platformRaw) || !shopId) {
    return NextResponse.json(
      { error: 'platform and shopId are required' },
      { status: 400 },
    )
  }

  const organizationId =
    (session as { session?: { activeOrganizationId?: string | null } }).session
      ?.activeOrganizationId ??
    (session as { user?: { activeOrganizationId?: string | null } }).user
      ?.activeOrganizationId

  if (!organizationId) {
    return NextResponse.json({ error: 'active organization required' }, { status: 400 })
  }

  const [shop] = await db
    .select()
    .from(shops)
    .where(eq(shops.id, shopId))
    .limit(1)

  if (!shop || shop.organizationId !== organizationId) {
    return NextResponse.json({ error: 'shop not found' }, { status: 404 })
  }

  if (shop.platform !== platformRaw) {
    return NextResponse.json({ error: 'platform mismatch' }, { status: 400 })
  }

  const env = getMarketplaceAppEnv(platformRaw)
  try {
    assertMarketplaceAppConfigured(env)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'app not configured' },
      { status: 500 },
    )
  }

  const region = regionOverride || shop.region || env.defaultRegion
  const state = encodeOAuthState({
    platform: platformRaw,
    shopId,
    organizationId,
    locale,
    region,
  })

  const connector = createMarketplaceConnector({
    platform: platformRaw,
    appKey: env.appKey,
    appSecret: env.appSecret,
    region,
    callbackUrl: env.callbackUrl,
  })

  const authorizeUrl = connector.buildAuthorizeUrl({
    state,
    redirectUri: env.callbackUrl,
    country: region,
  })

  // Mark shop as connecting before redirect.
  await db
    .update(shops)
    .set({ status: 'connecting', updatedAt: new Date() })
    .where(eq(shops.id, shopId))

  const response = NextResponse.redirect(authorizeUrl)
  const cookie = oauthStateCookieOptions()
  response.cookies.set(OAUTH_STATE_COOKIE, state, cookie)
  return response
}
