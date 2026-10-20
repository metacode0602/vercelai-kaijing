import { NextResponse } from 'next/server'
import { realmSignIn, signSessionCookie } from '@workspace/auth'
import { db } from '@/lib/db'
import { auth, ensureTenantOrganization } from '@/lib/auth'

export async function POST(req: Request) {
  try {
    const { email, phoneNumber, password } = await req.json()

    if (!email && !phoneNumber) {
      return NextResponse.json({ error: '请提供邮箱或手机号' }, { status: 400 })
    }
    if (!password) {
      return NextResponse.json({ error: '请输入密码' }, { status: 400 })
    }

    const result = await realmSignIn({
      db,
      realm: 'gpus',
      email,
      phoneNumber,
      password,
    })

    const authCtx = await auth.$context as {
      internalAdapter: { createSession: (userId: string, dontRememberMe?: boolean, override?: { activeOrganizationId: string }) => Promise<{ token: string }> }
      authCookies: { sessionToken: { name: string; attributes: Record<string, unknown> } }
      secret: string
    }

    const activeOrgId = await ensureTenantOrganization(result.userId)

    const session = await authCtx.internalAdapter.createSession(result.userId, false, { activeOrganizationId: activeOrgId })

    const response = NextResponse.json({ success: true, userId: result.userId })

    if (session?.token) {
      const signedCookie = await signSessionCookie(
        authCtx.authCookies.sessionToken.name,
        session.token,
        authCtx.secret,
        authCtx.authCookies.sessionToken.attributes as Parameters<typeof signSessionCookie>[3],
      )
      response.headers.append('set-cookie', signedCookie)
    }

    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : '登录失败'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
