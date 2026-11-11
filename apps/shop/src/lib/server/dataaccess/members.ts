/**
 * better-auth member + invitation（模块15）。
 * 手机号/邮箱邀请都进入待确认列表，由用户显式选择接受，避免登录时静默加入多个组织。
 */
import { and, desc, eq, gt, inArray, or } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { hashPassword } from 'better-auth/crypto'
import {
  account,
  invitation,
  member,
  organization,
  tenantOnboardingApplications,
  user,
} from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import { OWNER_ANNOTATION, isOwnerIdentity, parseInvitationRoles, serializeInvitationRoles } from '@workspace/auth'
import { normalizeContactPhone } from '@/lib/auth/constants'
import { formatStamp } from '@/lib/server/mappers/ops-master'
import { bindMemberRoleCodes, ensureOrgRbac, listMemberBusinessRoles, ownerAccess, replaceMemberBusinessRoles } from '@/lib/server/dataaccess/roles'

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
  isOwner: boolean
  businessRoles: Array<{ id: string; code: string; name: string }>
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

  const roleMap = await listMemberBusinessRoles(
    db,
    organizationId,
    rows.map((r) => r.userId),
  )

  let items: MemberDto[] = rows.map((r) => {
    const owner = isOwnerIdentity(r.role)
    const businessRoles = owner ? [] : (roleMap.get(r.userId) ?? [])
    return {
      id: r.id,
      userId: r.userId,
      name: r.name || r.email || r.phone || r.userId,
      email: r.email || '',
      phone: r.phone || '',
      role: owner ? OWNER_ANNOTATION : businessRoles.map((item) => item.name).join('、') || '未分配业务角色',
      status: r.banned ? '停用' : '启用',
      createdAt: formatStamp(r.createdAt),
      source: 'member' as const,
      isOwner: owner,
      businessRoles,
    }
  })

  const invites = await db
    .select()
    .from(invitation)
    .where(and(eq(invitation.organizationId, organizationId), eq(invitation.status, 'pending')))
    .orderBy(desc(invitation.createdAt))

  for (const inv of invites) {
    const email = inv.email || ''
    const phone = inv.phone || ''
    let inviteRoleLabel = inv.role || 'operator'
    try {
      inviteRoleLabel = parseInvitationRoles(inv.role).join('、')
    } catch {
      inviteRoleLabel = inv.role || 'operator'
    }
    items.push({
      id: inv.id,
      userId: '',
      name: email || phone || inv.id,
      email,
      phone,
      role: inviteRoleLabel,
      status: '启用',
      createdAt: formatStamp(inv.createdAt),
      source: 'invitation',
      emailSent: Boolean(email),
      inviteStatus: inv.status,
      isOwner: false,
      businessRoles: [],
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
    roles?: string[]
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
  const roleCodes = input.roles && input.roles.length > 0 ? input.roles : parseInvitationRoles(input.role)
  const storedRole = serializeInvitationRoles(roleCodes)

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
    role: storedRole,
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
  if (phone) noteParts.push(`手机号 ${phone} 登录后需在邀请中心确认加入`)
  if (email) noteParts.push(`将向 ${email} 发送邀请邮件`)
  else noteParts.push('未填写邮箱，不发送邮件')

  return {
    id,
    email,
    phone,
    role: storedRole,
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
  input: { id: string; role?: string; roleCodes?: string[] },
  access?: import('@/lib/server/dataaccess/roles').AccessSnapshot,
) {
  const [row] = await db
    .select()
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.id, input.id)))
    .limit(1)
  if (!row) throw new Error('成员不存在')
  if (isOwnerIdentity(row.role)) throw new Error('所有者角色不可修改')
  const roleCodes =
    input.roleCodes && input.roleCodes.length > 0 ? input.roleCodes : parseInvitationRoles(input.role)
  await replaceMemberBusinessRoles(
    db,
    organizationId,
    access ?? ownerAccess(organizationId, null),
    { userId: row.userId, roleCodes },
    { userId: access?.userId ?? null, label: 'members.updateRole' },
  )
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
    role: isOwnerIdentity(role) ? role : 'member',
    createdAt: new Date(),
  })
  return id
}

export type PendingInvitationDto = {
  id: string
  organizationId: string
  organizationName: string
  organizationStatus: string
  role: string
  roleLabel: string
  email: string | null
  phone: string | null
  inviterName: string
  expiresAt: string
  expiresAtIso: string
  createdAt: string
  canAccept: boolean
}

function invitationRoleLabel(role: string | null): string {
  try {
    return parseInvitationRoles(role).join('、')
  } catch {
    return role || 'member'
  }
}

async function loadInvitationUser(db: DbLike, userId: string) {
  const [currentUser] = await db.select().from(user).where(eq(user.id, userId)).limit(1)
  return currentUser ?? null
}

function invitationMatchesUser(
  inv: { email: string | null; phone: string | null },
  currentUser: { email: string | null; phoneNumber: string | null },
) {
  const email = (inv.email || '').trim().toLowerCase()
  const phone = normalizeContactPhone(inv.phone || '')
  const userEmail = (currentUser.email || '').trim().toLowerCase()
  const userPhone = normalizeContactPhone(currentUser.phoneNumber || '')
  return Boolean((email && userEmail && email === userEmail) || (phone && userPhone && phone === userPhone))
}

/** 当前账号（邮箱或手机号命中）的 pending 邀请，供 /select-org 邀请中心展示。 */
export async function listPendingInvitationsForUser(
  db: AppDatabase,
  userId: string,
): Promise<PendingInvitationDto[]> {
  const currentUser = await loadInvitationUser(db, userId)
  if (!currentUser) return []
  const email = (currentUser.email || '').trim().toLowerCase()
  const phone = normalizeContactPhone(currentUser.phoneNumber || '')
  const matches = []
  if (email) matches.push(eq(invitation.email, email))
  if (phone) matches.push(eq(invitation.phone, phone))
  if (matches.length === 0) return []

  const rows = await db
    .select({
      id: invitation.id,
      organizationId: invitation.organizationId,
      organizationName: organization.name,
      organizationStatus: organization.status,
      role: invitation.role,
      email: invitation.email,
      phone: invitation.phone,
      inviterId: invitation.inviterId,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    })
    .from(invitation)
    .innerJoin(organization, eq(invitation.organizationId, organization.id))
    .where(
      and(
        eq(invitation.status, 'pending'),
        eq(organization.orgType, 'tenant'),
        gt(invitation.expiresAt, new Date()),
        matches.length === 1 && matches[0] ? matches[0] : or(...matches),
      ),
    )
    .orderBy(desc(invitation.createdAt))

  const inviterIds = [...new Set(rows.map((row) => row.inviterId))]
  const inviters = inviterIds.length
    ? await db
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .where(inArray(user.id, inviterIds))
    : []
  const inviterMap = new Map(inviters.map((row) => [row.id, row.name || row.email || '']))

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    organizationStatus: row.organizationStatus,
    role: row.role || 'member',
    roleLabel: invitationRoleLabel(row.role),
    email: row.email,
    phone: row.phone,
    inviterName: inviterMap.get(row.inviterId) || '组织管理员',
    expiresAt: formatStamp(row.expiresAt),
    expiresAtIso: row.expiresAt.toISOString(),
    createdAt: formatStamp(row.createdAt),
    canAccept: row.organizationStatus === 'active',
  }))
}

export async function countPendingInvitationsForUser(db: AppDatabase, userId: string): Promise<number> {
  const rows = await listPendingInvitationsForUser(db, userId)
  return rows.length
}

export type AcceptInvitationForUserResult = {
  organizationId: string
  organizationName: string
  organizationStatus: string
  entryApproved: boolean
  onboardingStatus: string
}

/** 接受指定邀请；只处理当前 invitationId，不再连带接受同手机号的其它邀请。 */
export async function acceptInvitationForUser(
  db: AppDatabase,
  input: { userId: string; invitationId: string },
): Promise<AcceptInvitationForUserResult> {
  return db.transaction(async (tx) => {
    const currentUser = await loadInvitationUser(tx, input.userId)
    if (!currentUser) throw new Error('用户不存在')

    const [inv] = await tx
      .select()
      .from(invitation)
      .where(eq(invitation.id, input.invitationId))
      .limit(1)
    if (!inv) throw new Error('邀请不存在或链接无效')
    if (inv.status !== 'pending') throw new Error(`邀请状态为 ${inv.status}，无法接受`)
    if (inv.expiresAt.getTime() < Date.now()) throw new Error('邀请已过期')
    if (!invitationMatchesUser(inv, currentUser)) {
      throw new Error('该邀请不属于当前账号，请使用被邀请的手机号或邮箱登录')
    }

    await ensureMember(tx, inv.organizationId, input.userId, 'member')
    await ensureOrgRbac(tx, inv.organizationId)
    await bindMemberRoleCodes(
      tx,
      inv.organizationId,
      input.userId,
      parseInvitationRoles(inv.role),
    )
    await tx.update(invitation).set({ status: 'accepted' }).where(eq(invitation.id, inv.id))

    const [org] = await tx
      .select({
        name: organization.name,
        status: organization.status,
        entryApproved: organization.entryApproved,
      })
      .from(organization)
      .where(eq(organization.id, inv.organizationId))
      .limit(1)
    const [application] = await tx
      .select({ status: tenantOnboardingApplications.status })
      .from(tenantOnboardingApplications)
      .where(eq(tenantOnboardingApplications.organizationId, inv.organizationId))
      .limit(1)

    return {
      organizationId: inv.organizationId,
      organizationName: org?.name || inv.organizationId,
      organizationStatus: org?.status || 'active',
      entryApproved: org?.entryApproved ?? false,
      onboardingStatus: application?.status ?? 'not_started',
    }
  })
}

/** 忽略指定邀请：仅 pending 且属于当前账号的邀请可操作。 */
export async function declineInvitationForUser(
  db: AppDatabase,
  input: { userId: string; invitationId: string },
): Promise<{ id: string; status: 'canceled' }> {
  const currentUser = await loadInvitationUser(db, input.userId)
  if (!currentUser) throw new Error('用户不存在')
  const [inv] = await db
    .select()
    .from(invitation)
    .where(eq(invitation.id, input.invitationId))
    .limit(1)
  if (!inv) throw new Error('邀请不存在或链接无效')
  if (inv.status !== 'pending') throw new Error(`邀请状态为 ${inv.status}，无法忽略`)
  if (!invitationMatchesUser(inv, currentUser)) {
    throw new Error('该邀请不属于当前账号')
  }
  await db.update(invitation).set({ status: 'canceled' }).where(eq(invitation.id, inv.id))
  return { id: inv.id, status: 'canceled' }
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
  if (!email) throw new Error('该邀请未绑定邮箱，请登录后在邀请中心确认加入')

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

  await ensureMember(db, inv.organizationId, userId, 'member')
  await ensureOrgRbac(db, inv.organizationId)
  await bindMemberRoleCodes(db, inv.organizationId, userId, parseInvitationRoles(inv.role))
  await db.update(invitation).set({ status: 'accepted' }).where(eq(invitation.id, inv.id))

  const [org] = await db.select().from(organization).where(eq(organization.id, inv.organizationId)).limit(1)

  return {
    organizationId: inv.organizationId,
    organizationName: org?.name || inv.organizationId,
    email,
    note: '已接受邀请并设置登录密码。请重新登录后进入控制台。',
    requireRelogin: true as const,
  }
}
