/**
 * better-auth member + users（模块15）。
 * 列表读真实组织成员；邀请走 invitation 表（不发真实邮件，仅落库待确认）。
 */
import { and, desc, eq, ilike, or } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { invitation, member, user } from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import { formatStamp } from '@/lib/server/mappers/ops-master'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

export type MemberDto = {
  id: string
  userId: string
  name: string
  email: string
  role: string
  status: '启用' | '停用'
  createdAt: string
  source: 'member' | 'invitation'
}

export async function listMembers(db: AppDatabase, organizationId: string, q?: string): Promise<MemberDto[]> {
  const rows = await db
    .select({
      id: member.id,
      userId: member.userId,
      role: member.role,
      createdAt: member.createdAt,
      name: user.name,
      email: user.email,
      banned: user.banned,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, organizationId))
    .orderBy(desc(member.createdAt))

  let items: MemberDto[] = rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    name: r.name || r.email,
    email: r.email,
    role: r.role || 'member',
    status: r.banned ? '停用' : '启用',
    createdAt: formatStamp(r.createdAt),
    source: 'member' as const,
  }))

  const invites = await db
    .select()
    .from(invitation)
    .where(and(eq(invitation.organizationId, organizationId), eq(invitation.status, 'pending')))
    .orderBy(desc(invitation.createdAt))

  for (const inv of invites) {
    items.push({
      id: inv.id,
      userId: '',
      name: inv.email,
      email: inv.email,
      role: inv.role || 'member',
      status: '启用',
      createdAt: formatStamp(inv.createdAt),
      source: 'invitation',
    })
  }

  if (q?.trim()) {
    const needle = q.trim().toLowerCase()
    items = items.filter(
      (i) =>
        i.name.toLowerCase().includes(needle) ||
        i.email.toLowerCase().includes(needle) ||
        i.role.toLowerCase().includes(needle),
    )
  }
  return items
}

/**
 * 创建待确认邀请；不发送真实邮件（避免伪 KPI）。
 */
export async function createInvitation(
  db: DbLike,
  organizationId: string,
  input: { email: string; role?: string; inviterUserId?: string; name?: string },
) {
  const email = input.email.trim().toLowerCase()
  if (!email) throw new Error('邮箱不能为空')
  const existingMembers = await listMembers(db as AppDatabase, organizationId)
  if (existingMembers.some((m) => m.email.toLowerCase() === email && m.source === 'member')) {
    throw new Error(`${email} 已在成员列表中`)
  }
  const id = createId()
  const now = new Date()
  const expires = new Date(now.getTime() + 7 * 24 * 3600 * 1000)
  await db.insert(invitation).values({
    id,
    organizationId,
    email,
    role: input.role || 'member',
    status: 'pending',
    expiresAt: expires,
    inviterId: input.inviterUserId || 'system',
    createdAt: now,
  })
  return {
    id,
    email,
    role: input.role || 'member',
    note: '已写入 invitation（pending）；未发送真实邀请邮件。待平台/邮件通道授权后发出。',
  }
}

export async function updateMemberRole(
  db: DbLike,
  organizationId: string,
  input: { id: string; role: string },
) {
  const role = input.role.trim() || 'member'
  if (role === 'owner') throw new Error('不可通过此接口设为 owner')
  const [row] = await db
    .select()
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.id, input.id)))
    .limit(1)
  if (!row) throw new Error('成员不存在')
  if (row.role === 'owner') throw new Error('所有者角色不可修改')
  await db.update(member).set({ role }).where(eq(member.id, input.id))
  return listMembers(db as AppDatabase, organizationId)
}
