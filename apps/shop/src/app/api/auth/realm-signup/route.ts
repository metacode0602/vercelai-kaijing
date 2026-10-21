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
  const message = err?.body?.message ?? err?.body?.code ?? (error instanceof Error ? error.message : '注册失败')
  return NextResponse.json({ error: message }, { status })
}

/**
 * POST /api/auth/realm-signup — 邮箱+密码注册（历史端点，保持 URL 与表单契约不变）。
 *
 * 历史实现走 realmSignUp + 手工建会话 + 租户组织/推广归因；当前以 better-auth
 * 原生 signUpEmail 等价实现（自动建号并下发会话 Cookie），失败返回 { error }。
 * 仅支持邮箱注册：手机号注册由 /login 的 OTP 流程承担（signUpOnVerification 自动建号）。
 */
export async function POST(req: Request) {
  try {
    const { email, phoneNumber, password, name } = (await req.json().catch(() => ({}))) as {
      email?: unknown
      phoneNumber?: unknown
      password?: unknown
      name?: unknown
    }

    if (!email && !phoneNumber) {
      return NextResponse.json({ error: '请提供邮箱或手机号' }, { status: 400 })
    }
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: '密码至少8位' }, { status: 400 })
    }
    if (typeof name !== 'string' || name.length < 2) {
      return NextResponse.json({ error: '姓名至少2个字符' }, { status: 400 })
    }
    if (typeof email !== 'string' || !email) {
      return NextResponse.json({ error: '请使用邮箱注册' }, { status: 400 })
    }

    const upstream = await auth.api.signUpEmail({
      body: { email, password, name },
      headers: req.headers,
      asResponse: true,
    })

    if (upstream.status >= 400) {
      const data = (await upstream.json().catch(() => null)) as
        | { message?: string; code?: string }
        | null
      const message = data?.message ?? data?.code ?? '注册失败'
      return NextResponse.json({ error: message }, { status: upstream.status })
    }

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: upstream.headers,
    })
  } catch (error) {
    console.error('[auth] realm-signup error:', error)
    return errorResponse(error)
  }
}
