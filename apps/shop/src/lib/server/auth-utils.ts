import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { getOnboardingState } from '@/lib/server/dataaccess/onboarding'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export async function requireAuth(
  redirectHref: string = '/signin'
): Promise<undefined> {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (session == null) return redirect(redirectHref)
}

/**
 * 控制台与设置区共用入口门槛：登录 + 入驻已提交/通过，否则跳登录或入驻向导。
 */
export async function requireOnboardedAuth(
  redirectHref: string
): Promise<undefined> {
  await requireAuth(redirectHref)
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  if (session?.user) {
    const activeOrganizationId =
      (session as { session?: { activeOrganizationId?: string | null } }).session
        ?.activeOrganizationId ?? null
    const onboarding = await getOnboardingState(
      db,
      session.user.id,
      activeOrganizationId,
    )
    if (onboarding.status !== 'submitted' && onboarding.status !== 'approved') {
      return redirect('/onboarding')
    }
  }
}

export async function requireUnauth(
  redirectHref: string = '/console'
): Promise<undefined> {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (session != null) return redirect(redirectHref)
}

export async function getSession() {
  return auth.api.getSession({
    headers: await headers(),
  })
}
