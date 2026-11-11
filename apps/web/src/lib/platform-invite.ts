import type { PlatformRole } from '@workspace/auth'

export const DEFAULT_PLATFORM_INVITE_ROLE: PlatformRole = 'platform_operator'

export const PLATFORM_INVITE_ROLE_LABELS: Record<PlatformRole, string> = {
  platform_admin: '平台管理员',
  platform_operator: '平台运营',
  platform_finance: '平台财务',
}
