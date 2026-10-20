import { normalizeContactPhone } from '@workspace/auth'

/**
 * 手机号归一化统一走 @workspace/auth，避免同一账号在员工管理与
 * 账号绑定流程中出现两种手机号格式。
 */
export function normalizePhone(value: string): string {
  return normalizeContactPhone(value)
}
