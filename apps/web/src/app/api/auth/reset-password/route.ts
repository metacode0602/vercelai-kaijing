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
  const err = error as { status?: unknown; body?: { message?: string }; message?: string }
  const rawStatus = err?.status
  const status =
    typeof rawStatus === 'number'
      ? rawStatus
      : typeof rawStatus === 'string'
        ? (STATUS_BY_CODE[rawStatus] ?? 400)
        : 400
  const message = err?.body?.message ?? (error instanceof Error ? error.message : '重置密码失败，请稍后再试')
  return NextResponse.json({ message }, { status })
}

/**
 * POST /api/auth/reset-password — 使用令牌重置密码。
 *
 * 历史重置密码表单调用的端点；内部转发给 better-auth 原生 resetPassword。
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      newPassword?: unknown
      token?: unknown
    }
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''
    const token = typeof body.token === 'string' ? body.token : ''
    if (!newPassword || !token) {
      return NextResponse.json({ message: '重置链接无效或已过期' }, { status: 400 })
    }

    const result = await auth.api.resetPassword({
      body: { newPassword, token },
      headers: request.headers,
    })

    return NextResponse.json({ status: result?.status ?? true })
  } catch (error) {
    console.error('[auth] reset-password error:', error)
    return errorResponse(error)
  }
}
