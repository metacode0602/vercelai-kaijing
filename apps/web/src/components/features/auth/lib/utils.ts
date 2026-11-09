import { auth } from '@/lib/auth'
import { isPlatformAdminUserId } from '@/lib/auth/platform-admin'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export async function requireAuth(
  redirectHref: string = '/signup'
): Promise<undefined> {
  const session = await auth.api.getSession({
    headers: await headers()
  })

  if (session == null) return redirect(redirectHref)
}

/**
 * 仅当「未登录」或「已登录但非平台管理员」时放行登录页：
 * 非平台管理员的旧会话留在登录页，重新登录后会被新会话覆盖；
 * 已登录的平台管理员跳走，避免登录页-受保护页互相踢。
 */
export async function requireUnauth(
  redirectHref: string = '/dashboard'
): Promise<undefined> {
  const session = await auth.api.getSession({
    headers: await headers()
  })

  if (session == null) return

  if (await isPlatformAdminUserId(session.user.id)) return redirect(redirectHref)
}
