/**
 * shops + integration_credentials / integration_states（模块15）。
 * 店铺连接页读真实店铺；授权按钮不伪造 OAuth 成功，仅标记待平台授权。
 */
import { and, count, desc, eq, gte, ilike, inArray, isNull, lt, notInArray, or, sql, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import {
  integrationCredentials,
  integrationLogs,
  integrationStates,
  marketplaceAppCredentials,
  shops,
} from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import {
  formatStamp,
  toDbFulfillmentMode,
  toUiFulfillmentMode,
  toUiShopAuthStatus,
  type UiShopAuthStatus,
} from '@/lib/server/mappers/ops-master'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

const PLATFORM_LABEL: Record<string, string> = {
  daraz: 'Daraz',
  lazada: 'Lazada',
  tiktok_shop: 'TikTok Shop',
  shopee: 'Shopee',
}

export type ShopConnectionDto = {
  id: string
  name: string
  platform: string
  platformLabel: string
  region: string
  currency: string
  externalShopId: string
  sellerId: string
  shopGroup: string
  fulfillmentMode: string
  authStatus: UiShopAuthStatus
  dbStatus: string
  healthLabel: string
  syncPaused: boolean
  lastSyncAt: string
  lastOrdersSyncAt: string
  lastInventorySyncAt: string
  lastError: string
  credentialMask: string
  authExpiresAt: string
  appCredentialId: string
  appCredentialLabel: string
  owner: string
  hasCredential: boolean
}

function healthLabel(health: string | null | undefined, lastError: string | null | undefined) {
  if (lastError) return '异常'
  if ((health ?? '') === 'error') return '异常'
  if ((health ?? '') === 'success' || (health ?? '') === 'ok') return '正常'
  if ((health ?? '') === 'running') return '同步中'
  return '空闲'
}

function maskCredential(has: boolean, expiresAt: Date | null | undefined) {
  if (!has) return '未配置'
  const exp = expiresAt ? formatStamp(expiresAt) : '—'
  return `已配置 · 脱敏 · 到期 ${exp}`
}

function metaFlag(meta: unknown, key: string): boolean {
  if (!meta || typeof meta !== 'object') return false
  return Boolean((meta as Record<string, unknown>)[key])
}

function appCredentialLabel(
  app: typeof marketplaceAppCredentials.$inferSelect | undefined,
) {
  if (!app) return '未关联'
  const platform = PLATFORM_LABEL[app.platform] || app.platform
  return `${platform} · ${app.region || '全部站点（通用）'}`
}

function mapShop(
  shop: typeof shops.$inferSelect,
  state: typeof integrationStates.$inferSelect | undefined,
  cred: typeof integrationCredentials.$inferSelect | undefined,
  app: typeof marketplaceAppCredentials.$inferSelect | undefined,
): ShopConnectionDto {
  const syncPaused =
    metaFlag(shop.meta, 'syncPaused') ||
    state?.health === 'paused' ||
    shop.status === 'disabled'
  return {
    id: shop.id,
    name: shop.name,
    platform: shop.platform,
    platformLabel: PLATFORM_LABEL[shop.platform] || shop.platform,
    region: shop.marketplaceCountry || shop.region || '',
    currency: shop.currency,
    externalShopId: shop.externalShopId || '',
    sellerId: shop.sellerId || '',
    shopGroup: shop.shopGroup || '',
    fulfillmentMode: toUiFulfillmentMode(shop.fulfillmentMode),
    authStatus: toUiShopAuthStatus(shop.status, shop.authExpiresAt),
    dbStatus: shop.status,
    healthLabel: healthLabel(state?.health, state?.lastError || shop.meta && (shop.meta as { lastError?: string }).lastError),
    syncPaused,
    lastSyncAt: formatStamp(shop.lastSyncAt),
    lastOrdersSyncAt: formatStamp(state?.lastOrdersSyncAt),
    lastInventorySyncAt: formatStamp(state?.lastInventorySyncAt),
    lastError: state?.lastError || (typeof shop.meta === 'object' && shop.meta && 'lastError' in shop.meta ? String((shop.meta as { lastError?: string }).lastError || '') : '') || '',
    credentialMask: maskCredential(Boolean(cred), cred?.expiresAt ?? shop.authExpiresAt),
    authExpiresAt: formatStamp(shop.authExpiresAt),
    appCredentialId: cred?.appCredentialId ?? '',
    appCredentialLabel: appCredentialLabel(app),
    owner: shop.sellerName || '',
    hasCredential: Boolean(cred),
  }
}

function authStatusFilter(status: string): SQL | undefined {
  const now = new Date()
  switch (status) {
    case '已授权':
      return and(
        eq(shops.status, 'active'),
        or(isNull(shops.authExpiresAt), gte(shops.authExpiresAt, now)),
      )
    case '授权失效':
      return or(
        inArray(shops.status, ['error', 'disabled']),
        and(eq(shops.status, 'active'), lt(shops.authExpiresAt, now)),
      )
    case '连接中':
      return eq(shops.status, 'connecting')
    case '草稿':
      return eq(shops.status, 'draft')
    case '待授权':
      return notInArray(shops.status, ['active', 'connecting', 'draft', 'error', 'disabled'])
    default:
      return undefined
  }
}

export async function listShopConnections(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; authStatus?: string } = {},
): Promise<
  PaginatedResult<ShopConnectionDto> & {
    summary: {
      total: number
      authorized: number
      pending: number
      expired: number
      paused: number
    }
  }
> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize ?? 50)
  const filters: SQL[] = [eq(shops.organizationId, organizationId), isNull(shops.deletedAt)]
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(
      or(
        ilike(shops.name, q),
        ilike(shops.externalShopId, q),
        ilike(shops.sellerId, q),
        ilike(shops.platform, q),
        ilike(shops.shopGroup, q),
      )!,
    )
  }
  if (input.authStatus && input.authStatus !== 'all') {
    const authFilter = authStatusFilter(input.authStatus)
    if (authFilter) filters.push(authFilter)
  }
  const where = and(...filters)!
  const [{ total }] = await db
    .select({ total: count() })
    .from(shops)
    .where(where)
  const all = await db
    .select()
    .from(shops)
    .where(where)
    .orderBy(desc(shops.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  const ids = all.map((s) => s.id)
  const states =
    ids.length === 0
      ? []
      : await db.select().from(integrationStates).where(inArray(integrationStates.shopId, ids))
  const creds =
    ids.length === 0
      ? []
      : await db
          .select()
          .from(integrationCredentials)
          .where(
            and(
              eq(integrationCredentials.organizationId, organizationId),
              inArray(integrationCredentials.shopId, ids),
            ),
          )
  const appCredentialIds = [
    ...new Set(creds.map((c) => c.appCredentialId).filter((id): id is string => Boolean(id))),
  ]
  const apps =
    appCredentialIds.length === 0
      ? []
      : await db
          .select()
          .from(marketplaceAppCredentials)
          .where(
            and(
              eq(marketplaceAppCredentials.organizationId, organizationId),
              inArray(marketplaceAppCredentials.id, appCredentialIds),
            ),
          )
  const stateMap = new Map(states.map((s) => [s.shopId, s]))
  const credMap = new Map<string, typeof integrationCredentials.$inferSelect>()
  for (const c of creds) if (!credMap.has(c.shopId)) credMap.set(c.shopId, c)
  const appMap = new Map(apps.map((app) => [app.id, app]))

  const items = all.map((s) => {
    const cred = credMap.get(s.id)
    return mapShop(s, stateMap.get(s.id), cred, cred?.appCredentialId ? appMap.get(cred.appCredentialId) : undefined)
  })

  const [summaryRow] = await db
    .select({
      total: count(),
      authorized: sql<number>`count(*) filter (where ${shops.status} = 'active' and (${shops.authExpiresAt} is null or ${shops.authExpiresAt} > now()))`,
      pending: sql<number>`count(*) filter (where ${shops.status} in ('draft', 'connecting', 'pending'))`,
      expired: sql<number>`count(*) filter (where ${shops.status} in ('error', 'disabled') or (${shops.status} = 'active' and ${shops.authExpiresAt} <= now()))`,
      paused: sql<number>`count(*) filter (where coalesce((${shops.meta} ->> 'syncPaused')::boolean, false) or ${integrationStates.health} = 'paused')`,
    })
    .from(shops)
    .leftJoin(integrationStates, eq(integrationStates.shopId, shops.id))
    .where(and(eq(shops.organizationId, organizationId), isNull(shops.deletedAt)))

  return {
    items,
    total,
    page,
    pageSize,
    summary: {
      total: Number(summaryRow?.total ?? 0),
      authorized: Number(summaryRow?.authorized ?? 0),
      pending: Number(summaryRow?.pending ?? 0),
      expired: Number(summaryRow?.expired ?? 0),
      paused: Number(summaryRow?.paused ?? 0),
    },
  }
}

export async function getShopConnection(db: AppDatabase, organizationId: string, id: string) {
  const [shop] = await db
    .select()
    .from(shops)
    .where(
      and(
        eq(shops.organizationId, organizationId),
        eq(shops.id, id),
        isNull(shops.deletedAt),
      ),
    )
    .limit(1)
  if (!shop) return null
  const [state] = await db
    .select()
    .from(integrationStates)
    .where(eq(integrationStates.shopId, shop.id))
    .limit(1)
  const [cred] = await db
    .select()
    .from(integrationCredentials)
    .where(
      and(
        eq(integrationCredentials.organizationId, organizationId),
        eq(integrationCredentials.shopId, shop.id),
      ),
    )
    .limit(1)
  const app = cred?.appCredentialId
    ? (
        await db
          .select()
          .from(marketplaceAppCredentials)
          .where(
            and(
              eq(marketplaceAppCredentials.id, cred.appCredentialId),
              eq(marketplaceAppCredentials.organizationId, organizationId),
            ),
          )
          .limit(1)
      )[0]
    : undefined
  return mapShop(shop, state, cred, app)
}

export async function createShopDraft(
  db: DbLike,
  organizationId: string,
  input: {
    name: string
    platform: string
    region?: string
    currency?: string
    externalShopId?: string
    sellerId?: string
    shopGroup?: string
    fulfillmentMode?: string
    owner?: string
  },
) {
  const id = createId()
  const now = new Date()
  await db.insert(shops).values({
    id,
    organizationId,
    platform: (input.platform || 'lazada').toLowerCase(),
    name: input.name.trim() || '未命名店铺',
    externalShopId: input.externalShopId?.trim() || null,
    sellerId: input.sellerId?.trim() || null,
    shopGroup: input.shopGroup?.trim() || null,
    fulfillmentMode: toDbFulfillmentMode(input.fulfillmentMode),
    status: 'draft',
    region: input.region?.trim() || null,
    marketplaceCountry: input.region?.trim() || null,
    currency: (input.currency || 'USD').toUpperCase(),
    sellerName: input.owner?.trim() || null,
    meta: { syncPaused: true, createdFrom: 'console' },
    createdAt: now,
    updatedAt: now,
  })
  return getShopConnection(db as AppDatabase, organizationId, id)
}

export async function updateShopDraft(
  db: DbLike,
  organizationId: string,
  input: {
    id: string
    name?: string
    region?: string
    currency?: string
    externalShopId?: string
    sellerId?: string
    shopGroup?: string
    fulfillmentMode?: string
    owner?: string
  },
) {
  const [shop] = await db
    .select()
    .from(shops)
    .where(
      and(
        eq(shops.organizationId, organizationId),
        eq(shops.id, input.id),
        isNull(shops.deletedAt),
      ),
    )
    .limit(1)
  if (!shop) throw new Error('店铺不存在')
  if (shop.status !== 'draft') throw new Error('仅草稿店铺可编辑')

  await db
    .update(shops)
    .set({
      name: input.name?.trim() || shop.name,
      region: input.region?.trim() || shop.region,
      marketplaceCountry: input.region?.trim() || shop.marketplaceCountry,
      currency: input.currency ? input.currency.toUpperCase() : shop.currency,
      externalShopId:
        input.externalShopId === undefined
          ? shop.externalShopId
          : input.externalShopId.trim() || null,
      sellerId:
        input.sellerId === undefined ? shop.sellerId : input.sellerId.trim() || null,
      shopGroup:
        input.shopGroup === undefined ? shop.shopGroup : input.shopGroup.trim() || null,
      fulfillmentMode:
        input.fulfillmentMode === undefined
          ? shop.fulfillmentMode
          : toDbFulfillmentMode(input.fulfillmentMode),
      sellerName:
        input.owner === undefined ? shop.sellerName : input.owner.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(shops.id, shop.id))

  return getShopConnection(db as AppDatabase, organizationId, shop.id)
}

export async function removeShopCredential(
  db: DbLike,
  organizationId: string,
  input: { id: string },
) {
  const [shop] = await db
    .select()
    .from(shops)
    .where(
      and(
        eq(shops.organizationId, organizationId),
        eq(shops.id, input.id),
        isNull(shops.deletedAt),
      ),
    )
    .limit(1)
  if (!shop) throw new Error('店铺不存在')

  await db
    .delete(integrationCredentials)
    .where(
      and(
        eq(integrationCredentials.organizationId, organizationId),
        eq(integrationCredentials.shopId, shop.id),
      ),
    )
  await db
    .update(shops)
    .set({
      status: 'draft',
      authExpiresAt: null,
      meta: {
        ...(typeof shop.meta === 'object' && shop.meta ? shop.meta : {}),
        syncPaused: true,
        lastError: null,
      },
      updatedAt: new Date(),
    })
    .where(eq(shops.id, shop.id))
  await db
    .insert(integrationStates)
    .values({ shopId: shop.id, health: 'idle', lastError: null })
    .onConflictDoUpdate({
      target: integrationStates.shopId,
      set: { health: 'idle', lastError: null },
    })
  await db.insert(integrationLogs).values({
    shopId: shop.id,
    direction: 'in',
    action: 'credential_remove',
    status: 'success',
    message: '店铺授权已解绑',
  })

  return getShopConnection(db as AppDatabase, organizationId, shop.id)
}

export async function setShopSyncPaused(
  db: DbLike,
  organizationId: string,
  input: { id: string; paused: boolean },
) {
  const [shop] = await db
    .select()
    .from(shops)
    .where(and(eq(shops.organizationId, organizationId), eq(shops.id, input.id), isNull(shops.deletedAt)))
    .limit(1)
  if (!shop) throw new Error('店铺不存在')
  const meta = { ...(typeof shop.meta === 'object' && shop.meta ? shop.meta : {}), syncPaused: input.paused }
  await db
    .update(shops)
    .set({ meta, updatedAt: new Date() })
    .where(eq(shops.id, shop.id))

  const [state] = await db
    .select({ health: integrationStates.health })
    .from(integrationStates)
    .where(eq(integrationStates.shopId, shop.id))
    .limit(1)
  if (input.paused) {
    await db
      .insert(integrationStates)
      .values({ shopId: shop.id, health: 'paused', lastError: null })
      .onConflictDoUpdate({
        target: integrationStates.shopId,
        set: { health: 'paused' },
      })
  } else if (state?.health === 'paused' || !state) {
    await db
      .insert(integrationStates)
      .values({ shopId: shop.id, health: 'idle', lastError: null })
      .onConflictDoUpdate({
        target: integrationStates.shopId,
        set: { health: 'idle', lastError: null },
      })
  }

  return getShopConnection(db as AppDatabase, organizationId, shop.id)
}

export async function disableShop(
  db: DbLike,
  organizationId: string,
  input: { id: string },
) {
  const [shop] = await db
    .select()
    .from(shops)
    .where(and(eq(shops.organizationId, organizationId), eq(shops.id, input.id), isNull(shops.deletedAt)))
    .limit(1)
  if (!shop) throw new Error('店铺不存在')
  const meta = {
    ...(typeof shop.meta === 'object' && shop.meta ? shop.meta : {}),
    syncPaused: true,
  }
  await db
    .update(shops)
    .set({ status: 'disabled', meta, updatedAt: new Date() })
    .where(eq(shops.id, shop.id))
  return getShopConnection(db as AppDatabase, organizationId, shop.id)
}

export function countShopKpi(rows: ShopConnectionDto[]) {
  return {
    total: rows.length,
    authorized: rows.filter((r) => r.authStatus === '已授权').length,
    pending: rows.filter((r) => r.authStatus === '待授权' || r.authStatus === '连接中' || r.authStatus === '草稿').length,
    expired: rows.filter((r) => r.authStatus === '授权失效').length,
    paused: rows.filter((r) => r.syncPaused).length,
  }
}
