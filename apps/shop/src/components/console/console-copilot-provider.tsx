'use client'

import * as React from 'react'
import type { PropsWithChildren } from 'react'
import { CopilotKit } from '@copilotkit/react-core'
import { ConsoleCopilot } from '@/components/console/console-copilot'
import { CostCalculatorHost } from '@/components/console/cost-calculator-host'

type ConsoleCopilotContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

const ConsoleCopilotContext = React.createContext<ConsoleCopilotContextValue | null>(null)

export function useConsoleCopilot() {
  const ctx = React.useContext(ConsoleCopilotContext)
  if (!ctx) {
    throw new Error('useConsoleCopilot must be used within ConsoleCopilotProvider')
  }
  return ctx
}

/**
 * Console-level AI assistant state + optional CopilotKit runtime wrap.
 * Panel is a layout column sibling (not a FAB overlay); toggle lives in the topbar.
 * Also mounts the shared cost-calculator Sheet host for Copilot / page CTAs.
 */
export function ConsoleCopilotProvider({ children }: PropsWithChildren) {
  const [open, setOpen] = React.useState(false)
  const runtimeUrl = process.env.NEXT_PUBLIC_COPILOTKIT_RUNTIME_URL
  const publicApiKey = process.env.NEXT_PUBLIC_COPILOTKIT_PUBLIC_API_KEY

  const value = React.useMemo<ConsoleCopilotContextValue>(
    () => ({
      open,
      setOpen,
      toggle: () => setOpen((prev) => !prev),
    }),
    [open],
  )

  const shell = (
    <ConsoleCopilotContext.Provider value={value}>
      {children}
      <ConsoleCopilot />
      <CostCalculatorHost />
    </ConsoleCopilotContext.Provider>
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
