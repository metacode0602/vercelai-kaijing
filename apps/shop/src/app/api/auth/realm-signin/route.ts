import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

/**
 * 邮箱密码登录。路径与请求/响应契约保持最早实现
 * （{email,phoneNumber?,password} → 400 {error} | 200 {success,userId} + 会话 Cookie）；
 * 内部改为 better-auth signInEmail（credential 账号，与当前 /api/auth/realm-signup 一致）。
 * 手机号账号走 OTP 登录，不支持密码登录。
 */
export async function POST(req: Request) {
  try {
    const { email, phoneNumber, password } = await req.json()

    if (!email && !phoneNumber) {
      return NextResponse.json({ error: '请提供邮箱或手机号' }, { status: 400 })
    }
    if (!password) {
      return NextResponse.json({ error: '请输入密码' }, { status: 400 })
    }
    if (!email) {
      return NextResponse.json({ error: '账号或密码错误' }, { status: 400 })
    }

    const upstream = await auth.api.signInEmail({
      body: { email, password },
      headers: req.headers,
      asResponse: true,
    })

    if (!upstream.ok) {
      const body = (await upstream.json().catch(() => null)) as
        | { message?: string; code?: string }
        | null
      const raw = typeof body?.message === 'string' ? body.message : ''
      const error = /invalid email or password/i.test(raw) ? '账号或密码错误' : raw || '登录失败'
      return NextResponse.json({ error }, { status: 400 })
    }

    const payload = (await upstream.json()) as { user?: { id?: string } }
    const response = NextResponse.json({
      success: true,
      userId: payload?.user?.id ?? '',
    })
    for (const cookie of upstream.headers.getSetCookie()) {
      response.headers.append('set-cookie', cookie)
    }
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : '登录失败'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
