import { AppSidebar } from '@/components/layout/app-sidebar'
import { SiteHeader } from '@/components/layout/site-header'
import { auth } from '@/lib/auth'
import { isPlatformAdminUserId } from '@/lib/auth/platform-admin'
import { Routes } from '@/lib/routes'
import { SidebarInset, SidebarProvider } from '@workspace/ui/components/sidebar'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { CSSProperties } from 'react'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session == null) {
    redirect(`${Routes.Login}?callbackUrl=${encodeURIComponent(Routes.Settings)}`)
  }

  // 会话级管理员校验：web_auth 中的平台组织成员才可进入受保护路由
  if (!(await isPlatformAdminUserId(session.user.id))) {
    redirect('/forbidden')
  }

  const user = {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    image: session.user.image ?? null,
  }

  return (
    <SidebarProvider
      className="h-svh overflow-hidden"
      style={
        {
          '--sidebar-width': 'calc(var(--spacing) * 56)',
          '--header-height': 'calc(var(--spacing) * 12)',
        } as CSSProperties
      }
    >
      <AppSidebar user={user} />
      <SidebarInset className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <SiteHeader user={user} />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-4 pb-6 md:px-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
