import { auth } from '@/lib/auth'
import { isPlatformAdminUserId } from '@/lib/auth/platform-admin'
import { Routes } from '@/lib/routes'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export async function requirePlatformAdmin(callbackUrl = Routes.Console) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session == null) {
    redirect(`${Routes.Login}?callbackUrl=${encodeURIComponent(callbackUrl)}`)
  }
  if (!(await isPlatformAdminUserId(session.user.id))) {
    redirect('/forbidden')
  }
  return {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    image: session.user.image ?? null,
  }
}
