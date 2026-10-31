import type { ReactNode } from 'react'
import { ConsoleBreadcrumbsProvider } from '@/components/console/console-breadcrumbs-context'
import { ConsoleCopilotProvider } from '@/components/console/console-copilot-provider'
import { SidebarProvider } from '@workspace/ui/components/sidebar'
import '@copilotkit/react-ui/styles.css'

export default function ConsoleRootLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <ConsoleBreadcrumbsProvider>
        <ConsoleCopilotProvider>{children}</ConsoleCopilotProvider>
      </ConsoleBreadcrumbsProvider>
    </SidebarProvider>
  )
}
