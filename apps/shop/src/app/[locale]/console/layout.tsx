import type { ReactNode } from 'react'
import { ConsoleBreadcrumbsProvider } from '@/components/console/console-breadcrumbs-context'
import { ConsoleCopilotProvider } from '@/components/console/console-copilot-provider'
import { requireOnboardedAuth } from '@/lib/server/auth-utils'
import { SidebarProvider } from '@workspace/ui/components/sidebar'
import '@copilotkit/react-ui/styles.css'

export default async function ConsoleRootLayout({ children }: { children: ReactNode }) {
  await requireOnboardedAuth('/signin?callbackUrl=%2Fconsole')

  return (
    <SidebarProvider>
      <ConsoleBreadcrumbsProvider>
        <ConsoleCopilotProvider>{children}</ConsoleCopilotProvider>
      </ConsoleBreadcrumbsProvider>
    </SidebarProvider>
  )
}
