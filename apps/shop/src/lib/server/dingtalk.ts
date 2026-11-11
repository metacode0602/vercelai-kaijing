/**
 * 钉钉自定义机器人文案发送。
 * 仅允许官方 Webhook 域名，避免把组织密钥 POST 到任意 URL。
 */
import { maskToken } from '@workspace/marketplace'

const ALLOWED_HOSTS = new Set(['oapi.dingtalk.com', 'api.dingtalk.com'])

export function validateDingTalkWebhookUrl(raw: string): URL {
  const value = raw.trim()
  if (!value) throw new Error('请填写钉钉 Webhook 地址')
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('Webhook 地址格式不正确')
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Webhook 必须使用 https')
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error('Webhook 域名必须是 oapi.dingtalk.com 或 api.dingtalk.com')
  }
  if (!parsed.pathname.includes('/robot/send')) {
    throw new Error('Webhook 路径应为钉钉自定义机器人 /robot/send')
  }
  const token = parsed.searchParams.get('access_token')?.trim()
  if (!token) {
    throw new Error('Webhook 缺少 access_token')
  }
  return parsed
}

export function maskDingTalkWebhookUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const parsed = new URL(raw)
    const token = parsed.searchParams.get('access_token')
    if (token) parsed.searchParams.set('access_token', maskToken(token, 4))
    return parsed.toString()
  } catch {
    return maskToken(raw, 4)
  }
}

export async function postDingTalkText(
  webhookUrl: string,
  content: string,
): Promise<{ ok: true; errmsg: string }> {
  const parsed = validateDingTalkWebhookUrl(webhookUrl)
  const text = content.trim()
  if (!text) throw new Error('通知内容不能为空')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  let response: Response
  try {
    response = await fetch(parsed.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        msgtype: 'text',
        text: { content: text },
      }),
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('钉钉 Webhook 请求超时')
    }
    throw new Error(error instanceof Error ? `钉钉 Webhook 请求失败：${error.message}` : '钉钉 Webhook 请求失败')
  } finally {
    clearTimeout(timer)
  }

  const rawBody = await response.text()
  let payload: { errcode?: number; errmsg?: string } = {}
  try {
    payload = rawBody ? (JSON.parse(rawBody) as { errcode?: number; errmsg?: string }) : {}
  } catch {
    if (!response.ok) {
      throw new Error(`钉钉 Webhook 返回 HTTP ${response.status}`)
    }
    throw new Error('钉钉 Webhook 返回了无法解析的响应')
  }

  if (!response.ok || (payload.errcode != null && payload.errcode !== 0)) {
    throw new Error(payload.errmsg?.trim() || `钉钉 Webhook 返回失败（HTTP ${response.status}）`)
  }
  return { ok: true, errmsg: payload.errmsg || 'ok' }
}
