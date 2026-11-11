/**
 * 将 OAuth 回调失败整理为可入库、可供运营查看的错误码与文案。
 * 不写入 token、密钥或其它敏感字段。
 */

const SENSITIVE_INLINE =
  /((?:access_token|refresh_token|id_token|client_secret|app_secret|authorization|api[_-]?key)\s*[:=]\s*\S+|bearer\s+[a-z0-9._\-]+)/gi

export type OAuthFailureCode =
  | 'shop_bound_other_org'
  | 'shop_identity_unavailable'
  | 'authorization_rejected'
  | 'state_expired'
  | 'invalid_callback'
  | 'app_credential_invalid'
  | 'callback_key_mismatch'
  | 'token_exchange_failed'
  | 'network_timeout'
  | 'onboarding_not_approved'
  | 'shop_not_found'
  | 'shop_platform_mismatch'
  | 'oauth_failed'

const MESSAGES: Record<OAuthFailureCode, string> = {
  shop_bound_other_org: '该平台店铺已绑定到其他租户，本次授权已被拒绝。',
  shop_identity_unavailable: '无法识别平台店铺身份，已拒绝保存授权。',
  authorization_rejected: '用户取消或拒绝了平台授权。',
  state_expired: '授权状态已过期或回调校验失败。',
  invalid_callback: 'OAuth 回调缺少授权码或状态参数。',
  app_credential_invalid: '平台应用凭据无效或未配置。',
  callback_key_mismatch: '回调地址中的 callback key 与应用配置不一致。',
  token_exchange_failed: '授权换码失败。',
  network_timeout: '连接平台超时或网络异常。',
  onboarding_not_approved: '租户入驻尚未通过，不能完成店铺授权。',
  shop_not_found: '回调对应的店铺不存在或已删除。',
  shop_platform_mismatch: '回调平台与店铺记录的平台不一致。',
  oauth_failed: '平台授权失败。',
}

export function sanitizeOAuthFailureText(value: string | null | undefined): string {
  if (!value) return ''
  return value.replace(SENSITIVE_INLINE, '[已隐藏]').slice(0, 1000)
}

function blobOf(parts: Array<string | null | undefined>): string {
  return parts.filter((part): part is string => Boolean(part)).join(' ').toLowerCase()
}

export function classifyOAuthFailureCode(input: {
  reason?: string | null
  message?: string | null
  queryError?: string | null
}): { code: OAuthFailureCode; message: string } {
  const explicit = input.reason?.trim()
  if (explicit === 'shop_already_bound_other_org' || explicit === 'shop_bound_other_org') {
    return { code: 'shop_bound_other_org', message: MESSAGES.shop_bound_other_org }
  }
  if (explicit && explicit in MESSAGES) {
    return {
      code: explicit as OAuthFailureCode,
      message: MESSAGES[explicit as OAuthFailureCode],
    }
  }

  const blob = blobOf([input.reason, input.message, input.queryError])
  let code: OAuthFailureCode = 'oauth_failed'
  if (
    blob.includes('shop_bound') ||
    blob.includes('already_bound') ||
    blob.includes('other_org') ||
    blob.includes('cross-tenant')
  ) {
    code = 'shop_bound_other_org'
  } else if (
    blob.includes('shop_identity') ||
    blob.includes('missing_external_shop') ||
    blob.includes('getshop') ||
    blob.includes('无法识别平台店铺')
  ) {
    code = 'shop_identity_unavailable'
  } else if (
    blob.includes('access_denied') ||
    blob.includes('authorization_rejected') ||
    blob.includes('已取消授权') ||
    /\bcancel/.test(blob)
  ) {
    code = 'authorization_rejected'
  } else if (
    blob.includes('state expired') ||
    blob.includes('state_expired') ||
    blob.includes('oauth state expired') ||
    blob.includes('nonce')
  ) {
    code = 'state_expired'
  } else if (
    blob.includes('invalid oauth callback') ||
    blob.includes('invalid_callback') ||
    blob.includes('missing code')
  ) {
    code = 'invalid_callback'
  } else if (blob.includes('callback_key_mismatch') || blob.includes('callback key')) {
    code = 'callback_key_mismatch'
  } else if (
    blob.includes('app_credential') ||
    blob.includes('invalid_client') ||
    blob.includes('invalid app')
  ) {
    code = 'app_credential_invalid'
  } else if (
    blob.includes('etimedout') ||
    blob.includes('econnreset') ||
    blob.includes('econnrefused') ||
    blob.includes('timeout') ||
    blob.includes('超时')
  ) {
    code = 'network_timeout'
  } else if (blob.includes('onboarding')) {
    code = 'onboarding_not_approved'
  } else if (blob.includes('shop_not_found')) {
    code = 'shop_not_found'
  } else if (blob.includes('shop_platform_mismatch') || blob.includes('platform mismatch')) {
    code = 'shop_platform_mismatch'
  } else if (
    blob.includes('token_exchange') ||
    blob.includes('invalid_grant') ||
    blob.includes('exchange')
  ) {
    code = 'token_exchange_failed'
  }

  return { code, message: MESSAGES[code] }
}

export function safeOAuthFailureDetail(detail?: Record<string, unknown> | null) {
  if (!detail) return undefined
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(detail)) {
    if (/token|secret|password|authorization|credential|payload[_-]?encrypted/i.test(key)) {
      continue
    }
    if (typeof value === 'string') out[key] = sanitizeOAuthFailureText(value)
    else if (value == null || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value
    }
  }
  return out
}
