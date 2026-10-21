import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const STATUS_BY_CODE: Record<string, number> = {
  BAD_REQUEST: 400,
  UNPROCESSABLE_ENTITY: 422,
  FORBIDDEN: 403,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
}

function errorResponse(error: unknown): NextResponse {
  const err = error as { status?: unknown; body?: { message?: string; code?: string }; message?: string }
  const rawStatus = err?.status
  const status =
    typeof rawStatus === 'number'
      ? rawStatus
      : typeof rawStatus === 'string'
        ? (STATUS_BY_CODE[rawStatus] ?? 400)
        : 400
  const message = err?.body?.message ?? err?.body?.code ?? (error instanceof Error ? error.message : '重置密码失败，请稍后再试')
  return NextResponse.json({ error: message }, { status })
}

/**
 * POST /api/auth/realm-reset-password — 使用令牌重置密码。
 *
 * 历史表单契约：body { token, password }，成功返回 { success: true }，失败返回 { error }。
 * 内部转发给 better-auth 原生 resetPassword（body { token, newPassword }）。
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      token?: unknown
      password?: unknown
    }
    const token = typeof body.token === 'string' ? body.token : ''
    const password = typeof body.password === 'string' ? body.password : ''
    if (!token || !password) {
      return NextResponse.json({ error: '重置链接无效或已过期' }, { status: 400 })
    }

    const result = await auth.api.resetPassword({
      body: { token, newPassword: password },
      headers: request.headers,
    })

    return NextResponse.json({ success: true, status: result?.status ?? true })
  } catch (error) {
    console.error('[auth] realm-reset-password error:', error)
    return errorResponse(error)
  }
}
