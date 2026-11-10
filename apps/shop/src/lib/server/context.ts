import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { member, organization } from '@workspace/db/schema'
import { and, eq } from 'drizzle-orm'

export type SessionUser = {
  id: string
  name?: string | null
  email?: string | null
}

export type TRPCContext = {
  user: SessionUser | null
  organizationId: string | null
  organizationRole: string | null
  headers: Headers
  db: typeof db
}

function pickActiveOrganizationId(session: unknown): string | null {
  const s = session as {
    session?: { activeOrganizationId?: string | null }
    user?: { activeOrganizationId?: string | null }
  } | null
  return s?.session?.activeOrganizationId ?? s?.user?.activeOrganizationId ?? null
}

type MembershipRow = {
  organizationId: string
  role: string
}

async function listTenantMemberships(userId: string): Promise<MembershipRow[]> {
  return db
    .select({ organizationId: member.organizationId, role: member.role })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(and(eq(member.userId, userId), eq(organization.orgType, 'tenant')))
}

/**
 * 解析租户组织与角色：session.activeOrganizationId → 用户 membership → 开发兜底。
 * 只有 activeOrganizationId 确实属于该用户时才采用，避免伪造 active org 越权。
 */
export async function resolveOrganizationContext(input: {
  userId: string | null
  activeOrganizationId: string | null
}): Promise<{ organizationId: string | null; organizationRole: string | null }> {
  if (input.userId) {
    const memberships = await listTenantMemberships(input.userId)
    if (input.activeOrganizationId) {
      const active = memberships.find(
        (row) => row.organizationId === input.activeOrganizationId,
      )
      if (active) {
        return { organizationId: active.organizationId, organizationRole: active.role }
      }
    }
    if (memberships[0]) {
      return {
        organizationId: memberships[0].organizationId,
        organizationRole: memberships[0].role,
      }
    }
  }
  if (!input.userId) {
    const devOrg = process.env.SHOP_DEV_ORGANIZATION_ID?.trim()
    if (devOrg) return { organizationId: devOrg, organizationRole: 'owner' }
  }
  return { organizationId: null, organizationRole: null }
}

export async function resolveOrganizationId(input: {
  userId: string | null
  activeOrganizationId: string | null
}): Promise<string | null> {
  const context = await resolveOrganizationContext(input)
  return context.organizationId
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
  const { organizationId, organizationRole } = await resolveOrganizationContext({
    userId: user?.id ?? null,
    activeOrganizationId,
  })

  return { user, organizationId, organizationRole, headers: req.headers, db }
}

export type { createContextFromRequest as CreateContext }
