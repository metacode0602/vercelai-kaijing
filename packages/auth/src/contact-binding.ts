import { createHash, randomInt } from 'node:crypto'
import { and, eq, ne } from 'drizzle-orm'
import { user, verification } from '@workspace/db/schema'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = any

/** 绑定渠道：邮箱 / 手机号。二者在同一 realm 内始终指向同一个 userId。 */
export type ContactChannel = 'email' | 'phone'

const IDENTIFIER_PREFIX: Record<ContactChannel, string> = {
  email: 'bind-email:',
  phone: 'bind-phone:',
}

const CODE_TTL_MS = 5 * 60 * 1000
const MAX_ATTEMPTS = 5
const CODE_LENGTH = 6

export const CONTACT_CODE_TTL_MINUTES = CODE_TTL_MS / 60000

function newId(): string {
  return crypto.randomUUID()
}

/** 验证码只存哈希，数据库泄露时无法反推出明文验证码。 */
function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

/**
 * 判断邮箱是否为手机号生成的占位邮箱（`13800138000@gpurun.cn`）。
 * 这类邮箱无法收信，等同于「未绑定邮箱」。
 */
export function isSyntheticPhoneEmail(
  email: string | null | undefined,
  phoneNumber: string | null | undefined
): boolean {
  const normalizedEmail = email?.trim().toLowerCase()
  const normalizedPhone = phoneNumber?.trim()
  if (!normalizedEmail || !normalizedPhone) return false

  const separatorIndex = normalizedEmail.lastIndexOf('@')
  if (separatorIndex <= 0) return false

  return normalizedEmail.slice(0, separatorIndex) === normalizedPhone
}

export type ContactUser = { email?: string | null; phoneNumber?: string | null }

/** 账号是否已绑定可收信的邮箱。 */
export function hasBoundEmail(contact: ContactUser): boolean {
  const email = contact.email?.trim()
  if (!email) return false
  return !isSyntheticPhoneEmail(email, contact.phoneNumber)
}

/** 账号是否已绑定手机号。 */
export function hasBoundPhone(contact: ContactUser): boolean {
  return Boolean(contact.phoneNumber?.trim())
}

/** 该渠道是否已绑定完成。 */
export function isChannelBound(channel: ContactChannel, contact: ContactUser): boolean {
  return channel === 'email' ? hasBoundEmail(contact) : hasBoundPhone(contact)
}

/** 生成绑定验证码（6 位数字）。 */
export function generateContactCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0')
}

/**
 * 归一化手机号：仅保留数字；带 86 国际区号时去掉前缀。
 * 只在去掉前缀后恰好是 11 位国内号码时才剥离，避免把异常长度的输入
 * 静默截断成另一个号码（那样会破坏「同号同 userId」）。
 */
export function normalizeContactPhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length > 11 && digits.startsWith('86')) {
    const withoutCountryCode = digits.slice(2)
    if (withoutCountryCode.length === 11) return withoutCountryCode
  }
  return digits
}

export function buildContactIdentifier(
  channel: ContactChannel,
  userId: string,
  target: string
): string {
  return `${IDENTIFIER_PREFIX[channel]}${userId}:${target}`
}

export function parseContactIdentifier(
  identifier: string
): { channel: ContactChannel; userId: string; target: string } | null {
  for (const channel of ['email', 'phone'] as const) {
    const prefix = IDENTIFIER_PREFIX[channel]
    if (!identifier.startsWith(prefix)) continue

    const payload = identifier.slice(prefix.length)
    const separatorIndex = payload.indexOf(':')
    if (separatorIndex <= 0) return null

    const userId = payload.slice(0, separatorIndex)
    const target = payload.slice(separatorIndex + 1)
    if (!target) return null

    return { channel, userId, target }
  }

  return null
}

/** 写入绑定验证码（同一用户 + 同一渠道 + 同一目标只保留最新一条）。 */
export async function issueContactCode(
  db: Database,
  params: { channel: ContactChannel; userId: string; target: string; code: string }
): Promise<void> {
  const identifier = buildContactIdentifier(params.channel, params.userId, params.target)

  await db.delete(verification).where(eq(verification.identifier, identifier))
  await db.insert(verification).values({
    id: newId(),
    identifier,
    value: `${hashCode(params.code)}:0`,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  })
}

export type VerifyCodeResult = 'ok' | 'invalid' | 'expired' | 'too-many-attempts'

/** 校验并消费绑定验证码；错误次数超限后验证码立即作废。 */
export async function verifyContactCode(
  db: Database,
  params: { channel: ContactChannel; userId: string; target: string; code: string }
): Promise<VerifyCodeResult> {
  const identifier = buildContactIdentifier(params.channel, params.userId, params.target)

  const rows = (await db
    .select({ value: verification.value, expiresAt: verification.expiresAt })
    .from(verification)
    .where(eq(verification.identifier, identifier))
    .limit(1)) as Array<{ value: string; expiresAt: Date }>

  const row = rows[0]
  if (!row) return 'invalid'

  if (!row.expiresAt || row.expiresAt.getTime() < Date.now()) {
    await db.delete(verification).where(eq(verification.identifier, identifier))
    return 'expired'
  }

  const [storedHash, attemptsRaw] = row.value.split(':')
  const attempts = Number(attemptsRaw ?? 0)
  if (!Number.isFinite(attempts) || attempts >= MAX_ATTEMPTS) {
    await db.delete(verification).where(eq(verification.identifier, identifier))
    return 'too-many-attempts'
  }

  if (storedHash !== hashCode(params.code)) {
    await db
      .update(verification)
      .set({ value: `${storedHash}:${attempts + 1}` })
      .where(eq(verification.identifier, identifier))
    return 'invalid'
  }

  await db.delete(verification).where(eq(verification.identifier, identifier))
  return 'ok'
}

export type BindResult = 'ok' | 'taken' | 'user-not-found'

/**
 * 把邮箱绑定到指定用户。邮箱已被其他用户占用时返回 `taken`。
 * 绑定后 `emailVerified` 置为 true——验证码已发到该邮箱。
 */
export async function bindEmailToUser(
  db: Database,
  params: { userId: string; email: string }
): Promise<BindResult> {
  const email = params.email.trim().toLowerCase()

  const conflict = (await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.email, email), ne(user.id, params.userId)))
    .limit(1)) as Array<{ id: string }>

  if (conflict.length > 0) return 'taken'

  const updated = (await db
    .update(user)
    .set({ email, emailVerified: true })
    .where(eq(user.id, params.userId))
    .returning({ id: user.id })) as Array<{ id: string }>

  return updated.length > 0 ? 'ok' : 'user-not-found'
}

/**
 * 把手机号绑定到指定用户。手机号已被其他用户占用时返回 `taken`。
 */
export async function bindPhoneToUser(
  db: Database,
  params: { userId: string; phone: string }
): Promise<BindResult> {
  const conflict = (await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.phoneNumber, params.phone), ne(user.id, params.userId)))
    .limit(1)) as Array<{ id: string }>

  if (conflict.length > 0) return 'taken'

  const updated = (await db
    .update(user)
    .set({ phoneNumber: params.phone, phoneNumberVerified: true })
    .where(eq(user.id, params.userId))
    .returning({ id: user.id })) as Array<{ id: string }>

  return updated.length > 0 ? 'ok' : 'user-not-found'
}

/**
 * 从 Cookie 请求头解析语言标识；缺失或不在白名单内时回退到默认语言。
 * 用于让验证码邮件跟随用户当前语言。
 */
export function resolveLocaleFromCookieHeader<T extends string>(
  cookieHeader: string | null | undefined,
  options: { cookieName: string; locales: readonly T[]; fallback: T }
): T {
  if (!cookieHeader) return options.fallback

  const target = `${options.cookieName}=`
  for (const part of cookieHeader.split(';')) {
    const segment = part.trim()
    if (!segment.startsWith(target)) continue

    const value = decodeURIComponent(segment.slice(target.length))
    return options.locales.includes(value as T) ? (value as T) : options.fallback
  }

  return options.fallback
}
