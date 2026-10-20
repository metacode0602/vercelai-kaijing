import 'server-only'

import type { FeishuRuntimeConfig } from './config'

const FEISHU_BASE_URL = 'https://open.feishu.cn/open-apis'

type TenantTokenResponse = {
  code: number
  msg: string
  tenant_access_token?: string
  expire?: number
}

type FeishuApiResponse<T> = {
  code: number
  msg: string
  data?: T
}

let cachedToken: { token: string; expiresAt: number } | null = null

export class FeishuApiError extends Error {
  constructor(
    public readonly code: number,
    public readonly rawMessage: string,
    public readonly path?: string,
  ) {
    super(formatFeishuApiErrorMessage(code, rawMessage, path))
    this.name = 'FeishuApiError'
  }
}

export function isFeishuBitablePermissionError(code: number, msg: string): boolean {
  if (code === 1254302 || code === 1254032 || code === 1254304) return true
  const lower = msg.toLowerCase()
  return (
    lower.includes('no permission') ||
    lower.includes('permission denied') ||
    lower.includes('permision') ||
    lower.includes('roleperm')
  )
}

export function formatFeishuApiErrorMessage(code: number, msg: string, path?: string): string {
  if (isFeishuBitablePermissionError(code, msg)) {
    return [
      '飞书多维表格拒绝访问（这不是 CRM 管理员权限问题）。',
      '该多维表格可能已开启「高级权限」，飞书应用尚未被授权访问。请任选一种方式处理：',
      '1. 打开多维表格 → 右上角「…」→「添加文档应用」，添加本系统使用的飞书应用并授予「可管理」；',
      '2. 或在「高级权限」中将含该应用的群组加入角色并授予读/写权限；',
      '3. 确认飞书开放平台已为应用开通 bitable:app 或 base:table:read 等 API 权限。',
      '也可在环境变量 FEISHU_USER_ACCESS_TOKEN 中配置有表格权限的用户 token 作为回退。',
      `（飞书错误码 ${code}${path ? ` · ${path}` : ''}：${msg}）`,
    ].join('\n')
  }
  return msg || `飞书 API 失败${path ? `: ${path}` : ''}（错误码 ${code}）`
}

export async function fetchFeishuTenantAccessToken(config: FeishuRuntimeConfig): Promise<string> {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.token
  }

  const res = await fetch(`${FEISHU_BASE_URL}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret }),
    cache: 'no-store',
  })
  const json = (await res.json()) as TenantTokenResponse
  if (json.code !== 0 || !json.tenant_access_token) {
    throw new Error(json.msg || '获取飞书 tenant_access_token 失败')
  }
  cachedToken = {
    token: json.tenant_access_token,
    expiresAt: now + (json.expire ?? 7200) * 1000,
  }
  return json.tenant_access_token
}

async function executeFeishuApiRequest<T>(
  accessToken: string,
  method: 'GET' | 'POST',
  path: string,
  options?: { body?: unknown; query?: Record<string, string | number | undefined> },
): Promise<T> {
  const url = new URL(`${FEISHU_BASE_URL}${path}`)
  if (options?.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value != null && value !== '') {
        url.searchParams.set(key, String(value))
      }
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: options?.body != null ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  })
  const json = (await res.json()) as FeishuApiResponse<T>
  if (json.code !== 0) {
    throw new FeishuApiError(json.code, json.msg, path)
  }
  return json.data as T
}

export async function feishuApiRequest<T>(
  config: FeishuRuntimeConfig,
  method: 'GET' | 'POST',
  path: string,
  options?: { body?: unknown; query?: Record<string, string | number | undefined> },
): Promise<T> {
  const tenantToken = await fetchFeishuTenantAccessToken(config)

  try {
    return await executeFeishuApiRequest<T>(tenantToken, method, path, options)
  } catch (error) {
    const userAccessToken = config.userAccessToken?.trim()
    if (
      userAccessToken &&
      error instanceof FeishuApiError &&
      isFeishuBitablePermissionError(error.code, error.rawMessage)
    ) {
      return await executeFeishuApiRequest<T>(userAccessToken, method, path, options)
    }
    throw error
  }
}
