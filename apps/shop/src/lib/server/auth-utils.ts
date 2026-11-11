import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  LAST_ORGANIZATION_COOKIE,
  readCookieFromHeader,
} from '@/lib/organization/constants'
import { countPendingInvitationsForUser } from '@/lib/server/dataaccess/members'
import { getOnboardingState } from '@/lib/server/dataaccess/onboarding'
import { resolveOrganizationContext } from '@/lib/server/context'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

type AuthSession = Awaited<ReturnType<typeof auth.api.getSession>>

function pickActiveOrganizationId(session: AuthSession): string | null {
  const value = session as {
    session?: { activeOrganizationId?: string | null }
    user?: { activeOrganizationId?: string | null }
  } | null
  return value?.session?.activeOrganizationId ?? value?.user?.activeOrganizationId ?? null
}

async function resolveRequestOrganization() {
  const requestHeaders = await headers()
  const session = await auth.api.getSession({ headers: requestHeaders })
  if (!session?.user) {
    return {
      session: null,
      organizationId: null,
      organizationRole: null,
      memberships: [],
    }
  }
  const lastOrganizationId = readCookieFromHeader(
    requestHeaders.get('cookie'),
    LAST_ORGANIZATION_COOKIE,
  )
  const resolved = await resolveOrganizationContext({
    userId: session.user.id,
    activeOrganizationId: pickActiveOrganizationId(session),
    lastOrganizationId,
  })
  return { session, ...resolved }
}

export async function requireAuth(
  redirectHref: string = '/signin'
): Promise<undefined> {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (session == null) return redirect(redirectHref)
}

/**
 * 控制台与设置区共用入口门槛：登录 + 当前组织入驻已提交/通过。
 * 0 组织且有邀请 → 组织选择/邀请中心；无邀请 → 入驻向导。
 * 多组织无有效 active → 组织选择页。
 */
export async function requireOnboardedAuth(
  redirectHref: string
): Promise<undefined> {
  await requireAuth(redirectHref)
  const { session, organizationId, memberships } = await resolveRequestOrganization()
  if (!session?.user) return redirect(redirectHref)

  if (!organizationId) {
    if (memberships.length > 0) return redirect('/select-org')
    const pendingInvitations = await countPendingInvitationsForUser(db, session.user.id)
    return redirect(pendingInvitations > 0 ? '/select-org' : '/onboarding')
  }

  const onboarding = await getOnboardingState(db, session.user.id, organizationId)
  if (!onboarding.organizationId) return redirect('/select-org')
  if (onboarding.organizationStatus !== 'active') {
    return redirect('/select-org?error=suspended')
  }
  if (onboarding.status !== 'submitted' && onboarding.status !== 'approved') {
    return redirect('/onboarding')
  }
}

/**
 * 入驻向导入口：已有已提交/通过的组织时回控制台；多组织无 active 时先选择组织。
 * 新用户（0 组织、0 邀请）允许进入向导创建首个组织。
 */
export async function requireOnboardingEntry(
  redirectHref: string = '/signin?callbackUrl=%2Fonboarding',
): Promise<undefined> {
  await requireAuth(redirectHref)
  const { session, organizationId, memberships } = await resolveRequestOrganization()
  if (!session?.user) return redirect(redirectHref)

  if (!organizationId) {
    if (memberships.length > 0) return redirect('/select-org')
    const pendingInvitations = await countPendingInvitationsForUser(db, session.user.id)
    if (pendingInvitations > 0) return redirect('/select-org')
    return
  }

  const onboarding = await getOnboardingState(db, session.user.id, organizationId)
  if (!onboarding.organizationId) return redirect('/select-org')
  if (onboarding.organizationStatus !== 'active') {
    return redirect('/select-org?error=suspended')
  }
  if (onboarding.status === 'submitted' || onboarding.status === 'approved') {
    return redirect('/console/dashboard')
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
