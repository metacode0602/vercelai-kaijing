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
  const message = err?.body?.message ?? (error instanceof Error ? error.message : '请求失败，请稍后再试')
  return NextResponse.json({ message }, { status })
}

/**
 * POST /api/auth/request-password-reset — 找回密码（发送重置邮件）。
 *
 * 历史登录表单调用的端点；内部转发给 better-auth 原生 requestPasswordReset。
 * 无论邮箱是否存在都返回成功（防账号探测），由 better-auth 保证。
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      email?: unknown
      redirectTo?: unknown
    }
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    if (!email) {
      return NextResponse.json({ message: '请输入有效的邮箱地址' }, { status: 400 })
    }

    const result = await auth.api.requestPasswordReset({
      body: {
        email,
        redirectTo: typeof body.redirectTo === 'string' ? body.redirectTo : undefined,
      },
      headers: request.headers,
    })

    return NextResponse.json({
      status: result?.status ?? true,
      message: result?.message ?? '如果该邮箱已注册，重置链接已发送',
    })
  } catch (error) {
    console.error('[auth] request-password-reset error:', error)
    return errorResponse(error)
  }
}
