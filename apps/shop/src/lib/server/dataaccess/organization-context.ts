/**
 * 多组织上下文：列出当前用户可进入的租户组织，并给出每个组织的入驻状态。
 * activeOrganizationId 只接受属于当前用户的组织，缺失/失效时由上层引导到 /select-org。
 */
import { and, desc, eq } from 'drizzle-orm'
import { isOwnerIdentity } from '@workspace/auth'
import { member, organization, tenantOnboardingApplications } from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import { formatStamp } from '@/lib/server/mappers/ops-master'

export type UserOrganizationDto = {
  organizationId: string
  name: string
  slug: string | null
  logo: string | null
  role: string
  isOwner: boolean
  organizationStatus: string
  entryApproved: boolean
  onboardingStatus: string
  createdAt: string
  isActive: boolean
}

function isOnboardingStatus(value: string | null | undefined): string {
  return value || 'not_started'
}

export async function listUserOrganizations(
  db: AppDatabase,
  userId: string,
  activeOrganizationId: string | null,
): Promise<UserOrganizationDto[]> {
  const rows = await db
    .select({
      organizationId: organization.id,
      name: organization.name,
      slug: organization.slug,
      logo: organization.logo,
      role: member.role,
      organizationStatus: organization.status,
      entryApproved: organization.entryApproved,
      onboardingStatus: tenantOnboardingApplications.status,
      createdAt: organization.createdAt,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .leftJoin(
      tenantOnboardingApplications,
      eq(tenantOnboardingApplications.organizationId, organization.id),
    )
    .where(and(eq(member.userId, userId), eq(organization.orgType, 'tenant')))
    .orderBy(desc(organization.createdAt))

  return rows.map((row) => ({
    organizationId: row.organizationId,
    name: row.name,
    slug: row.slug,
    logo: row.logo,
    role: row.role,
    isOwner: isOwnerIdentity(row.role),
    organizationStatus: row.organizationStatus,
    entryApproved: row.entryApproved,
    onboardingStatus: isOnboardingStatus(row.onboardingStatus),
    createdAt: formatStamp(row.createdAt),
    isActive: row.organizationId === activeOrganizationId,
  }))
}

export async function getUserOrganization(
  db: AppDatabase,
  userId: string,
  organizationId: string,
): Promise<UserOrganizationDto | null> {
  const rows = await listUserOrganizations(db, userId, organizationId)
  return rows.find((row) => row.organizationId === organizationId) ?? null
}
