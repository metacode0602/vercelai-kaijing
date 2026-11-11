/**
 * 平台组织邀请（web_auth.invitation / member / users）。
 *
 * 与租户侧 public.invitation 物理隔离，禁止混表。
 * 同一条邀请可同时绑定邮箱和手机号：有邮箱则发信，
 * 有手机号则 OTP 登录/注册后自动加入对应平台组织。
 */
import { createId } from '@paralleldrive/cuid2'
import { assertPasswordPolicy, normalizeContactPhone, type PlatformRole } from '@workspace/auth'
import {
  invitationEffectiveStatus,
  isValidCnMobile,
  isValidInviteEmail,
  platformInviteRoleLabel,
  resolvePlatformInviteRole,
  shouldBindInvitationEmail,
} from '@/lib/server/dataaccess/platform-invitation-rules'
import {
  webAccount,
  webInvitation,
  webMember,
  webOrganization,
  webUser,
} from '@workspace/db'
import { hashPassword } from 'better-auth/crypto'
import { and, count, desc, eq, gte, ilike, lt, or, type SQL } from 'drizzle-orm'
import { webAuthDb } from '@/lib/db'
import {
  DEFAULT_PLATFORM_INVITE_ROLE,
  PLATFORM_INVITE_ROLE_LABELS,
} from '@/lib/platform-invite'
import { pageValues } from '@/lib/server/dataaccess/pagination'

export { DEFAULT_PLATFORM_INVITE_ROLE, PLATFORM_INVITE_ROLE_LABELS }
export {
  invitationEffectiveStatus,
  isValidCnMobile,
  isValidInviteEmail,
  resolvePlatformInviteRole,
  shouldBindInvitationEmail,
} from '@/lib/server/dataaccess/platform-invitation-rules'

export const INVITATION_TTL_MS = 7 * 24 * 3600 * 1000

type DbLike = typeof webAuthDb

export type PlatformInvitationListItem = {
  id: string
  email: string
  phone: string
  role: string
  roleLabel: string
  status: string
  storedStatus: string
  expiresAt: Date
  createdAt: Date
  organizationId: string
  organizationName: string
  inviterId: string
  inviterName: string
  inviterEmail: string
  emailSent: boolean
}

export type CreateInvitationResult = {
  id: string
  email: string | null
  phone: string | null
  role: PlatformRole
  emailSent: boolean
  note: string
  inviteUrl?: string
  organizationName?: string
  inviterName?: string
  inviterEmail?: string
}

function normalizeInviteContacts(input: { email?: string; phone?: string }) {
  const emailRaw = (input.email || '').trim().toLowerCase()
  const phoneRaw = (input.phone || '').trim()
  const email = emailRaw || null
  const phone = phoneRaw ? normalizeContactPhone(phoneRaw) : null
  if (!email && !phone) throw new Error('请至少填写手机号或邮箱')
  if (email && !isValidInviteEmail(email)) throw new Error('邮箱格式不正确')
  if (phone && !isValidCnMobile(phone)) throw new Error('手机号须为有效的中国大陆 11 位号码')
  return { email, phone }
}

export async function resolvePlatformOrganizationId(
  userId: string,
  db: DbLike = webAuthDb,
) {
  const rows = await db
    .select({
      organizationId: webMember.organizationId,
      createdAt: webMember.createdAt,
    })
    .from(webMember)
    .innerJoin(webOrganization, eq(webMember.organizationId, webOrganization.id))
    .where(and(eq(webMember.userId, userId), eq(webOrganization.orgType, 'platform')))
    .orderBy(webMember.createdAt)

  const orgId = rows[0]?.organizationId
  if (!orgId) throw new Error('当前账号未加入平台组织，无法发起邀请')
  return orgId
}

export async function hasPendingPlatformInvitationByPhone(
  phoneRaw: string,
  db: DbLike = webAuthDb,
) {
  const phone = normalizeContactPhone(phoneRaw)
  if (!phone || !isValidCnMobile(phone)) return false
  const now = new Date()
  const rows = await db
    .select({ id: webInvitation.id })
    .from(webInvitation)
    .innerJoin(webOrganization, eq(webInvitation.organizationId, webOrganization.id))
    .where(
      and(
        eq(webInvitation.status, 'pending'),
        eq(webInvitation.phone, phone),
        eq(webOrganization.orgType, 'platform'),
        gte(webInvitation.expiresAt, now),
      ),
    )
    .limit(1)
  return Boolean(rows[0])
}

function statusFilters(
  status: 'all' | 'pending' | 'accepted' | 'canceled' | 'expired' | undefined,
  now: Date,
): SQL[] {
  if (!status || status === 'all') return []
  if (status === 'expired') {
    return [eq(webInvitation.status, 'pending'), lt(webInvitation.expiresAt, now)]
  }
  if (status === 'pending') {
    return [eq(webInvitation.status, 'pending'), gte(webInvitation.expiresAt, now)]
  }
  return [eq(webInvitation.status, status)]
}

export async function listPlatformInvitations(
  input: {
    page?: number
    pageSize?: number
    q?: string
    status?: 'all' | 'pending' | 'accepted' | 'canceled' | 'expired'
  },
  db: DbLike = webAuthDb,
) {
  const { page, pageSize } = pageValues(input.page, input.pageSize)
  const now = new Date()
  const filters: SQL[] = [eq(webOrganization.orgType, 'platform'), ...statusFilters(input.status, now)]

  const keyword = input.q?.trim()
  if (keyword) {
    const pattern = `%${keyword}%`
    filters.push(
      or(
        ilike(webInvitation.email, pattern),
        ilike(webInvitation.phone, pattern),
        ilike(webOrganization.name, pattern),
        ilike(webUser.name, pattern),
        ilike(webUser.email, pattern),
      )!,
    )
  }

  const where = and(...filters)
  const [totalRow] = await db
    .select({ value: count() })
    .from(webInvitation)
    .innerJoin(webOrganization, eq(webInvitation.organizationId, webOrganization.id))
    .innerJoin(webUser, eq(webInvitation.inviterId, webUser.id))
    .where(where)

  const rows = await db
    .select({
      id: webInvitation.id,
      email: webInvitation.email,
      phone: webInvitation.phone,
      role: webInvitation.role,
      status: webInvitation.status,
      expiresAt: webInvitation.expiresAt,
      createdAt: webInvitation.createdAt,
      organizationId: webInvitation.organizationId,
      organizationName: webOrganization.name,
      inviterId: webInvitation.inviterId,
      inviterName: webUser.name,
      inviterEmail: webUser.email,
    })
    .from(webInvitation)
    .innerJoin(webOrganization, eq(webInvitation.organizationId, webOrganization.id))
    .innerJoin(webUser, eq(webInvitation.inviterId, webUser.id))
    .where(where)
    .orderBy(desc(webInvitation.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const items: PlatformInvitationListItem[] = rows.map((row) => ({
    id: row.id,
    email: row.email || '',
    phone: row.phone || '',
    role: row.role || DEFAULT_PLATFORM_INVITE_ROLE,
    roleLabel: platformInviteRoleLabel(row.role),
    status: invitationEffectiveStatus(row.status, row.expiresAt, now),
    storedStatus: row.status,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    inviterId: row.inviterId,
    inviterName: row.inviterName || row.inviterEmail || row.inviterId,
    inviterEmail: row.inviterEmail || '',
    emailSent: Boolean(row.email),
  }))

  return { items, total: Number(totalRow?.value ?? 0), page, pageSize }
}

export async function getPlatformInvitation(id: string, db: DbLike = webAuthDb) {
  const [row] = await db
    .select({
      id: webInvitation.id,
      email: webInvitation.email,
      phone: webInvitation.phone,
      role: webInvitation.role,
      status: webInvitation.status,
      expiresAt: webInvitation.expiresAt,
      createdAt: webInvitation.createdAt,
      organizationId: webInvitation.organizationId,
      organizationName: webOrganization.name,
      orgType: webOrganization.orgType,
      inviterId: webInvitation.inviterId,
      inviterName: webUser.name,
      inviterEmail: webUser.email,
    })
    .from(webInvitation)
    .innerJoin(webOrganization, eq(webInvitation.organizationId, webOrganization.id))
    .innerJoin(webUser, eq(webInvitation.inviterId, webUser.id))
    .where(eq(webInvitation.id, id))
    .limit(1)
  if (!row || row.orgType !== 'platform') return null
  const status = invitationEffectiveStatus(row.status, row.expiresAt)
  return {
    id: row.id,
    email: row.email || '',
    phone: row.phone || '',
    role: row.role || DEFAULT_PLATFORM_INVITE_ROLE,
    roleLabel: platformInviteRoleLabel(row.role),
    status,
    storedStatus: row.status,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    inviterId: row.inviterId,
    inviterName: row.inviterName || row.inviterEmail || row.inviterId,
    inviterEmail: row.inviterEmail || '',
    emailSent: Boolean(row.email),
  }
}

function buildInviteUrl(input: { id: string; email: string | null; baseUrl?: string; locale?: string }) {
  if (!input.email) return undefined
  const base = (input.baseUrl || '').replace(/\/$/, '')
  if (!base) return undefined
  const locale = input.locale || 'zh'
  return `${base}/${locale}/auth/accept-invite?id=${encodeURIComponent(input.id)}`
}

export async function createPlatformInvitation(
  input: {
    organizationId: string
    email?: string
    phone?: string
    role?: string
    inviterUserId: string
    name?: string
    baseUrl?: string
    locale?: string
  },
  db: DbLike = webAuthDb,
): Promise<CreateInvitationResult> {
  const { email, phone } = normalizeInviteContacts(input)
  const role = resolvePlatformInviteRole(input.role)

  const [org] = await db
    .select()
    .from(webOrganization)
    .where(eq(webOrganization.id, input.organizationId))
    .limit(1)
  if (!org || org.orgType !== 'platform') {
    throw new Error('只能向平台组织发起邀请')
  }

  const memberFilters: SQL[] = [eq(webMember.organizationId, input.organizationId)]
  const memberMatch: SQL[] = []
  if (email) memberMatch.push(eq(webUser.email, email))
  if (phone) memberMatch.push(eq(webUser.phoneNumber, phone))
  if (memberMatch.length > 0) {
    const existingMembers = await db
      .select({ id: webMember.id })
      .from(webMember)
      .innerJoin(webUser, eq(webMember.userId, webUser.id))
      .where(and(...memberFilters, or(...memberMatch)!))
      .limit(1)
    if (existingMembers[0]) {
      throw new Error(email && phone ? '该邮箱或手机号已在平台组织中' : email ? `${email} 已在平台组织中` : `${phone} 已在平台组织中`)
    }
  }

  const pendingMatch: SQL[] = [eq(webInvitation.organizationId, input.organizationId), eq(webInvitation.status, 'pending')]
  const contactMatch: SQL[] = []
  if (email) contactMatch.push(eq(webInvitation.email, email))
  if (phone) contactMatch.push(eq(webInvitation.phone, phone))
  const existingInvites = await db
    .select({ id: webInvitation.id })
    .from(webInvitation)
    .where(and(...pendingMatch, or(...contactMatch)!))
    .limit(1)
  if (existingInvites[0]) {
    throw new Error('已存在相同手机号/邮箱的待接受邀请')
  }

  const id = createId()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS)

  await db.insert(webInvitation).values({
    id,
    organizationId: input.organizationId,
    email,
    phone,
    role,
    status: 'pending',
    expiresAt,
    inviterId: input.inviterUserId,
    createdAt: now,
  })

  const [inviter] = await db.select().from(webUser).where(eq(webUser.id, input.inviterUserId)).limit(1)
  const inviterName = inviter?.name || ''
  const inviterEmail = inviter?.email || ''
  const inviteUrl = buildInviteUrl({ id, email, baseUrl: input.baseUrl, locale: input.locale })

  const noteParts: string[] = ['已写入平台邀请（pending）']
  if (phone) noteParts.push(`手机号 ${phone} 登录后将自动加入组织`)
  if (email) noteParts.push(`将向 ${email} 发送邀请邮件`)
  else noteParts.push('未填写邮箱，不发送邮件或短信邀请函')

  return {
    id,
    email,
    phone,
    role,
    emailSent: Boolean(email),
    note: `${noteParts.join('；')}。`,
    inviteUrl,
    organizationName: org.name || input.organizationId,
    inviterName: inviterName || '平台管理员',
    inviterEmail,
  }
}

export async function cancelPlatformInvitation(
  input: { id: string; actorUserId: string },
  db: DbLike = webAuthDb,
) {
  const [inv] = await db.select().from(webInvitation).where(eq(webInvitation.id, input.id)).limit(1)
  if (!inv) throw new Error('邀请不存在')
  const [org] = await db
    .select({ orgType: webOrganization.orgType })
    .from(webOrganization)
    .where(eq(webOrganization.id, inv.organizationId))
    .limit(1)
  if (org?.orgType !== 'platform') throw new Error('邀请不存在')
  if (inv.status !== 'pending') {
    throw new Error(`邀请状态为 ${invitationEffectiveStatus(inv.status, inv.expiresAt)}，仅待接受邀请可撤销`)
  }
  await db.update(webInvitation).set({ status: 'canceled' }).where(eq(webInvitation.id, inv.id))
  return {
    id: inv.id,
    email: inv.email,
    phone: inv.phone,
    status: 'canceled' as const,
    note: '邀请已撤销。',
  }
}

export async function preparePlatformInvitationResend(
  input: { id: string; baseUrl?: string; locale?: string },
  db: DbLike = webAuthDb,
) {
  const [inv] = await db.select().from(webInvitation).where(eq(webInvitation.id, input.id)).limit(1)
  if (!inv) throw new Error('邀请不存在')
  const [org] = await db.select().from(webOrganization).where(eq(webOrganization.id, inv.organizationId)).limit(1)
  if (!org || org.orgType !== 'platform') throw new Error('邀请不存在')
  if (inv.status !== 'pending') {
    throw new Error(`邀请状态为 ${invitationEffectiveStatus(inv.status, inv.expiresAt)}，仅待接受邀请可重发`)
  }
  if (!inv.email) throw new Error('该邀请未填写邮箱，无法重发邮件')

  const now = new Date()
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS)
  await db.update(webInvitation).set({ expiresAt }).where(eq(webInvitation.id, inv.id))

  const [inviter] = await db.select().from(webUser).where(eq(webUser.id, inv.inviterId)).limit(1)
  const inviteUrl = buildInviteUrl({
    id: inv.id,
    email: inv.email,
    baseUrl: input.baseUrl,
    locale: input.locale,
  })

  return {
    id: inv.id,
    email: inv.email,
    phone: inv.phone,
    role: (inv.role as PlatformRole) || DEFAULT_PLATFORM_INVITE_ROLE,
    inviteUrl,
    organizationName: org.name || inv.organizationId,
    inviterName: inviter?.name || '平台管理员',
    inviterEmail: inviter?.email || '',
    note: `已延长有效期，将向 ${inv.email} 重发邀请邮件。`,
  }
}

async function ensurePlatformMember(
  db: DbLike,
  organizationId: string,
  userId: string,
  role: PlatformRole,
) {
  const [existing] = await db
    .select({ id: webMember.id, role: webMember.role })
    .from(webMember)
    .where(and(eq(webMember.organizationId, organizationId), eq(webMember.userId, userId)))
    .limit(1)
  if (existing) return existing.id
  const id = createId()
  await db.insert(webMember).values({
    id,
    organizationId,
    userId,
    role,
    createdAt: new Date(),
  })
  return id
}

async function bindInvitationEmailIfNeeded(
  db: DbLike,
  userId: string,
  invitationEmail: string | null,
) {
  const email = invitationEmail?.trim().toLowerCase() || ''
  if (!email) return
  const [current] = await db
    .select({ email: webUser.email, phoneNumber: webUser.phoneNumber })
    .from(webUser)
    .where(eq(webUser.id, userId))
    .limit(1)
  if (!current) return
  if (!shouldBindInvitationEmail({
    userEmail: current.email,
    userPhone: current.phoneNumber,
    invitationEmail: email,
  })) {
    return
  }
  const [conflict] = await db
    .select({ id: webUser.id })
    .from(webUser)
    .where(and(eq(webUser.email, email)))
    .limit(1)
  if (conflict && conflict.id !== userId) {
    console.warn(`[platform-invitations] skip email bind, ${email} already used by ${conflict.id}`)
    return
  }
  await db
    .update(webUser)
    .set({ email, emailVerified: true, updatedAt: new Date() })
    .where(eq(webUser.id, userId))
}

/**
 * 手机号 OTP 验证成功后：接受该手机号下所有未过期 pending 平台邀请并加入对应组织。
 * 若邀请同时填写了邮箱，且当前用户仍是占位邮箱，则把真实邮箱绑定到同一用户。
 */
export async function acceptPendingPlatformInvitationsForPhone(
  userId: string,
  phoneRaw: string,
  db: DbLike = webAuthDb,
): Promise<{ accepted: number; organizationIds: string[] }> {
  const phone = normalizeContactPhone(phoneRaw)
  if (!phone || !isValidCnMobile(phone)) return { accepted: 0, organizationIds: [] }

  const now = new Date()
  const pending = await db
    .select({
      id: webInvitation.id,
      organizationId: webInvitation.organizationId,
      email: webInvitation.email,
      phone: webInvitation.phone,
      role: webInvitation.role,
      expiresAt: webInvitation.expiresAt,
      orgType: webOrganization.orgType,
    })
    .from(webInvitation)
    .innerJoin(webOrganization, eq(webInvitation.organizationId, webOrganization.id))
    .where(
      and(
        eq(webInvitation.status, 'pending'),
        eq(webInvitation.phone, phone),
        eq(webOrganization.orgType, 'platform'),
      ),
    )

  const organizationIds: string[] = []
  for (const inv of pending) {
    if (inv.expiresAt.getTime() < now.getTime()) {
      await db.update(webInvitation).set({ status: 'canceled' }).where(eq(webInvitation.id, inv.id))
      continue
    }
    const role = resolvePlatformInviteRole(inv.role)
    await ensurePlatformMember(db, inv.organizationId, userId, role)
    await bindInvitationEmailIfNeeded(db, userId, inv.email)
    await db.update(webInvitation).set({ status: 'accepted' }).where(eq(webInvitation.id, inv.id))
    organizationIds.push(inv.organizationId)
  }
  return { accepted: organizationIds.length, organizationIds }
}

export async function getPlatformInvitationPublic(id: string, db: DbLike = webAuthDb) {
  const [inv] = await db.select().from(webInvitation).where(eq(webInvitation.id, id)).limit(1)
  if (!inv) return null
  const [org] = await db.select().from(webOrganization).where(eq(webOrganization.id, inv.organizationId)).limit(1)
  if (!org || org.orgType !== 'platform') return null
  const status = invitationEffectiveStatus(inv.status, inv.expiresAt)
  return {
    id: inv.id,
    email: inv.email,
    phone: inv.phone,
    role: inv.role || DEFAULT_PLATFORM_INVITE_ROLE,
    roleLabel: platformInviteRoleLabel(inv.role),
    status,
    expiresAt: inv.expiresAt.toISOString(),
    organizationId: inv.organizationId,
    organizationName: org.name || inv.organizationId,
    canAccept: status === 'pending' && Boolean(inv.email),
  }
}

/**
 * 邮箱邀请：设置登录密码并加入平台组织；不创建会话，调用方引导重新登录。
 */
export async function acceptPlatformInvitationWithPassword(
  input: { id: string; password: string; name?: string },
  db: DbLike = webAuthDb,
) {
  const [inv] = await db.select().from(webInvitation).where(eq(webInvitation.id, input.id)).limit(1)
  if (!inv) throw new Error('邀请不存在或链接无效')
  const [org] = await db.select().from(webOrganization).where(eq(webOrganization.id, inv.organizationId)).limit(1)
  if (!org || org.orgType !== 'platform') throw new Error('邀请不存在或链接无效')
  if (inv.status !== 'pending') throw new Error(`邀请状态为 ${invitationEffectiveStatus(inv.status, inv.expiresAt)}，无法接受`)
  if (inv.expiresAt.getTime() < Date.now()) {
    await db.update(webInvitation).set({ status: 'canceled' }).where(eq(webInvitation.id, inv.id))
    throw new Error('邀请已过期')
  }
  const email = (inv.email || '').trim().toLowerCase()
  if (!email) throw new Error('该邀请未绑定邮箱，请使用手机号登录自动加入组织')

  assertPasswordPolicy(input.password, { email, name: input.name })

  const [existingUser] = await db.select().from(webUser).where(eq(webUser.email, email)).limit(1)
  let userId = existingUser?.id
  const displayName = (input.name || '').trim() || existingUser?.name || email.split('@')[0] || '平台成员'
  const now = new Date()

  if (!userId) {
    userId = createId()
    await db.insert(webUser).values({
      id: userId,
      name: displayName,
      email,
      emailVerified: true,
      phoneNumber: inv.phone || null,
      phoneNumberVerified: Boolean(inv.phone),
      createdAt: now,
      updatedAt: now,
    })
  } else {
    const patch: Partial<typeof webUser.$inferInsert> = { updatedAt: now }
    if ((input.name || '').trim()) patch.name = displayName
    if (inv.phone && !existingUser?.phoneNumber) {
      const [phoneConflict] = await db
        .select({ id: webUser.id })
        .from(webUser)
        .where(eq(webUser.phoneNumber, inv.phone))
        .limit(1)
      if (!phoneConflict || phoneConflict.id === userId) {
        patch.phoneNumber = inv.phone
        patch.phoneNumberVerified = true
      }
    }
    await db.update(webUser).set(patch).where(eq(webUser.id, userId))
  }

  const hashed = await hashPassword(input.password)
  const [cred] = await db
    .select()
    .from(webAccount)
    .where(and(eq(webAccount.userId, userId), eq(webAccount.providerId, 'credential')))
    .limit(1)
  if (cred) {
    await db
      .update(webAccount)
      .set({ password: hashed, updatedAt: now })
      .where(eq(webAccount.id, cred.id))
  } else {
    await db.insert(webAccount).values({
      id: createId(),
      accountId: userId,
      providerId: 'credential',
      userId,
      password: hashed,
      createdAt: now,
      updatedAt: now,
    })
  }

  const role = resolvePlatformInviteRole(inv.role)
  await ensurePlatformMember(db, inv.organizationId, userId, role)
  await db.update(webInvitation).set({ status: 'accepted' }).where(eq(webInvitation.id, inv.id))

  if (inv.phone) {
    await acceptPendingPlatformInvitationsForPhone(userId, inv.phone, db)
  }

  return {
    organizationId: inv.organizationId,
    organizationName: org.name || inv.organizationId,
    email,
    phone: inv.phone,
    note: '已接受邀请并设置登录密码。请重新登录后进入运营台。',
    requireRelogin: true as const,
  }
}
