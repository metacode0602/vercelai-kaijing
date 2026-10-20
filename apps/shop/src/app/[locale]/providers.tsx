'use client'

import { TooltipProvider } from '@workspace/ui/components/tooltip'
import { websiteConfig } from '@/lib/config/website'
import { ThemeProvider } from 'next-themes'
import type { PropsWithChildren } from 'react'

export function Providers({ children }: PropsWithChildren) {
  const defaultMode = websiteConfig.metadata.mode.defaultMode

  return (
    <ThemeProvider attribute="class" defaultTheme={defaultMode} enableSystem disableTransitionOnChange>
      <TooltipProvider>{children}</TooltipProvider>
    </ThemeProvider>
  )
}
