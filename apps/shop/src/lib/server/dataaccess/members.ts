/**
 * better-auth member + invitation（模块15）。
 * 支持手机号邀请（登录 OTP 自动绑定组织）与邮箱邀请（发信 → 设密码 → 重新登录）。
 */
import { and, desc, eq } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { hashPassword } from 'better-auth/crypto'
import { account, invitation, member, organization, user } from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import { normalizeContactPhone } from '@/lib/auth/constants'
import { formatStamp } from '@/lib/server/mappers/ops-master'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

function isValidCnMobile(phone: string) {
  return /^1\d{10}$/.test(normalizeContactPhone(phone))
}

export type MemberDto = {
  id: string
  userId: string
  name: string
  email: string
  phone: string
  role: string
  status: '启用' | '停用'
  createdAt: string
  source: 'member' | 'invitation'
  /** 待接受邀请是否已发邮件 */
  emailSent?: boolean
  inviteStatus?: string
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
      phone: user.phoneNumber,
      banned: user.banned,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, organizationId))
    .orderBy(desc(member.createdAt))

  let items: MemberDto[] = rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    name: r.name || r.email || r.phone || r.userId,
    email: r.email || '',
    phone: r.phone || '',
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
    const email = inv.email || ''
    const phone = inv.phone || ''
    items.push({
      id: inv.id,
      userId: '',
      name: email || phone || inv.id,
      email,
      phone,
      role: inv.role || 'member',
      status: '启用',
      createdAt: formatStamp(inv.createdAt),
      source: 'invitation',
      emailSent: Boolean(email),
      inviteStatus: inv.status,
    })
  }

  if (q?.trim()) {
    const needle = q.trim().toLowerCase()
    items = items.filter(
      (i) =>
        i.name.toLowerCase().includes(needle) ||
        i.email.toLowerCase().includes(needle) ||
        i.phone.toLowerCase().includes(needle) ||
        i.role.toLowerCase().includes(needle),
    )
  }
  return items
}

export type CreateInvitationResult = {
  id: string
  email: string | null
  phone: string | null
  role: string
  emailSent: boolean
  note: string
  inviteUrl?: string
  organizationName?: string
  inviterName?: string
  inviterEmail?: string
}

/**
 * 创建 pending 邀请。至少提供手机号或邮箱之一。
 * 邮箱邀请由调用方发送邮件（本函数只落库并返回拼链接所需信息）。
 */
export async function createInvitation(
  db: DbLike,
  organizationId: string,
  input: {
    email?: string
    phone?: string
    role?: string
    inviterUserId?: string
    name?: string
    baseUrl?: string
    locale?: string
  },
): Promise<CreateInvitationResult> {
  const emailRaw = (input.email || '').trim().toLowerCase()
  const phoneRaw = (input.phone || '').trim()
  const email = emailRaw || null
  const phone = phoneRaw ? normalizeContactPhone(phoneRaw) : null

  if (!email && !phone) throw new Error('请至少填写手机号或邮箱')
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('邮箱格式不正确')
  if (phone && !isValidCnMobile(phone)) throw new Error('手机号须为有效的中国大陆 11 位号码')
  if ((input.role || '').trim() === 'owner') throw new Error('不可通过邀请设为 owner')

  const existingMembers = await listMembers(db as AppDatabase, organizationId)
  if (email && existingMembers.some((m) => m.source === 'member' && m.email.toLowerCase() === email)) {
    throw new Error(`${email} 已在成员列表中`)
  }
  if (phone && existingMembers.some((m) => m.source === 'member' && normalizeContactPhone(m.phone) === phone)) {
    throw new Error(`${phone} 已在成员列表中`)
  }
  if (
    existingMembers.some(
      (m) =>
        m.source === 'invitation' &&
        ((email && m.email.toLowerCase() === email) || (phone && normalizeContactPhone(m.phone) === phone)),
    )
  ) {
    throw new Error('已存在相同手机号/邮箱的待接受邀请')
  }

  const id = createId()
  const now = new Date()
  const expires = new Date(now.getTime() + 7 * 24 * 3600 * 1000)
  const inviterUserId = input.inviterUserId || 'system'

  await db.insert(invitation).values({
    id,
    organizationId,
    email,
    phone,
    role: input.role || 'member',
    status: 'pending',
    expiresAt: expires,
    inviterId: inviterUserId,
    createdAt: now,
  })

  const [org] = await db.select().from(organization).where(eq(organization.id, organizationId)).limit(1)
  let inviterName = ''
  let inviterEmail = ''
  if (inviterUserId && inviterUserId !== 'system') {
    const [inviter] = await db.select().from(user).where(eq(user.id, inviterUserId)).limit(1)
    inviterName = inviter?.name || ''
    inviterEmail = inviter?.email || ''
  }

  const locale = input.locale || 'zh'
  const base = (input.baseUrl || '').replace(/\/$/, '')
  const inviteUrl = email && base ? `${base}/${locale}/auth/accept-invite?id=${encodeURIComponent(id)}` : undefined

  const noteParts: string[] = ['已写入 invitation（pending）']
  if (phone) noteParts.push(`手机号 ${phone} 登录后将自动加入组织`)
  if (email) noteParts.push(`将向 ${email} 发送邀请邮件`)
  else noteParts.push('未填写邮箱，不发送邮件')

  return {
    id,
    email,
    phone,
    role: input.role || 'member',
    emailSent: Boolean(email),
    note: noteParts.join('；') + '。',
    inviteUrl,
    organizationName: org?.name || organizationId,
    inviterName: inviterName || '组织管理员',
    inviterEmail,
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

export async function getMemberRole(
  db: AppDatabase,
  organizationId: string,
  userId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
    .limit(1)
  return row?.role ?? null
}

export async function cancelInvitation(
  db: DbLike,
  organizationId: string,
  input: { id: string; actorUserId: string },
) {
  const role = await getMemberRole(db as AppDatabase, organizationId, input.actorUserId)
  if (role !== 'owner') {
    throw new Error('仅组织所有者可撤销邀请')
  }
  const [inv] = await db
    .select()
    .from(invitation)
    .where(and(eq(invitation.organizationId, organizationId), eq(invitation.id, input.id)))
    .limit(1)
  if (!inv) throw new Error('邀请不存在')
  if (inv.status !== 'pending') {
    throw new Error(`邀请状态为 ${inv.status}，仅 pending 可撤销`)
  }
  await db
    .update(invitation)
    .set({ status: 'canceled' })
    .where(and(eq(invitation.organizationId, organizationId), eq(invitation.id, input.id)))
  return {
    id: inv.id,
    email: inv.email,
    phone: inv.phone,
    status: 'canceled' as const,
    note: '邀请已撤销（canceled）。',
  }
}

async function ensureMember(
  db: DbLike,
  organizationId: string,
  userId: string,
  role: string,
) {
  const [existing] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
    .limit(1)
  if (existing) return existing.id
  const id = createId()
  await db.insert(member).values({
    id,
    organizationId,
    userId,
    role: role || 'member',
    createdAt: new Date(),
  })
  return id
}

/**
 * 手机号 OTP 验证成功后：接受该手机号下所有未过期 pending 邀请并加入对应组织。
 */
export async function acceptPendingInvitationsForPhone(
  db: DbLike,
  userId: string,
  phoneRaw: string,
): Promise<{ accepted: number; organizationIds: string[] }> {
  const phone = normalizeContactPhone(phoneRaw)
  if (!phone || !isValidCnMobile(phone)) return { accepted: 0, organizationIds: [] }

  const now = new Date()
  const pending = await db
    .select()
    .from(invitation)
    .where(and(eq(invitation.status, 'pending'), eq(invitation.phone, phone)))

  const organizationIds: string[] = []
  for (const inv of pending) {
    if (inv.expiresAt && inv.expiresAt.getTime() < now.getTime()) {
      await db.update(invitation).set({ status: 'canceled' }).where(eq(invitation.id, inv.id))
      continue
    }
    await ensureMember(db, inv.organizationId, userId, inv.role || 'member')
    await db.update(invitation).set({ status: 'accepted' }).where(eq(invitation.id, inv.id))
    organizationIds.push(inv.organizationId)
  }
  return { accepted: organizationIds.length, organizationIds }
}

export async function getInvitationPublic(db: AppDatabase, id: string) {
  const [inv] = await db.select().from(invitation).where(eq(invitation.id, id)).limit(1)
  if (!inv) return null
  const [org] = await db.select().from(organization).where(eq(organization.id, inv.organizationId)).limit(1)
  const expired = inv.expiresAt.getTime() < Date.now()
  return {
    id: inv.id,
    email: inv.email,
    phone: inv.phone,
    role: inv.role || 'member',
    status: expired && inv.status === 'pending' ? 'expired' : inv.status,
    expiresAt: inv.expiresAt.toISOString(),
    organizationId: inv.organizationId,
    organizationName: org?.name || inv.organizationId,
    canAccept: inv.status === 'pending' && !expired && Boolean(inv.email),
  }
}

/**
 * 邮箱邀请：设登录密码并接受加入组织；不创建会话，调用方引导重新登录。
 */
export async function acceptInvitationWithPassword(
  db: DbLike,
  input: { id: string; password: string; name?: string },
) {
  const password = input.password
  if (!password || password.length < 8) throw new Error('密码至少 8 位')

  const [inv] = await db.select().from(invitation).where(eq(invitation.id, input.id)).limit(1)
  if (!inv) throw new Error('邀请不存在或链接无效')
  if (inv.status !== 'pending') throw new Error(`邀请状态为 ${inv.status}，无法接受`)
  if (inv.expiresAt.getTime() < Date.now()) {
    await db.update(invitation).set({ status: 'canceled' }).where(eq(invitation.id, inv.id))
    throw new Error('邀请已过期')
  }
  const email = (inv.email || '').trim().toLowerCase()
  if (!email) throw new Error('该邀请未绑定邮箱，请使用手机号登录自动加入组织')

  const [existingUser] = await db.select().from(user).where(eq(user.email, email)).limit(1)
  let userId = existingUser?.id
  const displayName = (input.name || '').trim() || existingUser?.name || email.split('@')[0] || '成员'

  if (!userId) {
    userId = createId()
    await db.insert(user).values({
      id: userId,
      name: displayName,
      email,
      emailVerified: true,
      phoneNumber: inv.phone || null,
      phoneNumberVerified: Boolean(inv.phone),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  } else if ((input.name || '').trim()) {
    await db.update(user).set({ name: displayName, updatedAt: new Date() }).where(eq(user.id, userId))
  }

  // 写入 / 更新 credential 密码（better-auth 默认 provider）
  const hashed = await hashPassword(password)
  const [cred] = await db
    .select()
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
    .limit(1)
  if (cred) {
    await db
      .update(account)
      .set({ password: hashed, updatedAt: new Date() })
      .where(eq(account.id, cred.id))
  } else {
    await db.insert(account).values({
      id: createId(),
      accountId: userId,
      providerId: 'credential',
      userId,
      password: hashed,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }

  await ensureMember(db, inv.organizationId, userId, inv.role || 'member')
  await db.update(invitation).set({ status: 'accepted' }).where(eq(invitation.id, inv.id))

  // 同邮箱/手机的其它 pending 一并接受（幂等）
  if (inv.phone) {
    await acceptPendingInvitationsForPhone(db, userId, inv.phone)
  }

  const [org] = await db.select().from(organization).where(eq(organization.id, inv.organizationId)).limit(1)

  return {
    organizationId: inv.organizationId,
    organizationName: org?.name || inv.organizationId,
    email,
    note: '已接受邀请并设置登录密码。请重新登录后进入控制台。',
    requireRelogin: true as const,
  }
}
