import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { organization } from '@workspace/db/schema'

export async function requireAuth(
  redirectHref: string = '/signin'
): Promise<undefined> {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (session == null) return redirect(redirectHref)
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

export async function requireTenant(
  redirectHref: string = '/signup'
): Promise<undefined> {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (session == null) return redirect('/signin')

  // No active organization/tenant → sign out and redirect to registration
  if (!session.session.activeOrganizationId) {
    await auth.api.signOut({
      headers: await headers(),
    })
    return redirect(redirectHref)
  }

  // Verify the active organization is a tenant type (not platform/supplier/merchant)
  const [org] = await db
    .select({ orgType: organization.orgType })
    .from(organization)
    .where(eq(organization.id, session.session.activeOrganizationId))
    .limit(1)

  if (!org || org.orgType !== 'tenant') {
    await auth.api.signOut({
      headers: await headers(),
    })
    return redirect(redirectHref)
  }
}
