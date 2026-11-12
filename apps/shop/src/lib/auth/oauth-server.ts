import { eq } from 'drizzle-orm'
import { member } from '@workspace/db'
import { db } from '@/lib/db'
import { loadAccessSnapshot } from '@/lib/server/dataaccess/roles'
import type { ShopOAuthSession } from '@workspace/auth/oauth'

export function resolveMcpResourceUrl(): string {
  const explicit = process.env.OPENSHOP_MCP_RESOURCE?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  const apiBase = (
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    'http://localhost:8080'
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
}): Promise<boolean> {
  const userId = input.user?.id ?? input.session?.userId
  const organizationId = input.session?.activeOrganizationId
  if (!userId || !organizationId) return false
  const access = await loadAccessSnapshot(db, organizationId, {
    userId,
    organizationRole: null,
  })
  return access.isOwner || access.permissionSet.has('settings.configure')
}
