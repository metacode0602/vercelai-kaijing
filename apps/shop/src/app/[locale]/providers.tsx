'use client'

import { TooltipProvider } from '@workspace/ui/components/tooltip'
import { websiteConfig } from '@/lib/config/website'
import { ThemeProvider } from 'next-themes'
import { useState, type PropsWithChildren } from 'react'
import { QueryClient, QueryClientProvider, isServer } from '@tanstack/react-query'
import { createTRPCClient } from '@trpc/client'
import { Toaster, toast } from 'sonner'
import type { AppRouter } from '@/lib/server/routers'
import { trpc } from '@/lib/trpc/client'
import { trpcLinks } from '@/lib/trpc/links'
import { getClientErrorMessage } from '@/lib/trpc/error-message'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        refetchOnWindowFocus: false,
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined

function getQueryClient() {
  if (isServer) return makeQueryClient()
  if (!browserQueryClient) browserQueryClient = makeQueryClient()
  return browserQueryClient
}

export function Providers({ children }: PropsWithChildren) {
  const defaultMode = websiteConfig.metadata.mode.defaultMode
  const queryClient = getQueryClient()
  const toastTrpcError = (error: unknown) => {
    const message = getClientErrorMessage(error)
    if (message) toast.error(message)
  }
  queryClient.getQueryCache().config.onError = toastTrpcError
  queryClient.getMutationCache().config.onError = toastTrpcError

  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: trpcLinks,
    }),
  )

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme={defaultMode} enableSystem disableTransitionOnChange>
          <TooltipProvider>
            {children}
            <Toaster richColors position="top-right" />
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </trpc.Provider>
  )
}
