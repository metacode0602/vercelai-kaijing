import {
  isSyntheticPhoneEmail,
  normalizeContactPhone,
  ORG_ROLES,
  type PlatformRole,
} from '@workspace/auth'
import { DEFAULT_PLATFORM_INVITE_ROLE, PLATFORM_INVITE_ROLE_LABELS } from '@/lib/platform-invite'

const PLATFORM_ROLE_SET = new Set<string>(ORG_ROLES.platform)

export function isValidCnMobile(phone: string) {
  return /^1[3-9]\d{9}$/.test(normalizeContactPhone(phone))
}

export function isValidInviteEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function resolvePlatformInviteRole(role?: string | null): PlatformRole {
  const raw = (role || '').trim()
  if (!raw) return DEFAULT_PLATFORM_INVITE_ROLE
  if (!PLATFORM_ROLE_SET.has(raw)) {
    throw new Error('邀请角色须为平台管理员、平台运营或平台财务')
  }
  return raw as PlatformRole
}

export function invitationEffectiveStatus(
  status: string,
  expiresAt: Date,
  now = new Date(),
) {
  if (status === 'pending' && expiresAt.getTime() < now.getTime()) return 'expired'
  return status
}

export function shouldBindInvitationEmail(input: {
  userEmail?: string | null
  userPhone?: string | null
  invitationEmail?: string | null
}) {
  const invitationEmail = input.invitationEmail?.trim().toLowerCase() || ''
  if (!invitationEmail) return false
  const current = input.userEmail?.trim().toLowerCase() || ''
  if (!current) return true
  if (current === invitationEmail) return false
  return isSyntheticPhoneEmail(current, input.userPhone)
}

export function platformInviteRoleLabel(role?: string | null) {
  if (role && role in PLATFORM_INVITE_ROLE_LABELS) {
    return PLATFORM_INVITE_ROLE_LABELS[role as PlatformRole]
  }
  return role || PLATFORM_INVITE_ROLE_LABELS[DEFAULT_PLATFORM_INVITE_ROLE]
}
