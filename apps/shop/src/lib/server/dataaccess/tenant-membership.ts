import { selectRealmOrganization } from '@workspace/auth'
import { member, organization } from '@workspace/db/schema'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'

export async function findTenantMembership(
  userId: string,
  preferredOrganizationId?: string | null
) {
  const rows = await db
    .select({
      memberId: member.id,
      organizationId: member.organizationId,
      role: member.role,
      organization,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, userId))
    .orderBy(asc(organization.createdAt), asc(member.createdAt))

  return selectRealmOrganization(rows, 'gpus', preferredOrganizationId)
}
