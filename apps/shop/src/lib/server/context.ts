import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  LAST_ORGANIZATION_COOKIE,
  readCookieFromHeader,
} from '@/lib/organization/constants'
import {
  listUserOrganizations,
  type UserOrganizationDto,
} from '@/lib/server/dataaccess/organization-context'

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

export type ResolvedOrganizationContext = {
  organizationId: string | null
  organizationRole: string | null
  memberships: UserOrganizationDto[]
}

/**
 * 解析租户组织与角色：session.activeOrganizationId → 最近使用组织 → 唯一 membership。
 * 多组织且没有有效 active/last-used 时返回 null，由页面引导到 /select-org，不再静默选第一个。
 */
export async function resolveOrganizationContext(input: {
  userId: string | null
  activeOrganizationId: string | null
  lastOrganizationId?: string | null
}): Promise<ResolvedOrganizationContext> {
  if (input.userId) {
    const memberships = await listUserOrganizations(
      db,
      input.userId,
      input.activeOrganizationId,
    )
    const active = input.activeOrganizationId
      ? memberships.find((row) => row.organizationId === input.activeOrganizationId)
      : undefined
    if (active) {
      return {
        organizationId: active.organizationId,
        organizationRole: active.role,
        memberships,
      }
    }
    const last = input.lastOrganizationId
      ? memberships.find((row) => row.organizationId === input.lastOrganizationId)
      : undefined
    if (last) {
      return {
        organizationId: last.organizationId,
        organizationRole: last.role,
        memberships,
      }
    }
    if (memberships.length === 1 && memberships[0]) {
      return {
        organizationId: memberships[0].organizationId,
        organizationRole: memberships[0].role,
        memberships,
      }
    }
    return { organizationId: null, organizationRole: null, memberships }
  }
  const devOrg = process.env.SHOP_DEV_ORGANIZATION_ID?.trim()
  if (devOrg) {
    return { organizationId: devOrg, organizationRole: 'owner', memberships: [] }
  }
  return { organizationId: null, organizationRole: null, memberships: [] }
}

export async function resolveOrganizationId(input: {
  userId: string | null
  activeOrganizationId: string | null
  lastOrganizationId?: string | null
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
  const lastOrganizationId = readCookieFromHeader(
    req.headers.get('cookie'),
    LAST_ORGANIZATION_COOKIE,
  )
  const { organizationId, organizationRole } = await resolveOrganizationContext({
    userId: user?.id ?? null,
    activeOrganizationId,
    lastOrganizationId,
  })

  return { user, organizationId, organizationRole, headers: req.headers, db }
}

export type { createContextFromRequest as CreateContext }
