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
  const message = err?.body?.message ?? err?.body?.code ?? (error instanceof Error ? error.message : '发送失败，请稍后再试')
  return NextResponse.json({ error: message }, { status })
}

/**
 * POST /api/auth/realm-forgot-password — 找回密码（发送重置邮件）。
 *
 * 历史表单契约：body { email }，成功返回 { success: true }，失败返回 { error }。
 * 无论邮箱是否存在都返回成功（防账号探测），由 better-auth 保证；
 * 邮件经 auth.ts 的 emailAndPassword.sendResetPassword 钩子发出。
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { email?: unknown }
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    if (!email) {
      return NextResponse.json({ error: '请输入有效的邮箱地址' }, { status: 400 })
    }

    const result = await auth.api.requestPasswordReset({
      body: { email, redirectTo: '/auth/reset-password' },
      headers: request.headers,
    })

    return NextResponse.json({ success: true, status: result?.status ?? true })
  } catch (error) {
    console.error('[auth] realm-forgot-password error:', error)
    return errorResponse(error)
  }
}
