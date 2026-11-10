import { and, count, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm'
import {
  auditEvents,
  consoleNotifications,
  integrationCredentials,
  integrationLogs,
  integrationStates,
  organization,
  shops,
} from '@workspace/db'
import { db } from '@/lib/db'

/**
 * 平台运营店铺管理（apps/web）。
 * 跨租户只读为主；写操作仅限风控停用/恢复，均写审计与租户站内信。
 * @see apps/web/content/design/platform-ops-review-and-management.md §4
 */

export type PlatformShopListItem = {
  id: string
  name: string
  platform: string
  region: string | null
  externalShopId: string | null
  sellerId: string | null
  organizationId: string
  organizationName: string
  organizationEntryApproved: boolean
  status: string
  health: string | null
  hasCredential: boolean
  authExpiresAt: Date | null
  lastSyncAt: Date | null
  syncPaused: boolean
}

function pageValues(page?: number, pageSize?: number) {
  const normalizedPage = Math.max(1, Math.trunc(page ?? 1))
  const normalizedSize = Math.min(100, Math.max(1, Math.trunc(pageSize ?? 20)))
  return { page: normalizedPage, pageSize: normalizedSize }
}

function syncPausedFlag(meta: unknown, health: string | null, status: string) {
  if (status === 'disabled') return true
  if (health === 'paused') return true
  if (meta && typeof meta === 'object' && 'syncPaused' in meta) {
    return Boolean((meta as Record<string, unknown>).syncPaused)
  }
  return false
}

export async function listPlatformShops(input: {
  page?: number
  pageSize?: number
  q?: string
  platform?: string
  status?: string
}) {
  const { page, pageSize } = pageValues(input.page, input.pageSize)
  const filters = [isNull(shops.deletedAt)]
  if (input.platform && input.platform !== 'all') {
    filters.push(eq(shops.platform, input.platform))
  }
  if (input.status && input.status !== 'all') {
    filters.push(eq(shops.status, input.status))
  }
  if (input.q?.trim()) {
    const value = `%${input.q.trim()}%`
    filters.push(
      or(
        ilike(shops.name, value),
        ilike(shops.externalShopId, value),
        ilike(shops.sellerId, value),
        ilike(organization.name, value),
      )!,
    )
  }
  const where = and(...filters)

  const totalRows = await db
    .select({ total: count() })
    .from(shops)
    .innerJoin(organization, eq(organization.id, shops.organizationId))
    .where(where)
  const total = Number(totalRows[0]?.total ?? 0)

  const rows = await db
    .select({
      id: shops.id,
      name: shops.name,
      platform: shops.platform,
      region: shops.marketplaceCountry,
      externalShopId: shops.externalShopId,
      sellerId: shops.sellerId,
      organizationId: shops.organizationId,
      organizationName: organization.name,
      organizationEntryApproved: organization.entryApproved,
      status: shops.status,
      meta: shops.meta,
      health: integrationStates.health,
      authExpiresAt: shops.authExpiresAt,
      lastSyncAt: shops.lastSyncAt,
    })
    .from(shops)
    .innerJoin(organization, eq(organization.id, shops.organizationId))
    .leftJoin(integrationStates, eq(integrationStates.shopId, shops.id))
    .where(where)
    .orderBy(desc(shops.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const shopIds = rows.map((row) => row.id)
  const credRows = shopIds.length
    ? await db
        .select({ shopId: integrationCredentials.shopId })
        .from(integrationCredentials)
        .where(inArray(integrationCredentials.shopId, shopIds))
    : []
  const credShopIds = new Set(credRows.map((row) => row.shopId))

  const items: PlatformShopListItem[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    platform: row.platform,
    region: row.region,
    externalShopId: row.externalShopId,
    sellerId: row.sellerId,
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    organizationEntryApproved: row.organizationEntryApproved,
    status: row.status,
    health: row.health,
    hasCredential: credShopIds.has(row.id),
    authExpiresAt: row.authExpiresAt,
    lastSyncAt: row.lastSyncAt,
    syncPaused: syncPausedFlag(row.meta, row.health, row.status),
  }))

  const summaryWhere = isNull(shops.deletedAt)
  const [summaryRow] = await db
    .select({
      total: count(),
      active: sql<number>`count(*) filter (where ${shops.status} = 'active')`,
      pending: sql<number>`count(*) filter (where ${shops.status} in ('draft', 'connecting'))`,
      error: sql<number>`count(*) filter (where ${shops.status} = 'error')`,
      disabled: sql<number>`count(*) filter (where ${shops.status} = 'disabled')`,
    })
    .from(shops)
    .where(summaryWhere)

  return {
    items,
    total,
    page,
    pageSize,
    summary: {
      total: Number(summaryRow?.total ?? 0),
      active: Number(summaryRow?.active ?? 0),
      pending: Number(summaryRow?.pending ?? 0),
      error: Number(summaryRow?.error ?? 0),
      disabled: Number(summaryRow?.disabled ?? 0),
    },
  }
}

export async function getPlatformShop(id: string) {
  const [row] = await db
    .select({
      shop: shops,
      organizationName: organization.name,
      organizationEntryApproved: organization.entryApproved,
      organizationStatus: organization.status,
      health: integrationStates.health,
      lastError: integrationStates.lastError,
      lastOrdersSyncAt: integrationStates.lastOrdersSyncAt,
      lastInventorySyncAt: integrationStates.lastInventorySyncAt,
    })
    .from(shops)
    .innerJoin(organization, eq(organization.id, shops.organizationId))
    .leftJoin(integrationStates, eq(integrationStates.shopId, shops.id))
    .where(and(eq(shops.id, id), isNull(shops.deletedAt)))
    .limit(1)
  if (!row) return null

  const [credential] = await db
    .select({
      id: integrationCredentials.id,
      kind: integrationCredentials.kind,
      expiresAt: integrationCredentials.expiresAt,
      appCredentialId: integrationCredentials.appCredentialId,
    })
    .from(integrationCredentials)
    .where(eq(integrationCredentials.shopId, row.shop.id))
    .limit(1)

  const logs = await db
    .select({
      id: integrationLogs.id,
      action: integrationLogs.action,
      direction: integrationLogs.direction,
      status: integrationLogs.status,
      message: integrationLogs.message,
      createdAt: integrationLogs.createdAt,
    })
    .from(integrationLogs)
    .where(eq(integrationLogs.shopId, row.shop.id))
    .orderBy(desc(integrationLogs.createdAt))
    .limit(20)

  return {
    shop: {
      id: row.shop.id,
      name: row.shop.name,
      platform: row.shop.platform,
      region: row.shop.marketplaceCountry,
      currency: row.shop.currency,
      externalShopId: row.shop.externalShopId,
      sellerId: row.shop.sellerId,
      shopGroup: row.shop.shopGroup,
      fulfillmentMode: row.shop.fulfillmentMode,
      status: row.shop.status,
      authExpiresAt: row.shop.authExpiresAt,
      lastSyncAt: row.shop.lastSyncAt,
      createdAt: row.shop.createdAt,
      updatedAt: row.shop.updatedAt,
      meta: row.shop.meta,
    },
    organization: {
      id: row.shop.organizationId,
      name: row.organizationName,
      entryApproved: row.organizationEntryApproved,
      status: row.organizationStatus,
    },
    health: row.health,
    lastError: row.lastError,
    lastOrdersSyncAt: row.lastOrdersSyncAt,
    lastInventorySyncAt: row.lastInventorySyncAt,
    credential: credential
      ? {
          kind: credential.kind,
          expiresAt: credential.expiresAt,
          appCredentialId: credential.appCredentialId,
        }
      : null,
    syncPaused: syncPausedFlag(row.shop.meta, row.health, row.shop.status),
    logs,
  }
}

export async function disablePlatformShop(input: {
  shopId: string
  operatorId: string
  reason?: string
}) {
  return db.transaction(async (tx) => {
    const [shop] = await tx
      .select()
      .from(shops)
      .where(and(eq(shops.id, input.shopId), isNull(shops.deletedAt)))
      .limit(1)
    if (!shop) throw new Error('店铺不存在')
    if (shop.status === 'disabled') throw new Error('店铺已处于停用状态')
    const now = new Date()
    const note = input.reason?.trim() || null

    await tx
      .update(shops)
      .set({
        status: 'disabled',
        meta: {
          ...(shop.meta ?? {}),
          syncPaused: true,
          platformDisabledBy: input.operatorId,
          platformDisabledReason: note,
        },
        updatedAt: now,
      })
      .where(eq(shops.id, shop.id))
    await tx
      .insert(integrationStates)
      .values({ shopId: shop.id, health: 'paused', lastError: null })
      .onConflictDoUpdate({
        target: integrationStates.shopId,
        set: { health: 'paused' },
      })
    await tx.insert(integrationLogs).values({
      shopId: shop.id,
      direction: 'in',
      action: 'platform_disable',
      status: 'success',
      message: note ? `平台运营停用店铺：${note}` : '平台运营停用店铺',
    })
    await tx.insert(auditEvents).values({
      organizationId: shop.organizationId,
      actorUserId: input.operatorId,
      action: 'shop.platform_disable',
      entityType: 'shop',
      entityId: shop.id,
      before: { status: shop.status },
      after: { status: 'disabled', reason: note },
      result: 'success',
    })
    await tx.insert(consoleNotifications).values({
      organizationId: shop.organizationId,
      category: 'system',
      title: '店铺已被平台停用',
      summary: note
        ? `店铺「${shop.name}」已被平台停用：${note}`
        : `店铺「${shop.name}」已被平台停用，请联系平台运营核实。`,
      body: note ?? '',
      href: '/settings/shops',
      sourceType: 'platform_shop_ops',
      sourceId: shop.id,
    })

    return { ok: true as const, shopId: shop.id }
  })
}

export async function restorePlatformShop(input: {
  shopId: string
  operatorId: string
}) {
  return db.transaction(async (tx) => {
    const [shop] = await tx
      .select()
      .from(shops)
      .where(and(eq(shops.id, input.shopId), isNull(shops.deletedAt)))
      .limit(1)
    if (!shop) throw new Error('店铺不存在')
    if (shop.status !== 'disabled') throw new Error('仅停用状态的店铺可恢复')
    const now = new Date()

    await tx
      .update(shops)
      .set({
        status: 'draft',
        meta: {
          ...(shop.meta ?? {}),
          syncPaused: false,
          platformRestoredBy: input.operatorId,
        },
        updatedAt: now,
      })
      .where(eq(shops.id, shop.id))
    await tx
      .insert(integrationStates)
      .values({ shopId: shop.id, health: 'idle', lastError: null })
      .onConflictDoUpdate({
        target: integrationStates.shopId,
        set: { health: 'idle', lastError: null },
      })
    await tx.insert(integrationLogs).values({
      shopId: shop.id,
      direction: 'in',
      action: 'platform_restore',
      status: 'success',
      message: '平台运营恢复店铺，待租户重新授权',
    })
    await tx.insert(auditEvents).values({
      organizationId: shop.organizationId,
      actorUserId: input.operatorId,
      action: 'shop.platform_restore',
      entityType: 'shop',
      entityId: shop.id,
      before: { status: shop.status },
      after: { status: 'draft' },
      result: 'success',
    })
    await tx.insert(consoleNotifications).values({
      organizationId: shop.organizationId,
      category: 'system',
      title: '店铺已恢复，请重新授权',
      summary: `店铺「${shop.name}」已由平台恢复，请前往店铺连接页重新完成授权。`,
      body: '',
      href: '/settings/shops',
      sourceType: 'platform_shop_ops',
      sourceId: shop.id,
    })

    return { ok: true as const, shopId: shop.id }
  })
}
