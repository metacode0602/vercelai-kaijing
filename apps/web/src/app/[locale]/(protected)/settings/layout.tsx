import { SettingsSidebar } from '@/components/layout/settings-sidebar'
import { SiteHeader } from '@/components/layout/site-header'
import { Routes } from '@/lib/routes'
import { requirePlatformAdmin } from '@/lib/server/require-platform-admin'
import { SidebarInset, SidebarProvider } from '@workspace/ui/components/sidebar'
import type { CSSProperties, ReactNode } from 'react'

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const user = await requirePlatformAdmin(Routes.Settings)

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
      <SettingsSidebar user={user} />
      <SidebarInset className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <SiteHeader user={user} />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-4 pb-6 md:px-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
