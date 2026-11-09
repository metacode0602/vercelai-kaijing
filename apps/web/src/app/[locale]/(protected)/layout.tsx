import { isPlatformAdminUserId } from '@/lib/auth/platform-admin'
import { auth } from '@/lib/auth'
import { Routes } from '@/lib/routes'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session == null) {
    redirect(`${Routes.Login}?callbackUrl=${encodeURIComponent(Routes.Settings)}`)
  }

  // 会话级管理员校验：web_auth 中的平台组织成员才可进入受保护路由
  if (!(await isPlatformAdminUserId(session.user.id))) {
    redirect('/forbidden')
  }

  return <>{children}</>
}
