import type { ReactNode } from 'react'
import { ConsoleSidebar } from '@/components/console-sidebar'
import { ConsoleTopbar } from '@/components/console/console-topbar'
import { SidebarInset } from '@workspace/ui/components/sidebar'

export default function ConsoleOpsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ConsoleSidebar />
      <SidebarInset className="flex min-h-svh flex-1 flex-col">
        <ConsoleTopbar />
        <div className="flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </>
  )
}
