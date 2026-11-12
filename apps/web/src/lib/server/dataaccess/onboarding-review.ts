import {
  and,
  count,
  desc,
  eq,
  ilike,
  isNull,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import {
  auditEvents,
  consoleNotifications,
  integrationStates,
  organization,
  shops,
  tenantOnboardingApplications,
  type OnboardingStatus,
} from '@workspace/db'
import { initializeOrganizationCatalogs } from '@workspace/db/platform-catalogs'
import { db } from '@/lib/db'
import { pageValues } from '@/lib/server/dataaccess/pagination'
import { resolveActorNames } from '@/lib/server/dataaccess/platform-details'
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
  const actors = await resolveActorNames([
    row.application.applicantUserId,
    row.application.reviewedBy,
  ])
  return {
    ...row,
    applicant: actors.get(row.application.applicantUserId) ?? null,
    reviewer: row.application.reviewedBy
      ? actors.get(row.application.reviewedBy) ?? null
      : null,
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

    const catalogs = input.approve
      ? await initializeOrganizationCatalogs(tx, application.organizationId)
      : {
          platformBasics: 0,
          dictionaries: 0,
          categories: 0,
          carriers: 0,
          importTemplates: 0,
          hsTariffs: 0,
          feeTemplates: 0,
          organizationSettings: 0,
        }

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
        platformBasicsInitialized: catalogs.platformBasics,
        dictionariesInitialized: catalogs.dictionaries,
        categoriesInitialized: catalogs.categories,
        carriersInitialized: catalogs.carriers,
        importTemplatesInitialized: catalogs.importTemplates,
        hsTariffsInitialized: catalogs.hsTariffs,
        feeTemplatesInitialized: catalogs.feeTemplates,
        organizationSettingsInitialized: catalogs.organizationSettings,
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
