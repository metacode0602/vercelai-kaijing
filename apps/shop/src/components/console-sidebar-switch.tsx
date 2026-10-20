'use client'

import type { ComponentProps } from 'react'
import { ConsoleSidebar } from '@/components/console-sidebar'
import { SandboxSidebar } from '@/components/sandbox-sidebar'
import { useLocalePathname } from '@/lib/i18n/navigation'
import type { Sidebar } from '@workspace/ui/components/sidebar'

export function ConsoleSidebarSwitch(props: ComponentProps<typeof Sidebar>) {
  const pathname = useLocalePathname() ?? ''

  if (pathname === '/console/sandbox' || pathname.startsWith('/console/sandbox/')) {
    return <SandboxSidebar {...props} />
  }

  return <ConsoleSidebar {...props} />
}
