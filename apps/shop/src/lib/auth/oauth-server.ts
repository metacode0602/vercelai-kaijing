import { eq } from 'drizzle-orm'
import { member } from '@workspace/db'
import { db } from '@/lib/db'
import { LAST_ORGANIZATION_COOKIE, readCookieFromHeader } from '@/lib/organization/constants'
import { listUserOrganizations } from '@/lib/server/dataaccess/organization-context'
import { loadAccessSnapshot } from '@/lib/server/dataaccess/roles'
import type { ShopOAuthSession } from '@workspace/auth/oauth'

export function resolveMcpResourceUrl(): string {
  const explicit = process.env.OPENSHOP_MCP_RESOURCE?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  const apiBase = (
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    (process.env.NODE_ENV === 'production' ? 'https://api.rungpu.cn' : 'http://localhost:8080')
  ).replace(/\/$/, '')
  return `${apiBase}/mcp`
}

export function isOpenshopMcpEnabled(): boolean {
  const value = process.env.OPENSHOP_MCP_ENABLED?.trim().toLowerCase()
  return value === 'true' || value === '1'
}

export async function listOrganizationIdsForUser(userId: string): Promise<string[]> {
  const rows = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId))
  return rows.map((row) => row.organizationId)
}

export async function canManageOAuthClients(input: {
  user?: { id?: string } | null
  session?: ShopOAuthSession | null
  headers?: Headers
}): Promise<boolean> {
  const userId = input.user?.id ?? input.session?.userId
  if (!userId) return false
  const activeOrganizationId = input.session?.activeOrganizationId ?? null
  const lastOrganizationId = readCookieFromHeader(
    input.headers?.get('cookie'),
    LAST_ORGANIZATION_COOKIE,
  )
  const memberships = await listUserOrganizations(db, userId, activeOrganizationId)
  const target =
    (activeOrganizationId
      ? memberships.find((row) => row.organizationId === activeOrganizationId)
      : undefined) ??
    (lastOrganizationId
      ? memberships.find((row) => row.organizationId === lastOrganizationId)
      : undefined) ??
    (memberships.length === 1 ? memberships[0] : undefined)
  if (!target) return false
  const access = await loadAccessSnapshot(db, target.organizationId, {
    userId,
    organizationRole: target.role,
  })
  return access.isOwner || access.permissionSet.has('settings.configure')
}
