import {
  and,
  count,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import {
  auditEvents,
  consoleNotifications,
  integrationCredentials,
  integrationStates,
  organization,
  shops,
  tenantOnboardingApplications,
  type OnboardingStatus,
} from '@workspace/db'
import { db } from '@/lib/db'
import { signOnboardingFileUrl } from '@/lib/server/onboarding-file'

export type ReviewListItem = {
  id: string
  organizationId: string
  organizationName: string
  organizationSlug: string | null
  subjectType: string
  companyName: string
  registrationNo: string | null
  countryCode: string
  contactName: string
  contactPhone: string
  status: string
  version: number
  submittedAt: Date | null
  reviewedAt: Date | null
  reviewNote: string | null
}

function pageValues(page?: number, pageSize?: number) {
  const normalizedPage = Math.max(1, Math.trunc(page ?? 1))
  const normalizedSize = Math.min(100, Math.max(1, Math.trunc(pageSize ?? 20)))
  return { page: normalizedPage, pageSize: normalizedSize }
}

export async function listOnboardingReviews(input: {
  page?: number
  pageSize?: number
  status?: string
  countryCode?: string
  q?: string
}) {
  const { page, pageSize } = pageValues(input.page, input.pageSize)
  const filters: SQL[] = []
  if (input.status && input.status !== 'all') {
    filters.push(eq(tenantOnboardingApplications.status, input.status))
  }
  if (input.countryCode && input.countryCode !== 'all') {
    filters.push(eq(tenantOnboardingApplications.countryCode, input.countryCode))
  }
  if (input.q?.trim()) {
    const value = `%${input.q.trim()}%`
    filters.push(
      or(
        ilike(organization.name, value),
        ilike(tenantOnboardingApplications.companyName, value),
        ilike(tenantOnboardingApplications.registrationNo, value),
        ilike(tenantOnboardingApplications.contactName, value),
      )!,
    )
  }
  const where = filters.length ? and(...filters) : undefined

  const totalRows = await db
    .select({ total: count() })
    .from(tenantOnboardingApplications)
    .innerJoin(
      organization,
      eq(organization.id, tenantOnboardingApplications.organizationId),
    )
    .where(where)
  const total = Number(totalRows[0]?.total ?? 0)

  const items = await db
    .select({
      id: tenantOnboardingApplications.id,
      organizationId: tenantOnboardingApplications.organizationId,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      subjectType: tenantOnboardingApplications.subjectType,
      companyName: tenantOnboardingApplications.companyName,
      registrationNo: tenantOnboardingApplications.registrationNo,
      countryCode: tenantOnboardingApplications.countryCode,
      contactName: tenantOnboardingApplications.contactName,
      contactPhone: tenantOnboardingApplications.contactPhone,
      status: tenantOnboardingApplications.status,
      version: tenantOnboardingApplications.version,
      submittedAt: tenantOnboardingApplications.submittedAt,
      reviewedAt: tenantOnboardingApplications.reviewedAt,
      reviewNote: tenantOnboardingApplications.reviewNote,
    })
    .from(tenantOnboardingApplications)
    .innerJoin(
      organization,
      eq(organization.id, tenantOnboardingApplications.organizationId),
    )
    .where(where)
    .orderBy(desc(tenantOnboardingApplications.submittedAt), desc(tenantOnboardingApplications.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return { items, total, page, pageSize }
}

export async function getOnboardingReview(id: string) {
  const [row] = await db
    .select({
      application: tenantOnboardingApplications,
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        entryApproved: organization.entryApproved,
        identityStatus: organization.identityStatus,
        merchantStatus: organization.merchantStatus,
      },
    })
    .from(tenantOnboardingApplications)
    .innerJoin(
      organization,
      eq(organization.id, tenantOnboardingApplications.organizationId),
    )
    .where(eq(tenantOnboardingApplications.id, id))
    .limit(1)
  if (!row) return null
  const reviewShops = await db
    .select({
      id: shops.id,
      name: shops.name,
      platform: shops.platform,
      region: shops.marketplaceCountry,
      status: shops.status,
      externalShopId: shops.externalShopId,
      health: integrationStates.health,
      authExpiresAt: shops.authExpiresAt,
    })
    .from(shops)
    .leftJoin(integrationStates, eq(integrationStates.shopId, shops.id))
    .where(
      and(
        eq(shops.organizationId, row.application.organizationId),
        isNull(shops.deletedAt),
      ),
    )
    .orderBy(desc(shops.createdAt))
    .limit(50)
  return {
    ...row,
    shops: reviewShops,
    files: {
      license: signOnboardingFileUrl(
        row.application.licenseFileKey,
        row.application.licenseFileName,
      ),
      legalRepFront: signOnboardingFileUrl(row.application.legalRepIdFrontKey),
      legalRepBack: signOnboardingFileUrl(row.application.legalRepIdBackKey),
      authorization: signOnboardingFileUrl(row.application.authorizationFileKey),
      agentFront: signOnboardingFileUrl(row.application.agentIdFrontKey),
      agentBack: signOnboardingFileUrl(row.application.agentIdBackKey),
    },
  }
}

export async function getOnboardingReviewStats(): Promise<{
  pending: number
  approvedToday: number
  rejectedToday: number
  countries: string[]
}> {
  const dayStart = new Date()
  dayStart.setUTCHours(0, 0, 0, 0)
  const [statRows, countryRows] = await Promise.all([
    db
      .select({
        pending: sql<number>`count(*) filter (where ${tenantOnboardingApplications.status} = 'submitted')`,
        approvedToday: sql<number>`count(*) filter (where ${tenantOnboardingApplications.status} = 'approved' and ${tenantOnboardingApplications.reviewedAt} >= ${dayStart})`,
        rejectedToday: sql<number>`count(*) filter (where ${tenantOnboardingApplications.status} = 'rejected' and ${tenantOnboardingApplications.reviewedAt} >= ${dayStart})`,
      })
      .from(tenantOnboardingApplications),
    db
      .selectDistinct({ countryCode: tenantOnboardingApplications.countryCode })
      .from(tenantOnboardingApplications)
      .orderBy(tenantOnboardingApplications.countryCode),
  ])
  return {
    pending: Number(statRows[0]?.pending ?? 0),
    approvedToday: Number(statRows[0]?.approvedToday ?? 0),
    rejectedToday: Number(statRows[0]?.rejectedToday ?? 0),
    countries: countryRows.map((row) => row.countryCode),
  }
}

async function reviewApplication(input: {
  id: string
  reviewerId: string
  note?: string
  approve: boolean
}) {
  return db.transaction(async (tx) => {
    const [application] = await tx
      .select()
      .from(tenantOnboardingApplications)
      .where(eq(tenantOnboardingApplications.id, input.id))
      .limit(1)
    if (!application) throw new Error('入驻申请不存在')
    if (application.status !== 'submitted') {
      throw new Error('仅待审核申请可通过或驳回')
    }
    const nextStatus: OnboardingStatus = input.approve ? 'approved' : 'rejected'
    const now = new Date()
    await tx
      .update(tenantOnboardingApplications)
      .set({
        status: nextStatus,
        reviewedAt: now,
        reviewedBy: input.reviewerId,
        reviewNote: input.note?.trim() || null,
        updatedAt: now,
      })
      .where(eq(tenantOnboardingApplications.id, application.id))

    await tx
      .update(organization)
      .set(
        input.approve
          ? {
              entryApproved: true,
              identityStatus:
                application.subjectType === 'individual'
                  ? 'individual_verified'
                  : 'enterprise_verified',
              enterpriseVerificationStatus: 'verified',
              merchantStatus: 'approved',
            }
          : {
              entryApproved: false,
              identityStatus: 'rejected',
              enterpriseVerificationStatus: 'rejected',
              merchantStatus: 'rejected',
            },
      )
      .where(eq(organization.id, application.organizationId))

    await tx.insert(auditEvents).values({
      organizationId: application.organizationId,
      actorUserId: input.reviewerId,
      action: input.approve ? 'onboarding.approve' : 'onboarding.reject',
      entityType: 'tenant_onboarding_application',
      entityId: application.id,
      before: { status: application.status, version: application.version },
      after: {
        status: nextStatus,
        version: application.version,
        reviewNote: input.note?.trim() || null,
      },
      result: 'success',
    })

    await tx.insert(consoleNotifications).values({
      organizationId: application.organizationId,
      category: 'system',
      title: input.approve ? '入驻审核已通过' : '入驻审核被驳回',
      summary: input.approve
        ? '资料审核通过，现在可以新增并授权店铺。'
        : input.note?.trim() || '请修改入驻资料后重新提交。',
      body: input.note?.trim() || '',
      href: input.approve ? '/onboarding/status' : '/onboarding',
      sourceType: 'onboarding_review',
      sourceId: application.id,
    })

    return {
      status: nextStatus,
      contactEmail: application.contactEmail,
      companyName: application.companyName,
    }
  })
}

export function approveOnboarding(input: {
  id: string
  reviewerId: string
  note?: string
}) {
  return reviewApplication({ ...input, approve: true })
}

export function rejectOnboarding(input: {
  id: string
  reviewerId: string
  note: string
}) {
  return reviewApplication({ ...input, approve: false })
}

export async function listShopConflicts() {
  const candidates = await db
    .select({
      shop: shops,
      organizationName: organization.name,
    })
    .from(shops)
    .innerJoin(organization, eq(organization.id, shops.organizationId))
    .where(
      and(
        eq(shops.status, 'error'),
        isNotNull(shops.externalShopId),
        isNull(shops.deletedAt),
      ),
    )
    .orderBy(desc(shops.updatedAt))
    .limit(100)

  const result = []
  for (const candidate of candidates) {
    const [other] = await db
      .select({
        shopId: shops.id,
        organizationId: shops.organizationId,
        organizationName: organization.name,
      })
      .from(shops)
      .innerJoin(organization, eq(organization.id, shops.organizationId))
      .where(
        and(
          eq(shops.platform, candidate.shop.platform),
          eq(shops.externalShopId, candidate.shop.externalShopId!),
          ne(shops.organizationId, candidate.shop.organizationId),
          isNull(shops.deletedAt),
        ),
      )
      .limit(1)
    if (other) {
      result.push({
        shopId: candidate.shop.id,
        shopName: candidate.shop.name,
        platform: candidate.shop.platform,
        externalShopId: candidate.shop.externalShopId,
        organizationId: candidate.shop.organizationId,
        organizationName: candidate.organizationName,
        otherShopId: other.shopId,
        otherOrganizationId: other.organizationId,
        otherOrganizationName: other.organizationName,
        lastError:
          candidate.shop.meta && typeof candidate.shop.meta === 'object'
            ? ((candidate.shop.meta as Record<string, unknown>).lastError as
                | string
                | undefined) ?? null
            : null,
      })
    }
  }
  return result
}

export async function resolveShopConflict(input: {
  shopId: string
  action: 'disable' | 'reassign'
  targetOrganizationId?: string
  reviewerId: string
}) {
  return db.transaction(async (tx) => {
    const [shop] = await tx
      .select()
      .from(shops)
      .where(and(eq(shops.id, input.shopId), isNull(shops.deletedAt)))
      .limit(1)
    if (!shop) throw new Error('店铺不存在')

    if (input.action === 'disable') {
      await tx
        .update(shops)
        .set({
          status: 'disabled',
          deletedAt: new Date(),
          meta: {
            ...(shop.meta ?? {}),
            syncPaused: true,
            conflictResolvedBy: input.reviewerId,
          },
          updatedAt: new Date(),
        })
        .where(eq(shops.id, shop.id))
    } else {
      const target = input.targetOrganizationId?.trim()
      if (!target) throw new Error('请选择目标租户')
      const [org] = await tx
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.id, target))
        .limit(1)
      if (!org) throw new Error('目标租户不存在')
      const [duplicate] = await tx
        .select({ id: shops.id })
        .from(shops)
        .where(
          and(
            eq(shops.organizationId, target),
            eq(shops.platform, shop.platform),
            eq(shops.externalShopId, shop.externalShopId!),
            isNull(shops.deletedAt),
          ),
        )
        .limit(1)
      if (duplicate) throw new Error('目标租户已存在相同平台店铺')

      await tx
        .update(shops)
        .set({
          organizationId: target,
          status: 'draft',
          meta: {
            ...(shop.meta ?? {}),
            syncPaused: true,
            lastError: '平台运营已重新分配店铺，请重新授权',
            conflictResolvedBy: input.reviewerId,
          },
          updatedAt: new Date(),
        })
        .where(eq(shops.id, shop.id))
      await tx
        .update(integrationCredentials)
        .set({ organizationId: target })
        .where(eq(integrationCredentials.shopId, shop.id))
    }

    await tx.insert(auditEvents).values({
      organizationId: input.action === 'reassign' && input.targetOrganizationId
        ? input.targetOrganizationId
        : shop.organizationId,
      actorUserId: input.reviewerId,
      action: `shop.conflict.${input.action}`,
      entityType: 'shop',
      entityId: shop.id,
      before: {
        organizationId: shop.organizationId,
        status: shop.status,
      },
      after: {
        organizationId:
          input.action === 'reassign' ? input.targetOrganizationId : shop.organizationId,
        status: input.action === 'reassign' ? 'draft' : 'disabled',
      },
      result: 'success',
    })
    return { ok: true as const }
  })
}

export async function disableTenant(input: {
  organizationId: string
  reviewerId: string
}) {
  return db.transaction(async (tx) => {
    const [org] = await tx
      .select({
        id: organization.id,
        name: organization.name,
        entryApproved: organization.entryApproved,
      })
      .from(organization)
      .where(eq(organization.id, input.organizationId))
      .limit(1)
    if (!org) throw new Error('租户不存在')
    const now = new Date()
    await tx
      .update(organization)
      .set({ status: 'disabled', entryApproved: false })
      .where(eq(organization.id, org.id))
    const orgShops = await tx
      .select({ id: shops.id })
      .from(shops)
      .where(and(eq(shops.organizationId, org.id), isNull(shops.deletedAt)))
    for (const shop of orgShops) {
      await tx
        .update(shops)
        .set({
          status: 'disabled',
          meta: sql`coalesce(${shops.meta}, '{}'::jsonb) || '{"syncPaused":true}'::jsonb`,
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
    }
    await tx.insert(auditEvents).values({
      organizationId: org.id,
      actorUserId: input.reviewerId,
      action: 'tenant.disable',
      entityType: 'organization',
      entityId: org.id,
      before: { status: 'active', entryApproved: org.entryApproved },
      after: { status: 'disabled', entryApproved: false, shops: orgShops.length },
      result: 'success',
    })
    return { ok: true as const, shops: orgShops.length }
  })
}

export async function listTenants(input: {
  page?: number
  pageSize?: number
  q?: string
}) {
  const { page, pageSize } = pageValues(input.page, input.pageSize)
  const where = input.q?.trim()
    ? or(
        ilike(organization.name, `%${input.q.trim()}%`),
        ilike(organization.slug, `%${input.q.trim()}%`),
      )
    : undefined
  const totalRows = await db
    .select({ total: count() })
    .from(organization)
    .where(and(where, eq(organization.orgType, 'tenant')))
  const total = Number(totalRows[0]?.total ?? 0)
  const items = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      status: organization.status,
      entryApproved: organization.entryApproved,
      identityStatus: organization.identityStatus,
      createdAt: organization.createdAt,
      shopCount: sql<number>`(select count(*) from ${shops} where ${shops.organizationId} = ${organization.id} and ${shops.deletedAt} is null)`,
      pendingCount: sql<number>`(select count(*) from ${tenantOnboardingApplications} where ${tenantOnboardingApplications.organizationId} = ${organization.id} and ${tenantOnboardingApplications.status} = 'submitted')`,
    })
    .from(organization)
    .where(and(where, eq(organization.orgType, 'tenant')))
    .orderBy(desc(organization.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  return { items, total, page, pageSize }
}
