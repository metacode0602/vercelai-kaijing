import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { member } from '@workspace/db/schema'
import { eq } from 'drizzle-orm'

export type SessionUser = {
  id: string
  name?: string | null
  email?: string | null
}

export type TRPCContext = {
  user: SessionUser | null
  organizationId: string | null
  db: typeof db
}

function pickActiveOrganizationId(session: unknown): string | null {
  const s = session as {
    session?: { activeOrganizationId?: string | null }
    user?: { activeOrganizationId?: string | null }
  } | null
  return s?.session?.activeOrganizationId ?? s?.user?.activeOrganizationId ?? null
}

async function resolveMembershipOrgId(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId))
    .limit(1)
  return row?.organizationId ?? null
}

/**
 * 解析租户组织：session.activeOrganizationId → 用户 membership → 开发兜底 SHOP_DEV_ORGANIZATION_ID。
 */
export async function resolveOrganizationId(input: {
  userId: string | null
  activeOrganizationId: string | null
}): Promise<string | null> {
  if (input.activeOrganizationId) return input.activeOrganizationId
  if (input.userId) {
    const fromMember = await resolveMembershipOrgId(input.userId)
    if (fromMember) return fromMember
  }
  const devOrg = process.env.SHOP_DEV_ORGANIZATION_ID?.trim()
  if (devOrg) return devOrg
  return null
}

export async function createContextFromRequest(req: Request): Promise<TRPCContext> {
  const authSession = await auth.api.getSession({ headers: req.headers })
  const sessionUser = authSession?.user as
    | { id: string; name?: string | null; email?: string | null }
    | undefined

  const user = sessionUser
    ? { id: sessionUser.id, name: sessionUser.name, email: sessionUser.email }
    : null

  const activeOrganizationId = pickActiveOrganizationId(authSession)
  const organizationId = await resolveOrganizationId({
    userId: user?.id ?? null,
    activeOrganizationId,
  })

  return { user, organizationId, db }
}

export type { createContextFromRequest as CreateContext }
