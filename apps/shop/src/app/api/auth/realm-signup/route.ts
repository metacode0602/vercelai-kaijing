import { NextResponse } from 'next/server'
import { realmSignUp, signSessionCookie } from '@workspace/auth'
import { db } from '@/lib/db'
import { auth, ensureTenantOrganization } from '@/lib/auth'
import { attributePromoSignup, getPromoCodeFromRequest } from '@/lib/server/promo-attribution'


const PROMO_CODE_COOKIE = 'gpurun_promo_code'

export async function POST(req: Request) {
  try {
    const { email, phoneNumber, password, name, promoCode: bodyPromoCode } = await req.json()

    if (!email && !phoneNumber) {
      return NextResponse.json({ error: '请提供邮箱或手机号' }, { status: 400 })
    }
    if (!password || password.length < 8) {
      return NextResponse.json({ error: '密码至少8位' }, { status: 400 })
    }
    if (!name || name.length < 2) {
      return NextResponse.json({ error: '姓名至少2个字符' }, { status: 400 })
    }

    // Use promo code from body or fallback to cookie
    const cookieHeader = req.headers.get('cookie')
    const promoCode = bodyPromoCode || getPromoCodeFromRequest(cookieHeader)

    const result = await realmSignUp({
      db,
      realm: 'gpus',
      email,
      phoneNumber,
      password,
      name,
    })

    const authCtx = await auth.$context as {
      internalAdapter: { createSession: (userId: string, dontRememberMe?: boolean, override?: { activeOrganizationId: string }) => Promise<{ token: string }> }
      authCookies: { sessionToken: { name: string; attributes: Record<string, unknown> } }
      secret: string
    }

    const orgId = await ensureTenantOrganization(result.userId)

    // 使用统一的归因服务（幂等）
    let attributed = false
    if (promoCode) {
      const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
        || req.headers.get('x-real-ip') 
        || undefined
      const userAgent = req.headers.get('user-agent') || undefined

      attributed = await attributePromoSignup({
        tenantOrgId: orgId,
        userId: result.userId,
        userEmail: email,
        userName: name,
        userPhone: phoneNumber,
        promoCode,
        ipAddress,
        userAgent,
      })
    }

    const session = await authCtx.internalAdapter.createSession(result.userId, false, { activeOrganizationId: orgId })

    const response = NextResponse.json({ success: true, userId: result.userId })

    // Set session cookie
    if (session?.token) {
      const signedCookie = await signSessionCookie(
        authCtx.authCookies.sessionToken.name,
        session.token,
        authCtx.secret,
        authCtx.authCookies.sessionToken.attributes as Parameters<typeof signSessionCookie>[3],
      )
      response.headers.append('set-cookie', signedCookie)
    }

    // Clear promo code cookie after successful attribution
    if (attributed) {
      response.headers.append('set-cookie', `${PROMO_CODE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`)
    }

    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : '注册失败'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
