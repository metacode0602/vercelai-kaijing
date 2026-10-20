import type { ReactNode } from 'react'
import { SidebarInset, SidebarProvider } from '@workspace/ui/components/sidebar'
import { ConsoleSidebarSwitch } from '@/components/console-sidebar-switch'
import { ConsoleStoreProvider } from '@/components/console-store'
import { SiteHeader } from '@/components/site-header'
import { requireTenant } from '@/lib/server/auth-utils'
import { TRPCProvider } from '@/trpc/provider'

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  await requireTenant('/signup')

  return (
    <TRPCProvider>
      <ConsoleStoreProvider>
        <SidebarProvider
          className="h-svh overflow-hidden"
          style={
            {
              '--sidebar-width': 'calc(var(--spacing) * 56)',
              '--header-height': 'calc(var(--spacing) * 12)',
            } as React.CSSProperties
          }
        >
          <ConsoleSidebarSwitch variant="inset" />
          <SidebarInset className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <SiteHeader />
            <div data-ui-scroll-container className="flex min-h-0 flex-1 flex-col">
              {children}
            </div>
          </SidebarInset>
        </SidebarProvider>
      </ConsoleStoreProvider>
    </TRPCProvider>
  )
}
