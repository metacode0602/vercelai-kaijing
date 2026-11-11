import { and, count, desc, eq, inArray, or, type SQL } from 'drizzle-orm'
import {
  auditEvents,
  integrationLogs,
  integrationStates,
  integrationCredentials,
  marketplaceAppCredentials,
  member,
  organization,
  pendingActions,
  shopBindingConflicts,
  shops,
  tenantOnboardingApplications,
  user,
  webUser,
} from '@workspace/db'
import { db } from '@/lib/db'
import { pageValues } from '@/lib/server/dataaccess/pagination'
import {
  classifyOAuthFailure,
  redactOAuthPayload,
  sanitizeOAuthText,
} from '@/lib/server/oauth-auth-errors'

export type ActorRef = {
  id: string
  name: string
  email: string | null
}

export async function resolveActorNames(ids: Array<string | null | undefined>) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  const map = new Map<string, ActorRef>()
  if (!unique.length) return map

  const tenantUsers = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(inArray(user.id, unique))
  for (const row of tenantUsers) {
    map.set(row.id, { id: row.id, name: row.name || row.email || row.id, email: row.email })
  }

  const missing = unique.filter((id) => !map.has(id))
  if (missing.length) {
    const admins = await db
      .select({ id: webUser.id, name: webUser.name, email: webUser.email })
      .from(webUser)
      .where(inArray(webUser.id, missing))
    for (const row of admins) {
      map.set(row.id, { id: row.id, name: row.name || row.email || row.id, email: row.email })
    }
  }
  return map
}

const SENSITIVE_KEY = /secret|token|password|authorization|credential|api[_-]?key|payloadEncrypted/i

export function redactSensitiveValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitiveValue)
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SENSITIVE_KEY.test(key) ? '[已隐藏]' : redactSensitiveValue(nested)
    }
    return output
  }
  return value
}

export async function getTenant(id: string) {
  const [row] = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      status: organization.status,
      entryApproved: organization.entryApproved,
      identityStatus: organization.identityStatus,
      enterpriseVerificationStatus: organization.enterpriseVerificationStatus,
      merchantStatus: organization.merchantStatus,
      createdAt: organization.createdAt,
      parentMerchantOrgId: organization.parentMerchantOrgId,
    })
    .from(organization)
    .where(and(eq(organization.id, id), eq(organization.orgType, 'tenant')))
    .limit(1)
  if (!row) return null

  let parent: { id: string; name: string; slug: string | null } | null = null
  if (row.parentMerchantOrgId) {
    const [parentRow] = await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      })
      .from(organization)
      .where(eq(organization.id, row.parentMerchantOrgId))
      .limit(1)
    parent = parentRow ?? {
      id: row.parentMerchantOrgId,
      name: row.parentMerchantOrgId,
      slug: null,
    }
  }

  const [application] = await db
    .select({
      id: tenantOnboardingApplications.id,
      companyName: tenantOnboardingApplications.companyName,
      registrationNo: tenantOnboardingApplications.registrationNo,
      countryCode: tenantOnboardingApplications.countryCode,
      contactName: tenantOnboardingApplications.contactName,
      contactPhone: tenantOnboardingApplications.contactPhone,
      status: tenantOnboardingApplications.status,
      version: tenantOnboardingApplications.version,
      submittedAt: tenantOnboardingApplications.submittedAt,
      reviewedAt: tenantOnboardingApplications.reviewedAt,
    })
    .from(tenantOnboardingApplications)
    .where(eq(tenantOnboardingApplications.organizationId, row.id))
    .limit(1)

  return { tenant: row, parent, application: application ?? null }
}

export async function listTenantMembers(input: {
  organizationId: string
  page?: number
  pageSize?: number
}) {
  const { page, pageSize } = pageValues(input.page, input.pageSize)
  const where = eq(member.organizationId, input.organizationId)
  const [totalRow] = await db.select({ value: count() }).from(member).where(where)
  const items = await db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: member.role,
      joinedAt: member.createdAt,
      banned: user.banned,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(where)
    .orderBy(desc(member.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  return { items, total: Number(totalRow?.value ?? 0), page, pageSize }
}

export async function listTenantAppCredentials(input: {
  organizationId: string
  page?: number
  pageSize?: number
}) {
  const { page, pageSize } = pageValues(input.page, input.pageSize)
  const where = eq(marketplaceAppCredentials.organizationId, input.organizationId)
  const [totalRow] = await db
    .select({ value: count() })
    .from(marketplaceAppCredentials)
    .where(where)
  const items = await db
    .select({
      id: marketplaceAppCredentials.id,
      platform: marketplaceAppCredentials.platform,
      region: marketplaceAppCredentials.region,
      appKey: marketplaceAppCredentials.appKey,
      status: marketplaceAppCredentials.status,
      lastVerifiedAt: marketplaceAppCredentials.lastVerifiedAt,
      lastError: marketplaceAppCredentials.lastError,
      updatedAt: marketplaceAppCredentials.updatedAt,
    })
    .from(marketplaceAppCredentials)
    .where(where)
    .orderBy(desc(marketplaceAppCredentials.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  return { items, total: Number(totalRow?.value ?? 0), page, pageSize }
}

export async function listPlatformAuditEvents(input: {
  organizationId?: string
  entityType?: string
  entityId?: string
  actorUserId?: string
  page?: number
  pageSize?: number
}) {
  const { page, pageSize } = pageValues(input.page, input.pageSize)
  const filters: SQL[] = []
  if (input.organizationId) {
    filters.push(eq(auditEvents.organizationId, input.organizationId))
  }
  if (input.entityType && input.entityId) {
    filters.push(
      and(eq(auditEvents.entityType, input.entityType), eq(auditEvents.entityId, input.entityId))!,
    )
  }
  if (input.actorUserId) {
    filters.push(
      or(
        eq(auditEvents.actorUserId, input.actorUserId),
        and(eq(auditEvents.entityType, 'user'), eq(auditEvents.entityId, input.actorUserId)),
      )!,
    )
  }
  if (!filters.length) {
    throw new Error('审计查询需要指定组织、对象或操作者')
  }
  const where = and(...filters)
  const [totalRow] = await db.select({ value: count() }).from(auditEvents).where(where)
  const rows = await db
    .select({
      id: auditEvents.id,
      organizationId: auditEvents.organizationId,
      actorUserId: auditEvents.actorUserId,
      actorLabel: auditEvents.actorLabel,
      action: auditEvents.action,
      entityType: auditEvents.entityType,
      entityId: auditEvents.entityId,
      result: auditEvents.result,
      detail: auditEvents.detail,
      createdAt: auditEvents.createdAt,
    })
    .from(auditEvents)
    .where(where)
    .orderBy(desc(auditEvents.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const actors = await resolveActorNames(rows.map((row) => row.actorUserId))
  const items = rows.map((row) => ({
    ...row,
    actor: row.actorUserId ? actors.get(row.actorUserId) ?? null : null,
  }))
  return { items, total: Number(totalRow?.value ?? 0), page, pageSize }
}

export async function listShopIntegrationLogs(input: {
  shopId: string
  page?: number
  pageSize?: number
}) {
  const { page, pageSize } = pageValues(input.page, input.pageSize)
  const where = eq(integrationLogs.shopId, input.shopId)
  const [totalRow] = await db.select({ value: count() }).from(integrationLogs).where(where)
  const rows = await db
    .select({
      id: integrationLogs.id,
      action: integrationLogs.action,
      direction: integrationLogs.direction,
      status: integrationLogs.status,
      message: integrationLogs.message,
      payloadSummary: integrationLogs.payloadSummary,
      createdAt: integrationLogs.createdAt,
    })
    .from(integrationLogs)
    .where(where)
    .orderBy(desc(integrationLogs.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  return {
    items: rows.map((row) => ({
      ...row,
      message: sanitizeOAuthText(row.message),
      payloadSummary: sanitizeOAuthText(row.payloadSummary),
    })),
    total: Number(totalRow?.value ?? 0),
    page,
    pageSize,
  }
}

function shopMeta(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export async function getAuthException(id: string) {
  const [row] = await db
    .select({
      id: integrationLogs.id,
      createdAt: integrationLogs.createdAt,
      action: integrationLogs.action,
      message: integrationLogs.message,
      payloadSummary: integrationLogs.payloadSummary,
      shopId: shops.id,
      shopName: shops.name,
      shopStatus: shops.status,
      shopMeta: shops.meta,
      platform: shops.platform,
      externalShopId: shops.externalShopId,
      authExpiresAt: shops.authExpiresAt,
      organizationId: organization.id,
      organizationName: organization.name,
      organizationStatus: organization.status,
      health: integrationStates.health,
      stateLastError: integrationStates.lastError,
    })
    .from(integrationLogs)
    .innerJoin(shops, eq(shops.id, integrationLogs.shopId))
    .innerJoin(organization, eq(organization.id, shops.organizationId))
    .leftJoin(integrationStates, eq(integrationStates.shopId, shops.id))
    .where(eq(integrationLogs.id, id))
    .limit(1)
  if (!row) return null

  const payload = redactOAuthPayload(row.payloadSummary)
  const meta = shopMeta(row.shopMeta)
  const payloadReason = typeof payload.reason === 'string' ? payload.reason : null
  const metaLastError = typeof meta.lastError === 'string' ? meta.lastError : null
  const metaLastErrorCode = typeof meta.lastErrorCode === 'string' ? meta.lastErrorCode : null
  const classified = classifyOAuthFailure({
    reason: payloadReason ?? metaLastErrorCode,
    message: row.message,
    lastError: row.stateLastError ?? metaLastError,
  })

  const [cred] = await db
    .select({ id: integrationCredentials.id })
    .from(integrationCredentials)
    .where(eq(integrationCredentials.shopId, row.shopId))
    .limit(1)

  const conflictFilters: SQL[] = [
    or(
      eq(shopBindingConflicts.challengerShopId, row.shopId),
      and(
        eq(shopBindingConflicts.platform, row.platform),
        row.externalShopId
          ? eq(shopBindingConflicts.externalShopId, row.externalShopId)
          : eq(shopBindingConflicts.challengerShopId, row.shopId),
      ),
    )!,
  ]
  const [conflict] = await db
    .select({
      id: shopBindingConflicts.id,
      status: shopBindingConflicts.status,
      occupantOrganizationId: shopBindingConflicts.occupantOrganizationId,
      appealDeadlineAt: shopBindingConflicts.appealDeadlineAt,
    })
    .from(shopBindingConflicts)
    .where(and(...conflictFilters))
    .orderBy(desc(shopBindingConflicts.updatedAt))
    .limit(1)

  let occupantOrganizationName: string | null = null
  if (conflict) {
    const [org] = await db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, conflict.occupantOrganizationId))
      .limit(1)
    occupantOrganizationName = org?.name ?? null
  }

  return {
    id: row.id,
    createdAt: row.createdAt,
    action: row.action,
    errorCode: classified.code,
    reason: classified.reason,
    advice: classified.advice,
    message: sanitizeOAuthText(row.message),
    payloadSummary: redactOAuthPayload(row.payloadSummary),
    organization: {
      id: row.organizationId,
      name: row.organizationName,
      status: row.organizationStatus,
    },
    shop: {
      id: row.shopId,
      name: row.shopName,
      status: row.shopStatus,
      platform: row.platform,
      externalShopId: row.externalShopId,
      health: row.health,
      lastError: sanitizeOAuthText(row.stateLastError ?? metaLastError),
      authExpiresAt: row.authExpiresAt,
      hasCredential: Boolean(cred),
    },
    conflict: conflict
      ? {
          id: conflict.id,
          status: conflict.status,
          occupantOrganizationName,
          appealDeadlineAt: conflict.appealDeadlineAt,
        }
      : null,
  }
}

export async function getPendingAction(id: string) {
  const [row] = await db
    .select({
      action: pendingActions,
      organizationName: organization.name,
      shopName: shops.name,
    })
    .from(pendingActions)
    .innerJoin(organization, eq(organization.id, pendingActions.organizationId))
    .leftJoin(shops, eq(shops.id, pendingActions.shopId))
    .where(eq(pendingActions.id, id))
    .limit(1)
  if (!row) return null

  const actors = await resolveActorNames([row.action.createdBy, row.action.confirmedBy])
  return {
    id: row.action.id,
    organizationId: row.action.organizationId,
    organizationName: row.organizationName,
    shopId: row.action.shopId,
    shopName: row.shopName,
    kind: row.action.kind,
    title: row.action.title,
    status: row.action.status,
    createdAt: row.action.createdAt,
    updatedAt: row.action.updatedAt,
    expiresAt: row.action.expiresAt,
    createdBy: actors.get(row.action.createdBy) ?? (row.action.createdBy
      ? { id: row.action.createdBy, name: row.action.createdBy, email: null }
      : null),
    confirmedBy: row.action.confirmedBy
      ? actors.get(row.action.confirmedBy) ?? {
          id: row.action.confirmedBy,
          name: row.action.confirmedBy,
          email: null,
        }
      : null,
    confirmedAt: row.action.confirmedAt,
    executedAt: row.action.executedAt,
    attemptCount: row.action.attemptCount,
    nextRetryAt: row.action.nextRetryAt,
    payload: redactSensitiveValue(row.action.payload),
    fieldDiff: redactSensitiveValue(row.action.fieldDiff),
    platformRequestId: row.action.platformRequestId,
    platformResponse: redactSensitiveValue(row.action.platformResponse),
    lastErrorCode: row.action.lastErrorCode,
    lastErrorMessage: sanitizeOAuthText(row.action.lastErrorMessage),
    error: sanitizeOAuthText(row.action.error),
    idempotencyKey: row.action.idempotencyKey,
  }
}
