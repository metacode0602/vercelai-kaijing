import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { organization } from '@workspace/db/schema'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

export type IdentityStatus =
  | 'unverified'
  | 'pending'
  | 'individual_verified'
  | 'enterprise_verified'
  | 'rejected'

export async function getOrgIdentityStatus(): Promise<IdentityStatus | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  const orgId = session?.session.activeOrganizationId
  if (!orgId) return null

  const [org] = await db
    .select({ identityStatus: organization.identityStatus })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1)

  return (org?.identityStatus as IdentityStatus) ?? null
}

/** 充值/下单 Guard：个人或企业实名通过即可 */
export async function isOrgVerified(): Promise<boolean> {
  const status = await getOrgIdentityStatus()
  return status === 'individual_verified' || status === 'enterprise_verified'
}
