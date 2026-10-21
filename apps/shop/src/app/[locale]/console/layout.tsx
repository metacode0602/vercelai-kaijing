import type { ReactNode } from 'react'
import { ConsoleCopilotProvider } from '@/components/console/console-copilot-provider'
import { SidebarProvider } from '@workspace/ui/components/sidebar'
import '@copilotkit/react-ui/styles.css'

export default function ConsoleRootLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <ConsoleCopilotProvider>{children}</ConsoleCopilotProvider>
    </SidebarProvider>
  )
}
