/**
 * 将店铺 OAuth / 绑定失败映射为平台运营可看的错误码、原因与操作意见。
 * 不输出 token、密钥或其它敏感字段。
 */

const SENSITIVE_INLINE =
  /((?:access_token|refresh_token|id_token|client_secret|app_secret|authorization|api[_-]?key)\s*[:=]\s*\S+|bearer\s+[a-z0-9._\-]+)/gi

export const OAUTH_ERROR_CODES = [
  'shop_bound_other_org',
  'shop_identity_unavailable',
  'authorization_rejected',
  'state_expired',
  'invalid_callback',
  'app_credential_invalid',
  'callback_key_mismatch',
  'token_exchange_failed',
  'network_timeout',
  'onboarding_not_approved',
  'shop_not_found',
  'shop_platform_mismatch',
  'oauth_failed',
] as const

export type OAuthErrorCode = (typeof OAUTH_ERROR_CODES)[number]

export type OAuthFailureAdvice = {
  code: OAuthErrorCode
  reason: string
  advice: string
}

const ADVICE: Record<OAuthErrorCode, { reason: string; advice: string }> = {
  shop_bound_other_org: {
    reason: '该平台店铺已绑定到其他租户，后来者授权已被拒绝。',
    advice: '前往「店铺冲突」队列处理：默认维持原绑定；若已核实主体变更，填写原因后批准转移。不要让后来者重复授权覆盖。',
  },
  shop_identity_unavailable: {
    reason: '换码后未能识别平台店铺身份（拿不到店铺 ID）。',
    advice: '检查平台接口与卖家资料是否返回店铺 ID，确认授权账号已开通对应站点店铺后，请租户重新授权。',
  },
  authorization_rejected: {
    reason: '用户在平台授权页取消或拒绝了授权。',
    advice: '请租户重新发起授权，并在平台页面点击同意。',
  },
  state_expired: {
    reason: '授权状态已过期，或回调与发起授权时的状态不一致。',
    advice: '请租户重新发起授权，不要使用过期链接，也不要重复刷新回调页。',
  },
  invalid_callback: {
    reason: 'OAuth 回调缺少授权码或状态参数，回调无效。',
    advice: '请租户重新发起授权；若持续出现，核对平台应用的回调地址配置。',
  },
  app_credential_invalid: {
    reason: '平台应用凭据无效、未配置或不匹配。',
    advice: '检查该平台的应用配置（App Key / App Secret、站点与回调地址）后，请租户重新授权。',
  },
  callback_key_mismatch: {
    reason: '回调地址中的 callback key 与平台应用配置不一致。',
    advice: '核对平台应用配置里的回调地址与 callback key，修正后再请租户重新授权。',
  },
  token_exchange_failed: {
    reason: '用授权码向平台换取令牌失败。',
    advice: '请租户重新发起授权；若持续失败，检查应用凭据与回调地址是否匹配。',
  },
  network_timeout: {
    reason: '连接平台超时或网络异常。',
    advice: '请租户稍后重试；若持续超时，检查与平台 API 的网络连通性。',
  },
  onboarding_not_approved: {
    reason: '租户入驻尚未通过，不能完成店铺授权。',
    advice: '先完成该租户的入驻审核，通过后再请对方绑定店铺。',
  },
  shop_not_found: {
    reason: '回调对应的店铺草稿不存在或已删除。',
    advice: '请租户重新添加店铺并发起授权。',
  },
  shop_platform_mismatch: {
    reason: '回调平台与店铺记录的平台不一致。',
    advice: '核对店铺平台后，请租户在正确的平台重新发起授权。',
  },
  oauth_failed: {
    reason: '平台授权失败。',
    advice: '查看错误详情与最近集成日志，必要时请租户重新授权。',
  },
}

export function sanitizeOAuthText(value: string | null | undefined): string {
  if (!value) return ''
  return value.replace(SENSITIVE_INLINE, '[已隐藏]').slice(0, 1000)
}

export function isOAuthErrorCode(value: string | null | undefined): value is OAuthErrorCode {
  return Boolean(value && (OAUTH_ERROR_CODES as readonly string[]).includes(value))
}

function blobOf(parts: Array<string | null | undefined>): string {
  return parts
    .filter((part): part is string => Boolean(part))
    .join(' ')
    .toLowerCase()
}

export function classifyOAuthFailure(input: {
  reason?: string | null
  message?: string | null
  queryError?: string | null
  lastError?: string | null
}): OAuthFailureAdvice {
  const explicit = [input.reason, input.lastError]
    .map((value) => value?.trim())
    .find((value): value is string => Boolean(value))
  if (explicit && isOAuthErrorCode(explicit)) {
    return { code: explicit, ...ADVICE[explicit] }
  }
  if (explicit === 'shop_already_bound_other_org' || explicit === 'shop_bound_other_org') {
    return { code: 'shop_bound_other_org', ...ADVICE.shop_bound_other_org }
  }

  const blob = blobOf([input.reason, input.message, input.queryError, input.lastError])

  if (
    blob.includes('shop_bound') ||
    blob.includes('already_bound') ||
    blob.includes('other_org') ||
    blob.includes('cross-tenant') ||
    blob.includes('已绑定到其他租户')
  ) {
    return { code: 'shop_bound_other_org', ...ADVICE.shop_bound_other_org }
  }
  if (
    blob.includes('shop_identity') ||
    blob.includes('missing_external_shop') ||
    blob.includes('getshop') ||
    blob.includes('无法识别平台店铺')
  ) {
    return { code: 'shop_identity_unavailable', ...ADVICE.shop_identity_unavailable }
  }
  if (
    blob.includes('access_denied') ||
    blob.includes('authorization_rejected') ||
    blob.includes('已取消授权') ||
    blob.includes('user denied') ||
    /\bcancel/.test(blob)
  ) {
    return { code: 'authorization_rejected', ...ADVICE.authorization_rejected }
  }
  if (
    blob.includes('state expired') ||
    blob.includes('state_expired') ||
    blob.includes('oauth state expired') ||
    blob.includes('nonce')
  ) {
    return { code: 'state_expired', ...ADVICE.state_expired }
  }
  if (
    blob.includes('invalid oauth callback') ||
    blob.includes('invalid_callback') ||
    blob.includes('missing code')
  ) {
    return { code: 'invalid_callback', ...ADVICE.invalid_callback }
  }
  if (blob.includes('callback_key_mismatch') || blob.includes('callback key')) {
    return { code: 'callback_key_mismatch', ...ADVICE.callback_key_mismatch }
  }
  if (
    blob.includes('app_credential') ||
    blob.includes('invalid_client') ||
    blob.includes('invalid app') ||
    blob.includes('client_secret')
  ) {
    return { code: 'app_credential_invalid', ...ADVICE.app_credential_invalid }
  }
  if (
    blob.includes('etimedout') ||
    blob.includes('econnreset') ||
    blob.includes('econnrefused') ||
    blob.includes('network') ||
    blob.includes('timeout') ||
    blob.includes('超时')
  ) {
    return { code: 'network_timeout', ...ADVICE.network_timeout }
  }
  if (blob.includes('onboarding')) {
    return { code: 'onboarding_not_approved', ...ADVICE.onboarding_not_approved }
  }
  if (blob.includes('shop_not_found') || blob.includes('店铺不存在')) {
    return { code: 'shop_not_found', ...ADVICE.shop_not_found }
  }
  if (blob.includes('shop_platform_mismatch') || blob.includes('platform mismatch')) {
    return { code: 'shop_platform_mismatch', ...ADVICE.shop_platform_mismatch }
  }
  if (
    blob.includes('token_exchange') ||
    blob.includes('invalid_grant') ||
    blob.includes('exchange')
  ) {
    return { code: 'token_exchange_failed', ...ADVICE.token_exchange_failed }
  }

  const fallbackReason = sanitizeOAuthText(input.message) || ADVICE.oauth_failed.reason
  return {
    code: 'oauth_failed',
    reason: fallbackReason,
    advice: ADVICE.oauth_failed.advice,
  }
}

export function redactOAuthPayload(raw: string | null | undefined): Record<string, unknown> {
  if (!raw?.trim()) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    return redactUnknown(parsed) as Record<string, unknown>
  } catch {
    return { raw: sanitizeOAuthText(raw) }
  }
}

function redactUnknown(value: unknown): unknown {
  if (value == null) return value
  if (typeof value === 'string') return sanitizeOAuthText(value)
  if (Array.isArray(value)) return value.map(redactUnknown)
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (/token|secret|password|authorization|credential|payload[_-]?encrypted/i.test(key)) {
        out[key] = '[已隐藏]'
        continue
      }
      out[key] = redactUnknown(nested)
    }
    return out
  }
  return value
}
