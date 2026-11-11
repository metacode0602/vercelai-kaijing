/**
 * 设置 · 企业信息：当前入驻租户企业的详细档案。
 * 聚合 organization 主记录 + 入驻申请（tenant_onboarding_applications）+ 成员统计。名称可更新；入驻认证档案只读。
 */
import { count, eq } from 'drizzle-orm'
import { member, organization, tenantOnboardingApplications } from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import { formatStamp } from '@/lib/server/mappers/ops-master'

export type OrganizationApplicationDto = {
  subjectType: string
  companyName: string
  registrationNo: string | null
  countryCode: string
  handlerType: string | null
  legalRepresentative: string | null
  legalRepIdNo: string | null
  agentName: string | null
  agentIdNo: string | null
  contactName: string
  contactPhone: string
  contactEmail: string | null
  licenseFileKey: string | null
  licenseFileName: string | null
  status: string
  version: number
  submittedAt: string
  reviewedAt: string
  reviewNote: string | null
}

export type OrganizationProfileDto = {
  id: string
  name: string
  slug: string | null
  logo: string | null
  orgType: string
  status: string
  entryApproved: boolean
  identityStatus: string
  enterpriseVerificationStatus: string
  merchantStatus: string | null
  merchantTier: string | null
  createdAt: string
  memberCount: number
  application: OrganizationApplicationDto | null
}

export async function getOrganizationProfile(
  db: AppDatabase,
  organizationId: string,
): Promise<OrganizationProfileDto | null> {
  const [org] = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      logo: organization.logo,
      orgType: organization.orgType,
      status: organization.status,
      entryApproved: organization.entryApproved,
      identityStatus: organization.identityStatus,
      enterpriseVerificationStatus: organization.enterpriseVerificationStatus,
      merchantStatus: organization.merchantStatus,
      merchantTier: organization.merchantTier,
      createdAt: organization.createdAt,
    })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1)
  if (!org) return null

  const [memberCountRow] = await db
    .select({ value: count() })
    .from(member)
    .where(eq(member.organizationId, organizationId))

  const [app] = await db
    .select()
    .from(tenantOnboardingApplications)
    .where(eq(tenantOnboardingApplications.organizationId, organizationId))
    .limit(1)

  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    logo: org.logo,
    orgType: org.orgType,
    status: org.status,
    entryApproved: org.entryApproved,
    identityStatus: org.identityStatus,
    enterpriseVerificationStatus: org.enterpriseVerificationStatus,
    merchantStatus: org.merchantStatus,
    merchantTier: org.merchantTier,
    createdAt: formatStamp(org.createdAt),
    memberCount: Number(memberCountRow?.value ?? 0),
    application: app
      ? {
          subjectType: app.subjectType,
          companyName: app.companyName,
          registrationNo: app.registrationNo,
          countryCode: app.countryCode,
          handlerType: app.handlerType,
          legalRepresentative: app.legalRepresentative,
          legalRepIdNo: app.legalRepIdNo,
          agentName: app.agentName,
          agentIdNo: app.agentIdNo,
          contactName: app.contactName,
          contactPhone: app.contactPhone,
          contactEmail: app.contactEmail,
          licenseFileKey: app.licenseFileKey,
          licenseFileName: app.licenseFileName,
          status: app.status,
          version: app.version,
          submittedAt: formatStamp(app.submittedAt),
          reviewedAt: formatStamp(app.reviewedAt),
          reviewNote: app.reviewNote,
        }
      : null,
  }
}

export async function updateOrganizationProfile(
  db: AppDatabase,
  organizationId: string,
  input: { name: string },
): Promise<OrganizationProfileDto> {
  const name = input.name.trim()
  if (!name) throw new Error('组织名称不能为空')
  if (name.length > 120) throw new Error('组织名称不能超过 120 个字符')
  const current = await getOrganizationProfile(db, organizationId)
  if (!current) throw new Error('当前组织不存在或已被删除')
  await db
    .update(organization)
    .set({ name })
    .where(eq(organization.id, organizationId))
  const next = await getOrganizationProfile(db, organizationId)
  if (!next) throw new Error('更新组织信息失败')
  return next
}

