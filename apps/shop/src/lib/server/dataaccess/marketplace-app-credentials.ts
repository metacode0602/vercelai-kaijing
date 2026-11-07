import { and, count, eq, ne } from 'drizzle-orm'
import { marketplaceAppCredentials } from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import { encryptSecret } from '@workspace/marketplace'
import { appendAuditEvent } from '@/lib/server/dataaccess/audit'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'
import { marketplaceBaseUrl } from '@/lib/marketplace/env'

export const MARKETPLACE_APP_PLATFORMS = ['daraz', 'lazada', 'tiktok_shop'] as const
export type MarketplaceAppPlatform = (typeof MARKETPLACE_APP_PLATFORMS)[number]

const PLATFORM_LABELS: Record<MarketplaceAppPlatform, string> = {
  daraz: 'Daraz',
  lazada: 'Lazada',
  tiktok_shop: 'TikTok Shop',
}

const REGION_LABELS: Record<string, string> = {
  '': '全部站点（通用）',
  LK: '斯里兰卡（LK）',
  PK: '巴基斯坦（PK）',
  BD: '孟加拉国（BD）',
  NP: '尼泊尔（NP）',
  MM: '缅甸（MM）',
  MY: '马来西亚（MY）',
  PH: '菲律宾（PH）',
  TH: '泰国（TH）',
  SG: '新加坡（SG）',
  VN: '越南（VN）',
  ID: '印度尼西亚（ID）',
  GLOBAL: '全球（GLOBAL）',
}

export function normalizeMarketplaceRegion(region?: string | null) {
  return (region ?? '').trim().toUpperCase()
}

export function marketplaceAppCallbackUrl(
  platform: string,
  callbackKey?: string | null,
) {
  const key = callbackKey?.trim()
  const base = `${marketplaceBaseUrl()}/api/marketplace/${platform}/oauth/callback`
  return key ? `${base}/${encodeURIComponent(key)}` : base
}

export type MarketplaceAppCredentialDto = {
  id: string
  platform: MarketplaceAppPlatform
  platformLabel: string
  region: string
  regionLabel: string
  appKey: string
  hasSecret: boolean
  callbackKey: string
  callbackUrl: string
  status: string
  lastVerifiedAt: string | null
  lastError: string | null
  updatedAt: string
}

function mapRow(row: typeof marketplaceAppCredentials.$inferSelect): MarketplaceAppCredentialDto {
  const platform = row.platform as MarketplaceAppPlatform
  return {
    id: row.id,
    platform,
    platformLabel: PLATFORM_LABELS[platform] ?? row.platform,
    region: row.region,
    regionLabel: REGION_LABELS[row.region] ?? row.region,
    appKey: row.appKey,
    hasSecret: Boolean(row.appSecretEncrypted),
    callbackKey: row.callbackKey ?? '',
    callbackUrl: marketplaceAppCallbackUrl(row.platform, row.callbackKey),
    status: row.status,
    lastVerifiedAt: row.lastVerifiedAt ? row.lastVerifiedAt.toISOString() : null,
    lastError: row.lastError,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listMarketplaceAppCredentials(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number } = {},
): Promise<PaginatedResult<MarketplaceAppCredentialDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize ?? 20)
  const where = eq(marketplaceAppCredentials.organizationId, organizationId)
  const [totalRow] = await db
    .select({ value: count() })
    .from(marketplaceAppCredentials)
    .where(where)
  const rows = await db
    .select()
    .from(marketplaceAppCredentials)
    .where(where)
    .orderBy(marketplaceAppCredentials.platform, marketplaceAppCredentials.region)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  return {
    items: rows.map(mapRow),
    total: Number(totalRow?.value ?? 0),
    page,
    pageSize,
  }
}

async function assertAppKeyNotOwnedByOtherOrg(
  db: AppDatabase,
  organizationId: string,
  platform: string,
  appKey: string,
) {
  const [row] = await db
    .select({ organizationId: marketplaceAppCredentials.organizationId })
    .from(marketplaceAppCredentials)
    .where(
      and(
        eq(marketplaceAppCredentials.platform, platform),
        eq(marketplaceAppCredentials.appKey, appKey),
        ne(marketplaceAppCredentials.organizationId, organizationId),
      ),
    )
    .limit(1)
  if (row) {
    throw new Error('该 App Key 已被其他组织使用，请确认是否填错')
  }
}

async function assertRegionUnique(
  db: AppDatabase,
  input: {
    organizationId: string
    platform: string
    region: string
    excludeId?: string
  },
) {
  const conditions = [
    eq(marketplaceAppCredentials.organizationId, input.organizationId),
    eq(marketplaceAppCredentials.platform, input.platform),
    eq(marketplaceAppCredentials.region, input.region),
  ]
  if (input.excludeId) conditions.push(ne(marketplaceAppCredentials.id, input.excludeId))
  const [row] = await db
    .select({ id: marketplaceAppCredentials.id })
    .from(marketplaceAppCredentials)
    .where(and(...conditions))
    .limit(1)
  if (row) {
    throw new Error('该平台与站点已存在配置，请直接编辑')
  }
}

function auditSummary(input: {
  platform: string
  region: string
  appKey: string
  callbackKey?: string | null
  status?: string
}) {
  return {
    platform: input.platform,
    region: input.region,
    appKey: input.appKey,
    callbackKey: input.callbackKey ?? null,
    status: input.status ?? 'active',
  }
}

export async function createMarketplaceAppCredential(
  db: AppDatabase,
  organizationId: string,
  input: {
    platform: MarketplaceAppPlatform
    region?: string
    appKey: string
    appSecret: string
    callbackKey?: string
    actorUserId?: string
    actorLabel?: string
  },
) {
  const region = normalizeMarketplaceRegion(input.region)
  const appKey = input.appKey.trim()
  const callbackKey = input.callbackKey?.trim() || null
  if (!appKey) throw new Error('App Key 不能为空')
  if (!input.appSecret.trim()) throw new Error('App Secret 不能为空')

  await assertRegionUnique(db, { organizationId, platform: input.platform, region })
  await assertAppKeyNotOwnedByOtherOrg(db, organizationId, input.platform, appKey)

  const [row] = await db
    .insert(marketplaceAppCredentials)
    .values({
      organizationId,
      platform: input.platform,
      region,
      appKey,
      appSecretEncrypted: encryptSecret(input.appSecret.trim()),
      callbackKey,
      status: 'active',
      createdBy: input.actorUserId,
      updatedBy: input.actorUserId,
    })
    .returning()

  await appendAuditEvent(db, organizationId, {
    actorUserId: input.actorUserId,
    actorLabel: input.actorLabel,
    action: 'marketplace_app_credential.create',
    entityType: 'marketplace_app_credential',
    entityId: row.id,
    result: 'success',
    detail: `创建 ${PLATFORM_LABELS[input.platform]} ${region || '通用'} 应用配置`,
    after: auditSummary({
      platform: row.platform,
      region: row.region,
      appKey: row.appKey,
      callbackKey: row.callbackKey,
    }),
  })
  return mapRow(row)
}

export async function updateMarketplaceAppCredential(
  db: AppDatabase,
  organizationId: string,
  input: {
    id: string
    platform?: MarketplaceAppPlatform
    region?: string
    appKey?: string
    appSecret?: string
    callbackKey?: string | null
    actorUserId?: string
    actorLabel?: string
  },
) {
  const [existing] = await db
    .select()
    .from(marketplaceAppCredentials)
    .where(
      and(
        eq(marketplaceAppCredentials.id, input.id),
        eq(marketplaceAppCredentials.organizationId, organizationId),
      ),
    )
    .limit(1)
  if (!existing) throw new Error('平台应用配置不存在')

  const platform = input.platform ?? (existing.platform as MarketplaceAppPlatform)
  const region =
    input.region === undefined ? existing.region : normalizeMarketplaceRegion(input.region)
  const appKey = input.appKey === undefined ? existing.appKey : input.appKey.trim()
  const callbackKey =
    input.callbackKey === undefined
      ? existing.callbackKey
      : input.callbackKey?.trim() || null
  if (!appKey) throw new Error('App Key 不能为空')

  await assertRegionUnique(db, {
    organizationId,
    platform,
    region,
    excludeId: existing.id,
  })
  await assertAppKeyNotOwnedByOtherOrg(db, organizationId, platform, appKey)

  const secret = input.appSecret?.trim()
  const [row] = await db
    .update(marketplaceAppCredentials)
    .set({
      platform,
      region,
      appKey,
      callbackKey,
      appSecretEncrypted: secret ? encryptSecret(secret) : existing.appSecretEncrypted,
      updatedBy: input.actorUserId,
      updatedAt: new Date(),
    })
    .where(eq(marketplaceAppCredentials.id, existing.id))
    .returning()

  await appendAuditEvent(db, organizationId, {
    actorUserId: input.actorUserId,
    actorLabel: input.actorLabel,
    action: 'marketplace_app_credential.update',
    entityType: 'marketplace_app_credential',
    entityId: row.id,
    result: 'success',
    detail: `更新 ${PLATFORM_LABELS[platform]} ${region || '通用'} 应用配置`,
    before: auditSummary({
      platform: existing.platform,
      region: existing.region,
      appKey: existing.appKey,
      callbackKey: existing.callbackKey,
      status: existing.status,
    }),
    after: auditSummary({
      platform: row.platform,
      region: row.region,
      appKey: row.appKey,
      callbackKey: row.callbackKey,
      status: row.status,
    }),
  })
  return mapRow(row)
}

export async function removeMarketplaceAppCredential(
  db: AppDatabase,
  organizationId: string,
  input: { id: string; actorUserId?: string; actorLabel?: string },
) {
  const [existing] = await db
    .select()
    .from(marketplaceAppCredentials)
    .where(
      and(
        eq(marketplaceAppCredentials.id, input.id),
        eq(marketplaceAppCredentials.organizationId, organizationId),
      ),
    )
    .limit(1)
  if (!existing) throw new Error('平台应用配置不存在')

  await db
    .delete(marketplaceAppCredentials)
    .where(eq(marketplaceAppCredentials.id, existing.id))

  await appendAuditEvent(db, organizationId, {
    actorUserId: input.actorUserId,
    actorLabel: input.actorLabel,
    action: 'marketplace_app_credential.remove',
    entityType: 'marketplace_app_credential',
    entityId: existing.id,
    result: 'success',
    detail: `删除 ${PLATFORM_LABELS[existing.platform as MarketplaceAppPlatform] ?? existing.platform} ${existing.region || '通用'} 应用配置`,
    before: auditSummary({
      platform: existing.platform,
      region: existing.region,
      appKey: existing.appKey,
      callbackKey: existing.callbackKey,
      status: existing.status,
    }),
  })
  return { id: existing.id }
}

export async function touchMarketplaceAppCredentialVerification(
  db: AppDatabase,
  input: { id: string; organizationId: string; actorUserId?: string },
) {
  await db
    .update(marketplaceAppCredentials)
    .set({
      lastVerifiedAt: new Date(),
      lastError: null,
      updatedBy: input.actorUserId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(marketplaceAppCredentials.id, input.id),
        eq(marketplaceAppCredentials.organizationId, input.organizationId),
      ),
    )
}

export async function recordMarketplaceAppCredentialError(
  db: AppDatabase,
  input: { id: string; organizationId: string; message: string },
) {
  await db
    .update(marketplaceAppCredentials)
    .set({
      lastError: input.message.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(marketplaceAppCredentials.id, input.id),
        eq(marketplaceAppCredentials.organizationId, input.organizationId),
      ),
    )
}
