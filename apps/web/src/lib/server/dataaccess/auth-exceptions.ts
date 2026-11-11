import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm'
import {
  integrationLogs,
  integrationStates,
  organization,
  shops,
} from '@workspace/db'
import { db } from '@/lib/db'
import { pageValues } from '@/lib/server/dataaccess/pagination'
import {
  classifyOAuthFailure,
  redactOAuthPayload,
  sanitizeOAuthText,
} from '@/lib/server/oauth-auth-errors'

export type AuthExceptionListItem = {
  id: string
  createdAt: Date
  action: string
  organizationId: string
  organizationName: string
  shopId: string
  shopName: string
  platform: string
  externalShopId: string | null
  errorCode: string
  reason: string
  advice: string
  message: string
}

function shopMeta(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export async function listAuthExceptions(input: {
  page?: number
  pageSize?: number
  q?: string
  platform?: string
  organizationId?: string
  shopId?: string
}) {
  const { page, pageSize } = pageValues(input.page, input.pageSize)
  const filters: SQL[] = [
    eq(integrationLogs.status, 'error'),
    or(
      eq(integrationLogs.action, 'oauth_callback'),
      eq(integrationLogs.action, 'oauth_authorize'),
      eq(integrationLogs.action, 'shop_binding_conflict'),
    )!,
  ]

  if (input.platform && input.platform !== 'all') {
    filters.push(eq(shops.platform, input.platform))
  }
  if (input.organizationId) {
    filters.push(eq(organization.id, input.organizationId))
  }
  if (input.shopId) {
    filters.push(eq(shops.id, input.shopId))
  }

  const keyword = input.q?.trim()
  if (keyword) {
    const pattern = `%${keyword}%`
    filters.push(
      or(
        ilike(shops.name, pattern),
        ilike(organization.name, pattern),
        ilike(shops.externalShopId, pattern),
        ilike(integrationLogs.message, pattern),
        ilike(integrationLogs.payloadSummary, pattern),
      )!,
    )
  }

  const where = and(...filters)

  const [totalRow] = await db
    .select({ value: count() })
    .from(integrationLogs)
    .innerJoin(shops, eq(shops.id, integrationLogs.shopId))
    .innerJoin(organization, eq(organization.id, shops.organizationId))
    .where(where)

  const total = Number(totalRow?.value ?? 0)
  const rows = await db
    .select({
      id: integrationLogs.id,
      createdAt: integrationLogs.createdAt,
      action: integrationLogs.action,
      message: integrationLogs.message,
      payloadSummary: integrationLogs.payloadSummary,
      shopId: shops.id,
      shopName: shops.name,
      shopMeta: shops.meta,
      platform: shops.platform,
      externalShopId: shops.externalShopId,
      organizationId: organization.id,
      organizationName: organization.name,
      stateLastError: integrationStates.lastError,
    })
    .from(integrationLogs)
    .innerJoin(shops, eq(shops.id, integrationLogs.shopId))
    .innerJoin(organization, eq(organization.id, shops.organizationId))
    .leftJoin(integrationStates, eq(integrationStates.shopId, shops.id))
    .where(where)
    .orderBy(desc(integrationLogs.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const items: AuthExceptionListItem[] = rows.map((row) => {
    const payload = redactOAuthPayload(row.payloadSummary)
    const meta = shopMeta(row.shopMeta)
    const payloadReason =
      typeof payload.reason === 'string' ? payload.reason : null
    const metaLastError =
      typeof meta.lastError === 'string' ? meta.lastError : null
    const metaLastErrorCode =
      typeof meta.lastErrorCode === 'string' ? meta.lastErrorCode : null
    const classified = classifyOAuthFailure({
      reason: payloadReason ?? metaLastErrorCode,
      message: row.message,
      lastError: row.stateLastError ?? metaLastError,
    })
    return {
      id: row.id,
      createdAt: row.createdAt,
      action: row.action,
      organizationId: row.organizationId,
      organizationName: row.organizationName,
      shopId: row.shopId,
      shopName: row.shopName,
      platform: row.platform,
      externalShopId: row.externalShopId,
      errorCode: classified.code,
      reason: classified.reason,
      advice: classified.advice,
      message: sanitizeOAuthText(row.message),
    }
  })

  return { items, total, page, pageSize }
}
