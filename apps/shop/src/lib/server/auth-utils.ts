import { auth } from '@/lib/auth'
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
