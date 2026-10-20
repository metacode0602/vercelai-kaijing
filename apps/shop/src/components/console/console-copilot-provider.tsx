'use client'

import type { PropsWithChildren } from 'react'
import { CopilotKit } from '@copilotkit/react-core'
import { ConsoleCopilot } from '@/components/console/console-copilot'

/**
 * Wraps console with CopilotKit when a runtime URL or public API key is configured.
 * Chat UX is always the local FAB → right panel (mock replies) so the shell works offline.
 * Real CopilotSidebar/Popup can replace ConsoleCopilot once a runtime is wired.
 */
export function ConsoleCopilotProvider({ children }: PropsWithChildren) {
  const runtimeUrl = process.env.NEXT_PUBLIC_COPILOTKIT_RUNTIME_URL
  const publicApiKey = process.env.NEXT_PUBLIC_COPILOTKIT_PUBLIC_API_KEY

  const shell = (
    <>
      {children}
      <ConsoleCopilot />
    </>
  )

  if (runtimeUrl || publicApiKey) {
    return (
      <CopilotKit runtimeUrl={runtimeUrl} publicApiKey={publicApiKey}>
        {shell}
      </CopilotKit>
    )
  }

  return shell
}
